/* E1 live explorer: re-gate raw events in the browser and redraw every figure. */
const COL = {
  0: "#8A94A6",
  1: "#7B6FD0",
  2: "#17A398",
  3: "#E4572E"
};
const LABELS = ["Plasma particles / debris", "Doublets", "Live cells", "Dead cells"];
const PLOTLY_UI = { responsive: true, displaylogo: false };
let META, TUBES, sb, curName, curFig = "3d", cache = new Map(), debounceTimer;

const $ = (id) => document.getElementById(id);

function pip(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    const denom = (yj - yi) || 1e-12;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function logicle(v) {
  const raw = META.logicleLut.raw, y = META.logicleLut.y;
  if (v <= raw[0]) return y[0];
  if (v >= raw[raw.length - 1]) return y[y.length - 1];
  let lo = 0, hi = raw.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (raw[mid] <= v) lo = mid; else hi = mid;
  }
  const t = (v - raw[lo]) / (raw[hi] - raw[lo] || 1);
  return y[lo] + t * (y[hi] - y[lo]);
}

function parseBin(buf) {
  const mag = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (mag !== "E1F1") throw new Error("Bad events.bin");
  const dv = new DataView(buf);
  let o = 8;
  const nTubes = dv.getUint32(o, true); o += 4;
  const out = [];
  for (let t = 0; t < nTubes; t++) {
    const n = dv.getUint32(o, true); o += 4;
    const fsc = new Int32Array(buf, o, n); o += n * 4;
    const ssc = new Int32Array(buf, o, n); o += n * 4;
    const fsch = new Int32Array(buf, o, n); o += n * 4;
    const dye = new Int32Array(buf, o, n); o += n * 4;
    out.push({ ...META.tubes[t], fsc, ssc, fsch, dye, n });
  }
  return out;
}

function recGate(fscMin) {
  return META.recommended.map(([x, y]) => [x === 60000 ? fscMin : x, Math.min(y, META.scaleMax)]);
}

function gatesFromUI() {
  return {
    mode: $("gateMode").value,
    dyeCutoff: Number($("dyeCutoff").value),
    singletLo: Number($("singletLo").value),
    singletHi: Number($("singletHi").value),
    fscMin: Number($("fscMin").value)
  };
}

function classify(tube, g) {
  const key = [tube.id, g.mode, g.dyeCutoff, g.singletLo, g.singletHi, g.fscMin].join("|");
  if (cache.has(key)) return cache.get(key);
  const { fsc, ssc, fsch, dye, n } = tube;
  const cls = new Uint8Array(n);
  const cellPoly = g.mode === "original" ? META.originalThp : recGate(g.fscMin);
  const singPoly = META.originalSinglets;
  const livePoly = META.originalLive;
  let nCell = 0, nSing = 0, nLive = 0, nDead = 0;
  for (let i = 0; i < n; i++) {
    if (!pip(cellPoly, fsc[i], ssc[i])) continue;
    nCell++;
    let sing;
    if (g.mode === "original") sing = pip(singPoly, fsc[i], fsch[i]);
    else {
      const r = fsch[i] / Math.max(fsc[i], 1);
      sing = r > g.singletLo && r < g.singletHi;
    }
    if (!sing) { cls[i] = 1; continue; }
    nSing++;
    const live = g.mode === "original" ? pip(livePoly, fsc[i], dye[i]) : dye[i] <= g.dyeCutoff;
    if (live) { cls[i] = 2; nLive++; } else { cls[i] = 3; nDead++; }
  }
  const tot = nLive + nDead;
  const v = tot ? 100 * nLive / tot : 0;
  const [lo, hi] = wilson(nLive, tot);
  const rec = { cls, n, nCell, nSing, nLive, nDead, v, lo: 100 * lo, hi: 100 * hi };
  cache.set(key, rec);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return rec;
}

function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n, den = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / den;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return [centre - half, centre + half];
}

function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  return s * (1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
}

