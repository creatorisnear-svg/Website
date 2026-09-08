// Bilingual content engine.
//
// Generates ready-to-post Facebook copy, DM scripts and follow-up messages in
// Spanish and English, styled after the agent's existing posts (emoji header,
// beds/baths/sqft line, phone number, bilingual duplication).

import { fillTemplate, money, prettyPhone, uid, nowIso } from '../lib/util.js';
import { CITIES, PROGRAMS } from './market.js';
import { getSettings } from './settings.js';

// ---------------------------------------------------------------------------
// Post templates
// ---------------------------------------------------------------------------

export const POST_TYPES = [
  { id: 'listing',     label: 'Listing showcase',        labelEs: 'Publicación de propiedad' },
  { id: 'itin',        label: 'ITIN program',            labelEs: 'Programa ITIN' },
  { id: 'buyer_tip',   label: 'Buyer education tip',     labelEs: 'Consejo para compradores' },
  { id: 'rent_vs_buy', label: 'Rent vs. buy',            labelEs: 'Rentar vs. comprar' },
  { id: 'open_house',  label: 'Open house',              labelEs: 'Casa abierta' },
  { id: 'testimonial', label: 'Client win / testimonial', labelEs: 'Testimonio de cliente' },
  { id: 'market',      label: 'Market update',           labelEs: 'Reporte del mercado' },
  { id: 'question',    label: 'Engagement question',     labelEs: 'Pregunta para comentarios' },
  { id: 'dpa',         label: 'Down payment help',       labelEs: 'Ayuda con el enganche' },
];

