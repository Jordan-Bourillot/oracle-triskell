/* L'Oracle — rendu de la page (vanilla JS, sans dépendance).
   Direction "Observatoire céleste". Lit data/predictions.json, calcule
   score + calibration, dessine le ciel et les prédictions-étoiles. */

const REPO_URL = "https://github.com/Jordan-Bourillot/oracle-triskell";

const CAT_LABEL = {
  crypto: "Crypto",
  meteo: "Météo",
  marches: "Marchés",
  sport: "Sport",
  economie: "Économie",
};

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

const fmtDateTime = (iso) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  }).format(new Date(iso));

const fmtDateParis = (iso) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
  }).format(new Date(iso));

// "AAAA-MM-JJ" -> "27 juin 2026", sans piège de fuseau.
const fmtDay = (p) => {
  if (p.target_date && /^\d{4}-\d{2}-\d{2}$/.test(p.target_date)) {
    const [y, m, d] = p.target_date.split("-").map(Number);
    return `${d} ${MOIS[m - 1]} ${y}`;
  }
  return fmtDateParis(p.deadline);
};

const $ = (sel, root = document) => root.querySelector(sel);
let STATE = { preds: [], filter: "all" };

init();

async function init() {
  createSky();
  let data;
  try {
    const res = await fetch("./data/predictions.json", { cache: "no-store" });
    data = await res.json();
  } catch {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<p style="text-align:center;color:#e08a7d;font-family:monospace">Impossible de charger les prédictions.</p>',
    );
    return;
  }
  STATE.preds = Array.isArray(data.predictions) ? data.predictions : [];
  if (data.updated_at) $("#updated").textContent = "Dernière mise à jour : " + fmtDateTime(data.updated_at);
  renderRepo();
  renderScore();
  renderCalibration();
  renderFilters();
  renderPending();
  renderHistory();
}

/* ---------- ciel étoilé (statique, léger) ---------- */
function createSky() {
  const sky = document.getElementById("sky");
  if (!sky) return;
  const W = 1440, H = 900;
  let seed = 20260624;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const parts = [];
  for (let i = 0; i < 140; i++) {
    const x = (rnd() * W).toFixed(1), y = (rnd() * H).toFixed(1);
    const r = (rnd() * 1.3 + 0.3).toFixed(2);
    const op = (rnd() * 0.6 + 0.2).toFixed(2);
    const cls = rnd() < 0.12 ? " class='twinkle'" : "";
    const col = rnd() < 0.16 ? "#f6dd94" : "#dfe3ff";
    parts.push(`<circle${cls} cx='${x}' cy='${y}' r='${r}' fill='${col}' opacity='${op}'/>`);
  }
  sky.innerHTML = `<svg viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>${parts.join("")}</svg>`;
}

/* ---------- icône étoile selon l'état ---------- */
const STAR_PATH = "M12 1.6 L14.7 8.5 L22 9.1 L16.4 13.9 L18.2 21 L12 17.1 L5.8 21 L7.6 13.9 L2 9.1 L9.3 8.5 Z";
function starSvg(state) {
  if (state === "win")
    return `<svg viewBox='0 0 24 24'><path d='${STAR_PATH}' fill='var(--gold-bright)' stroke='var(--gold)' stroke-width='0.6'/></svg>`;
  if (state === "loss")
    return `<svg viewBox='0 0 24 24'><path d='${STAR_PATH}' fill='none' stroke='var(--muted)' stroke-width='1.2' opacity='0.6'/></svg>`;
  return `<svg viewBox='0 0 24 24'><path d='${STAR_PATH}' fill='none' stroke='var(--gold)' stroke-width='1.3'/></svg>`;
}

/* ---------- utilitaires ---------- */
const resolved = () => STATE.preds.filter((p) => p.result);
const pending = () =>
  STATE.preds.filter((p) => !p.result).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

