// GENERATION hebdomadaire.
// Cree de nouvelles predictions (crypto + meteo), les fait expliquer par
// l'IA, les fige (empreinte) et les ajoute au registre. N'altere jamais
// une prediction existante.

import { createHash } from "node:crypto";
import { load, save, addPrediction, integrityViolations, pending } from "./lib/ledger.mjs";
import { explain } from "./lib/ai.mjs";
import { generateCrypto } from "./lib/generators/crypto.mjs";
import { generateMeteo } from "./lib/generators/meteo.mjs";
import { generateMarkets } from "./lib/generators/markets.mjs";
// Sport (Elo) prêt mais en attente d'une source de données complète
// (la clé gratuite ne renvoie qu'un match) + saisons européennes reprenant fin août.
// import { generateSport } from "./lib/generators/sport.mjs";

function makeId(d) {
  const h = createHash("sha256")
    .update(`${d.category}|${d.statement}|${d.deadline}`)
    .digest("hex")
    .slice(0, 6);
  return `${d.category}-${d.created_at.slice(0, 10)}-${h}`;
}

async function main() {
  const now = Date.now();
  const ledger = await load();

  const violations = integrityViolations(ledger);
  if (violations.length) {
    console.error(`⚠ INTEGRITE : ${violations.length} prediction(s) falsifiee(s) : ${violations.join(", ")}`);
  }

  // Recolte des brouillons (chaque generateur est isole : une panne n'arrete pas l'autre).
  const drafts = [];
  for (const gen of [generateCrypto, generateMeteo, generateMarkets]) {
    try {
      drafts.push(...(await gen(now)));
    } catch (err) {
      console.error(`Generateur en echec : ${err.message}`);
    }
  }

  const pend = pending(ledger, now);
  const existingStatements = new Set(pend.map((p) => p.statement));
  let added = 0;

  for (const d of drafts) {
    if (existingStatements.has(d.statement)) continue; // meme question deja en cours
    d.id = makeId(d);
    if (ledger.predictions.some((p) => p.id === d.id)) continue;

    // L'IA redige l'explication (sans toucher au pourcentage).
    d.reasoning = await explain(d._facts, d._fallback);
    delete d._facts;
    delete d._fallback;

    addPrediction(ledger, d);
    existingStatements.add(d.statement);
    added++;
    console.log(`+ [${d.category}] ${d.statement}  (${d.probability} %)`);
  }

  if (added > 0) {
    await save(ledger);
    console.log(`\n✓ ${added} nouvelle(s) prediction(s) figee(s). Total : ${ledger.predictions.length}.`);
  } else {
    console.log("Aucune nouvelle prediction (rien de neuf ou sources indisponibles).");
  }
}

main().catch((err) => {
  console.error("ECHEC generation :", err);
  process.exit(1);
});
