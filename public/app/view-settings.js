// Settings: agent identity, commission split, goals, integrations, data tools.

import {
  el, api, money, toast, modal, field, input, select, formValues, card, clear, copyText, relTime,
} from './lib.js';

export async function renderSettings(root, ctx) {
  clear(root);
  const { settings } = await api.get('/api/settings');
  const s = settings;

  const save = async (patch, message = 'Saved') => {
    await api.patch('/api/settings', patch);
    toast(message);
    await ctx.reloadSettings();
  };

  // ---- commission split (the money rules) -------------------------------
  const comm = el('div', {}, [
    el('div.grid-3', {}, [
      field('Agent commission %', input('agentCommissionPct', { type: 'number', step: '0.05', value: String(s.commissions.agentCommissionPct) }),
        "What the agent earns on a closing (buyer side is typically 2.5-3%)"),
      field('Your referral share %', input('referralPct', { type: 'number', step: '1', value: String(s.commissions.referralPct) }),
        'Your cut of the agent commission (25% is the industry standard)'),
      field('Flat bonus per close', input('flatBonusPerClose', { type: 'number', step: '50', value: String(s.commissions.flatBonusPerClose) }),
        'Optional extra on top of the percentage'),
    ]),
    el('div.note.ok', { id: 'commPreview' }),
  ]);
  const previewComm = () => {
    const v = formValues(comm);
    const ex = (price) => price * (Number(v.agentCommissionPct) / 100) * (Number(v.referralPct) / 100) + Number(v.flatBonusPerClose || 0);
    comm.querySelector('#commPreview').innerHTML =
      `Your fee on a <strong>${money(350000)}</strong> home: <strong>${money(ex(350000))}</strong> &nbsp;·&nbsp; ` +
      `on <strong>${money(500000)}</strong>: <strong>${money(ex(500000))}</strong> &nbsp;·&nbsp; ` +
      `on <strong>${money(750000)}</strong>: <strong>${money(ex(750000))}</strong>`;
  };
  comm.addEventListener('input', previewComm);
  previewComm();

  root.appendChild(card('Your commission split', {
    sub: 'This drives every dollar figure in the Revenue tab. Set it to match your agreement with the agent.',
    actions: el('button.btn.btn-primary', { text: 'Save', onclick: () => {
      const v = formValues(comm);
      save({ commissions: {
        agentCommissionPct: Number(v.agentCommissionPct),
        referralPct: Number(v.referralPct),
        flatBonusPerClose: Number(v.flatBonusPerClose),
      } }, 'Commission split saved');
    } }),
  }, comm));

  // ---- goals ------------------------------------------------------------
  const goals = el('div.grid-2', {}, [
    field('Monthly revenue goal', input('monthlyRevenue', { type: 'number', step: '250', value: String(s.goals.monthlyRevenue) })),
    field('New leads per month', input('monthlyLeads', { type: 'number', step: '5', value: String(s.goals.monthlyLeads) })),
    field('Qualified leads per month', input('monthlyQualified', { type: 'number', value: String(s.goals.monthlyQualified) })),
    field('Closings per month', input('monthlyClosings', { type: 'number', value: String(s.goals.monthlyClosings) })),
  ]);
  root.appendChild(card('Goals', {
    sub: 'The progress bar on the Revenue tab tracks against these',
    actions: el('button.btn.btn-primary', { text: 'Save', onclick: () => {
      const v = formValues(goals);
      save({ goals: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)])) }, 'Goals saved');
    } }),
  }, goals));

  // ---- agent details ----------------------------------------------------
  const agent = el('div', {}, [
    el('div.grid-2', {}, [
      field('Agent name', input('name', { value: s.agent.name })),
      field('Phone', input('phone', { value: s.agent.phone })),
    ]),
    el('div.grid-2', {}, [
      field('Business name', input('business', { value: s.agent.business })),
      field('Email', input('email', { value: s.agent.email })),
    ]),
    el('div.grid-2', {}, [
      field('Brokerage', input('brokerage', { value: s.agent.brokerage })),
      field('License #', input('licenseNumber', { value: s.agent.licenseNumber })),
    ]),
    field('Facebook Page URL', input('facebookUrl', { value: s.agent.facebookUrl, placeholder: 'https://facebook.com/…' })),
  ]);
  root.appendChild(card('Agent details', {
    sub: 'Used in every generated post, script and landing page',
    actions: el('button.btn.btn-primary', { text: 'Save', onclick: () => save({ agent: formValues(agent) }, 'Agent details saved') }),
  }, agent));

  // ---- public URL -------------------------------------------------------
  const site = el('div', {}, [
    field('Public base URL', input('baseUrl', { value: s.publicSite.baseUrl, placeholder: 'https://your-tunnel.trycloudflare.com' }),
      'Leave blank to use localhost. Set this when you expose the landing page publicly so tracked links work in real posts.'),
    el('div.pre', { text:
      'Free ways to make the landing page public from your PC:\n\n' +
      '  Cloudflare Tunnel:  cloudflared tunnel --url http://localhost:' + s.server.port + '\n' +
      '  ngrok:              ngrok http ' + s.server.port + '\n\n' +
      'Copy the https:// URL it prints into the field above.\n' +
      'For something permanent, host the landing page on a real domain and point its\n' +
      'form at POST /api/public/lead on this machine.' }),
  ]);
  root.appendChild(card('Public landing page', {
    sub: 'Where your Facebook posts send people',
    actions: el('button.btn.btn-primary', { text: 'Save', onclick: () => save({ publicSite: { baseUrl: formValues(site).baseUrl } }, 'Base URL saved') }),
  }, site));

  // ---- facebook ---------------------------------------------------------
  const fb = el('div', {}, [
    el('div.checkline', { style: { marginBottom: '12px' } }, [
      el('input', { type: 'checkbox', name: 'enabled', id: 'fb_enabled', checked: s.integrations.facebook.enabled }),
      el('label', { for: 'fb_enabled', text: 'Enable Facebook Lead Ads sync', style: { margin: 0 } }),
    ]),
    el('div.grid-2', {}, [
      field('Page ID', input('pageId', { value: s.integrations.facebook.pageId })),
      field('Page access token', input('accessToken', {
        type: 'password', value: s.integrations.facebook.accessToken,
        placeholder: s.integrations.facebook.hasToken ? '(saved)' : 'EAAG…',
      }), 'Stored only on this computer, in data/settings.json'),
    ]),
    s.integrations.facebook.lastSyncAt
      ? el('div.small.muted', { text: `Last synced ${relTime(s.integrations.facebook.lastSyncAt)}` }) : null,
  ]);
  root.appendChild(card('Facebook Lead Ads', {
    sub: 'Official Graph API connection — no scraping',
    actions: el('button.btn.btn-primary', { text: 'Save', onclick: () => {
      const v = formValues(fb);
      const patch = { integrations: { facebook: { enabled: v.enabled, pageId: v.pageId } } };
      if (v.accessToken && !/^•+$/.test(v.accessToken)) patch.integrations.facebook.accessToken = v.accessToken;
      save(patch, 'Facebook settings saved');
    } }),
  }, fb));

  // ---- data -------------------------------------------------------------
  root.appendChild(card('Your data', {
    sub: 'Everything lives on this computer — nothing is uploaded anywhere',
  }, el('div', {}, [
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      el('button.btn', { text: '💾 Back up now', onclick: async () => {
        const r = await api.post('/api/backup');
        toast('Backup saved');
        modal({ title: 'Backup created', body: el('div.pre', { text: r.path }), buttons: [{ label: 'Close' }] });
      } }),
      el('a.btn', { href: '/api/export', download: 'maricopa-buyer-engine-export.json', text: '⬇ Export everything (JSON)' }),
      el('a.btn', { href: '/api/export/leads.csv', text: '⬇ Export leads (CSV)' }),
    ]),
    el('p.small.muted', { style: { marginTop: '12px' }, html:
      'Data files: <code>data/*.json</code> · Backups: <code>backups/</code> (also written automatically ' +
      'every time you stop the server with Ctrl+C). To move to a new computer, copy the whole folder.' }),
  ])));

  // ---- server -----------------------------------------------------------
  root.appendChild(card('Server', {}, el('div', {}, [
    el('div.pre', { text:
      `Dashboard   http://${s.server.host}:${s.server.port}/app/\n` +
      `Landing ES  http://${s.server.host}:${s.server.port}/l/itin\n` +
      `Landing EN  http://${s.server.host}:${s.server.port}/l/itin?lang=en\n\n` +
      `Change the port:   PORT=5000 npm start\n` +
      `Allow other devices on your wifi:   HOST=0.0.0.0 npm start` }),
    el('p.small.muted', { style: { marginTop: '10px' }, text:
      'The dashboard is bound to 127.0.0.1 by default, so only this computer can open it. That is deliberate — it holds client phone numbers.' }),
  ])));
}
