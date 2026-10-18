/*
 * Virtual THP-1 flow experiment — simulation engine.
 *
 * Two linked models:
 *   1. Biology: what PMA / IFN-γ / harvest / staining do to THP-1 cells
 *      (viability split into live, PI-dim and PI-bright; CD11b and HLA-DR expression; size and granularity).
 *   2. Instrument: a 5-detector LSRFortessa-like cytometer
 *      (PMT gain ∝ voltage^7, spillover that scales with the voltage ratio, electronic and photon noise,
 *       18-bit saturation at 262,143, FSC threshold, compensation from single-stain controls).
 *
 * Calibration: with the default ("as run on 12 Oct 2026") protocol and voltages, the simulated tubes reproduce
 * the measured 12 Oct values (see CALIBRATION below and tests/calibrate.mjs).
 * Model coefficients are estimates fitted to four runs from this lab (7 Sep, 29 Sep, 4 Oct and 12 Oct 2026),
 * not published constants. Anything outside that 12 Oct protocol is an extrapolation: see extrapolationReasons().
 *
 * Works in the browser (window.SimEngine) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- reference instrument (12 Oct 2026 settings) ----------
  const REF_V = { FSC: 400, SSC: 250, 'PE-Cy7': 565, BV786: 500, PI: 475 };
  const K_EXP = 7.0;           // PMT gain exponent, measured from the 29 Sep run (SSC 250→287 V gave ×2.65 ⇒ k≈7.07)
  const MAX = 262143;
  const FLUORS = ['PI', 'PE-Cy7', 'BV786'];     // detector order
  // spillover at reference voltages, rows = fluorochrome, cols = detector (from the 12 Oct acquisition matrix)
  const SPILL_REF = [
    [1.0, 0.7937, 0.1782],   // PI
    [0.0048, 1.0, 0.1167],   // PE-Cy7
    [0.0, 0.0058, 1.0]       // BV786
  ];
  const NOISE_E = { PI: 40, 'PE-Cy7': 75, BV786: 90 };   // electronic noise SD, raw units
  const PHOTON_C = 2.0;                                  // photon-counting spread: SD = sqrt(c × signal)

  const DEFAULT_PROTOCOL = {
    seedDensity: 0.5, serum: 10, passage: 15, mycoTested: true,
    pmaDose: 100, pmaHours: 48, washAfterPMA: false, restHours: 0,
    ifnDose: 50, ifnHours: 48, ifnTiming: 'together',
    detach: 'scrape', poolFloaters: true, delayMin: 60, temp: 'ice', piTiming: 'last', washes: 3,
    abQuality: { hla: 1.0, cd11b: 1.0 },  // 1 = titrated antibody working; 0.01 ≈ the 4 Oct failure
    fmoCells: 'untreated',                 // 'untreated' or 'pma'
    replicates: 2, includeC1R: true, includeFMO: true, includeUntreated: true
  };
  const DEFAULT_INSTRUMENT = {
    sampleV: { ...REF_V }, controlV: { ...REF_V }, sameVoltages: true,
    events: 10000, threshold: 5000, compensation: 'controls'   // 'controls' | 'none'
  };
  const DEFAULT_GATES = { fscMin: 8000, sscMin: 15000, singLo: 0.40, singHi: 0.95, piCut: 1000, hlaCut: 'auto', cd11bCut: 'auto' };

  // Values measured on 12 Oct 2026 (uniform gating), used for the calibration check
  const CALIBRATION = {
    untreated: { live: 92.3, dim: 4.0, hla: 3.0, cd11b: 29.9 },
    ifn: { live: 88.5, dim: 4.6, hla: 24.9, cd11b: 64.1 },
    pma: { live: 32.0, dim: 31.6, hla: 23.6, cd11b: 89.6 },
    combo: { live: 3.7, dim: 58.0, hla: 45.5, cd11b: 88.4 },
    fmoHla: { hla: 1.0 }, c1r: { live: 93.4, hla: 100 }
  };

  // ---------- random numbers (seeded, reproducible) ----------
  function rng(seed) {
    let a = seed >>> 0;
    const u = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    let spare = null;
    const n = () => { if (spare !== null) { const s = spare; spare = null; return s; } let x, y, r; do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (!r || r >= 1); const f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f; };
    return { u, n, logn: (med, sd) => med * Math.exp(sd * n()) };
  }

  const gain = (ch, V) => Math.pow(V / REF_V[ch], K_EXP);
  const hill = (x, k) => x <= 0 ? 0 : x / (x + k);

  // ---------- biology ----------
  /** Returns the cause-by-cause death hazards and expression parameters for one condition. */
  function condition(p, arm, scale) {
    const pma = arm.pma, ifn = arm.ifn;
    const H = {};      // hazards (−ln survival), each with a "slow" (culture, apoptosis-like) or "fast" (mechanical) character
    // baseline culture and handling
    H.baseline = 0.035 + Math.max(0, p.washes - 2) * 0.006 + p.delayMin * 0.0008 * (p.temp === 'rt' ? 2.5 : 1);
    if (p.serum < 10) H.serum = 0.02 * (10 - p.serum);
    if (p.passage > 25) H.passage = 0.005 * (p.passage - 25);
    if (!p.mycoTested) H.myco = 0.05;
    if (p.seedDensity > 1) H.density = 0.10 * (p.seedDensity - 1) * (pma ? 2 : 1);
    if (p.seedDensity < 0.2) H.density = 0.10;
    if (p.piTiming === 'early') H.piEarly = 0.03;

    const pmaEff = pma ? hill(p.pmaDose, 5) * Math.min(1, p.pmaHours / 24) : 0;
    const ifnHours = ifn ? p.ifnHours : 0;
    const ifnEff = ifn ? hill(p.ifnDose, 5) * Math.min(1, ifnHours / 48) : 0;

    if (ifn && !pma) H.ifn = 0.045 * hill(p.ifnDose, 20) / hill(50, 20) * Math.min(1.5, ifnHours / 48);
    if (pma) {
      const washF = p.washAfterPMA ? 0.6 : 1;
      H.pmaCulture = 0.55 * Math.pow(Math.max(p.pmaDose, 0) / 100, 0.6) * Math.pow(Math.max(p.pmaHours, 1) / 48, 0.5) * washF;
      H.harvest = { scrape: 0.35, trypsin: 0.25, pipette: 0.25, accutase: 0.08, edta: 0.06, lidocaine: 0.07 }[p.detach] ?? 0.2;
      if (p.poolFloaters) H.floaters = 0.15;
    }
    if (pma && ifn) {
      // synergy: IFN-γ on PMA-activated cells; much smaller after washout + rest
      const timingF = p.ifnTiming === 'together' ? 1 : (p.washAfterPMA ? Math.max(0.12, 1 - 0.8 * Math.min(1, p.restHours / 24)) : 0.6);
      const pmaF = Math.pow(Math.max(p.pmaDose, 0) / 100, 0.7);
      H.combo = 2.75 * (hill(p.ifnDose, 10) / hill(50, 10)) * timingF * pmaF * Math.min(1.5, ifnHours / 48);
    }
    if (scale) for (const k of Object.keys(H)) if (scale[k]) H[k] *= scale[k];
    const slowKeys = ['baseline', 'serum', 'passage', 'myco', 'density', 'ifn', 'pmaCulture', 'combo', 'piEarly'];
    let total = 0, dimW = 0;
    for (const [k, v] of Object.entries(H)) {
      total += v;
      dimW += v * (k === 'combo' || k === 'pmaCulture' ? 0.62 : slowKeys.includes(k) ? 0.5 : 0.3);
    }
    const live = Math.exp(-total);
    const dimShare = total ? dimW / total : 0.5;
    const dead = 1 - live;
    let dim = dead * dimShare, bright = dead - dim;
    if (p.piTiming === 'early') { const m = Math.min(live * 0.02, live); dim += m; }

    // expression (true signal at reference voltage, before autofluorescence)
    const comboH = H.combo || 0;
    const survivorHealth = Math.exp(-0.38 * comboH);
    let cd11bMed = 120 * (1 + 1.1 * ifnEff);
    if (pma) cd11bMed = 120 * (1 + 25 * pmaEff) * survivorHealth;
    let hlaResp = 0.01 + 0.21 * ifnEff;
    if (pma) hlaResp = Math.max(hlaResp, 0.01 + 0.25 * pmaEff);
    if (pma && ifn) hlaResp = Math.min(0.85, 0.01 + 0.25 * pmaEff + 0.21 * ifnEff * (p.ifnTiming === 'together' ? 0.7 : 1.2));
    const hlaBase = 25 * (1 + 1.6 * ifnEff);
    const shrink = Math.exp(-0.6 * comboH);
    return { H, total, live, dim, bright, pmaEff, ifnEff, cd11bMed, hlaResp, hlaBase, shrink, survivorHealth };
  }

  /** Settings that differ from the 12 Oct protocol the viability model was fitted to. */
  function extrapolationReasons(p) {
    const d = DEFAULT_PROTOCOL;
    const r = [];
    const add = (on, text) => { if (on) r.push(text); };
    add(p.pmaDose !== d.pmaDose, `PMA dose ${p.pmaDose} ng/mL (the fitted PMA arms used 100 ng/mL; in this model differentiation is nearly saturated by about 10 ng/mL, so 10 and 100 look alike)`);
    add(p.pmaHours !== d.pmaHours, `PMA time ${p.pmaHours} h (fitted at 48 h, and the PMA effect is fully on by 24 h)`);
    add(!!p.washAfterPMA, 'washing PMA out was not in the fitted runs');
    add(p.restHours > 0, `resting ${p.restHours} h after PMA was not in the fitted runs`);
    add(p.ifnDose !== d.ifnDose, `IFN-γ dose ${p.ifnDose} ng/mL (fitted at 50 ng/mL)`);
    add(p.ifnHours !== d.ifnHours, `IFN-γ time ${p.ifnHours} h (fitted at 48 h)`);
    add(p.ifnTiming !== 'together', 'adding IFN-γ after PMA was not in the fitted runs');
    add(p.detach !== 'scrape', `detaching with ${p.detach} was not in the fitted runs (those used a scraper)`);
    add(!p.poolFloaters, 'leaving floating cells behind was not in the fitted runs');
    add(p.washes !== d.washes, `${p.washes} washes (fitted at 3; fewer washes do not add unbound-antibody background in this model)`);
    add(p.serum !== d.serum, `serum ${p.serum}% (fitted at 10%; serum above 10% has no effect in this model)`);
    add(p.passage !== d.passage, `passage ${p.passage} (fitted near passage 15)`);
    add(p.seedDensity !== d.seedDensity, `seeding ${p.seedDensity} million/mL (fitted at 0.5)`);
    add(!p.mycoTested, '“mycoplasma not tested” is not an unknown here: the model adds an infection penalty');
    add(p.delayMin !== d.delayMin || p.temp !== d.temp, 'the wait before acquisition differs from the fitted run');
    add(p.piTiming !== d.piTiming, 'PI added with the antibodies was not how the fitted runs were stained');
    return r;
  }

  /** Biological live-fraction bounds if the untested hazard coefficients move. Not a confidence interval. */
  function liveBand(p, arm) {
    const mid = condition(p, arm);
    if (!extrapolationReasons(p).length) return { lo: mid.live, hi: mid.live, mid: mid.live };
    const optimistic = condition(p, arm, { pmaCulture: 0.35, harvest: 0.35, combo: 0.25, floaters: 0.35, ifn: 0.5, baseline: 0.7 });
    const pessimistic = condition(p, arm, { pmaCulture: 2.4, harvest: 2.8, combo: 3.2, floaters: 2.2, ifn: 2, baseline: 1.4 });
    const lives = [mid.live, optimistic.live, pessimistic.live].filter(Number.isFinite).sort((a, b) => a - b);
    return { lo: lives[0], hi: lives[lives.length - 1], mid: mid.live };
  }

  // Stable per tube id. The default 14-tube layout keeps the salts used for the 12 Oct calibration,
  // so removing an earlier tube does not reshuffle every later tube's random draws.
  function tubeSalt(id) {
    const order = ['untreated', 'ifn_a', 'ifn_b', 'pma_a', 'pma_b', 'combo_a', 'combo_b', 'fmo_hla', 'fmo_cd11b', 'c1r', 'cc_unstained', 'cc_pi', 'cc_pecy7', 'cc_bv786'];
    const i = order.indexOf(id);
    if (i >= 0) return i * 17;
    let h = 2166136261;
    for (let c = 0; c < String(id).length; c++) h = Math.imul(h ^ String(id).charCodeAt(c), 16777619);
    return (h >>> 0) % 9973;
  }

  // ---------- tubes ----------
  function buildTubes(p) {
    const T = [];
    const arms = [];
    if (p.includeUntreated) arms.push({ key: 'untreated', label: 'Untreated', pma: false, ifn: false, n: 1 });
    arms.push({ key: 'ifn', label: 'IFN-γ', pma: false, ifn: true, n: p.replicates });
    arms.push({ key: 'pma', label: 'PMA', pma: true, ifn: false, n: p.replicates });
    arms.push({ key: 'combo', label: 'PMA + IFN-γ', pma: true, ifn: true, n: p.replicates });
    for (const a of arms) for (let r = 0; r < a.n; r++)
      T.push({ id: a.key + (a.n > 1 ? '_' + 'abc'[r] : ''), arm: a.key, label: a.label + (a.n > 1 ? ' (' + 'abc'[r] + ')' : ''), kind: 'sample', cells: 'THP-1', pma: a.pma, ifn: a.ifn, stain: { pi: true, cd11b: true, hla: true } });
    if (p.includeFMO) {
      const fp = p.fmoCells === 'pma';
      T.push({ id: 'fmo_hla', arm: 'fmo', label: 'HLA-DR FMO' + (fp ? ' (PMA cells)' : ''), kind: 'fmo', cells: 'THP-1', pma: fp, ifn: false, stain: { pi: true, cd11b: true, hla: false } });
      T.push({ id: 'fmo_cd11b', arm: 'fmo', label: 'CD11b FMO' + (fp ? ' (PMA cells)' : ''), kind: 'fmo', cells: 'THP-1', pma: fp, ifn: false, stain: { pi: true, cd11b: false, hla: true } });
    }
    if (p.includeC1R) T.push({ id: 'c1r', arm: 'c1r', label: 'C1R (HLA-DR⁺ control)', kind: 'sample', cells: 'C1R', pma: false, ifn: false, stain: { pi: true, cd11b: true, hla: true } });
    // compensation controls (acquired at control voltages)
    T.push({ id: 'cc_unstained', label: 'Unstained', kind: 'control', cells: 'THP-1', pma: false, ifn: false, stain: { pi: false, cd11b: false, hla: false } });
    T.push({ id: 'cc_pi', label: 'PI single stain', kind: 'control', cells: 'THP-1-heatkilled', pma: false, ifn: false, stain: { pi: true, cd11b: false, hla: false } });
    T.push({ id: 'cc_pecy7', label: 'PE-Cy7 beads', kind: 'control', cells: 'beads', bead: 'PE-Cy7', stain: {} });
    T.push({ id: 'cc_bv786', label: 'BV786 beads', kind: 'control', cells: 'beads', bead: 'BV786', stain: {} });
    return T;
  }

  // ---------- events ----------
  function simulateTube(tube, p, inst, seed) {
    const R = rng(seed);
    const V = tube.kind === 'control' && !inst.sameVoltages ? inst.controlV : inst.sampleV;
    const g = {}; for (const ch of Object.keys(REF_V)) g[ch] = gain(ch, V[ch]);
    const N = inst.events;
    const out = { 'FSC-A': new Float32Array(N), 'FSC-H': new Float32Array(N), 'SSC-A': new Float32Array(N), 'PI-A': new Float32Array(N), 'PE-Cy7-A': new Float32Array(N), 'BV786-A': new Float32Array(N), Time: new Float32Array(N), truth: new Uint8Array(N) };
    // truth: 0 live, 1 dim, 2 bright, 3 debris, 4 doublet, 5 bead
    let c = null, mix;
    if (tube.cells === 'beads') mix = { bead: 1 };
    else {
      if (tube.cells === 'C1R') c = { live: 0.934, dim: 0.024, bright: 0.042 };
      else if (tube.cells === 'THP-1-heatkilled') c = { live: 0.55, dim: 0.06, bright: 0.39 };
      else c = condition(p, tube);
      const deadFrac = c.dim + c.bright;
      const debris = 0.02 + 0.10 * deadFrac + (tube.pma && p.poolFloaters ? 0.04 : 0);
      const doublet = 0.012;
      const cellF = 1 - debris - doublet;
      mix = { live: c.live * cellF, dim: c.dim * cellF, bright: c.bright * cellF, debris, doublet };
    }
    const cum = []; let acc = 0; for (const [k, v] of Object.entries(mix)) { acc += v; cum.push([acc, k]); }
    const cond = tube.cells === 'THP-1' ? condition(p, tube) : null;
    const isPMA = !!tube.pma;
    const AF = tube.cells === 'C1R' ? { PI: 90, 'PE-Cy7': 20, BV786: 60 } : isPMA ? { PI: 400, 'PE-Cy7': 330, BV786: 130 } : { PI: 100, 'PE-Cy7': 40, BV786: 98 };
    let i = 0, guard = 0, t = 0;
    const rate = 300 + R.u() * 200;
    while (i < N && guard < N * 20) {
      guard++;
      const x = R.u(); let cls = cum[cum.length - 1][1]; for (const [cv, k] of cum) if (x <= cv) { cls = k; break; }
      let fsc, ssc, ratio = 0.68 + 0.035 * R.n();
      const tr = { PI: 0, 'PE-Cy7': 0, BV786: 0 };  // true fluorochrome signal at reference voltage
      const ns = { PI: 0, 'PE-Cy7': 0, BV786: 0 };  // extra autofluorescence / non-specific signal
      let truth = 0;
      if (cls === 'bead') {
        truth = 5; fsc = R.logn(16300, 0.06); ssc = R.logn(23000, 0.12); ratio = 0.95 + 0.02 * R.n();
        if (R.u() < 0.5) { if (tube.bead === 'PE-Cy7') tr['PE-Cy7'] = R.logn(34600, 0.15); else tr.BV786 = R.logn(35300, 0.12); }
      } else if (cls === 'debris') {
        truth = 3; fsc = R.logn(4500, 0.55); ssc = R.logn(6000, 0.8); ratio = 0.85 + 0.06 * R.n();
        if (tube.stain.pi && R.u() < 0.4) tr.PI = R.logn(8000, 1.2);
      } else {
        // cell
        const base = tube.cells === 'C1R' ? { f: 56000, s: 35000, sf: 0.18, ss: 0.18 } : isPMA ? { f: 58000, s: 90000, sf: 0.33, ss: 0.38 } : { f: 62000, s: 49000, sf: 0.22, ss: 0.24 };
        fsc = R.logn(base.f, base.sf); ssc = R.logn(base.s, base.ss);
        if (cond && cls === 'live') fsc *= cond.shrink;
        if (cls === 'dim') { truth = 1; fsc *= 0.55; ssc *= isPMA ? 1.05 : 1.1; }
        if (cls === 'bright') { truth = 2; fsc *= 0.42; ssc *= isPMA ? 1.25 : 1.35; ratio += 0.08; }
        if (cls === 'doublet') { truth = 4; fsc *= 1.9; ssc *= 1.7; ratio = 0.42 + 0.04 * R.n(); }
        // PI
        if (tube.stain.pi) {
          if (cls === 'dim') tr.PI = R.logn(3500, 0.85);
          else if (cls === 'bright') tr.PI = R.logn(90000, 0.6);
        }
        if (cls === 'dim') { ns.BV786 = R.logn(650, 0.6); ns['PE-Cy7'] = R.logn(300, 0.8); }
        if (cls === 'bright') { ns.BV786 = R.logn(400, 1.0); ns['PE-Cy7'] = R.logn(500, 1.0); }
        // antibodies
        const qH = p.abQuality.hla, qC = p.abQuality.cd11b;
        if (tube.stain.hla) {
          if (tube.cells === 'C1R') tr.BV786 = R.logn(70500, 0.35) * qH;
          else if (cond) {
            const resp = R.u() < cond.hlaResp;
            tr.BV786 = (resp ? R.logn(480, 0.45) : R.logn(cond.hlaBase, 0.6)) * qH;
            if (cls !== 'live') tr.BV786 *= 0.6;
          }
        }
        if (tube.stain.cd11b) {
          if (tube.cells === 'C1R') tr['PE-Cy7'] = R.logn(15, 0.8) * qC;
          else if (cond) tr['PE-Cy7'] = (isPMA && R.u() < 0.09 ? R.logn(120, 0.85) : R.logn(cond.cd11bMed, isPMA ? 1.0 : 0.85)) * qC * (cls === 'live' ? 1 : 0.6);
        }
      }
      // detectors
      const det = {};
      FLUORS.forEach((d, j) => {
        let s = (AF[d] + ns[d]) * (truth === 5 ? 0.05 : 1) * (truth === 3 ? 0.3 : 1);
        FLUORS.forEach((f, k) => { s += tr[f] * SPILL_REF[k][j]; });
        s *= g[d];
        s += Math.sqrt(PHOTON_C * Math.max(s, 0)) * R.n() + NOISE_E[d] * R.n();
        det[d] = Math.min(MAX, s);
      });
      const fA = Math.min(MAX, fsc * g.FSC), sA = Math.min(MAX, ssc * g.SSC);
      if (fA < inst.threshold) continue;   // FSC threshold: event not recorded
      out['FSC-A'][i] = fA; out['FSC-H'][i] = Math.min(MAX, fA * Math.max(0.2, ratio)); out['SSC-A'][i] = sA;
      out['PI-A'][i] = det.PI; out['PE-Cy7-A'][i] = det['PE-Cy7']; out['BV786-A'][i] = det.BV786;
      t += -Math.log(1 - R.u()) / rate; out.Time[i] = t / 0.01; out.truth[i] = truth;
      i++;
    }
    out.n = i; out.V = V; out.cond = cond;
    return out;
  }

  // ---------- compensation ----------
  function invert3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g2, h, k] = m[2];
    const A = e * k - f * h, B = -(d * k - f * g2), C = d * h - e * g2;
    const det = a * A + b * B + c * C;
    return [[A / det, -(b * k - c * h) / det, (b * f - c * e) / det], [B / det, (a * k - c * g2) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g2) / det, (a * e - b * d) / det]];
  }
  const median = (arr) => { const s = Float64Array.from(arr).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
  const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); if (!s.length) return NaN; const i = Math.min(s.length - 1, Math.max(0, Math.round(q / 100 * (s.length - 1)))); return s[i]; };

  /** Spillover matrix measured from the simulated single-stain controls (like FlowJo/DIVA). */
  function measureSpill(tubes) {
    const S = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const notes = [];
    const rowFrom = (ev, primary, posSel, negSel) => {
      const idx = FLUORS.indexOf(primary); const P = [], Nn = [];
      for (let i = 0; i < ev.n; i++) { if (posSel(ev, i)) P.push(i); else if (negSel(ev, i)) Nn.push(i); }
      if (P.length < 20 || Nn.length < 20) return null;
      const med = (ix, d) => median(ix.map(i => ev[d + '-A'][i]));
      const pp = med(P, primary), nn = med(Nn, primary);
      return FLUORS.map(d => (med(P, d) - med(Nn, d)) / (pp - nn));
    };
    const beadGate = (ev, i) => ev['FSC-H'][i] / ev['FSC-A'][i] > 0.85 && ev.truth[i] === 5;
    const pe = tubes.cc_pecy7, bv = tubes.cc_bv786, pi = tubes.cc_pi;
    if (pe) { const r = rowFrom(pe, 'PE-Cy7', (e, i) => beadGate(e, i) && e['PE-Cy7-A'][i] > 8000, (e, i) => beadGate(e, i) && e['PE-Cy7-A'][i] < 3000); if (r) S[1] = r; }
    if (bv) { const r = rowFrom(bv, 'BV786', (e, i) => beadGate(e, i) && e['BV786-A'][i] > 8000, (e, i) => beadGate(e, i) && e['BV786-A'][i] < 3000); if (r) S[2] = r; }
    if (pi) {
      let sat = 0; for (let i = 0; i < pi.n; i++) if (pi['PI-A'][i] >= MAX) sat++;
      const satPct = 100 * sat / pi.n;
      const r = rowFrom(pi, 'PI', (e, i) => e['PI-A'][i] > 15000 && e['PI-A'][i] < MAX && e['PE-Cy7-A'][i] < MAX && e['BV786-A'][i] < MAX, (e, i) => e['PI-A'][i] < 1500 && e.truth[i] === 0);
      if (r) S[0] = r; else notes.push('PI control: too few unsaturated PI⁺ cells to measure its spillover.');
      if (satPct > 5) notes.push(`PI control: ${satPct.toFixed(0)}% of events saturate the PI detector.`);
    }
    S.forEach((row, k) => { row[k] = 1; });
    return { S, notes };
  }

  function compensate(ev, S) {
    const inv = invert3(S);
    const n = ev.n, P = ev['PI-A'], C = ev['PE-Cy7-A'], B = ev['BV786-A'];
    const o = { PI: new Float32Array(n), 'PE-Cy7': new Float32Array(n), BV786: new Float32Array(n) };
    for (let i = 0; i < n; i++) {
      const r = [P[i], C[i], B[i]];
      for (let j = 0; j < 3; j++) o[FLUORS[j]][i] = r[0] * inv[0][j] + r[1] * inv[1][j] + r[2] * inv[2][j];
    }
    return o;
  }

  // ---------- gating ----------
  function gate(ev, comp, G) {
    const n = ev.n; const cls = new Uint8Array(n); // 0 out,1 cells,2 singlet-live,3 dim,4 bright
    let cells = 0, sing = 0, live = 0, dim = 0, bright = 0, sat = 0, sscSat = 0;
    for (let i = 0; i < n; i++) {
      if (ev['PI-A'][i] >= MAX) sat++;
      if (ev['SSC-A'][i] >= MAX) sscSat++;
      if (ev['FSC-A'][i] < G.fscMin || ev['SSC-A'][i] < G.sscMin) continue;
      cells++;
      const r = ev['FSC-H'][i] / ev['FSC-A'][i];
      if (r < G.singLo || r > G.singHi) { cls[i] = 1; continue; }
      sing++;
      const pi = comp.PI[i];
      if (pi < G.piCut) { live++; cls[i] = 2; } else if (pi < 20000) { dim++; cls[i] = 3; } else { bright++; cls[i] = 4; }
    }
    return { cls, n, cells, sing, live, dim, bright, piSatPct: 100 * sat / n, sscSatPct: 100 * sscSat / n };
  }

  function stats(ev, comp, g, cut) {
    const L = []; for (let i = 0; i < g.n; i++) if (g.cls[i] === 2) L.push(i);
    const hla = L.map(i => comp.BV786[i]), cd = L.map(i => comp['PE-Cy7'][i]);
    const pos = (a, c) => a.length ? 100 * a.filter(v => v > c).length / a.length : NaN;
    const truthLive = (() => { let a = 0, b = 0; for (let i = 0; i < g.n; i++) { if (g.cls[i] === 2) { b++; if (ev.truth[i] === 0) a++; } } return b ? 100 * a / b : NaN; })();
    return {
      events: g.n, cellsPct: 100 * g.cells / g.n, singPct: g.cells ? 100 * g.sing / g.cells : NaN,
      livePct: g.sing ? 100 * g.live / g.sing : NaN, dimPct: g.sing ? 100 * g.dim / g.sing : NaN, brightPct: g.sing ? 100 * g.bright / g.sing : NaN,
      liveN: g.live, hlaMed: median(hla), hlaPos: pos(hla, cut.hla), cd11bMed: median(cd), cd11bPos: pos(cd, cut.cd11b),
      piSatPct: g.piSatPct, sscSatPct: g.sscSatPct, trueLivePct: truthLive
    };
  }

  // ---------- whole experiment ----------
  function run(protocolIn, instrumentIn, gatesIn, seed = 12) {
    const p = { ...DEFAULT_PROTOCOL, ...protocolIn, abQuality: { ...DEFAULT_PROTOCOL.abQuality, ...(protocolIn && protocolIn.abQuality) } };
    if (!Number.isFinite(p.abQuality.hla) || !Number.isFinite(p.abQuality.cd11b)) throw new Error('Antibody quality must be a finite number.');
    const inst = { ...DEFAULT_INSTRUMENT, ...instrumentIn };
    inst.sampleV = { ...REF_V, ...(instrumentIn && instrumentIn.sampleV) };
    inst.controlV = inst.sameVoltages ? { ...inst.sampleV } : { ...REF_V, ...(instrumentIn && instrumentIn.controlV) };
    const G = { ...DEFAULT_GATES, ...gatesIn };
    const tubes = buildTubes(p);
    const ev = {};
    tubes.forEach((t) => { ev[t.id] = simulateTube(t, p, inst, seed * 1000 + tubeSalt(t.id) + 1); });
    const { S, notes } = measureSpill(ev);
    const Sused = inst.compensation === 'none' ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : S;
    const comp = {}; const gates = {};
    tubes.forEach(t => { comp[t.id] = compensate(ev[t.id], Sused); gates[t.id] = gate(ev[t.id], comp[t.id], G); });
    // positive cut-offs from FMOs: 99th percentile of strictly live (PI < 1,000) FMO cells, unless set by hand
    const auto = (fmoId, ch, fallback) => {
      if (!ev[fmoId]) return fallback;
      const v = []; const g = gates[fmoId]; for (let i = 0; i < g.n; i++) if (g.cls[i] >= 2 && comp[fmoId].PI[i] < Math.min(G.piCut, 1000)) v.push(comp[fmoId][ch][i]);
      return v.length > 50 ? pct(v, 99) : fallback;
    };
    const hlaAuto = G.hlaCut === 'auto' ? auto('fmo_hla', 'BV786', 325) : Number(G.hlaCut);
    const cdAuto = G.cd11bCut === 'auto' ? auto('fmo_cd11b', 'PE-Cy7', 161) : Number(G.cd11bCut);
    const cut = {
      hla: hlaAuto,
      cd11b: cdAuto,
      hlaFromFmo: !!(p.includeFMO && ev.fmo_hla),
      cd11bFromFmo: !!(p.includeFMO && ev.fmo_cd11b)
    };
    const outside = extrapolationReasons(p);
    const results = tubes.map(t => ({ tube: t, ...stats(ev[t.id], comp[t.id], gates[t.id], cut), truth: t.cells === 'THP-1' && t.kind !== 'control' ? condition(p, t) : null, band: t.cells === 'THP-1' && t.kind !== 'control' && outside.length ? liveBand(p, t) : null }));
    const checks = preflight(p, inst, G, results, notes, cut, outside);
    return { protocol: p, instrument: inst, gates: G, tubes, ev, comp, gateRes: gates, spill: S, spillTrue: trueSpill(inst.sampleV), cut, results, checks, extrapolation: outside };
  }

  function trueSpill(V) {
    const g = FLUORS.map(d => gain(d, V[d]));
    return SPILL_REF.map((row, i) => row.map((s, j) => s * g[j] / g[i]));
  }

  // ---------- pre-flight checks ----------
  function preflight(p, inst, G, results, notes, cut, outside) {
    const C = []; const add = (lvl, title, body) => C.push({ lvl, title, body });
    const diffV = Object.keys(REF_V).filter(ch => Math.round(inst.sampleV[ch]) !== Math.round(inst.controlV[ch]));
    if (diffV.length) add('stop', 'Controls run at different voltages', `${diffV.join(', ')} differ between controls and samples. Spillover measured on the controls will not match the samples, and control-based cut-offs move. Re-run the controls at the sample voltages.`);
    Object.keys(inst.sampleV).forEach(ch => { const v = inst.sampleV[ch]; if (!(v >= 200 && v <= 900)) add('stop', `${ch} voltage is outside 200–900 V`, `Voltage ${v} is not a usable PMT setting. Gain at 0 V is not a real acquisition.`); });
    notes.forEach(n => add('warn', 'Compensation control', n));
    if (inst.compensation === 'none') add('stop', 'No compensation applied', 'PI spills about 79% into PE-Cy7. Without compensation the FMO gates move as well, so HLA-DR⁺ can fall toward 0% rather than rise. Neither the CD11b⁺ nor the HLA-DR⁺ percentage is interpretable.');
    if (outside && outside.length) add('warn', 'Outside the calibrated range', `These settings were not in the 7 Sep, 29 Sep, 4 Oct or 12 Oct runs: ${outside.join('; ')}. The live % range in the table is what happens if those untested hazard coefficients move. It is not a confidence interval. Do not treat the point estimate as a result.`);
    const by = id => results.find(r => r.tube.id === id);
    const pmaT = results.filter(r => r.tube.pma && r.tube.kind === 'sample');
    const maxPiSat = Math.max(...results.map(r => r.piSatPct));
    if (maxPiSat > 5) add('warn', 'PI detector saturating', `Up to ${maxPiSat.toFixed(0)}% of events sit at 262,143 in PI-A. Saturated events cannot be compensated. Lower the PI voltage by 30–60 V.`);
    const maxSsc = Math.max(...results.map(r => r.sscSatPct));
    if (maxSsc > 2) add('warn', 'SSC saturating', `Up to ${maxSsc.toFixed(0)}% of events are at the SSC ceiling (granular PMA or dead cells). Lower SSC voltage.`);
    if (p.includeFMO && p.fmoCells === 'untreated' && pmaT.length) add('warn', 'FMOs made from undifferentiated cells', 'PMA cells are more autofluorescent; the HLA-DR gate from an untreated FMO can overcall HLA-DR⁺ in PMA tubes. Add PMA-cell FMOs.');
    if (p.includeFMO && p.fmoCells === 'pma') add('info', 'One HLA-DR gate for every arm', 'The gate is set from PMA-cell FMOs and then applied to untreated and IFN-γ cells as well.');
    if (!p.includeFMO) add('stop', 'No FMO controls', 'Without FMOs there is no defensible HLA-DR⁺ or CD11b⁺ gate. Any cut-off shown is a fallback number, not a gate from this experiment.');
    if (!p.includeC1R) add('stop', 'No HLA-DR⁺ positive control', 'Without C1R (or another class II-high line) a failed HLA-DR stain looks like biology: every arm can read about 1% HLA-DR⁺ and nothing on the page proves the antibody worked.');
    add('info', 'No CD11b⁺ cell line', 'This panel has no CD11b positive-control cells. A weak CD11b stain can only be seen as a smaller positive percentage, which looks like a real result.');
    if (!p.includeUntreated) add('stop', 'No untreated control', 'Every treatment needs the untreated baseline beside it.');
    if (p.replicates >= 2) add('info', 'Duplicates are sampling noise', 'The replicate tubes are two random draws from the same model. They are not biological replicates, so a tiny gap between them is not evidence the result is stable.');
    else add('info', 'Single tubes', 'One tube cannot show whether a difference is bigger than sampling noise, and these duplicates would only show sampling noise anyway.');
    if (G.singLo >= G.singHi) add('stop', 'Singlet bounds are inverted', `H/A from ${G.singLo} to ${G.singHi} is an empty gate. Swap the bounds. Acquiring more events will not help.`);
    if (G.fscMin > 200000 || G.sscMin > 240000) add('stop', 'Cell gate is off the scale', 'Almost no events can fall inside this FSC/SSC gate. Lower the gate. Acquiring more events will not help.');
    if (p.pmaDose < 0) add('stop', 'PMA dose is negative', 'A negative dose is not a culture condition. It was being treated as 0.');
    if (p.seedDensity <= 0) add('stop', 'Seeding density is zero', 'A flask at 0 cells/mL cannot yield a full tube of events.');
    if (p.ifnDose > 500) add('stop', 'IFN-γ dose is above 500 ng/mL', 'Higher doses sit on the flat top of the model curve, so 1 mg/mL looks like a modest dose. That is not a prediction.');
    if (G.piCut > 2000) add('stop', 'Live gate includes PI-dim cells', `PI cut-off ${G.piCut}. Dying, PI-dim cells read as HLA-DR⁺ without antibody (83% in the 12 Oct FMO). Keep the live gate below about 1,000.`);
    results.filter(r => r.tube.kind === 'sample' && Number.isFinite(r.trueLivePct) && r.trueLivePct < 80).forEach(r => add('stop', `${r.tube.label}: live gate is not live cells`, `Only ${r.trueLivePct.toFixed(0)}% of events inside the live gate are truly live in the simulation. Percentages on that gate describe the wrong cells. Tighten the PI cut or change the protocol.`));
    const gateBroken = G.singLo >= G.singHi || G.fscMin > 200000 || G.sscMin > 240000;
    if (!gateBroken) results.filter(r => r.tube.kind === 'sample' && r.liveN < 1000).forEach(r => add('warn', `${r.tube.label}: only ${r.liveN.toLocaleString()} live cells`, 'Percentages on so few cells are fragile. Acquire more events or improve viability.'));
    const c1r = by('c1r'); if (c1r && c1r.hlaMed < 10000) add('stop', 'C1R is dim', `C1R HLA-DR median ${Math.round(c1r.hlaMed).toLocaleString()} (expected ≈70,000). The HLA-DR stain is failing, as on 4 Oct.`);
    if (!Number.isFinite(p.abQuality.hla) || p.abQuality.hla <= 0.3) add('stop', 'HLA-DR stain is not working', 'The HLA-DR antibody is set to weak or failed. Positives near 1% are the stain, not the cells. This is flagged even when the C1R tube is absent.');
    if (!Number.isFinite(p.abQuality.cd11b) || p.abQuality.cd11b < 0.1) add('stop', 'CD11b stain failed', 'CD11b antibody signal is at the failed-stain setting. PMA cells will not show their CD11b rise, and there is no CD11b⁺ control cell to catch it.');
    else if (p.abQuality.cd11b <= 0.3) add('warn', 'CD11b stain weak', 'CD11b antibody signal is below the working titration. PMA CD11b⁺ drops even though the biology is unchanged, and this panel has no CD11b⁺ control cell.');
    if (p.ifnTiming === 'together' && p.pmaDose > 0) add('warn', 'IFN-γ added with PMA', 'The model predicts heavy death in the PMA + IFN-γ arm. Wash out PMA and rest 24 h first.');
    if (p.detach === 'scrape' || p.detach === 'trypsin') add('warn', `Detaching with ${p.detach === 'scrape' ? 'a scraper' : 'trypsin'}`, 'Expect extra PI⁺ PMA cells after harvest. Cold PBS-EDTA or Accutase is gentler.');
    if (p.piTiming === 'early') add('info', 'PI added early', 'PI-dim counts rise with incubation time; add PI just before acquisition.');
    if (p.delayMin > 60) add('info', 'Long delay to acquisition', 'Run PMA tubes first and within an hour of harvest.');
    if (!C.some(c => c.lvl !== 'info')) add('ok', 'Ready for the bench', 'No blocking problems found in this design.');
    return C;
  }

  // ---------- FCS 3.1 writer (float32, big-endian) ----------
  function toFCS(ev, tubeLabel, V, spill) {
    const pars = ['FSC-A', 'FSC-H', 'SSC-A', 'PI-A', 'PE-Cy7-A', 'BV786-A', 'Time'];
    const n = ev.n, P = pars.length;
    const vMap = { 'FSC-A': V.FSC, 'FSC-H': V.FSC, 'SSC-A': V.SSC, 'PI-A': V.PI, 'PE-Cy7-A': V['PE-Cy7'], 'BV786-A': V.BV786 };
    const kw = { '$BEGINANALYSIS': '0', '$ENDANALYSIS': '0', '$BEGINSTEXT': '0', '$ENDSTEXT': '0', '$BYTEORD': '4,3,2,1', '$DATATYPE': 'F', '$MODE': 'L', '$NEXTDATA': '0', '$PAR': String(P), '$TOT': String(n), '$CYT': 'Virtual LSRFortessa', '$FIL': tubeLabel + '.fcs', 'TUBE NAME': tubeLabel, '$SRC': 'THP-1 virtual experiment', '$TIMESTEP': '0.01',
      '$SPILLOVER': '3,PI-A,PE-Cy7-A,BV786-A,' + spill.flat().map(x => x.toFixed(5)).join(',') };
    pars.forEach((p, i) => { const k = i + 1; kw[`$P${k}N`] = p; kw[`$P${k}B`] = '32'; kw[`$P${k}E`] = '0,0'; kw[`$P${k}R`] = '262144'; if (vMap[p]) kw[`$P${k}V`] = String(Math.round(vMap[p])); if (p === 'Time') kw[`$P${k}G`] = '0.01'; });
    const dataLen = n * P * 4;
    const mk = (b, e) => { const t = { ...kw, '$BEGINDATA': String(b), '$ENDDATA': String(e) }; return '/' + Object.entries(t).map(([k, v]) => k + '/' + String(v).replace(/\//g, '//')).join('/') + '/'; };
    let text = mk(0, 0), begin = 0;
    for (let it = 0; it < 4; it++) { begin = 58 + text.length; text = mk(begin, begin + dataLen - 1); }
    const header = 'FCS3.1    ' + [58, 58 + text.length - 1, begin > 99999999 ? 0 : begin, begin + dataLen - 1 > 99999999 ? 0 : begin + dataLen - 1, 0, 0].map(x => String(x).padStart(8, ' ')).join('');
    const enc = new TextEncoder(); const h = enc.encode(header), tx = enc.encode(text);
    const buf = new ArrayBuffer(h.length + tx.length + dataLen); const u8 = new Uint8Array(buf); u8.set(h, 0); u8.set(tx, h.length);
    const dv = new DataView(buf, h.length + tx.length);
    for (let i = 0; i < n; i++) pars.forEach((p, j) => dv.setFloat32((i * P + j) * 4, ev[p][i], false));
    return buf;
  }

  const api = { REF_V, K_EXP, MAX, FLUORS, SPILL_REF, DEFAULT_PROTOCOL, DEFAULT_INSTRUMENT, DEFAULT_GATES, CALIBRATION, condition, extrapolationReasons, liveBand, tubeSalt, buildTubes, simulateTube, run, compensate, toFCS, median, pct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SimEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