/* ---------- score ---------- */
function renderScore() {
  const res = resolved();
  const wins = res.filter((p) => p.result.hit === 1).length;
  $("#s-total").textContent = STATE.preds.length;
  $("#s-pending").textContent = STATE.preds.length - res.length;
  $("#s-resolved").textContent = res.length;
  $("#s-rate").textContent = res.length ? Math.round((wins / res.length) * 100) + " %" : "—";
  if (res.length) {
    const brier = res.reduce((a, p) => a + (p.probability / 100 - p.result.hit) ** 2, 0) / res.length;
    $("#s-brier").textContent = brier.toFixed(3).replace(".", ",");
  } else {
    $("#s-brier").textContent = "—";
  }
}

/* ---------- calibration ---------- */
function calibrationBins() {
  const edges = [0, 20, 40, 60, 80, 100];
  const bins = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const inBin = resolved().filter(
      (p) => p.probability >= lo && (i === edges.length - 2 ? p.probability <= hi : p.probability < hi),
    );
    if (!inBin.length) continue;
    const meanP = inBin.reduce((a, p) => a + p.probability, 0) / inBin.length;
    const freq = inBin.reduce((a, p) => a + p.result.hit, 0) / inBin.length;
    bins.push({ lo, hi, meanP, freq, n: inBin.length });
  }
  return bins;
}

function renderCalibration() {
  const plot = $("#calib-plot");
  const legend = $("#calib-legend");
  const bins = calibrationBins();
  plot.innerHTML = drawCalibSvg(bins);
  if (!bins.length) {
    legend.innerHTML =
      '<p class="calib-empty">Aucune prédiction n\'est encore arrivée à échéance. La trajectoire se dessinera au fil des résolutions, en toute transparence.</p>';
    return;
  }
  legend.innerHTML =
    '<div class="lg-row"><span>tranche</span><span>réalisé (n)</span></div>' +
    bins.map((b) => `<div class="lg-row"><span>${b.lo}–${b.hi} %</span><span>${Math.round(b.freq * 100)} % (${b.n})</span></div>`).join("");
}

function drawCalibSvg(bins) {
  const W = 460, H = 460, mL = 46, mB = 38, mT = 16, mR = 16;
  const iW = W - mL - mR, iH = H - mT - mB;
  const x = (p) => mL + (p / 100) * iW;
  const y = (f) => mT + (1 - f) * iH;
  const grid = "rgba(160,170,220,0.16)", frame = "rgba(231,200,121,0.4)", gold = "#e7c879", txt = "#878cae";

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de calibration">`;
  for (const g of [0, 25, 50, 75, 100]) {
    s += `<line x1="${x(g)}" y1="${mT}" x2="${x(g)}" y2="${mT + iH}" stroke="${grid}" stroke-width="1"/>`;
    s += `<line x1="${mL}" y1="${y(g / 100)}" x2="${mL + iW}" y2="${y(g / 100)}" stroke="${grid}" stroke-width="1"/>`;
    s += `<text x="${x(g)}" y="${mT + iH + 24}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="middle">${g}</text>`;
    s += `<text x="${mL - 10}" y="${y(g / 100) + 4}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="end">${g}</text>`;
  }
  s += `<rect x="${mL}" y="${mT}" width="${iW}" height="${iH}" fill="none" stroke="${frame}" stroke-width="1.2"/>`;
  // trajectoire idéale
  s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(100)}" y2="${y(1)}" stroke="${gold}" stroke-width="1.3" stroke-dasharray="5 4" opacity="0.8"/>`;
  s += `<text x="${x(100) - 6}" y="${y(1) + 16}" fill="${gold}" font-family="monospace" font-size="10" text-anchor="end" opacity="0.85">trajectoire idéale</text>`;
  s += `<text x="${mL + iW / 2}" y="${H - 4}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="middle">probabilité annoncée (%)</text>`;
  s += `<text x="14" y="${mT + iH / 2}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="middle" transform="rotate(-90 14 ${mT + iH / 2})">part réalisée (%)</text>`;

  if (bins.length) {
    const pts = [...bins].sort((a, b) => a.meanP - b.meanP);
    s += `<polyline fill="none" stroke="#f6dd94" stroke-width="2" points="${pts.map((b) => `${x(b.meanP)},${y(b.freq)}`).join(" ")}"/>`;
    for (const b of pts) {
      const r = 5 + Math.min(13, Math.sqrt(b.n) * 4);
      s += `<circle cx="${x(b.meanP)}" cy="${y(b.freq)}" r="${r}" fill="${gold}" fill-opacity="0.16" stroke="${gold}" stroke-width="1.4"><title>${b.lo}–${b.hi} % : réalisé ${Math.round(b.freq * 100)} % sur ${b.n}</title></circle>`;
      s += `<circle cx="${x(b.meanP)}" cy="${y(b.freq)}" r="3" fill="#f6dd94"/>`;
    }
  }
  return s + `</svg>`;
}

