// Maricopa-area market reference data.
//
// Two distinct places share the name and both matter here:
//   * Maricopa County  — Phoenix metro, where the agent's listings are (Avondale,
//     Goodyear, Buckeye, Glendale, Phoenix...).
//   * City of Maricopa — a separate city in Pinal County, ~35 min south of
//     Chandler, very popular with first-time and ITIN buyers for its low prices.
// Both are covered so neither audience is missed.

export const CITIES = [
  // --- West Valley (the agent's core farm area, per his listings) ---
  { name: 'Avondale', county: 'Maricopa', zips: ['85323', '85392', '85338'], tier: 'core', medianPrice: 420000 },
  { name: 'Goodyear', county: 'Maricopa', zips: ['85338', '85395', '85340'], tier: 'core', medianPrice: 475000 },
  { name: 'Buckeye', county: 'Maricopa', zips: ['85326', '85396'], tier: 'core', medianPrice: 395000 },
  { name: 'Tolleson', county: 'Maricopa', zips: ['85353'], tier: 'core', medianPrice: 375000 },
  { name: 'Litchfield Park', county: 'Maricopa', zips: ['85340'], tier: 'core', medianPrice: 520000 },
  { name: 'Laveen', county: 'Maricopa', zips: ['85339'], tier: 'core', medianPrice: 425000 },
  { name: 'Glendale', county: 'Maricopa', zips: ['85301', '85302', '85303', '85305', '85306', '85307', '85308', '85310'], tier: 'core', medianPrice: 430000 },
  { name: 'Peoria', county: 'Maricopa', zips: ['85345', '85381', '85382', '85383', '85345'], tier: 'core', medianPrice: 470000 },
  { name: 'Surprise', county: 'Maricopa', zips: ['85374', '85378', '85379', '85387', '85388'], tier: 'core', medianPrice: 440000 },
  { name: 'El Mirage', county: 'Maricopa', zips: ['85335'], tier: 'core', medianPrice: 350000 },

  // --- Phoenix proper ---
  { name: 'Phoenix', county: 'Maricopa', zips: ['85009', '85015', '85017', '85019', '85031', '85033', '85035', '85037', '85041', '85043'], tier: 'core', medianPrice: 440000 },
  { name: 'Maryvale', county: 'Maricopa', zips: ['85031', '85033', '85035'], tier: 'core', medianPrice: 330000 },
  { name: 'South Phoenix', county: 'Maricopa', zips: ['85040', '85041', '85042'], tier: 'core', medianPrice: 375000 },

  // --- East Valley ---
  { name: 'Mesa', county: 'Maricopa', zips: ['85201', '85202', '85203', '85204', '85205', '85206', '85207', '85208', '85209', '85210', '85212', '85213'], tier: 'secondary', medianPrice: 455000 },
  { name: 'Chandler', county: 'Maricopa', zips: ['85224', '85225', '85226', '85248', '85249'], tier: 'secondary', medianPrice: 530000 },
  { name: 'Gilbert', county: 'Maricopa', zips: ['85233', '85234', '85295', '85296', '85297', '85298'], tier: 'secondary', medianPrice: 570000 },
  { name: 'Tempe', county: 'Maricopa', zips: ['85281', '85282', '85283', '85284'], tier: 'secondary', medianPrice: 480000 },
  { name: 'Queen Creek', county: 'Maricopa', zips: ['85142', '85140'], tier: 'secondary', medianPrice: 520000 },
  { name: 'Apache Junction', county: 'Pinal', zips: ['85119', '85120'], tier: 'secondary', medianPrice: 350000 },

  // --- City of Maricopa + Pinal corridor (high ITIN / first-time buyer demand) ---
  { name: 'Maricopa (City)', county: 'Pinal', zips: ['85138', '85139'], tier: 'core', medianPrice: 340000 },
  { name: 'Casa Grande', county: 'Pinal', zips: ['85122', '85193', '85194'], tier: 'secondary', medianPrice: 320000 },
  { name: 'Coolidge', county: 'Pinal', zips: ['85128'], tier: 'secondary', medianPrice: 290000 },
  { name: 'Eloy', county: 'Pinal', zips: ['85131'], tier: 'watch', medianPrice: 265000 },
  { name: 'Florence', county: 'Pinal', zips: ['85132'], tier: 'watch', medianPrice: 330000 },
  { name: 'San Tan Valley', county: 'Pinal', zips: ['85140', '85143'], tier: 'secondary', medianPrice: 400000 },

  // --- Outer Maricopa County ---
  { name: 'Avondale/Cashion', county: 'Maricopa', zips: ['85329'], tier: 'watch', medianPrice: 310000 },
  { name: 'Wittmann', county: 'Maricopa', zips: ['85361'], tier: 'watch', medianPrice: 380000 },
  { name: 'Tonopah', county: 'Maricopa', zips: ['85354'], tier: 'watch', medianPrice: 300000 },
];