function linreg(xs, ys) {
  const n = xs.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const slope = sxy / sxx, intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy || 1);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = ys[i] - (intercept + slope * xs[i]);
    sse += e * e;
  }
  const df = n - 2;
  const se = Math.sqrt(sse / (df * sxx));
  const t = slope / se;
  const z = Math.abs(t) * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
  const p = Math.min(1, 1 - erf(z / Math.SQRT2));
  return { slope, intercept, r2, p: 2 * (p < 0 ? 0 : p > 1 ? 1 : p), se, mx, sxx, sse, df };
}

function sampleIdx(cls, code, max, seed) {
  const idx = [];
  for (let i = 0; i < cls.length; i++) if (cls[i] === code) idx.push(i);
  if (idx.length <= max) return idx;
  let s = seed + code * 997;
  const pick = [];
  for (let i = 0; i < max; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = i + (s % (idx.length - i));
    const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    pick.push(idx[i]);
  }
  return pick;
}

function take(arr, idx) { return idx.map((i) => arr[i]); }

function darkAx(title, extra) {
  return Object.assign({
    title: { text: title, font: { color: "#CADCFC", size: 12 } },
    gridcolor: "#2E4262", zerolinecolor: "#2E4262", color: "#9FB0C8",
    tickfont: { size: 10 }
  }, extra || {});
}

function layoutBase(extra) {
  return Object.assign({
    paper_bgcolor: "#152033", plot_bgcolor: "#0F1826", font: { color: "#E6ECF4" },
    margin: { l: 56, r: 18, t: 40, b: 48 }, legend: { bgcolor: "rgba(15,24,38,0.7)", font: { size: 11 } }
  }, extra || {});
}

function currentTube() { return TUBES.find((t) => t.name === curName) || TUBES[0]; }

function setSliderLabels() {
  const g = gatesFromUI();
  $("dyeVal").textContent = g.dyeCutoff;
  $("dyeLog").textContent = `(logicle ${logicle(g.dyeCutoff).toFixed(2)})`;
  $("loVal").textContent = g.singletLo.toFixed(2);
  $("hiVal").textContent = g.singletHi.toFixed(2);
  $("fscVal").textContent = Math.round(g.fscMin).toLocaleString();
  const orig = g.mode === "original";
  $("origHint").hidden = !orig;
  ["dyeCutoff", "singletLo", "singletHi", "fscMin"].forEach((id) => { $(id).disabled = orig; });
}

function updateStats() {
  const g = gatesFromUI();
  const t = currentTube();
  const r = classify(t, g);
  const tot = r.n;
  $("stats").innerHTML =
    `<b>${t.name}</b> · ${tot.toLocaleString()} events · ` +
    `cells ${r.nCell.toLocaleString()} · singlets ${r.nSing.toLocaleString()} · ` +
    `viability <b>${r.v.toFixed(1)}%</b> (${Number.isFinite(r.lo) ? r.lo.toFixed(1) : "–"}–${Number.isFinite(r.hi) ? r.hi.toFixed(1) : "–"}) · ` +
    `${r.nLive.toLocaleString()} live / ${r.nDead.toLocaleString()} dead`;
}

