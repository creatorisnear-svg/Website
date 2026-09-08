// Local-first JSON datastore with atomic writes + rotating backups.
// Chosen over SQLite so the app installs with zero npm dependencies and the
// data files stay human-readable / easy to back up from a PC.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.MBE_DATA_DIR
  ? path.resolve(process.env.MBE_DATA_DIR)
  : path.join(ROOT, 'data');
export const BACKUP_DIR = path.join(ROOT, 'backups');

const COLLECTIONS = [
  'leads',
  'activities',
  'tasks',
  'deals',
  'payouts',
  'campaigns',
  'posts',
  'prospects',
  'clicks',
  'agentActions',
  'settings',
];

const cache = new Map();
const writeQueue = new Map();

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function defaultValue(name) {
  return name === 'settings' ? {} : [];
}

function readFileSafe(name) {
  const f = fileFor(name);
  try {
    const raw = fs.readFileSync(f, 'utf8');
    if (!raw.trim()) return defaultValue(name);
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return defaultValue(name);
    // Corrupt file: preserve it and start clean rather than crashing the app.
    const quarantine = `${f}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(f, quarantine);
      console.error(`[store] ${name}.json was unreadable; moved to ${quarantine}`);
    } catch {
      /* ignore */
    }
    return defaultValue(name);
  }
}

/** Read a whole collection (cached in memory). */
export function read(name) {
  if (!cache.has(name)) {
    ensureDirs();
    cache.set(name, readFileSafe(name));
  }
  return cache.get(name);
}

/** Persist a collection with a temp-file + rename so a crash cannot truncate it. */
export function write(name, value) {
  ensureDirs();
  cache.set(name, value);
  const f = fileFor(name);
  const tmp = `${f}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, f);
  return value;
}

/** Read-modify-write helper. */
export function update(name, fn) {
  const current = read(name);
  const next = fn(current);
  return write(name, next === undefined ? current : next);
}

// ---------------------------------------------------------------------------
// Record helpers (collections of objects with an `id`)
// ---------------------------------------------------------------------------

export function all(name) {
  return read(name);
}

export function find(name, id) {
  return read(name).find((r) => r.id === id) || null;
}

export function insert(name, record) {
  const rows = read(name);
  rows.push(record);
  write(name, rows);
  return record;
}

export function insertMany(name, records) {
  if (!records.length) return [];
  const rows = read(name);
  rows.push(...records);
  write(name, rows);
  return records;
}

export function patch(name, id, changes) {
  const rows = read(name);
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return null;
  rows[i] = { ...rows[i], ...changes };
  write(name, rows);
  return rows[i];
}

export function remove(name, id) {
  const rows = read(name);
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return false;
  rows.splice(i, 1);
  write(name, rows);
  return true;
}

export function removeWhere(name, predicate) {
  const rows = read(name);
  const kept = rows.filter((r) => !predicate(r));
  const removed = rows.length - kept.length;
  if (removed) write(name, kept);
  return removed;
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

/** Copy every collection into backups/<timestamp>/ and prune old sets. */
export function backup(keep = 20) {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of COLLECTIONS) {
    const src = fileFor(name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `${name}.json`));
  }
  const sets = fs
    .readdirSync(BACKUP_DIR)
    .filter((d) => fs.statSync(path.join(BACKUP_DIR, d)).isDirectory())
    .sort();
  while (sets.length > keep) {
    const old = sets.shift();
    fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
  }
  return dir;
}

/** Drop every collection (used by `npm run reset`). */
export function wipe() {
  ensureDirs();
  for (const name of COLLECTIONS) {
    const f = fileFor(name);
    if (fs.existsSync(f)) fs.rmSync(f);
    cache.delete(name);
  }
}

export function clearCache() {
  cache.clear();
  writeQueue.clear();
}

export { COLLECTIONS };
