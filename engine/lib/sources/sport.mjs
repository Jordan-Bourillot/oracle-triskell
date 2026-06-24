// Source SPORT : football, via TheSportsDB (cle de test gratuite "3").
// Generation : matchs a venir + modele Elo bati sur les resultats de la
//   saison (force des equipes) -> probabilite de victoire.
// Resolution : score final reel du match.

import { getJson } from "../http.mjs";

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

// Ligues suivies. Le filtre "match dans les 10 jours" ne retiendra que
// celles reellement en activite au moment de la generation.
export const LEAGUES = {
  4334: "Ligue 1",
  4328: "Premier League",
  4335: "Liga",
  4332: "Serie A",
  4331: "Bundesliga",
  4351: "Championnat du Brésil",
  4346: "MLS",
};

/** Derniers matchs joues d'une ligue (avec scores). */
export async function pastEvents(leagueId) {
  const data = await getJson(`${BASE}/eventspastleague.php?id=${leagueId}`);
  return data?.events || [];
}

/** Prochains matchs programmes d'une ligue. */
export async function nextEvents(leagueId) {
  const data = await getJson(`${BASE}/eventsnextleague.php?id=${leagueId}`);
  return data?.events || [];
}

/**
 * Resultat reel d'un match (RESOLUTION).
 * @returns {Promise<{finished:boolean, home:number, away:number, label:string, sourceUrl:string}>}
 */
export async function eventResult(idEvent) {
  const sourceUrl = `${BASE}/lookupevent.php?id=${idEvent}`;
  const data = await getJson(sourceUrl);
  const ev = data?.events?.[0];
  const h = ev ? parseInt(ev.intHomeScore, 10) : NaN;
  const a = ev ? parseInt(ev.intAwayScore, 10) : NaN;
  const finished = Number.isInteger(h) && Number.isInteger(a);
  return {
    finished,
    home: h,
    away: a,
    label: ev ? `${ev.strHomeTeam} ${Number.isInteger(h) ? h : "?"}-${Number.isInteger(a) ? a : "?"} ${ev.strAwayTeam}` : "",
    sourceUrl,
  };
}
