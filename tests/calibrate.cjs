// Run: node tests/calibrate.cjs  — compares the default (12 Oct-like) protocol with the measured 12 Oct values.
const E = require('../site/sim/engine.js');
const t0 = Date.now();
const r = E.run({}, {}, {}, 12);
const pick = (arm) => r.results.filter(x => x.tube.arm === arm);
const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
const C = E.CALIBRATION;
const rows = [['untreated', 'untreated'], ['ifn', 'ifn'], ['pma', 'pma'], ['combo', 'combo']];
console.log('cut', r.cut, 'ms', Date.now() - t0);
console.log('arm        live sim/real   dim sim/real   HLA+ sim/real   CD11b+ sim/real   liveN  HLAmed CD11bmed');
for (const [arm, k] of rows) { const a = pick(arm); console.log(arm.padEnd(10), avg(a,'livePct').toFixed(1).padStart(6), '/', C[k].live, avg(a,'dimPct').toFixed(1).padStart(7), '/', C[k].dim, avg(a,'hlaPos').toFixed(1).padStart(7), '/', C[k].hla, avg(a,'cd11bPos').toFixed(1).padStart(8), '/', C[k].cd11b, String(Math.round(avg(a,'liveN'))).padStart(7), Math.round(avg(a,'hlaMed')), Math.round(avg(a,'cd11bMed'))); }
for (const id of ['fmo_hla','fmo_cd11b','c1r','cc_pi']) { const x = r.results.find(y => y.tube.id === id); console.log(id, x.livePct.toFixed(1), 'HLA+', x.hlaPos.toFixed(1), 'med', Math.round(x.hlaMed), 'CD11b+', x.cd11bPos.toFixed(1), 'piSat', x.piSatPct.toFixed(1)); }
console.log('spill measured', r.spill.map(a=>a.map(v=>v.toFixed(3))));
console.log('checks', r.checks.map(c=>c.lvl+': '+c.title));
