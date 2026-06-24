// Generateur ECONOMIE : taux d'emprunt des Etats (obligations).
// Indicateur macro tres suivi, donnees a jour et verifiables (Yahoo Finance).
// Modele = marche aleatoire sur le NIVEAU du taux (volatilite des variations
// quotidiennes). Different de la crypto/marches (additif, pas multiplicatif).

import { dailyHistory } from "../sources/markets.mjs";
import { diffs, stdev, probAboveNormal, invNormalCdf, clampProb, pct } from "../stats.mjs";
import { utcDatePlusDays, frDateFromISO, frNumber } from "../dates.mjs";

// Taux du Tresor americain (reference mondiale), en %.
const RATES = {
  "^TNX": { subject: "Le taux des obligations américaines à 10 ans", labelPlain: "taux à 10 ans des États-Unis" },
  "^TYX": { subject: "Le taux des obligations américaines à 30 ans", labelPlain: "taux à 30 ans des États-Unis" },
};

const PLANS = [
  { horizon: 10, target: 0.63 },
  { horizon: 21, target: 0.4 },
];

const round05 = (x) => Math.round(x / 0.05) * 0.05;

export async function generateEconomy(now = Date.now()) {
  const drafts = [];
  const symbols = Object.keys(RATES);

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const meta = RATES[sym];
    let hist;
    try {
      hist = await dailyHistory(sym, "3mo");
    } catch (err) {
      console.error(`  [economie] ${sym} ignore : ${err.message}`);
      continue;
    }
    const levels = hist.map((h) => h.price);
    const s0 = levels[levels.length - 1];
    const sigma = stdev(diffs(levels)); // volatilite des variations quotidiennes (points de %)
    if (!(sigma > 0) || !(s0 > 0)) continue;

    const { horizon: T, target } = PLANS[i % PLANS.length];
    const z = invNormalCdf(target);
    const K = round05(s0 - z * sigma * Math.sqrt(T));
    if (!(K > 0)) continue;
    const p = clampProb(probAboveNormal(s0, K, sigma, T));
    if (Number.isNaN(p)) continue;

    const dateISO = utcDatePlusDays(T, now);
    const deadline = `${dateISO}T22:00:00.000Z`;
    const frDate = frDateFromISO(dateISO);
    const kStr = frNumber(K, 2);
    const s0Str = frNumber(s0, 2);

    const facts = {
      indicateur: meta.labelPlain,
      niveau_actuel_pct: s0Str,
      seuil_pct: kStr,
      horizon_jours: T,
      volatilite_quotidienne_points: +sigma.toFixed(3),
      proba_modele_pct: pct(p),
      modele: "marche aléatoire sur le niveau du taux",
    };
    const fallback =
      `Le ${meta.labelPlain} tourne autour de ${s0Str} %. Au vu de ses variations quotidiennes récentes, ` +
      `atteindre ${kStr} % d'ici ${T} jours correspond à cette probabilité, sans supposer de tendance.`;

    drafts.push({
      category: "economie",
      statement: `${meta.subject} clôturera à ${kStr} % ou plus le ${frDate}.`,
      probability: pct(p),
      created_at: new Date(now).toISOString(),
      target_date: dateISO,
      deadline,
      resolution: {
        criterion: `Au ${frDate}, le ${meta.labelPlain} relevé sur Yahoo Finance est supérieur ou égal à ${kStr} %.`,
        method: "markets.priceAt",
        params: { symbol: sym, threshold: K, comparator: ">=", atMs: new Date(deadline).getTime(), decimals: 2, unit: "%" },
      },
      model: {
        name: "Marche aléatoire sur le niveau du taux (volatilité des variations quotidiennes)",
        inputs: {
          niveau_initial_pct: +s0.toFixed(3),
          volatilite_quotidienne: +sigma.toFixed(4),
          horizon_jours: T,
          seuil_pct: K,
          formule: "Phi( (S0 - K) / (sigma * racine(T)) )",
        },
      },
      _facts: facts,
      _fallback: fallback,
    });
  }
  return drafts;
}
