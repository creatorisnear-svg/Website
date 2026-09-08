// App shell: navigation, shared context, and view dispatch.

import { el, $, api, toast, clear, phoneFmt } from './lib.js';
import { renderRevenue, renderDeals } from './view-revenue.js';
import { renderLeads, renderPipeline, openLeadDrawer, leadForm } from './view-leads.js';
import { renderFind } from './view-find.js';
import { renderContent, renderCampaigns } from './view-content.js';
import { renderAutomation } from './view-automation.js';
import { renderSettings } from './view-settings.js';

const VIEWS = [
  { id: 'revenue',   icon: '💵', label: 'Revenue',     title: 'Revenue', sub: 'What you have earned and what is coming', render: renderRevenue, group: 'Money' },
  { id: 'deals',     icon: '🤝', label: 'Deals',       title: 'Deals & commissions', sub: 'Every referral you have sent and what it paid', render: renderDeals, group: 'Money' },
  { id: 'find',      icon: '🎯', label: 'Find Buyers', title: 'Find buyers', sub: 'Bring new people into the pipeline', render: renderFind, group: 'Growth' },
  { id: 'content',   icon: '✍️', label: 'Content',     title: 'Content studio', sub: 'Bilingual posts that generate comments', render: renderContent, group: 'Growth' },
  { id: 'campaigns', icon: '📣', label: 'Campaigns',   title: 'Campaigns', sub: 'Spend in, leads and closings out', render: renderCampaigns, group: 'Growth' },
  { id: 'leads',     icon: '👥', label: 'Leads',       title: 'Leads', sub: 'Everyone in the system, hottest first', render: renderLeads, group: 'Pipeline' },
  { id: 'pipeline',  icon: '📊', label: 'Pipeline',    title: 'Pipeline', sub: 'Where every buyer stands today', render: renderPipeline, group: 'Pipeline' },
  { id: 'automation', icon: '🤖', label: 'Automation', title: 'Automation', sub: 'Claude prepares the work — you press send', render: renderAutomation, group: 'System' },
  { id: 'settings',  icon: '⚙️', label: 'Settings',    title: 'Settings', sub: 'Commission split, goals and integrations', render: renderSettings, group: 'System' },
];

const state = {
  view: 'revenue',
  meta: null,
  settings: null,
  cache: {},
  drawerHandle: null,
};

const ctx = {
  get meta() { return state.meta; },
  get settings() { return state.settings; },
  cache: state.cache,
  go,
  refresh: () => render(true),
  reloadSettings: async () => {
    state.settings = (await api.get('/api/settings')).settings;
    paintBrand();
  },
  openLead: async (id) => {
    try {
      closeDrawer();
      state.drawerHandle = await openLeadDrawer(id, ctx);
    } catch (err) { toast(err.message, 'err'); }
  },
  reopenLead: async (id) => { await ctx.openLead(id); await render(true); },
  closeDrawer,
};

function closeDrawer() {
  if (state.drawerHandle) {
    state.drawerHandle.close();
    state.drawerHandle = null;
  }
}

function go(id) {
  if (!VIEWS.some((v) => v.id === id)) return;
  state.view = id;
  location.hash = id;
  render();
}

function paintNav(counts = {}) {
  const nav = clear($('#nav'));
  let lastGroup = null;
  for (const v of VIEWS) {
    if (v.group !== lastGroup) {
      nav.appendChild(el('div.nav-sep', { text: v.group }));
      lastGroup = v.group;
    }
    const badgeValue = counts[v.id];
    nav.appendChild(el(`button.nav-item${state.view === v.id ? '.active' : ''}`, {
      onclick: () => go(v.id),
      title: v.label,
    }, [
      el('span.ic', { text: v.icon }),
      el('span', { text: v.label }),
      badgeValue ? el(`span.badge${v.id === 'leads' ? '.quiet' : ''}`, { text: String(badgeValue) }) : null,
    ]));
  }
}

function paintBrand() {
  const a = state.settings?.agent;
  if (!a) return;
  $('#brandAgent').innerHTML = `${a.name}<br>${phoneFmt(a.phone)}`;
}

async function render(silent = false) {
  const view = VIEWS.find((v) => v.id === state.view) || VIEWS[0];
  $('#pageTitle').textContent = view.title;
  $('#pageSub').textContent = view.sub;

  const root = $('#view');
  if (!silent) clear(root);

  // Badges: overdue follow-ups and unworked prospecting searches.
  let counts = {};
  try {
    const [dash, prospects, automation] = await Promise.all([
      api.get('/api/dashboard'),
      api.get('/api/prospects?status=new').catch(() => ({ prospects: [] })),
      api.get('/api/automation/token').catch(() => ({ status: null })),
    ]);
    counts = {
      leads: dash.tasks.overdue || 0,
      find: prospects.prospects?.length || 0,
      deals: dash.revenue.counts.pending || 0,
      // Messages Claude staged that are waiting on a human to press send.
      automation: automation.status?.awaitingSend || 0,
    };
  } catch { /* badges are cosmetic */ }
  paintNav(counts);

  try {
    await view.render(root, ctx);
  } catch (err) {
    clear(root);
    root.appendChild(el('div.note.warn', { html: `<strong>Could not load this view.</strong><br>${err.message}` }));
    console.error(err);
  }
}

async function boot() {
  try {
    const [meta, settings] = await Promise.all([api.get('/api/meta'), api.get('/api/settings')]);
    state.meta = meta;
    state.settings = settings.settings;
  } catch (err) {
    $('#view').innerHTML = `<div class="note warn"><strong>Cannot reach the server.</strong><br>${err.message}<br><br>Make sure it is running: <code>npm start</code></div>`;
    return;
  }
  paintBrand();

  const hash = location.hash.replace('#', '');
  if (VIEWS.some((v) => v.id === hash)) state.view = hash;

  $('#refreshBtn').addEventListener('click', () => render());
  $('#quickAddBtn').addEventListener('click', () => leadForm(ctx));
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h && h !== state.view && VIEWS.some((v) => v.id === h)) { state.view = h; render(); }
  });

  // Keyboard: 1-8 jump between views, "/" focuses search on the Leads tab.
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= VIEWS.length) go(VIEWS[n - 1].id);
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); leadForm(ctx); }
  });

  await render();
}

boot();
