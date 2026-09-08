#!/usr/bin/env node
// Wipe all data (a backup is taken first).

import * as store from '../src/lib/store.js';

const hasData = store.all('leads').length || store.all('deals').length;
if (hasData) {
  const dir = store.backup();
  console.log(`Backup written to ${dir}`);
}
store.wipe();
console.log('All data cleared. Run `npm run seed` for demo data, or `npm start` to begin fresh.');
