// Generateur SPORT (football).
// Modele Elo : on rejoue les resultats de la saison pour estimer la force
// de chaque equipe, puis on en deduit la probabilite de victoire du match
// a venir (avec avantage du terrain). C'est un vrai modele, pas une opinion.

import { pastEvents, nextEvents, LEAGUES } from "../sources/sport.mjs";
import { clampProb, pct } from "../stats.mjs";
import { frDateFromISO } from "../dates.mjs";

const K = 24; // sensibilite Elo
const HOME_ADV = 60; // avantage du terrain, en points Elo
const WINDOW_DAYS = 10; // on ne predit que les matchs proches
const MAX_PER_LEAGUE = 3;

function buildElo(events) {
  const r = {};
  const get = (t) => (t in r ? r[t] : 1500);
  const dated = events
    .filter((e) => e.strTimestamp && e.strHomeTeam && e.strAwayTeam)
    .filter((e) => Number.isInteger(parseInt(e.intHomeScore, 10)) && Number.isInteger(parseInt(e.intAwayScore, 10)))
    .sort((a, b) => new Date(a.strTimestamp) - new Date(b.strTimestamp));
  for (const e of dated) {
    const h = e.strHomeTeam, a = e.strAwayTeam;
    const hs = parseInt(e.intHomeScore, 10), as = parseInt(e.intAwayScore, 10);
    const Rh = get(h) + HOME_ADV, Ra = get(a);
    const Eh = 1 / (1 + 10 ** ((Ra - Rh) / 400));
    const Sh = hs > as ? 1 : hs === as ? 0.5 : 0;
    r[h] = get(h) + K * (Sh - Eh);
    r[a] = get(a) + K * (1 - Sh - (1 - Eh));
  }
  return { get, count: dated.length };
}

export async function generateSport(now = Date.now()) {
  const drafts = [];
  const horizon = now + WINDOW_DAYS * 86400000;

  for (const id of Object.keys(LEAGUES)) {
    const leagueName = LEAGUES[id];
    let past, next;
    try {
      past = await pastEvents(id);
      next = await nextEvents(id);
    } catch (err) {
      console.error(`  [sport] ${leagueName} ignore : ${err.message}`);
      continue;
    }
    const elo = buildElo(past);
    if (elo.count < 10) continue; // pas assez d'historique pour un Elo fiable

    const soon = (next || [])
      .filter((e) => e.strTimestamp && e.strHomeTeam && e.strAwayTeam)
      .map((e) => ({ e, ts: new Date(e.strTimestamp + "Z").getTime() }))
      .filter((x) => x.ts > now && x.ts < horizon)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, MAX_PER_LEAGUE);

    for (const { e, ts } of soon) {
      const home = e.strHomeTeam, away = e.strAwayTeam;
      const Rh = elo.get(home) + HOME_ADV, Ra = elo.get(away);
      const Eh = 1 / (1 + 10 ** ((Ra - Rh) / 400)); // part de points attendue (domicile)
      const pDraw = Math.max(0.12, Math.min(0.3, 0.3 - 0.4 * Math.abs(Eh - 0.5)));
      const pHome = Eh - pDraw / 2;
      const pAway = 1 - Eh - pDraw / 2;

      const favHome = pHome >= pAway;
      const favTeam = favHome ? home : away;
      const otherTeam = favHome ? away : home;
      const side = favHome ? "home" : "away";
      const p = clampProb(favHome ? pHome : pAway);
      if (Number.isNaN(p)) continue;

      const dateISO = e.strTimestamp.slice(0, 10);
      const frDate = frDateFromISO(dateISO);
      const deadline = new Date(ts + 3 * 3600000).toISOString(); // ~3 h apres le coup d'envoi
      const eloFav = Math.round(favHome ? elo.get(home) : elo.get(away));
      const eloOther = Math.round(favHome ? elo.get(away) : elo.get(home));

      const facts = {
        match: `${home} - ${away}`,
        competition: leagueName,
        favori: favTeam,
        elo_favori: eloFav,
        elo_adverse: eloOther,
        joue_a_domicile: favHome ? favTeam : otherTeam,
        proba_victoire_favori_pct: pct(p),
      };
      const fallback =
        `D'après les résultats de la saison, ${favTeam} est mieux classé (force estimée ${eloFav} contre ${eloOther}). ` +
        `${favHome ? "Jouer à domicile renforce" : "Même à l'extérieur, cela soutient"} sa probabilité de l'emporter sur ce match.`;

      drafts.push({
        category: "sport",
        statement: `${favTeam} battra ${otherTeam} le ${frDate} (${leagueName}).`,
        probability: pct(p),
        created_at: new Date(now).toISOString(),
        target_date: dateISO,
        deadline,
        resolution: {
          criterion: `Le ${frDate}, ${favTeam} gagne son match contre ${otherTeam} (résultat final, source TheSportsDB). Un nul ou une défaite compte comme raté.`,
          method: "sport.matchResult",
          params: { idEvent: e.idEvent, side, favTeam, otherTeam },
        },
        model: {
          name: "Modèle Elo bâti sur les résultats de la saison + avantage du terrain",
          inputs: {
            elo_favori: eloFav,
            elo_adverse: eloOther,
            avantage_domicile_elo: HOME_ADV,
            proba_nul_estimee: +pDraw.toFixed(2),
          },
        },
        _facts: facts,
        _fallback: fallback,
      });
    }
  }
  return drafts;
}
