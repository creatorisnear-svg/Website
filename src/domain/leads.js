// Lead model: creation, de-duplication, scoring, pipeline movement.

import * as store from '../lib/store.js';
import {
  uid, nowIso, num, clamp, normalizePhone, normalizeEmail, addDays, sortBy,
} from '../lib/util.js';
import { inMarket, cityForZip, findCity } from './market.js';

export const STAGES = [
  { id: 'new',            label: 'New',            labelEs: 'Nuevo',            probability: 0.02, order: 1 },
  { id: 'contacted',      label: 'Contacted',      labelEs: 'Contactado',       probability: 0.06, order: 2 },
  { id: 'qualified',      label: 'Qualified',      labelEs: 'Calificado',       probability: 0.18, order: 3 },
  { id: 'showing',        label: 'Touring Homes',  labelEs: 'Viendo casas',     probability: 0.35, order: 4 },
  { id: 'offer',          label: 'Offer Written',  labelEs: 'Oferta enviada',   probability: 0.55, order: 5 },
  { id: 'under_contract', label: 'Under Contract', labelEs: 'En contrato',      probability: 0.88, order: 6 },
  { id: 'closed',         label: 'Closed',         labelEs: 'Cerrado',          probability: 1.0,  order: 7 },
  { id: 'lost',           label: 'Lost',           labelEs: 'Perdido',          probability: 0,    order: 8 },
];

export const STAGE_IDS = STAGES.map((s) => s.id);
export const ACTIVE_STAGES = STAGE_IDS.filter((s) => s !== 'closed' && s !== 'lost');

