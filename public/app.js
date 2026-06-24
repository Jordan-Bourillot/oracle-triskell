/* L'Oracle — "En direct" (vanilla JS, sans dépendance).
   Liste compacte (une ligne par prédiction) + comptes à rebours vivants
   + barres de probabilité animées + courbe de calibration épurée. */

const REPO_URL = "https://github.com/Jordan-Bourillot/oracle-triskell";

const CAT = {
  crypto: { label: "Crypto", color: "var(--cat-crypto)" },
  meteo: { label: "Météo", color: "var(--cat-meteo)" },
  marches: { label: "Marchés", color: "var(--cat-marches)" },
  sport: { label: "Sport", color: "var(--cat-sport)" },
  economie: { label: "Économie", color: "var(--cat-economie)" },
};
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

const fmtDateTime = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));
const fmtDay = (p) => {
  if (p.target_date && /^\d{4}-\d{2}-\d{2}$/.test(p.target_date)) {
    const [y, m, d] = p.target_date.split("-").map(Number);
    return `${d} ${MOIS[m - 1]} ${y}`;
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(p.deadline));
};
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let STATE = { preds: [], filter: "all" };

function countdownText(ms) {
  if (ms <= 0) return { txt: "verdict imminent", soon: true };
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p2 = (n) => String(n).padStart(2, "0");
  if (d >= 2) return { txt: `${d} j ${p2(h)} h`, soon: false };
  if (d >= 1) return { txt: `1 j ${p2(h)} h ${p2(m)} m`, soon: false };
  return { txt: `${p2(h)}h ${p2(m)}m ${p2(sec)}s`, soon: ms < 6 * 3600000 };
}

init();

async function init() {
  let data;
  try {
    data = await (await fetch("./data/predictions.json", { cache: "no-store" })).json();
  } catch {
    document.body.insertAdjacentHTML("beforeend", '<p style="text-align:center;color:#ff7a6e;font-family:monospace">Impossible de charger les prédictions.</p>');
    return;
  }
  STATE.preds = Array.isArray(data.predictions) ? data.predictions : [];
  if (data.updated_at) $("#updated").textContent = "Mise à jour : " + fmtDateTime(data.updated_at);
  renderRepo();
  renderScore();
  await loadClaims();
  renderCalibration();
  renderFilters();
  renderPending();
  renderHistory();
  setupReveal();
  animateBars();
  tick();
  setInterval(tick, 1000);
}

const resolved = () => STATE.preds.filter((p) => p.result);
const pending = () => STATE.preds.filter((p) => !p.result).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

/* ---------- qui avait raison (prédictions publiques de tiers) ---------- */
async function loadClaims() {
  let claims = [];
  try {
    const d = await (await fetch("./data/claims.json", { cache: "no-store" })).json();
    claims = Array.isArray(d.claims) ? d.claims : [];
  } catch { /* pas de tableau, on masque la section */ }
  renderClaims(claims);
}
function renderClaims(claims) {
  const list = $("#claims-list");
  const section = $("#verdicts-publics");
  if (!list) return;
  if (!claims.length) { if (section) section.hidden = true; return; }
  const order = [...claims].sort((a, b) => (b.result.hit - a.result.hit) || (b.target_usd || 0) - (a.target_usd || 0));
  list.innerHTML = order
    .map((c) => {
      const cls = c.result.hit ? "win" : "loss";
      return `<article class="claim ${cls}">
        <span class="claim-pill ${cls}">${c.result.hit ? "Réalisé" : "Raté"}</span>
        <div class="claim-body">
          <div class="claim-head"><span class="claim-author">${esc(c.author)}</span> <span class="claim-role">${esc(c.role || "")}</span></div>
          <p class="claim-text">« ${esc(c.claim)} »</p>
          <p class="claim-real">${esc(c.result.reality_label || "")} · <a href="${esc(c.source_url)}" target="_blank" rel="noopener">la prédiction</a> · <a href="${esc(c.result.evidence_url)}" target="_blank" rel="noopener">la preuve</a></p>
        </div>
      </article>`;
    })
    .join("");
  const wins = claims.filter((c) => c.result.hit === 1).length;
  const tally = $("#claims-tally");
  if (tally) tally.textContent = `Sur ${claims.length} suivies, ${wins > 1 ? wins + " se sont réalisées" : wins + " s'est réalisée"}.`;
}

