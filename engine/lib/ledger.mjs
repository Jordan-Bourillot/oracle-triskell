// Le REGISTRE : le fichier public/data/predictions.json.
// C'est la memoire permanente et honnete de l'Oracle.
// - generate.mjs n'AJOUTE que de nouvelles predictions (jamais de retouche).
// - resolve.mjs n'ajoute QUE le resultat a une prediction existante.
// Toute incoherence d'empreinte est signalee, jamais cachee.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, isUntampered } from "./hash.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Chemin du registre. Surchargeable via ORACLE_LEDGER (utile pour les tests).
export const LEDGER_PATH = process.env.ORACLE_LEDGER
  ? resolve(process.cwd(), process.env.ORACLE_LEDGER)
  : resolve(HERE, "../../public/data/predictions.json");

const EMPTY = { title: "L'Oracle", updated_at: null, predictions: [] };

/** Charge le registre (ou un registre vide la premiere fois). */
export async function load() {
  try {
    const raw = await readFile(LEDGER_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.predictions)) data.predictions = [];
    return data;
  } catch {
    return structuredClone(EMPTY);
  }
}

/** Sauvegarde le registre (cree le dossier si besoin). */
export async function save(ledger) {
  ledger.updated_at = new Date().toISOString();
  await mkdir(dirname(LEDGER_PATH), { recursive: true });
  await writeFile(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

/**
 * Ajoute une prediction APRES avoir calcule son empreinte.
 * Refuse un id deja present (pas de doublon, pas d'ecrasement).
 */
export function addPrediction(ledger, pred) {
  if (ledger.predictions.some((p) => p.id === pred.id)) {
    throw new Error(`id deja present : ${pred.id}`);
  }
  pred.hash = fingerprint(pred);
  ledger.predictions.push(pred);
  return pred;
}

/**
 * Controle d'integrite : renvoie la liste des predictions falsifiees
 * (empreinte qui ne colle plus a leurs champs geles).
 */
export function integrityViolations(ledger) {
  return ledger.predictions
    .filter((p) => p.hash) // celles deja figees
    .filter((p) => !isUntampered(p))
    .map((p) => p.id);
}

/** Predictions encore en cours (echeance future, sans resultat). */
export function pending(ledger, now = Date.now()) {
  return ledger.predictions.filter(
    (p) => !p.result && new Date(p.deadline).getTime() > now,
  );
}

/** Predictions arrivees a echeance mais pas encore resolues. */
export function due(ledger, now = Date.now()) {
  return ledger.predictions.filter(
    (p) => !p.result && new Date(p.deadline).getTime() <= now,
  );
}
