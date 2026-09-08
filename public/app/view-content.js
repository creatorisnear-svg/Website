// Content studio + campaigns: generate bilingual posts with tracked links, plan
// the week, and measure which posts actually produced paying leads.

import {
  el, api, money, dateFmt, relTime, toast, modal, confirmDialog, field, input, select,
  formValues, card, table, emptyState, clear, copyText,
} from './lib.js';

let tab = 'studio';

export async function renderContent(root, ctx) {
  clear(root);
  const tabs = [['studio', '✍️ Post generator'], ['calendar', '📅 Weekly plan'], ['library', '📚 Saved posts']];
  root.appendChild(el('div.tabs', {}, tabs.map(([id, label]) =>
    el(`button.tab${tab === id ? '.active' : ''}`, { text: label, onclick: () => { tab = id; renderContent(root, ctx); } }))));

  const panel = el('div');
  root.appendChild(panel);
  if (tab === 'studio') await studioPanel(panel, ctx);
  else if (tab === 'calendar') await calendarPanel(panel, ctx);
  else await libraryPanel(panel, ctx);
}

async function studioPanel(root, ctx) {
  const { campaigns } = await api.get('/api/campaigns');
  const out = el('div');

  const typeSel = select('type', ctx.meta.postTypes.map((t) => ({ value: t.id, label: t.label })), 'itin');
  const citySel = select('city', ctx.meta.cities.filter((c) => c.tier === 'core').map((c) => ({ value: c.name, label: c.name })), 'Avondale');
  const campSel = select('campaignId', [{ value: '', label: '— no campaign —' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))], '');

  const listingFields = el('div.grid-3', {}, [
    field('Price', input('price', { type: 'number', step: '5000', placeholder: '450000' })),
    field('Beds', input('beds', { type: 'number', placeholder: '4' })),
    field('Baths', input('baths', { type: 'number', step: '0.5', placeholder: '2' })),
  ]);
  const listingFields2 = el('div.grid-2', {}, [
    field('Square feet', input('sqft', { type: 'number', placeholder: '1850' })),
    field('Address (open house only)', input('address', { placeholder: '1234 W Palm Ln' })),
  ]);
  const hookField = field('Custom hook (optional)', input('hook', { placeholder: 'Cocina abierta, patio grande…' }));

  const form = el('div', {}, [
    el('div.grid-3', {}, [field('Post type', typeSel), field('City', citySel), field('Campaign', campSel)]),
    listingFields, listingFields2, hookField,
    el('div.checkline', { style: { margin: '2px 0 10px' } }, [
      el('input', { type: 'checkbox', name: 'withLink', id: 'f_withLink', checked: true }),
      el('label', { for: 'f_withLink', text: 'Include a tracked link (so you can see which post brought the lead)', style: { margin: 0 } }),
    ]),
  ]);

  const generate = async () => {
    const v = formValues(form);
    const vars = {};
    for (const k of ['price', 'beds', 'baths', 'sqft', 'address', 'hook']) if (v[k]) vars[k] = v[k];
    vars.city = v.city;

    // A tracked link needs a saved post, so save first, then generate with it.
    let trackUrl = '';
    let post = null;
    if (v.withLink) {
      post = (await api.post('/api/posts', {
        campaignId: v.campaignId || null, type: v.type, city: v.city,
        language: 'es', landing: v.type === 'itin' ? 'itin' : 'buyer', status: 'draft',
      })).post;
      trackUrl = post.trackUrl;
    }

    const r = await api.post('/api/content/generate', { type: v.type, vars, trackUrl });
    if (post) await api.patch(`/api/posts/${post.id}`, { body: r.es, bodyEn: r.en });
    showPost(out, r, post, ctx);
  };

  root.appendChild(el('div.note', { html:
    'Posts are written in the style that already works on your Page: emoji header, the beds/baths/sqft line, ' +
    'the phone number, and both languages. Generate, tweak, copy, post. The tracked link tells you which post ' +
    'produced which lead — and the Revenue tab turns that into dollars.' }));

  root.appendChild(card('Generate a post', {
    actions: el('button.btn.btn-primary', { text: '✨ Generate', onclick: async (e) => {
      e.target.disabled = true;
      try { await generate(); } catch (err) { toast(err.message, 'err'); } finally { e.target.disabled = false; }
    } }),
  }, form));

  root.appendChild(out);
  await generate();
}

