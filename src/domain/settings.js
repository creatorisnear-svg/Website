// Application settings: agent identity, commission defaults, goals, integrations.

import * as store from '../lib/store.js';
import { nowIso } from '../lib/util.js';

export const DEFAULT_SETTINGS = {
  agent: {
    name: 'Daniel Oceguera',
    title: 'REALTOR®',
    business: 'Daniel Oceguera AZ Real Estate',
    phone: '602-625-5625',
    email: '',
    facebookPage: 'Daniel Oceguera AZ Real Estate Agent',
    facebookUrl: '',
    licenseNumber: '',
    brokerage: '',
    languages: ['es', 'en'],
    specialties: ['ITIN buyer programs', 'First-time buyers', 'Bilingual ES/EN'],
  },
  // The referral partner — the person running this system and earning the fee.
  partner: {
    name: '',
    email: '',
    phone: '',
  },
  commissions: {
    // Typical buyer-side commission the agent earns on a closing.
    agentCommissionPct: 2.5,
    // Share of the agent's gross commission paid to the referrer.
    referralPct: 25,
    // Optional flat fee per closed deal, added on top of the percentage split.
    flatBonusPerClose: 0,
    // Optional flat fee for a qualified, accepted lead (paid before closing).
    perQualifiedLead: 0,
    currency: 'USD',
  },
  goals: {
    monthlyRevenue: 5000,
    monthlyLeads: 60,
    monthlyQualified: 15,
    monthlyClosings: 2,
  },
  outreach: {
    defaultLanguage: 'es',
    quietHoursStart: 21, // 9pm local — do not schedule follow-ups after this
    quietHoursEnd: 8,
    dailyOutreachTarget: 20,
  },
  publicSite: {
    // Public base URL used to build tracked links. Change if you expose the app
    // through a tunnel (ngrok/Cloudflare) or host the landing page elsewhere.
    baseUrl: '',
    headline: {
      es: '¿Quieres comprar casa en Arizona? Te ayudamos — incluso con ITIN.',
      en: 'Want to buy a home in Arizona? We can help — ITIN programs available.',
    },
  },
  integrations: {
    facebook: {
      enabled: false,
      pageId: '',
      // A Facebook Page access token with leads_retrieval permission. Only used
      // for the official Lead Ads API — this app never scrapes Facebook.
      accessToken: '',
      formIds: [],
      lastSyncAt: null,
    },
    webhook: {
      enabled: true,
      // Shared secret required on POST /api/public/lead when set.
      secret: '',
    },
  },
  server: {
    port: 4317,
    host: '127.0.0.1',
  },
  meta: {
    createdAt: null,
    updatedAt: null,
    version: 1,
  },
};

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override === undefined ? base : override;
  }
  if (base && typeof base === 'object' && override && typeof override === 'object') {
    const out = { ...base };
    for (const [k, v] of Object.entries(override)) {
      out[k] = deepMerge(base[k], v);
    }
    return out;
  }
  return override === undefined ? base : override;
}

export function getSettings() {
  const saved = store.read('settings');
  const merged = deepMerge(DEFAULT_SETTINGS, saved || {});
  if (!merged.meta.createdAt) {
    merged.meta.createdAt = nowIso();
    store.write('settings', merged);
  }
  return merged;
}

export function saveSettings(changes) {
  const current = getSettings();
  const next = deepMerge(current, changes);
  next.meta.updatedAt = nowIso();
  store.write('settings', next);
  return next;
}

/** Settings safe to hand to the browser — secrets redacted. */
export function publicSettings() {
  const s = getSettings();
  return {
    ...s,
    integrations: {
      ...s.integrations,
      facebook: {
        ...s.integrations.facebook,
        accessToken: s.integrations.facebook.accessToken ? '••••••••' : '',
        hasToken: Boolean(s.integrations.facebook.accessToken),
      },
      webhook: {
        ...s.integrations.webhook,
        secret: s.integrations.webhook.secret ? '••••••••' : '',
        hasSecret: Boolean(s.integrations.webhook.secret),
      },
    },
  };
}

export function baseUrl() {
  const s = getSettings();
  if (s.publicSite.baseUrl) return s.publicSite.baseUrl.replace(/\/+$/, '');
  return `http://${s.server.host}:${s.server.port}`;
}