/* ---------- palmarès ---------- */
function animateCount(el, to) {
  const dur = 800, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderScore() {
  const res = resolved(), wins = res.filter((p) => p.result.hit === 1).length;
  animateCount($("#s-total"), STATE.preds.length);
  animateCount($("#s-pending"), STATE.preds.length - res.length);
  animateCount($("#s-resolved"), res.length);
  $("#s-rate").textContent = res.length ? Math.round((wins / res.length) * 100) + " %" : "—";
  $("#s-brier").textContent = res.length ? (res.reduce((a, p) => a + (p.probability / 100 - p.result.hit) ** 2, 0) / res.length).toFixed(3).replace(".", ",") : "—";
}

/* ---------- calibration (épurée) ---------- */
function calibrationBins() {
  const edges = [0, 20, 40, 60, 80, 100], bins = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const inB = resolved().filter((p) => p.probability >= lo && (i === edges.length - 2 ? p.probability <= hi : p.probability < hi));
    if (!inB.length) continue;
    bins.push({ lo, hi, meanP: inB.reduce((a, p) => a + p.probability, 0) / inB.length, freq: inB.reduce((a, p) => a + p.result.hit, 0) / inB.length, n: inB.length });
  }
  return bins;
}
function renderCalibration() {
  const bins = calibrationBins();
  const wrap = $(".calib-wrap");
  if (!bins.length) {
    wrap.classList.add("is-empty");
    $("#calib-plot").innerHTML = emptyCalibSvg();
    const next = pending()[0];
    const cd = next ? `<span class="ce-cd">Premier verdict dans <span class="cd" data-deadline="${new Date(next.deadline).getTime()}">…</span></span>` : "";
    $("#calib-legend").innerHTML =
      `<p class="calib-empty"><span class="ce-lead">Le tableau de chasse est encore vierge.</span>${cd}Dès qu'une prédiction est tranchée, <b>un point se pose ici</b>. Plus ils collent à la diagonale, plus l'Oracle est juste.</p>`;
    return;
  }
  wrap.classList.remove("is-empty");
  $("#calib-plot").innerHTML = plotCalibSvg(bins);
  $("#calib-legend").innerHTML =
    '<div class="lg-row"><span>tranche</span><span>réalisé (n)</span></div>' +
    bins.map((b) => `<div class="lg-row"><span>${b.lo}–${b.hi} %</span><span>${Math.round(b.freq * 100)} % (${b.n})</span></div>`).join("");
}
const C_LINE = "#2b2820", C_AXIS = "#5a5240", C_TXT = "#8b8270", C_ACC = "#ff5a3c";
function emptyCalibSvg() {
  const pts = [[95, 206], [150, 152], [205, 99], [247, 60]];
  const dots = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${C_ACC}" opacity="0.16"/><circle cx="${x}" cy="${y}" r="4" fill="${C_ACC}" opacity="0.75"/>`).join("");
  return `<svg viewBox="0 0 300 300" role="img" aria-label="Courbe de calibration (à venir)">
    <line x1="40" y1="30" x2="40" y2="260" stroke="${C_AXIS}" stroke-width="1.4"/>
    <line x1="40" y1="260" x2="280" y2="260" stroke="${C_AXIS}" stroke-width="1.4"/>
    <line x1="40" y1="260" x2="270" y2="36" stroke="${C_ACC}" stroke-width="1.6" stroke-dasharray="6 5" opacity="0.6"/>
    <text x="268" y="52" fill="${C_TXT}" font-family="monospace" font-size="11" text-anchor="end">objectif</text>
    ${dots}
  </svg>`;
}
function plotCalibSvg(bins) {
  const W = 440, H = 440, mL = 44, mB = 36, mT = 16, mR = 16, iW = W - mL - mR, iH = H - mT - mB;
  const x = (p) => mL + (p / 100) * iW, y = (f) => mT + (1 - f) * iH;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de calibration">`;
  // axes en L, sobres
  s += `<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT + iH}" stroke="${C_AXIS}" stroke-width="1.2"/>`;
  s += `<line x1="${mL}" y1="${mT + iH}" x2="${mL + iW}" y2="${mT + iH}" stroke="${C_AXIS}" stroke-width="1.2"/>`;
  for (const g of [0, 50, 100]) {
    s += `<text x="${x(g)}" y="${mT + iH + 22}" fill="${C_TXT}" font-family="monospace" font-size="11" text-anchor="middle">${g}</text>`;
    s += `<text x="${mL - 10}" y="${y(g / 100) + 4}" fill="${C_TXT}" font-family="monospace" font-size="11" text-anchor="end">${g}</text>`;
  }
  // diagonale idéale
  s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(100)}" y2="${y(1)}" stroke="${C_AXIS}" stroke-width="1" stroke-dasharray="5 4"/>`;
  s += `<text x="${x(100) - 4}" y="${y(1) + 16}" fill="${C_TXT}" font-family="monospace" font-size="10" text-anchor="end">diagonale parfaite</text>`;
  s += `<text x="${mL + iW / 2}" y="${H - 2}" fill="${C_TXT}" font-family="monospace" font-size="11" text-anchor="middle">probabilité annoncée (%)</text>`;
  s += `<text x="13" y="${mT + iH / 2}" fill="${C_TXT}" font-family="monospace" font-size="11" text-anchor="middle" transform="rotate(-90 13 ${mT + iH / 2})">part réalisée (%)</text>`;
  const pts = [...bins].sort((a, b) => a.meanP - b.meanP);
  s += `<polyline fill="none" stroke="${C_ACC}" stroke-width="2.5" points="${pts.map((b) => `${x(b.meanP)},${y(b.freq)}`).join(" ")}"/>`;
  for (const b of pts) {
    const r = 5 + Math.min(13, Math.sqrt(b.n) * 4);
    s += `<circle cx="${x(b.meanP)}" cy="${y(b.freq)}" r="${r}" fill="${C_ACC}" fill-opacity="0.16"/><circle cx="${x(b.meanP)}" cy="${y(b.freq)}" r="4" fill="${C_ACC}"><title>${b.lo}–${b.hi} % : réalisé ${Math.round(b.freq * 100)} % sur ${b.n}</title></circle>`;
  }
  return s + `</svg>`;
}

