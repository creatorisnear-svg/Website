// Agent API — the surface Claude in Chrome talks to.
//
// Every route here requires the `X-Agent-Token` header (or `?token=`), and
// cross-origin calls are only answered for origins on the allowlist. Without
// both, this endpoint refuses: the server holds real clients' phone numbers and
// is reachable from any page the operator happens to have open.
//
// Nothing in this API sends a message, posts, or submits anything. It hands out
// prepared work and records what the operator did.

import { sendJson, queryOf } from '../lib/http.js';
import { nowIso } from '../lib/util.js';
import { getSettings, agentToken, saveSettings, baseUrl } from '../domain/settings.js';
import * as Automation from '../domain/automation.js';
import * as Leads from '../domain/leads.js';
import * as Prospecting from '../domain/prospecting.js';
import * as Content from '../domain/content.js';
import * as Campaigns from '../domain/campaigns.js';
import * as store from '../lib/store.js';

/** Reflect an allowlisted Origin so the browser permits the response. */
export function applyAgentCors(req, res) {
  const origin = req.headers?.origin;
  if (!origin) return;
  const allowed = getSettings().automation.allowedOrigins || [];
  if (!allowed.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
}

function authorized(req, url) {
  const settings = getSettings();
  if (!settings.automation.enabled) return { ok: false, error: 'Automation is turned off. Enable it in the dashboard Automation tab.' };
  const expected = settings.automation.token;
  if (!expected) return { ok: false, error: 'No agent token has been generated yet. Open the Automation tab in the dashboard.' };
  const provided = req.headers?.['x-agent-token'] || queryOf(url).token;
  if (provided !== expected) return { ok: false, error: 'Invalid or missing X-Agent-Token header.' };
  return { ok: true };
}

/** Wrap a handler with the token check. */
function guard(handler) {
  return async (req, res, extra) => {
    applyAgentCors(req, res);
    const auth = authorized(req, extra.url);
    if (!auth.ok) return sendJson(res, 401, { error: auth.error });
    return handler(req, res, extra);
  };
}

export function registerAgentRoutes(router) {
  // Preflight for every agent route.
  router.options('/api/agent/*', (req, res) => {
    applyAgentCors(req, res);
    res.writeHead(204);
    res.end();
  });

  // -------------------------------------------------------------------------
  // Discovery — what Claude reads first to learn how to work this system.
  // -------------------------------------------------------------------------
  router.get('/api/agent/manifest', guard((req, res) => {
    const s = getSettings();
    sendJson(res, 200, {
      system: 'Maricopa Buyer Engine',
      purpose:
        'Generate home-buyer leads for a real estate agent in the Maricopa, Arizona area and track referral commission.',
      agent: { name: s.agent.name, phone: s.agent.phone, business: s.agent.business },
      groundRules: [
        'You PREPARE, the operator SENDS. Type text into the box and stop. Never press send, Post, or submit.',
        'Never invent who to contact. Only work people returned by GET /api/agent/queue.',
        'Never send the same person more than one message per queue item.',
        'Respect the cooldown and any "blocked" reasons in the queue response. If blocked, stop and say why.',
        'When collecting comments, read only — do not reply or message anyone during that pass.',
        'Report honestly. If you could not do something, say so rather than marking it done.',
      ],
      workflow: [
        'GET /api/agent/queue to get prepared work, highest priority first.',
        'Do exactly what each action\'s "instruction" says.',
        'POST /api/agent/actions/{id}/complete with outcome "prepared" once the text is staged, or "sent" once the operator confirms they sent it, or "skipped" with a reason.',
        'POST /api/agent/comments with anyone you found who is interested in buying.',
      ],
      endpoints: {
        'GET  /api/agent/queue': 'Prepared work, already filtered by rate limits and quiet hours. ?limit=5&type=dm',
        'GET  /api/agent/status': 'Current budgets, cooldown, and what has been done today.',
        'POST /api/agent/actions/{id}/complete': 'Body: { outcome: "prepared"|"sent"|"skipped", result: "what happened" }',
        'POST /api/agent/comments': 'Body: { comments: [{ name, text, phone?, postUrl? }], postLabel? } — collected commenters.',
        'POST /api/agent/leads': 'Body: { leads: [ leadShape ] } — add leads found while researching.',
        'GET  /api/agent/lead/{id}': 'Full detail plus ready-to-send scripts for one lead.',
        'GET  /api/agent/searches': 'Prospecting searches to work, with URLs.',
        'GET  /api/agent/post-today': 'Today\'s suggested post, generated in Spanish and English.',
        'POST /api/agent/queue/rebuild': 'Refresh the queue from leads whose follow-up is due.',
        'POST /api/agent/note': 'Body: { leadId, note } — record something you learned.',
      },
      limits: s.automation.limits,
      quietHours: { start: s.outreach.quietHoursStart, end: s.outreach.quietHoursEnd },
      landingPage: `${baseUrl()}/l/itin`,
      dashboard: `${baseUrl()}/app/`,
    });
  }));

  router.get('/api/agent/status', guard((req, res) => {
    sendJson(res, 200, Automation.automationStatus());
  }));

  // -------------------------------------------------------------------------
  // The work queue
  // -------------------------------------------------------------------------
  router.get('/api/agent/queue', guard((req, res, { url }) => {
    const q = queryOf(url);
    const result = Automation.nextActions({
      limit: Math.min(Number(q.limit) || 5, 20),
      type: q.type || null,
    });
    sendJson(res, 200, {
      ...result,
      reminder: 'Prepare only. Type the message and stop — the operator presses send.',
    });
  }));

  router.post('/api/agent/queue/rebuild', guard((req, res) => {
    const created = Automation.rebuildQueue();
    sendJson(res, 200, { created: created.length, ...Automation.nextActions({ limit: 5 }) });
  }));

  router.post('/api/agent/actions/:id/complete', guard((req, res, { params, body }) => {
    const outcome = ['prepared', 'sent', 'skipped'].includes(body.outcome) ? body.outcome : 'prepared';
    const action = Automation.completeAction(params.id, { outcome, result: body.result || '' });
    if (!action) return sendJson(res, 404, { error: 'Action not found' });
    sendJson(res, 200, { action, status: Automation.automationStatus() });
  }));

  // -------------------------------------------------------------------------
  // Collecting comments — the highest-value thing the agent does
  // -------------------------------------------------------------------------
  router.post('/api/agent/comments', guard((req, res, { body }) => {
    const rows = Array.isArray(body.comments) ? body.comments : [];
    if (!rows.length) return sendJson(res, 400, { error: 'Send a non-empty `comments` array.' });

    // Reuse the same parser the dashboard's paste importer uses, so a comment
    // collected by the agent is scored identically to one pasted by hand.
    const text = rows
      .map((c) => [c.name, c.text, c.phone].filter(Boolean).join(': '))
      .join('\n');
    const candidates = Prospecting.parseComments(text, {
      defaultCity: body.city || '',
      source: 'facebook_organic',
      sourceDetail: body.postLabel || body.postUrl || 'collected by browser agent',
    });

    // The dashboard's paste importer shows candidates in a review table before
    // anything is saved. This endpoint has no human in the loop, so it applies
    // a confidence floor instead: a bare "nice house 🔥" is not a buyer, and
    // letting it through would put a stranger into the outreach queue.
    const floor = Number.isFinite(Number(body.minConfidence)) ? Number(body.minConfidence) : 35;

    let imported = 0;
    let duplicates = 0;
    const created = [];
    const ignored = [];
    for (const c of candidates) {
      if (!c.name && !c.phone && !c.email) continue;
      if (c.confidence < floor) {
        ignored.push({ name: c.name, text: c.message || c.raw, confidence: c.confidence });
        continue;
      }
      const { lead, duplicate } = Leads.createLead({ ...c, message: c.message || c.raw });
      if (duplicate) duplicates++;
      else { imported++; created.push({ id: lead.id, name: lead.name, score: lead.score, temperature: lead.temperature }); }
    }

    sendJson(res, 201, {
      received: rows.length,
      parsed: candidates.length,
      imported,
      duplicates,
      leads: created,
      ignored,
      ignoredNote: ignored.length
        ? `${ignored.length} comment(s) showed no buying interest and were not added. If you believe one of them is a real buyer, resend it with more context (their question, a phone number) rather than lowering minConfidence.`
        : undefined,
      next: imported
        ? 'Run POST /api/agent/queue/rebuild to get messages prepared for the new leads.'
        : 'No new people added.',
    });
  }));

  router.post('/api/agent/leads', guard((req, res, { body }) => {
    const rows = Array.isArray(body.leads) ? body.leads : [];
    let imported = 0;
    let duplicates = 0;
    const created = [];
    for (const row of rows) {
      if (!row.name && !row.phone && !row.email) continue;
      const { lead, duplicate } = Leads.createLead({
        ...row,
        source: row.source || 'prospecting',
        sourceDetail: row.sourceDetail || 'found by browser agent',
      });
      if (duplicate) duplicates++;
      else { imported++; created.push({ id: lead.id, name: lead.name, score: lead.score }); }
    }
    sendJson(res, 201, { imported, duplicates, leads: created });
  }));

  router.get('/api/agent/lead/:id', guard((req, res, { params }) => {
    const lead = Leads.getLead(params.id);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
    sendJson(res, 200, {
      lead,
      activities: Leads.activitiesFor(lead.id).slice(0, 15),
      scripts: Object.fromEntries(
        Object.keys(Content.OUTREACH).map((k) => [k, Content.outreachScript(k, lead)]),
      ),
      note: 'Use these scripts verbatim. They are already in the lead\'s language with their name and city filled in.',
    });
  }));

  router.post('/api/agent/note', guard((req, res, { body }) => {
    if (!body.leadId || !body.note) return sendJson(res, 400, { error: 'leadId and note are required' });
    const lead = Leads.getLead(body.leadId);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
    const activity = Leads.logActivity(body.leadId, 'note', `[browser agent] ${body.note}`);
    // Let the agent record qualifying details it learned in conversation.
    const updatable = ['city', 'zip', 'budgetMax', 'downPaymentPct', 'timeline', 'financing', 'preApproved', 'beds', 'language'];
    const changes = {};
    for (const k of updatable) if (body[k] != null && body[k] !== '') changes[k] = body[k];
    const updated = Object.keys(changes).length ? Leads.updateLead(body.leadId, changes) : lead;
    sendJson(res, 201, { activity, lead: { id: updated.id, score: updated.score, temperature: updated.temperature } });
  }));

  // -------------------------------------------------------------------------
  // Research + content
  // -------------------------------------------------------------------------
  router.get('/api/agent/searches', guard((req, res, { url }) => {
    const q = queryOf(url);
    const rows = Prospecting.listProspects({ status: q.status || 'new' }).slice(0, Number(q.limit) || 10);
    sendJson(res, 200, {
      searches: rows.map((p) => ({
        id: p.id, platform: p.platform, query: p.query, url: p.url, note: p.note, status: p.status,
      })),
      instruction:
        'Open each URL and read the results. Look for people asking about buying a home in the Phoenix / Maricopa area — ' +
        'especially anyone mentioning ITIN, down payment, pre-approval, or being tired of renting. ' +
        'POST anyone real to /api/agent/leads. Do not message anyone during research. ' +
        'Then PATCH the search to status "done" via the dashboard, or report which ones you finished.',
    });
  }));

  router.get('/api/agent/post-today', guard((req, res, { url }) => {
    const q = queryOf(url);
    const dayIndex = new Date().getDay(); // 0 = Sunday
    const plan = Campaigns.WEEKLY_PLAN;
    // WEEKLY_PLAN starts at Monday; map JS Sunday=0 onto it.
    const planned = plan[(dayIndex + 6) % 7];
    const type = q.type || planned.type;
    const city = q.city || 'Avondale';

    const post = Campaigns.savePost({ type, city, language: 'es', landing: type === 'itin' ? 'itin' : 'buyer', status: 'draft' });
    const es = Content.generatePost({ type, language: 'es', vars: { city }, link: post.trackUrl });
    const en = Content.generatePost({ type, language: 'en', vars: { city }, link: post.trackUrl });
    Campaigns.updatePost(post.id, { body: es, bodyEn: en });

    sendJson(res, 200, {
      day: planned.day,
      type,
      why: planned.note,
      spanish: es,
      english: en,
      trackedLink: post.trackUrl,
      postId: post.id,
      instruction:
        'Paste the Spanish version into the composer. Type it in, then stop — the operator reviews it, adds photos, and presses Post themselves.',
    });
  }));

  // -------------------------------------------------------------------------
  // Token management (called from the dashboard, same-origin)
  // -------------------------------------------------------------------------
  router.get('/api/automation/token', (req, res) => {
    sendJson(res, 200, { token: agentToken(), status: Automation.automationStatus() });
  });

  router.post('/api/automation/token/regenerate', (req, res) => {
    sendJson(res, 200, { token: agentToken({ regenerate: true }) });
  });

  router.post('/api/automation/toggle', (req, res, { body }) => {
    saveSettings({ automation: { enabled: Boolean(body.enabled) } });
    sendJson(res, 200, { status: Automation.automationStatus() });
  });

  router.patch('/api/automation/limits', (req, res, { body }) => {
    const limits = {};
    for (const k of ['dmsPerDay', 'dmsPerHour', 'commentRepliesPerDay', 'postsPerDay', 'minSecondsBetweenActions']) {
      if (body[k] != null) limits[k] = Number(body[k]);
    }
    saveSettings({ automation: { limits } });
    sendJson(res, 200, { status: Automation.automationStatus() });
  });

  router.get('/api/automation/actions', (req, res, { url }) => {
    const q = queryOf(url);
    const leads = store.all('leads');
    sendJson(res, 200, {
      actions: Automation.listActions({ status: q.status || null, limit: 60 }).map((a) => ({
        ...a,
        lead: a.leadId ? leads.find((l) => l.id === a.leadId) || null : null,
      })),
      status: Automation.automationStatus(),
    });
  });

  router.post('/api/automation/rebuild', (req, res) => {
    const created = Automation.rebuildQueue();
    sendJson(res, 200, { created: created.length, status: Automation.automationStatus() });
  });

  router.post('/api/automation/harvest', (req, res, { body }) => {
    if (!body.postUrl) return sendJson(res, 400, { error: 'postUrl is required' });
    sendJson(res, 201, { action: Automation.queueHarvest(body.postUrl, body.label || '') });
  });

  router.post('/api/automation/clear', (req, res) => {
    sendJson(res, 200, { removed: Automation.clearCompleted() });
  });

  router.post('/api/automation/actions/:id/sent', (req, res, { params }) => {
    const action = Automation.completeAction(params.id, { outcome: 'sent', result: 'confirmed sent by operator' });
    if (!action) return sendJson(res, 404, { error: 'Action not found' });
    sendJson(res, 200, { action });
  });

  router.delete('/api/automation/actions/:id', (req, res, { params }) => {
    sendJson(res, 200, { deleted: store.remove('agentActions', params.id) });
  });
}
