#!/usr/bin/env node
// Run a prospecting scan from the terminal (same engine as the Find Buyers tab).

import { scanPublicSources } from '../src/domain/prospecting.js';

const queries = process.argv.slice(2);
console.log('Scanning public sources for buyer intent…\n');

const r = await scanPublicSources({ queries: queries.length ? queries : null });

if (!r.results.length) {
  console.log('No strong signals found.');
} else {
  for (const item of r.results) {
    console.log(`[${String(item.signal).padStart(3)}] ${item.platform.padEnd(11)} ${String(item.title || '').slice(0, 74)}`);
    if (item.url) console.log(`      ${item.url}`);
  }
  console.log(`\n${r.results.length} buyer-intent posts found.`);
}
if (r.errors.length) console.log(`${r.errors.length} source(s) unreachable (they rate-limit automated requests).`);