/* ---------- filtres ---------- */
function renderFilters() {
  const cats = ["all", ...new Set(STATE.preds.map((p) => p.category))];
  const box = $("#filters");
  box.innerHTML = cats.map((c) => `<button class="filter-btn" data-cat="${c}" aria-pressed="${c === STATE.filter}">${c === "all" ? "Tout" : (CAT[c]?.label || c)}</button>`).join("");
  box.querySelectorAll(".filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      STATE.filter = btn.dataset.cat;
      box.querySelectorAll(".filter-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === STATE.filter));
      renderPending();
      animateBars();
    }),
  );
}

/* ---------- lignes ---------- */
function buildRow(p) {
  const tpl = $("#row-tpl").content.cloneNode(true);
  const wrap = $(".prow-wrap", tpl);
  const row = $(".prow", wrap);
  const detail = $(".prow-detail", wrap);
  const cat = CAT[p.category] || { label: p.category, color: "var(--muted)" };

  $(".prow-statement", row).textContent = p.statement;
  $(".prow-pct", row).textContent = p.probability + " %";
  $(".prow-fill", row).dataset.target = p.probability;

  const sub = $(".prow-sub", row);
  if (p.result) {
    row.classList.add(p.result.hit ? "win" : "loss");
    sub.innerHTML = `<span class="${p.result.hit ? "ok" : "ko"}">${p.result.hit ? "Vérifié" : "Raté"}</span> · ${cat.label} · ${esc(p.result.actual_label)}`;
  } else {
    $(".prow-dot", row).style.background = cat.color;
    sub.innerHTML = `${cat.label} · verdict dans <span class="cd" data-deadline="${new Date(p.deadline).getTime()}">…</span>`;
  }

  detail.innerHTML =
    (p.reasoning ? `<p class="reasoning">${esc(p.reasoning)}</p>` : "") +
    `<div class="meta">` +
    `<div class="row"><span class="k">Échéance</span><span>${fmtDay(p)}</span></div>` +
    `<div class="row"><span class="k">Critère</span><span>${esc(p.resolution?.criterion)}</span></div>` +
    (p.result ? `<div class="row"><span class="k">Résultat</span><span>${esc(p.result.actual_label)}${p.result.evidence_url ? ` · <a href="${esc(p.result.evidence_url)}" target="_blank" rel="noopener">preuve</a>` : ""}</span></div>` : "") +
    `</div>` +
    `<div class="lock">Scellée le <b>${fmtDateTime(p.created_at)}</b> · empreinte ${p.hash || "—"}</div>`;

  row.addEventListener("click", () => {
    const open = detail.hasAttribute("hidden");
    detail.toggleAttribute("hidden", !open);
    row.setAttribute("aria-expanded", String(open));
  });
  return wrap;
}
function renderPending() {
  const list = $("#pending-list");
  list.innerHTML = "";
  let items = pending();
  if (STATE.filter !== "all") items = items.filter((p) => p.category === STATE.filter);
  if (!items.length) { list.innerHTML = '<p class="empty-note">Aucune prédiction en jeu dans ce terrain.</p>'; return; }
  for (const p of items) list.appendChild(buildRow(p));
}
function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  const items = resolved().sort((a, b) => new Date(b.result.resolved_at) - new Date(a.result.resolved_at));
  if (!items.length) { list.innerHTML = '<p class="empty-note">Rien n\'a encore été tranché. Le premier verdict arrive bientôt.</p>'; return; }
  for (const p of items) list.appendChild(buildRow(p));
}

