/* L'Oracle — "En direct" (vanilla JS, sans dépendance).
   Comptes à rebours vivants, anneaux de probabilité animés, révélations. */

const REPO_URL = "https://github.com/Jordan-Bourillot/oracle-triskell";

const CAT = {
  crypto: { label: "Crypto", color: "var(--cat-crypto)" },
  meteo: { label: "Météo", color: "var(--cat-meteo)" },
  marches: { label: "Marchés", color: "var(--cat-marches)" },
  sport: { label: "Sport", color: "var(--cat-sport)" },
  economie: { label: "Économie", color: "var(--cat-economie)" },
};
const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const RING_R = 36, CIRC = 2 * Math.PI * RING_R;

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
let STATE = { preds: [], filter: "all" };

/** "2 j 06 h" / "1 j 06 h 14 m" / "06h 14m 09s" / "imminent" */
function countdownText(ms) {
  if (ms <= 0) return { txt: "Verdict imminent", soon: true };
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
    const res = await fetch("./data/predictions.json", { cache: "no-store" });
    data = await res.json();
  } catch {
    document.body.insertAdjacentHTML("beforeend", '<p style="text-align:center;color:#ff7a6e;font-family:monospace">Impossible de charger les prédictions.</p>');
    return;
  }
  STATE.preds = Array.isArray(data.predictions) ? data.predictions : [];
  if (data.updated_at) $("#updated").textContent = "Mise à jour : " + fmtDateTime(data.updated_at);
  renderRepo();
  renderScore();
  renderCalibration();
  renderFilters();
  renderPending();
  renderHistory();
  setupReveal();
  setupRings();
  tick();
  setInterval(tick, 1000);
}

const resolved = () => STATE.preds.filter((p) => p.result);
const pending = () => STATE.preds.filter((p) => !p.result).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

/* ---------- palmarès (compteurs animés) ---------- */
function animateCount(el, to) {
  const dur = 800, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderScore() {
  const res = resolved();
  const wins = res.filter((p) => p.result.hit === 1).length;
  animateCount($("#s-total"), STATE.preds.length);
  animateCount($("#s-pending"), STATE.preds.length - res.length);
  animateCount($("#s-resolved"), res.length);
  $("#s-rate").textContent = res.length ? Math.round((wins / res.length) * 100) + " %" : "—";
  $("#s-brier").textContent = res.length ? (res.reduce((a, p) => a + (p.probability / 100 - p.result.hit) ** 2, 0) / res.length).toFixed(3).replace(".", ",") : "—";
}

/* ---------- calibration ---------- */
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
  $("#calib-plot").innerHTML = drawCalibSvg(bins);
  $("#calib-legend").innerHTML = bins.length
    ? '<div class="lg-row"><span>tranche</span><span>réalisé (n)</span></div>' + bins.map((b) => `<div class="lg-row"><span>${b.lo}–${b.hi} %</span><span>${Math.round(b.freq * 100)} % (${b.n})</span></div>`).join("")
    : '<p class="calib-empty">Aucune prédiction n\'est encore arrivée à échéance. La courbe se dessinera au fil des verdicts, en toute transparence.</p>';
}
function drawCalibSvg(bins) {
  const W = 460, H = 460, mL = 46, mB = 38, mT = 16, mR = 16, iW = W - mL - mR, iH = H - mT - mB;
  const x = (p) => mL + (p / 100) * iW, y = (f) => mT + (1 - f) * iH;
  const grid = "#322d23", frame = "#5a5240", accent = "#ff5a3c", txt = "#8b8270";
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe de calibration">`;
  for (const g of [0, 25, 50, 75, 100]) {
    s += `<line x1="${x(g)}" y1="${mT}" x2="${x(g)}" y2="${mT + iH}" stroke="${grid}"/><line x1="${mL}" y1="${y(g / 100)}" x2="${mL + iW}" y2="${y(g / 100)}" stroke="${grid}"/>`;
    s += `<text x="${x(g)}" y="${mT + iH + 24}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="middle">${g}</text><text x="${mL - 10}" y="${y(g / 100) + 4}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="end">${g}</text>`;
  }
  s += `<rect x="${mL}" y="${mT}" width="${iW}" height="${iH}" fill="none" stroke="${frame}" stroke-width="1.3"/>`;
  s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(100)}" y2="${y(1)}" stroke="${frame}" stroke-width="1" stroke-dasharray="5 4"/>`;
  s += `<text x="${x(100) - 6}" y="${y(1) + 16}" fill="${txt}" font-family="monospace" font-size="10" text-anchor="end">diagonale parfaite</text>`;
  s += `<text x="${mL + iW / 2}" y="${H - 4}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="middle">probabilité annoncée (%)</text>`;
  s += `<text x="14" y="${mT + iH / 2}" fill="${txt}" font-family="monospace" font-size="11" text-anchor="middle" transform="rotate(-90 14 ${mT + iH / 2})">part réalisée (%)</text>`;
  if (bins.length) {
    const pts = [...bins].sort((a, b) => a.meanP - b.meanP);
    s += `<polyline fill="none" stroke="${accent}" stroke-width="2" points="${pts.map((b) => `${x(b.meanP)},${y(b.freq)}`).join(" ")}"/>`;
    for (const b of pts) {
      const r = 5 + Math.min(13, Math.sqrt(b.n) * 4);
      s += `<circle cx="${x(b.meanP)}" cy="${y(b.freq)}" r="${r}" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-width="1.5"><title>${b.lo}–${b.hi} % : réalisé ${Math.round(b.freq * 100)} % sur ${b.n}</title></circle><circle cx="${x(b.meanP)}" cy="${y(b.freq)}" r="3" fill="${accent}"/>`;
    }
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
      setupRings();
    }),
  );
}

