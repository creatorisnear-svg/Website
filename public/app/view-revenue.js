// Revenue dashboard: what you have earned, what is coming, and where it came from.

import {
  el, api, money, moneyShort, pct, dateFmt, relTime, isOverdue, toast, modal, confirmDialog,
  field, input, select, formValues, card, table, revenueChart, funnelChart, donut, PALETTE,
  scoreBadge, stagePill, emptyState, clear,
} from './lib.js';

function kpi(label, value, note, accent, extra) {
  return el(`div.kpi${accent ? `.accent-${accent}` : ''}`, {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: value }),
    note ? el('div.kpi-note', { html: note }) : null,
    extra || null,
  ]);
}

export async function renderRevenue(root, ctx) {
  clear(root);
  root.appendChild(el('div', { text: 'Loading…', class: 'muted' }));

  const data = await api.get('/api/dashboard');
  const { revenue, funnel, sources, topOpportunities, tasks, settings } = data;
  clear(root);

  // ---- KPI row ----------------------------------------------------------
  const goalPct = Math.min(100, revenue.thisMonth.pctOfGoal);
  root.appendChild(el('div.kpis', {}, [
    kpi('Earned (all time)', money(revenue.earned),
      `${revenue.counts.paid} paid referral${revenue.counts.paid === 1 ? '' : 's'}`, 'ok'),
    kpi('Pending payout', money(revenue.pending),
      `${revenue.counts.pending} deal${revenue.counts.pending === 1 ? '' : 's'} under contract`, 'gold'),
    kpi('Pipeline value', money(revenue.pipelineWeighted),
      `Probability-weighted from ${revenue.counts.openLeads} open lead${revenue.counts.openLeads === 1 ? '' : 's'}`, 'info'),
    kpi('This month', money(revenue.thisMonth.earned),
      `Goal ${money(revenue.thisMonth.goal)} · <strong>${revenue.thisMonth.pctOfGoal}%</strong>`,
      goalPct >= 100 ? 'ok' : 'warn',
      el('div.progress', {}, [el(`div.progress-fill${goalPct >= 100 ? '.ok' : ''}`, { style: { width: `${goalPct}%` } })])),
  ]));

  // ---- Commission basis note -------------------------------------------
  root.appendChild(el('div.note', { html:
    `Your fee = <strong>sale price × ${settings.agentCommissionPct}%</strong> (agent's commission) ` +
    `× <strong>${settings.referralPct}%</strong> (your referral share)` +
    (settings.flatBonusPerClose ? ` + <strong>${money(settings.flatBonusPerClose)}</strong> flat per close` : '') +
    `. On a ${money(400000)} home that is <strong>${money(400000 * (settings.agentCommissionPct / 100) * (settings.referralPct / 100) + (settings.flatBonusPerClose || 0))}</strong> to you. ` +
    `Change these in Settings.` }));

  // ---- Chart + funnel ---------------------------------------------------
  const grid = el('div.split');
  grid.appendChild(card('Monthly revenue', { sub: 'Last 12 months' }, revenueChart(revenue.series)));

  const funnelBody = el('div', {}, [
    funnelChart(funnel.stages),
    el('div.legend', { style: { marginTop: '14px' }, html:
      `<span>Lead → contacted: <strong>${funnel.totals.leadToContact}%</strong></span>` +
      `<span>Lead → qualified: <strong>${funnel.totals.leadToQualified}%</strong></span>` +
      `<span>Lead → closed: <strong>${funnel.totals.leadToClose}%</strong></span>` }),
  ]);
  grid.appendChild(card('Pipeline funnel', { sub: `${funnel.totals.leads} total leads` }, funnelBody));
  root.appendChild(grid);

  // ---- Source performance ----------------------------------------------
  if (sources.length) {
    const slices = sources.slice(0, 7).map((s, i) => ({
      label: s.source, value: s.leads, color: PALETTE[i % PALETTE.length],
    }));
    const sourceRows = sources.map((s) => el('tr', {}, [
      el('td', {}, [el('span.strong', { text: labelFor(s.source, ctx) })]),
      el('td.num', { text: String(s.leads) }),
      el('td.num', { text: String(s.qualified) }),
      el('td.num', { text: String(s.closed) }),
      el('td.num', { text: money(s.earned) }),
      el('td.num', { text: money(s.pipeline) }),
      el('td.num', { text: s.spend ? money(s.spend) : '—' }),
      el('td.num', { text: s.costPerLead ? money(s.costPerLead, { cents: true }) : '—' }),
      el('td.num', {}, [
        s.roi == null
          ? el('span.muted', { text: '—' })
          : el(`span.chip.${s.roi >= 0 ? 'ok' : 'danger'}`, { text: `${s.roi > 0 ? '+' : ''}${s.roi}%` }),
      ]),
    ]));

    const body = el('div', { style: { display: 'flex', gap: '22px', alignItems: 'flex-start', flexWrap: 'wrap' } }, [
      el('div', { style: { flex: '0 0 auto', textAlign: 'center' } }, [
        donut(slices),
        el('div.small.muted', { text: 'Leads by source', style: { marginTop: '8px' } }),
      ]),
      el('div', { style: { flex: '1', minWidth: '440px' } }, [
        table(
          ['Source', { label: 'Leads', num: true }, { label: 'Qual.', num: true }, { label: 'Closed', num: true },
            { label: 'Earned', num: true }, { label: 'Pipeline', num: true }, { label: 'Spend', num: true },
            { label: 'Cost/lead', num: true }, { label: 'ROI', num: true }],
          sourceRows,
        ),
      ]),
    ]);
    root.appendChild(card('Where your money comes from', { sub: 'Double down on the rows with the best ROI' }, body));
  }

  // ---- Top opportunities -----------------------------------------------
  if (topOpportunities.length) {
    const rows = topOpportunities.map((o) => el('tr.clickable', {
      onclick: () => ctx.openLead(o.id),
    }, [
      el('td', {}, [el('span.strong', { text: o.name || 'Unnamed' })]),
      el('td', { text: o.city || '—' }),
      el('td', {}, [stagePill(o.stage, ctx.meta.stages)]),
      el('td', {}, [scoreBadge(o)]),
      el('td.num', { text: money(o.assumedPrice) }),
      el('td.num', { text: money(o.potentialFee) }),
      el('td.num', { text: `${Math.round(o.probability * 100)}%` }),
      el('td.num', {}, [el('span.strong', { text: money(o.weightedValue) })]),
    ]));
    root.appendChild(card('Best opportunities right now', {
      sub: 'Ranked by expected referral value — work these first',
    }, table(
      ['Lead', 'City', 'Stage', { label: 'Score', num: false }, { label: 'Home price', num: true },
        { label: 'Your fee if it closes', num: true }, { label: 'Odds', num: true }, { label: 'Expected', num: true }],
      rows,
    )));
  }

  // ---- Today's work ------------------------------------------------------
  const taskRows = (tasks.list || []).slice(0, 10).map((t) => el('tr', {}, [
    el('td', {}, [
      el('div.strong', { text: t.title }),
      t.lead ? el('div.small.muted', { text: `${t.lead.name} · ${t.lead.city || 'no city'}` }) : null,
    ]),
    el('td', {}, [t.lead ? scoreBadge(t.lead) : el('span.muted', { text: '—' })]),
    el('td', {}, [el(`span.chip.${isOverdue(t.dueAt) ? 'danger' : 'neutral'}`, { text: relTime(t.dueAt) })]),
    el('td', { style: { textAlign: 'right' } }, [
      t.lead ? el('button.btn.btn-sm', { text: 'Open', onclick: () => ctx.openLead(t.leadId) }) : null,
      el('button.btn.btn-sm', {
        text: '✓ Done',
        style: { marginLeft: '6px' },
        onclick: async (e) => {
          e.stopPropagation();
          await api.post(`/api/tasks/${t.id}/complete`);
          toast('Task completed');
          ctx.refresh();
        },
      }),
    ]),
  ]));

  root.appendChild(card("Today's follow-ups", {
    sub: tasks.overdue ? `${tasks.overdue} overdue` : 'You are caught up',
    actions: el('button.btn.btn-sm', { text: 'All leads →', onclick: () => ctx.go('leads') }),
  }, taskRows.length
    ? table(['Task', 'Score', 'Due', ''], taskRows)
    : emptyState('✅', 'Nothing due', 'Every follow-up is done. Add more leads to keep the pipeline full.',
      el('button.btn.btn-primary', { text: 'Find buyers', onclick: () => ctx.go('find') }))));
}