function draw3d() {
  const g = gatesFromUI();
  const t = currentTube();
  const r = classify(t, g);
  const traces = [];
  for (let c = 0; c < 4; c++) {
    const idx = sampleIdx(r.cls, c, 2500, 1);
    if (!idx.length) continue;
    const nAll = [r.n - r.nCell, r.nCell - r.nSing, r.nLive, r.nDead][c];
    traces.push({
      type: "scatter3d", mode: "markers", name: `${LABELS[c]} (${nAll.toLocaleString()})`,
      x: take(t.fsc, idx), y: take(t.ssc, idx), z: take(t.dye, idx).map(logicle),
      marker: { size: [1.6, 2.2, 2.4, 3.4][c], color: COL[c], opacity: [0.25, 0.6, 0.75, 0.95][c] },
      hovertemplate: "FSC %{x}<br>SSC %{y}<extra>" + LABELS[c] + "</extra>"
    });
  }
  const cut = logicle(g.mode === "original" ? 535 : g.dyeCutoff);
  traces.push({
    type: "mesh3d", x: [0, 262144, 262144, 0], y: [0, 0, 262144, 262144], z: [cut, cut, cut, cut],
    i: [0, 0], j: [1, 2], k: [2, 3], color: "#FFFFFF", opacity: 0.08, name: "live/dead cut-off", hoverinfo: "skip"
  });
  const ax = (title) => ({
    title: { text: title, font: { color: "#CADCFC" } }, gridcolor: "#2E4262", zerolinecolor: "#2E4262",
    color: "#9FB0C8", backgroundcolor: "#0F1826", showbackground: true
  });
  Plotly.react("plot", traces, {
    paper_bgcolor: "#152033", font: { color: "#E6ECF4" }, margin: { l: 0, r: 0, t: 8, b: 0 },
    legend: { x: 0.01, y: 0.98, bgcolor: "rgba(15,24,38,0.7)" },
    scene: {
      xaxis: ax("FSC-A (size)"), yaxis: ax("SSC-A (granularity)"),
      zaxis: Object.assign(ax("Viability dye"), { tickvals: META.ticks.vals, ticktext: META.ticks.text }),
      camera: { eye: { x: 1.6, y: -1.6, z: 0.8 } }, aspectmode: "cube"
    }
  }, PLOTLY_UI);
  $("cap").textContent = "Drag to rotate. Click legend items to hide a group. Cut-off plane follows your dye slider.";
}

function drawScatter() {
  const g = gatesFromUI();
  const t = currentTube();
  const r = classify(t, g);
  const traces = [];
  for (let c = 0; c < 4; c++) {
    const idx = sampleIdx(r.cls, c, 4000, 2);
    if (!idx.length) continue;
    traces.push({
      type: "scatter", mode: "markers", name: LABELS[c],
      x: take(t.fsc, idx), y: take(t.ssc, idx),
      marker: { size: c === 3 ? 5 : 3, color: COL[c], opacity: c === 0 ? 0.18 : 0.55 }
    });
  }
  const poly = g.mode === "original" ? META.originalThp : recGate(g.fscMin);
  const closed = poly.concat([poly[0]]);
  traces.push({
    type: "scatter", mode: "lines", name: "All-cells gate",
    x: closed.map((p) => p[0]), y: closed.map((p) => p[1]),
    line: { color: "#FFFFFF", width: 2 }
  });
  Plotly.react("plot", traces, layoutBase({
    title: { text: `${t.name}: FSC-A vs SSC-A (gate follows your inputs)`, font: { size: 14, color: "#CADCFC" } },
    xaxis: darkAx("FSC-A (size)", { range: [0, META.scaleMax] }),
    yaxis: darkAx("SSC-A (granularity)", { range: [0, META.scaleMax] })
  }), PLOTLY_UI);
  $("cap").textContent = "White outline is the current all-cells gate. Lower the FSC minimum to pull in smaller events; original FlowJo uses the tight THP polygon.";
}

function kdeSmooth(counts) {
  const out = new Float64Array(counts.length);
  const k = [0.06, 0.24, 0.4, 0.24, 0.06];
  for (let i = 0; i < counts.length; i++) {
    let s = 0;
    for (let j = -2; j <= 2; j++) s += k[j + 2] * (counts[i + j] || 0);
    out[i] = s;
  }
  return out;
}

