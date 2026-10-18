/* Virtual THP-1 flow bench — page logic. Needs sim/engine.js (window.SimEngine); Supabase is optional. */
(function () {
  'use strict';
  const E = window.SimEngine;
  const $ = (id) => document.getElementById(id);
  const ENGINE_VERSION = 'sim-1.2 (HLA-DR autofluorescence, untested labels)';
  const CH = ['FSC', 'SSC', 'PI', 'PE-Cy7', 'BV786'];

  // ---------- presets ----------
  const base = () => ({ protocol: JSON.parse(JSON.stringify(E.DEFAULT_PROTOCOL)), instrument: JSON.parse(JSON.stringify(E.DEFAULT_INSTRUMENT)), gates: { ...E.DEFAULT_GATES }, seed: 12 });
  const PRESETS = {
    oct12: base,
    gentle: () => { const s = base(); Object.assign(s.protocol, { pmaDose: 10, pmaHours: 48, washAfterPMA: true, restHours: 24, ifnDose: 20, ifnHours: 48, ifnTiming: 'after', detach: 'edta', poolFloaters: false, delayMin: 30, washes: 2, fmoCells: 'pma' }); return s; },
    sep29: () => { const s = base(); s.instrument.sameVoltages = false; s.instrument.controlV = { ...E.REF_V, SSC: 287, PI: 570 }; return s; },
    oct4: () => { const s = base(); s.protocol.abQuality = { hla: 0.008, cd11b: 0.02 }; return s; },
    widegate: () => { const s = base(); s.gates.piCut = 35000; return s; }
  };

  // ---------- form <-> settings ----------
  const P_NUM = ['pmaDose', 'pmaHours', 'restHours', 'ifnDose', 'ifnHours', 'seedDensity', 'serum', 'passage', 'delayMin', 'washes'];
  const P_BOOL = ['washAfterPMA', 'poolFloaters', 'mycoTested'];
  const P_STR = ['ifnTiming', 'detach', 'temp', 'piTiming', 'fmoCells', 'viability'];
  const P_CHECK = ['includeUntreated', 'includeFMO', 'includeC1R'];
  const G_NUM = ['fscMin', 'sscMin', 'singLo', 'singHi', 'piCut'];

  function buildVoltageInputs() {
    const mk = (box, prefix) => { box.innerHTML = CH.map(c => `<div class="field"><label for="${prefix}${c}">${prefix === 'vs' ? '' : 'Controls '}${c}, V</label><input id="${prefix}${c}" type="number" min="200" max="900" step="5"></div>`).join(''); };
    mk($('voltS'), 'vs'); mk($('voltC'), 'vc');
  }
  function toForm(s) {
    const p = s.protocol, i = s.instrument, g = s.gates;
    P_NUM.forEach(k => $(k).value = p[k]); P_BOOL.forEach(k => $(k).value = String(p[k])); P_STR.forEach(k => $(k).value = p[k]);
    P_CHECK.forEach(k => $(k).checked = !!p[k]);
    $('replicates').value = String(p.replicates);
    $('abHla').value = String(p.abQuality.hla); $('abCd11b').value = String(p.abQuality.cd11b);
    CH.forEach(c => { $('vs' + c).value = i.sampleV[c]; $('vc' + c).value = (i.sameVoltages ? i.sampleV : i.controlV)[c]; });
    $('sameVoltages').checked = i.sameVoltages; $('events').value = String(i.events); $('compensation').value = i.compensation;
    G_NUM.forEach(k => $(k).value = g[k]); $('seed').value = s.seed;
    syncVoltC(); syncDyeLabels();
  }
  const LIMITS = {
    pmaDose: [0, 500, 'PMA, ng/mL'], pmaHours: [0, 96, 'PMA, hours'], restHours: [0, 96, 'Rest, hours'],
    ifnDose: [0, 500, 'IFN-γ, ng/mL'], ifnHours: [0, 96, 'IFN-γ, hours'], seedDensity: [0.1, 2, 'Seeding, M/mL'],
    serum: [0, 20, 'FBS, %'], passage: [1, 60, 'Passage'], delayMin: [0, 360, 'Time to cytometer, min'], washes: [0, 6, 'Washes'],
    fscMin: [0, 262143, 'Cells: FSC-A'], sscMin: [0, 262143, 'Cells: SSC-A'], singLo: [0.2, 1.1, 'Singlet lower bound'],
    singHi: [0.2, 1.2, 'Singlet upper bound'], piCut: [100, 80000, 'Live PI cut-off'], seed: [1, 999999, 'Random seed']
  };
  const HLA_OK = [1, 0.3, 0.008], CD_OK = [1, 0.3, 0.02];
  const near = (v, allowed) => allowed.some(a => Math.abs(v - a) < 1e-6);
  function readBounded(id, min, max, label, errors) {
    const raw = $(id).value;
    if (raw === '' || raw == null) { errors.push(`${label} is empty. The run was not started, and no default was filled in.`); return null; }
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) { errors.push(`${label} is not a number.`); return null; }
    if (v < min || v > max) { errors.push(`${label} must be between ${min} and ${max}.`); return null; }
    return v;
  }
  function fromForm() {
    const errors = [];
    const p = {};
    P_NUM.forEach(k => { const spec = LIMITS[k]; p[k] = readBounded(k, spec[0], spec[1], spec[2], errors); });
    P_BOOL.forEach(k => p[k] = $(k).value === 'true');
    P_STR.forEach(k => p[k] = $(k).value);
    P_CHECK.forEach(k => p[k] = $(k).checked);
    p.replicates = parseInt($('replicates').value, 10);
    if (![1, 2, 3].includes(p.replicates)) errors.push('Replicate tubes must be 1, 2 or 3.');
    const hla = parseFloat($('abHla').value), cd = parseFloat($('abCd11b').value);
    if (!near(hla, HLA_OK)) errors.push('HLA-DR stain must be Working, Weak or Failed.');
    if (!near(cd, CD_OK)) errors.push('CD11b stain must be Working, Weak or Failed.');
    p.abQuality = { hla, cd11b: cd };
    const sampleV = {}, controlV = {};
    CH.forEach(c => {
      sampleV[c] = readBounded('vs' + c, 200, 900, c + ' voltage', errors);
      controlV[c] = readBounded('vc' + c, 200, 900, 'Controls ' + c + ' voltage', errors);
    });
    const same = $('sameVoltages').checked;
    const events = parseInt($('events').value, 10);
    if (![5000, 10000, 20000].includes(events)) errors.push('Events per tube must be 5,000, 10,000 or 20,000.');
    const instrument = { sampleV, controlV: same ? { ...sampleV } : controlV, sameVoltages: same, events, compensation: $('compensation').value, threshold: 5000 };
    if (!['controls', 'none'].includes(instrument.compensation)) errors.push('Compensation must be from single stains or none.');
    if (!['PI', 'DAPI', 'fixable'].includes(p.viability)) errors.push('Viability dye must be PI, DAPI or a fixable near-IR dye.');
    const gates = { ...E.DEFAULT_GATES };
    G_NUM.forEach(k => { const spec = LIMITS[k]; gates[k] = readBounded(k, spec[0], spec[1], spec[2], errors); });
    if (gates.singLo != null && gates.singHi != null && gates.singLo >= gates.singHi) errors.push('Singlet bounds are inverted: the lower H/A bound must be below the upper bound.');
    const seed = readBounded('seed', LIMITS.seed[0], LIMITS.seed[1], LIMITS.seed[2], errors);
    return { errors, settings: errors.length ? null : { protocol: p, instrument, gates, seed: Math.round(seed) } };
  }
  function savedSettingsOk(row) {
    const problems = [];
    const p = row && row.protocol;
    if (!p || typeof p !== 'object') return ['Saved protocol is missing.'];
    Object.entries(LIMITS).forEach(([k, spec]) => {
      if (['fscMin', 'sscMin', 'singLo', 'singHi', 'piCut', 'seed'].includes(k)) return;
      const v = Number(p[k]);
      if (!Number.isFinite(v) || v < spec[0] || v > spec[1]) problems.push(`${spec[2]} in the saved run is ${p[k]}.`);
    });
    const g = row.gates || {};
    ['fscMin', 'sscMin', 'singLo', 'singHi', 'piCut'].forEach(k => {
      const v = Number(g[k]); const spec = LIMITS[k];
      if (!Number.isFinite(v) || v < spec[0] || v > spec[1]) problems.push(`${spec[2]} in the saved run is ${g[k]}.`);
    });
    if (Number(g.singLo) >= Number(g.singHi)) problems.push('Saved singlet bounds are inverted.');
    const aq = p.abQuality || {};
    if (!near(Number(aq.hla), HLA_OK) || !near(Number(aq.cd11b), CD_OK)) problems.push('Saved antibody settings are not Working, Weak or Failed.');
    const inst = row.instrument || {};
    CH.forEach(c => {
      const v = inst.sampleV && Number(inst.sampleV[c]);
      if (!(v >= 200 && v <= 900)) problems.push(`Saved ${c} voltage is ${inst.sampleV && inst.sampleV[c]}.`);
    });
    return problems;
  }
  function dyeLabel(v) { return v === 'DAPI' ? 'DAPI' : v === 'fixable' ? 'Fixable' : 'PI'; }
  function dyeName() { return dyeLabel(R && R.protocol && R.protocol.viability); }
  function syncVoltC() { const same = $('sameVoltages').checked; CH.forEach(c => { const el = $('vc' + c); el.disabled = same; if (same) el.value = $('vs' + c).value; }); }
  function syncDyeLabels() {
    const name = dyeLabel($('viability').value);
    ['vsPI', 'vcPI'].forEach(id => { const lab = document.querySelector(`label[for="${id}"]`); if (lab) lab.firstChild.textContent = (id === 'vcPI' ? 'Controls ' : '') + name + ', V'; });
    const timing = document.querySelector('label[for="piTiming"]'); if (timing) timing.textContent = name + ' added';
  }

  // ---------- run ----------
  let R = null, currentPreset = 'oct12';
  function setRunning(on) { $('runBtn').disabled = on; $('resetBtn').disabled = on; }
  function showStale() {
    document.querySelector('.main').classList.add('stale');
    $('staleNote').hidden = false;
    ['dlCsv', 'dlFcs', 'dlAll'].forEach(id => { if ($(id)) $(id).disabled = true; });
  }
  function clearStale() {
    document.querySelector('.main').classList.remove('stale');
    $('staleNote').hidden = true;
    ['dlCsv', 'dlFcs', 'dlAll'].forEach(id => { if ($(id)) $(id).disabled = false; });
  }
  function runNow() {
    const parsed = fromForm();
    if (parsed.errors.length) {
      showStale();
      $('runStatus').textContent = parsed.errors.join(' ');
      return;
    }
    const s = parsed.settings;
    setRunning(true); $('runStatus').textContent = 'Running the virtual experiment…';
    setTimeout(() => {
      try {
        const t0 = performance.now();
        R = E.run(s.protocol, s.instrument, s.gates, s.seed); R.settings = s;
        clearStale();
        renderAll();
        $('runStatus').textContent = `Done: ${R.tubes.length} tubes, ${R.results.reduce((a, r) => a + r.events, 0).toLocaleString()} events in ${Math.round(performance.now() - t0)} ms.`;
      } catch (err) { $('runStatus').textContent = 'Simulation failed: ' + err.message; console.error(err); }
      setRunning(false);
    }, 30);
  }
  function resetToStart() {
    const key = PRESETS[$('preset').value] ? $('preset').value : 'oct12';
    $('preset').value = key;
    currentPreset = key;
    dirty = false;
    toForm(PRESETS[key]());
    runNow();
  }

  const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '–';
  const f0 = v => Number.isFinite(v) ? Math.round(v).toLocaleString() : '–';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderAll() { renderChecks(); renderTable(); renderWhy(); renderTubeSel(); renderPlots(); renderSpill(); renderDl(); }

  function renderChecks() {
    const lab = { stop: 'Fix first', warn: 'Warning', info: 'Note', ok: 'Ready' };
    $('checks').innerHTML = R.checks.map(c => `<li><span class="lv ${c.lvl}">${lab[c.lvl]}</span><b>${esc(c.title)}</b><p>${esc(c.body)}</p></li>`).join('');
    const n = { stop: 0, warn: 0 }; R.checks.forEach(c => { if (n[c.lvl] !== undefined) n[c.lvl]++; });
    const warns = n.warn ? `${n.warn} warning${n.warn === 1 ? '' : 's'}` : '';
    $('pfSummary').textContent = n.stop ? `${n.stop} to fix${warns ? ', ' + warns : ''}` : warns || 'Ready';
  }

  function renderTable() {
    const cal = currentPreset === 'oct12' && isUnchangedPreset();
    const C = E.CALIBRATION;
    const realOf = (r, k) => { if (!cal) return ''; const m = C[r.tube.arm]; if (!m || m[k] === undefined) return ''; return `<span class="real">(${m[k]})</span>`; };
    const head = `<thead><tr><th>Tube</th><th>Events</th><th>Live %</th><th>PI dim %</th><th>Dead %</th><th>Live cells</th><th>HLA-DR⁺ %</th><th>HLA-DR median</th><th>CD11b⁺ %</th><th>CD11b median</th><th>PI saturated %</th><th>Truly live in "live" gate</th></tr></thead>`;
    const rows = R.results.map(r => {
      const ctl = r.tube.kind === 'control';
      const few = r.tube.kind === 'sample' && r.liveN < 1000;
      return `<tr class="${ctl ? 'ctl' : ''}"><td>${esc(r.tube.label)}</td><td>${f0(r.events)}</td><td>${liveCell(r, realOf(r, 'live'))}</td><td>${f1(r.dimPct)}${realOf(r, 'dim')}</td><td>${f1(r.brightPct)}</td>
        <td class="${few ? 'bad' : ''}">${f0(r.liveN)}</td><td>${ctl ? '–' : f1(r.hlaPos)}${ctl ? '' : realOf(r, 'hla')}</td><td>${ctl ? '–' : f0(r.hlaMed)}</td><td>${ctl ? '–' : f1(r.cd11bPos)}${ctl ? '' : realOf(r, 'cd11b')}</td><td>${ctl ? '–' : f0(r.cd11bMed)}</td>
        <td class="${r.piSatPct > 5 ? 'bad' : ''}">${f1(r.piSatPct)}</td><td class="${r.trueLivePct < 90 ? 'bad' : ''}">${ctl || !Number.isFinite(r.trueLivePct) ? '–' : f1(r.trueLivePct) + '%'}</td></tr>`;
    }).join('');
    $('resTable').innerHTML = head + '<tbody>' + rows + '</tbody>';
    const used = R.cut.fmoCells === 'pma' ? 'PMA-cell FMO' : 'untreated-cell FMO';
    const other = R.cut.fmoCells === 'pma' ? 'untreated-cell FMO' : 'PMA-cell FMO';
    const alt = (n, v) => Number.isFinite(v) ? ` (${other} would set ${n} > ${f0(v)})` : '';
    const hlaGate = R.cut.hlaFromFmo ? `HLA-DR⁺ > ${f0(R.cut.hla)} from the ${used}${alt('HLA-DR⁺', R.cut.hlaAlt)}` : `HLA-DR⁺ > ${f0(R.cut.hla)} is a fallback, not an FMO gate`;
    const cdGate = R.cut.cd11bFromFmo ? `CD11b⁺ > ${f0(R.cut.cd11b)} from the ${used}${alt('CD11b⁺', R.cut.cd11bAlt)}` : `CD11b⁺ > ${f0(R.cut.cd11b)} is a fallback, not an FMO gate`;
    $('cutText').textContent = `${hlaGate} · ${cdGate} · live ${dyeName()} < ${f0(R.gates.piCut)}`;
    const outside = R.extrapolation && R.extrapolation.length;
    $('resTag').hidden = !outside;
    $('resTag').textContent = outside ? 'Untested' : '';
    $('calNote').textContent = cal
      ? 'Numbers in brackets are the real 12 Oct 2026 measurements for the same arm (technical duplicates averaged). Close agreement is what the model was tuned for.'
      : outside
        ? 'Untested. No bench run has used this protocol. The range under Live % is the biological survival if the untested hazard coefficients move. It is not a confidence interval, and the point estimate is a guess.'
        : 'Live % and positives are on single cells. Truly live in the live gate is how many of those events are really live in the simulation.';
  }
  function liveCell(r, realHtml) {
    const point = f1(r.livePct) + realHtml;
    if (!r.band) return point;
    const lo = (100 * r.band.lo).toFixed(0), hi = (100 * r.band.hi).toFixed(0);
    return `${point}<span class="band">${lo}–${hi}</span>`;
  }
  let dirty = false;
  function isUnchangedPreset() { return !dirty; }

  const CAUSE = {
    baseline: ['Handling baseline', '#8A94A6'], pmaCulture: ['PMA in culture', '#F2A541'], harvest: ['Detaching', '#E4572E'], floaters: ['Pooled floaters', '#B0623F'],
    combo: ['IFN-γ on PMA cells', '#C0392B'], ifn: ['IFN-γ alone', '#7B6FD0'], density: ['Seeding density', '#5D9CEC'], serum: ['Low serum', '#5D9CEC'], passage: ['High passage', '#5D9CEC'], myco: ['Mycoplasma risk', '#5D9CEC'], piEarly: ['PI added early', '#9FB0C8']
  };
  function renderWhy() {
    const arms = {}; R.results.filter(r => r.truth && r.tube.kind === 'sample').forEach(r => { if (!arms[r.tube.arm]) arms[r.tube.arm] = r; });
    const names = { untreated: 'Untreated', ifn: 'IFN-γ', pma: 'PMA', combo: 'PMA + IFN-γ' };
    const used = new Set();
    const rows = Object.entries(arms).map(([arm, r]) => {
      const H = r.truth.H, tot = r.truth.total, dead = 100 * (1 - r.truth.live);
      const segs = Object.entries(H).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => { used.add(k); return `<span style="width:${(v / tot) * dead}%;background:${(CAUSE[k] || [k, '#999'])[1]}" title="${(CAUSE[k] || [k])[0]}: ${(100 * v / tot).toFixed(0)}% of the death"></span>`; }).join('');
      return `<div class="whyrow"><span>${names[arm] || arm}</span><div class="whybar" role="img" aria-label="${names[arm]}: ${dead.toFixed(0)}% dead">${segs}</div><span>${dead.toFixed(0)}% dead</span></div>`;
    }).join('');
    const leg = [...used].map(k => `<span><i style="background:${CAUSE[k][1]}"></i>${CAUSE[k][0]}</span>`).join('');
    $('why').innerHTML = rows + `<div class="whyleg">${leg}</div><p class="hint">This split is an assumption, not a finding. Four runs fit the total death in each arm; they cannot separate handling, PMA, detaching, floaters and IFN-γ. Bar length is that fitted total, before gating and before debris is removed, so it will not match PI-dim plus dead in the table. Hover a segment for its assumed share.</p>`;
  }

  function renderTubeSel() {
    const sel = $('tubeSel'), prev = sel.value;
    sel.innerHTML = R.tubes.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    sel.value = R.tubes.some(t => t.id === prev) ? prev : (R.tubes.find(t => t.arm === 'combo') || R.tubes[0]).id;
  }

  // ---------- plots ----------
  const asinh = (x, c = 150) => Math.asinh(x / c);
  const FL_MAX = asinh(262144), FL_MIN = asinh(-600);
  const TRUTH_COL = ['#17A398', '#F2A541', '#E4572E', '#8A94A6', '#7B6FD0', '#CADCFC'];
  const RAMP = ['#1c1cff', '#00b4ff', '#00e28a', '#b4f000', '#ffd400', '#ff7a00', '#ff1a00'];
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function plot(canvas, xs, ys, opt) {
    const W = 480, H = 480, m = { l: 58, r: 10, t: 10, b: 46 };
    canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
    ctx.fillStyle = cssVar('--plot-bg'); ctx.fillRect(0, 0, W, H);
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = v => m.l + (opt.xs(v) - opt.x0) / (opt.x1 - opt.x0) * pw, Y = v => m.t + ph - (opt.ys(v) - opt.y0) / (opt.y1 - opt.y0) * ph;
    // density
    const nb = 128, grid = new Float32Array(nb * nb), bx = new Int16Array(xs.length), by = new Int16Array(xs.length);
    for (let i = 0; i < xs.length; i++) { const a = Math.floor((opt.xs(xs[i]) - opt.x0) / (opt.x1 - opt.x0) * nb), b = Math.floor((opt.ys(ys[i]) - opt.y0) / (opt.y1 - opt.y0) * nb); bx[i] = Math.max(0, Math.min(nb - 1, a)); by[i] = Math.max(0, Math.min(nb - 1, b)); grid[bx[i] * nb + by[i]]++; }
    let gmax = 1; for (const v of grid) if (v > gmax) gmax = v;
    const order = Array.from(xs.keys()).sort((a, b) => grid[bx[a] * nb + by[a]] - grid[bx[b] * nb + by[b]]);
    for (const i of order) {
      let col; if (opt.truth) col = TRUTH_COL[opt.truth[i]] || '#999';
      else { const t = Math.log1p(grid[bx[i] * nb + by[i]]) / Math.log1p(gmax); col = RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))]; }
      ctx.fillStyle = col; ctx.fillRect(X(xs[i]) - 1, Y(ys[i]) - 1, 2, 2);
    }
    // axes
    ctx.strokeStyle = cssVar('--plot-ax'); ctx.fillStyle = cssVar('--muted'); ctx.lineWidth = 1; ctx.font = '13px Calibri, Arial, sans-serif';
    ctx.strokeRect(m.l, m.t, pw, ph);
    const ticks = (isLog, axis) => (isLog ? [[0, '0'], [1000, '10³'], [10000, '10⁴'], [100000, '10⁵']] : [[0, '0'], [50000, '50K'], [100000, '100K'], [150000, '150K'], [200000, '200K'], [250000, '250K']]).forEach(([v, l]) => {
      if (axis === 'x') { const x = X(v); ctx.beginPath(); ctx.moveTo(x, m.t + ph); ctx.lineTo(x, m.t + ph + 5); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText(l, x, m.t + ph + 18); }
      else { const y = Y(v); ctx.beginPath(); ctx.moveTo(m.l - 5, y); ctx.lineTo(m.l, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(l, m.l - 8, y + 4); }
    });
    ticks(opt.xlog, 'x'); ticks(opt.ylog, 'y');
    ctx.textAlign = 'center'; ctx.fillText(opt.xl, m.l + pw / 2, H - 8);
    ctx.save(); ctx.translate(14, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(opt.yl, 0, 0); ctx.restore();
    // gates
    ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 1.5; ctx.fillStyle = cssVar('--text'); ctx.font = '600 13px Calibri, Arial, sans-serif';
    (opt.gates || [])(ctx, X, Y, m, pw, ph);
  }
  const lin = { xs: v => v, x0: 0, x1: 262144, ys: v => v, y0: 0, y1: 262144 };
  const fl = { x0: FL_MIN, x1: FL_MAX };
  function renderPlots() {
    const id = $('tubeSel').value, ev = R.ev[id], comp = R.comp[id], g = R.gateRes[id], G = R.gates, res = R.results.find(r => r.tube.id === id);
    const showTruth = $('truth').checked; $('truthLegend').hidden = !showTruth;
    const box = $('plots'); box.innerHTML = '';
    const idx = (f) => { const a = []; for (let i = 0; i < ev.n; i++) if (f(i)) a.push(i); return a; };
    const all = idx(() => true), cellsI = idx(i => g.cls[i] >= 1), singI = idx(i => g.cls[i] >= 2), liveI = idx(i => g.cls[i] === 2);
    const mk = (title, cap) => { const d = document.createElement('div'); d.className = 'plot'; const c = document.createElement('canvas'); c.setAttribute('role', 'img'); c.setAttribute('aria-label', title); d.appendChild(c); const p = document.createElement('p'); p.className = 'cap'; p.textContent = cap; d.appendChild(p); box.appendChild(d); return c; };
    const pick = (I, a) => I.map(i => a[i]);
    const tr = I => showTruth ? I.map(i => ev.truth[i]) : null;
    const pc = (num, den) => den ? (100 * num / den).toFixed(1) : '–';
    plot(mk('FSC-A vs SSC-A', `Ungated · ${ev.n.toLocaleString()} events · Cells ${pc(g.cells, ev.n)}%`), pick(all, ev['FSC-A']), pick(all, ev['SSC-A']), { ...lin, xl: 'FSC-A', yl: 'SSC-A', truth: tr(all), gates: (c, X, Y) => { c.beginPath(); c.moveTo(X(G.fscMin), Y(262144)); c.lineTo(X(G.fscMin), Y(G.sscMin)); c.lineTo(X(262144), Y(G.sscMin)); c.stroke(); c.textAlign = 'left'; c.fillText('Cells', X(G.fscMin) + 6, Y(240000)); } });
    plot(mk('FSC-A vs FSC-H', `Cells · Single cells ${pc(g.sing, g.cells)}%`), pick(cellsI, ev['FSC-A']), pick(cellsI, ev['FSC-H']), { ...lin, xl: 'FSC-A', yl: 'FSC-H', truth: tr(cellsI), gates: (c, X, Y) => { [G.singLo, G.singHi].forEach(r => { c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(262144), Y(262144 * r)); c.stroke(); }); c.textAlign = 'left'; c.fillText('Single cells', X(8000), Y(235000)); } });
    const dye = dyeName();
    plot(mk(`Comp-${dye}-A vs SSC-A`, `Single cells · Live ${f1(res.livePct)}% · ${dye} dim ${f1(res.dimPct)}% · dead ${f1(res.brightPct)}%`), pick(singI, comp.PI), pick(singI, ev['SSC-A']), { xs: asinh, x0: fl.x0, x1: fl.x1, ys: v => v, y0: 0, y1: 262144, xlog: true, xl: `Comp-${dye}-A`, yl: 'SSC-A', truth: tr(singI), gates: (c, X, Y) => { c.beginPath(); c.moveTo(X(G.piCut), Y(0)); c.lineTo(X(G.piCut), Y(262144)); c.stroke(); c.setLineDash([5, 4]); c.beginPath(); c.moveTo(X(20000), Y(0)); c.lineTo(X(20000), Y(262144)); c.stroke(); c.setLineDash([]); c.textAlign = 'right'; c.fillText('Live', X(G.piCut) - 6, Y(245000)); c.textAlign = 'left'; c.fillText(dye + ' dim', X(G.piCut) + 6, Y(245000)); } });
    plot(mk('Comp-BV786-A (HLA-DR) vs Comp-PE-Cy7-A (CD11b)', `Live · ${g.live.toLocaleString()} cells · HLA-DR⁺ ${f1(res.hlaPos)}% · CD11b⁺ ${f1(res.cd11bPos)}%`), pick(liveI, comp.BV786), pick(liveI, comp['PE-Cy7']), { xs: asinh, x0: fl.x0, x1: fl.x1, ys: asinh, y0: fl.x0, y1: fl.x1, xlog: true, ylog: true, xl: 'Comp-BV786-A :: HLA-DR', yl: 'Comp-PE-Cy7-A :: CD11b', truth: tr(liveI), gates: (c, X, Y, m, pw, ph) => { c.beginPath(); c.moveTo(X(R.cut.hla), m.t); c.lineTo(X(R.cut.hla), m.t + ph); c.moveTo(m.l, Y(R.cut.cd11b)); c.lineTo(m.l + pw, Y(R.cut.cd11b)); c.stroke(); } });
  }

  function renderSpill() {
    const t = (S) => `<table><thead><tr><th>Fluor → detector</th><th>PI-A</th><th>PE-Cy7-A</th><th>BV786-A</th></tr></thead><tbody>${S.map((r, i) => `<tr><td>${E.FLUORS[i]}</td>${r.map((v, j) => `<td>${i === j ? '1' : (v * 100).toFixed(1) + '%'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('spMeas').innerHTML = t(R.spill); $('spTrue').innerHTML = t(R.spillTrue);
  }

  // ---------- downloads ----------
  function renderDl() { $('dlTube').innerHTML = R.tubes.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join(''); }
  function save(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  const fname = (t) => ('Virtual_' + t.label).replace(/[^A-Za-z0-9+_-]+/g, '_');
  function dlFcs(id) { const t = R.tubes.find(x => x.id === id); const ev = R.ev[id]; save(fname(t) + '.fcs', new Blob([E.toFCS(ev, fname(t), ev.V, R.spill)], { type: 'application/octet-stream' })); }
  function dlCsv() {
    const cols = ['label', 'events', 'livePct', 'dimPct', 'brightPct', 'liveN', 'hlaPos', 'hlaMed', 'cd11bPos', 'cd11bMed', 'piSatPct', 'trueLivePct'];
    const lines = [cols.join(',')].concat(R.results.map(r => cols.map(c => c === 'label' ? '"' + r.tube.label + '"' : (Number.isFinite(r[c]) ? r[c].toFixed(2) : '')).join(',')));
    save('virtual_run_results.csv', new Blob([lines.join('\n')], { type: 'text/csv' }));
  }

  // ---------- Supabase lab notebook ----------
  let sb = null, session = null;
  function setNotebook(on) {
    const signed = !!on;
    $('dbState').textContent = !sb ? 'Offline' : signed ? 'Signed in' : 'Sign in required';
    $('authForm').hidden = signed;
    $('signOutBtn').hidden = !signed;
    $('saveForm').hidden = !signed;
    document.getElementById('realCol').hidden = !signed;
    if (!signed) {
      $('savedList').innerHTML = '<option value="">Sign in to read or write the notebook</option>';
      $('cmpTable').innerHTML = '';
    }
  }
  function summary() {
    const arms = {}; R.results.filter(r => r.tube.kind === 'sample' && r.tube.arm !== 'c1r').forEach(r => { (arms[r.tube.arm] = arms[r.tube.arm] || []).push(r); });
    const out = {}; for (const [a, rs] of Object.entries(arms)) { const m = k => rs.reduce((s, r) => s + r[k], 0) / rs.length; out[a] = { live: +m('livePct').toFixed(2), dim: +m('dimPct').toFixed(2), hla: +m('hlaPos').toFixed(2), cd11b: +m('cd11bPos').toFixed(2), liveN: Math.round(m('liveN')) }; }
    return { arms: out, cut: R.cut, checks: R.checks.map(c => ({ lvl: c.lvl, title: c.title })) };
  }
  async function listRuns() {
    const sel = $('savedList');
    if (!sb) { sel.innerHTML = '<option value="">Notebook needs the Netlify site with Supabase configured</option>'; return; }
    if (!session) { setNotebook(false); return; }
    const { data, error } = await sb.from('sim_runs').select('id,created_at,name,author,protocol,instrument,gates,summary').order('created_at', { ascending: false }).limit(50);
    if (error) { sel.innerHTML = `<option value="">${esc(error.message)}</option>`; return; }
    sel._rows = data || [];
    sel.innerHTML = sel._rows.map(r => `<option value="${r.id}">${esc(r.name)}${r.author ? ' · ' + esc(r.author) : ''} · ${new Date(r.created_at).toLocaleDateString()}</option>`).join('') || '<option value="">No saved runs yet</option>';
    renderCompare();
  }
  async function renderCompare() {
    const sel = $('savedList'); const row = (sel._rows || []).find(r => r.id === sel.value);
    if (!sb || !row) { $('cmpTable').innerHTML = ''; return; }
    const { data, error } = await sb.from('sim_real_outcomes').select('*').eq('sim_run_id', row.id).order('created_at', { ascending: true });
    if (error) { $('cmpTable').innerHTML = `<tbody><tr><td>${esc(error.message)}</td></tr></tbody>`; return; }
    if (!data.length) { $('cmpTable').innerHTML = '<tbody><tr><td>No measured results recorded for this run yet.</td></tr></tbody>'; return; }
    const pred = (row.summary && row.summary.arms) || {};
    const names = { untreated: 'Untreated', ifn: 'IFN-γ', pma: 'PMA', combo: 'PMA + IFN-γ' };
    const d = (a, b) => Number.isFinite(a) && Number.isFinite(b) ? (a - b > 0 ? '+' : '') + (a - b).toFixed(1) : '–';
    $('cmpTable').innerHTML = `<thead><tr><th>Arm · bench date</th><th>Live % real</th><th>predicted</th><th>Δ</th><th>HLA-DR⁺ % real</th><th>predicted</th><th>Δ</th><th>CD11b⁺ % real</th><th>predicted</th><th>Δ</th></tr></thead><tbody>` +
      data.map(o => { const p = pred[o.arm] || {}; return `<tr><td>${names[o.arm] || esc(o.arm)} · ${o.run_date || ''}</td><td>${f1(o.live_pct)}</td><td>${f1(p.live)}</td><td>${d(o.live_pct, p.live)}</td><td>${f1(o.hla_pos)}</td><td>${f1(p.hla)}</td><td>${d(o.hla_pos, p.hla)}</td><td>${f1(o.cd11b_pos)}</td><td>${f1(p.cd11b)}</td><td>${d(o.cd11b_pos, p.cd11b)}</td></tr>`; }).join('') + '</tbody>';
  }
  async function saveRun(e) {
    e.preventDefault();
    if (!R || document.querySelector('.main').classList.contains('stale')) { $('saveStatus').textContent = 'Run the virtual experiment again before saving. The table on screen may be from the previous settings.'; return; }
    if (!sb) { $('saveStatus').textContent = 'Saving needs the Netlify site with Supabase configured (config.js).'; return; }
    if (!session) { $('saveStatus').textContent = 'Sign in before saving. Anonymous writes are closed.'; return; }
    const name = $('runName').value.trim(); if (!name) { $('saveStatus').textContent = 'Give the run a name.'; return; }
    const s = R.settings;
    const { error } = await sb.from('sim_runs').insert({ name, author: $('runAuthor').value.trim() || null, notes: $('runNotes').value.trim() || null, protocol: s.protocol, instrument: s.instrument, gates: { ...s.gates, seed: s.seed }, summary: summary(), engine_version: ENGINE_VERSION, user_id: session.user.id });
    $('saveStatus').textContent = error ? error.message : 'Saved to the lab notebook.';
    if (!error) listRuns();
  }
  async function saveReal(e) {
    e.preventDefault();
    const sel = $('savedList'); if (!sb || !session) { $('realStatus').textContent = 'Sign in before recording a measured result.'; return; }
    if (!sel.value) { $('realStatus').textContent = 'Pick a saved run first.'; return; }
    const n = id => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
    const { error } = await sb.from('sim_real_outcomes').insert({ sim_run_id: sel.value, arm: $('realArm').value, run_date: $('realDate').value || null, live_pct: n('realLive'), hla_pos: n('realHla'), cd11b_pos: n('realCd'), live_n: n('realN'), user_id: session.user.id });
    $('realStatus').textContent = error ? error.message : 'Measured result saved.';
    if (!error) renderCompare();
  }
  function loadSaved() {
    const sel = $('savedList'); const row = (sel._rows || []).find(r => r.id === sel.value); if (!row) return;
    const problems = savedSettingsOk(row);
    if (problems.length) { $('saveStatus').textContent = 'This saved run was not loaded. ' + problems.join(' '); return; }
    const s = base();
    const p = row.protocol;
    Object.keys(s.protocol).forEach(k => { if (p[k] !== undefined && k !== 'abQuality') s.protocol[k] = p[k]; });
    s.protocol.abQuality = { hla: Number(p.abQuality.hla), cd11b: Number(p.abQuality.cd11b) };
    if (row.instrument) {
      s.instrument.sameVoltages = !!row.instrument.sameVoltages;
      s.instrument.events = row.instrument.events;
      s.instrument.compensation = row.instrument.compensation;
      s.instrument.sampleV = { ...E.REF_V, ...row.instrument.sampleV };
      s.instrument.controlV = { ...E.REF_V, ...(row.instrument.controlV || row.instrument.sampleV) };
    }
    const { seed, ...g } = row.gates || {};
    Object.keys(g).forEach(k => { if (k in s.gates) s.gates[k] = g[k]; });
    if (Number.isFinite(Number(seed))) s.seed = Number(seed);
    currentPreset = 'custom'; dirty = true; toForm(s); runNow();
  }

  // ---------- boot ----------
  function init() {
    buildVoltageInputs();
    toForm(PRESETS.oct12());
    $('preset').addEventListener('change', () => { currentPreset = $('preset').value; toForm(PRESETS[currentPreset]()); dirty = false; runNow(); });
    const markEdited = (e) => { if (!e.target || e.target.id === 'preset') return; dirty = true; if (R) showStale(); };
    document.querySelector('.side').addEventListener('input', markEdited);
    document.querySelector('.side').addEventListener('change', markEdited);
    $('sameVoltages').addEventListener('change', syncVoltC);
    $('viability').addEventListener('change', syncDyeLabels);
    CH.forEach(c => $('vs' + c).addEventListener('input', syncVoltC));
    $('runBtn').addEventListener('click', runNow);
    $('resetBtn').addEventListener('click', resetToStart);
    $('tubeSel').addEventListener('change', renderPlots); $('truth').addEventListener('change', renderPlots);
    $('dlCsv').addEventListener('click', () => R && dlCsv());
    $('dlFcs').addEventListener('click', () => R && dlFcs($('dlTube').value));
    $('dlAll').addEventListener('click', () => { if (!R) return; R.tubes.forEach((t, k) => setTimeout(() => dlFcs(t.id), k * 350)); $('dlStatus').textContent = `Downloading ${R.tubes.length} FCS files…`; });
    $('saveForm').addEventListener('submit', saveRun); $('realForm').addEventListener('submit', saveReal);
    $('loadBtn').addEventListener('click', loadSaved); $('refreshBtn').addEventListener('click', listRuns); $('savedList').addEventListener('change', renderCompare);
    $('authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!sb) { $('authStatus').textContent = 'Supabase is not configured on this page.'; return; }
      const email = $('authEmail').value.trim(), password = $('authPass').value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      $('authStatus').textContent = error ? error.message : 'Signed in.';
    });
    $('signUpBtn').addEventListener('click', async () => {
      if (!sb) return;
      const email = $('authEmail').value.trim(), password = $('authPass').value;
      const { data, error } = await sb.auth.signUp({ email, password });
      $('authStatus').textContent = error ? error.message : (data.session ? 'Account created and signed in.' : 'Account created. Confirm the email if Supabase asks, then sign in.');
    });
    $('signOutBtn').addEventListener('click', async () => { if (sb) await sb.auth.signOut(); });
    try { const cfg = window.E1_CONFIG || {}; if (window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey) sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); } catch (e) { sb = null; }
    if (sb) {
      sb.auth.onAuthStateChange((_evt, sess) => { session = sess; setNotebook(!!sess); if (sess) listRuns(); });
      sb.auth.getSession().then(({ data }) => { session = data.session; setNotebook(!!session); if (session) listRuns(); });
    } else setNotebook(false);
    runNow();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