/* ---------- tuiles ---------- */
function buildCard(p) {
  const tpl = $("#card-tpl").content.cloneNode(true);
  const card = $(".tile", tpl);
  const cat = CAT[p.category] || { label: p.category, color: "var(--muted)" };
  $(".dot", card).style.background = cat.color;
  $(".cat-name", card).textContent = cat.label;
  $(".statement", card).textContent = p.statement;
  $(".ring-num", card).textContent = p.probability + " %";
  $(".ring-fg", card).dataset.target = CIRC * (1 - p.probability / 100);

  const cd = $(".countdown", card);
  const why = $(".why", card);
  const reasoning = $(".reasoning", card);
  reasoning.textContent = p.reasoning || "";
  why.addEventListener("click", () => {
    const open = reasoning.hasAttribute("hidden");
    reasoning.toggleAttribute("hidden", !open);
    why.setAttribute("aria-expanded", String(open));
    why.textContent = open ? "Masquer" : "Le raisonnement";
  });

  const meta = $(".meta", card);
  meta.innerHTML =
    `<div class="row"><span class="k">Échéance</span><span>${fmtDay(p)}</span></div>` +
    `<div class="row"><span class="k">Critère</span><span>${p.resolution?.criterion || ""}</span></div>`;
  $(".lock", card).innerHTML = `Scellée le <b>${fmtDateTime(p.created_at)}</b> · empreinte ${p.hash || "—"}`;

  const status = $(".status", card);
  if (p.result) {
    card.classList.add(p.result.hit ? "win" : "loss");
    status.classList.add(p.result.hit ? "win" : "loss");
    status.textContent = p.result.hit ? "Vérifié" : "Raté";
    cd.innerHTML = `<span class="cd-lbl">Verdict rendu</span>${p.result.actual_label}`;
    const proof = p.result.evidence_url ? ` · <a href="${p.result.evidence_url}" target="_blank" rel="noopener">preuve</a>` : "";
    meta.insertAdjacentHTML("beforeend", `<div class="row result-line"><span class="k">Résultat</span><span>${p.result.actual_label}${proof}</span></div>`);
  } else {
    cd.dataset.deadline = new Date(p.deadline).getTime();
    cd.innerHTML = `<span class="cd-lbl">Verdict dans</span><span class="cd-val">…</span>`;
  }
  return card;
}
function renderPending() {
  const list = $("#pending-list");
  list.innerHTML = "";
  let items = pending();
  if (STATE.filter !== "all") items = items.filter((p) => p.category === STATE.filter);
  if (!items.length) { list.innerHTML = '<p class="empty-note">Aucune prédiction en jeu dans ce terrain.</p>'; return; }
  for (const p of items) list.appendChild(buildCard(p));
}
function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  const items = resolved().sort((a, b) => new Date(b.result.resolved_at) - new Date(a.result.resolved_at));
  if (!items.length) { list.innerHTML = '<p class="empty-note">Rien n\'a encore été tranché. Le premier verdict arrive bientôt.</p>'; return; }
  for (const p of items) list.appendChild(buildCard(p));
}

/* ---------- compte à rebours en direct ---------- */
function tick() {
  const now = Date.now();
  document.querySelectorAll(".countdown[data-deadline]").forEach((cd) => {
    const { txt, soon } = countdownText(Number(cd.dataset.deadline) - now);
    const val = cd.querySelector(".cd-val");
    if (val) val.textContent = txt;
    cd.classList.toggle("soon", soon);
  });
  // hero : prochain verdict
  const next = pending()[0];
  const box = $("#nextbox");
  if (next) {
    box.hidden = false;
    const { txt, soon } = countdownText(new Date(next.deadline).getTime() - now);
    const t = $("#next-verdict");
    t.textContent = txt;
    t.style.color = soon ? "var(--accent)" : "var(--bone)";
    $("#next-sub").textContent = next.statement;
  } else {
    box.hidden = true;
  }
}

/* ---------- révélations + anneaux ---------- */
function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}
function setupRings() {
  document.querySelectorAll(".ring-fg").forEach((fg) => {
    fg.style.strokeDasharray = CIRC;
    if (!fg.style.strokeDashoffset) fg.style.strokeDashoffset = CIRC;
  });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.style.strokeDashoffset = e.target.dataset.target; io.unobserve(e.target); }
  }, { threshold: 0.3 });
  document.querySelectorAll(".ring-fg").forEach((fg) => io.observe(fg));
}

/* ---------- pied ---------- */
function renderRepo() {
  const line = $("#repo-line");
  if (REPO_URL && !REPO_URL.includes("__")) line.innerHTML = `Code et historique publics · <a href="${REPO_URL}" target="_blank" rel="noopener">${REPO_URL.replace("https://", "")}</a>`;
  else line.textContent = "Code et historique publics, vérifiables par n'importe qui.";
}