/* ---------- compte à rebours ---------- */
function tick() {
  const now = Date.now();
  document.querySelectorAll(".cd[data-deadline]").forEach((cd) => {
    const { txt, soon } = countdownText(Number(cd.dataset.deadline) - now);
    cd.textContent = txt;
    cd.classList.toggle("soon", soon);
  });
  const next = pending()[0], box = $("#nextbox");
  if (next) {
    box.hidden = false;
    const { txt, soon } = countdownText(new Date(next.deadline).getTime() - now);
    const t = $("#next-verdict");
    t.textContent = txt;
    t.style.color = soon ? "var(--accent)" : "var(--bone)";
    $("#next-sub").textContent = next.statement;
  } else box.hidden = true;
}

/* ---------- animations ---------- */
function setupReveal() {
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}
function animateBars() {
  const fills = document.querySelectorAll(".prow-fill");
  fills.forEach((f) => (f.style.width = "0%"));
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { e.target.style.width = (e.target.dataset.target || 0) + "%"; io.unobserve(e.target); }
  }, { threshold: 0.5 });
  fills.forEach((f) => io.observe(f));
}

/* ---------- pied ---------- */
function renderRepo() {
  const line = $("#repo-line");
  if (REPO_URL && !REPO_URL.includes("__")) line.innerHTML = `Code et historique publics · <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL.replace("https://", "")}</a>`;
  else line.textContent = "Code et historique publics, vérifiables par n'importe qui.";
}
