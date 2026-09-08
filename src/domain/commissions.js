// Referral revenue engine.
//
// Money model: the agent earns a commission on a closing; the referrer (the
// person running this system) earns an agreed share of that commission, plus
// any flat bonuses. Every rate is overridable per deal because referral
// agreements differ.

import * as store from '../lib/store.js';
import { uid, nowIso, num, round2, monthKey, lastNMonths, sortBy } from '../lib/util.js';
import { getSettings } from './settings.js';
import { stageInfo, STAGES } from './leads.js';

export const DEAL_STATUSES = [
  { id: 'projected',      label: 'Projected',      note: 'Estimated from an active lead — not yet in escrow' },
  { id: 'pending',        label: 'Pending',        note: 'Under contract / commission not yet paid' },
  { id: 'paid',           label: 'Paid',           note: 'Referral fee received' },
  { id: 'lost',           label: 'Lost',           note: 'Deal fell through' },
];

/**
 * Compute the money for a single deal.
 * grossCommission = salePrice * agentCommissionPct
 * referralFee     = grossCommission * referralPct  (+ flat bonus)
 */
export function computeDeal(deal, settings = getSettings()) {
  const d = settings.commissions;
  const salePrice = num(deal.salePrice, 0);
  const agentPct = deal.agentCommissionPct != null ? num(deal.agentCommissionPct) : num(d.agentCommissionPct);
  const refPct = deal.referralPct != null ? num(deal.referralPct) : num(d.referralPct);
  const flat = deal.flatBonus != null ? num(deal.flatBonus) : num(d.flatBonusPerClose);

  const grossCommission = round2(salePrice * (agentPct / 100));
  const referralFee = round2(grossCommission * (refPct / 100) + flat);
  const agentNet = round2(grossCommission - referralFee);

  return {
    salePrice,
    agentCommissionPct: agentPct,
    referralPct: refPct,
    flatBonus: flat,
    grossCommission,
    referralFee,
    agentNet,
  };
}

