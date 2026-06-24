// Génère une PAGE par prédiction publique (le tableau « Qui avait raison ? »).
// But : chaque verdict devient partageable (lien direct + aperçu) ET trouvable
// sur Google (vraie page HTML indexable). Plus un sitemap + robots.txt.
// Pur Node, aucune dépendance : tourne en local ET dans le cron GitHub.

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = resolve(HERE, "../public");
const VDIR = resolve(PUB, "v");
const BASE = "https://oracle.triskell-studio.fr";

const CAT = {
  crypto: { label: "Crypto", color: "#b79bff" },
  meteo: { label: "Météo", color: "#56c6f5" },
  marches: { label: "Marchés", color: "#4bd6b0" },
  sport: { label: "Sport", color: "#ffa24b" },
  economie: { label: "Économie", color: "#ff8fc4" },
  macro: { label: "Macro", color: "#ff8fc4" },
  bourse: { label: "Bourse", color: "#4bd6b0" },
  tech: { label: "Tech", color: "#56c6f5" },
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2316140f'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%23ff5a3c' stroke-width='3'/%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%23f4eee0' stroke-width='3' stroke-dasharray='40 63' stroke-linecap='round' transform='rotate(-90 16 16)'/%3E%3C/svg%3E";

function page(c) {
  const cat = CAT[c.category] || { label: c.category, color: "#8b8270" };
  const pending = !c.result;
  const cls = pending ? "pending" : c.result.hit ? "win" : "loss";
  const verdict = pending ? "En attente" : c.result.hit ? "Réalisé" : "Raté";
  const title = `${c.author} : « ${c.claim} » — ${verdict} · L'Oracle`;
  const desc = pending
    ? `${c.author} a annoncé : « ${c.claim} ». Verdict attendu, suivi par L'Oracle, preuves à l'appui.`
    : `${c.author} avait annoncé : « ${c.claim} ». Verdict : ${verdict}. ${c.result.reality_label || ""} Vérifié par L'Oracle.`;
  const real = pending
    ? `Verdict attendu le ${frDate(c.deadline)}.`
    : esc(c.result.reality_label || "");
  let links = `<a href="${esc(c.source_url)}" target="_blank" rel="noopener">La prédiction d'origine</a>`;
  if (!pending && c.result.evidence_url) links += ` · <a href="${esc(c.result.evidence_url)}" target="_blank" rel="noopener">La preuve</a>`;

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${BASE}/v/${c.id}.html" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" href="${FAVICON}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONTS}" rel="stylesheet" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${BASE}/v/${c.id}.html" />
    <meta property="og:site_name" content="L'Oracle · Triskell Studio" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${BASE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${BASE}/og.png" />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <header class="topbar">
      <div class="topbar-in">
        <a class="brand" href="/" aria-label="L'Oracle, accueil">
          <img class="brand-logo" src="../logo.png" alt="" width="36" height="36" />
          <span class="brand-name">L'Oracle</span>
        </a>
        <a class="kofi" href="https://ko-fi.com/triskellstudio" target="_blank" rel="noopener">☕ Soutenir le projet</a>
      </div>
    </header>
    <main class="verdict-page">
      <a class="vp-back" href="/">← Le tableau complet</a>
      <article class="vp-card ${cls}">
        <span class="claim-pill ${cls}">${verdict}</span>
        <div class="vp-who"><span class="claim-cat" style="color:${cat.color}">${cat.label}</span><span class="claim-author">${esc(c.author)}</span> <span class="claim-role">${esc(c.role || "")}</span></div>
        <h1 class="vp-claim">« ${esc(c.claim)} »</h1>
        <p class="vp-real">${real}</p>
        <p class="vp-links">${links}</p>
      </article>
      <p class="vp-cta"><strong>Avant de croire une prédiction, regarde le bilan de celui qui la fait.</strong> L'Oracle garde les comptes, preuves à l'appui. <a href="/">Voir tout le tableau →</a></p>
    </main>
  </body>
</html>
`;
}

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
function frDate(iso) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

async function main() {
  let claims = [];
  try {
    claims = JSON.parse(await readFile(resolve(PUB, "data/claims.json"), "utf8")).claims || [];
  } catch {
    console.log("Pas de claims.json.");
    return;
  }
  await mkdir(VDIR, { recursive: true });
  // nettoyage des anciennes pages (au cas où une entrée disparaît)
  try {
    for (const f of await readdir(VDIR)) if (f.endsWith(".html")) await rm(resolve(VDIR, f));
  } catch {}

  for (const c of claims) await writeFile(resolve(VDIR, `${c.id}.html`), page(c), "utf8");

  // sitemap + robots
  const urls = [`${BASE}/`, ...claims.map((c) => `${BASE}/v/${c.id}.html`)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  await writeFile(resolve(PUB, "sitemap.xml"), sitemap, "utf8");
  await writeFile(resolve(PUB, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`, "utf8");

  console.log(`✓ ${claims.length} page(s) de verdict + sitemap + robots.`);
}

main().catch((e) => {
  console.error("ECHEC build_pages :", e);
  process.exit(1);
});
