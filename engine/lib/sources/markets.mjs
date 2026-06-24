// Source MARCHES : indices, or, petrole, change — via Yahoo Finance (sans cle).
// Meme logique que la crypto : historique -> volatilite -> proba lognormale ;
// resolution = cloture reelle a la date visee.

import { getJson } from "../http.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

// Instruments suivis. `subject` = sujet de phrase, `unit` = mot d'unite,
// `labelPlain` = nom neutre pour le critere, `step` = palier d'arrondi.
export const INSTRUMENTS = {
  "^FCHI": { subject: "Le CAC 40", unit: "points", labelPlain: "CAC 40", step: 50, decimals: 0 },
  "^GSPC": { subject: "Le S&P 500", unit: "points", labelPlain: "S&P 500", step: 25, decimals: 0 },
  "^IXIC": { subject: "Le Nasdaq", unit: "points", labelPlain: "Nasdaq Composite", step: 50, decimals: 0 },
  "GC=F": { subject: "L'once d'or", unit: "dollars", labelPlain: "cours de l'or (once)", step: 20, decimals: 0 },
  "CL=F": { subject: "Le baril de pétrole (WTI)", unit: "dollars", labelPlain: "baril de pétrole WTI", step: 1, decimals: 0 },
  "EURUSD=X": { subject: "L'euro", unit: "dollars", labelPlain: "taux euro / dollar", step: 0.01, decimals: 4 },
};

function parseChart(data) {
  const r = data?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const close = r?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    if (typeof close[i] === "number") out.push({ t: ts[i] * 1000, price: close[i] });
  }
  return out;
}

/** Historique journalier (closes), sur une periode ("3mo", "6mo"...). */
export async function dailyHistory(symbol, range = "3mo") {
  const url = `${CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const data = await getJson(url, { headers: { "user-agent": UA } });
  const pts = parseChart(data);
  if (!pts.length) throw new Error(`Yahoo: pas de donnees pour ${symbol}`);
  return pts;
}

/** Dernier cours connu. */
export async function currentPrice(symbol) {
  const h = await dailyHistory(symbol, "5d");
  return h[h.length - 1].price;
}

/**
 * Cloture reelle la plus proche d'un instant (RESOLUTION).
 * @returns {Promise<{price:number, at:number, sourceUrl:string}|null>}
 */
export async function priceAt(symbol, targetMs) {
  const p1 = Math.floor((targetMs - 8 * 86400000) / 1000);
  const p2 = Math.floor((targetMs + 8 * 86400000) / 1000);
  const sourceUrl = `${CHART}/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`;
  const data = await getJson(sourceUrl, { headers: { "user-agent": UA } });
  const pts = parseChart(data);
  if (!pts.length) return null; // marche peut-etre pas encore cote ce jour-la
  let best = null;
  let bestGap = Infinity;
  for (const p of pts) {
    if (p.t > targetMs + 4 * 86400000) continue; // ne pas prendre trop apres
    const gap = Math.abs(p.t - targetMs);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  if (!best) return null;
  return { price: best.price, at: best.t, sourceUrl };
}