function blankDeal() {
  return {
    id: uid('deal'),
    leadId: null,
    clientName: '',
    address: '',
    city: '',
    zip: '',
    salePrice: 0,
    agentCommissionPct: null, // null = use the global default
    referralPct: null,
    flatBonus: null,
    status: 'projected',
    contractDate: null,
    expectedCloseDate: null,
    actualCloseDate: null,
    paidAt: null,
    paidAmount: 0,
    lender: '',
    loanType: '',
    notes: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function createDeal(input) {
  const deal = { ...blankDeal(), ...input };
  deal.salePrice = num(deal.salePrice, 0);
  const computed = computeDeal(deal);
  const row = { ...deal, ...computed, updatedAt: nowIso() };
  store.insert('deals', row);
  if (row.leadId) {
    store.patch('leads', row.leadId, { dealId: row.id });
  }
  return row;
}

export function updateDeal(id, changes) {
  const existing = store.find('deals', id);
  if (!existing) return null;
  const merged = { ...existing, ...changes };
  const computed = computeDeal(merged);
  return store.patch('deals', id, { ...merged, ...computed, updatedAt: nowIso() });
}

export function deleteDeal(id) {
  const deal = store.find('deals', id);
  if (deal?.leadId) store.patch('leads', deal.leadId, { dealId: null });
  store.removeWhere('payouts', (p) => p.dealId === id);
  return store.remove('deals', id);
}

/** Mark a referral fee as received and log the payout. */
export function recordPayout(dealId, { amount, receivedAt, method = '', reference = '' } = {}) {
  const deal = store.find('deals', dealId);
  if (!deal) return null;
  const paid = amount != null ? num(amount) : num(deal.referralFee);
  const at = receivedAt || nowIso();
  const payout = {
    id: uid('pay'),
    dealId,
    leadId: deal.leadId,
    amount: round2(paid),
    receivedAt: at,
    method,
    reference,
    createdAt: nowIso(),
  };
  store.insert('payouts', payout);
  updateDeal(dealId, {
    status: 'paid',
    paidAt: at,
    paidAmount: round2(num(deal.paidAmount, 0) + paid),
    actualCloseDate: deal.actualCloseDate || at.slice(0, 10),
  });
  return payout;
}

// ---------------------------------------------------------------------------
// Pipeline valuation
// ---------------------------------------------------------------------------

/**
 * Estimate a lead's referral value even before a deal exists, using the lead's
 * budget (or the market median) and its stage probability.
 */
export function projectLeadValue(lead, settings = getSettings()) {
  const price = num(lead.budgetMax, 0) || num(lead.budgetMin, 0) || 400000;
  const { referralFee } = computeDeal({ salePrice: price }, settings);
  const probability = stageInfo(lead.stage).probability;
  // Blend stage probability with lead score so a hot "new" lead is not valued
  // identically to a cold one.
  const scoreFactor = 0.5 + (num(lead.score, 0) / 100) * 0.5;
  const weighted = round2(referralFee * probability * scoreFactor);
  return { potentialFee: referralFee, probability, weightedValue: weighted, assumedPrice: price };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function dealMonth(deal) {
  return monthKey(deal.paidAt || deal.actualCloseDate || deal.expectedCloseDate || deal.createdAt);
}

export function revenueSummary({ months = 12 } = {}) {
  const settings = getSettings();
  const deals = store.all('deals');
  const payouts = store.all('payouts');
  const leads = store.all('leads');

  const paidDeals = deals.filter((d) => d.status === 'paid');
  const pendingDeals = deals.filter((d) => d.status === 'pending');
  const projectedDeals = deals.filter((d) => d.status === 'projected');

  const earned = round2(payouts.reduce((s, p) => s + num(p.amount), 0));
  const pending = round2(pendingDeals.reduce((s, d) => s + num(d.referralFee), 0));
  const projected = round2(projectedDeals.reduce((s, d) => s + num(d.referralFee), 0));

  // Pipeline value from leads that don't have a deal record yet.
  const dealLeadIds = new Set(deals.map((d) => d.leadId).filter(Boolean));
  const openLeads = leads.filter(
    (l) => !dealLeadIds.has(l.id) && l.stage !== 'closed' && l.stage !== 'lost',
  );
  const pipelineWeighted = round2(
    openLeads.reduce((s, l) => s + projectLeadValue(l, settings).weightedValue, 0),
  );
  const pipelinePotential = round2(
    openLeads.reduce((s, l) => s + projectLeadValue(l, settings).potentialFee, 0),
  );

  // Monthly series
  const keys = lastNMonths(months);
  const byMonth = Object.fromEntries(keys.map((k) => [k, { month: k, earned: 0, pending: 0, projected: 0, closings: 0, volume: 0 }]));
  for (const p of payouts) {
    const k = monthKey(p.receivedAt);
    if (byMonth[k]) byMonth[k].earned = round2(byMonth[k].earned + num(p.amount));
  }
  for (const d of deals) {
    const k = dealMonth(d);
    if (!byMonth[k]) continue;
    if (d.status === 'pending') byMonth[k].pending = round2(byMonth[k].pending + num(d.referralFee));
    if (d.status === 'projected') byMonth[k].projected = round2(byMonth[k].projected + num(d.referralFee));
    if (d.status === 'paid') {
      byMonth[k].closings += 1;
      byMonth[k].volume = round2(byMonth[k].volume + num(d.salePrice));
    }
  }

  const thisMonth = monthKey(nowIso());
  const goal = num(settings.goals.monthlyRevenue, 0);
  const thisMonthEarned = byMonth[thisMonth]?.earned || 0;

  const closedVolume = round2(paidDeals.reduce((s, d) => s + num(d.salePrice), 0));
  const avgFee = paidDeals.length ? round2(earned / paidDeals.length) : 0;
  const avgSalePrice = paidDeals.length ? round2(closedVolume / paidDeals.length) : 0;

  return {
    earned,
    pending,
    projected,
    pipelineWeighted,
    pipelinePotential,
    forecast90: round2(earned * 0 + pending + pipelineWeighted),
    thisMonth: {
      key: thisMonth,
      earned: thisMonthEarned,
      goal,
      pctOfGoal: goal ? Math.round((thisMonthEarned / goal) * 100) : 0,
      remaining: round2(Math.max(0, goal - thisMonthEarned)),
    },
    counts: {
      deals: deals.length,
      paid: paidDeals.length,
      pending: pendingDeals.length,
      projected: projectedDeals.length,
      openLeads: openLeads.length,
    },
    averages: { avgFee, avgSalePrice, closedVolume },
    series: keys.map((k) => byMonth[k]),
  };
}

/** Funnel counts + conversion rates across the pipeline. */
export function funnelReport() {
  const leads = store.all('leads');
  const total = leads.length || 1;
  const rows = STAGES.map((s) => {
    const count = leads.filter((l) => l.stage === s.id).length;
    return { ...s, count, pctOfTotal: Math.round((count / total) * 100) };
  });
  const closed = leads.filter((l) => l.stage === 'closed').length;
  const qualifiedPlus = leads.filter((l) =>
    ['qualified', 'showing', 'offer', 'under_contract', 'closed'].includes(l.stage),
  ).length;
  const contactedPlus = leads.filter((l) => l.stage !== 'new').length;
  return {
    stages: rows,
    totals: {
      leads: leads.length,
      contacted: contactedPlus,
      qualified: qualifiedPlus,
      closed,
      leadToContact: leads.length ? Math.round((contactedPlus / leads.length) * 100) : 0,
      leadToQualified: leads.length ? Math.round((qualifiedPlus / leads.length) * 100) : 0,
      leadToClose: leads.length ? Math.round((closed / leads.length) * 1000) / 10 : 0,
    },
  };
}

/** Revenue and conversion broken out by lead source, so spend follows results. */
export function sourceReport() {
  const settings = getSettings();
  const leads = store.all('leads');
  const deals = store.all('deals');
  const campaigns = store.all('campaigns');
  const dealByLead = new Map(deals.filter((d) => d.leadId).map((d) => [d.leadId, d]));

  const spendBySource = {};
  for (const c of campaigns) {
    const key = c.sourceId || 'facebook_organic';
    spendBySource[key] = round2((spendBySource[key] || 0) + num(c.spend, 0));
  }

  const bySource = new Map();
  for (const lead of leads) {
    const key = lead.source || 'other';
    if (!bySource.has(key)) {
      bySource.set(key, {
        source: key, leads: 0, qualified: 0, closed: 0, earned: 0, pending: 0,
        pipeline: 0, spend: spendBySource[key] || 0, avgScore: 0, scoreSum: 0,
      });
    }
    const row = bySource.get(key);
    row.leads += 1;
    row.scoreSum += num(lead.score);
    if (['qualified', 'showing', 'offer', 'under_contract', 'closed'].includes(lead.stage)) row.qualified += 1;
    if (lead.stage === 'closed') row.closed += 1;

    const deal = dealByLead.get(lead.id);
    if (deal) {
      if (deal.status === 'paid') row.earned = round2(row.earned + num(deal.referralFee));
      else if (deal.status === 'pending') row.pending = round2(row.pending + num(deal.referralFee));
    } else if (lead.stage !== 'closed' && lead.stage !== 'lost') {
      row.pipeline = round2(row.pipeline + projectLeadValue(lead, settings).weightedValue);
    }
  }

  const rows = [...bySource.values()].map((r) => ({
    ...r,
    avgScore: r.leads ? Math.round(r.scoreSum / r.leads) : 0,
    costPerLead: r.leads && r.spend ? round2(r.spend / r.leads) : 0,
    conversionPct: r.leads ? Math.round((r.closed / r.leads) * 1000) / 10 : 0,
    qualifiedPct: r.leads ? Math.round((r.qualified / r.leads) * 100) : 0,
    roi: r.spend ? round2(((r.earned - r.spend) / r.spend) * 100) : null,
    revenuePerLead: r.leads ? round2(r.earned / r.leads) : 0,
  }));
  return sortBy(rows, (r) => r.earned + r.pipeline, 'desc');
}

/** Everything the Revenue tab needs, in one call. */
export function dashboardReport() {
  const settings = getSettings();
  const revenue = revenueSummary({ months: 12 });
  const funnel = funnelReport();
  const sources = sourceReport();
  const deals = sortBy(store.all('deals'), (d) => d.updatedAt, 'desc');
  const leads = store.all('leads');

  const topOpportunities = sortBy(
    leads
      .filter((l) => l.stage !== 'closed' && l.stage !== 'lost')
      .map((l) => ({
        id: l.id,
        name: l.name,
        city: l.city,
        stage: l.stage,
        score: l.score,
        temperature: l.temperature,
        ...projectLeadValue(l, settings),
      })),
    (o) => o.weightedValue,
    'desc',
  ).slice(0, 10);

  return { revenue, funnel, sources, deals: deals.slice(0, 50), topOpportunities, settings: settings.commissions };
}
