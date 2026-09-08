#!/usr/bin/env node
// Load realistic demo data so the dashboard is worth looking at on day one.
// Run `npm run reset` to clear it before entering real leads.

import * as store from '../src/lib/store.js';
import { createLead, updateLead, logActivity } from '../src/domain/leads.js';
import { createDeal, recordPayout } from '../src/domain/commissions.js';
import { createCampaign, savePost, recordClick } from '../src/domain/campaigns.js';
import { buildWorklist } from '../src/domain/prospecting.js';
import { addDays } from '../src/lib/util.js';

const DEMO_LEADS = [
  { name: 'María Guadalupe Solís', phone: '6025550142', city: 'Avondale', zip: '85323', language: 'es', budgetMax: 385000, downPaymentPct: 5, timeline: 'now', financing: 'itin', preApproved: true, source: 'facebook_organic', sourceDetail: 'ITIN post Aug 28', message: 'Tengo mi ITIN y ya junté para el enganche. ¿Cuánto necesito de ingreso?', stage: 'showing' },
  { name: 'José Ramírez', phone: '6025550178', email: 'jramirez@example.com', city: 'Goodyear', zip: '85338', language: 'es', budgetMax: 460000, downPaymentPct: 10, timeline: '1-3m', financing: 'itin', preApproved: true, source: 'facebook_lead_ad', message: 'Busco casa de 4 recámaras cerca de la escuela.', stage: 'under_contract' },
  { name: 'Ashley Brennan', phone: '6235550119', email: 'ashley.b@example.com', city: 'Peoria', language: 'en', budgetMax: 520000, downPaymentPct: 20, timeline: 'now', financing: 'conventional', preApproved: true, source: 'landing_page', message: 'Relocating from Denver, need to close in 45 days.', stage: 'offer' },
  { name: 'Carlos Mendoza', phone: '6025550163', city: 'Maricopa (City)', zip: '85138', language: 'es', budgetMax: 320000, downPaymentPct: 5, timeline: '1-3m', financing: 'itin', source: 'facebook_group', message: 'Estoy rentando en $1,900 y quiero comprar ya.', stage: 'qualified' },
  { name: 'Brenda Nájera', phone: '6025550137', city: 'Buckeye', language: 'es', budgetMax: 350000, downPaymentPct: 3.5, timeline: '3-6m', financing: 'fha', source: 'facebook_organic', message: '¿Qué credito necesito?', stage: 'contacted' },
  { name: 'Miguel Ángel Torres', phone: '6025550155', city: 'Glendale', language: 'es', budgetMax: 410000, timeline: 'now', financing: 'itin', source: 'facebook_dm', message: 'Vi su publicación del ITIN, me interesa mucho.', stage: 'contacted' },
  { name: 'Tiffany Nguyen', email: 'tnguyen@example.com', phone: '4805550188', city: 'Chandler', language: 'en', budgetMax: 610000, downPaymentPct: 20, timeline: '6-12m', financing: 'conventional', source: 'referral', message: 'Referred by a past client. Not in a rush.', stage: 'new' },
  { name: 'Rosa Elena Vargas', phone: '6025550194', city: 'Tolleson', language: 'es', budgetMax: 300000, timeline: 'now', financing: 'itin', source: 'marketplace', message: 'Somos 5 en la familia, necesitamos 4 cuartos.', stage: 'qualified' },
  { name: 'Derrick Palmer', phone: '6235550172', city: 'Surprise', language: 'en', budgetMax: 445000, downPaymentPct: 0, timeline: '3-6m', financing: 'va', source: 'prospecting', sourceDetail: 'reddit', message: 'Veteran, looking at VA loan options.', stage: 'contacted' },
  { name: 'Juana Castillo', phone: '6025550126', city: 'Laveen', language: 'es', budgetMax: 375000, downPaymentPct: 10, timeline: '1-3m', financing: 'itin', preApproved: true, source: 'facebook_organic', message: 'Ya tengo mi carta de precalificación.', stage: 'showing' },
  { name: 'Kevin Ortiz', phone: '6025550111', city: 'Phoenix', language: 'en', budgetMax: 340000, timeline: '12m+', financing: 'unsure', source: 'facebook_organic', message: 'Just starting to look around.', stage: 'new' },
  { name: 'Silvia Hernández', phone: '6025550149', city: 'El Mirage', language: 'es', budgetMax: 310000, timeline: '6-12m', financing: 'fha', source: 'csv_import', stage: 'new' },
  { name: 'Ramón Delgado', phone: '6025550183', city: 'Avondale', language: 'es', budgetMax: 425000, timeline: 'now', financing: 'itin', preApproved: true, source: 'facebook_organic', message: 'Quiero ver la casa de Avondale que publicó.', stage: 'closed' },
  { name: 'Patricia Lomeli', phone: '6025550107', city: 'Goodyear', language: 'es', budgetMax: 580000, downPaymentPct: 20, timeline: 'now', financing: 'conventional', preApproved: true, source: 'facebook_organic', message: 'Vi la casa de 6 recámaras.', stage: 'closed' },
  { name: 'Anthony Ruiz', phone: '6025550190', city: 'Mesa', language: 'en', budgetMax: 390000, timeline: '3-6m', financing: 'fha', source: 'landing_page', stage: 'lost', lostReason: 'Went with a family friend who is an agent' },
];