function labelFor(sourceId, ctx) {
  return (ctx.meta.sources || []).find((s) => s.id === sourceId)?.label || sourceId;
}

// ---------------------------------------------------------------------------
// Deals tab
// ---------------------------------------------------------------------------

export async function renderDeals(root, ctx) {
  clear(root);
  const { deals, payouts, statuses } = await api.get('/api/deals');
  const s = ctx.settings.commissions;

  root.appendChild(el('div.toolbar', {}, [
    el('button.btn.btn-primary', { text: '+ New deal', onclick: () => dealForm(ctx) }),
    el('button.btn', { text: '🧮 Commission calculator', onclick: () => calculator(ctx) }),
    el('div.grow'),
    el('div.small.muted', { text: `Default: ${s.agentCommissionPct}% agent commission × ${s.referralPct}% referral share` }),
  ]));

  if (!deals.length) {
    root.appendChild(card(null, {}, emptyState('💰', 'No deals yet',
      'When a lead you referred goes under contract, add the deal here to track your commission.',
      el('button.btn.btn-primary', { text: '+ Add your first deal', onclick: () => dealForm(ctx) }))));
    return;
  }

  const rows = deals.map((d) => el('tr', {}, [
    el('td', {}, [
      el('div.strong', { text: d.clientName || d.lead?.name || 'Unnamed' }),
      el('div.small.muted', { text: [d.address, d.city].filter(Boolean).join(', ') || '—' }),
    ]),
    el('td.num', { text: money(d.salePrice) }),
    el('td.num', { text: `${d.agentCommissionPct}%` }),
    el('td.num', { text: money(d.grossCommission) }),
    el('td.num', { text: `${d.referralPct}%` }),
    el('td.num', {}, [el('span.strong', { text: money(d.referralFee) })]),
    el('td', {}, [el(`span.chip.${d.status === 'paid' ? 'ok' : d.status === 'pending' ? 'gold' : d.status === 'lost' ? 'danger' : 'neutral'}`,
      { text: statuses.find((x) => x.id === d.status)?.label || d.status })]),
    el('td', { text: dateFmt(d.actualCloseDate || d.expectedCloseDate) }),
    el('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } }, [
      d.status !== 'paid'
        ? el('button.btn.btn-sm.btn-gold', {
            text: 'Mark paid',
            onclick: async () => {
              await api.post(`/api/deals/${d.id}/payout`, {});
              toast(`${money(d.referralFee)} recorded`);
              ctx.refresh();
            },
          })
        : null,
      el('button.btn.btn-sm', { text: 'Edit', style: { marginLeft: '6px' }, onclick: () => dealForm(ctx, d) }),
      el('button.btn.btn-sm.btn-danger', {
        text: '×', style: { marginLeft: '6px' },
        onclick: () => confirmDialog('Delete this deal and its payout history?', async () => {
          await api.del(`/api/deals/${d.id}`);
          toast('Deal deleted');
          ctx.refresh();
        }),
      }),
    ]),
  ]));

  root.appendChild(card('Deals', { sub: `${deals.length} total`, tight: true }, table(
    ['Client / property', { label: 'Sale price', num: true }, { label: 'Agent %', num: true },
      { label: 'Agent commission', num: true }, { label: 'Your %', num: true }, { label: 'Your fee', num: true },
      'Status', 'Close date', ''],
    rows,
  )));

  if (payouts.length) {
    root.appendChild(card('Payouts received', { sub: `${money(payouts.reduce((a, p) => a + p.amount, 0))} total`, tight: true },
      table(['Received', { label: 'Amount', num: true }, 'Method', 'Reference'],
        payouts.map((p) => el('tr', {}, [
          el('td', { text: dateFmt(p.receivedAt) }),
          el('td.num', {}, [el('span.strong', { text: money(p.amount) })]),
          el('td', { text: p.method || '—' }),
          el('td.small.muted', { text: p.reference || '—' }),
        ])))));
  }
}

