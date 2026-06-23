// Generateur METEO.
// On lit une prevision d'ENSEMBLE (≈31 scenarios) a 3 jours, puis on
// choisit un seuil de temperature visant une probabilite donnee, et on
// PUBLIE la part reelle de scenarios au-dessus du seuil. Vraie proba.

import { ensembleTmax, CITIES } from "../sources/meteo.mjs";
import { quantile, clampProb, pct } from "../stats.mjs";
import { parisDatePlusDays, frDateFromISO, frNumber } from "../dates.mjs";

const HORIZON_DAYS = 3;
const TARGETS = [0.6, 0.4, 0.7, 0.45]; // une cible par ville (eventail de proba)

/** Arrondi au demi-degre. */
const round05 = (x) => Math.round(x * 2) / 2;

export async function generateMeteo(now = Date.now()) {
  const drafts = [];
  const dateISO = parisDatePlusDays(HORIZON_DAYS, now);
  const frDate = frDateFromISO(dateISO);
  const cities = Object.keys(CITIES);

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const { label } = CITIES[city];
    let ens;
    try {
      ens = await ensembleTmax(city, dateISO);
    } catch (err) {
      console.error(`  [meteo] ${city} ignore : ${err.message}`);
      continue;
    }
    const members = ens.members;
    const target = TARGETS[i % TARGETS.length];

    // Seuil visant ~target : P(tmax >= X) = part des scenarios >= X.
    const X = round05(quantile(members, 1 - target));
    const share = members.filter((v) => v >= X).length / members.length;
    const p = clampProb(share);
    if (Number.isNaN(p)) continue;

    const deadline = `${dateISO}T23:30:00.000Z`; // apres la fin de journee a Paris
    const xStr = frNumber(X, 1); // "37,5"
    const med = quantile(members, 0.5);
    const lo = Math.min(...members);
    const hi = Math.max(...members);

    const facts = {
      ville: label,
      date: frDate,
      seuil_celsius: X,
      nb_scenarios: members.length,
      mediane_celsius: +med.toFixed(1),
      fourchette_celsius: [`${lo.toFixed(1)}`, `${hi.toFixed(1)}`],
      part_au_dessus_pct: pct(p),
    };
    const fallback =
      `Sur ${members.length} scénarios météo, la température max à ${label} le ${frDate} ` +
      `se situe surtout autour de ${med.toFixed(0)} °C (de ${lo.toFixed(0)} à ${hi.toFixed(0)} °C). ` +
      `La part de scénarios atteignant ${xStr} °C donne cette probabilité.`;

    drafts.push({
      category: "meteo",
      statement: `À ${label}, la température maximale atteindra ${xStr} °C ou plus le ${frDate}.`,
      probability: pct(p),
      created_at: new Date(now).toISOString(),
      target_date: dateISO,
      deadline,
      resolution: {
        criterion: `Le ${frDate}, la température maximale relevée à ${label} (Open-Meteo) est supérieure ou égale à ${xStr} °C.`,
        method: "meteo.observedTmax",
        params: { city, dateISO, threshold: X, comparator: ">=" },
      },
      model: {
        name: "Prevision d'ensemble Open-Meteo (part des scenarios au-dessus du seuil)",
        inputs: {
          nb_scenarios: members.length,
          mediane_celsius: +med.toFixed(2),
          min_celsius: +lo.toFixed(2),
          max_celsius: +hi.toFixed(2),
          seuil_celsius: X,
        },
      },
      _facts: facts,
      _fallback: fallback,
    });
  }
  return drafts;
}
