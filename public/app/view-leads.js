// Leads: searchable list, drag-free pipeline board, and the lead detail drawer.

import {
  el, $, api, money, dateFmt, relTime, isOverdue, phoneFmt, toast, modal, drawer, confirmDialog,
  field, input, select, formValues, card, table, scoreBadge, stagePill, emptyState, clear, copyText,
} from './lib.js';

let filters = { q: '', stage: '', source: '', temperature: '', sort: 'score' };

export async function renderLeads(root, ctx) {
  clear(root);
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  const { leads } = await api.get(`/api/leads?${params}`);
  ctx.cache.leads = leads;

  // ---- toolbar ----------------------------------------------------------
  const search = input('q', { placeholder: 'Search name, phone, city…', value: filters.q });
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { filters.q = search.value; renderLeads(root, ctx); }, 250);
  });

  const mk = (name, options, value) => {
    const s = select(name, options, value);
    s.addEventListener('change', () => { filters[name] = s.value; renderLeads(root, ctx); });
    return s;
  };

  root.appendChild(el('div.toolbar', {}, [
    el('div.grow', {}, [search]),
    mk('stage', [{ value: '', label: 'All stages' }, ...ctx.meta.stages.map((s) => ({ value: s.id, label: s.label }))], filters.stage),
    mk('temperature', [{ value: '', label: 'All temps' }, { value: 'hot', label: '🔥 Hot' }, { value: 'warm', label: 'Warm' }, { value: 'cool', label: 'Cool' }, { value: 'cold', label: 'Cold' }], filters.temperature),
    mk('source', [{ value: '', label: 'All sources' }, ...ctx.meta.sources.map((s) => ({ value: s.id, label: s.label }))], filters.source),
    mk('sort', [{ value: 'score', label: 'Sort: score' }, { value: 'createdAt', label: 'Sort: newest' }, { value: 'nextFollowUpAt', label: 'Sort: follow-up' }], filters.sort),
    el('button.btn.btn-primary', { text: '+ Add lead', onclick: () => leadForm(ctx) }),
    el('button.btn', { text: '⬇ CSV', title: 'Export all leads', onclick: () => { window.location.href = '/api/export/leads.csv'; } }),
  ]));

  if (!leads.length) {
    root.appendChild(card(null, {}, emptyState('👥',
      filters.q || filters.stage ? 'No leads match those filters' : 'No leads yet',
      filters.q || filters.stage
        ? 'Try clearing the filters above.'
        : 'Use Find Buyers to bring people in, or add someone manually.',
      el('button.btn.btn-primary', { text: 'Find buyers →', onclick: () => ctx.go('find') }))));
    return;
  }

  const rows = leads.map((l) => el('tr.clickable', { onclick: () => ctx.openLead(l.id) }, [
    el('td', {}, [scoreBadge(l)]),
    el('td', {}, [
      el('div.strong', { text: l.name || 'Unnamed' }),
      el('div.small.muted', { text: [l.phone ? phoneFmt(l.phone) : null, l.email || null].filter(Boolean).join(' · ') || 'no contact info' }),
    ]),
    el('td', {}, [
      el('div', { text: l.city || '—' }),
      el('div.small.muted', { text: l.zip || '' }),
    ]),
    el('td', {}, [stagePill(l.stage, ctx.meta.stages)]),
    el('td', {}, [
      l.financing === 'itin' ? el('span.chip.gold', { text: 'ITIN' }) : el('span.small.muted', { text: l.financing }),
    ]),
    el('td.num', { text: l.budgetMax ? money(l.budgetMax) : '—' }),
    el('td', {}, [el(`span.chip.${l.language === 'es' ? 'neutral' : 'cool'}`, { text: l.language === 'es' ? 'ES' : 'EN' })]),
    el('td', {}, [
      l.nextFollowUpAt
        ? el(`span.chip.${isOverdue(l.nextFollowUpAt) ? 'danger' : 'neutral'}`, { text: relTime(l.nextFollowUpAt) })
        : el('span.muted.small', { text: '—' }),
    ]),
    el('td.small.muted', { text: relTime(l.createdAt) }),
  ]));

  root.appendChild(card('Leads', { sub: `${leads.length} shown`, tight: true }, table(
    [{ label: 'Score' }, 'Name', 'City', 'Stage', 'Financing', { label: 'Budget', num: true }, 'Lang', 'Next follow-up', 'Added'],
    rows,
  )));
}

