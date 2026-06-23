// RESOLUTION automatique.
// Pour chaque prediction arrivee a echeance : on va chercher le resultat
// REEL sur une source publique, on marque gagne/perdu et on lie la preuve.
// On ne touche jamais aux champs figes ; on ne fait qu'AJOUTER le resultat.

import { load, save, due, integrityViolations } from "./lib/ledger.mjs";
import { isUntampered } from "./lib/hash.mjs";
import { priceAt } from "./lib/sources/crypto.mjs";
import { observedTmax } from "./lib/sources/meteo.mjs";
import { frNumber } from "./lib/dates.mjs";

function compare(actual, comparator, threshold) {
  if (comparator === ">=") return actual >= threshold;
  if (comparator === "<=") return actual <= threshold;
  if (comparator === ">") return actual > threshold;
  if (comparator === "<") return actual < threshold;
  throw new Error(`comparateur inconnu : ${comparator}`);
}

/** Va chercher le resultat reel. Renvoie null si pas encore disponible. */
async function measure(pred) {
  const { method, params } = pred.resolution;

  if (method === "crypto.priceAt") {
    const r = await priceAt(params.id, params.atMs);
    const hit = compare(r.price, params.comparator, params.threshold);
    return {
      hit,
      actual: +r.price.toFixed(2),
      actual_label: `${frNumber(Math.round(r.price))} $`,
      evidence_url: r.sourceUrl,
      measured_at: new Date(r.at).toISOString(),
    };
  }

  if (method === "meteo.observedTmax") {
    const r = await observedTmax(params.city, params.dateISO);
    if (!r) return null; // mesure pas encore publiee -> on reessaiera
    const hit = compare(r.tmax, params.comparator, params.threshold);
    return {
      hit,
      actual: +r.tmax.toFixed(1),
      actual_label: `${r.tmax.toFixed(1)} °C`,
      evidence_url: r.sourceUrl,
      measured_at: new Date().toISOString(),
    };
  }

  throw new Error(`methode de resolution inconnue : ${method}`);
}

async function main() {
  const now = Date.now();
  const ledger = await load();

  const violations = integrityViolations(ledger);
  if (violations.length) {
    console.error(`⚠ INTEGRITE : ${violations.length} prediction(s) falsifiee(s) : ${violations.join(", ")}`);
  }

  const toResolve = due(ledger, now);
  if (!toResolve.length) {
    console.log("Aucune prediction a resoudre pour l'instant.");
    return;
  }

  let resolved = 0;
  for (const pred of toResolve) {
    if (!isUntampered(pred)) {
      console.error(`! ${pred.id} ignoree (empreinte non valide).`);
      continue;
    }
    try {
      const m = await measure(pred);
      if (!m) {
        console.log(`… ${pred.id} : resultat pas encore disponible.`);
        continue;
      }
      pred.result = {
        resolved_at: new Date(now).toISOString(),
        outcome: m.hit ? "win" : "loss",
        hit: m.hit ? 1 : 0,
        actual: m.actual,
        actual_label: m.actual_label,
        evidence_url: m.evidence_url,
        measured_at: m.measured_at,
      };
      resolved++;
      console.log(`${m.hit ? "✅" : "❌"} ${pred.id} : ${pred.statement}  -> ${m.actual_label}`);
    } catch (err) {
      console.error(`! ${pred.id} : echec de resolution (${err.message}). On reessaiera.`);
    }
  }

  if (resolved > 0) {
    await save(ledger);
    console.log(`\n✓ ${resolved} prediction(s) resolue(s).`);
  } else {
    console.log("Rien de resolu cette fois.");
  }
}

main().catch((err) => {
  console.error("ECHEC resolution :", err);
  process.exit(1);
});