function drawRidge() {
  const g = gatesFromUI();
  const nb = 180;
  const z0 = logicle(-1500), z1 = 1;
  const names = TUBES.map((t) => t.name).reverse();
  const traces = [];
  names.forEach((name, row) => {
    const t = TUBES.find((u) => u.name === name);
    const r = classify(t, g);
    const h = new Float64Array(nb);
    for (let i = 0; i < t.n; i++) {
      if (r.cls[i] !== 2 && r.cls[i] !== 3) continue;
      const z = logicle(t.dye[i]);
      let b = Math.floor((z - z0) / (z1 - z0) * nb);
      if (b < 0) b = 0; if (b >= nb) b = nb - 1;
      h[b]++;
    }
    const s = kdeSmooth(h);
    let m = 1e-9;
    for (let i = 0; i < nb; i++) m = Math.max(m, s[i]);
    const xs = [], ys = [];
    for (let i = 0; i < nb; i++) {
      xs.push(z0 + (i + 0.5) * (z1 - z0) / nb);
      ys.push(row + Math.sqrt(s[i] / m) * 0.92);
    }
    const col = name === "HK" ? COL[3] : name === "Unstained" ? "#8A94A6" : COL[2];
    traces.push({
      type: "scatter", mode: "lines", x: xs, y: xs.map(() => row),
      line: { width: 0 }, showlegend: false, hoverinfo: "skip"
    });
    traces.push({
      type: "scatter", mode: "lines", x: xs, y: ys, fill: "tonexty",
      fillcolor: col + "b3", line: { color: "#fff", width: 1 }, name: `${name}  ${r.v.toFixed(1)}% live`,
      hovertemplate: "%{fullData.name}<extra></extra>"
    });
  });
  const cut = logicle(g.mode === "original" ? 535 : g.dyeCutoff);
  traces.push({
    type: "scatter", mode: "lines", x: [cut, cut], y: [-0.2, names.length],
    line: { color: "#CADCFC", dash: "dash", width: 1 }, name: "cut-off", hoverinfo: "skip"
  });
  Plotly.react("plot", traces, layoutBase({
    title: { text: "Dye intensity of singlets (ridge height = √density)", font: { size: 14, color: "#CADCFC" } },
    xaxis: darkAx("Viability dye (logicle)", { tickvals: META.ticks.vals, ticktext: META.ticks.text }),
    yaxis: darkAx("", { tickvals: names.map((_, i) => i), ticktext: names, range: [-0.3, names.length] }),
    showlegend: false, margin: { l: 90, r: 18, t: 40, b: 48 }
  }), PLOTLY_UI);
  $("cap").textContent = "Ridges use your current singlet definition and dye cut-off. Heat-killed should sit on the right; unstained on the left.";
}

function drawDose() {
  const g = gatesFromUI();
  const xs = [], ys = [], yLo = [], yHi = [], text = [], custom = [];
  TUBES.forEach((t) => {
    if (t.dose == null) return;
    const r = classify(t, g);
    xs.push(t.dose + (t.repeat ? 1.6 : 0));
    ys.push(r.v);
    yLo.push(r.v - r.lo);
    yHi.push(r.hi - r.v);
    text.push(t.name);
    custom.push(t.name);
  });
  const lr = linreg(xs.map((_, i) => TUBES.filter((t) => t.dose != null)[i].dose), ys);
  const lineX = Array.from({ length: 71 }, (_, i) => i);
  const lineY = lineX.map((x) => lr.intercept + lr.slope * x);
  const hk = TUBES.find((t) => t.id === "HK");
  const hkv = hk ? classify(hk, g).v : 0;
  const traces = [
    { type: "scatter", mode: "lines", x: lineX, y: lineY, line: { color: "#17A398", width: 2, dash: "dash" }, name: "linear trend", hoverinfo: "skip" },
    {
      type: "scatter", mode: "markers", x: xs, y: ys, text, customdata: custom,
      error_y: { type: "data", array: yHi, arrayminus: yLo, color: "#9FB0C8", thickness: 1, width: 4 },
      marker: { size: 10, color: xs.map((x) => x < 1 ? "#CADCFC" : "#17A398"), symbol: text.map((n) => (TUBES.find((t) => t.name === n) || {}).repeat ? "square" : "circle") },
      hovertemplate: "%{text}<br>%{y:.1f}%<extra></extra>", name: "tube viability"
    },
    { type: "scatter", mode: "lines", x: [0, 70], y: [hkv, hkv], line: { color: "#E4572E", width: 1, dash: "dot" }, name: `heat-killed ${hkv.toFixed(1)}%` }
  ];
  Plotly.react("plot", traces, layoutBase({
    title: {
      text: `Viability vs % plasma  ·  ${(10 * lr.slope).toFixed(2)}% per +10% plasma  ·  p = ${lr.p.toFixed(2)}  ·  R² = ${lr.r2.toFixed(2)}`,
      font: { size: 13, color: "#CADCFC" }
    },
    xaxis: darkAx("Mouse plasma (%)", { range: [-4, 74] }),
    yaxis: darkAx("Viability (%)", { range: [Math.min(0, hkv - 5), 102] }),
    hovermode: "closest"
  }), PLOTLY_UI);
  const el = $("plot");
  if (el.removeAllListeners) el.removeAllListeners("plotly_click");
  el.on("plotly_click", (ev) => {
    if (ev.points && ev.points[0] && ev.points[0].customdata) {
      curName = ev.points[0].customdata;
      refresh();
    }
  });
  $("cap").textContent = "Error bars are Wilson 95% CIs from your current gates. Click a point to open that tube. Squares are repeat tubes.";
}

