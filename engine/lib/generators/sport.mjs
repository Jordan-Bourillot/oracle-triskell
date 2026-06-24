// Generateur SPORT (Coupe du Monde).
// Modele Elo bati sur les matchs internationaux recents (Mondial + amicaux)
// pour estimer la force de chaque selection, puis probabilite de victoire
// du match a venir. Vrai modele, pas une opinion.

import { completedMatches, upcomingMatches, PRIMARY, PRIMARY_LABEL } from "../sources/sport.mjs";
import { clampProb, pct } from "../stats.mjs";
import { frDateFromISO } from "../dates.mjs";

const K = 30; // sensibilite Elo (matchs internationaux espaces)
const HOME_ADV = 15; // faible : la plupart des matchs de Mondial sont sur terrain neutre
const WINDOW_DAYS = 8;
const MAX = 5;

function buildElo(matches) {
  const r = {};
  const get = (t) => (t in r ? r[t] : 1500);
  for (const m of [...matches].sort((a, b) => a.ts - b.ts)) {
    const Rh = get(m.home) + HOME_ADV, Ra = get(m.away);
    const Eh = 1 / (1 + 10 ** ((Ra - Rh) / 400));
    const Sh = m.hs > m.as ? 1 : m.hs === m.as ? 0.5 : 0;
    r[m.home] = get(m.home) + K * (Sh - Eh);
    r[m.away] = get(m.away) + K * (1 - Sh - (1 - Eh));
  }
  return get;
}

export async function generateSport(now = Date.now()) {
  const drafts = [];
  let completed, upcoming;
  try {
    completed = await completedMatches(600);
    upcoming = await upcomingMatches(WINDOW_DAYS);
  } catch (err) {
    console.error(`  [sport] indisponible : ${err.message}`);
    return drafts;
  }
  if (completed.length < 20 || !upcoming.length) {
    console.error(`  [sport] rien a predire (historique=${completed.length}, a venir=${upcoming.length}).`);
    return drafts;
  }
  const elo = buildElo(completed);

  for (const m of upcoming.slice(0, MAX)) {
    const Rh = elo(m.home) + HOME_ADV, Ra = elo(m.away);
    const Eh = 1 / (1 + 10 ** ((Ra - Rh) / 400)); // part de points attendue (domicile)
    const pDraw = Math.max(0.12, Math.min(0.3, 0.3 - 0.4 * Math.abs(Eh - 0.5)));
    const pHome = Eh - pDraw / 2;
    const pAway = 1 - Eh - pDraw / 2;

    const favHome = pHome >= pAway;
    const favTeam = favHome ? m.home : m.away;
    const otherTeam = favHome ? m.away : m.home;
    const side = favHome ? "home" : "away";
    const p = clampProb(favHome ? pHome : pAway);
    if (Number.isNaN(p)) continue;

    const dateISO = m.date.slice(0, 10);
    const frDate = frDateFromISO(dateISO);
    const deadline = new Date(m.ts + 4 * 3600000).toISOString(); // apres la fin (prolongations comprises)
    const eloFav = Math.round(favHome ? elo(m.home) : elo(m.away));
    const eloOther = Math.round(favHome ? elo(m.away) : elo(m.home));

    const facts = {
      match: `${m.home} - ${m.away}`,
      competition: PRIMARY_LABEL,
      favori: favTeam,
      force_estimee_favori: eloFav,
      force_estimee_adverse: eloOther,
      proba_victoire_favori_pct: pct(p),
      proba_nul_estimee_pct: Math.round(pDraw * 100),
    };
    const fallback =
      `D'après leurs matchs internationaux récents, ${favTeam} est estimé plus fort que ${otherTeam} ` +
      `(force ${eloFav} contre ${eloOther}). Cela lui donne cette probabilité de gagner ce match, ` +
      `en tenant compte d'environ ${Math.round(pDraw * 100)} % de chances de match nul.`;

    drafts.push({
      category: "sport",
      statement: `${favTeam} battra ${otherTeam} le ${frDate} (${PRIMARY_LABEL}).`,
      probability: pct(p),
      created_at: new Date(now).toISOString(),
      target_date: dateISO,
      deadline,
      resolution: {
        criterion: `Le ${frDate}, ${favTeam} gagne son match contre ${otherTeam} (résultat final, source ESPN). Un nul ou une défaite compte comme raté.`,
        method: "sport.matchResult",
        params: { slug: PRIMARY, idEvent: m.id, matchMs: m.ts, side, favTeam, otherTeam },
      },
      model: {
        name: "Modèle Elo bâti sur les matchs internationaux récents + avantage du terrain",
        inputs: {
          force_favori: eloFav,
          force_adverse: eloOther,
          avantage_terrain_elo: HOME_ADV,
          proba_nul_estimee: +pDraw.toFixed(2),
        },
      },
      _facts: facts,
      _fallback: fallback,
    });
  }
  return drafts;
}