// ---------------------------------------------------------------------------
// Pipeline board
// ---------------------------------------------------------------------------

export async function renderPipeline(root, ctx) {
  clear(root);
  const { leads } = await api.get('/api/leads?sort=score');
  ctx.cache.leads = leads;

  const board = el('div.board');
  for (const stage of ctx.meta.stages) {
    if (stage.id === 'lost') continue;
    const inStage = leads.filter((l) => l.stage === stage.id);
    const value = inStage.reduce((sum, l) => {
      const price = l.budgetMax || 400000;
      const c = ctx.settings.commissions;
      return sum + price * (c.agentCommissionPct / 100) * (c.referralPct / 100) * stage.probability;
    }, 0);

    board.appendChild(el('div.col', {}, [
      el('div.col-head', {}, [
        el('span.t', { text: stage.label }),
        el('span.c', { text: String(inStage.length) }),
        value > 0 ? el('span.v', { text: money(value) }) : null,
      ]),
      ...inStage.slice(0, 40).map((l) => el('div.pcard', { onclick: () => ctx.openLead(l.id) }, [
        el('div.pcard-top', {}, [scoreBadge(l), el('div.pcard-name', { text: l.name || 'Unnamed' })]),
        el('div.pcard-meta', {}, [
          el('span', { text: l.city || 'no city' }),
          l.financing === 'itin' ? el('span', { text: '· ITIN' }) : null,
        ]),
        l.budgetMax ? el('div.pcard-val', { text: `${money(l.budgetMax)} home` }) : null,
        l.nextFollowUpAt && isOverdue(l.nextFollowUpAt)
          ? el('div.small', { text: `⚠ follow-up ${relTime(l.nextFollowUpAt)}`, style: { color: '#b3283a', marginTop: '4px' } })
          : null,
      ])),
      inStage.length === 0 ? el('div.small.muted', { text: 'Empty', style: { padding: '10px 4px' } }) : null,
    ]));
  }

  root.appendChild(el('div.toolbar', {}, [
    el('div.small.muted', { text: 'Click a card to open the lead. Column totals are probability-weighted referral value.' }),
    el('div.grow'),
    el('button.btn.btn-primary', { text: '+ Add lead', onclick: () => leadForm(ctx) }),
  ]));
  root.appendChild(board);

  const lost = leads.filter((l) => l.stage === 'lost');
  if (lost.length) {
    root.appendChild(card(`Lost (${lost.length})`, { sub: 'Worth a reactivation text every few months' , tight: true},
      table(['Name', 'City', 'Reason', 'Lost'], lost.map((l) => el('tr.clickable', { onclick: () => ctx.openLead(l.id) }, [
        el('td', { text: l.name }),
        el('td', { text: l.city || '—' }),
        el('td.small.muted', { text: l.lostReason || '—' }),
        el('td.small.muted', { text: relTime(l.updatedAt) }),
      ])))));
  }
}

// ---------------------------------------------------------------------------
// Lead detail drawer
// ---------------------------------------------------------------------------

