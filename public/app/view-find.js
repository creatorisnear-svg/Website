// Find Buyers: the prospecting worklist, public-feed scanner, comment/DM
// importer and CSV importer — the four ways leads actually enter the system.

import {
  el, api, toast, modal, confirmDialog, field, input, select, formValues,
  card, table, emptyState, clear, copyText, dateFmt, relTime,
} from './lib.js';

let tab = 'worklist';

export async function renderFind(root, ctx) {
  clear(root);

  const tabs = [
    ['worklist', '🎯 Prospecting worklist'],
    ['paste', '💬 Paste FB comments / DMs'],
    ['scan', '🔎 Scan public sources'],
    ['csv', '📄 Import CSV'],
    ['facebook', '📘 Facebook Lead Ads'],
  ];
  root.appendChild(el('div.tabs', {}, tabs.map(([id, label]) =>
    el(`button.tab${tab === id ? '.active' : ''}`, { text: label, onclick: () => { tab = id; renderFind(root, ctx); } }))));

  const panel = el('div');
  root.appendChild(panel);

  if (tab === 'worklist') await worklistPanel(panel, ctx);
  else if (tab === 'paste') pastePanel(panel, ctx);
  else if (tab === 'scan') scanPanel(panel, ctx);
  else if (tab === 'csv') csvPanel(panel, ctx);
  else await facebookPanel(panel, ctx);
}

// ---------------------------------------------------------------------------
// 1. Prospecting worklist
// ---------------------------------------------------------------------------

async function worklistPanel(root, ctx) {
  const { prospects } = await api.get('/api/prospects');

  root.appendChild(el('div.note', { html:
    '<strong>How this works:</strong> the system builds buyer-intent searches across Facebook, Marketplace, ' +
    'Craigslist, Reddit, Nextdoor and Google — in Spanish and English, targeted at Maricopa County and the ' +
    'City of Maricopa. Open each one, find people who are actually asking about buying, then add them as leads. ' +
    'Comment helpfully before you pitch; that is what turns a stranger into a reply.' }));

  root.appendChild(el('div.toolbar', {}, [
    el('button.btn.btn-primary', { text: prospects.length ? '↻ Add more searches' : '⚡ Build my worklist', onclick: () => buildForm(ctx) }),
    el('div.grow'),
    el('div.small.muted', { text: `${prospects.filter((p) => p.status === 'new').length} not worked yet · ${prospects.length} total` }),
  ]));

  if (!prospects.length) {
    root.appendChild(card(null, {}, emptyState('🎯', 'No searches yet',
      'Build a worklist and the system will generate dozens of targeted buyer-intent searches for you to work through.',
      el('button.btn.btn-primary', { text: '⚡ Build my worklist', onclick: () => buildForm(ctx) }))));
    return;
  }

  const byPlatform = {};
  for (const p of prospects) (byPlatform[p.platformLabel] ||= []).push(p);

  for (const [label, rows] of Object.entries(byPlatform)) {
    root.appendChild(card(label, { sub: rows[0].note, tight: true }, table(
      ['Search', 'Status', 'Leads found', ''],
      rows.map((p) => el('tr', {}, [
        el('td', {}, [el('span.strong', { text: p.query })]),
        el('td', {}, [el(`span.chip.${p.status === 'done' ? 'ok' : p.status === 'working' ? 'gold' : 'neutral'}`, { text: p.status })]),
        el('td', {}, [
          el('input', {
            type: 'number', value: String(p.leadsFound || 0), min: '0',
            style: { width: '68px', padding: '4px 8px' },
            onchange: async (e) => {
              await api.patch(`/api/prospects/${p.id}`, { leadsFound: Number(e.target.value), status: 'working' });
              toast('Saved');
            },
          }),
        ]),
        el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
          el('a.btn.btn-sm.btn-gold', { href: p.url, target: '_blank', rel: 'noopener', text: 'Open search ↗',
            onclick: () => api.patch(`/api/prospects/${p.id}`, { status: 'working' }) }),
          el('button.btn.btn-sm', {
            text: '✓ Done', style: { marginLeft: '6px' },
            onclick: async () => { await api.patch(`/api/prospects/${p.id}`, { status: 'done' }); toast('Marked done'); renderFind(root.parentElement, ctx); },
          }),
          el('button.btn.btn-sm.btn-danger', {
            text: '×', style: { marginLeft: '6px' },
            onclick: async () => { await api.del(`/api/prospects/${p.id}`); renderFind(root.parentElement, ctx); },
          }),
        ]),
      ])))));
  }
}

