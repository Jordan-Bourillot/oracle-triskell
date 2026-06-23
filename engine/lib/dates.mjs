// Dates en francais clair, sans piege de fuseau horaire.

const MOIS = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
];

/** "2026-07-01" -> "1 juillet 2026". */
export function frDateFromISO(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

/** Date du jour + n jours, en UTC, au format AAAA-MM-JJ. */
export function utcDatePlusDays(n, now = Date.now()) {
  return new Date(now + n * 86400000).toISOString().slice(0, 10);
}

/** Date du jour + n jours, fuseau de Paris, au format AAAA-MM-JJ. */
export function parisDatePlusDays(n, now = Date.now()) {
  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(now); // AAAA-MM-JJ
  const [y, m, d] = todayParis.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return new Date(base + n * 86400000).toISOString().slice(0, 10);
}

/** Nombre en francais : 75000 -> "75 000". */
export function frNumber(n, digits = 0) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}
