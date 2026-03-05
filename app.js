const API_URL = "https://script.google.com/macros/s/AKfycbzmkwA254O8QI0HvnDsiqK9hJiSENhztp44xz_3xqSqWkeI_6mT5epJAR7Qy6VpdNSybA/exec";

let refreshTimer = null;
let lastData = null;

const $ = (id) => document.getElementById(id);

const tabs    = { op: $("tab-op"), qual: $("tab-qual") };
const tabBtns = { op: $("btnOp"),  qual: $("btnQual")  };

$("btnRefresh").addEventListener("click", () => load());
$("refreshSelect").addEventListener("change", () => setupAutoRefresh());
tabBtns.op.addEventListener("click",   () => setTab("op"));
tabBtns.qual.addEventListener("click", () => setTab("qual"));

function setTab(which){
  Object.values(tabs).forEach(t => t.classList.remove("active"));
  tabs[which].classList.add("active");
  tabBtns.op.classList.toggle("btn-ghost",   which !== "op");
  tabBtns.qual.classList.toggle("btn-ghost", which !== "qual");
  if (lastData) render(lastData);
}

// ─── Load ────────────────────────────────────────────────
async function load(){
  const errBox = $("errBox");
  errBox.textContent = "";

  if (!API_URL || API_URL.includes("COLE_AQUI")){
    errBox.textContent = "Defina API_URL em /dados/app.js com a URL do Web App do Apps Script.";
    return;
  }

  try{
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error){ errBox.textContent = `Erro API: ${data.error}`; return; }
    lastData = data;
    render(data);
  } catch(e){
    errBox.textContent = `Falha ao carregar dados: ${String(e.message || e)}`;
  }
}

