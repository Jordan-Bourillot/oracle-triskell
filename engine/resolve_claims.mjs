// RÉSOLUTION des prédictions PUBLIQUES de tiers (le tableau « Qui avait raison ? »).
// Quand une prédiction ouverte arrive à échéance, on va chercher le cours réel
// sur une source publique (Yahoo Finance) et on marque réalisé/raté + preuve.
// Ne touche jamais une entrée déjà tranchée ni une prédiction encore ouverte.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { priceAt } from "./lib/sources/markets.mjs";
import { frNumber, frDateFromISO } from "./lib/dates.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PATH = resolve(HERE, "../public/data/claims.json");

const cmp = (a, op, b) => (op === ">=" ? a >= b : op === "<=" ? a <= b : op === ">" ? a > b : op === "<" ? a < b : false);

const now = Date.now();
let data;
try {
  data = JSON.parse(await readFile(PATH, "utf8"));
} catch {
  console.log("Pas de claims.json, rien à faire.");
  process.exit(0);
}

let n = 0;
for (const c of data.claims || []) {
  if (c.result) continue; // déjà tranchée
  if (!c.deadline || new Date(c.deadline).getTime() > now) continue; // pas encore arrivée à échéance
  const r = c.resolution;
  if (!r || r.method !== "markets.priceAt") continue; // pas auto-résolvable
  try {
    const m = await priceAt(r.params.symbol, new Date(c.deadline).getTime());
    if (!m) {
      console.log(`… ${c.id} : cours pas encore disponible.`);
      continue;
    }
    const hit = cmp(m.price, r.params.comparator, r.params.threshold);
    c.result = {
      outcome: hit ? "win" : "loss",
      hit: hit ? 1 : 0,
      reality_label: `Au ${frDateFromISO(c.deadline.slice(0, 10))} : ${frNumber(Math.round(m.price))} $`,
      evidence_url: `https://finance.yahoo.com/quote/${encodeURIComponent(r.params.symbol)}/`,
      resolved_at: new Date(now).toISOString(),
    };
    n++;
    console.log(`${hit ? "✅" : "❌"} ${c.id} : ${c.author} -> ${Math.round(m.price)}`);
  } catch (e) {
    console.error(`! ${c.id} : ${e.message} (on réessaiera).`);
  }
}

if (n > 0) {
  data.updated_at = new Date(now).toISOString().slice(0, 10);
  await writeFile(PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`\n✓ ${n} prédiction(s) publique(s) tranchée(s).`);
} else {
  console.log("Aucune prédiction publique à trancher pour l'instant.");
}
