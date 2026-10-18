const E = require('../site/sim/engine.js');
const show = (name, r) => { console.log('\n==', name); r.results.filter(x=>x.tube.kind!=='control').forEach(x=>console.log(x.tube.label.padEnd(26), 'live', x.livePct.toFixed(1).padStart(5), 'dim', x.dimPct.toFixed(1).padStart(5), 'HLA+', x.hlaPos.toFixed(1).padStart(5), 'CD11b+', x.cd11bPos.toFixed(1).padStart(5), 'n', x.liveN)); console.log('cut', Math.round(r.cut.hla), Math.round(r.cut.cd11b)); r.checks.forEach(c=>console.log('  ['+c.lvl+']', c.title)); };
show('as run 12 Oct', E.run({}, {}, {}));
show('gentle', E.run({pmaDose:10, washAfterPMA:true, restHours:24, ifnDose:20, ifnTiming:'after', detach:'edta', poolFloaters:false, delayMin:30, washes:2, fmoCells:'pma'}, {}, {}));
show('29 Sep-like controls at PI 570/SSC 287', E.run({}, {sameVoltages:false, controlV:{PI:570, SSC:287}}, {}));
show('4 Oct-like failed stain', E.run({abQuality:{hla:0.008, cd11b:0.02}}, {}, {}));
show('wide live gate like FlowJo', E.run({}, {}, {piCut:35000}));
