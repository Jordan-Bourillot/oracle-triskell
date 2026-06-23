// Generateur CRYPTO.
// Pour chaque actif : on estime la volatilite sur 90 jours, puis on
// choisit un seuil de prix de facon a viser une probabilite donnee
// (pour varier les niveaux), et on PUBLIE la probabilite reelle du
// modele pour ce seuil arrondi. Aucune proba inventee.

import { dailyHistory, ASSETS } from "../sources/crypto.mjs";
import {
  logReturns,
  stdev,
  probAboveLognormal,
  invNormalCdf,
  clampProb,
  pct,
} from "../stats.mjs";
import { utcDatePlusDays, frDateFromISO, frNumber } from "../dates.mjs";

// (horizon en jours, probabilite visee) -> garantit un eventail de proba.
const PLANS = [
  { horizon: 10, target: 0.65 },
  { horizon: 21, target: 0.38 },
];

/** Arrondi a un palier "lisible" selon la grandeur du prix. */
function niceRound(x) {
  const abs = Math.abs(x);
  let step;
  if (abs >= 10000) step = 1000;
  else if (abs >= 1000) step = 100;
  else if (abs >= 100) step = 10;
  else if (abs >= 10) step = 1;
  else step = 0.5;
  return Math.round(x / step) * step;
}

export async function generateCrypto(now = Date.now()) {
  const drafts = [];
  const ids = Object.keys(ASSETS);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const { label, symbol } = ASSETS[id];
    let hist;
    try {
      hist = await dailyHistory(id, 90);
    } catch (err) {
      console.error(`  [crypto] ${id} ignore : ${err.message}`);
      continue;
    }
    const prices = hist.map((h) => h.price);
    const s0 = prices[prices.length - 1];
    const sigma = stdev(logReturns(prices));
    if (!(sigma > 0) || !(s0 > 0)) continue;

    // On decale le plan par actif pour remplir des "cases" de proba differentes.
    const plan = PLANS[i % PLANS.length];
    const altPlan = PLANS[(i + 1) % PLANS.length];
    for (const { horizon, target } of [plan, altPlan]) {
      const T = horizon;
      const z = invNormalCdf(target);
      const kRaw = s0 * Math.exp(-z * sigma * Math.sqrt(T));
      const K = niceRound(kRaw);
      if (!(K > 0)) continue;
      const p = clampProb(probAboveLognormal(s0, K, sigma, T));
      if (Number.isNaN(p)) continue;

      const dateISO = utcDatePlusDays(T, now);
      const deadline = `${dateISO}T00:00:00.000Z`;
      const frDate = frDateFromISO(dateISO);
      const kStr = frNumber(K, K < 10 ? 1 : 0);

      const facts = {
        actif: `${label} (${symbol})`,
        prix_actuel_usd: Math.round(s0),
        seuil_vise_usd: K,
        horizon_jours: T,
        volatilite_journaliere_pct: +(sigma * 100).toFixed(2),
        proba_modele_pct: pct(p),
        modele: "marche aleatoire sans derive sur le log-prix",
      };
      const fallback =
        `Sur 90 jours, le ${symbol} bouge d'environ ${(sigma * 100).toFixed(1)} % par jour. ` +
        `Partant de ${frNumber(Math.round(s0))} $, atteindre ${kStr} $ en ${T} jours ` +
        `correspond à cette probabilité selon une marche aléatoire sans tendance supposée.`;

      drafts.push({
        category: "crypto",
        statement: `${label} (${symbol}) vaudra ${kStr} $ ou plus le ${frDate}.`,
        probability: pct(p),
        created_at: new Date(now).toISOString(),
        target_date: dateISO,
        deadline,
        resolution: {
          criterion: `Au ${frDate}, le prix du ${symbol} relevé sur CoinGecko est supérieur ou égal à ${kStr} $.`,
          method: "crypto.priceAt",
          params: { id, threshold: K, comparator: ">=", atMs: new Date(deadline).getTime() },
        },
        model: {
          name: "Marche aleatoire sans derive sur le log-prix (volatilite 90 jours)",
          inputs: {
            prix_initial_usd: +s0.toFixed(2),
            volatilite_journaliere: +sigma.toFixed(5),
            horizon_jours: T,
            seuil_usd: K,
            formule: "Phi( ln(S0/K) / (sigma * racine(T)) )",
          },
        },
        _facts: facts,
        _fallback: fallback,
      });
    }
  }
  return drafts;
}