function buildForm(ctx) {
  const platformBoxes = ctx.meta.platforms.map((p) =>
    el('div.checkline', { style: { marginBottom: '7px' } }, [
      el('input', { type: 'checkbox', name: `p_${p.id}`, id: `p_${p.id}`, checked: true }),
      el('label', { for: `p_${p.id}`, text: p.label, style: { margin: 0 } }),
    ]));

  const body = el('div', {}, [
    el('p.small.muted', { text: 'Pick where to search. Each platform gets its own set of Spanish and English buyer-intent queries, city-targeted to your market.' }),
    ...platformBoxes,
    el('div.grid-2', { style: { marginTop: '14px' } }, [
      field('Searches per platform', input('perPlatform', { type: 'number', value: '8', min: '1', max: '30' })),
      field('Languages', select('languages', [
        { value: 'both', label: 'Spanish + English' }, { value: 'es', label: 'Spanish only' }, { value: 'en', label: 'English only' },
      ], 'both')),
    ]),
  ]);

  modal({
    title: 'Build prospecting worklist',
    body,
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Build worklist',
        variant: 'primary',
        onClick: async (close) => {
          const v = formValues(body);
          const platforms = ctx.meta.platforms.filter((p) => v[`p_${p.id}`]).map((p) => p.id);
          if (!platforms.length) return toast('Pick at least one platform', 'err');
          const r = await api.post('/api/prospects/build', {
            platforms,
            perPlatform: Number(v.perPlatform) || 8,
            languages: v.languages === 'both' ? ['es', 'en'] : [v.languages],
          });
          toast(`${r.created} searches added`);
          close();
          ctx.refresh();
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 2. Paste comments / DMs
// ---------------------------------------------------------------------------

function pastePanel(root, ctx) {
  const box = el('textarea', {
    rows: 12, class: 'mono',
    placeholder:
      'Paste comments straight off your Facebook post, one per line. For example:\n\n' +
      'Maria Lopez: me interesa, cuánto de enganche?\n' +
      'Jose Ramirez — interested 602-555-1234\n' +
      'Carlos Mendoza: tengo ITIN, quiero comprar ahora',
  });
  const cityInput = select('defaultCity', [{ value: '', label: '— none —' }, ...ctx.meta.cities.map((c) => ({ value: c.name, label: c.name }))], '');
  const sourceInput = select('source', ctx.meta.sources.map((s) => ({ value: s.id, label: s.label })), 'facebook_organic');
  const detailInput = input('sourceDetail', { placeholder: 'e.g. ITIN post Sept 5' });
  const results = el('div');

  root.appendChild(el('div.note', { html:
    '<strong>The fastest lead source you already have.</strong> Every comment on your posts is a warm lead. ' +
    'Select the comments on Facebook, copy, and paste them here — names, phone numbers, ITIN mentions and ' +
    '"I want to buy now" signals are pulled out automatically. Nothing is saved until you review it.' }));

  root.appendChild(card('Paste comments or DMs', {
    actions: el('button.btn.btn-primary', {
      text: 'Extract leads',
      onclick: async () => {
        if (!box.value.trim()) return toast('Paste some comments first', 'err');
        const r = await api.post('/api/prospects/parse-comments', {
          text: box.value,
          options: { defaultCity: cityInput.value, source: sourceInput.value, sourceDetail: detailInput.value },
        });
        showCandidates(results, r.candidates, ctx);
      },
    }),
  }, el('div', {}, [
    el('div.grid-3', {}, [
      field('Default city', cityInput),
      field('Source', sourceInput),
      field('Which post?', detailInput),
    ]),
    box,
  ])));

  root.appendChild(results);
}

/** Shared review-and-import table used by the paste, scan and CSV importers. */
function showCandidates(root, candidates, ctx) {
  clear(root);
  if (!candidates.length) {
    root.appendChild(card(null, {}, emptyState('🤔', 'Nothing found',
      'No names, phone numbers or buying signals were detected. Try pasting the raw comment text including names.')));
    return;
  }

  const checks = new Map();
  const rows = candidates.map((c, i) => {
    const cb = el('input', { type: 'checkbox', checked: c.confidence >= 40 });
    checks.set(i, cb);
    return el('tr', {}, [
      el('td', {}, [cb]),
      el('td', {}, [el('input', { value: c.name || '', style: { minWidth: '130px' }, onchange: (e) => { c.name = e.target.value; } })]),
      el('td', {}, [el('input', { value: c.phone || '', style: { minWidth: '120px' }, onchange: (e) => { c.phone = e.target.value; } })]),
      el('td', {}, [el('input', { value: c.email || '', style: { minWidth: '140px' }, onchange: (e) => { c.email = e.target.value; } })]),
      el('td.small.muted', { text: (c.message || c.snippet || '').slice(0, 70) }),
      el('td', {}, [
        c.financing === 'itin' ? el('span.chip.gold', { text: 'ITIN' }) : null,
        c.timeline === 'now' ? el('span.chip.hot', { text: 'NOW' }) : null,
      ]),
      el('td', {}, [el(`span.chip.${c.confidence >= 60 ? 'ok' : c.confidence >= 35 ? 'gold' : 'neutral'}`, { text: `${c.confidence}%` })]),
    ]);
  });

  root.appendChild(card(`Review ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`, {
    sub: 'Uncheck anyone who is not a real buyer. Edit names and numbers before importing.',
    actions: el('button.btn.btn-gold', {
      text: 'Import selected',
      onclick: async (e) => {
        const chosen = candidates.filter((_, i) => checks.get(i).checked);
        if (!chosen.length) return toast('Nothing selected', 'err');
        e.target.disabled = true;
        const r = await api.post('/api/leads/bulk', { leads: chosen });
        toast(`${r.imported} imported${r.duplicates ? `, ${r.duplicates} merged as duplicates` : ''}`);
        ctx.refresh();
        ctx.go('leads');
      },
    }),
    tight: true,
  }, table(['', 'Name', 'Phone', 'Email', 'Message', 'Signals', 'Confidence'], rows)));
}

// ---------------------------------------------------------------------------
// 3. Public source scanner
// ---------------------------------------------------------------------------

function scanPanel(root, ctx) {
  const results = el('div');
  const queryBox = el('textarea', {
    rows: 4,
    placeholder: 'One search phrase per line. Leave empty to use the built-in buyer-intent phrases.',
  });

  root.appendChild(el('div.note.warn', { html:
    '<strong>What this does:</strong> searches genuinely public, machine-readable feeds — Craigslist "housing wanted" ' +
    'and Reddit — for people in the Phoenix area talking about buying a home. It does <strong>not</strong> scrape ' +
    'Facebook: that violates Meta\'s terms and gets accounts banned, which would cost you your best channel. ' +
    'For Facebook, use the worklist, the comment importer, or Lead Ads.' }));

  root.appendChild(card('Scan public sources', {
    actions: el('button.btn.btn-primary', {
      text: '🔎 Run scan',
      onclick: async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Scanning…';
        clear(results);
        try {
          const queries = queryBox.value.split('\n').map((s) => s.trim()).filter(Boolean);
          const r = await api.post('/api/prospects/scan', { queries: queries.length ? queries : null });
          showScanResults(results, r, ctx);
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          e.target.disabled = false;
          e.target.textContent = '🔎 Run scan';
        }
      },
    }),
  }, queryBox));

  root.appendChild(results);
}

function showScanResults(root, data, ctx) {
  clear(root);
  if (data.errors?.length) {
    root.appendChild(el('div.note.warn', { html:
      `${data.errors.length} source${data.errors.length === 1 ? '' : 's'} could not be reached ` +
      `(they rate-limit automated requests). Results below are from the sources that responded.` }));
  }
  if (!data.results.length) {
    root.appendChild(card(null, {}, emptyState('🔍', 'No strong signals found',
      'Try different phrases, or work the prospecting worklist instead — Facebook is where your audience actually is.')));
    return;
  }

  root.appendChild(card(`${data.results.length} buyer-intent posts found`, {
    sub: 'Open each one and reply genuinely. Add the person as a lead once they engage.',
    tight: true,
  }, table(
    ['Signal', 'Source', 'Post', 'Posted', ''],
    data.results.map((r) => el('tr', {}, [
      el('td', {}, [el(`span.chip.${r.signal >= 60 ? 'hot' : r.signal >= 40 ? 'warm' : 'neutral'}`, { text: String(r.signal) })]),
      el('td.small.muted', { text: r.platform }),
      el('td', {}, [
        el('div.strong', { text: (r.title || '').slice(0, 90) }),
        el('div.small.muted', { text: (r.snippet || '').slice(0, 110) }),
      ]),
      el('td.small.muted', { text: r.postedAt ? relTime(r.postedAt) : '—' }),
      el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
        r.url ? el('a.btn.btn-sm', { href: r.url, target: '_blank', rel: 'noopener', text: 'Open ↗' }) : null,
        el('button.btn.btn-sm.btn-primary', {
          text: '+ Lead', style: { marginLeft: '6px' },
          onclick: async () => {
            await api.post('/api/leads', {
              name: r.author || (r.title || '').slice(0, 40),
              message: `${r.title}\n${r.snippet}\n${r.url}`,
              source: 'prospecting',
              sourceDetail: r.platform,
              language: /[áéíóúñ¿]/i.test(`${r.title}${r.snippet}`) ? 'es' : 'en',
            });
            toast('Added as a lead');
            ctx.refresh();
          },
        }),
      ]),
    ])),
  )));
}

// ---------------------------------------------------------------------------
// 4. CSV import
// ---------------------------------------------------------------------------

function csvPanel(root, ctx) {
  const results = el('div');
  const box = el('textarea', { rows: 10, class: 'mono', placeholder: 'name,phone,email,city,budget\nMaria Lopez,602-555-0134,,Avondale,380000' });
  const file = el('input', { type: 'file', accept: '.csv,text/csv' });
  file.addEventListener('change', () => {
    const f = file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { box.value = reader.result; };
    reader.readAsText(f);
  });

  root.appendChild(el('div.note', { html:
    'Import leads from anywhere — an old spreadsheet, a Facebook Lead Ads CSV export, an open-house sign-in sheet. ' +
    'Column names in English or Spanish are both recognised (name/nombre, phone/telefono, city/ciudad…).' }));

  root.appendChild(card('Import CSV', {
    actions: el('button.btn.btn-primary', {
      text: 'Parse',
      onclick: async () => {
        if (!box.value.trim()) return toast('Paste CSV or choose a file', 'err');
        const r = await api.post('/api/prospects/parse-csv', { text: box.value });
        showCandidates(results, r.candidates.map((c) => ({ ...c, confidence: c.name || c.phone ? 70 : 30 })), ctx);
      },
    }),
  }, el('div', {}, [field('Choose a .csv file', file), el('div.small.muted', { text: '…or paste the contents below', style: { margin: '4px 0 8px' } }), box])));

  root.appendChild(results);
}

// ---------------------------------------------------------------------------
// 5. Facebook Lead Ads
// ---------------------------------------------------------------------------

async function facebookPanel(root, ctx) {
  const status = await api.get('/api/facebook/status');

  root.appendChild(el('div.note', { html:
    '<strong>The official way to pull leads from Facebook.</strong> When you run Lead Ads on the Page, this ' +
    'imports every submission automatically — name, phone, budget, timeline — and scores it. It uses Meta\'s ' +
    'Graph API with your own Page token, so nothing here risks the account.' }));

  if (!status.configured) {
    root.appendChild(card('Not connected yet', { sub: 'Five minutes of setup, once' }, el('div', {}, [
      el('div.pre', { text:
        '1. Go to developers.facebook.com and create an app (type: Business).\n' +
        '2. Add the "Marketing API" and "Webhooks" products.\n' +
        '3. Request permissions: leads_retrieval, pages_show_list, pages_read_engagement.\n' +
        '4. In Graph API Explorer, select the Page and generate a Page access token.\n' +
        '5. Exchange it for a long-lived token (60 days) and paste it into Settings.\n' +
        '6. Copy the Page ID from your Page > About > Page transparency.' }),
      el('button.btn.btn-primary', { text: 'Open Settings →', style: { marginTop: '14px' }, onclick: () => ctx.go('settings') }),
    ])));
    return;
  }

  root.appendChild(card('Facebook Lead Ads', {
    sub: `Page ${status.pageId} · last synced ${status.lastSyncAt ? relTime(status.lastSyncAt) : 'never'}`,
    actions: [
      el('button.btn', {
        text: 'List forms',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await api.get('/api/facebook/forms');
            modal({
              title: 'Lead forms on your Page',
              body: r.forms.length
                ? table(['Form', 'Status', { label: 'Leads', num: true }], r.forms.map((f) => el('tr', {}, [
                    el('td', { text: f.name || f.id }),
                    el('td', { text: f.status || '—' }),
                    el('td.num', { text: String(f.leads_count ?? '—') }),
                  ])))
                : el('p', { text: 'No lead forms found on this Page yet. Create one from Meta Ads Manager.' }),
              buttons: [{ label: 'Close' }],
            });
          } catch (err) { toast(err.message, 'err'); } finally { e.target.disabled = false; }
        },
      }),
      el('button.btn.btn-primary', {
        text: '⬇ Sync leads now',
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Syncing…';
          try {
            const r = await api.post('/api/facebook/sync', {});
            toast(`${r.imported} new lead${r.imported === 1 ? '' : 's'}${r.duplicates ? `, ${r.duplicates} already known` : ''}`);
            ctx.refresh();
          } catch (err) { toast(err.message, 'err'); } finally {
            e.target.disabled = false;
            e.target.textContent = '⬇ Sync leads now';
          }
        },
      }),
    ],
  }, el('p.small.muted', { text: 'Leads are de-duplicated against everyone already in the system, so syncing twice is safe.' })));
}