function dealForm(ctx, existing = null) {
  const leads = ctx.cache.leads || [];
  const body = el('div', {}, [
    field('Link to lead (optional)', select('leadId',
      [{ value: '', label: '— none —' }, ...leads.map((l) => ({ value: l.id, label: `${l.name} · ${l.city || 'no city'}` }))],
      existing?.leadId || '')),
    el('div.grid-2', {}, [
      field('Client name', input('clientName', { value: existing?.clientName || '' })),
      field('City', input('city', { value: existing?.city || '' })),
    ]),
    field('Property address', input('address', { value: existing?.address || '' })),
    el('div.grid-3', {}, [
      field('Sale price', input('salePrice', { type: 'number', min: '0', step: '1000', value: existing?.salePrice || '' })),
      field('Agent commission %', input('agentCommissionPct', {
        type: 'number', step: '0.05', placeholder: String(ctx.settings.commissions.agentCommissionPct),
        value: existing?.agentCommissionPct ?? '',
      })),
      field('Your referral %', input('referralPct', {
        type: 'number', step: '1', placeholder: String(ctx.settings.commissions.referralPct),
        value: existing?.referralPct ?? '',
      })),
    ]),
    el('div.grid-3', {}, [
      field('Status', select('status', ctx.meta.dealStatuses || [
        { value: 'projected', label: 'Projected' }, { value: 'pending', label: 'Pending' },
        { value: 'paid', label: 'Paid' }, { value: 'lost', label: 'Lost' },
      ], existing?.status || 'pending')),
      field('Contract date', input('contractDate', { type: 'date', value: (existing?.contractDate || '').slice(0, 10) })),
      field('Expected close', input('expectedCloseDate', { type: 'date', value: (existing?.expectedCloseDate || '').slice(0, 10) })),
    ]),
    field('Notes', el('textarea', { name: 'notes' }, [existing?.notes || ''])),
    el('div.note', { id: 'dealPreview', html: 'Enter a sale price to preview your fee.' }),
  ]);

  const preview = () => {
    const v = formValues(body);
    const price = Number(v.salePrice) || 0;
    const ap = Number(v.agentCommissionPct || ctx.settings.commissions.agentCommissionPct);
    const rp = Number(v.referralPct || ctx.settings.commissions.referralPct);
    const gross = price * (ap / 100);
    const fee = gross * (rp / 100) + (ctx.settings.commissions.flatBonusPerClose || 0);
    body.querySelector('#dealPreview').innerHTML = price
      ? `Agent commission: <strong>${money(gross)}</strong> &nbsp;·&nbsp; <strong>Your referral fee: ${money(fee)}</strong>`
      : 'Enter a sale price to preview your fee.';
  };
  body.addEventListener('input', preview);
  preview();

  modal({
    title: existing ? 'Edit deal' : 'New deal',
    body,
    buttons: [
      { label: 'Cancel' },
      {
        label: existing ? 'Save' : 'Create deal',
        variant: 'primary',
        onClick: async (close) => {
          const v = formValues(body);
          if (!v.salePrice) return toast('Sale price is required', 'err');
          ['agentCommissionPct', 'referralPct'].forEach((k) => { if (v[k] === '') v[k] = null; });
          if (!v.leadId) v.leadId = null;
          if (existing) await api.patch(`/api/deals/${existing.id}`, v);
          else await api.post('/api/deals', v);
          toast(existing ? 'Deal saved' : 'Deal created');
          close();
          ctx.refresh();
        },
      },
    ],
  });
}

