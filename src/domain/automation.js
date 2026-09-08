// Browser-agent automation: a staged action queue that Claude in Chrome works
// through, plus the guardrails that keep it from getting the account restricted.
//
// The division of labour is deliberate and it is the whole safety model:
//
//   Claude PREPARES  — collects comments, researches, drafts posts, opens the
//                      right conversation and types the message.
//   The OPERATOR SENDS — every message and every post is published by a human
//                      pressing the button.
//
// Nothing here sends anything on its own. That costs a couple of seconds per
// lead and removes the failure mode that actually matters: automated outreach
// to strangers is what gets accounts flagged, and this account is the family
// business's main lead source.
//
// The agent never picks targets either. This module decides who is due and what
// to say, using the same scoring and scripts the dashboard uses, so the
// messaging stays consistent and every touch is recorded. Daily/hourly caps and
// quiet hours are enforced here rather than left to the agent's judgement.

import * as store from '../lib/store.js';
import { uid, nowIso, num, sortBy, prettyPhone } from '../lib/util.js';
import { getSettings } from './settings.js';
import { outreachScript } from './content.js';
import * as Leads from './leads.js';

export const ACTION_TYPES = {
  dm: { label: 'Prepare a message (you press send)', limitKey: 'dmsPerDay', hourlyKey: 'dmsPerHour' },
  comment_reply: { label: 'Prepare a comment reply (you press send)', limitKey: 'commentRepliesPerDay' },
  post: { label: 'Prepare a post (you press Post)', limitKey: 'postsPerDay' },
  harvest: { label: 'Collect comments from a post', limitKey: null },
  research: { label: 'Work a prospecting search', limitKey: null },
};

/** Appended to every action that puts text in front of a real person. */
const HANDOFF =
  ' Type the text into the box but DO NOT press send — stop there and tell the operator it is ready. ' +
  'They press send themselves. Never send, post or submit anything on your own.';

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

function actionsSince(type, sinceIso) {
  return store.all('agentActions').filter(
    (a) => a.type === type && a.status === 'done' && a.completedAt && a.completedAt >= sinceIso,
  ).length;
}

/** Is it currently inside the operator's configured quiet hours? */
export function inQuietHours(date = new Date()) {
  const { quietHoursStart, quietHoursEnd } = getSettings().outreach;
  const h = date.getHours();
  if (quietHoursStart === quietHoursEnd) return false;
  // Window wraps midnight (e.g. 21:00 -> 08:00).
  if (quietHoursStart > quietHoursEnd) return h >= quietHoursStart || h < quietHoursEnd;
  return h >= quietHoursStart && h < quietHoursEnd;
}

/**
 * How many actions of this type may still be handed out right now, and why not
 * more. Returned to the agent so it can explain itself instead of silently
 * stopping.
 */
export function budgetFor(type) {
  const limits = getSettings().automation.limits;
  const spec = ACTION_TYPES[type];
  if (!spec) return { allowed: 0, reason: `Unknown action type "${type}"` };
  if (!spec.limitKey) return { allowed: Number.MAX_SAFE_INTEGER, reason: null };

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

  const dailyCap = num(limits[spec.limitKey], 0);
  const usedToday = actionsSince(type, dayAgo);
  let allowed = Math.max(0, dailyCap - usedToday);
  let reason = allowed === 0 ? `Daily limit reached (${dailyCap} in 24h)` : null;

  if (spec.hourlyKey) {
    const hourlyCap = num(limits[spec.hourlyKey], 0);
    const usedHour = actionsSince(type, hourAgo);
    const hourlyLeft = Math.max(0, hourlyCap - usedHour);
    if (hourlyLeft < allowed) {
      allowed = hourlyLeft;
      if (allowed === 0) reason = `Hourly limit reached (${hourlyCap}/hour) — resume in a few minutes`;
    }
  }

  if (type === 'dm' && inQuietHours()) {
    allowed = 0;
    const { quietHoursStart, quietHoursEnd } = getSettings().outreach;
    reason = `Quiet hours (${quietHoursStart}:00-${quietHoursEnd}:00) — nobody wants a sales message right now`;
  }

  return { allowed, reason, usedToday, dailyCap };
}