const TEMPLATES = {
  listing: {
    es: [
      `🏡 {{price}} · {{beds}} recámaras · {{baths}} baños · {{sqft}} sqft
📍 {{city}}, AZ

{{hook}}

✅ Programas con ITIN disponibles
✅ Enganche desde 5%
✅ Te ayudo en español, paso a paso

📲 Llámame o mándame mensaje: {{phone}}
👉 Agenda tu visita: {{link}}

#CasasEnArizona #{{cityTag}} #ITIN #BienesRaices`,
      `🔑 ¡Nueva propiedad en {{city}}!

{{beds}} cuartos · {{baths}} baños · {{sqft}} sqft
💵 {{price}}

{{hook}}

¿Te gustaría verla esta semana? Tengo citas disponibles.
📲 {{phone}}
👉 {{link}}`,
    ],
    en: [
      `🏡 {{price}} · {{beds}} beds · {{baths}} baths · {{sqft}} sqft
📍 {{city}}, AZ

{{hook}}

✅ ITIN programs available
✅ Down payment from 5%
✅ Bilingual help start to finish

📲 Call or text: {{phone}}
👉 Book a showing: {{link}}

#ArizonaRealEstate #{{cityTag}} #FirstTimeHomeBuyer`,
      `🔑 Just listed in {{city}}!

{{beds}} bed · {{baths}} bath · {{sqft}} sqft
💵 {{price}}

{{hook}}

Want to see it this week? I have showings open.
📲 {{phone}}
👉 {{link}}`,
    ],
  },
  itin: {
    es: [
      `¿TIENES NÚMERO ITIN? 🏠

¡Tú también puedes ser dueño de tu casa!

Califica con SOLO tu número ITIN — no se requiere número de Seguro Social.

💰 5% de enganche — haz tu sueño realidad
💰 10% de enganche — más opciones para ti
💰 20% de enganche — mejores condiciones

✅ Programas diseñados para ti
✅ Asesoría personalizada en todo el proceso
✅ Todo en español

Tu casa, tu futuro, ¡tu momento es ahora!
📲 {{phone}}
👉 Checa si calificas en 2 minutos: {{link}}`,
      `Muchas familias creen que sin Seguro Social no pueden comprar casa. ❌

La realidad: con tu número ITIN SÍ puedes. ✅

Ya he ayudado a familias en {{cityList}} a comprar su primera casa usando su ITIN.

¿Quieres saber cuánto necesitas de enganche?
Mándame mensaje o llena esto: {{link}}
📲 {{phone}}`,
    ],
    en: [
      `HAVE AN ITIN NUMBER? 🏠

You can own a home too.

Qualify with just your ITIN — no Social Security number required.

💰 5% down — get started
💰 10% down — more options
💰 20% down — best terms

✅ Programs built for you
✅ Guidance through every step
✅ Bilingual service

📲 {{phone}}
👉 See if you qualify in 2 minutes: {{link}}`,
    ],
  },
  rent_vs_buy: {
    es: [
      `¿Sabes cuánto pagas de renta al año? 😳

{{rentMonthly}} al mes = {{rentYearly}} al año.
En 5 años son {{rentFive}} … y la casa sigue sin ser tuya.

Con {{downExample}} de enganche podrías estar pagando TU propia casa en {{city}}.

Te hago los números gratis, sin compromiso.
📲 {{phone}}
👉 {{link}}`,
    ],
    en: [
      `Do you know what you pay in rent each year? 😳

{{rentMonthly}}/month = {{rentYearly}}/year.
Over 5 years that's {{rentFive}} … and the house still isn't yours.

With {{downExample}} down you could be paying off YOUR own home in {{city}}.

I'll run your numbers free, no obligation.
📲 {{phone}}
👉 {{link}}`,
    ],
  },
  buyer_tip: {
    es: [
      `Consejo #{{tipNumber}} para comprar casa en Arizona 🏡

{{tip}}

¿Tienes dudas? Pregúntame en los comentarios, contesto todas. 👇
📲 {{phone}}`,
    ],
    en: [
      `Home buying tip #{{tipNumber}} for Arizona 🏡

{{tip}}

Questions? Drop them in the comments — I answer every one. 👇
📲 {{phone}}`,
    ],
  },
  open_house: {
    es: [
      `🚪 CASA ABIERTA este {{day}}
📍 {{address}}, {{city}}
🕐 {{time}}

{{beds}} recámaras · {{baths}} baños · {{price}}

Ven a conocerla, no necesitas cita. Te explico cómo calificar ahí mismo — incluso con ITIN.
📲 {{phone}}`,
    ],
    en: [
      `🚪 OPEN HOUSE this {{day}}
📍 {{address}}, {{city}}
🕐 {{time}}

{{beds}} beds · {{baths}} baths · {{price}}

Stop by, no appointment needed. I'll walk you through qualifying right there — ITIN welcome.
📲 {{phone}}`,
    ],
  },
  testimonial: {
    es: [
      `🎉 ¡Otra familia con las llaves de SU casa!

{{story}}

Esto es lo que más me gusta de mi trabajo. Si tú también quieres dejar de rentar, hablemos.
📲 {{phone}}
👉 {{link}}`,
    ],
    en: [
      `🎉 Another family with the keys to THEIR home!

{{story}}

This is the best part of the job. If you're ready to stop renting, let's talk.
📲 {{phone}}
👉 {{link}}`,
    ],
  },
  market: {
    es: [
      `📊 Reporte del mercado — {{city}}, AZ

Precio promedio: {{medianPrice}}
Con 5% de enganche: {{downFive}}
Con 10% de enganche: {{downTen}}

Todavía hay casas al alcance en el West Valley. Te mando la lista de esta semana gratis.
📲 {{phone}}
👉 {{link}}`,
    ],
    en: [
      `📊 Market update — {{city}}, AZ

Median price: {{medianPrice}}
5% down: {{downFive}}
10% down: {{downTen}}

There are still reachable homes in the West Valley. I'll send you this week's list free.
📲 {{phone}}
👉 {{link}}`,
    ],
  },
  question: {
    es: [
      `Pregunta rápida para mis paisanos 👇

Si pudieras comprar casa este año, ¿en qué ciudad la querrías?

1️⃣ {{city1}}
2️⃣ {{city2}}
3️⃣ {{city3}}

Comenta el número y te mando las casas disponibles en esa zona. 🏡`,
    ],
    en: [
      `Quick question 👇

If you could buy a home this year, which city would you pick?

1️⃣ {{city1}}
2️⃣ {{city2}}
3️⃣ {{city3}}

Comment the number and I'll send you what's available there. 🏡`,
    ],
  },
  dpa: {
    es: [
      `💵 ¿El enganche es lo que te detiene?

Existen programas de ayuda para el enganche en Arizona:
{{programList}}

No todos aplican para todos, por eso reviso tu caso GRATIS.
📲 {{phone}}
👉 {{link}}`,
    ],
    en: [
      `💵 Is the down payment what's stopping you?

Arizona has down payment assistance programs:
{{programList}}

Not everyone qualifies for every program — I'll review your case FREE.
📲 {{phone}}
👉 {{link}}`,
    ],
  },
};

