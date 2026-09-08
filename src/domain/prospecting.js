// Prospecting: turning "where do buyers hang out" into a daily worklist.
//
// Deliberate design choice: this module does NOT scrape Facebook. Facebook's
// terms prohibit automated collection, and scrapers get accounts banned — which
// would cost the agent his main lead source. Instead it does three things that
// are durable and allowed:
//
//   1. Builds targeted, buyer-intent search URLs for Facebook, Marketplace,
//      Craigslist, Nextdoor, Reddit and Google, and tracks which ones have been
//      worked (the "worklist").
//   2. Scans genuinely public, machine-readable feeds (Craigslist RSS, Reddit
//      JSON) for buyer-intent posts in the Phoenix / Maricopa area.
//   3. Parses comment/DM text the agent pastes in from his own posts into
//      structured leads, so the manual channel is fast instead of forbidden.
//
// The official, sanctioned Facebook path is the Lead Ads API — see
// src/integrations/facebook.js.

import * as store from '../lib/store.js';
import { uid, nowIso, sortBy, normalizePhone, normalizeEmail, unique } from '../lib/util.js';
import { INTENT_PHRASES, CITIES } from './market.js';

export const PLATFORMS = [
  {
    id: 'facebook_search',
    label: 'Facebook posts search',
    build: (q) => `https://www.facebook.com/search/posts/?q=${encodeURIComponent(q)}`,
    note: 'Search public posts. Comment helpfully first, then DM — never lead with a pitch.',
  },
  {
    id: 'facebook_groups',
    label: 'Facebook groups search',
    build: (q) => `https://www.facebook.com/search/groups/?q=${encodeURIComponent(q)}`,
    note: 'Join local buyer/renter groups. Read the rules — many ban direct promotion.',
  },
  {
    id: 'marketplace',
    label: 'Facebook Marketplace (rentals)',
    build: () => 'https://www.facebook.com/marketplace/phoenix/propertyrentals',
    note: 'Renters browsing listings are tomorrow\'s buyers. Post value, not spam.',
  },
  {
    id: 'craigslist',
    label: 'Craigslist Phoenix housing wanted',
    build: (q) => `https://phoenix.craigslist.org/search/hsw?query=${encodeURIComponent(q)}`,
    note: 'People posting "housing wanted" are actively searching right now.',
    rss: (q) => `https://phoenix.craigslist.org/search/hsw?query=${encodeURIComponent(q)}&format=rss`,
  },
  {
    id: 'reddit',
    label: 'Reddit r/phoenix + r/arizona',
    build: (q) => `https://www.reddit.com/search/?q=${encodeURIComponent(`${q} (subreddit:phoenix OR subreddit:arizona)`)}`,
    note: 'Answer questions genuinely; Reddit punishes self-promotion.',
    json: (q) => `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=25`,
  },
  {
    id: 'nextdoor',
    label: 'Nextdoor',
    build: (q) => `https://nextdoor.com/search/posts/?query=${encodeURIComponent(q)}`,
    note: 'Neighborhood-level trust. Strong for referrals from past clients.',
  },
  {
    id: 'google',
    label: 'Google / general web',
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(`${q} Phoenix OR Maricopa Arizona`)}`,
    note: 'Finds forum threads, blog comments and local groups you would not otherwise see.',
  },
];

export function platform(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];
}

/**
 * Build a fresh worklist of prospecting targets across platforms, languages and
 * cities. Existing targets are not duplicated.
 */
export function buildWorklist({ platforms = null, languages = ['es', 'en'], cities = null, perPlatform = 6 } = {}) {
  const existing = new Set(store.all('prospects').map((p) => `${p.platform}::${p.query}`));
  const cityPool = cities?.length ? cities : CITIES.filter((c) => c.tier === 'core').map((c) => c.name);
  const plats = platforms?.length ? PLATFORMS.filter((p) => platforms.includes(p.id)) : PLATFORMS;

  const created = [];
  for (const p of plats) {
    const queries = [];
    for (const lang of languages) {
      for (const phrase of INTENT_PHRASES[lang] || []) {
        queries.push(phrase);
        // City-qualified variants surface far more local results.
        for (const city of cityPool.slice(0, 3)) {
          queries.push(`${phrase} ${city}`);
        }
      }
    }
    const chosen = unique(queries).slice(0, perPlatform);
    for (const q of chosen) {
      const key = `${p.id}::${q}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const row = {
        id: uid('prospect'),
        platform: p.id,
        platformLabel: p.label,
        query: q,
        url: p.build(q),
        note: p.note,
        status: 'new', // new | working | done | skipped
        leadsFound: 0,
        lastWorkedAt: null,
        createdAt: nowIso(),
      };
      store.insert('prospects', row);
      created.push(row);
    }
  }
  return created;
}

