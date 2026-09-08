// Campaigns, tracked short links and the content calendar.
//
// Every post the content engine produces can carry a tracked link (/t/<code>).
// Clicks are logged and the landing-page form carries the campaign through to
// the lead record, so the revenue dashboard can attribute closings back to the
// exact post that produced them.

import * as store from '../lib/store.js';
import { uid, nowIso, slugify, sortBy, num, addDays } from '../lib/util.js';
import { baseUrl } from './settings.js';

export const CHANNELS = [
  { id: 'facebook_organic', label: 'Facebook (organic post)' },
  { id: 'facebook_ads',     label: 'Facebook Ads' },
  { id: 'facebook_group',   label: 'Facebook group' },
  { id: 'marketplace',      label: 'Facebook Marketplace' },
  { id: 'instagram',        label: 'Instagram' },
  { id: 'tiktok',           label: 'TikTok' },
  { id: 'flyer',            label: 'Print / flyer / door hanger' },
  { id: 'referral',         label: 'Referral partner' },
  { id: 'other',            label: 'Other' },
];

export function createCampaign(input = {}) {
  const name = input.name || `Campaign ${new Date().toLocaleDateString()}`;
  const campaign = {
    id: uid('camp'),
    name,
    slug: input.slug || slugify(name),
    channel: input.channel || 'facebook_organic',
    sourceId: input.sourceId || input.channel || 'facebook_organic',
    language: input.language || 'es',
    city: input.city || '',
    spend: num(input.spend, 0),
    startDate: input.startDate || nowIso().slice(0, 10),
    endDate: input.endDate || null,
    active: input.active !== false,
    goal: input.goal || '',
    notes: input.notes || '',
    createdAt: nowIso(),
  };
  store.insert('campaigns', campaign);
  return campaign;
}

export function updateCampaign(id, changes) {
  if (changes.spend != null) changes.spend = num(changes.spend, 0);
  return store.patch('campaigns', id, changes);
}

export function deleteCampaign(id) {
  store.removeWhere('posts', (p) => p.campaignId === id);
  return store.remove('campaigns', id);
}

export function listCampaigns() {
  const leads = store.all('leads');
  const deals = store.all('deals');
  const clicks = store.all('clicks');
  const dealByLead = new Map(deals.filter((d) => d.leadId).map((d) => [d.leadId, d]));

  return sortBy(store.all('campaigns'), (c) => c.createdAt, 'desc').map((c) => {
    const camLeads = leads.filter((l) => l.campaignId === c.id);
    const camClicks = clicks.filter((k) => k.campaignId === c.id).length;
    const earned = camLeads.reduce((s, l) => {
      const d = dealByLead.get(l.id);
      return s + (d && d.status === 'paid' ? num(d.referralFee) : 0);
    }, 0);
    return {
      ...c,
      leads: camLeads.length,
      clicks: camClicks,
      closed: camLeads.filter((l) => l.stage === 'closed').length,
      earned,
      costPerLead: camLeads.length && c.spend ? Math.round((c.spend / camLeads.length) * 100) / 100 : 0,
      roi: c.spend ? Math.round(((earned - c.spend) / c.spend) * 1000) / 10 : null,
      conversionPct: camClicks ? Math.round((camLeads.length / camClicks) * 1000) / 10 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Tracked links
// ---------------------------------------------------------------------------

function shortCode() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Create a tracked link. Visiting /t/<code> logs a click then redirects to the
 * landing page with UTM params attached.
 */
export function createTrackedLink({ campaignId = null, landing = 'itin', label = '', language = 'es' } = {}) {
  let code = shortCode();
  const existing = new Set(store.all('posts').map((p) => p.trackCode));
  while (existing.has(code)) code = shortCode();
  return { code, url: `${baseUrl()}/t/${code}`, campaignId, landing, label, language };
}

export function recordClick(code, meta = {}) {
  const post = store.all('posts').find((p) => p.trackCode === code);
  const click = {
    id: uid('click'),
    code,
    postId: post?.id || null,
    campaignId: post?.campaignId || null,
    at: nowIso(),
    referrer: meta.referrer || '',
    userAgent: meta.userAgent || '',
  };
  store.insert('clicks', click);
  if (post) store.patch('posts', post.id, { clicks: num(post.clicks, 0) + 1 });
  return { click, post };
}

// ---------------------------------------------------------------------------
// Posts / content calendar
// ---------------------------------------------------------------------------

export function savePost(input) {
  const link = createTrackedLink({
    campaignId: input.campaignId || null,
    landing: input.landing || 'itin',
    language: input.language || 'es',
  });
  const post = {
    id: uid('post'),
    campaignId: input.campaignId || null,
    type: input.type || 'itin',
    language: input.language || 'es',
    body: input.body || '',
    bodyEn: input.bodyEn || '',
    city: input.city || '',
    channel: input.channel || 'facebook_organic',
    scheduledFor: input.scheduledFor || null,
    status: input.status || 'draft', // draft | scheduled | posted
    postedAt: null,
    postUrl: '',
    trackCode: link.code,
    trackUrl: link.url,
    landing: input.landing || 'itin',
    clicks: 0,
    createdAt: nowIso(),
  };
  store.insert('posts', post);
  return post;
}

export function updatePost(id, changes) {
  if (changes.status === 'posted' && !changes.postedAt) changes.postedAt = nowIso();
  return store.patch('posts', id, changes);
}

export function deletePost(id) {
  return store.remove('posts', id);
}

export function listPosts(filter = {}) {
  let rows = store.all('posts');
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.campaignId) rows = rows.filter((r) => r.campaignId === filter.campaignId);
  return sortBy(rows, (r) => r.scheduledFor || r.createdAt, 'desc');
}

/**
 * Suggest a posting schedule. Slots favour the times Phoenix-area Spanish-
 * speaking audiences are most active: early morning before work, lunch, and
 * after dinner.
 */
export const POSTING_SLOTS = ['07:30', '12:15', '18:30', '20:30'];

export function suggestSchedule(count = 7, startDate = new Date()) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(startDate, i);
    const slot = POSTING_SLOTS[i % POSTING_SLOTS.length];
    out.push(`${day.toISOString().slice(0, 10)}T${slot}:00`);
  }
  return out;
}

/**
 * A balanced week of content: listings sell, but education and engagement posts
 * are what generate comments — and comments are where the leads come from.
 */
export const WEEKLY_PLAN = [
  { day: 'Monday',    type: 'market',      note: 'Start the week with a market number people can react to' },
  { day: 'Tuesday',   type: 'listing',     note: 'Feature a listing with price, beds, baths, sqft' },
  { day: 'Wednesday', type: 'itin',        note: 'ITIN program — your strongest differentiator' },
  { day: 'Thursday',  type: 'buyer_tip',   note: 'Educational tip; ask for questions in comments' },
  { day: 'Friday',    type: 'open_house',  note: 'Weekend open house or showing availability' },
  { day: 'Saturday',  type: 'question',    note: 'Engagement question — highest comment volume' },
  { day: 'Sunday',    type: 'testimonial', note: 'Client win; builds trust for the week ahead' },
];