/* ---------- filtres ---------- */
function renderFilters() {
  const cats = ["all", ...new Set(STATE.preds.map((p) => p.category))];
  const box = $("#filters");
  box.innerHTML = cats
    .map((c) => `<button class="filter-btn" data-cat="${c}" aria-pressed="${c === STATE.filter}">${c === "all" ? "Tout" : CAT_LABEL[c] || c}</button>`)
    .join("");
  box.querySelectorAll(".filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.filter = btn.dataset.cat;
      box.querySelectorAll(".filter-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === STATE.filter));
      renderPending();
    }),
  );
}

/* ---------- cartes ---------- */
function buildCard(p) {
  const tpl = $("#card-tpl").content.cloneNode(true);
  const card = $(".card", tpl);
  const state = !p.result ? "pending" : p.result.hit ? "win" : "loss";
  $(".star-slot", card).innerHTML = starSvg(state);
  $(".tag", card).textContent = CAT_LABEL[p.category] || p.category;
  $(".statement", card).textContent = p.statement;
  $(".prob-num", card).textContent = p.probability + " %";

  const meta = $(".meta", card);
  meta.innerHTML =
    `<div class="row"><span class="k">Échéance</span><span>${fmtDay(p)}</span></div>` +
    `<div class="row"><span class="k">Critère</span><span>${p.resolution?.criterion || ""}</span></div>`;

  const why = $(".why", card);
  const reasoning = $(".reasoning", card);
  reasoning.textContent = p.reasoning || "";
  why.addEventListener("click", () => {
    const open = reasoning.hasAttribute("hidden");
    if (open) reasoning.removeAttribute("hidden");
    else reasoning.setAttribute("hidden", "");
    why.setAttribute("aria-expanded", String(open));
    why.textContent = open ? "Masquer le raisonnement" : "Voir le raisonnement";
  });

  $(".lock", card).innerHTML = `✦ <b>Figée le ${fmtDateTime(p.created_at)}</b> · empreinte ${p.hash || "—"}`;

  if (p.result) {
    card.classList.add(p.result.hit ? "win" : "loss");
    const v = $(".verdict", card);
    v.classList.add(p.result.hit ? "win" : "loss");
    v.textContent = p.result.hit ? "✦ Allumée" : "Éteinte";
    const proof = p.result.evidence_url ? ` · <a href="${p.result.evidence_url}" target="_blank" rel="noopener">preuve</a>` : "";
    meta.insertAdjacentHTML("beforeend", `<div class="row result-line"><span class="k">Résultat réel</span><span>${p.result.actual_label}${proof}</span></div>`);
  }
  return card;
}

function renderPending() {
  const list = $("#pending-list");
  list.innerHTML = "";
  let items = pending();
  if (STATE.filter !== "all") items = items.filter((p) => p.category === STATE.filter);
  if (!items.length) {
    list.innerHTML = '<p class="empty-note">Aucune prédiction en cours dans cette catégorie.</p>';
    return;
  }
  for (const p of items) list.appendChild(buildCard(p));
}

function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  const items = resolved().sort((a, b) => new Date(b.result.resolved_at) - new Date(a.result.resolved_at));
  if (!items.length) {
    list.innerHTML = '<p class="empty-note">Rien n\'a encore été tranché. Les premiers verdicts arriveront à la première échéance.</p>';
    return;
  }
  for (const p of items) list.appendChild(buildCard(p));
}

/* ---------- pied : lien dépôt ---------- */
function renderRepo() {
  const line = $("#repo-line");
  if (REPO_URL && !REPO_URL.includes("__")) {
    line.innerHTML = `Code et historique publics · <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL.replace("https://", "")}</a>`;
  } else {
    line.textContent = "Code et historique publics, vérifiables par n'importe qui.";
  }
}