function drawDonuts() {
  const g = gatesFromUI();
  const html = TUBES.map((t) => {
    const r = classify(t, g);
    const live = r.v, dead = 100 - r.v;
    const bg = `conic-gradient(#17A398 0 ${live}%, #E4572E ${live}% 100%)`;
    return `<div class="donut"><div class="ring" style="background:${bg}"><div class="hole">${r.v.toFixed(1)}%</div></div>
      <div class="name">${t.name}</div><div class="sub2">${r.nLive.toLocaleString()} live · ${r.nDead.toLocaleString()} dead</div></div>`;
  }).join("");
  $("plot").innerHTML = `<div class="donut-grid">${html}</div>`;
  $("cap").textContent = "Each donut is live ÷ (live + dead) singlets under the gates you set on the left.";
}

function drawFunnel() {
  const g = gatesFromUI();
  const traces = TUBES.map((t) => {
    const r = classify(t, g);
    const col = t.id === "HK" ? COL[3] : t.id === "Unstained" ? "#8A94A6" : COL[2];
    return {
      type: "scatter", mode: "lines+markers",
      x: ["All events", "All cells", "Single cells", "Live cells"],
      y: [r.n, r.nCell, r.nSing, Math.max(r.nLive, 0.5)],
      name: t.name, line: { color: col, width: 2, dash: t.repeat ? "dash" : "solid" },
      marker: { size: 7 }
    };
  });
  Plotly.react("plot", traces, layoutBase({
    title: { text: "Gating funnel (log scale) — updates with your gates", font: { size: 14, color: "#CADCFC" } },
    xaxis: darkAx(""),
    yaxis: darkAx("Events remaining", { type: "log" })
  }), PLOTLY_UI);
  $("cap").textContent = "Plasma adds events at the top. If live cells collapse when you tighten the dye cut-off, the funnel bottom drops.";
}

function drawMix() {
  const g = gatesFromUI();
  const names = TUBES.map((t) => t.name);
  const debris = [], doub = [], live = [], dead = [];
  TUBES.forEach((t) => {
    const r = classify(t, g);
    const tot = r.n || 1;
    debris.push(100 * (r.n - r.nCell) / tot);
    doub.push(100 * (r.nCell - r.nSing) / tot);
    live.push(100 * r.nLive / tot);
    dead.push(100 * r.nDead / tot);
  });
  const traces = [
    { type: "bar", name: LABELS[0], x: names, y: debris, marker: { color: COL[0] } },
    { type: "bar", name: LABELS[1], x: names, y: doub, marker: { color: COL[1] } },
    { type: "bar", name: LABELS[2], x: names, y: live, marker: { color: COL[2] } },
    { type: "bar", name: LABELS[3], x: names, y: dead, marker: { color: COL[3] } }
  ];
  Plotly.react("plot", traces, layoutBase({
    barmode: "stack",
    title: { text: "What each tube contains (% of all events)", font: { size: 14, color: "#CADCFC" } },
    xaxis: darkAx(""), yaxis: darkAx("% of events", { range: [0, 100] })
  }), PLOTLY_UI);
  $("cap").textContent = "Grey = outside the all-cells gate. Raising FSC-min throws more plasma particles into grey; original FlowJo also parks most dead cells there.";
}