export async function openLeadDrawer(id, ctx) {
  const data = await api.get(`/api/leads/${id}`);
  const { lead, activities, tasks, value, scripts, suggestedSequence } = data;
  const body = el('div');

  // --- quick actions -----------------------------------------------------
  const telHref = `tel:${String(lead.phone).replace(/\D/g, '')}`;
  const smsHref = `sms:${String(lead.phone).replace(/\D/g, '')}`;
  body.appendChild(el('div.toolbar', {}, [
    lead.phone ? el('a.btn.btn-gold', { href: telHref, text: '📞 Call' }) : null,
    lead.phone ? el('a.btn', { href: smsHref, text: '💬 Text' }) : null,
    lead.email ? el('a.btn', { href: `mailto:${lead.email}`, text: '✉ Email' }) : null,
    el('button.btn', { text: '📝 Log contact', onclick: () => logContactForm(lead, ctx) }),
    el('button.btn', { text: '✏️ Edit', onclick: () => leadForm(ctx, lead) }),
  ]));

  // --- value + score -----------------------------------------------------
  body.appendChild(el('div.kpis', { style: { gridTemplateColumns: '1fr 1fr' } }, [
    el('div.kpi.accent-ok', {}, [
      el('div.kpi-label', { text: 'Your fee if this closes' }),
      el('div.kpi-value.sm', { text: money(value.potentialFee) }),
      el('div.kpi-note', { html: `on a ${money(value.assumedPrice)} home · <strong>${money(value.weightedValue)}</strong> expected today` }),
    ]),
    el('div.kpi.accent-gold', {}, [
      el('div.kpi-label', { text: 'Lead score' }),
      el('div.kpi-value.sm', { text: `${lead.score}/100` }),
      el('div.kpi-note', { html: `<strong>${(lead.temperature || '').toUpperCase()}</strong> · ${Math.round(value.probability * 100)}% stage odds` }),
    ]),
  ]));

  // --- stage changer -----------------------------------------------------
  const stageSel = select('stage', ctx.meta.stages.map((s) => ({ value: s.id, label: s.label })), lead.stage);
  stageSel.addEventListener('change', async () => {
    await api.patch(`/api/leads/${lead.id}`, { stage: stageSel.value });
    toast(`Moved to ${ctx.meta.stages.find((s) => s.id === stageSel.value).label}`);
    ctx.refresh();
  });
  body.appendChild(card('Stage', { sub: 'Move the lead as it progresses' }, stageSel));

  // --- details -----------------------------------------------------------
  const dl = el('dl.dl', {}, [
    el('dt', { text: 'Phone' }), el('dd', { text: lead.phone ? phoneFmt(lead.phone) : '—' }),
    el('dt', { text: 'Email' }), el('dd', { text: lead.email || '—' }),
    el('dt', { text: 'Language' }), el('dd', { text: lead.language === 'es' ? 'Español' : 'English' }),
    el('dt', { text: 'Area' }), el('dd', { text: [lead.city, lead.zip].filter(Boolean).join(' ') || '—' }),
    el('dt', { text: 'Budget' }), el('dd', { text: lead.budgetMax ? `up to ${money(lead.budgetMax)}` : '—' }),
    el('dt', { text: 'Down payment' }), el('dd', { text: lead.downPaymentPct ? `${lead.downPaymentPct}%` : '—' }),
    el('dt', { text: 'Timeline' }), el('dd', { text: lead.timeline }),
    el('dt', { text: 'Financing' }), el('dd', {}, [
      lead.financing === 'itin' ? el('span.chip.gold', { text: 'ITIN' }) : el('span', { text: lead.financing }),
      lead.preApproved ? el('span.chip.ok', { text: 'Pre-approved', style: { marginLeft: '6px' } }) : null,
    ]),
    el('dt', { text: 'Source' }), el('dd', { text: (ctx.meta.sources.find((s) => s.id === lead.source)?.label || lead.source) + (lead.sourceDetail ? ` · ${lead.sourceDetail}` : '') }),
    el('dt', { text: 'Attempts' }), el('dd', { text: `${lead.contactAttempts} calls/texts · ${lead.repliesReceived} replies` }),
    el('dt', { text: 'Added' }), el('dd', { text: dateFmt(lead.createdAt, { time: true }) }),
  ]);
  body.appendChild(card('Details', {}, dl));

  if (lead.message) {
    body.appendChild(card('What they said', {}, el('div.pre', { text: lead.message })));
  }

  // --- score breakdown ---------------------------------------------------
  body.appendChild(card('Why this score', { sub: 'What is helping and what is missing' },
    table(['Factor', 'Detail', { label: 'Points', num: true }],
      (lead.scoreBreakdown || []).map((b) => el('tr', {}, [
        el('td', { text: b.factor }),
        el('td.small.muted', { text: b.detail }),
        el('td.num', {}, [el(`span.chip.${b.points > 0 ? 'ok' : b.points < 0 ? 'danger' : 'neutral'}`, { text: `${b.points > 0 ? '+' : ''}${b.points}` })]),
      ])))));

  // --- outreach scripts --------------------------------------------------
  const scriptKeys = Object.keys(scripts);
  const scriptSel = select('script', scriptKeys.map((k) => ({ value: k, label: k.replace(/_/g, ' ') })), scriptKeys[0]);
  const scriptBox = el('textarea', { rows: 5 }, [scripts[scriptKeys[0]]]);
  scriptSel.addEventListener('change', () => { scriptBox.value = scripts[scriptSel.value]; });
  body.appendChild(card('Ready-to-send message', { sub: `Written in ${lead.language === 'es' ? 'Spanish' : 'English'} to match this lead` },
    el('div', {}, [
      scriptSel,
      el('div.copybox', { style: { marginTop: '10px' } }, [
        scriptBox,
        el('button.btn.btn-sm.copy-btn', { text: 'Copy', onclick: () => copyText(scriptBox.value) }),
      ]),
    ])));

  // --- tasks -------------------------------------------------------------
  const openT = tasks.filter((t) => !t.done);
  body.appendChild(card('Follow-up plan', {
    sub: openT.length ? `${openT.length} scheduled` : 'Nothing scheduled',
    actions: el('button.btn.btn-sm.btn-primary', {
      text: `Apply "${suggestedSequence}" sequence`,
      onclick: async () => {
        const r = await api.post(`/api/leads/${lead.id}/sequence`, { sequence: suggestedSequence });
        toast(`${r.tasks.length} follow-ups scheduled`);
        ctx.reopenLead(lead.id);
      },
    }),
  }, openT.length
    ? table(['Task', 'Due', ''], openT.map((t) => el('tr', {}, [
        el('td', { text: t.title }),
        el('td', {}, [el(`span.chip.${isOverdue(t.dueAt) ? 'danger' : 'neutral'}`, { text: relTime(t.dueAt) })]),
        el('td', { style: { textAlign: 'right' } }, [
          el('button.btn.btn-sm', {
            text: '✓',
            onclick: async () => { await api.post(`/api/tasks/${t.id}/complete`); toast('Done'); ctx.reopenLead(lead.id); },
          }),
        ]),
      ])))
    : el('div.small.muted', { text: 'Apply a sequence to schedule the whole follow-up cadence at once.' })));

  // --- activity ----------------------------------------------------------
  const noteBox = el('textarea', { placeholder: 'Add a note…', rows: 2 });
  body.appendChild(card('Activity', {
    actions: el('button.btn.btn-sm', {
      text: 'Add note',
      onclick: async () => {
        if (!noteBox.value.trim()) return;
        await api.post(`/api/leads/${lead.id}/note`, { body: noteBox.value.trim() });
        toast('Note added');
        ctx.reopenLead(lead.id);
      },
    }),
  }, el('div', {}, [
    noteBox,
    el('ul.timeline', { style: { marginTop: '12px' } }, activities.slice(0, 25).map((a) =>
      el(`li${a.type === 'created' || a.type === 'stage_change' ? '.hl' : ''}`, {}, [
        el('span', { text: a.body }),
        el('span.when', { text: `${a.type.replace(/_/g, ' ')} · ${dateFmt(a.at, { time: true })}` }),
      ]))),
  ])));

  // --- danger zone -------------------------------------------------------
  body.appendChild(el('div', { style: { marginTop: '18px', display: 'flex', gap: '8px' } }, [
    el('button.btn.btn-danger', {
      text: 'Delete lead',
      onclick: () => confirmDialog(`Delete ${lead.name}? This removes their notes and tasks too.`, async () => {
        await api.del(`/api/leads/${lead.id}`);
        toast('Lead deleted');
        ctx.closeDrawer();
        ctx.refresh();
      }),
    }),
    el('button.btn', {
      text: lead.doNotContact ? 'Allow contact' : 'Mark do-not-contact',
      onclick: async () => {
        await api.patch(`/api/leads/${lead.id}`, { doNotContact: !lead.doNotContact });
        toast('Updated');
        ctx.reopenLead(lead.id);
      },
    }),
  ]));

  return drawer({
    title: lead.name || 'Unnamed lead',
    subtitle: `${lead.city || 'No city'} · ${(ctx.meta.sources.find((s) => s.id === lead.source)?.label || lead.source)} · added ${dateFmt(lead.createdAt)}`,
    body,
  });
}