// ─── Render ──────────────────────────────────────────────
function render(d){
  const updated = d.updatedAt ? new Date(d.updatedAt) : null;
  $("subtitle").textContent = `${d.sheet || "Planilha"} • Atualizado: ${updated ? updated.toLocaleString() : "—"}`;

  $("chipLastTs").textContent = d.time?.lastTimestamp
    ? `Última inscrição: ${new Date(d.time.lastTimestamp).toLocaleString()}`
    : "Sem timestamp";

  const multi = d.area?.stats?.multiPct ?? null;
  $("chipAreaMulti").textContent = multi == null ? "Sem área" : `Área multi: ${formatPct(multi)}`;

  // KPIs
  $("kpiTotal").textContent     = fmtInt(d.totalRows);
  $("kpiTotalFoot").textContent = `Com CPF: ${fmtInt(d.totalComCpf)} | Área vazia: ${formatPct(d.rates?.areaVaziaPct ?? 0)}`;

  $("kpiUnicos").textContent     = fmtInt(d.unicosCpf);
  $("kpiUnicosFoot").textContent = `Únicos/CPF (dedupe)`;

  $("kpiDup").textContent     = fmtInt(d.duplicatasCpf);
  $("kpiDupFoot").textContent = `Taxa: ${formatPct(d.rates?.duplicatasCpfPct ?? 0)} | Chaves duplicadas: ${fmtInt(d.chavesCpfDuplicadas)}`;

  $("kpiCpfInv").textContent     = fmtInt(d.cpfInvalido);
  $("kpiCpfInvFoot").textContent = `Taxa: ${formatPct(d.rates?.cpfInvalidoPct ?? 0)}`;

  const fixed = d.modalidadeExtra?.fixed;
  $("kpiAtelier").textContent   = fmtInt(fixed?.atelier  ?? 0);
  $("kpiRodada").textContent    = fmtInt(fixed?.rodada   ?? 0);
  $("kpiSemExtra").textContent  = fmtInt(fixed?.semExtra ?? 0);
  $("kpiExtraPct").textContent  = formatPct(d.rates?.atividadeExtraPct ?? 0);
  $("kpiModalFoot").textContent = `Total conferido: ${fmtInt(fixed?.total ?? 0)}`;

  $("kpi2h").textContent  = fmtInt(d.velocity?.last2h  ?? 0);
  $("kpi24h").textContent = fmtInt(d.velocity?.last24h ?? 0);
  $("kpi7d").textContent  = fmtInt(d.velocity?.last7d  ?? 0);

  // Qualidade
  $("kpiAreaVazia").textContent  = fmtInt(d.area?.vazios ?? 0);
  $("kpiApresVazia").textContent = fmtInt(d.apresentacao?.vazios ?? 0);
  $("kpiAreaPct").textContent    = formatPct(d.rates?.areaVaziaPct ?? 0);
  $("kpiApresPct").textContent   = formatPct(d.rates?.apresentacaoVaziaPct ?? 0);

  const suspeitosTotal = sumTopList(d.area?.suspeitos || []);
  $("kpiSuspeitos").textContent     = fmtInt(suspeitosTotal);
  $("kpiSuspeitosFoot").textContent = `Taxa: ${formatPct(d.rates?.suspeitosAreaPct ?? 0)} • Itens: ${d.area?.suspeitos?.length ?? 0}`;

  $("kpiEmailDup").textContent     = fmtInt(d.email?.duplicatasEmail ?? 0);
  $("kpiEmailDupFoot").textContent = `Chaves duplicadas: ${fmtInt(d.email?.chavesEmailDuplicadas ?? 0)} • Com email: ${fmtInt(d.email?.totalComEmail ?? 0)}`;

  // Tabelas
  renderTableTop( $("tblTopAreas"),     d.area?.topClean || [], 12);
  renderTableList($("tblCpfInvalid"),   (d.cpfInvalidSample || []).map(x => ({key: x, value: ""})), 12);
  renderTableList($("tblCpfDup"),       (d.sampleCpfDuplicados || []).map(x => ({key: `${x.cpf}`, value: x.ocorrencias})), 12);
  renderTableTop( $("tblSuspeitosArea"), d.area?.suspeitos || [], 12);

  // Charts
  drawLineChart("chartByDay",    objectToSeries(d.time?.byDay  || {}));
  drawBarChart( "chartByHour",   objectToSeries(d.time?.byHour || {}), { maxBars: 24, labelEvery: 3 });
  drawBarChart( "chartAreaMacro",listToSeries(  d.area?.macro  || []), { maxBars: 12, labelEvery: 1 });
  drawQualityChart("chartQuality", d.time?.qualityByDay || {});
}

// ─── Tables ──────────────────────────────────────────────
function renderTableTop(container, items, n){
  container.innerHTML = "";
  items.slice(0, n).forEach(it => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="left" title="${escapeHtml(it.key)}">${escapeHtml(it.key)}</div>
                     <div class="right">${fmtInt(it.value)}</div>`;
    container.appendChild(row);
  });
  if (!items.length) container.innerHTML = `<div class="muted">Sem dados.</div>`;
}

function renderTableList(container, items, n){
  container.innerHTML = "";
  items.slice(0, n).forEach(it => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="left" title="${escapeHtml(it.key)}">${escapeHtml(it.key)}</div>
                     <div class="right">${escapeHtml(String(it.value ?? ""))}</div>`;
    container.appendChild(row);
  });
  if (!items.length) container.innerHTML = `<div class="muted">Sem dados.</div>`;
}

// ─── Data helpers ────────────────────────────────────────
function objectToSeries(obj){ return Object.entries(obj).map(([x,y]) => ({x, y: Number(y||0)})); }
function listToSeries(list)  { return (list||[]).map(it => ({x: it.key, y: Number(it.value||0)})); }
function sumTopList(list)    { return (list||[]).reduce((acc,it) => acc + Number(it.value||0), 0); }

// ─── Tooltip ─────────────────────────────────────────────
const tooltip   = document.getElementById("chartTooltip");
const chartMeta = {};