function hist2d(tube, cls, liveOnly, bins = 70) {
  const h = Array.from({ length: bins }, () => new Float64Array(bins));
  const max = META.scaleMax;
  let n = 0;
  for (let i = 0; i < tube.n; i++) {
    if (liveOnly && cls[i] !== 2) continue;
    let bx = Math.floor(tube.fsc[i] / max * bins);
    let by = Math.floor(tube.ssc[i] / max * bins);
    if (bx < 0 || by < 0 || bx >= bins || by >= bins) continue;
    h[by][bx]++; n++;
  }
  if (n) for (let y = 0; y < bins; y++) for (let x = 0; x < bins; x++) h[y][x] /= n;
  return h;
}

function drawDensity() {
  const g = gatesFromUI();
  const a = TUBES.find((t) => t.id === "0%");
  const b = TUBES.find((t) => t.id === "70% (002)");
  const ra = classify(a, g), rb = classify(b, g);
  const ha = hist2d(a, ra.cls, false), hb = hist2d(b, rb.cls, false);
  const bins = ha.length, z = [];
  for (let y = 0; y < bins; y++) {
    const row = [];
    for (let x = 0; x < bins; x++) row.push(100 * (hb[y][x] - ha[y][x]));
    z.push(row);
  }
  Plotly.react("plot", [{
    type: "heatmap", z, colorscale: "RdBu", zmid: 0,
    x: Array.from({ length: bins }, (_, i) => (i + 0.5) * META.scaleMax / bins),
    y: Array.from({ length: bins }, (_, i) => (i + 0.5) * META.scaleMax / bins),
    colorbar: { title: "Δ % (70% − 0%)", titleside: "right" }
  }], layoutBase({
    title: { text: "Where events appear at 70% vs 0% plasma (all events, current gates)", font: { size: 14, color: "#CADCFC" } },
    xaxis: darkAx("FSC-A (size)", { range: [0, META.scaleMax], scaleanchor: "y" }),
    yaxis: darkAx("SSC-A (granularity)", { range: [0, META.scaleMax] }),
    margin: { l: 56, r: 70, t: 40, b: 48 }
  }), PLOTLY_UI);
  $("cap").textContent = "Red = more events in the 70% tube. The lower-left cloud is plasma particles. Change FSC-min to see the gate bite into that cloud.";
}

const FIGURES = {
  "3d": draw3d, scatter: drawScatter, ridge: drawRidge, dose: drawDose,
  donuts: drawDonuts, funnel: drawFunnel, mix: drawMix, density: drawDensity
};

function refresh(keepPlot) {
  setSliderLabels();
  updateStats();
  syncTubeTabs();
  if (!keepPlot && $("plot").data) { /* plotly graph */ }
  if (curFig !== "donuts" && $("plot").classList.contains("js-plotly-plot") === false) {
    $("plot").innerHTML = "";
  }
  if (curFig === "donuts") $("plot").innerHTML = "";
  FIGURES[curFig]();
  if (window.Plotly && $("plot").data) Plotly.Plots.resize("plot");
}

function syncTubeTabs() {
  [...$("tubeTabs").children].forEach((b) => b.classList.toggle("on", b.textContent === curName));
}

function applyGates(g) {
  $("gateMode").value = g.mode || "recommended";
  $("dyeCutoff").value = g.dyeCutoff;
  $("singletLo").value = g.singletLo;
  $("singletHi").value = g.singletHi;
  $("fscMin").value = g.fscMin;
  cache.clear();
  refresh();
}