function showPost(root, r, post, ctx) {
  clear(root);
  const mk = (label, text, langNote) => {
    const ta = el('textarea', { rows: 14 }, [text]);
    return card(label, {
      sub: langNote,
      actions: [
        el('button.btn.btn-sm.btn-gold', { text: '📋 Copy', onclick: () => copyText(ta.value, 'Post copied — paste it into Facebook') }),
      ],
    }, ta);
  };

  root.appendChild(el('div.split', {}, [
    mk('Español', r.es, 'Post this one first — it is your primary audience'),
    mk('English', r.en, 'Post as a second version, or in the comments'),
  ]));

  if (post) {
    root.appendChild(card('Tracked link', { sub: 'Put this in the post. Every click and lead is attributed to it.' },
      el('div', {}, [
        el('div.copybox', {}, [
          el('input', { value: post.trackUrl, readonly: true }),
        ]),
        el('div', { style: { marginTop: '10px', display: 'flex', gap: '8px' } }, [
          el('button.btn.btn-sm', { text: 'Copy link', onclick: () => copyText(post.trackUrl) }),
          el('a.btn.btn-sm', { href: post.trackUrl, target: '_blank', rel: 'noopener', text: 'Preview landing page ↗' }),
          el('button.btn.btn-sm.btn-primary', {
            text: 'Mark as posted',
            onclick: async () => { await api.patch(`/api/posts/${post.id}`, { status: 'posted' }); toast('Marked posted'); },
          }),
        ]),
        el('p.small.muted', { style: { marginTop: '10px' }, html:
          'Only reachable from your PC by default. To use it in a real Facebook post, set a public ' +
          '<strong>Base URL</strong> in Settings (a free Cloudflare Tunnel or ngrok works), or point the link at your own website.' }),
      ])));
  }
}

async function calendarPanel(root, ctx) {
  const { slots, plan } = await api.get('/api/content/schedule?count=7');

  root.appendChild(el('div.note', { html:
    '<strong>Consistency beats brilliance.</strong> One post a day, at the times below, will out-perform ' +
    'five posts in one afternoon. Listings sell — but the education and question posts are what generate ' +
    'the comments that become leads.' }));

  root.appendChild(card('Your posting week', { sub: 'A balanced mix so the Page never looks like an ad feed', tight: true },
    table(['Day', 'Post type', 'Why', 'Suggested time', ''],
      plan.map((p, i) => {
        const type = ctx.meta.postTypes.find((t) => t.id === p.type);
        return el('tr', {}, [
          el('td', {}, [el('span.strong', { text: p.day })]),
          el('td', {}, [el('span.chip.neutral', { text: type?.label || p.type })]),
          el('td.small.muted', { text: p.note }),
          el('td.small', { text: dateFmt(slots[i], { time: true }) }),
          el('td', { style: { textAlign: 'right' } }, [
            el('button.btn.btn-sm', { text: 'Generate →', onclick: () => { tab = 'studio'; renderContent(root.parentElement, ctx); } }),
          ]),
        ]);
      }))));

  root.appendChild(card('Best times to post in Phoenix', {}, el('div.pre', { text:
    '07:30  Before work — commuters checking their phone\n' +
    '12:15  Lunch break — highest comment rate on Spanish-language pages\n' +
    '18:30  After dinner — best for listing photos and video walkthroughs\n' +
    '20:30  Evening scroll — strong for question and testimonial posts\n\n' +
    'Weekends: Saturday morning is the single best slot for open-house posts.' })));
}

