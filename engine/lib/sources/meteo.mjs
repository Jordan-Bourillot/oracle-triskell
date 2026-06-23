// Source METEO : Open-Meteo (aucune cle requise).
// Generation : prevision d'ENSEMBLE (30+ scenarios) -> une vraie
//   probabilite = part des scenarios au-dessus du seuil.
// Resolution : temperature reellement mesuree (donnees observees).

import { getJson } from "../http.mjs";

// Villes suivies (climats varies pour des probas interessantes).
export const CITIES = {
  paris: { label: "Paris", lat: 48.85, lon: 2.35 },
  marseille: { label: "Marseille", lat: 43.3, lon: 5.37 },
  lille: { label: "Lille", lat: 50.63, lon: 3.06 },
  bordeaux: { label: "Bordeaux", lat: 44.84, lon: -0.58 },
};

/**
 * Scenarios d'ensemble de temperature max pour une date cible.
 * @returns {Promise<{date:string, members:number[], sourceUrl:string}>}
 */
export async function ensembleTmax(city, dateISO, forecastDays = 7) {
  const { lat, lon } = CITIES[city];
  const sourceUrl =
    `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max&forecast_days=${forecastDays}&models=gfs025&timezone=Europe%2FParis`;
  const data = await getJson(sourceUrl);
  const days = data?.daily?.time || [];
  const idx = days.indexOf(dateISO);
  if (idx < 0) throw new Error(`Open-Meteo ensemble: date ${dateISO} absente`);
  const members = [];
  for (const key of Object.keys(data.daily)) {
    if (key.startsWith("temperature_2m_max")) {
      const v = data.daily[key][idx];
      if (typeof v === "number") members.push(v);
    }
  }
  if (members.length < 5) throw new Error(`Open-Meteo ensemble: trop peu de scenarios (${members.length})`);
  return { date: dateISO, members, sourceUrl };
}

/**
 * Temperature max REELLEMENT mesuree a une date passee (RESOLUTION).
 * On lit d'abord les jours recents de l'API prevision (qui contient les
 * valeurs observees), puis l'archive en secours.
 * @returns {Promise<{tmax:number, sourceUrl:string}|null>}
 */
export async function observedTmax(city, dateISO) {
  const { lat, lon } = CITIES[city];

  // 1) API prevision avec past_days : contient les valeurs deja mesurees.
  const fcUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max&past_days=10&forecast_days=1&timezone=Europe%2FParis`;
  try {
    const fc = await getJson(fcUrl);
    const i = (fc?.daily?.time || []).indexOf(dateISO);
    if (i >= 0 && typeof fc.daily.temperature_2m_max[i] === "number") {
      return { tmax: fc.daily.temperature_2m_max[i], sourceUrl: fcUrl };
    }
  } catch {
    /* on tente l'archive */
  }

  // 2) Archive (donnees consolidees, leger differe).
  const arUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${dateISO}&end_date=${dateISO}&daily=temperature_2m_max&timezone=Europe%2FParis`;
  try {
    const ar = await getJson(arUrl);
    const v = ar?.daily?.temperature_2m_max?.[0];
    if (typeof v === "number") return { tmax: v, sourceUrl: arUrl };
  } catch {
    /* indisponible pour l'instant */
  }
  return null; // pas encore mesurable -> on resoudra plus tard
}
