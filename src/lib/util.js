// Small shared helpers. No dependencies.

export function uid(prefix = '') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${prefix ? '_' : ''}${t}${r}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function monthKey(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 7); // YYYY-MM
}

export function lastNMonths(n, from = new Date()) {
  const out = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function num(v, fallback = 0) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalize a US phone to +1XXXXXXXXXX when possible, else return trimmed input. */
export function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return String(raw).trim();
}

export function prettyPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1/, '');
  if (d.length !== 10) return raw || '';
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

/**
 * Fold a name for comparison: strip accents, collapse whitespace, lowercase.
 * Essential here — most of these leads have Spanish names, and the same person
 * writes "María Solís" on one post and "Maria Solis" on the next. Without this
 * they become two leads and get messaged twice.
 */
export function normalizeName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(n) {
  return `$${Math.round(num(n)).toLocaleString('en-US')}`;
}

/** Simple {{token}} template fill. Unknown tokens are left blank. */
export function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const val = key.split('.').reduce((o, k) => (o == null ? o : o[k]), vars);
    return val == null ? '' : String(val);
  });
}

export function unique(arr) {
  return [...new Set(arr)];
}

export function sortBy(arr, keyFn, dir = 'asc') {
  const mul = dir === 'desc' ? -1 : 1;
  return [...arr].sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
}