function resetRecommended() {
  applyGates(META.defaults);
}

function schedule() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { cache.clear(); refresh(); }, 60);
}

function initControls() {
  $("dyeCutoff").value = META.defaults.dyeCutoff;
  $("singletLo").value = META.defaults.singletLo;
  $("singletHi").value = META.defaults.singletHi;
  $("fscMin").value = META.defaults.fscMin;
  $("gateMode").value = META.defaults.gateMode;
  const tabs = $("tubeTabs");
  TUBES.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t.name;
    b.onclick = () => { curName = t.name; refresh(); };
    tabs.appendChild(b);
  });
  curName = TUBES.some((t) => t.name === "70% rep") ? "70% rep" : TUBES[0].name;
  $("figTabs").onclick = (e) => {
    const btn = e.target.closest("button[data-fig]");
    if (!btn) return;
    curFig = btn.dataset.fig;
    [...$("figTabs").children].forEach((b) => b.classList.toggle("on", b === btn));
    $("plot").innerHTML = "";
    refresh();
  };
  ["dyeCutoff", "singletLo", "singletHi", "fscMin"].forEach((id) => $(id).addEventListener("input", schedule));
  $("gateMode").addEventListener("change", () => { cache.clear(); refresh(); });
  $("resetBtn").onclick = resetRecommended;
  $("saveBtn").onclick = savePreset;
  $("loadBtn").onclick = loadSelected;
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    const names = TUBES.map((t) => t.name);
    const i = names.indexOf(curName);
    if (e.key === "ArrowRight" && i < names.length - 1) { curName = names[i + 1]; refresh(); }
    if (e.key === "ArrowLeft" && i > 0) { curName = names[i - 1]; refresh(); }
  });
}

async function savePreset() {
  const g = gatesFromUI();
  const name = $("presetName").value.trim();
  $("saveStatus").textContent = "";
  if (!name) { $("saveStatus").textContent = "Give the preset a name."; return; }
  if (!sb) { $("saveStatus").textContent = "Supabase is not configured."; return; }
  const { error } = await sb.from("e1_flow_gate_presets").insert({
    name,
    author: $("presetAuthor").value.trim() || null,
    dye_cutoff: g.dyeCutoff,
    singlet_lo: g.singletLo,
    singlet_hi: g.singletHi,
    gate_mode: g.mode,
    fsc_min: g.fscMin
  });
  $("saveStatus").textContent = error ? error.message : "Saved.";
  if (!error) loadPresetList();
}

async function loadPresetList() {
  const sel = $("presetList");
  if (!sb) { sel.innerHTML = "<option value=''>Supabase unavailable</option>"; return; }
  const { data, error } = await sb.from("e1_flow_gate_presets").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) { sel.innerHTML = `<option value=''>${error.message}</option>`; return; }
  sel.innerHTML = (data || []).map((p) =>
    `<option value="${p.id}">${p.name}${p.author ? " · " + p.author : ""}</option>`
  ).join("") || "<option value=''>No presets yet</option>";
  sel._rows = data || [];
}

function loadSelected() {
  const sel = $("presetList");
  const row = (sel._rows || []).find((p) => p.id === sel.value);
  if (!row) return;
  applyGates({
    mode: row.gate_mode,
    dyeCutoff: row.dye_cutoff,
    singletLo: row.singlet_lo,
    singletHi: row.singlet_hi,
    fscMin: row.fsc_min
  });
}

async function main() {
  try {
    const cfg = window.E1_CONFIG || {};
    if (window.supabase && cfg.supabaseUrl) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    }
    const [meta, buf] = await Promise.all([
      fetch("data/meta.json").then((r) => r.json()),
      fetch("data/events.bin").then((r) => r.arrayBuffer())
    ]);
    META = meta;
    TUBES = parseBin(buf);
    initControls();
    await loadPresetList();
    $("boot").classList.add("gone");
    refresh();
  } catch (err) {
    $("boot").textContent = "Could not load events: " + err.message;
  }
}

main();
