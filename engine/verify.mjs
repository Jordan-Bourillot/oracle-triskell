// CONTROLE D'INTEGRITE public.
// N'importe qui peut lancer `npm run verify` : on recalcule l'empreinte
// de chaque prediction et on verifie qu'aucune n'a ete modifiee apres
// coup. Code de sortie 1 si une fraude est detectee.

import { load } from "./lib/ledger.mjs";
import { fingerprint } from "./lib/hash.mjs";

const ledger = await load();
let bad = 0;

for (const p of ledger.predictions) {
  if (!p.hash) {
    console.log(`? ${p.id || "(sans id)"} : pas encore figee.`);
    continue;
  }
  const expected = fingerprint(p);
  if (expected !== p.hash) {
    bad++;
    console.error(`✗ ${p.id} : empreinte ${p.hash} attendue ${expected} -> FALSIFIEE`);
  }
}

const total = ledger.predictions.length;
if (bad === 0) {
  console.log(`✓ Integrite OK : ${total} prediction(s), aucune falsifiee.`);
} else {
  console.error(`\n✗ ${bad} prediction(s) falsifiee(s) sur ${total}.`);
  process.exit(1);
}
