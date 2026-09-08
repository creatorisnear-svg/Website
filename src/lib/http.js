// Tiny HTTP helpers: routing, body parsing, static files. No dependencies.

import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function sendHtml(res, status, html) {
  sendText(res, status, html, 'text/html; charset=utf-8');
}

export function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location });
  res.end();
}

/** Read and JSON-parse a request body, with a size cap. */
export function readBody(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const ctype = String(req.headers['content-type'] || '');
      try {
        if (ctype.includes('application/json')) return resolve(JSON.parse(raw));
        if (ctype.includes('application/x-www-form-urlencoded')) {
          return resolve(Object.fromEntries(new URLSearchParams(raw)));
        }
        return resolve(JSON.parse(raw));
      } catch {
        resolve({ _raw: raw });
      }
    });
    req.on('error', reject);
  });
}

/** Serve a file from `root`, refusing any path that escapes it. */
export function serveStatic(res, root, relPath) {
  const clean = decodeURIComponent(relPath.split('?')[0]).replace(/^\/+/, '');
  const full = path.resolve(root, clean);
  if (!full.startsWith(path.resolve(root))) {
    sendText(res, 403, 'Forbidden');
    return true;
  }
  let target = full;
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target)) return false;
    const ext = path.extname(target).toLowerCase();
    const data = fs.readFileSync(target);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pattern router. Patterns look like 'GET /api/leads/:id'. Returns a matcher
 * that resolves { handler, params } or null.
 */
export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ method: method.toUpperCase(), parts, handler, pattern });
  }

  const api = {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    patch: (p, h) => add('PATCH', p, h),
    delete: (p, h) => add('DELETE', p, h),
    options: (p, h) => add('OPTIONS', p, h),
    match(method, pathname) {
      const segs = pathname.split('/').filter(Boolean);
      for (const r of routes) {
        if (r.method !== method.toUpperCase()) continue;
        const wildcard = r.parts[r.parts.length - 1] === '*';
        if (!wildcard && r.parts.length !== segs.length) continue;
        if (wildcard && segs.length < r.parts.length - 1) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < r.parts.length; i++) {
          const p = r.parts[i];
          if (p === '*') { params.rest = segs.slice(i).join('/'); break; }
          if (p.startsWith(':')) { params[p.slice(1)] = decodeURIComponent(segs[i]); continue; }
          if (p !== segs[i]) { ok = false; break; }
        }
        if (ok) return { handler: r.handler, params };
      }
      return null;
    },
  };
  return api;
}

export function queryOf(url) {
  return Object.fromEntries(url.searchParams.entries());
}