function main() {
  console.log('Seeding demo data…\n');
  store.wipe();
  store.clearCache();

  const created = [];
  for (const row of DEMO_LEADS) {
    const { lead } = createLead({ ...row, stage: 'new' });
    const final = updateLead(lead.id, { stage: row.stage, lostReason: row.lostReason || '' });
    created.push(final);
  }
  console.log(`  ${created.length} leads`);

  // Campaigns + a couple of tracked posts with clicks.
  const camp1 = createCampaign({ name: 'ITIN push — August', channel: 'facebook_organic', spend: 0, city: 'Avondale' });
  const camp2 = createCampaign({ name: 'West Valley Lead Ads', channel: 'facebook_ads', sourceId: 'facebook_lead_ad', spend: 240 });
  const post1 = savePost({ campaignId: camp1.id, type: 'itin', language: 'es', city: 'Avondale', status: 'posted', body: '(ITIN post)' });
  const post2 = savePost({ campaignId: camp1.id, type: 'listing', language: 'es', city: 'Goodyear', status: 'posted', body: '(listing post)' });
  for (let i = 0; i < 34; i++) recordClick(post1.trackCode, { referrer: 'facebook.com' });
  for (let i = 0; i < 19; i++) recordClick(post2.trackCode, { referrer: 'facebook.com' });
  // Attribute a few leads to the campaigns so ROI has something to show.
  created.slice(0, 4).forEach((l) => store.patch('leads', l.id, { campaignId: camp1.id }));
  created.filter((l) => l.source === 'facebook_lead_ad').forEach((l) => store.patch('leads', l.id, { campaignId: camp2.id }));
  console.log('  2 campaigns, 2 posts, 53 clicks');

  // Deals: two closed and paid, one under contract, one projected.
  const ramon = created.find((l) => l.name.startsWith('Ramón'));
  const patricia = created.find((l) => l.name.startsWith('Patricia'));
  const jose = created.find((l) => l.name.startsWith('José'));
  const ashley = created.find((l) => l.name.startsWith('Ashley'));

  const d1 = createDeal({ leadId: ramon.id, clientName: ramon.name, salePrice: 415000, city: 'Avondale', address: '11482 W Cambridge Ave', status: 'pending', loanType: 'ITIN' });
  recordPayout(d1.id, { receivedAt: addDays(new Date(), -46).toISOString(), method: 'Check', reference: 'Referral fee — Avondale' });

  const d2 = createDeal({ leadId: patricia.id, clientName: patricia.name, salePrice: 580000, city: 'Goodyear', address: '17226 W Bonitos Way', status: 'pending', loanType: 'Conventional' });
  recordPayout(d2.id, { receivedAt: addDays(new Date(), -12).toISOString(), method: 'Zelle', reference: 'Referral fee — Goodyear' });

  createDeal({ leadId: jose.id, clientName: jose.name, salePrice: 452000, city: 'Goodyear', status: 'pending', expectedCloseDate: addDays(new Date(), 24).toISOString().slice(0, 10), loanType: 'ITIN' });
  createDeal({ leadId: ashley.id, clientName: ashley.name, salePrice: 515000, city: 'Peoria', status: 'projected', expectedCloseDate: addDays(new Date(), 51).toISOString().slice(0, 10) });
  console.log('  4 deals (2 paid, 1 pending, 1 projected)');

  const prospects = buildWorklist({ perPlatform: 6 });
  console.log(`  ${prospects.length} prospecting searches`);

  logActivity(patricia.id, 'note', 'Closed! Referred by the Goodyear 6-bedroom post.');

  const rev = store.all('payouts').reduce((s, p) => s + p.amount, 0);
  console.log(`\nDone. Demo revenue earned: $${rev.toLocaleString()}`);
  console.log('Start the app with:  npm start');
  console.log('Clear demo data with: npm run reset\n');
}

main();
