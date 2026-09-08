// Public-facing routes: bilingual landing pages, lead capture, tracked links.
//
// These are the pages a Facebook post links to. They are intentionally
// self-contained (inline CSS, no external requests) so they load instantly on a
// phone over cell data — which is how nearly every one of these visitors
// arrives.

import { sendHtml, sendJson, redirect, queryOf } from '../lib/http.js';
import { escapeHtml, nowIso } from '../lib/util.js';
import { createLead, logActivity } from '../domain/leads.js';
import { recordClick } from '../domain/campaigns.js';
import { getSettings } from '../domain/settings.js';
import { CITIES } from '../domain/market.js';
import { prettyPhone } from '../lib/util.js';
import * as store from '../lib/store.js';

const COPY = {
  es: {
    title: 'Compra tu casa en Arizona',
    eyebrow: 'Programas con ITIN disponibles',
    h1: '¿Quieres comprar casa en Arizona?',
    sub: 'Califica con tu número ITIN — no se requiere Seguro Social. Enganche desde 5%. Te ayudo en español, paso a paso.',
    b1: 'Califica con ITIN',
    b1d: 'Sin número de Seguro Social.',
    b2: 'Enganche desde 5%',
    b2d: 'Opciones de 5%, 10% y 20%.',
    b3: 'Asesoría en español',
    b3d: 'Te acompaño todo el proceso.',
    formTitle: 'Ve si calificas — toma 2 minutos',
    formSub: 'Sin costo y sin compromiso.',
    name: 'Nombre completo',
    phone: 'Teléfono',
    email: 'Correo electrónico (opcional)',
    city: 'Ciudad donde quieres comprar',
    budget: '¿Cuánto quieres pagar por la casa?',
    down: '¿Cuánto tienes para el enganche?',
    timeline: '¿Cuándo quieres comprar?',
    financing: '¿Cómo piensas calificar?',
    message: '¿Algo más que deba saber? (opcional)',
    submit: 'Quiero saber si califico',
    calling: 'O llámame ahora',
    thanks: '¡Gracias! 🎉',
    thanksSub: 'Recibí tu información. Te voy a llamar muy pronto para explicarte tus opciones.',
    thanksCall: 'Si quieres hablar ya mismo, llámame:',
    required: 'Por favor pon tu nombre y teléfono.',
    error: 'Algo salió mal. Intenta otra vez o llámame.',
    choose: 'Selecciona…',
    timelines: { now: 'Lo antes posible', '1-3m': 'En 1 a 3 meses', '3-6m': 'En 3 a 6 meses', '6-12m': 'En 6 a 12 meses', '12m+': 'En más de un año', unknown: 'Todavía no sé' },
    financings: { itin: 'Con mi número ITIN', fha: 'Préstamo FHA', conventional: 'Convencional', va: 'Préstamo VA (veterano)', cash: 'Efectivo', unsure: 'No estoy seguro' },
    downs: { '0': 'Todavía nada', '3': 'Como 3%', '5': 'Como 5%', '10': 'Como 10%', '20': '20% o más' },
    consent: 'Acepto que me contacten por teléfono o mensaje sobre la compra de casa.',
    privacy: 'Tu información es solo para contactarte. Nunca la vendemos.',
  },
  en: {
    title: 'Buy your home in Arizona',
    eyebrow: 'ITIN programs available',
    h1: 'Ready to buy a home in Arizona?',
    sub: 'Qualify with your ITIN — no Social Security number required. As little as 5% down. Bilingual help from start to finish.',
    b1: 'Qualify with ITIN',
    b1d: 'No Social Security number needed.',
    b2: '5% down payment',
    b2d: '5%, 10% and 20% options.',
    b3: 'Bilingual guidance',
    b3d: 'I walk you through every step.',
    formTitle: 'See if you qualify — takes 2 minutes',
    formSub: 'Free, with no obligation.',
    name: 'Full name',
    phone: 'Phone number',
    email: 'Email (optional)',
    city: 'City you want to buy in',
    budget: 'What price range are you looking at?',
    down: 'How much do you have for a down payment?',
    timeline: 'When do you want to buy?',
    financing: 'How do you plan to qualify?',
    message: 'Anything else I should know? (optional)',
    submit: 'See if I qualify',
    calling: 'Or call me now',
    thanks: 'Thank you! 🎉',
    thanksSub: 'I got your information and will call you shortly to go over your options.',
    thanksCall: 'Want to talk right now? Call me:',
    required: 'Please enter your name and phone number.',
    error: 'Something went wrong. Please try again or call me.',
    choose: 'Select…',
    timelines: { now: 'As soon as possible', '1-3m': 'In 1-3 months', '3-6m': 'In 3-6 months', '6-12m': 'In 6-12 months', '12m+': 'More than a year out', unknown: "I'm not sure yet" },
    financings: { itin: 'With my ITIN number', fha: 'FHA loan', conventional: 'Conventional', va: 'VA loan (veteran)', cash: 'Cash', unsure: 'Not sure' },
    downs: { '0': 'Nothing yet', '3': 'About 3%', '5': 'About 5%', '10': 'About 10%', '20': '20% or more' },
    consent: 'I agree to be contacted by phone or text about buying a home.',
    privacy: 'Your information is only used to contact you. We never sell it.',
  },
};

