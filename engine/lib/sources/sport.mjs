// Source SPORT : football international, via l'API publique d'ESPN (sans clé).
// Couvre la Coupe du Monde (matchs à venir = prédictions) et puise dans les
// matchs récents (Mondial + amicaux) pour estimer la force des équipes (Elo).
// Résolution : résultat final réel du match (drapeau "vainqueur" d'ESPN).

import { getJson } from "../http.mjs";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

export const PRIMARY = "fifa.world"; // compétition prédite
export const PRIMARY_LABEL = "Coupe du Monde";
// Historique international large pour des forces (Elo) fiables.
const ELO_SLUGS = [
  "fifa.world", "fifa.friendly", "fifa.worldq.uefa", "fifa.worldq.conmebol",
  "fifa.worldq.afc", "fifa.worldq.caf", "fifa.worldq.concacaf", "uefa.nations", "caf.nations",
];

const fmt = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

async function scoreboard(slug, fromMs, toMs) {
  const url = `${BASE}/${slug}/scoreboard?dates=${fmt(fromMs)}-${fmt(toMs)}`;
  const data = await getJson(url, { headers: { "user-agent": UA } });
  return { events: data?.events || [], url };
}

function parseEvent(e) {
  const comp = e?.competitions?.[0];
  const cs = comp?.competitors || [];
  const H = cs.find((c) => c.homeAway === "home");
  const A = cs.find((c) => c.homeAway === "away");
  if (!H || !A || !H.team || !A.team) return null;
  return {
    id: String(e.id),
    date: e.date,
    ts: new Date(e.date).getTime(),
    home: H.team.displayName,
    away: A.team.displayName,
    hs: parseInt(H.score, 10),
    as: parseInt(A.score, 10),
    homeWinner: H.winner === true,
    awayWinner: A.winner === true,
    completed: e?.status?.type?.completed === true,
  };
}

/**
 * Matchs internationaux terminés sur ~600 jours (pour bâtir l'Elo).
 * ESPN limite une requête à environ une saison : on balaie par tranches.
 */
export async function completedMatches(days = 600) {
  const now = Date.now();
  const CHUNK = 120;
  const seen = new Set();
  const out = [];
  for (const slug of ELO_SLUGS) {
    for (let back = days; back > 0; back -= CHUNK) {
      try {
        const { events } = await scoreboard(slug, now - back * 86400000, now - (back - CHUNK) * 86400000);
        for (const e of events) {
          const m = parseEvent(e);
          if (!m || !m.completed || !Number.isInteger(m.hs) || !Number.isInteger(m.as)) continue;
          const key = `${m.date}|${m.home}|${m.away}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(m);
        }
      } catch (err) {
        console.error(`  [sport] historique ${slug} : ${err.message}`);
      }
    }
  }
  return out;
}

/** Prochains matchs de la compétition prédite, dans la fenêtre donnée. */
export async function upcomingMatches(days = 8) {
  const now = Date.now();
  const { events } = await scoreboard(PRIMARY, now - 86400000, now + days * 86400000);
  return events
    .map(parseEvent)
    .filter(Boolean)
    .filter((m) => !m.completed && m.ts > now && m.ts < now + days * 86400000)
    .filter((m) => m.home && m.away && !/\bTBD\b|winner of|vainqueur|to be determined/i.test(`${m.home} ${m.away}`));
}

/**
 * Résultat réel d'un match (RESOLUTION). Renvoie finished:false si pas joué.
 */
export async function matchOutcome(slug, idEvent, matchMs) {
  const { events, url } = await scoreboard(slug, matchMs - 2 * 86400000, matchMs + 2 * 86400000);
  const e = events.find((x) => String(x.id) === String(idEvent));
  const m = e ? parseEvent(e) : null;
  if (!m || !m.completed) return { finished: false, sourceUrl: url };
  const winner = m.homeWinner ? "home" : m.awayWinner ? "away" : m.hs > m.as ? "home" : m.hs < m.as ? "away" : "draw";
  return { finished: true, winner, label: `${m.home} ${m.hs}-${m.as} ${m.away}`, sourceUrl: url };
}