export const CITY_NAMES = CITIES.map((c) => c.name);

/** Every ZIP we consider "in market". */
export const ZIPS = [...new Set(CITIES.flatMap((c) => c.zips))];

export function findCity(name) {
  if (!name) return null;
  const needle = String(name).trim().toLowerCase();
  return (
    CITIES.find((c) => c.name.toLowerCase() === needle) ||
    CITIES.find((c) => c.name.toLowerCase().includes(needle)) ||
    null
  );
}

export function cityForZip(zip) {
  const z = String(zip || '').trim().slice(0, 5);
  return CITIES.find((c) => c.zips.includes(z)) || null;
}

export function inMarket({ city, zip }) {
  if (zip && cityForZip(zip)) return true;
  if (city && findCity(city)) return true;
  return false;
}

/** Buyer-intent phrases used by the prospecting module, in both languages. */
export const INTENT_PHRASES = {
  es: [
    'quiero comprar casa',
    'busco casa para comprar',
    'comprar casa con ITIN',
    'casa con ITIN Arizona',
    'préstamo con ITIN',
    'primera casa Arizona',
    'cuánto necesito de enganche',
    'no tengo seguro social pero quiero comprar casa',
    'renta con opción a compra',
    'busco agente de bienes raíces que hable español',
    'me quiero salir de la renta',
    'crédito para comprar casa Phoenix',
  ],
  en: [
    'looking to buy a house',
    'first time home buyer Arizona',
    'ITIN home loan',
    'ITIN mortgage Phoenix',
    'rent to own Phoenix',
    'tired of renting want to buy',
    'need a realtor west valley',
    'how much down payment do I need',
    'pre approval home loan Arizona',
    'bilingual realtor Phoenix',
    'buying my first home Maricopa',
    'FHA down payment assistance Arizona',
  ],
};

/** Down-payment assistance / loan programs worth naming in outreach copy. */
export const PROGRAMS = [
  {
    id: 'itin',
    name: 'ITIN Loan Program',
    nameEs: 'Programa de préstamo con ITIN',
    downPct: [5, 10, 20],
    summaryEn: 'Qualify with an ITIN number — no Social Security number required. 5%, 10% or 20% down.',
    summaryEs: 'Califica con tu número ITIN — no se requiere número de Seguro Social. 5%, 10% o 20% de enganche.',
  },
  {
    id: 'fha',
    name: 'FHA Loan',
    nameEs: 'Préstamo FHA',
    downPct: [3.5],
    summaryEn: 'As little as 3.5% down with a 580+ credit score.',
    summaryEs: 'Desde 3.5% de enganche con puntaje de crédito de 580 o más.',
  },
  {
    id: 'homeplus',
    name: 'Arizona Home Plus (DPA)',
    nameEs: 'Arizona Home Plus (ayuda con enganche)',
    downPct: [0],
    summaryEn: 'State down-payment assistance for qualified Arizona buyers.',
    summaryEs: 'Ayuda estatal con el enganche para compradores calificados en Arizona.',
  },
  {
    id: 'va',
    name: 'VA Loan',
    nameEs: 'Préstamo VA',
    downPct: [0],
    summaryEn: '0% down for eligible veterans and active-duty service members.',
    summaryEs: '0% de enganche para veteranos y militares en servicio activo elegibles.',
  },
  {
    id: 'conventional',
    name: 'Conventional',
    nameEs: 'Convencional',
    downPct: [3, 5, 20],
    summaryEn: 'From 3% down for qualified buyers; no PMI at 20%.',
    summaryEs: 'Desde 3% de enganche para compradores calificados; sin PMI con 20%.',
  },
];