export function stageInfo(id) {
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

export const SOURCES = [
  { id: 'facebook_organic',  label: 'Facebook post / comment' },
  { id: 'facebook_lead_ad',  label: 'Facebook Lead Ad' },
  { id: 'facebook_group',    label: 'Facebook group' },
  { id: 'facebook_dm',       label: 'Facebook DM' },
  { id: 'marketplace',       label: 'Facebook Marketplace' },
  { id: 'landing_page',      label: 'Landing page' },
  { id: 'website',           label: 'Website form' },
  { id: 'referral',          label: 'Referral' },
  { id: 'prospecting',       label: 'Prospecting worklist' },
  { id: 'csv_import',        label: 'CSV import' },
  { id: 'walk_in',           label: 'Walk-in / event' },
  { id: 'manual',            label: 'Manually added' },
  { id: 'other',             label: 'Other' },
];

export const TIMELINES = ['now', '1-3m', '3-6m', '6-12m', '12m+', 'unknown'];
export const FINANCING = ['itin', 'fha', 'conventional', 'va', 'usda', 'cash', 'unsure'];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const TIMELINE_POINTS = { now: 30, '1-3m': 25, '3-6m': 15, '6-12m': 8, '12m+': 3, unknown: 5 };

/**
 * Score a lead 0-100 on how close it is to a closing. Returns the score plus a
 * breakdown so the dashboard can explain *why* a lead is hot.
 */
export function scoreLead(lead) {
  const parts = [];
  let score = 0;

  const t = TIMELINE_POINTS[lead.timeline] ?? 5;
  score += t;
  parts.push({ factor: 'Timeline', points: t, detail: lead.timeline || 'unknown' });

  if (lead.preApproved) {
    score += 20;
    parts.push({ factor: 'Pre-approved', points: 20, detail: 'lender letter in hand' });
  } else if (lead.talkedToLender) {
    score += 8;
    parts.push({ factor: 'Lender contact', points: 8, detail: 'spoke with a lender' });
  } else {
    parts.push({ factor: 'Pre-approved', points: 0, detail: 'not yet' });
  }

  const dp = num(lead.downPaymentPct, 0);
  let dpPts = 0;
  if (dp >= 20) dpPts = 15;
  else if (dp >= 10) dpPts = 12;
  else if (dp >= 5) dpPts = 9;
  else if (dp >= 3) dpPts = 5;
  else if (lead.downPaymentAmount > 0) dpPts = 4;
  score += dpPts;
  parts.push({ factor: 'Down payment', points: dpPts, detail: dp ? `${dp}%` : 'unknown' });

  const budget = num(lead.budgetMax, 0);
  const budgetPts = budget >= 150000 ? 10 : budget > 0 ? 5 : 0;
  score += budgetPts;
  parts.push({ factor: 'Budget stated', points: budgetPts, detail: budget ? `$${budget.toLocaleString()}` : 'unknown' });

  let contactPts = 0;
  if (lead.phone) contactPts += 10;
  if (lead.email) contactPts += 5;
  score += contactPts;
  parts.push({ factor: 'Reachable', points: contactPts, detail: [lead.phone && 'phone', lead.email && 'email'].filter(Boolean).join(' + ') || 'none' });

  const geoPts = inMarket({ city: lead.city, zip: lead.zip }) ? 10 : 0;
  score += geoPts;
  parts.push({ factor: 'In market', points: geoPts, detail: lead.city || lead.zip || 'unknown area' });

  const finPts = lead.financing && lead.financing !== 'unsure' ? 5 : 0;
  score += finPts;
  parts.push({ factor: 'Financing path', points: finPts, detail: lead.financing || 'unsure' });

  const replied = num(lead.repliesReceived, 0);
  const engagePts = clamp(replied * 3, 0, 9);
  score += engagePts;
  parts.push({ factor: 'Engagement', points: engagePts, detail: `${replied} repl${replied === 1 ? 'y' : 'ies'}` });

  // Penalties
  if (lead.doNotContact) {
    score -= 60;
    parts.push({ factor: 'Do not contact', points: -60, detail: 'opted out' });
  }
  const attempts = num(lead.contactAttempts, 0);
  if (attempts >= 6 && replied === 0) {
    score -= 15;
    parts.push({ factor: 'Unresponsive', points: -15, detail: `${attempts} attempts, no reply` });
  }

  return { score: Math.round(clamp(score, 0, 100)), breakdown: parts };
}

export function temperature(score) {
  if (score >= 70) return 'hot';
  if (score >= 45) return 'warm';
  if (score >= 25) return 'cool';
  return 'cold';
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

function blankLead() {
  return {
    id: uid('lead'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    name: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    language: 'es',
    city: '',
    zip: '',
    stage: 'new',
    source: 'manual',
    sourceDetail: '',
    campaignId: null,
    utm: { source: '', medium: '', campaign: '', content: '', term: '' },
    budgetMin: 0,
    budgetMax: 0,
    downPaymentPct: 0,
    downPaymentAmount: 0,
    timeline: 'unknown',
    financing: 'unsure',
    preApproved: false,
    talkedToLender: false,
    beds: 0,
    baths: 0,
    householdSize: 0,
    currentSituation: '', // renting / living with family / owns
    message: '',
    tags: [],
    score: 0,
    scoreBreakdown: [],
    temperature: 'cold',
    contactAttempts: 0,
    repliesReceived: 0,
    lastContactedAt: null,
    nextFollowUpAt: null,
    doNotContact: false,
    consent: { smsOptIn: false, emailOptIn: false, capturedAt: null, ip: '' },
    lostReason: '',
    dealId: null,
    referredToAgentAt: null,
    agentAcceptedAt: null,
  };
}

/** Split a full name into first/last without being clever about it. */
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function normalizeLead(input) {
  const base = blankLead();
  const lead = { ...base, ...input };

  lead.phone = normalizePhone(lead.phone);
  lead.email = normalizeEmail(lead.email);
  lead.name = String(lead.name || '').trim();
  if (!lead.name && (input.firstName || input.lastName)) {
    lead.name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  }
  const split = splitName(lead.name);
  lead.firstName = input.firstName || split.firstName;
  lead.lastName = input.lastName || split.lastName;

  lead.language = lead.language === 'en' ? 'en' : 'es';
  lead.budgetMin = num(lead.budgetMin, 0);
  lead.budgetMax = num(lead.budgetMax, 0);
  lead.downPaymentPct = num(lead.downPaymentPct, 0);
  lead.downPaymentAmount = num(lead.downPaymentAmount, 0);
  lead.beds = num(lead.beds, 0);
  lead.baths = num(lead.baths, 0);
  lead.preApproved = Boolean(lead.preApproved);
  lead.doNotContact = Boolean(lead.doNotContact);
  if (!STAGE_IDS.includes(lead.stage)) lead.stage = 'new';
  if (!TIMELINES.includes(lead.timeline)) lead.timeline = 'unknown';
  if (!FINANCING.includes(lead.financing)) lead.financing = 'unsure';
  if (!Array.isArray(lead.tags)) lead.tags = [];

  // Fill city from ZIP when only one was given.
  if (!lead.city && lead.zip) {
    const c = cityForZip(lead.zip);
    if (c) lead.city = c.name;
  }
  if (lead.city) {
    const c = findCity(lead.city);
    if (c) lead.city = c.name;
  }

  // Derive down payment percentage from a dollar amount when possible.
  if (!lead.downPaymentPct && lead.downPaymentAmount && lead.budgetMax) {
    lead.downPaymentPct = Math.round((lead.downPaymentAmount / lead.budgetMax) * 1000) / 10;
  }

  const { score, breakdown } = scoreLead(lead);
  lead.score = score;
  lead.scoreBreakdown = breakdown;
  lead.temperature = temperature(score);
  lead.updatedAt = nowIso();
  return lead;
}

/** Find an existing lead that looks like the same person. */
export function findDuplicate(candidate) {
  const rows = store.all('leads');
  const phone = normalizePhone(candidate.phone);
  const email = normalizeEmail(candidate.email);
  if (phone) {
    const hit = rows.find((r) => r.phone && r.phone === phone);
    if (hit) return hit;
  }
  if (email) {
    const hit = rows.find((r) => r.email && r.email === email);
    if (hit) return hit;
  }
  const name = String(candidate.name || '').trim().toLowerCase();
  if (name && (candidate.city || candidate.zip)) {
    const hit = rows.find(
      (r) =>
        r.name.trim().toLowerCase() === name &&
        (r.city === candidate.city || (r.zip && r.zip === candidate.zip)),
    );
    if (hit) return hit;
  }
  return null;
}

/**
 * Create a lead, merging into an existing record if it is the same person.
 * Returns { lead, duplicate: boolean }.
 */
export function createLead(input, { allowDuplicate = false } = {}) {
  const dup = allowDuplicate ? null : findDuplicate(input);
  if (dup) {
    // Merge: keep what we already know, fill blanks, bump engagement.
    const merged = { ...dup };
    for (const [k, v] of Object.entries(input)) {
      if (v === '' || v == null) continue;
      if (k === 'id' || k === 'createdAt') continue;
      const existing = merged[k];
      const existingEmpty = existing === '' || existing == null || existing === 0 || existing === false;
      if (existingEmpty) merged[k] = v;
    }
    merged.repliesReceived = num(merged.repliesReceived, 0) + 1;
    if (input.message) {
      merged.message = [merged.message, input.message].filter(Boolean).join('\n---\n');
    }
    const normalized = normalizeLead(merged);
    store.patch('leads', dup.id, normalized);
    logActivity(dup.id, 'duplicate_merged', `Repeat inquiry from ${input.source || 'unknown source'}`);
    return { lead: normalized, duplicate: true };
  }

  const lead = normalizeLead(input);
  store.insert('leads', lead);
  logActivity(lead.id, 'created', `Lead captured from ${lead.source}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ''}`);
  // First follow-up: same day for hot leads, next morning otherwise.
  const due = lead.score >= 60 ? new Date() : addDays(new Date(), 1);
  createTask(lead.id, lead.score >= 60 ? 'Call now — hot lead' : 'First contact call', due.toISOString(), 'call');
  return { lead, duplicate: false };
}

export function updateLead(id, changes) {
  const existing = store.find('leads', id);
  if (!existing) return null;
  const before = existing.stage;
  const normalized = normalizeLead({ ...existing, ...changes, id, createdAt: existing.createdAt });
  store.patch('leads', id, normalized);
  if (changes.stage && changes.stage !== before) {
    logActivity(id, 'stage_change', `${stageInfo(before).label} → ${stageInfo(changes.stage).label}`);
  }
  return normalized;
}

export function deleteLead(id) {
  store.removeWhere('activities', (a) => a.leadId === id);
  store.removeWhere('tasks', (t) => t.leadId === id);
  return store.remove('leads', id);
}

export function getLead(id) {
  return store.find('leads', id);
}

// ---------------------------------------------------------------------------
// Activities + tasks
// ---------------------------------------------------------------------------

export function logActivity(leadId, type, body, extra = {}) {
  const activity = {
    id: uid('act'),
    leadId,
    type,
    body,
    at: nowIso(),
    ...extra,
  };
  store.insert('activities', activity);
  return activity;
}

export function activitiesFor(leadId) {
  return sortBy(store.all('activities').filter((a) => a.leadId === leadId), (a) => a.at, 'desc');
}

export function createTask(leadId, title, dueAt, kind = 'followup') {
  const task = {
    id: uid('task'),
    leadId,
    title,
    kind,
    dueAt: dueAt || nowIso(),
    done: false,
    doneAt: null,
    createdAt: nowIso(),
  };
  store.insert('tasks', task);
  if (leadId) {
    const lead = store.find('leads', leadId);
    if (lead && (!lead.nextFollowUpAt || task.dueAt < lead.nextFollowUpAt)) {
      store.patch('leads', leadId, { nextFollowUpAt: task.dueAt });
    }
  }
  return task;
}

export function completeTask(id) {
  const task = store.find('tasks', id);
  if (!task) return null;
  const updated = store.patch('tasks', id, { done: true, doneAt: nowIso() });
  if (task.leadId) {
    const remaining = store
      .all('tasks')
      .filter((t) => t.leadId === task.leadId && !t.done)
      .map((t) => t.dueAt)
      .sort();
    store.patch('leads', task.leadId, { nextFollowUpAt: remaining[0] || null });
  }
  return updated;
}

export function openTasks({ includeFuture = true } = {}) {
  const now = nowIso();
  return sortBy(
    store.all('tasks').filter((t) => !t.done && (includeFuture || t.dueAt <= now)),
    (t) => t.dueAt,
  );
}

/** Record an outreach attempt and schedule the next touch. */
export function recordContact(leadId, { channel = 'call', outcome = 'no_answer', note = '' } = {}) {
  const lead = store.find('leads', leadId);
  if (!lead) return null;
  const changes = {
    contactAttempts: num(lead.contactAttempts, 0) + 1,
    lastContactedAt: nowIso(),
  };
  if (outcome === 'replied' || outcome === 'connected') {
    changes.repliesReceived = num(lead.repliesReceived, 0) + 1;
    if (lead.stage === 'new') changes.stage = 'contacted';
  } else if (lead.stage === 'new') {
    changes.stage = 'contacted';
  }
  const updated = updateLead(leadId, changes);
  logActivity(leadId, 'contact', `${channel}: ${outcome}${note ? ` — ${note}` : ''}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function listLeads(filter = {}) {
  let rows = store.all('leads');
  if (filter.stage) rows = rows.filter((r) => r.stage === filter.stage);
  if (filter.stages) rows = rows.filter((r) => filter.stages.includes(r.stage));
  if (filter.source) rows = rows.filter((r) => r.source === filter.source);
  if (filter.city) rows = rows.filter((r) => r.city === filter.city);
  if (filter.language) rows = rows.filter((r) => r.language === filter.language);
  if (filter.temperature) rows = rows.filter((r) => r.temperature === filter.temperature);
  if (filter.campaignId) rows = rows.filter((r) => r.campaignId === filter.campaignId);
  if (filter.minScore != null) rows = rows.filter((r) => r.score >= filter.minScore);
  if (filter.active) rows = rows.filter((r) => ACTIVE_STAGES.includes(r.stage));
  if (filter.q) {
    const q = String(filter.q).toLowerCase();
    rows = rows.filter((r) =>
      [r.name, r.phone, r.email, r.city, r.zip, r.message, (r.tags || []).join(' ')]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }
  const sortField = filter.sort || 'score';
  const dir = filter.dir || (sortField === 'score' ? 'desc' : 'desc');
  rows = sortBy(rows, (r) => r[sortField] ?? 0, dir);
  if (filter.limit) rows = rows.slice(0, Number(filter.limit));
  return rows;
}

/** Today's call list: overdue or due-now tasks, hottest first. */
export function workQueue(limit = 25) {
  const now = nowIso();
  const dueTaskLeadIds = new Set(
    store.all('tasks').filter((t) => !t.done && t.dueAt <= now).map((t) => t.leadId),
  );
  const leads = store
    .all('leads')
    .filter((l) => !l.doNotContact && ACTIVE_STAGES.includes(l.stage))
    .filter((l) => dueTaskLeadIds.has(l.id) || !l.lastContactedAt);
  return sortBy(leads, (l) => l.score, 'desc').slice(0, limit);
}