function logContactForm(lead, ctx) {
  const body = el('div', {}, [
    field('Channel', select('channel', [
      { value: 'call', label: 'Phone call' }, { value: 'sms', label: 'Text message' },
      { value: 'dm', label: 'Facebook DM' }, { value: 'email', label: 'Email' },
      { value: 'in_person', label: 'In person' },
    ], 'call')),
    field('Outcome', select('outcome', [
      { value: 'connected', label: 'Talked to them' }, { value: 'replied', label: 'They replied' },
      { value: 'no_answer', label: 'No answer' }, { value: 'voicemail', label: 'Left voicemail' },
      { value: 'bad_number', label: 'Bad number' }, { value: 'not_interested', label: 'Not interested' },
    ], 'connected')),
    field('Note', el('textarea', { name: 'note', rows: 3, placeholder: 'What did they say?' })),
  ]);
  modal({
    title: `Log contact — ${lead.name}`,
    body,
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Save',
        variant: 'primary',
        onClick: async (close) => {
          const v = formValues(body);
          await api.post(`/api/leads/${lead.id}/contact`, v);
          if (v.outcome === 'not_interested') await api.patch(`/api/leads/${lead.id}`, { stage: 'lost', lostReason: v.note || 'Not interested' });
          if (v.outcome === 'bad_number') await api.patch(`/api/leads/${lead.id}`, { doNotContact: true });
          toast('Contact logged');
          close();
          ctx.reopenLead(lead.id);
        },
      },
    ],
  });
}

