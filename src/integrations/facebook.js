// Facebook Lead Ads integration (the sanctioned way to pull leads from Meta).
//
// This uses the official Graph API with a Page access token that has the
// `leads_retrieval` permission. It does not scrape, automate a browser, or
// touch anything outside the agent's own Page — those approaches violate
// Meta's terms and get accounts disabled.
//
// Setup (one time):
//   1. developers.facebook.com -> create an app -> add "Webhooks" + "Marketing API".
//   2. Grant the app `leads_retrieval`, `pages_show_list`, `pages_read_engagement`.
//   3. Generate a long-lived Page access token for the agent's Page.
//   4. Paste the token + Page ID into Settings in this dashboard.

import { getSettings, saveSettings } from '../domain/settings.js';
import { createLead } from '../domain/leads.js';
import { nowIso } from '../lib/util.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

async function graph(path, params = {}, token) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Facebook API: ${msg}`);
  }
  return body;
}

export function isConfigured() {
  const s = getSettings().integrations.facebook;
  return Boolean(s.enabled && s.accessToken && s.pageId);
}

/** Verify the token and list the lead forms on the Page. */
export async function listForms() {
  const s = getSettings().integrations.facebook;
  if (!s.accessToken || !s.pageId) throw new Error('Facebook Page ID and access token are required (Settings tab).');
  const body = await graph(`${s.pageId}/leadgen_forms`, { fields: 'id,name,status,leads_count' }, s.accessToken);
  return body.data || [];
}

/** Map Facebook's field_data array onto our lead shape. */
function mapFacebookLead(entry, formName) {
  const fields = {};
  for (const f of entry.field_data || []) {
    fields[String(f.name || '').toLowerCase()] = (f.values || [])[0] || '';
  }
  const get = (...keys) => {
    for (const k of keys) if (fields[k]) return fields[k];
    return '';
  };

  const budgetRaw = get('budget', 'presupuesto', 'price_range', 'rango_de_precio');
  const timelineRaw = get('timeline', 'when_do_you_want_to_buy', 'cuando_quiere_comprar').toLowerCase();
  let timeline = 'unknown';
  if (/now|inmediat|ya|asap|este mes|1 month/.test(timelineRaw)) timeline = 'now';
  else if (/1-3|3 month|tres mes/.test(timelineRaw)) timeline = '1-3m';
  else if (/3-6|6 month|seis mes/.test(timelineRaw)) timeline = '3-6m';
  else if (/6-12|year|año/.test(timelineRaw)) timeline = '6-12m';

  const financingRaw = get('financing', 'loan_type', 'tipo_de_prestamo', 'financiamiento').toLowerCase();
  let financing = 'unsure';
  if (/itin/.test(financingRaw)) financing = 'itin';
  else if (/fha/.test(financingRaw)) financing = 'fha';
  else if (/va\b/.test(financingRaw)) financing = 'va';
  else if (/cash|efectivo/.test(financingRaw)) financing = 'cash';
  else if (/conven/.test(financingRaw)) financing = 'conventional';

  return {
    name: get('full_name', 'name', 'nombre', 'nombre_completo'),
    firstName: get('first_name'),
    lastName: get('last_name'),
    phone: get('phone_number', 'phone', 'telefono', 'teléfono'),
    email: get('email', 'correo'),
    city: get('city', 'ciudad'),
    zip: get('zip', 'zip_code', 'codigo_postal'),
    budgetMax: budgetRaw,
    timeline,
    financing,
    message: get('message', 'mensaje', 'comments', 'comentarios'),
    language: /[áéíóúñ¿]/i.test(Object.values(fields).join(' ')) ? 'es' : 'es',
    source: 'facebook_lead_ad',
    sourceDetail: formName || entry.form_id || '',
    utm: { source: 'facebook', medium: 'lead_ad', campaign: formName || '', content: '', term: '' },
    consent: { smsOptIn: true, emailOptIn: true, capturedAt: entry.created_time || nowIso(), ip: '' },
    facebookLeadId: entry.id,
  };
}

/**
 * Pull new leads from every configured form (or all forms on the Page) and
 * import them. Already-imported leads are skipped via de-duplication.
 */
export async function syncLeads({ since = null } = {}) {
  const settings = getSettings();
  const fb = settings.integrations.facebook;
  if (!fb.accessToken || !fb.pageId) {
    throw new Error('Facebook is not configured. Add a Page ID and access token in Settings.');
  }

  const forms = fb.formIds?.length
    ? fb.formIds.map((id) => ({ id, name: '' }))
    : await listForms();

  const imported = [];
  const duplicates = [];
  const errors = [];

  for (const form of forms) {
    try {
      const params = { fields: 'id,created_time,field_data,form_id', limit: 100 };
      if (since || fb.lastSyncAt) {
        params.filtering = JSON.stringify([
          { field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(new Date(since || fb.lastSyncAt).getTime() / 1000) },
        ]);
      }
      const body = await graph(`${form.id}/leads`, params, fb.accessToken);
      for (const entry of body.data || []) {
        const mapped = mapFacebookLead(entry, form.name);
        if (!mapped.name && !mapped.phone && !mapped.email) continue;
        const { lead, duplicate } = createLead(mapped);
        (duplicate ? duplicates : imported).push(lead);
      }
    } catch (err) {
      errors.push({ formId: form.id, error: String(err.message || err) });
    }
  }

  saveSettings({ integrations: { facebook: { lastSyncAt: nowIso() } } });
  return { imported: imported.length, duplicates: duplicates.length, errors, leads: imported };
}