function calculator(ctx) {
  const c = ctx.settings.commissions;
  const out = el('div.note.ok', { style: { fontSize: '14px' } });
  const body = el('div', {}, [
    el('div.grid-3', {}, [
      field('Sale price', input('salePrice', { type: 'number', value: '450000', step: '5000' })),
      field('Agent commission %', input('agentCommissionPct', { type: 'number', step: '0.05', value: String(c.agentCommissionPct) })),
      field('Your referral %', input('referralPct', { type: 'number', step: '1', value: String(c.referralPct) })),
    ]),
    out,
    el('div.small.muted', { text: 'Tip: at a 25% referral share you need roughly four closings a year at Phoenix-area prices to clear $15,000.' }),
  ]);
  const recalc = () => {
    const v = formValues(body);
    const price = Number(v.salePrice) || 0;
    const gross = price * (Number(v.agentCommissionPct) / 100);
    const fee = gross * (Number(v.referralPct) / 100) + (c.flatBonusPerClose || 0);
    out.innerHTML =
      `Home price <strong>${money(price)}</strong><br>` +
      `Agent's commission <strong>${money(gross)}</strong><br>` +
      `<span style="font-size:19px">Your referral fee <strong>${money(fee)}</strong></span><br>` +
      `<span class="small">10 closings like this = <strong>${money(fee * 10)}</strong> a year</span>`;
  };
  body.addEventListener('input', recalc);
  recalc();
  modal({ title: 'Commission calculator', body, buttons: [{ label: 'Close' }] });
}