export function leadForm(ctx, existing = null) {
  const cities = ctx.meta.cities.map((c) => ({ value: c.name, label: `${c.name} (${c.county})` }));
  const body = el('div', {}, [
    el('div.grid-2', {}, [
      field('Name *', input('name', { value: existing?.name || '', placeholder: 'Maria Lopez' })),
      field('Phone *', input('phone', { type: 'tel', value: existing?.phone || '', placeholder: '602-555-0134' })),
    ]),
    el('div.grid-2', {}, [
      field('Email', input('email', { type: 'email', value: existing?.email || '' })),
      field('Language', select('language', [{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }], existing?.language || 'es')),
    ]),
    el('div.grid-2', {}, [
      field('City', select('city', [{ value: '', label: '— select —' }, ...cities], existing?.city || '')),
      field('ZIP', input('zip', { value: existing?.zip || '', maxlength: '5' })),
    ]),
    el('div.grid-3', {}, [
      field('Max budget', input('budgetMax', { type: 'number', step: '5000', value: existing?.budgetMax || '' })),
      field('Down payment %', input('downPaymentPct', { type: 'number', step: '0.5', value: existing?.downPaymentPct || '' })),
      field('Beds wanted', input('beds', { type: 'number', value: existing?.beds || '' })),
    ]),
    el('div.grid-3', {}, [
      field('Timeline', select('timeline', ctx.meta.timelines.map((t) => ({ value: t, label: t })), existing?.timeline || 'unknown')),
      field('Financing', select('financing', ctx.meta.financing.map((f) => ({ value: f, label: f.toUpperCase() })), existing?.financing || 'unsure')),
      field('Source', select('source', ctx.meta.sources.map((s) => ({ value: s.id, label: s.label })), existing?.source || 'manual')),
    ]),
    field('Stage', select('stage', ctx.meta.stages.map((s) => ({ value: s.id, label: s.label })), existing?.stage || 'new')),
    el('div.checkline', { style: { margin: '4px 0 14px' } }, [
      el('input', { type: 'checkbox', name: 'preApproved', id: 'f_preApproved', checked: existing?.preApproved || false }),
      el('label', { for: 'f_preApproved', text: 'Already pre-approved with a lender', style: { margin: 0 } }),
    ]),
    field('Notes / what they said', el('textarea', { name: 'message', rows: 3 }, [existing?.message || ''])),
  ]);

  modal({
    title: existing ? 'Edit lead' : 'Add lead',
    body,
    buttons: [
      { label: 'Cancel' },
      {
        label: existing ? 'Save' : 'Add lead',
        variant: 'primary',
        onClick: async (close) => {
          const v = formValues(body);
          if (!v.name && !v.phone) return toast('Name or phone is required', 'err');
          if (existing) await api.patch(`/api/leads/${existing.id}`, v);
          else {
            const r = await api.post('/api/leads', v);
            if (r.duplicate) toast('Merged into an existing lead');
          }
          toast(existing ? 'Lead saved' : 'Lead added');
          close();
          ctx.refresh();
          if (existing) ctx.reopenLead(existing.id);
        },
      },
    ],
  });
}