const TIPS = {
  es: [
    'Antes de buscar casa, consigue tu carta de precalificación. Sin ella, los vendedores no toman tu oferta en serio.',
    'Tu pago mensual no es solo el préstamo: incluye impuestos, seguro y a veces HOA. Yo te desgloso el número real.',
    'No necesitas 20% de enganche. Hay programas desde 3.5% y con ITIN desde 5%.',
    'Revisa tu crédito 6 meses antes de comprar. Subir 20 puntos puede bajarte el pago cientos de dólares al mes.',
    'No cierres ni abras tarjetas de crédito mientras estás en proceso de compra. Puede tumbar tu préstamo.',
    'Guarda tus depósitos en el banco, no en efectivo. El prestamista necesita ver el historial del dinero.',
    'La inspección cuesta unos $400 y te puede ahorrar $20,000. Nunca la saltes.',
    'Si eres casado y solo uno tiene ITIN, todavía hay opciones. Pregúntame.',
  ],
  en: [
    'Get your pre-approval letter before you start touring. Without it sellers will not take your offer seriously.',
    'Your monthly payment is more than the loan — taxes, insurance and sometimes HOA. I will break down the real number.',
    'You do not need 20% down. Programs start at 3.5%, and ITIN programs start at 5%.',
    'Check your credit 6 months before buying. Twenty points can cut hundreds off your monthly payment.',
    'Do not open or close credit cards while you are under contract. It can sink your loan.',
    'Keep deposits in the bank, not in cash. Your lender has to trace where the money came from.',
    'A $400 inspection can save you $20,000. Never skip it.',
    'If you are married and only one spouse has an ITIN, there are still options. Ask me.',
  ],
};

function pick(arr, seed) {
  if (!arr || !arr.length) return '';
  const i = seed == null ? Math.floor(Math.random() * arr.length) : Math.abs(seed) % arr.length;
  return arr[i];
}

/**
 * Generate a post. `vars` supplies listing details; anything missing falls back
 * to sensible market defaults so a post is always usable.
 */
export function generatePost({ type = 'itin', language = 'es', vars = {}, variant = null, link = '' } = {}) {
  const settings = getSettings();
  const phone = prettyPhone(settings.agent.phone) || settings.agent.phone;
  const bank = TEMPLATES[type]?.[language] || TEMPLATES.itin[language] || TEMPLATES.itin.es;
  const tpl = pick(bank, variant);

  const cityName = vars.city || 'Avondale';
  const cityRow = CITIES.find((c) => c.name === cityName) || CITIES[0];
  const median = cityRow?.medianPrice || 420000;
  const rentMonthly = vars.rentMonthly || 1850;
  const tipIndex = vars.tipNumber ? Number(vars.tipNumber) - 1 : Math.floor(Math.random() * TIPS[language].length);

  const cityPool = CITIES.filter((c) => c.tier === 'core').map((c) => c.name);

  // NOTE: `vars` is spread FIRST so the formatted values below win. Spreading it
  // last would put raw numbers (580000) back over formatted money ($580,000).
  const merged = {
    ...vars,
    phone,
    link: link || '',
    city: cityName,
    cityTag: cityName.replace(/[^A-Za-z]/g, ''),
    cityList: cityPool.slice(0, 3).join(', '),
    city1: vars.city1 || cityPool[0],
    city2: vars.city2 || cityPool[1],
    city3: vars.city3 || cityPool[2],
    price: vars.price ? money(vars.price) : money(median),
    beds: vars.beds || 4,
    baths: vars.baths || 2,
    sqft: vars.sqft ? Number(vars.sqft).toLocaleString('en-US') : '1,850',
    hook: vars.hook || (language === 'es'
      ? 'Cocina abierta, patio grande y a minutos de la escuela y el freeway.'
      : 'Open kitchen, big yard, minutes from schools and the freeway.'),
    medianPrice: money(median),
    downFive: money(median * 0.05),
    downTen: money(median * 0.1),
    downExample: money(median * 0.05),
    rentMonthly: money(rentMonthly),
    rentYearly: money(rentMonthly * 12),
    rentFive: money(rentMonthly * 60),
    tip: vars.tip || TIPS[language][tipIndex % TIPS[language].length],
    tipNumber: (tipIndex % TIPS[language].length) + 1,
    address: vars.address || '',
    day: vars.day || (language === 'es' ? 'sábado' : 'Saturday'),
    time: vars.time || '11am - 2pm',
    story: vars.story || (language === 'es'
      ? 'Empezaron pensando que no calificaban. Tres meses después firmaron con su ITIN y 5% de enganche.'
      : 'They started out thinking they would never qualify. Three months later they closed with an ITIN and 5% down.'),
    programList: PROGRAMS.map((p) =>
      `• ${language === 'es' ? p.nameEs : p.name}: ${language === 'es' ? p.summaryEs : p.summaryEn}`,
    ).join('\n'),
  };

  let body = fillTemplate(tpl, merged);
  if (!link) body = body.replace(/^.*\{\{link\}\}.*$/gm, '').replace(/👉\s*$/gm, '');
  body = body.replace(/\n{3,}/g, '\n\n').trim();
  return body;
}