function showTooltip(e, label, value, sub){
  tooltip.innerHTML = `
    <div class="tt-label">${label}</div>
    <div class="tt-value">${value}</div>
    ${sub ? `<div class="tt-sub">${sub}</div>` : ""}
  `;
  tooltip.classList.add("visible");
  positionTooltip(e);
}
function hideTooltip(){ tooltip.classList.remove("visible"); }
function positionTooltip(e){
  const tw = tooltip.offsetWidth  || 140;
  const th = tooltip.offsetHeight || 60;
  let x = e.clientX + 16, y = e.clientY - th / 2;
  if (x + tw > window.innerWidth  - 10) x = e.clientX - tw - 16;
  if (y < 6) y = 6;
  if (y + th > window.innerHeight - 6)  y = window.innerHeight - th - 6;
  tooltip.style.left = x + "px";
  tooltip.style.top  = y + "px";
}

function attachCanvasHover(id){
  const c = $(id);
  if (!c || c._ttBound) return;
  c._ttBound = true;
  c.addEventListener("mousemove", e => {
    const meta = chartMeta[id];
    if (!meta) return hideTooltip();
    const rect = c.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = meta._hitTest(mx, my);
    if (hit) showTooltip(e, hit.label, hit.value, hit.sub);
    else     hideTooltip();
    if (meta._redraw) meta._redraw(mx, my);
  });
  c.addEventListener("mouseleave", () => {
    hideTooltip();
    const meta = chartMeta[id];
    if (meta?._redraw) meta._redraw(-1, -1);
  });
}

// ─── Canvas helper ───────────────────────────────────────
function getCanvas(id){
  const c    = $(id);
  const dpr  = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  const cssW = rect.width;
  const cssH = Number(c.getAttribute("height") || rect.height);
  c.width  = Math.floor(cssW * dpr);
  c.height = Math.floor(cssH * dpr);
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

// ─── Line chart ──────────────────────────────────────────
function drawLineChart(id, series){
  const { ctx, w, h } = getCanvas(id);
  const PAD_L = 44, PAD_R = 16, PAD_T = 20, PAD_B = 28;
  const iW = w - PAD_L - PAD_R;
  const iH = h - PAD_T - PAD_B;
  const maxY = Math.max(1, ...series.map(p => p.y));

  function draw(hoverMx){
    ctx.clearRect(0, 0, w, h);

    // grid + Y labels
    for (let i = 0; i <= 4; i++){
      const y   = PAD_T + iH * (i / 4);
      const val = Math.round(maxY * (1 - i / 4));
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + iW, y); ctx.stroke();
      ctx.fillStyle  = "rgba(255,255,255,0.40)";
      ctx.font       = "10px system-ui,sans-serif";
      ctx.textAlign  = "right";
      ctx.fillText(fmtInt(val), PAD_L - 6, y + 3.5);
    }

    const pts = series.map((p, i) => ({
      cx: PAD_L + iW * (i / Math.max(series.length - 1, 1)),
      cy: PAD_T + iH * (1 - p.y / maxY),
      data: p
    }));

    if (pts.length < 2){ return; }

    // area gradient fill
    const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + iH);
    grad.addColorStop(0,   "rgba(255,122,24,0.20)");
    grad.addColorStop(0.65,"rgba(255,122,24,0.05)");
    grad.addColorStop(1,   "rgba(255,122,24,0.00)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.cx, p.cy) : ctx.lineTo(p.cx, p.cy));
    ctx.lineTo(pts[pts.length-1].cx, PAD_T + iH);
    ctx.lineTo(pts[0].cx, PAD_T + iH);
    ctx.closePath();
    ctx.fill();

    // line
    ctx.strokeStyle = "rgba(255,122,24,0.95)";
    ctx.lineWidth   = 2;
    ctx.lineJoin    = "round";
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.cx, p.cy) : ctx.lineTo(p.cx, p.cy));
    ctx.stroke();

    // find closest point by X
    let closest = null, closestDist = Infinity;
    if (hoverMx >= 0){
      pts.forEach(p => {
        const d = Math.abs(hoverMx - p.cx);
        if (d < closestDist){ closestDist = d; closest = p; }
      });
      const snap = pts.length > 1 ? iW / (pts.length - 1) * 0.6 + 8 : 40;
      if (closestDist > snap) closest = null;
    }

    // crosshair
    if (closest){
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(closest.cx, PAD_T); ctx.lineTo(closest.cx, PAD_T + iH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // dots
    pts.forEach(p => {
      const isHov = closest && closest === p;
      ctx.fillStyle = isHov ? "rgba(255,255,255,0.95)" : "rgba(255,210,179,0.80)";
      ctx.beginPath(); ctx.arc(p.cx, p.cy, isHov ? 5 : 3, 0, Math.PI * 2); ctx.fill();
      if (isHov){
        ctx.strokeStyle = "rgba(255,122,24,0.85)";
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 9, 0, Math.PI * 2); ctx.stroke();
      }
    });

    // X axis ticks — first and last
    ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.font      = "10px system-ui,sans-serif";
    ctx.textAlign = "left";
    if (series.length){
      ctx.fillText(String(series[0].x), PAD_L, h - 5);
      ctx.textAlign = "right";
      ctx.fillText(String(series[series.length - 1].x), PAD_L + iW, h - 5);
    }
  }

  draw(-1);

  chartMeta[id] = {
    series, iW, PAD_L, PAD_T, iH,
    _hitTest(mx){
      const pts = this.series.map((p, i) => ({
        cx: this.PAD_L + this.iW * (i / Math.max(this.series.length - 1, 1)),
        data: p
      }));
      let best = null, bestD = Infinity;
      pts.forEach(p => { const d = Math.abs(mx - p.cx); if (d < bestD){ bestD = d; best = p; } });
      const snap = pts.length > 1 ? this.iW / (pts.length - 1) * 0.6 + 8 : 40;
      return (best && bestD < snap)
        ? { label: String(best.data.x), value: fmtInt(best.data.y), sub: null }
        : null;
    },
    _redraw(mx){ draw(mx); }
  };

  attachCanvasHover(id);
}

