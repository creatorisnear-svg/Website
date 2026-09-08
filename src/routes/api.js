// JSON API consumed by the dashboard.

import * as store from '../lib/store.js';
import { sendJson, queryOf } from '../lib/http.js';
import { nowIso, sortBy, num, addDays, uid } from '../lib/util.js';
import * as Leads from '../domain/leads.js';
import * as Commissions from '../domain/commissions.js';
import * as Campaigns from '../domain/campaigns.js';
import * as Content from '../domain/content.js';
import * as Prospecting from '../domain/prospecting.js';
import * as Market from '../domain/market.js';
import { getSettings, saveSettings, publicSettings, baseUrl } from '../domain/settings.js';
import * as Facebook from '../integrations/facebook.js';

export function registerApiRoutes(router) {
  // ----- meta / reference data -------------------------------------------
  router.get('/api/meta', (req, res) => {
    sendJson(res, 200, {
      stages: Leads.STAGES,
      sources: Leads.SOURCES,
      timelines: Leads.TIMELINES,
      financing: Leads.FINANCING,
      cities: Market.CITIES,
      programs: Market.PROGRAMS,
      postTypes: Content.POST_TYPES,
      outreachKeys: Object.keys(Content.OUTREACH),
      sequences: Content.SEQUENCES,
      channels: Campaigns.CHANNELS,
      platforms: Prospecting.PLATFORMS.map(({ id, label, note }) => ({ id, label, note })),
      weeklyPlan: Campaigns.WEEKLY_PLAN,
      baseUrl: baseUrl(),
    });
  });

  // ----- dashboard --------------------------------------------------------
  router.get('/api/dashboard', (req, res) => {
    const report = Commissions.dashboardReport();
    const leads = store.all('leads');
    const tasks = Leads.openTasks();
    const now = nowIso();
    sendJson(res, 200, {
      ...report,
      queue: Leads.workQueue(12),
      tasks: {
        overdue: tasks.filter((t) => t.dueAt <= now).length,
        today: tasks.filter((t) => t.dueAt.slice(0, 10) === now.slice(0, 10)).length,
        list: tasks.slice(0, 20).map((t) => ({
          ...t,
          lead: leads.find((l) => l.id === t.leadId) || null,
        })),
      },
      recentLeads: sortBy(leads, (l) => l.createdAt, 'desc').slice(0, 8),
      goals: getSettings().goals,
    });
  });

  // ----- leads ------------------------------------------------------------
  router.get('/api/leads', (req, res, { url }) => {
    const q = queryOf(url);
    if (q.active) q.active = q.active === 'true';
    if (q.minScore) q.minScore = Number(q.minScore);
    sendJson(res, 200, { leads: Leads.listLeads(q) });
  });

  router.get('/api/leads/:id', (req, res, { params }) => {
    const lead = Leads.getLead(params.id);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
    const deal = store.all('deals').find((d) => d.leadId === lead.id) || null;
    sendJson(res, 200, {
      lead,
      activities: Leads.activitiesFor(lead.id),
      tasks: sortBy(store.all('tasks').filter((t) => t.leadId === lead.id), (t) => t.dueAt),
      deal,
      value: Commissions.projectLeadValue(lead),
      scripts: Object.fromEntries(
        Object.keys(Content.OUTREACH).map((k) => [k, Content.outreachScript(k, lead)]),
      ),
      suggestedSequence: Content.sequenceFor(lead),
    });
  });

  router.post('/api/leads', (req, res, { body }) => {
    if (!body.name && !body.phone && !body.email) {
      return sendJson(res, 400, { error: 'A name, phone or email is required' });
    }
    const { lead, duplicate } = Leads.createLead(body, { allowDuplicate: body._allowDuplicate });
    sendJson(res, duplicate ? 200 : 201, { lead, duplicate });
  });

  router.patch('/api/leads/:id', (req, res, { params, body }) => {
    const lead = Leads.updateLead(params.id, body);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
    sendJson(res, 200, { lead });
  });

  router.delete('/api/leads/:id', (req, res, { params }) => {
    sendJson(res, 200, { deleted: Leads.deleteLead(params.id) });
  });

  router.post('/api/leads/:id/contact', (req, res, { params, body }) => {
    const lead = Leads.recordContact(params.id, body);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
    sendJson(res, 200, { lead });
  });

  router.post('/api/leads/:id/note', (req, res, { params, body }) => {
    if (!body.body) return sendJson(res, 400, { error: 'Note body is required' });
    sendJson(res, 201, { activity: Leads.logActivity(params.id, 'note', body.body) });
  });

  /** Apply a follow-up sequence, scheduling every step as a task. */
  router.post('/api/leads/:id/sequence', (req, res, { params, body }) => {
    const lead = Leads.getLead(params.id);
    if (!lead) return sendJson(res, 404, { error: 'Lead not found' });
    const key = body.sequence || Content.sequenceFor(lead);
    const seq = Content.SEQUENCES[key];
    if (!seq) return sendJson(res, 400, { error: `Unknown sequence: ${key}` });
    const created = seq.steps.map((step) =>
      Leads.createTask(lead.id, `${step.title} (${step.channel})`, addDays(new Date(), step.day).toISOString(), step.channel),
    );
    Leads.logActivity(lead.id, 'sequence', `Applied "${seq.name}" — ${created.length} touches scheduled`);
    sendJson(res, 201, { sequence: key, tasks: created });
  });

  router.post('/api/leads/bulk', (req, res, { body }) => {
    const rows = Array.isArray(body.leads) ? body.leads : [];
    let imported = 0;
    let duplicates = 0;
    const created = [];
    for (const row of rows) {
      if (!row.name && !row.phone && !row.email) continue;
      const { lead, duplicate } = Leads.createLead(row);
      if (duplicate) duplicates++;
      else { imported++; created.push(lead); }
    }
    sendJson(res, 201, { imported, duplicates, leads: created });
  });

  // ----- tasks ------------------------------------------------------------
  router.get('/api/tasks', (req, res) => {
    const leads = store.all('leads');
    sendJson(res, 200, {
      tasks: Leads.openTasks().map((t) => ({ ...t, lead: leads.find((l) => l.id === t.leadId) || null })),
    });
  });

  router.post('/api/tasks', (req, res, { body }) => {
    sendJson(res, 201, { task: Leads.createTask(body.leadId || null, body.title || 'Follow up', body.dueAt, body.kind) });
  });

  router.post('/api/tasks/:id/complete', (req, res, { params }) => {
    const task = Leads.completeTask(params.id);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });
    sendJson(res, 200, { task });
  });

  router.delete('/api/tasks/:id', (req, res, { params }) => {
    sendJson(res, 200, { deleted: store.remove('tasks', params.id) });
  });

  // ----- deals / revenue --------------------------------------------------
  router.get('/api/deals', (req, res) => {
    const leads = store.all('leads');
    sendJson(res, 200, {
      deals: sortBy(store.all('deals'), (d) => d.updatedAt, 'desc').map((d) => ({
        ...d,
        lead: leads.find((l) => l.id === d.leadId) || null,
      })),
      payouts: sortBy(store.all('payouts'), (p) => p.receivedAt, 'desc'),
      statuses: Commissions.DEAL_STATUSES,
    });
  });

  router.post('/api/deals', (req, res, { body }) => {
    if (!body.salePrice) return sendJson(res, 400, { error: 'Sale price is required' });
    sendJson(res, 201, { deal: Commissions.createDeal(body) });
  });

  router.patch('/api/deals/:id', (req, res, { params, body }) => {
    const deal = Commissions.updateDeal(params.id, body);
    if (!deal) return sendJson(res, 404, { error: 'Deal not found' });
    sendJson(res, 200, { deal });
  });

  router.delete('/api/deals/:id', (req, res, { params }) => {
    sendJson(res, 200, { deleted: Commissions.deleteDeal(params.id) });
  });

  router.post('/api/deals/:id/payout', (req, res, { params, body }) => {
    const payout = Commissions.recordPayout(params.id, body);
    if (!payout) return sendJson(res, 404, { error: 'Deal not found' });
    sendJson(res, 201, { payout });
  });

  /** What-if calculator for the commission tab. */
  router.get('/api/commission-calc', (req, res, { url }) => {
    const q = queryOf(url);
    sendJson(res, 200, Commissions.computeDeal({
      salePrice: num(q.salePrice, 0),
      agentCommissionPct: q.agentCommissionPct != null ? num(q.agentCommissionPct) : null,
      referralPct: q.referralPct != null ? num(q.referralPct) : null,
      flatBonus: q.flatBonus != null ? num(q.flatBonus) : null,
    }));
  });

  router.get('/api/reports/sources', (req, res) => sendJson(res, 200, { sources: Commissions.sourceReport() }));
  router.get('/api/reports/funnel', (req, res) => sendJson(res, 200, Commissions.funnelReport()));
  router.get('/api/reports/revenue', (req, res, { url }) => {
    const q = queryOf(url);
    sendJson(res, 200, Commissions.revenueSummary({ months: num(q.months, 12) }));
  });

  // ----- campaigns + content ---------------------------------------------
  router.get('/api/campaigns', (req, res) => sendJson(res, 200, { campaigns: Campaigns.listCampaigns() }));
  router.post('/api/campaigns', (req, res, { body }) => sendJson(res, 201, { campaign: Campaigns.createCampaign(body) }));
  router.patch('/api/campaigns/:id', (req, res, { params, body }) => sendJson(res, 200, { campaign: Campaigns.updateCampaign(params.id, body) }));
  router.delete('/api/campaigns/:id', (req, res, { params }) => sendJson(res, 200, { deleted: Campaigns.deleteCampaign(params.id) }));

  router.get('/api/posts', (req, res, { url }) => sendJson(res, 200, { posts: Campaigns.listPosts(queryOf(url)) }));
  router.post('/api/posts', (req, res, { body }) => sendJson(res, 201, { post: Campaigns.savePost(body) }));
  router.patch('/api/posts/:id', (req, res, { params, body }) => sendJson(res, 200, { post: Campaigns.updatePost(params.id, body) }));
  router.delete('/api/posts/:id', (req, res, { params }) => sendJson(res, 200, { deleted: Campaigns.deletePost(params.id) }));

  router.post('/api/content/generate', (req, res, { body }) => {
    const link = body.trackUrl || '';
    sendJson(res, 200, {
      es: Content.generatePost({ ...body, language: 'es', link }),
      en: Content.generatePost({ ...body, language: 'en', link }),
    });
  });

  router.post('/api/content/script', (req, res, { body }) => {
    const lead = body.leadId ? Leads.getLead(body.leadId) : body.lead || {};
    sendJson(res, 200, { script: Content.outreachScript(body.key || 'first_touch', lead || {}) });
  });

  router.get('/api/content/schedule', (req, res, { url }) => {
    const q = queryOf(url);
    sendJson(res, 200, { slots: Campaigns.suggestSchedule(num(q.count, 7)), plan: Campaigns.WEEKLY_PLAN });
  });

  // ----- prospecting ------------------------------------------------------
  router.get('/api/prospects', (req, res, { url }) => sendJson(res, 200, { prospects: Prospecting.listProspects(queryOf(url)) }));

  router.post('/api/prospects/build', (req, res, { body }) => {
    const created = Prospecting.buildWorklist(body || {});
    sendJson(res, 201, { created: created.length, prospects: Prospecting.listProspects() });
  });

  router.patch('/api/prospects/:id', (req, res, { params, body }) => sendJson(res, 200, { prospect: Prospecting.updateProspect(params.id, body) }));
  router.delete('/api/prospects/:id', (req, res, { params }) => sendJson(res, 200, { deleted: store.remove('prospects', params.id) }));

  router.post('/api/prospects/scan', async (req, res, { body }) => {
    try {
      const result = await Prospecting.scanPublicSources(body || {});
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) });
    }
  });

  router.post('/api/prospects/parse-comments', (req, res, { body }) => {
    sendJson(res, 200, { candidates: Prospecting.parseComments(body.text || '', body.options || {}) });
  });

  router.post('/api/prospects/parse-csv', (req, res, { body }) => {
    const rows = Prospecting.parseCsv(body.text || '');
    sendJson(res, 200, { rows: rows.length, candidates: rows.map(Prospecting.mapCsvRow) });
  });

  // ----- facebook ---------------------------------------------------------
  router.get('/api/facebook/status', (req, res) => {
    const fb = getSettings().integrations.facebook;
    sendJson(res, 200, {
      configured: Facebook.isConfigured(),
      pageId: fb.pageId,
      lastSyncAt: fb.lastSyncAt,
      hasToken: Boolean(fb.accessToken),
    });
  });

  router.get('/api/facebook/forms', async (req, res) => {
    try {
      sendJson(res, 200, { forms: await Facebook.listForms() });
    } catch (err) {
      sendJson(res, 400, { error: String(err.message || err) });
    }
  });

  router.post('/api/facebook/sync', async (req, res, { body }) => {
    try {
      sendJson(res, 200, await Facebook.syncLeads(body || {}));
    } catch (err) {
      sendJson(res, 400, { error: String(err.message || err) });
    }
  });

  // ----- settings ---------------------------------------------------------
  router.get('/api/settings', (req, res) => sendJson(res, 200, { settings: publicSettings() }));

  router.patch('/api/settings', (req, res, { body }) => {
    // Never let a redacted placeholder overwrite a real secret.
    const clean = JSON.parse(JSON.stringify(body || {}));
    const tok = clean?.integrations?.facebook?.accessToken;
    if (tok && /^•+$/.test(tok)) delete clean.integrations.facebook.accessToken;
    const sec = clean?.integrations?.webhook?.secret;
    if (sec && /^•+$/.test(sec)) delete clean.integrations.webhook.secret;
    saveSettings(clean);
    sendJson(res, 200, { settings: publicSettings() });
  });

  // ----- data management --------------------------------------------------
  router.post('/api/backup', (req, res) => sendJson(res, 200, { path: store.backup() }));

  router.get('/api/export', (req, res) => {
    sendJson(res, 200, {
      exportedAt: nowIso(),
      leads: store.all('leads'),
      deals: store.all('deals'),
      payouts: store.all('payouts'),
      campaigns: store.all('campaigns'),
      posts: store.all('posts'),
      tasks: store.all('tasks'),
      activities: store.all('activities'),
      prospects: store.all('prospects'),
    });
  });

  router.get('/api/export/leads.csv', (req, res) => {
    const cols = ['id', 'createdAt', 'name', 'phone', 'email', 'language', 'city', 'zip', 'stage', 'source', 'score', 'temperature', 'timeline', 'financing', 'budgetMax', 'downPaymentPct', 'preApproved', 'nextFollowUpAt'];
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(',')];
    for (const l of store.all('leads')) lines.push(cols.map((c) => esc(l[c])).join(','));
    const csv = lines.join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads.csv"',
    });
    res.end(csv);
  });
}
