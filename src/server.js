#!/usr/bin/env node
// Maricopa Buyer Engine — local server.
//
// Everything runs on your own machine. Bound to 127.0.0.1 by default so the
// dashboard (which holds client phone numbers) is not exposed to your network.

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRouter, sendJson, sendText, serveStatic, readBody, redirect } from './lib/http.js';
import { registerApiRoutes } from './routes/api.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerAgentRoutes } from './routes/agent.js';
import { getSettings } from './domain/settings.js';
import * as store from './lib/store.js';
import { prettyPhone } from './lib/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const router = createRouter();
registerPublicRoutes(router);
registerAgentRoutes(router);
registerApiRoutes(router);

// Dashboard shell
router.get('/', (req, res) => redirect(res, '/app/'));
router.get('/health', (req, res) => sendJson(res, 200, { ok: true, uptime: process.uptime() }));

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendText(res, 400, 'Bad request');
  }

  // Same-origin CORS for the public capture endpoint only.
  if (url.pathname === '/api/public/lead') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  try {
    const match = router.match(req.method, url.pathname);
    if (match) {
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      await match.handler(req, res, { params: match.params, body, url, req });
      if (process.env.MBE_LOG !== 'off') {
        console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
      }
      return;
    }

    // Static assets under /app/
    if (url.pathname === '/app' || url.pathname === '/app/') {
      if (serveStatic(res, PUBLIC_DIR, 'app/index.html')) return;
    }
    if (serveStatic(res, PUBLIC_DIR, url.pathname)) return;

    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    sendText(res, 404, 'Not found');
  } catch (err) {
    console.error(`[error] ${req.method} ${url.pathname}:`, err);
    if (!res.headersSent) sendJson(res, 500, { error: String(err.message || err) });
    else res.end();
  }
});

const settings = getSettings();
const PORT = Number(process.env.PORT || settings.server.port || 4317);
const HOST = process.env.HOST || settings.server.host || '127.0.0.1';

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  const leads = store.all('leads').length;
  const deals = store.all('deals').length;
  console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │  MARICOPA BUYER ENGINE                                   │
  │  Buyer lead generation + referral revenue tracking       │
  └──────────────────────────────────────────────────────────┘

  Dashboard    ${url}/app/
  Landing (ES) ${url}/l/itin
  Landing (EN) ${url}/l/itin?lang=en

  Agent        ${settings.agent.name} · ${prettyPhone(settings.agent.phone)}
  Data         ${store.DATA_DIR}
  Loaded       ${leads} lead${leads === 1 ? '' : 's'}, ${deals} deal${deals === 1 ? '' : 's'}

  Press Ctrl+C to stop.
`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.\n  Either close the other program or run:  PORT=4318 npm start\n`);
    process.exit(1);
  }
  throw err;
});

// Back up on shutdown so a day's work is never lost to a crash or reboot.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (store.all('leads').length) {
      const dir = store.backup();
      console.log(`\n  Backup saved: ${dir}`);
    }
  } catch (err) {
    console.error('  Backup on shutdown failed:', err.message);
  }
  console.log(`  Stopped (${signal}).\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
