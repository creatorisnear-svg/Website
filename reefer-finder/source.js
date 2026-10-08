// Load source adapter. The dashboard only calls getLoads(); swap the body for a real feed.
// Each load: {id, origin:{city,st}, dest:{city,st}, miles, deadhead, rate, weight, pickup, commodity, temp, broker, phone, postedMins}
//
// To use a real feed: set LIVE_URL to an endpoint that returns this JSON shape
// (e.g. a small local script on your computer that calls your load board's official API).
const LIVE_URL = null; // e.g. "http://localhost:8787/loads"

const CITIES = [
  ["Fresno","CA"],["Los Angeles","CA"],["Salinas","CA"],["Phoenix","AZ"],["Dallas","TX"],["Laredo","TX"],
  ["Atlanta","GA"],["Miami","FL"],["Chicago","IL"],["Denver","CO"],["Seattle","WA"],["Boise","ID"],
  ["Kansas City","MO"],["Columbus","OH"],["Harrisburg","PA"],["Newark","NJ"],["Charlotte","NC"],["Memphis","TN"]
];
const COMMODITY = ["Produce","Frozen food","Dairy","Meat","Beverages","Pharma","Seafood","Poultry"];
const BROKERS = ["Cold Chain Logistics","Arctic Freight","Frostline Brokers","PolarMove","Fresh Haul Co"];

function seeded(seed){ return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

function sampleLoads(n = 60){
  const r = seeded(42);
  const pick = a => a[Math.floor(r() * a.length)];
  const out = [];
  for (let i = 0; i < n; i++){
    const o = pick(CITIES); let d = pick(CITIES);
    while (d === o) d = pick(CITIES);
    const miles = Math.round(250 + r() * 2250);
    const perMile = 1.9 + r() * 1.9;
    out.push({
      id: "L" + (1000 + i),
      origin: {city:o[0], st:o[1]}, dest: {city:d[0], st:d[1]},
      miles, deadhead: Math.round(r() * 150),
      rate: Math.round(miles * perMile),
      weight: Math.round(18000 + r() * 24000),
      pickup: new Date(Date.now() + Math.floor(r() * 4) * 864e5).toISOString().slice(0,10),
      commodity: pick(COMMODITY), temp: pick([-10,0,34,36,38]) ,
      broker: pick(BROKERS), phone: "555-01" + String(10 + i).slice(-2),
      postedMins: Math.floor(r() * 240)
    });
  }
  return out;
}

async function getLoads(){
  if (LIVE_URL){
    const res = await fetch(LIVE_URL);
    if (!res.ok) throw new Error("Load feed error " + res.status);
    return res.json();
  }
  return sampleLoads();
}