export function listProspects(filter = {}) {
  let rows = store.all('prospects');
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.platform) rows = rows.filter((r) => r.platform === filter.platform);
  return sortBy(rows, (r) => (r.status === 'new' ? 0 : r.status === 'working' ? 1 : 2));
}

export function updateProspect(id, changes) {
  return store.patch('prospects', id, { ...changes, lastWorkedAt: nowIso() });
}

// ---------------------------------------------------------------------------
// Public-feed scanning
// ---------------------------------------------------------------------------

const UA = 'MaricopaBuyerEngine/1.0 (local lead research tool)';

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Minimal RSS/Atom item extraction — enough for Craigslist feeds. */
function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = stripTags((b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
      .replace(/^<!\[CDATA\[|\]\]>$/g, '');
    let link = (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1];
    if (!link) link = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1];
    const desc = stripTags((b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '');
    const date = (b.match(/<(?:pubDate|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|dc:date)>/i) || [])[1];
    if (title) items.push({ title, url: (link || '').trim(), snippet: desc.slice(0, 400), postedAt: date?.trim() || null });
  }
  return items;
}

function scoreSignal(text) {
  const t = String(text || '').toLowerCase();
  let score = 0;
  const strong = ['itin', 'pre-approved', 'preapproved', 'precalificad', 'quiero comprar', 'looking to buy', 'ready to buy', 'first time home buyer', 'primera casa', 'rent to own', 'renta con opción'];
  const medium = ['down payment', 'enganche', 'mortgage', 'hipoteca', 'realtor', 'agente', 'credit score', 'crédito', 'fha', 'closing cost'];
  const geo = ['phoenix', 'maricopa', 'avondale', 'goodyear', 'buckeye', 'glendale', 'surprise', 'peoria', 'mesa', 'tolleson', 'laveen', 'arizona', ' az '];
  for (const k of strong) if (t.includes(k)) score += 25;
  for (const k of medium) if (t.includes(k)) score += 10;
  for (const k of geo) if (t.includes(k)) score += 12;
  // Negative: agents advertising, not buyers looking.
  for (const k of ['for sale by owner', 'i am a realtor', 'soy agente', 'commission split', 'hiring agents']) {
    if (t.includes(k)) score -= 30;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Scan public feeds for buyer-intent signals. Returns candidate items with a
 * relevance score; nothing is imported as a lead automatically — the operator
 * reviews and promotes them.
 */
export async function scanPublicSources({ queries = null, limit = 40 } = {}) {
  const qs = queries?.length
    ? queries
    : [...INTENT_PHRASES.en.slice(0, 4), ...INTENT_PHRASES.es.slice(0, 3)];

  const results = [];
  const errors = [];

  for (const q of qs) {
    // Craigslist "housing wanted" RSS
    const cl = platform('craigslist');
    try {
      const xml = await fetchText(cl.rss(q));
      for (const item of parseRss(xml).slice(0, 10)) {
        const text = `${item.title} ${item.snippet}`;
        results.push({
          platform: 'craigslist', query: q, title: item.title, url: item.url,
          snippet: item.snippet, postedAt: item.postedAt, signal: scoreSignal(text),
        });
      }
    } catch (err) {
      errors.push({ platform: 'craigslist', query: q, error: String(err.message || err) });
    }

    // Reddit public JSON search
    const rd = platform('reddit');
    try {
      const raw = await fetchText(rd.json(`${q} arizona`));
      const data = JSON.parse(raw);
      for (const child of (data?.data?.children || []).slice(0, 10)) {
        const d = child.data || {};
        const text = `${d.title || ''} ${d.selftext || ''} ${d.subreddit || ''}`;
        results.push({
          platform: 'reddit', query: q, title: d.title,
          url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url,
          snippet: String(d.selftext || '').slice(0, 400),
          postedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
          author: d.author, signal: scoreSignal(text),
        });
      }
    } catch (err) {
      errors.push({ platform: 'reddit', query: q, error: String(err.message || err) });
    }
  }

  const ranked = sortBy(results.filter((r) => r.signal >= 20), (r) => r.signal, 'desc').slice(0, limit);
  return { scannedAt: nowIso(), queries: qs, found: ranked.length, results: ranked, errors };
}

// ---------------------------------------------------------------------------
// Comment / DM paste parser
// ---------------------------------------------------------------------------

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;

const INTEREST_WORDS = [
  'info', 'informacion', 'información', 'interesa', 'interesada', 'interesado', 'precio',
  'cuanto', 'cuánto', 'disponible', 'quiero', 'me gusta', 'more info', 'interested',
  'price', 'available', 'how much', 'details', 'itin', 'enganche', 'credito', 'crédito',
];

/**
 * Parse pasted Facebook comments / DMs into lead candidates.
 *
 * Handles the common shapes:
 *   "Maria Lopez  Cuánto de enganche?"
 *   "Jose Ramirez: interested, 602-555-1234"
 *   "Ana G — me interesa"
 * One comment per line; blank lines separate. Nothing is saved until the
 * operator confirms in the UI.
 */
export function parseComments(text, { defaultCity = '', defaultLanguage = 'es', source = 'facebook_organic', sourceDetail = '' } = {}) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l.length > 1);

  const candidates = [];
  const seen = new Set();

  for (const line of lines) {
    // Skip Facebook UI chrome that gets copied along with comments.
    if (/^(like|reply|responder|me gusta|\d+\s*(h|d|w|m)|·|see more|ver más|top fan|author|autor)$/i.test(line)) continue;

    const phone = (line.match(PHONE_RE) || [])[0] || '';
    const email = (line.match(EMAIL_RE) || [])[0] || '';

    // Name = leading capitalized words before a separator or the message body.
    let name = '';
    let message = line;
    const sep = line.match(/^([\p{Lu}][\p{L}'.-]*(?:\s+[\p{Lu}][\p{L}'.-]*){0,3})\s*[:\-—–]\s*(.*)$/u);
    if (sep) {
      name = sep[1].trim();
      message = sep[2].trim();
    } else {
      const lead = line.match(/^([\p{Lu}][\p{L}'.-]*(?:\s+[\p{Lu}][\p{L}'.-]*){1,3})\s+(.*)$/u);
      if (lead) {
        name = lead[1].trim();
        message = lead[2].trim();
      } else if (/^[\p{Lu}][\p{L}'.-]*(\s+[\p{Lu}][\p{L}'.-]*){1,3}$/u.test(line)) {
        name = line;
        message = '';
      }
    }

    const haystack = line.toLowerCase();
    const interested = INTEREST_WORDS.some((w) => haystack.includes(w));
    if (!name && !phone && !email && !interested) continue;

    const key = (normalizePhone(phone) || normalizeEmail(email) || name.toLowerCase()).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const isSpanish = /[áéíóúñ¿¡]|interesa|enganche|cuánto|quiero|informaci/i.test(line);
    candidates.push({
      name: name || (email ? email.split('@')[0] : ''),
      phone: normalizePhone(phone),
      email: normalizeEmail(email),
      message,
      language: isSpanish ? 'es' : defaultLanguage,
      city: defaultCity,
      source,
      sourceDetail,
      financing: /itin/i.test(line) ? 'itin' : 'unsure',
      timeline: /(ahora|hoy|ya|asap|now|this month|este mes)/i.test(line) ? 'now' : 'unknown',
      raw: line,
      // Weighted toward intent, not identity. A name only tells you who wrote
      // the comment; "me interesa" or a phone number tells you they want
      // something. Someone who just wrote "nice house 🔥" is not a lead.
      confidence: (interested ? 45 : 0) + (phone ? 35 : 0) + (email ? 25 : 0) + (name ? 15 : 0),
    });
  }

  return sortBy(candidates, (c) => c.confidence, 'desc');
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/** Parse CSV text (quoted fields supported) into row objects. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text || '').replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim()));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  return nonEmpty.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
}

const CSV_ALIASES = {
  name: ['name', 'full_name', 'nombre', 'contact', 'lead_name', 'first_name'],
  phone: ['phone', 'phone_number', 'telefono', 'teléfono', 'mobile', 'cell', 'celular'],
  email: ['email', 'e_mail', 'correo', 'email_address'],
  city: ['city', 'ciudad', 'location', 'area'],
  zip: ['zip', 'zip_code', 'postal_code', 'codigo_postal'],
  budgetMax: ['budget', 'budget_max', 'max_price', 'presupuesto', 'price'],
  timeline: ['timeline', 'when', 'cuando', 'time_frame'],
  financing: ['financing', 'loan_type', 'financiamiento', 'tipo_de_prestamo'],
  message: ['message', 'notes', 'comment', 'mensaje', 'comentario'],
  language: ['language', 'idioma', 'lang'],
};

/** Map arbitrary CSV columns onto the lead shape. */
export function mapCsvRow(row) {
  const out = {};
  for (const [field, aliases] of Object.entries(CSV_ALIASES)) {
    for (const a of aliases) {
      if (row[a] != null && row[a] !== '') { out[field] = row[a]; break; }
    }
  }
  if (!out.name && row.first_name) {
    out.name = [row.first_name, row.last_name].filter(Boolean).join(' ');
  }
  out.source = 'csv_import';
  return out;
}