/** Generate the Spanish + English pair the agent posts together. */
export function generateBilingualPost(opts = {}) {
  return {
    es: generatePost({ ...opts, language: 'es' }),
    en: generatePost({ ...opts, language: 'en' }),
    combined: `${generatePost({ ...opts, language: 'es' })}\n\n— — —\n\n${generatePost({ ...opts, language: 'en' })}`,
  };
}

// ---------------------------------------------------------------------------
// Outreach scripts (DM / call / text)
// ---------------------------------------------------------------------------

export const OUTREACH = {
  first_touch: {
    es: `Hola {{firstName}}, soy {{agentName}}, agente de bienes raíces aquí en Arizona. Vi que te interesa comprar casa {{cityPhrase}}. ¿Te puedo mandar 3 opciones que quedan en tu presupuesto? Sin compromiso. 🏡`,
    en: `Hi {{firstName}}, this is {{agentName}}, a local Arizona realtor. I saw you're interested in buying {{cityPhrase}}. Can I send you 3 options in your budget? No obligation. 🏡`,
  },
  itin_offer: {
    es: `Hola {{firstName}} 👋 Muchos no saben que con número ITIN sí se puede comprar casa (desde 5% de enganche). ¿Quieres que revise si calificas? Solo toma 2 minutos y es gratis. — {{agentName}}, {{phone}}`,
    en: `Hi {{firstName}} 👋 A lot of people don't know you can buy with an ITIN (as little as 5% down). Want me to check if you qualify? Takes 2 minutes and it's free. — {{agentName}}, {{phone}}`,
  },
  no_answer_1: {
    es: `Hola {{firstName}}, te marqué hoy pero no te encontré. ¿Cuál es mejor hora para llamarte? También te puedo mandar todo por mensaje. — {{agentName}}`,
    en: `Hi {{firstName}}, I called today but missed you. What's a better time to reach you? I can also send everything by text. — {{agentName}}`,
  },
  no_answer_2: {
    es: `{{firstName}}, no quiero molestarte. Solo dime "sí" y te mando la lista de casas en {{city}} de esta semana, o "no" y ya no te escribo. 🙂`,
    en: `{{firstName}}, I don't want to bother you. Just reply "yes" and I'll send this week's homes in {{city}}, or "no" and I'll stop reaching out. 🙂`,
  },
  nurture_value: {
    es: `Hola {{firstName}}, esta semana bajaron 4 casas de precio en {{city}}. Una quedó en {{price}} con {{beds}} recámaras. ¿Te la mando? — {{agentName}}`,
    en: `Hi {{firstName}}, four homes dropped in price in {{city}} this week. One is at {{price}} with {{beds}} beds. Want me to send it? — {{agentName}}`,
  },
  lender_handoff: {
    es: `{{firstName}}, el siguiente paso es tu precalificación. Toma 10 minutos por teléfono y no afecta tu crédito. ¿Te conecto hoy con mi prestamista de confianza?`,
    en: `{{firstName}}, the next step is your pre-approval. It's a 10-minute call and won't hurt your credit. Can I connect you with my trusted lender today?`,
  },
  reactivate: {
    es: `Hola {{firstName}}, ha pasado tiempo. Las tasas cambiaron y hay más opciones que antes en {{city}}. ¿Sigues buscando casa? — {{agentName}}`,
    en: `Hi {{firstName}}, it's been a while. Rates have moved and there are more options in {{city}} now. Still looking? — {{agentName}}`,
  },
  comment_reply: {
    es: `¡Gracias por comentar, {{firstName}}! Te mando la información por mensaje ahorita. 📩`,
    en: `Thanks for commenting, {{firstName}}! Sending you the info by message now. 📩`,
  },
};