const BUDGETS = [200000, 250000, 300000, 350000, 400000, 450000, 500000, 600000, 750000];

function landingHtml({ lang = 'es', landing = 'itin', query = {} }) {
  const t = COPY[lang] || COPY.es;
  const s = getSettings();
  const phone = prettyPhone(s.agent.phone) || s.agent.phone;
  const telHref = `tel:${String(s.agent.phone).replace(/\D/g, '')}`;
  const other = lang === 'es' ? 'en' : 'es';
  const otherLabel = lang === 'es' ? 'English' : 'Español';
  const cityOptions = CITIES.filter((c) => c.tier !== 'watch')
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');

  const qp = new URLSearchParams(query);
  qp.set('lang', other);

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t.title)} · ${escapeHtml(s.agent.name)}</title>
<meta name="description" content="${escapeHtml(t.sub)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>🏡</text></svg>">
<meta property="og:title" content="${escapeHtml(t.h1)}">
<meta property="og:description" content="${escapeHtml(t.sub)}">
<meta property="og:type" content="website">
<style>
*,*::before,*::after{box-sizing:border-box}
:root{
  --navy:#12213f; --navy-2:#1b3055; --gold:#c8a250; --gold-lt:#e0c98a;
  --ink:#16202f; --muted:#5d6b80; --line:#dfe4ec; --bg:#f6f7fa; --card:#fff;
  --ok:#1f8a52;
}
html,body{margin:0;padding:0}
body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
img{max-width:100%}
.wrap{max-width:640px;margin:0 auto;padding:0 18px}
header{background:linear-gradient(160deg,#12213f 0%,#1b3055 60%,#24406f 100%);color:#fff;padding:26px 0 34px;position:relative;overflow:hidden}
header::after{content:"";position:absolute;inset:auto -40px -60px auto;width:220px;height:220px;border-radius:50%;background:rgba(200,162,80,.16)}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px}
.brand{font-weight:700;letter-spacing:.02em;font-size:15px}
.brand span{color:#c8a250}
.langlink{color:#cfd8e6;text-decoration:none;font-size:13px;border:1px solid rgba(255,255,255,.28);padding:5px 11px;border-radius:999px;white-space:nowrap}
.langlink:hover{background:rgba(255,255,255,.1)}
.eyebrow{display:inline-block;background:rgba(200,162,80,.2);color:#f0dcae;border:1px solid rgba(200,162,80,.45);padding:5px 12px;border-radius:999px;font-size:12.5px;font-weight:600;margin-bottom:12px}
h1{margin:0 0 10px;font-size:clamp(26px,6.4vw,36px);line-height:1.15;letter-spacing:-.015em}
.sub{margin:0;color:#c9d4e4;font-size:15.5px;max-width:34em}
.benefits{display:grid;grid-template-columns:1fr;gap:10px;margin:-20px auto 0;position:relative;z-index:2}
@media(min-width:560px){.benefits{grid-template-columns:repeat(3,1fr)}}
.benefit{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:13px 14px;box-shadow:0 2px 10px rgba(18,33,63,.06)}
.benefit b{display:block;font-size:14.5px;margin-bottom:2px}
.benefit small{color:var(--muted);font-size:12.5px;line-height:1.4;display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 20px;margin:18px 0 26px;box-shadow:0 4px 20px rgba(18,33,63,.07)}
.card h2{margin:0 0 4px;font-size:20px;letter-spacing:-.01em}
.card .hint{margin:0 0 18px;color:var(--muted);font-size:14px}
label{display:block;font-size:13.5px;font-weight:600;margin:14px 0 5px;color:#31415a}
input,select,textarea{width:100%;padding:12px 13px;font:inherit;font-size:16px;border:1px solid var(--line);border-radius:10px;background:#fcfdff;color:var(--ink);-webkit-appearance:none;appearance:none}
/* Checkboxes must keep their native look — appearance:none above would blank them out. */
input[type="checkbox"]{-webkit-appearance:checkbox;appearance:auto;width:auto;padding:0;accent-color:#12213f}
select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath fill='%235d6b80' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--navy-2);box-shadow:0 0 0 3px rgba(27,48,85,.13)}
textarea{min-height:78px;resize:vertical}
.row{display:grid;gap:0 12px}
@media(min-width:520px){.row{grid-template-columns:1fr 1fr}}
.check{display:flex;gap:9px;align-items:flex-start;margin:16px 0 4px;font-size:13px;color:var(--muted);font-weight:400}
.check input{width:17px;height:17px;margin-top:2px;flex:0 0 auto}
button{width:100%;margin-top:16px;padding:15px;font:inherit;font-size:16.5px;font-weight:700;color:#12213f;background:#c8a250;border:0;border-radius:10px;cursor:pointer}
button:hover{background:#b8933f}
button:disabled{opacity:.6;cursor:progress}
.callbox{text-align:center;margin:16px 0 0;font-size:14px;color:var(--muted)}
.callbox a{display:inline-block;margin-top:6px;font-size:22px;font-weight:800;color:var(--navy);text-decoration:none;letter-spacing:.01em}
.privacy{margin:14px 0 0;font-size:11.5px;color:#8894a6;text-align:center;line-height:1.5}
.err{background:#fdeaea;border:1px solid #f3c2c2;color:#9a2020;padding:11px 13px;border-radius:9px;font-size:14px;margin-top:14px;display:none}
.thanks{text-align:center;padding:14px 0}
.thanks h2{font-size:27px;margin:0 0 8px}
.thanks p{color:var(--muted);margin:0 0 18px;font-size:15.5px}
footer{text-align:center;color:#8894a6;font-size:12px;padding:6px 0 34px;line-height:1.6}
.hidden{display:none}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div class="topbar">
      <div class="brand">${escapeHtml(s.agent.name)} <span>· ${escapeHtml(s.agent.title)}</span></div>
      <a class="langlink" href="?${qp.toString()}">${otherLabel}</a>
    </div>
    <div class="eyebrow">${escapeHtml(t.eyebrow)}</div>
    <h1>${escapeHtml(t.h1)}</h1>
    <p class="sub">${escapeHtml(t.sub)}</p>
  </div>
</header>

<div class="wrap">
  <div class="benefits">
    <div class="benefit"><b>✅ ${escapeHtml(t.b1)}</b><small>${escapeHtml(t.b1d)}</small></div>
    <div class="benefit"><b>💰 ${escapeHtml(t.b2)}</b><small>${escapeHtml(t.b2d)}</small></div>
    <div class="benefit"><b>🗣️ ${escapeHtml(t.b3)}</b><small>${escapeHtml(t.b3d)}</small></div>
  </div>

  <div class="card" id="formCard">
    <h2>${escapeHtml(t.formTitle)}</h2>
    <p class="hint">${escapeHtml(t.formSub)}</p>
    <form id="leadForm" novalidate>
      <label for="name">${escapeHtml(t.name)}</label>
      <input id="name" name="name" autocomplete="name" required>

      <div class="row">
        <div>
          <label for="phone">${escapeHtml(t.phone)}</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required>
        </div>
        <div>
          <label for="email">${escapeHtml(t.email)}</label>
          <input id="email" name="email" type="email" inputmode="email" autocomplete="email">
        </div>
      </div>

      <div class="row">
        <div>
          <label for="city">${escapeHtml(t.city)}</label>
          <select id="city" name="city"><option value="">${escapeHtml(t.choose)}</option>${cityOptions}</select>
        </div>
        <div>
          <label for="budgetMax">${escapeHtml(t.budget)}</label>
          <select id="budgetMax" name="budgetMax">
            <option value="">${escapeHtml(t.choose)}</option>
            ${BUDGETS.map((b) => `<option value="${b}">$${b.toLocaleString('en-US')}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="row">
        <div>
          <label for="downPaymentPct">${escapeHtml(t.down)}</label>
          <select id="downPaymentPct" name="downPaymentPct">
            <option value="">${escapeHtml(t.choose)}</option>
            ${Object.entries(t.downs).map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="timeline">${escapeHtml(t.timeline)}</label>
          <select id="timeline" name="timeline">
            ${Object.entries(t.timelines).map(([v, l]) => `<option value="${v}"${v === 'unknown' ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}
          </select>
        </div>
      </div>

      <label for="financing">${escapeHtml(t.financing)}</label>
      <select id="financing" name="financing">
        ${Object.entries(t.financings).map(([v, l]) => `<option value="${v}"${v === (landing === 'itin' ? 'itin' : 'unsure') ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}
      </select>

      <label for="message">${escapeHtml(t.message)}</label>
      <textarea id="message" name="message"></textarea>

      <label class="check"><input type="checkbox" id="consent" checked> <span>${escapeHtml(t.consent)}</span></label>

      <div class="err" id="err"></div>
      <button type="submit" id="submitBtn">${escapeHtml(t.submit)}</button>
    </form>
    <div class="callbox">${escapeHtml(t.calling)}<br><a href="${telHref}">📞 ${escapeHtml(phone)}</a></div>
    <p class="privacy">${escapeHtml(t.privacy)}</p>
  </div>

  <div class="card thanks hidden" id="thanksCard">
    <h2>${escapeHtml(t.thanks)}</h2>
    <p>${escapeHtml(t.thanksSub)}</p>
    <div class="callbox">${escapeHtml(t.thanksCall)}<br><a href="${telHref}">📞 ${escapeHtml(phone)}</a></div>
  </div>

  <footer>${escapeHtml(s.agent.business)} · ${escapeHtml(phone)}<br>Equal Housing Opportunity</footer>
</div>

<script>
(function(){
  var form = document.getElementById('leadForm');
  var err = document.getElementById('err');
  var btn = document.getElementById('submitBtn');
  var params = new URLSearchParams(location.search);

  form.addEventListener('submit', function(e){
    e.preventDefault();
    err.style.display = 'none';
    var data = {};
    new FormData(form).forEach(function(v,k){ data[k] = v; });
    if (!data.name || !data.phone) {
      err.textContent = ${JSON.stringify(t.required)};
      err.style.display = 'block';
      return;
    }
    data.language = ${JSON.stringify(lang)};
    data.landing = ${JSON.stringify(landing)};
    data.source = params.get('utm_source') === 'facebook' ? 'facebook_organic' : 'landing_page';
    data.utm = {
      source: params.get('utm_source') || '',
      medium: params.get('utm_medium') || '',
      campaign: params.get('utm_campaign') || '',
      content: params.get('utm_content') || '',
      term: params.get('utm_term') || ''
    };
    data.campaignId = params.get('cid') || null;
    data.trackCode = params.get('tc') || null;
    data.consent = { smsOptIn: document.getElementById('consent').checked, emailOptIn: document.getElementById('consent').checked };
    btn.disabled = true;

    fetch('/api/public/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r){ return r.json(); }).then(function(res){
      if (res && res.ok) {
        document.getElementById('formCard').classList.add('hidden');
        document.getElementById('thanksCard').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        throw new Error((res && res.error) || 'failed');
      }
    }).catch(function(){
      err.textContent = ${JSON.stringify(t.error)};
      err.style.display = 'block';
      btn.disabled = false;
    });
  });
})();
</script>
</body>
</html>`;
}

export function registerPublicRoutes(router) {
  // Landing pages: /l/itin, /l/buyer, /l/rent-vs-buy ...
  router.get('/l/:landing', (req, res, { params, url }) => {
    const q = queryOf(url);
    const lang = q.lang === 'en' ? 'en' : 'es';
    sendHtml(res, 200, landingHtml({ lang, landing: params.landing, query: q }));
  });

  router.get('/l', (req, res, { url }) => {
    const q = queryOf(url);
    sendHtml(res, 200, landingHtml({ lang: q.lang === 'en' ? 'en' : 'es', landing: 'itin', query: q }));
  });

  // Tracked short link: log the click, then send to the landing page with UTMs.
  router.get('/t/:code', (req, res, { params, req: request }) => {
    const { post } = recordClick(params.code, {
      referrer: request?.headers?.referer || '',
      userAgent: request?.headers?.['user-agent'] || '',
    });
    const qp = new URLSearchParams({
      utm_source: 'facebook',
      utm_medium: post?.channel || 'organic',
      utm_campaign: post?.campaignId || '',
      utm_content: post?.type || '',
      tc: params.code,
    });
    if (post?.campaignId) qp.set('cid', post.campaignId);
    if (post?.language === 'en') qp.set('lang', 'en');
    redirect(res, `/l/${post?.landing || 'itin'}?${qp.toString()}`);
  });

  // Lead capture endpoint. Also usable as a webhook from an external website.
  router.post('/api/public/lead', (req, res, { body, req: request }) => {
    const settings = getSettings();
    const secret = settings.integrations.webhook.secret;
    if (secret) {
      const provided = request?.headers?.['x-webhook-secret'] || body._secret;
      if (provided !== secret) return sendJson(res, 401, { ok: false, error: 'Invalid webhook secret' });
    }
    if (!body.name && !body.phone && !body.email) {
      return sendJson(res, 400, { ok: false, error: 'Name, phone or email required' });
    }

    const ip = request?.headers?.['x-forwarded-for'] || request?.socket?.remoteAddress || '';
    const input = {
      ...body,
      source: body.source || 'landing_page',
      sourceDetail: body.landing || '',
      consent: { ...(body.consent || {}), capturedAt: nowIso(), ip: String(ip).split(',')[0].trim() },
    };
    delete input._secret;

    const { lead, duplicate } = createLead(input);

    if (body.trackCode) {
      const post = store.all('posts').find((p) => p.trackCode === body.trackCode);
      if (post) {
        logActivity(lead.id, 'attribution', `Came from post ${post.type} (${post.trackCode})`);
        if (!lead.campaignId && post.campaignId) {
          store.patch('leads', lead.id, { campaignId: post.campaignId });
        }
      }
    }
    sendJson(res, 200, { ok: true, duplicate, leadId: lead.id });
  });

  // CORS preflight so the form can be embedded on an external site later.
  router.options('/api/public/lead', (req, res) => {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Webhook-Secret',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
  });
}