// ─── Bar chart ───────────────────────────────────────────
function drawBarChart(id, series, opts = {}){
  const { ctx, w, h } = getCanvas(id);
  const PAD_L = 44, PAD_R = 10, PAD_T = 16, PAD_B = 32;
  const iW = w - PAD_L - PAD_R;
  const iH = h - PAD_T - PAD_B;

  const maxBars    = opts.maxBars    || 12;
  const labelEvery = opts.labelEvery ?? 1;
  const data = series.slice(0, maxBars);
  const n    = data.length || 1;
  const maxY = Math.max(1, ...data.map(p => p.y));

  // proportional gap (2–5 px), bar max 26 px
  const GAP  = Math.max(2, Math.min(5, Math.floor(iW / n * 0.14)));
  const barW = Math.min(26, Math.floor((iW - GAP * (n - 1)) / n));
  const groupW = n * barW + (n - 1) * GAP;
  const startX = PAD_L + Math.floor((iW - groupW) / 2);

  // precompute bar rects (stable across redraws)
  const bars = data.map((p, i) => {
    const x    = startX + i * (barW + GAP);
    const barH = Math.max(1, iH * (p.y / maxY));
    const y    = PAD_T + iH - barH;
    return { x, y, barW, barH, data: p, idx: i };
  });

  function draw(hoverIdx){
    ctx.clearRect(0, 0, w, h);

    // grid + Y labels
    for (let i = 0; i <= 4; i++){
      const y   = PAD_T + iH * (i / 4);
      const val = Math.round(maxY * (1 - i / 4));
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + iW, y); ctx.stroke();
      ctx.fillStyle  = "rgba(255,255,255,0.40)";
      ctx.font       = "10px system-ui,sans-serif";
      ctx.textAlign  = "right";
      ctx.fillText(fmtInt(val), PAD_L - 6, y + 3.5);
    }

    bars.forEach(b => {
      const isHov = b.idx === hoverIdx;
      const r     = Math.max(0, Math.min(4, b.barW / 2));

      // bar gradient
      const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.barH);
      grad.addColorStop(0, isHov ? "rgba(255,185,80,0.95)" : "rgba(255,122,24,0.75)");
      grad.addColorStop(1, isHov ? "rgba(255,130,30,0.80)" : "rgba(190,72,8,0.55)");
      ctx.fillStyle = grad;

      // rounded top corners
      ctx.beginPath();
      ctx.moveTo(b.x + r, b.y);
      ctx.lineTo(b.x + b.barW - r, b.y);
      ctx.arcTo(b.x + b.barW, b.y, b.x + b.barW, b.y + r, r);
      ctx.lineTo(b.x + b.barW, b.y + b.barH);
      ctx.lineTo(b.x, b.y + b.barH);
      ctx.arcTo(b.x, b.y, b.x + r, b.y, r);
      ctx.closePath();
      ctx.fill();

      // top shimmer
      ctx.fillStyle = isHov ? "rgba(255,240,180,0.50)" : "rgba(255,210,179,0.35)";
      ctx.fillRect(b.x, b.y, b.barW, 2);

      // X label
      if (b.idx % labelEvery === 0){
        ctx.fillStyle = isHov ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)";
        ctx.font      = "10px system-ui,sans-serif";
        ctx.textAlign = "center";
        const lbl = String(b.data.x).length > 7 ? String(b.data.x).slice(0,7)+"…" : String(b.data.x);
        ctx.fillText(lbl, b.x + b.barW / 2, h - 8);
      }
    });
  }

  draw(-1);

  chartMeta[id] = {
    bars, PAD_T, iH,
    _hitTest(mx, my){
      for (const b of this.bars){
        if (mx >= b.x - 1 && mx <= b.x + b.barW + 1 && my >= this.PAD_T && my <= this.PAD_T + this.iH){
          return { label: String(b.data.x), value: fmtInt(b.data.y), sub: null };
        }
      }
      return null;
    },
    _redraw(mx){
      let idx = -1;
      for (const b of this.bars){
        if (mx >= b.x - 1 && mx <= b.x + b.barW + 1){ idx = b.idx; break; }
      }
      draw(idx);
    }
  };

  attachCanvasHover(id);
}