/** Seconds the agent should wait before its next action, so it paces like a person. */
export function cooldownRemaining() {
  const min = num(getSettings().automation.limits.minSecondsBetweenActions, 45);
  const last = sortBy(
    store.all('agentActions').filter((a) => a.completedAt),
    (a) => a.completedAt,
    'desc',
  )[0];
  if (!last) return 0;
  const elapsed = (Date.now() - new Date(last.completedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(min - elapsed));
}

// ---------------------------------------------------------------------------
// Building the queue
// ---------------------------------------------------------------------------

function existingOpenAction(leadId, type) {
  return store.all('agentActions').find(
    (a) => a.leadId === leadId && a.type === type && a.status === 'pending',
  );
}

function createAction(input) {
  const action = {
    id: uid('aact'),
    type: input.type,
    status: 'pending', // pending | done | skipped
    leadId: input.leadId || null,
    leadName: input.leadName || '',
    priority: num(input.priority, 0),
    title: input.title || ACTION_TYPES[input.type]?.label || input.type,
    instruction: input.instruction || '',
    message: input.message || '',
    url: input.url || '',
    context: input.context || {},
    createdAt: nowIso(),
    completedAt: null,
    result: null,
  };
  store.insert('agentActions', action);
  return action;
}

/**
 * Refresh the queue from the current pipeline: every lead with an overdue
 * follow-up gets one action carrying the exact message to send, written in
 * their language with their name and city already filled in.
 */
export function rebuildQueue() {
  const now = nowIso();
  const leads = store.all('leads');
  const tasks = store.all('tasks').filter((t) => !t.done && t.dueAt <= now);
  const created = [];

  for (const task of tasks) {
    const lead = leads.find((l) => l.id === task.leadId);
    if (!lead) continue;
    if (lead.doNotContact) continue;
    if (!Leads.ACTIVE_STAGES.includes(lead.stage)) continue;
    if (existingOpenAction(lead.id, 'dm')) continue;

    // Pick the script that matches where this lead actually is.
    let scriptKey = 'first_touch';
    if (lead.contactAttempts >= 3 && lead.repliesReceived === 0) scriptKey = 'no_answer_2';
    else if (lead.contactAttempts >= 1 && lead.repliesReceived === 0) scriptKey = 'no_answer_1';
    else if (lead.financing === 'itin' && lead.contactAttempts === 0) scriptKey = 'itin_offer';
    else if (lead.stage === 'qualified' && !lead.preApproved) scriptKey = 'lender_handoff';
    else if (lead.repliesReceived > 0) scriptKey = 'nurture_value';

    created.push(createAction({
      type: 'dm',
      leadId: lead.id,
      leadName: lead.name,
      priority: lead.score,
      title: `Message ready for ${lead.name || 'lead'} (score ${lead.score})`,
      instruction:
        `Open the existing conversation with ${lead.name} and type the message below exactly as written.` +
        (lead.phone ? ` (Their number is ${prettyPhone(lead.phone)} if the operator prefers to text.)` : '') +
        HANDOFF,
      message: outreachScript(scriptKey, lead),
      context: {
        script: scriptKey,
        language: lead.language,
        city: lead.city,
        phone: lead.phone ? prettyPhone(lead.phone) : '',
        stage: lead.stage,
        taskId: task.id,
        financing: lead.financing,
      },
    }));
  }

  return created;
}

/** Queue a comment-collection pass over a post the operator names. */
export function queueHarvest(postUrl, label = '') {
  return createAction({
    type: 'harvest',
    priority: 95,
    title: `Collect comments from ${label || 'a post'}`,
    instruction:
      'Open the post and expand every comment thread ("View more comments" / "Ver más comentarios" until no more appear). ' +
      'Read every comment. For each person showing buying interest, POST them to /api/agent/comments with their display name, ' +
      'the comment text, and a phone number if they wrote one. Do not message anyone during this step — this is reading only.',
    url: postUrl,
    context: { label },
  });
}

/** Queue the day's post for publishing after the operator reviews it. */
export function queuePost({ body, language = 'es', type = 'itin', trackUrl = '' }) {
  return createAction({
    type: 'post',
    priority: 85,
    title: `Publish today's ${type} post`,
    instruction:
      'Open the composer and paste the text below exactly, then attach any photos the operator points you at.' + HANDOFF,
    message: body,
    url: 'https://www.facebook.com/',
    context: { language, type, trackUrl },
  });
}

// ---------------------------------------------------------------------------
// Serving the queue
// ---------------------------------------------------------------------------

/**
 * The next batch of work, already filtered by every guardrail. The agent asks
 * for this, does what it says, and reports back — it never picks targets itself.
 */
export function nextActions({ limit = 5, type = null } = {}) {
  const pending = sortBy(
    store.all('agentActions').filter((a) => a.status === 'pending' && (!type || a.type === type)),
    (a) => a.priority,
    'desc',
  );

  const out = [];
  const budgets = {};
  const blocked = [];

  for (const action of pending) {
    if (out.length >= limit) break;
    if (!(action.type in budgets)) budgets[action.type] = budgetFor(action.type);
    const b = budgets[action.type];
    if (b.allowed <= 0) {
      if (b.reason && !blocked.some((x) => x.type === action.type)) {
        blocked.push({ type: action.type, reason: b.reason });
      }
      continue;
    }
    budgets[action.type] = { ...b, allowed: b.allowed - 1 };
    out.push(action);
  }

  return {
    actions: out,
    blocked,
    cooldownSeconds: cooldownRemaining(),
    pendingTotal: pending.length,
    quietHours: inQuietHours(),
  };
}

/**
 * Close out an action.
 *   outcome 'prepared' — agent staged the text; waiting on the operator to send
 *   outcome 'sent'     — operator confirmed they pressed send
 *   outcome 'skipped'  — not appropriate, do not count it as a touch
 * Only 'sent' counts against the rate budget and advances the lead.
 */
export function completeAction(id, { result = '', outcome = 'sent' } = {}) {
  const action = store.find('agentActions', id);
  if (!action) return null;

  const status = outcome === 'skipped' ? 'skipped' : outcome === 'prepared' ? 'prepared' : 'done';
  const updated = store.patch('agentActions', id, {
    status,
    completedAt: outcome === 'prepared' ? null : nowIso(),
    preparedAt: outcome === 'prepared' ? nowIso() : action.preparedAt || null,
    result,
  });

  // Reflect the touch back into the CRM so scoring and follow-ups stay accurate.
  // Only counted once the operator confirms they actually pressed send —
  // "prepared" alone is not a contact and must not advance the lead.
  if (action.leadId && outcome === 'sent') {
    if (action.type === 'dm') {
      Leads.recordContact(action.leadId, {
        channel: 'dm',
        outcome: 'sent',
        note: result ? `prepared by browser agent, sent by operator — ${result}` : 'prepared by browser agent, sent by operator',
      });
    }
    if (action.context?.taskId) Leads.completeTask(action.context.taskId);
  }

  const settings = store.read('settings');
  store.write('settings', {
    ...settings,
    automation: { ...(settings.automation || {}), lastActivityAt: nowIso() },
  });

  return updated;
}

export function listActions({ status = null, limit = 100 } = {}) {
  let rows = store.all('agentActions');
  if (status) rows = rows.filter((a) => a.status === status);
  return sortBy(rows, (a) => a.createdAt, 'desc').slice(0, limit);
}

export function clearCompleted() {
  return store.removeWhere('agentActions', (a) => a.status !== 'pending');
}

/** A compact status line for the dashboard and for the agent's own reporting. */
export function automationStatus() {
  const s = getSettings();
  const pending = store.all('agentActions').filter((a) => a.status === 'pending');
  const prepared = store.all('agentActions').filter((a) => a.status === 'prepared');
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const doneToday = store.all('agentActions').filter((a) => a.status === 'done' && a.completedAt >= dayAgo);

  return {
    enabled: s.automation.enabled,
    hasToken: Boolean(s.automation.token),
    lastActivityAt: s.automation.lastActivityAt,
    quietHours: inQuietHours(),
    cooldownSeconds: cooldownRemaining(),
    // Staged by Claude and sitting in front of the operator, waiting on a send.
    awaitingSend: prepared.length,
    pending: {
      total: pending.length,
      byType: Object.fromEntries(
        Object.keys(ACTION_TYPES).map((t) => [t, pending.filter((a) => a.type === t).length]),
      ),
    },
    today: {
      total: doneToday.length,
      byType: Object.fromEntries(
        Object.keys(ACTION_TYPES).map((t) => [t, doneToday.filter((a) => a.type === t).length]),
      ),
    },
    budgets: Object.fromEntries(Object.keys(ACTION_TYPES).map((t) => [t, budgetFor(t)])),
    limits: s.automation.limits,
  };
}
