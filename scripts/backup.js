#!/usr/bin/env node
// Manual backup: copies every data file into backups/<timestamp>/.

import * as store from '../src/lib/store.js';

const dir = store.backup();
console.log(`Backup saved: ${dir}`);
console.log(`Leads: ${store.all('leads').length} · Deals: ${store.all('deals').length} · Payouts: ${store.all('payouts').length}`);