// ─── Quality chart ───────────────────────────────────────
function drawQualityChart(id, qualityByDay){
  const days = Object.keys(qualityByDay || {}).sort();
  const areaSeries = [], apresSeries = [];

  days.forEach(day => {
    const q = qualityByDay[day];
    const total = Number(q.total || 0) || 1;
    areaSeries.push ({x: day, y: round1(((total - Number(q.areaEmpty    || 0)) / total) * 100)});
    apresSeries.push({x: day, y: round1(((total - Number(q.apresentEmpty || 0)) / total) * 100)});
  });

  const { ctx, w, h } = getCanvas(id);
  const PAD_L = 44, PAD_R = 16, PAD_T = 28, PAD_B = 28;
  const iW = w - PAD_L - PAD_R;
  const iH = h - PAD_T - PAD_B;

  function ptsFor(series){
    return series.map((p, i) => ({
      cx: PAD_L + iW * (i / Math.max(series.length - 1, 1)),
      cy: PAD_T + iH * (1 - p.y / 100),
      data: p
    }));
  }

  const seriesConf = [
    { getter: () => ptsFor(areaSeries),  stroke: "rgba(255,122,24,0.95)",   dot: "rgba(255,122,24,0.95)",   name: "Área"          },
    { getter: () => ptsFor(apresSeries), stroke: "rgba(255,210,179,0.85)", dot: "rgba(255,210,179,0.85)",  name: "Apresentação"  },
  ];

  function draw(hoverMx){
    ctx.clearRect(0, 0, w, h);

    // grid + Y labels
    for (let i = 0; i <= 4; i++){
      const y = PAD_T + iH * (i / 4);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + iW, y); ctx.stroke();
      ctx.fillStyle  = "rgba(255,255,255,0.40)";
      ctx.font       = "10px system-ui,sans-serif";
      ctx.textAlign  = "right";
      ctx.fillText(`${100 - i * 25}%`, PAD_L - 6, y + 3.5);
    }

    // legend
    seriesConf.forEach((sc, i) => {
      const lx = PAD_L + i * 195;
      ctx.fillStyle = sc.stroke;
      ctx.fillRect(lx, 8, 10, 10);
      ctx.fillStyle  = "rgba(255,255,255,0.60)";
      ctx.font       = "11px system-ui,sans-serif";
      ctx.textAlign  = "left";
      ctx.fillText(sc.name === "Área" ? "Área preenchida" : "Apresentação preenchida", lx + 14, 17);
    });

    let closestPt = null, closestSC = null, closestDist = Infinity;
    const snap = areaSeries.length > 1 ? iW / (areaSeries.length - 1) * 0.6 + 8 : 40;

    // draw lines
    seriesConf.forEach(sc => {
      const pts = sc.getter();
      if (pts.length < 2) return;
      ctx.strokeStyle = sc.stroke;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = "round";
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.cx, p.cy) : ctx.lineTo(p.cx, p.cy));
      ctx.stroke();

      if (hoverMx >= 0){
        pts.forEach(p => {
          const d = Math.abs(hoverMx - p.cx);
          if (d < closestDist){ closestDist = d; closestPt = p; closestSC = sc; }
        });
      }
    });

    if (closestDist > snap){ closestPt = null; }

    // crosshair
    if (closestPt){
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(closestPt.cx, PAD_T); ctx.lineTo(closestPt.cx, PAD_T + iH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // dots
    seriesConf.forEach(sc => {
      const pts = sc.getter();
      pts.forEach(p => {
        const isHov = closestPt && closestSC === sc && p.cx === closestPt.cx;
        ctx.fillStyle = isHov ? "rgba(255,255,255,0.95)" : sc.dot;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, isHov ? 5 : 3, 0, Math.PI * 2); ctx.fill();
        if (isHov){
          ctx.strokeStyle = sc.stroke;
          ctx.lineWidth   = 1.5;
          ctx.beginPath(); ctx.arc(p.cx, p.cy, 9, 0, Math.PI * 2); ctx.stroke();
        }
      });
    });

    // X axis first/last
    ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.font      = "10px system-ui,sans-serif";
    if (days.length){
      ctx.textAlign = "left";  ctx.fillText(days[0], PAD_L, h - 5);
      ctx.textAlign = "right"; ctx.fillText(days[days.length - 1], PAD_L + iW, h - 5);
    }
  }

  draw(-1);

  chartMeta[id] = {
    _hitTest(mx){
      const snap = areaSeries.length > 1 ? iW / (areaSeries.length - 1) * 0.6 + 8 : 40;
      let best = null, bestD = Infinity, bestName = "";
      seriesConf.forEach(sc => {
        sc.getter().forEach(p => {
          const d = Math.abs(mx - p.cx);
          if (d < bestD){ bestD = d; best = p; bestName = sc.name; }
        });
      });
      return (best && bestD < snap)
        ? { label: `${bestName} — ${best.data.x}`, value: `${best.data.y}%`, sub: null }
        : null;
    },
    _redraw(mx){ draw(mx); }
  };

  attachCanvasHover(id);
}

// ─── Auto refresh ────────────────────────────────────────
function setupAutoRefresh(){
  const ms = Number($("refreshSelect").value || 0);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  if (ms > 0) refreshTimer = setInterval(load, ms);
}

// ─── Formatters ──────────────────────────────────────────
function fmtInt(n)    { return Number(n || 0).toLocaleString("pt-BR"); }
function formatPct(n) { return `${Number(n || 0).toFixed(1).replace(".", ",")}%`; }
function round1(x)    { return Math.round(x * 10) / 10; }

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

window.addEventListener("resize", () => { if (lastData) render(lastData); });

setupAutoRefresh();
load();
