// Generateur MARCHES (indices, or, petrole, change).
// Identique a la crypto sur le fond : volatilite estimee -> seuil visant
// une probabilite donnee -> probabilite reelle du modele pour ce seuil.

import { dailyHistory, INSTRUMENTS } from "../sources/markets.mjs";
import { logReturns, stdev, probAboveLognormal, invNormalCdf, clampProb, pct } from "../stats.mjs";
import { utcDatePlusDays, frDateFromISO, frNumber } from "../dates.mjs";

const PLANS = [
  { horizon: 7, target: 0.66 },
  { horizon: 21, target: 0.4 },
];

function roundStep(x, step) {
  return Math.round(x / step) * step;
}

export async function generateMarkets(now = Date.now()) {
  const drafts = [];
  const symbols = Object.keys(INSTRUMENTS);

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const inst = INSTRUMENTS[sym];
    let hist;
    try {
      hist = await dailyHistory(sym, "3mo");
    } catch (err) {
      console.error(`  [marches] ${sym} ignore : ${err.message}`);
      continue;
    }
    const prices = hist.map((h) => h.price);
    const s0 = prices[prices.length - 1];
    const sigma = stdev(logReturns(prices));
    if (!(sigma > 0) || !(s0 > 0)) continue;

    // un seul plan par instrument, alterne pour varier les niveaux de proba
    const { horizon: T, target } = PLANS[i % PLANS.length];
    const z = invNormalCdf(target);
    const kRaw = s0 * Math.exp(-z * sigma * Math.sqrt(T));
    const K = roundStep(kRaw, inst.step);
    if (!(K > 0)) continue;
    const p = clampProb(probAboveLognormal(s0, K, sigma, T));
    if (Number.isNaN(p)) continue;

    const dateISO = utcDatePlusDays(T, now);
    const deadline = `${dateISO}T22:00:00.000Z`; // apres la cloture des marches
    const frDate = frDateFromISO(dateISO);
    const kStr = frNumber(K, inst.decimals);
    const s0Str = frNumber(roundStep(s0, inst.step), inst.decimals);

    const facts = {
      actif: inst.labelPlain,
      cours_actuel: s0Str,
      seuil: K,
      unite: inst.unit,
      horizon_jours: T,
      volatilite_journaliere_pct: +(sigma * 100).toFixed(2),
      proba_modele_pct: pct(p),
      modele: "marche aleatoire sans derive sur le log-cours",
    };
    const fallback =
      `Sur trois mois, ${inst.labelPlain} bouge d'environ ${(sigma * 100).toFixed(1)} % par jour. ` +
      `Partant de ${s0Str} ${inst.unit}, atteindre ${kStr} en ${T} jours correspond à cette probabilité, ` +
      `sans supposer de tendance.`;

    drafts.push({
      category: "marches",
      statement: `${inst.subject} clôturera à ${kStr} ${inst.unit} ou plus le ${frDate}.`,
      probability: pct(p),
      created_at: new Date(now).toISOString(),
      target_date: dateISO,
      deadline,
      resolution: {
        criterion: `Au ${frDate}, la clôture du ${inst.labelPlain} relevée sur Yahoo Finance est supérieure ou égale à ${kStr} ${inst.unit}.`,
        method: "markets.priceAt",
        params: { symbol: sym, threshold: K, comparator: ">=", atMs: new Date(deadline).getTime(), decimals: inst.decimals, unit: inst.unit },
      },
      model: {
        name: "Marche aléatoire sans dérive sur le log-cours (volatilité 3 mois)",
        inputs: {
          cours_initial: +s0.toFixed(inst.decimals + 2),
          volatilite_journaliere: +sigma.toFixed(5),
          horizon_jours: T,
          seuil: K,
          formule: "Phi( ln(S0/K) / (sigma * racine(T)) )",
        },
      },
      _facts: facts,
      _fallback: fallback,
    });
  }
  return drafts;
}