export function outreachScript(key, lead = {}, extra = {}) {
  const settings = getSettings();
  const lang = lead.language === 'en' ? 'en' : 'es';
  const tpl = OUTREACH[key]?.[lang] || OUTREACH.first_touch[lang];
  const cityPhrase = lead.city
    ? (lang === 'es' ? `en ${lead.city}` : `in ${lead.city}`)
    : (lang === 'es' ? 'en el área de Phoenix' : 'in the Phoenix area');
  return fillTemplate(tpl, {
    firstName: lead.firstName || (lang === 'es' ? 'amigo' : 'there'),
    agentName: settings.agent.name,
    phone: prettyPhone(settings.agent.phone),
    city: lead.city || 'Phoenix',
    cityPhrase,
    price: lead.budgetMax ? money(lead.budgetMax) : money(400000),
    beds: lead.beds || 3,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Follow-up sequences
// ---------------------------------------------------------------------------

/** Day-offset cadence used to auto-schedule touches on a new lead. */
export const SEQUENCES = {
  standard: {
    name: 'Standard buyer nurture',
    steps: [
      { day: 0,  channel: 'call', script: 'first_touch',    title: 'Call within 5 minutes' },
      { day: 0,  channel: 'sms',  script: 'first_touch',    title: 'Text if no answer' },
      { day: 1,  channel: 'call', script: 'no_answer_1',    title: 'Second call attempt' },
      { day: 3,  channel: 'sms',  script: 'no_answer_2',    title: 'Yes/no text' },
      { day: 7,  channel: 'sms',  script: 'nurture_value',  title: 'Send new listings' },
      { day: 14, channel: 'call', script: 'lender_handoff', title: 'Pre-approval push' },
      { day: 30, channel: 'sms',  script: 'reactivate',     title: 'Monthly check-in' },
      { day: 60, channel: 'sms',  script: 'reactivate',     title: '60-day reactivation' },
    ],
  },
  itin: {
    name: 'ITIN buyer education',
    steps: [
      { day: 0,  channel: 'sms',  script: 'itin_offer',     title: 'ITIN qualification offer' },
      { day: 1,  channel: 'call', script: 'first_touch',    title: 'Call to explain program' },
      { day: 4,  channel: 'sms',  script: 'nurture_value',  title: 'Send ITIN-friendly homes' },
      { day: 10, channel: 'call', script: 'lender_handoff', title: 'Connect to ITIN lender' },
      { day: 21, channel: 'sms',  script: 'reactivate',     title: 'Check back in' },
    ],
  },
  fast: {
    name: 'Ready-now buyer',
    steps: [
      { day: 0, channel: 'call', script: 'first_touch',    title: 'Call immediately' },
      { day: 0, channel: 'sms',  script: 'first_touch',    title: 'Text listings' },
      { day: 1, channel: 'call', script: 'lender_handoff', title: 'Pre-approval call' },
      { day: 3, channel: 'call', script: 'no_answer_1',    title: 'Schedule showings' },
    ],
  },
};

export function sequenceFor(lead) {
  if (lead.financing === 'itin') return 'itin';
  if (lead.timeline === 'now' || lead.preApproved) return 'fast';
  return 'standard';
}
