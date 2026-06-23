// Test rapide SANS reseau : math, verrou anti-triche, logique du registre.
// Lancer : node engine/selftest.mjs

import assert from "node:assert/strict";
import {
  normalCdf,
  invNormalCdf,
  probAboveLognormal,
  brier,
  quantile,
  stdev,
  mean,
} from "./lib/stats.mjs";
import { fingerprint, isUntampered, FROZEN_FIELDS } from "./lib/hash.mjs";

let n = 0;
const ok = (msg) => {
  n++;
  console.log(`  ✓ ${msg}`);
};

// --- Statistiques ---
assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
ok("Phi(0) = 0,5");
assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
ok("Phi(1,96) ≈ 0,975");
assert.ok(Math.abs(invNormalCdf(0.5)) < 1e-6);
ok("invPhi(0,5) = 0");
assert.ok(Math.abs(invNormalCdf(0.975) - 1.96) < 1e-2);
ok("invPhi(0,975) ≈ 1,96");
// aller-retour Phi/invPhi
for (const p of [0.1, 0.3, 0.62, 0.88]) {
  assert.ok(Math.abs(normalCdf(invNormalCdf(p)) - p) < 1e-3);
}
ok("aller-retour Phi/invPhi coherent");

// au seuil = prix actuel, proba ≈ 50 %
assert.ok(Math.abs(probAboveLognormal(100, 100, 0.03, 10) - 0.5) < 1e-6);
ok("proba a seuil = prix actuel vaut 50 %");
// seuil plus haut -> proba plus basse
assert.ok(probAboveLognormal(100, 120, 0.03, 10) < 0.5);
ok("seuil plus haut => proba plus basse");

assert.ok(Math.abs(brier([{ p: 1, hit: 1 }, { p: 0, hit: 0 }])) < 1e-9);
ok("Brier parfait = 0");
assert.ok(Math.abs(brier([{ p: 0.5, hit: 1 }, { p: 0.5, hit: 0 }]) - 0.25) < 1e-9);
ok("Brier a 50 % = 0,25");

assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
ok("mediane de [1,2,3,4] = 2,5");
assert.ok(Math.abs(mean([2, 4, 6]) - 4) < 1e-9 && stdev([2, 4, 6]) > 0);
ok("moyenne / ecart-type");

// --- Verrou anti-triche ---
const pred = {
  id: "crypto-2026-06-24-abc123",
  category: "crypto",
  statement: "Le Bitcoin vaudra 80 000 $ ou plus le 4 juillet 2026.",
  probability: 61,
  created_at: "2026-06-24T10:00:00.000Z",
  deadline: "2026-07-04T00:00:00.000Z",
  resolution: { criterion: "x", method: "crypto.priceAt", params: { id: "bitcoin", threshold: 80000, comparator: ">=", atMs: 1 } },
  reasoning: "Parce que.",
  model: { name: "m", inputs: { a: 1 } },
};
pred.hash = fingerprint(pred);
assert.ok(isUntampered(pred));
ok("empreinte valide juste apres creation");

// on tente de tricher : on baisse la proba apres coup
const cheated = structuredClone(pred);
cheated.probability = 90;
assert.ok(!isUntampered(cheated));
ok("modifier la proba casse l'empreinte (triche detectee)");

// ajouter un resultat NE casse PAS l'empreinte (champ hors gel)
const resolved = structuredClone(pred);
resolved.result = { outcome: "win", hit: 1 };
assert.ok(isUntampered(resolved));
ok("ajouter le resultat ne casse pas l'empreinte");

assert.ok(FROZEN_FIELDS.includes("probability") && FROZEN_FIELDS.includes("deadline"));
ok("champs cles bien dans le gel");

console.log(`\n✓ ${n} controles passes, sans reseau.`);
