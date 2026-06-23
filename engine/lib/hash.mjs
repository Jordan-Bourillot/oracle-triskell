// Le VERROU anti-triche.
// Chaque prediction est resumee en une empreinte (sha256) calculee
// UNIQUEMENT sur ses champs immuables. Si quelqu'un modifie l'enonce,
// la proba, l'echeance ou la date de creation apres coup, l'empreinte
// ne colle plus -> la fraude est visible.
//
// Combine a l'historique public Git (chaque prediction est "commitee"
// avec sa date AVANT l'echeance), ca rend toute reecriture detectable.

import { createHash } from "node:crypto";

/** Champs GELES : ils definissent l'empreinte et ne doivent jamais changer. */
export const FROZEN_FIELDS = [
  "id",
  "category",
  "statement",
  "probability",
  "target_date", // date de l'evenement (AAAA-MM-JJ), figee
  "deadline",
  "created_at",
  "resolution", // le CRITERE (comment on tranchera), pas le resultat
  "reasoning", // l'explication publiee au moment de la prediction
  "model", // le modele + ses donnees d'entree (la "preuve" du calcul)
];

/**
 * Serialisation canonique (cles triees) -> meme entree, meme empreinte,
 * quelle que soit la machine.
 */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

/**
 * Empreinte d'une prediction, sur ses champs immuables.
 * NB : `resolution` ici = le CRITERE de resolution (comment on tranchera),
 * pas le resultat. Le resultat est ajoute plus tard, hors empreinte.
 */
export function fingerprint(pred) {
  const frozen = {};
  for (const f of FROZEN_FIELDS) frozen[f] = pred[f] ?? null;
  return createHash("sha256").update(canonical(frozen)).digest("hex").slice(0, 16);
}

/** Verifie qu'une prediction n'a pas ete falsifiee. */
export function isUntampered(pred) {
  return pred.hash && pred.hash === fingerprint(pred);
}
