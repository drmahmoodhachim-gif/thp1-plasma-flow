const E = require('../site/sim/engine.js');
const assert = (cond, msg) => { if (!cond) { console.error('FAIL', msg); process.exitCode = 1; } else console.log('ok', msg); };

const full = E.run({}, {}, {}, 12);
const dropped = E.run({ includeUntreated: false }, {}, {}, 12);
const live = (r, id) => r.results.find(x => x.tube.id === id).livePct;
assert(Math.abs(live(full, 'ifn_a') - live(dropped, 'ifn_a')) < 0.05, 'removing untreated does not change IFN-γ (a)');
assert(full.extrapolation.length === 0, '12 Oct protocol is inside the calibrated set');
assert(!full.checks.some(c => c.title === 'Ready for the bench'), '12 Oct does not claim Ready');

const gentle = E.run({ pmaDose: 10, washAfterPMA: true, restHours: 24, ifnDose: 20, ifnTiming: 'after', detach: 'edta', poolFloaters: false, delayMin: 30, washes: 2, fmoCells: 'pma' }, {}, {}, 12);
assert(gentle.extrapolation.length > 0, 'gentle protocol is outside the calibrated set');
assert(gentle.checks.some(c => c.lvl === 'warn' && c.title === 'Outside the calibrated range'), 'gentle protocol is not unmarked');
assert(!gentle.checks.some(c => c.lvl === 'ok'), 'gentle protocol does not say Ready');
const combo = gentle.results.find(x => x.tube.id === 'combo_a');
assert(combo.band && combo.band.hi - combo.band.lo > 0.2, 'gentle combo live % has a wide model range');

const noC1r = E.run({ includeC1R: false, abQuality: { hla: 0.008, cd11b: 1 } }, {}, {}, 12);
assert(noC1r.checks.some(c => c.lvl === 'stop' && /positive control/.test(c.title)), 'missing C1R is fix-first');
assert(noC1r.checks.some(c => c.lvl === 'stop' && /HLA-DR stain/.test(c.title)), 'failed HLA-DR is fix-first without C1R');
assert(!noC1r.checks.some(c => c.lvl === 'ok'), 'failed stain does not say Ready');

const weakCd = E.run({ abQuality: { hla: 1, cd11b: 0.3 } }, {}, {}, 12);
assert(weakCd.checks.some(c => c.lvl === 'warn' && /CD11b stain weak/.test(c.title)), 'weak CD11b is a warning');
assert(!weakCd.checks.some(c => c.lvl === 'ok'), 'weak CD11b does not say Ready');

let threw = false;
try { E.run({ abQuality: { hla: NaN, cd11b: 1 } }, {}, {}, 12); } catch (e) { threw = true; }
assert(threw, 'NaN antibody quality throws instead of killing every cell');

const none = E.run({}, { compensation: 'none' }, {}, 12);
const msg = none.checks.find(c => c.title === 'No compensation applied');
assert(msg && /fall toward 0%/.test(msg.body), 'no-compensation text matches gates that can hide positives');
assert(none.cut.hlaFromFmo === true, 'FMO cut source is recorded when FMO tubes are on');
const noFmo = E.run({ includeFMO: false }, {}, {}, 12);
assert(noFmo.cut.hlaFromFmo === false, 'without FMO tubes the cut is marked as a fallback');