async function libraryPanel(root, ctx) {
  const { posts } = await api.get('/api/posts');
  if (!posts.length) {
    root.appendChild(card(null, {}, emptyState('📚', 'No saved posts yet',
      'Generated posts with tracked links are saved here so you can see how each one performed.')));
    return;
  }
  root.appendChild(card('Saved posts', { sub: `${posts.length} total`, tight: true }, table(
    ['Type', 'City', 'Status', { label: 'Clicks', num: true }, 'Tracked link', 'Created', ''],
    posts.map((p) => el('tr', {}, [
      el('td', {}, [el('span.chip.neutral', { text: ctx.meta.postTypes.find((t) => t.id === p.type)?.label || p.type })]),
      el('td', { text: p.city || '—' }),
      el('td', {}, [el(`span.chip.${p.status === 'posted' ? 'ok' : 'neutral'}`, { text: p.status })]),
      el('td.num', { text: String(p.clicks || 0) }),
      el('td.small.muted', { text: p.trackCode }),
      el('td.small.muted', { text: relTime(p.createdAt) }),
      el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
        el('button.btn.btn-sm', { text: 'View', onclick: () => modal({
          title: 'Saved post',
          body: el('div', {}, [
            el('div.pre', { text: p.body || '(empty)' }),
            p.bodyEn ? el('div.pre', { text: p.bodyEn, style: { marginTop: '10px' } }) : null,
          ]),
          buttons: [{ label: 'Copy Spanish', onClick: (c) => { copyText(p.body); c(); } }, { label: 'Close' }],
        }) }),
        el('button.btn.btn-sm.btn-danger', { text: '×', style: { marginLeft: '6px' },
          onclick: async () => { await api.del(`/api/posts/${p.id}`); toast('Deleted'); renderContent(root.parentElement, ctx); } }),
      ]),
    ])))));
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function renderCampaigns(root, ctx) {
  clear(root);
  const { campaigns } = await api.get('/api/campaigns');

  root.appendChild(el('div.toolbar', {}, [
    el('button.btn.btn-primary', { text: '+ New campaign', onclick: () => campaignForm(ctx) }),
    el('div.grow'),
    el('div.small.muted', { text: 'Track spend against leads and closings so you know what is worth repeating.' }),
  ]));

  if (!campaigns.length) {
    root.appendChild(card(null, {}, emptyState('📣', 'No campaigns yet',
      'A campaign groups posts and ads together — for example "ITIN push — September". Add one, attach your posts to it, and the ROI shows up here.',
      el('button.btn.btn-primary', { text: '+ New campaign', onclick: () => campaignForm(ctx) }))));
    return;
  }

  root.appendChild(card('Campaigns', { tight: true }, table(
    ['Campaign', 'Channel', { label: 'Spend', num: true }, { label: 'Clicks', num: true }, { label: 'Leads', num: true },
      { label: 'Cost/lead', num: true }, { label: 'Closed', num: true }, { label: 'Earned', num: true }, { label: 'ROI', num: true }, ''],
    campaigns.map((c) => el('tr', {}, [
      el('td', {}, [
        el('div.strong', { text: c.name }),
        el('div.small.muted', { text: `${dateFmt(c.startDate)}${c.city ? ` · ${c.city}` : ''}` }),
      ]),
      el('td.small', { text: (ctx.meta.channels.find((x) => x.id === c.channel)?.label || c.channel) }),
      el('td.num', { text: c.spend ? money(c.spend) : '—' }),
      el('td.num', { text: String(c.clicks) }),
      el('td.num', { text: String(c.leads) }),
      el('td.num', { text: c.costPerLead ? money(c.costPerLead, { cents: true }) : '—' }),
      el('td.num', { text: String(c.closed) }),
      el('td.num', {}, [el('span.strong', { text: money(c.earned) })]),
      el('td.num', {}, [c.roi == null ? el('span.muted', { text: '—' })
        : el(`span.chip.${c.roi >= 0 ? 'ok' : 'danger'}`, { text: `${c.roi > 0 ? '+' : ''}${c.roi}%` })]),
      el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
        el('button.btn.btn-sm', { text: 'Edit', onclick: () => campaignForm(ctx, c) }),
        el('button.btn.btn-sm.btn-danger', { text: '×', style: { marginLeft: '6px' },
          onclick: () => confirmDialog(`Delete "${c.name}"? Posts attached to it are removed too.`, async () => {
            await api.del(`/api/campaigns/${c.id}`); toast('Campaign deleted'); ctx.refresh();
          }) }),
      ]),
    ])))));
}

function campaignForm(ctx, existing = null) {
  const body = el('div', {}, [
    field('Campaign name', input('name', { value: existing?.name || '', placeholder: 'ITIN push — September' })),
    el('div.grid-2', {}, [
      field('Channel', select('channel', ctx.meta.channels.map((c) => ({ value: c.id, label: c.label })), existing?.channel || 'facebook_organic')),
      field('City focus', select('city', [{ value: '', label: 'All' }, ...ctx.meta.cities.map((c) => ({ value: c.name, label: c.name }))], existing?.city || '')),
    ]),
    el('div.grid-2', {}, [
      field('Ad spend so far', input('spend', { type: 'number', step: '10', value: existing?.spend || '0' })),
      field('Start date', input('startDate', { type: 'date', value: (existing?.startDate || new Date().toISOString()).slice(0, 10) })),
    ]),
    field('Goal / notes', el('textarea', { name: 'notes', rows: 2 }, [existing?.notes || ''])),
  ]);
  modal({
    title: existing ? 'Edit campaign' : 'New campaign',
    body,
    buttons: [
      { label: 'Cancel' },
      { label: existing ? 'Save' : 'Create', variant: 'primary', onClick: async (close) => {
        const v = formValues(body);
        if (!v.name) return toast('Name is required', 'err');
        v.sourceId = v.channel;
        if (existing) await api.patch(`/api/campaigns/${existing.id}`, v);
        else await api.post('/api/campaigns', v);
        toast('Saved'); close(); ctx.refresh();
      } },
    ],
  });
}
