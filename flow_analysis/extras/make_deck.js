// Build the E1 deck. Run from a folder containing fig1..fig9 PNGs:
//   npm install pptxgenjs && node make_deck.js
const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.title = 'E1: Does mouse plasma affect THP-1 viability?';

const NAVY = '1B2A41', TEAL = '17A398', CORAL = 'E4572E', PURPLE = '7B6FD0';
const INK = '1F2933', MUTED = '5B6573', TINT = 'EEF2F6', WHITE = 'FFFFFF', TEALT = 'E3F4F2', CORALT = 'FCE9E4';
const HF = 'Cambria', BF = 'Calibri';
const W = 13.33;

function title(s, text, sub) {
  s.addText(text, { x: 0.6, y: 0.35, w: W - 1.2, h: 0.75, fontFace: HF, fontSize: 32, bold: true, color: NAVY, margin: 0, isTextBox: true });
  if (sub) s.addText(sub, { x: 0.6, y: 1.08, w: W - 1.2, h: 0.45, fontFace: BF, fontSize: 16, color: MUTED, italic: true, margin: 0, isTextBox: true });
}
function plain(s, text, x, y, w, h, col = TEAL, tint = TEALT, label = 'In plain words') {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: tint }, line: { color: tint }, rectRadius: 0.12 });
  s.addText([
    { text: label, options: { bold: true, color: col, fontSize: 13, breakLine: true } },
    { text, options: { color: INK, fontSize: 15 } }
  ], { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: h - 0.24, fontFace: BF, valign: 'top', margin: 0, paraSpaceAfter: 4, isTextBox: true });
}
function circle(s, x, y, d, txt, col) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: col }, line: { color: col } });
  s.addText(txt, { x, y, w: d, h: d, align: 'center', valign: 'middle', fontFace: HF, bold: true, fontSize: d * 22, color: WHITE, margin: 0, isTextBox: true });
}
let PAGE = 1;
function foot(s) {
  const n = ++PAGE;
  s.addText(`E1 · THP-1 + mouse plasma viability · 7 Sep 2026   |   ${n}`, { x: 0.6, y: 7.05, w: W - 1.2, h: 0.3, fontFace: BF, fontSize: 10, color: '9AA3AE', align: 'right', margin: 0, isTextBox: true });
}

// ---------- 1 Title ----------
let s = pres.addSlide(); s.background = { color: NAVY };
s.addText('PhD project · Experiment E1', { x: 0.8, y: 1.3, w: 11, h: 0.5, fontFace: BF, fontSize: 18, color: '8FD6CC', bold: true, margin: 0, isTextBox: true });
s.addText('Does mouse plasma harm THP-1 cells?', { x: 0.8, y: 1.9, w: 11.5, h: 1.2, fontFace: HF, fontSize: 44, bold: true, color: WHITE, margin: 0, isTextBox: true });
s.addText('Flow cytometry viability analysis, the methods used, and what the data really says', { x: 0.8, y: 3.15, w: 11, h: 0.6, fontFace: BF, fontSize: 20, color: 'CADCFC', margin: 0, isTextBox: true });
circle(s, 0.8, 4.5, 0.55, '0', TEAL); circle(s, 1.5, 4.5, 0.55, '30', TEAL); circle(s, 2.2, 4.5, 0.55, '50', TEAL); circle(s, 2.9, 4.5, 0.55, '70', TEAL); circle(s, 3.6, 4.5, 0.55, 'HK', CORAL);
s.addText('% mouse plasma tested, plus a heat-killed (HK) control', { x: 4.35, y: 4.5, w: 7, h: 0.55, fontFace: BF, fontSize: 15, color: 'CADCFC', valign: 'middle', margin: 0, isTextBox: true });
s.addText('Tahnoon Al Nahyan  ·  Supervisor: Dr Fahad Ali, MBRU College of Medicine  ·  Data acquired 7 Sep 2026 (BD LSRFortessa)', { x: 0.8, y: 6.4, w: 11.8, h: 0.4, fontFace: BF, fontSize: 13, color: '9FB0C8', margin: 0, isTextBox: true });
s.addNotes('This deck analyses the E1 viability experiment: THP-1 cells exposed to 0-70% mouse plasma, stained with a single viability dye read in APC-Cy7, plus unstained and heat-killed controls. Raw FCS files and the FlowJo workspace (20260907_TKm_F1_70%.wsp) were re-analysed independently in Python.');

// ---------- 2 The research story ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Where this experiment fits in the project', 'Big question: can the C3–MHC class II interaction linked to trogocytosis be reproduced in a human THP-1 model?');
const steps = [
  ['E1', 'Is plasma safe for cells?', 'Find a mouse-plasma dose that keeps THP-1 alive', CORAL, true],
  ['E2', 'Make MHC II-high cells', 'Stimulate THP-1 to raise surface MHC II; compare with untreated (MHC II-low)', TEAL, false],
  ['E3', 'Does C3 follow MHC II?', 'Add plasma to MHC II-low vs MHC II-high cells; measure MHC II and C3 deposition', NAVY, false],
];
steps.forEach((st, i) => {
  const x = 0.6 + i * 4.15, y = 1.95;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.75, h: 3.0, fill: { color: st[4] ? CORALT : TINT }, line: { color: st[4] ? CORAL : TINT, width: st[4] ? 2 : 0.5 }, rectRadius: 0.15 });
  circle(s, x + 0.3, y + 0.3, 0.8, st[0], st[3]);
  s.addText(st[1], { x: x + 0.3, y: y + 1.2, w: 3.3, h: 0.6, fontFace: HF, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true });
  s.addText(st[2], { x: x + 0.3, y: y + 1.9, w: 3.2, h: 1.0, fontFace: BF, fontSize: 14, color: MUTED, margin: 0, valign: 'top', isTextBox: true });
  if (st[4]) s.addText('THIS DATASET', { x: x + 1.3, y: y + 0.45, w: 2.2, h: 0.4, fontFace: BF, fontSize: 12, bold: true, color: CORAL, margin: 0, isTextBox: true });
  if (i < 2) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 3.8, y: y + 1.3, w: 0.32, h: 0.4, fill: { color: 'B8C1CC' }, line: { color: 'B8C1CC' } });
});
plain(s, 'E3 adds mouse plasma (the source of C3) to human cells. If plasma alone killed the cells, any change in C3 or MHC II could just be dying cells. E1 checks that first.', 0.6, 5.3, 12.1, 1.35, CORAL, CORALT, 'Why E1 comes first');
foot(s);
s.addNotes('Project outline from the email with Dr Fahad Ali (1 Sep 2026), reference paper Science doi:10.1126/science.abf7470. E1 is a safety/compatibility step: it must show that the chosen plasma concentration does not reduce viability, so that later C3 deposition differences cannot be explained by cell death. Dead cells also bind proteins and complement non-specifically, which would confound E3.');

// ---------- 3 Experiment design ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'What was measured', 'Ten tubes, one colour: a viability dye read in the APC-Cy7 channel');
const tubes = [['Unstained', 'no dye', '8A94A6'], ['0%', 'no plasma', NAVY], ['30%', '', TEAL], ['40%', '+ repeat', TEAL], ['50%', '', TEAL], ['60%', '', TEAL], ['70%', '+ repeat', TEAL], ['HK', 'heat-killed', CORAL]];
tubes.forEach((t, i) => {
  const x = 0.6 + (i % 4) * 1.95, y = 1.85 + Math.floor(i / 4) * 1.75;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 1.75, h: 1.5, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.12 });
  s.addText(t[0], { x, y: y + 0.2, w: 1.75, h: 0.65, align: 'center', fontFace: HF, fontSize: t[0].length > 4 ? 18 : 26, bold: true, color: t[2], margin: 0, isTextBox: true });
  s.addText(t[1] || 'plasma', { x, y: y + 0.9, w: 1.75, h: 0.4, align: 'center', fontFace: BF, fontSize: 13, color: MUTED, margin: 0, isTextBox: true });
});
s.addText([
  { text: 'Controls', options: { bold: true, color: NAVY, fontSize: 17, breakLine: true } },
  { text: 'Unstained shows where "no dye" sits. Heat-killed (HK) shows what a dead cell looks like with the dye. 0% plasma is the baseline for cells in culture.', options: { fontSize: 15, color: INK, breakLine: true } },
  { text: ' ', options: { fontSize: 8, breakLine: true } },
  { text: 'The dye', options: { bold: true, color: NAVY, fontSize: 17, breakLine: true } },
  { text: 'Live cells have an intact membrane and stay dim. Dead cells are leaky, take up the dye and glow brightly.', options: { fontSize: 15, color: INK, breakLine: true } },
  { text: ' ', options: { fontSize: 8, breakLine: true } },
  { text: 'Instrument', options: { bold: true, color: NAVY, fontSize: 17, breakLine: true } },
  { text: 'BD LSRFortessa, 7 Sep 2026, 14:38–15:10. Gated in FlowJo 10.10.1.', options: { fontSize: 15, color: INK } }
], { x: 8.6, y: 1.85, w: 4.2, h: 4.7, fontFace: BF, valign: 'top', margin: 0, isTextBox: true });
foot(s);
s.addNotes('Files: Specimen_001_untained, THP_0%, 30%, 40%, 40%_2, 50%, 60%, 70%, 70%_002, HK. Channels recorded: FSC-A/H/W, SSC-A/H/W, APC-Cy7-A, Time. No compensation needed (single colour). Event counts ranged from 1,357 (HK) to 284,895 (70% repeat).');

// ---------- 4 Methods ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'How the data was analysed', 'An independent re-analysis of the raw files, checked against the FlowJo workspace');
const meth = [
  ['Read raw data', 'All 10 .fcs files opened in Python (FlowIO). Every event, every channel, no down-sampling.'],
  ['Rebuild FlowJo gates', 'The three gates were read from the .wsp file (THP → Single Cells → APC-Cy7⁻) and applied. Counts matched FlowJo within ~1%.'],
  ['Plot on proper scales', 'Dye shown on a logicle (biexponential) scale, like FlowJo, so negative and dim values are visible.'],
  ['Look outside the gates', 'Asked where dye-positive (dead) events sit, including events the THP gate throws away.'],
  ['Measure event rates', 'Events per second (from the Time channel) for small particles vs intact cells, to tell debris from real cell loss.'],
  ['Re-gate and re-calculate', 'A new "all cells" gate keeps dead cells but drops plasma particles. Then singlets, then live vs dead. Statistics: 95% CIs and a linear trend test.'],
];
meth.forEach((m, i) => {
  const col = i % 2, row = Math.floor(i / 2);
  const x = 0.6 + col * 6.2, y = 1.8 + row * 1.6;
  circle(s, x, y + 0.1, 0.7, String(i + 1), i < 2 ? NAVY : (i < 4 ? TEAL : CORAL));
  s.addText(m[0], { x: x + 0.95, y, w: 4.9, h: 0.45, fontFace: HF, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true });
  s.addText(m[1], { x: x + 0.95, y: y + 0.45, w: 4.9, h: 0.95, fontFace: BF, fontSize: 14, color: MUTED, margin: 0, valign: 'top', isTextBox: true });
});
s.addText('Live/dead cut-off: APC-Cy7 ≈ 535, taken from the upper edge of the existing FlowJo gate. Singlets for the re-gating: FSC-H/FSC-A between 0.55 and 0.90. CIs: Wilson (proportions) and bootstrap (medians).', { x: 0.6, y: 6.55, w: 12.1, h: 0.4, fontFace: BF, fontSize: 12, italic: true, color: MUTED, margin: 0, isTextBox: true });
foot(s);
s.addNotes('Tools: Python 3, FlowIO 1.4 (FCS reading), flowutils (logicle transform), NumPy, Matplotlib (300 dpi figures). Gates: polygon vertices from Gating-ML in the workspace, tested with point-in-polygon on raw (untransformed) values, which is how FlowJo stores them. Event-rate analysis assumes the same flow-rate setting and similar cell input across tubes; this was not recorded in the FCS keywords. Corrected viability = live / (live + dead) with the definitions shown.');

// ---------- 5 Primer ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Reading a flow plot in 30 seconds', 'Each dot is one particle passing the laser');
const prim = [
  ['FSC', 'Forward scatter = size', 'Bigger particles scatter more light forward. Intact THP-1 cells sit on the right; debris and plasma particles on the left.', NAVY],
  ['SSC', 'Side scatter = granularity', 'How "grainy" the inside is. Dying cells shrink and become grainier, moving up and to the left.', TEAL],
  ['Dye', 'APC-Cy7 = dead-cell stain', 'Dim = membrane intact (alive). Bright = membrane broken (dead). Heat-killed cells are ~1,000× brighter than live cells.', CORAL],
];
prim.forEach((p, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.85, w: 3.75, h: 3.6, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.15 });
  circle(s, x + 1.35, 2.15, 1.05, p[0], p[3]);
  s.addText(p[1], { x: x + 0.25, y: 3.35, w: 3.25, h: 0.5, align: 'center', fontFace: HF, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true });
  s.addText(p[2], { x: x + 0.3, y: 3.9, w: 3.15, h: 1.4, fontFace: BF, fontSize: 14, color: MUTED, margin: 0, valign: 'top', isTextBox: true });
});
plain(s, 'A "gate" is a shape drawn on a plot to keep only the dots inside it. Gates are applied in order, so what one gate throws away never reaches the next plot.', 0.6, 5.75, 12.1, 1.0, NAVY, TINT, 'Gates');
foot(s);
s.addNotes('FSC-A vs FSC-H is used for doublet discrimination: single cells have a proportional area/height; two stuck cells have more area for the same height.');

// ---------- 6 Original gating ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Your FlowJo gating strategy', 'Three steps: THP-1 cells → single cells → dye-negative (live)');
s.addImage({ path: 'fig1_gating.png', x: 0.5, y: 1.6, w: 8.4, h: 8.4 / 1.585 });
s.addText([
  { text: 'Top row: ', options: { bold: true, color: NAVY } }, { text: '0% plasma.', options: { breakLine: true } },
  { text: 'Bottom row: ', options: { bold: true, color: NAVY } }, { text: '70% plasma (repeat tube).', options: { breakLine: true } },
  { text: ' ', options: { fontSize: 8, breakLine: true } },
  { text: 'Both end at ~97–99% "live".', options: { bold: true, breakLine: true } },
  { text: ' ', options: { fontSize: 8, breakLine: true } },
  { text: 'Notice in the bottom-left plot the huge cloud of small events that only appears with plasma. Only 1.2% of events enter the THP-1 gate.', options: {} },
], { x: 9.2, y: 1.7, w: 3.6, h: 3.1, fontFace: BF, fontSize: 15, color: INK, valign: 'top', margin: 0, isTextBox: true });
plain(s, 'On this strategy every plasma dose looks almost 100% alive. The next slides test whether that is true.', 9.2, 4.95, 3.6, 1.75, CORAL, CORALT, 'Keep in mind');
foot(s);
s.addNotes('Gate coordinates from the workspace. THP gate: 12-vertex polygon on FSC-A/SSC-A. Single Cells: 3-vertex polygon on FSC-A/FSC-H. Live: polygon on FSC-A/APC-Cy7-A with an upper edge at ~460-535. Python counts matched FlowJo within ~1% (edge effects).');

// ---------- 7 First result chart ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'First look: the gates say ~98% alive at every dose', 'Percentage dye-negative among gated single cells, straight from the FlowJo hierarchy');
const cats = ['0%', '30%', '40%', '40% rep', '50%', '60%', '70%', '70% rep'];
const orig = [99.0, 98.9, 98.9, 98.2, 98.1, 98.8, 98.5, 97.3];
s.addChart(pres.charts.BAR, [{ name: 'Live (%) – original gates', labels: cats, values: orig }], {
  x: 0.6, y: 1.65, w: 7.9, h: 5.1, barDir: 'col', chartColors: [NAVY], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 12, dataLabelColor: INK,
  valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelColor: MUTED, catAxisLabelColor: INK, catAxisLabelFontSize: 13, valGridLine: { color: 'E1E5EA', size: 0.5 }, catGridLine: { style: 'none' },
  showLegend: false, showTitle: true, title: '% plasma in culture', titleFontSize: 13, titleColor: MUTED, dataLabelFormatCode: '0.0', barGapWidthPct: 60
});
s.addText('98%', { x: 8.9, y: 1.8, w: 3.9, h: 1.2, fontFace: HF, fontSize: 66, bold: true, color: NAVY, margin: 0, isTextBox: true });
s.addText('average "live" with the original gates, and the heat-killed control correctly gives 0% live.', { x: 8.9, y: 3.0, w: 3.9, h: 1.0, fontFace: BF, fontSize: 15, color: INK, margin: 0, isTextBox: true });
plain(s, 'Even the no-plasma control scores 99%. Normal cultures usually have a few % dead cells, so this number is suspiciously perfect.', 8.9, 4.4, 3.9, 2.3, CORAL, CORALT, 'Red flag');
foot(s);
s.addNotes('Heat-killed: 18 cells reached the Single Cells gate and 0 were dye-negative, so the dye does separate live from dead. The problem is not the dye but which events are allowed into the analysis.');

// ---------- 8 Hidden dead ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Problem 1: dead cells fall outside the THP-1 gate', 'Red = dye-positive events. The gate (outline) was drawn around healthy-looking cells');
s.addImage({ path: 'fig2_hidden_dead.png', x: 1.0, y: 1.55, w: 11.3, h: 11.3 / 2.917 });
plain(s, 'Dying cells shrink and become grainy, so they move out of the gate. The heat-killed control proves it: 1,274 of its 1,293 dye-positive events lie outside the gate. The gate filtered out the dead cells before viability was ever measured, which is why every sample looked ~99% alive.', 0.6, 5.55, 12.1, 1.35, CORAL, CORALT, 'What this means');
foot(s);
s.addNotes('Dye-positive threshold APC-Cy7 > 535. Also note that about 35% of heat-killed events sit at the top of the SSC scale (value 262,143 = saturated). The SSC voltage (222 V) is too high for dead cells; lowering it would bring them on scale. Some dye-positive events at low FSC are fragments of dead cells rather than whole cells.');

// ---------- 9 Plasma particles ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Problem 2: plasma brings its own particles', 'Dashed box = small, low-granularity events. They grow with the plasma dose');
s.addImage({ path: 'fig3_plasma_particles.png', x: 1.0, y: 1.55, w: 11.3, h: 11.3 / 2.917 });
plain(s, 'Plasma contains platelets, fat particles (lipoproteins) and protein clumps. The cytometer counts each one as an "event". At 70% plasma almost every event is a plasma particle, so THP-1 cells become a tiny percentage of the total. That makes it look like cells disappeared, even when they did not.', 0.6, 5.55, 12.1, 1.35, TEAL, TEALT, 'What this means');
foot(s);
s.addNotes('Small particles defined as FSC-A < 60,000. At 0% plasma the small events form a tight low-SSC cluster (likely culture debris); from 40% upward a large, spread cloud appears that is typical of plasma-derived particles. A plasma-only tube (no cells) would confirm the source and let you set an FSC threshold during acquisition.');

// ---------- NEW Composition ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'What is inside each tube?', 'Every recorded event sorted into live cells, dead cells, doublets or plasma particles/debris');
s.addImage({ path: 'fig7_composition.png', x: 1.17, y: 1.55, w: 11.0, h: 11.0 / 2.5 });
plain(s, 'Without plasma, 40–70% of events are cells. From 40% plasma upward, cells are only 1–3% of events; the rest is plasma. The 30% tube stands out with many doublets (clumped cells), which may explain why it behaved oddly.', 0.6, 6.05, 12.1, 0.92, TEAL, TEALT, 'What this means');
foot(s);
s.addNotes('Categories use the recommended gating (slide 17). Plasma particles/debris = outside the all-cells gate (includes dead-cell fragments and, in the 0% tube, culture debris). Doublets = inside the all-cells gate but outside the singlet band. Live/dead = singlets below/above APC-Cy7 535. The heat-killed tube is ~50% whole dead cells and ~50% fragments.');

// ---------- 10 Rates ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Are cells really lost? Count per second, not per cent', 'Event rate from the Time channel, same cytometer run');
const rcats = ['0%', '30%', '40%', '40% rep', '50%', '60%', '70%', '70% rep'];
s.addChart(pres.charts.BAR, [{ name: 'Small particles / s', labels: rcats, values: [49, 71, 495, 1226, 1290, 2237, 1951, 4511] }], {
  x: 0.6, y: 1.65, w: 6.0, h: 3.9, barDir: 'col', chartColors: [PURPLE], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: INK, dataLabelFormatCode: '#,##0',
  valAxisLabelColor: MUTED, catAxisLabelColor: INK, valGridLine: { color: 'E1E5EA', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: false,
  showTitle: true, title: 'Plasma particles per second', titleFontSize: 15, titleColor: INK, valAxisLabelFormatCode: '#,##0'
});
s.addChart(pres.charts.BAR, [{ name: 'THP-1 cells / s', labels: rcats, values: [35.4, 8.4, 13.3, 14.1, 38.7, 73.7, 74.6, 58.5] }], {
  x: 6.75, y: 1.65, w: 6.0, h: 3.9, barDir: 'col', chartColors: [TEAL], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: INK, dataLabelFormatCode: '0',
  valAxisLabelColor: MUTED, catAxisLabelColor: INK, valGridLine: { color: 'E1E5EA', size: 0.5 }, catGridLine: { style: 'none' }, showLegend: false,
  showTitle: true, title: 'Intact THP-1 cells per second', titleFontSize: 15, titleColor: INK
});
plain(s, 'Plasma particles rise almost 100-fold with dose, but intact cells keep flowing at the same or higher rate (35/s at 0% vs 40–75/s at 50–70%). The cells were not destroyed; they were diluted among plasma particles. The lower rates at 30–40% more likely reflect fewer cells in those tubes.', 0.6, 5.75, 12.1, 1.2, TEAL, TEALT, 'What this means');
foot(s);
s.addNotes('Caveat: this comparison assumes the same flow-rate setting and similar cell numbers per tube, which are not stored in the files. The robust fix is counting beads (e.g. CountBright) or a fixed acquisition volume, which gives cells per microlitre.');

// ---------- 11 Corrected viability ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Answer to E1: no dose-dependent toxicity up to 70%', 'Viability recalculated so dead cells outside the THP-1 gate are counted (recommended gating, slide 17)');
const corr = [93.2, 91.8, 92.6, 89.3, 90.5, 94.9, 93.7, 87.9];
s.addChart(pres.charts.BAR, [
  { name: 'Original gates', labels: cats, values: orig },
  { name: 'Recommended gating (dead cells counted)', labels: cats, values: corr }
], {
  x: 0.6, y: 1.65, w: 8.2, h: 5.2, barDir: 'col', chartColors: ['B8C1CC', TEAL], showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10, dataLabelColor: INK, dataLabelFormatCode: '0',
  valAxisMinVal: 0, valAxisMaxVal: 100, valAxisLabelColor: MUTED, catAxisLabelColor: INK, catAxisLabelFontSize: 12, valGridLine: { color: 'E1E5EA', size: 0.5 }, catGridLine: { style: 'none' },
  showLegend: true, legendPos: 'b', legendFontSize: 12, barGapWidthPct: 50, showTitle: true, title: '% live cells', titleFontSize: 13, titleColor: MUTED
});
s.addText('88–95%', { x: 9.1, y: 1.75, w: 3.8, h: 1.1, fontFace: HF, fontSize: 54, bold: true, color: TEAL, margin: 0, isTextBox: true });
s.addText('live at every plasma dose, vs 93.2% with no plasma.', { x: 9.1, y: 2.85, w: 3.7, h: 0.8, fontFace: BF, fontSize: 15, color: INK, margin: 0, isTextBox: true });
plain(s, 'Cells in 70% mouse plasma are about as healthy as cells with no plasma. There is no trend of more death at higher doses. On this data, doses up to 70% look safe for E3, pending the checks on the next slide.', 9.1, 3.85, 3.7, 3.0, TEAL, TEALT, 'Take-home');
foot(s);
s.addNotes('Live/dead counts with the recommended gating (slide 17): unstained 6970/6; 0% 2511/182; 30% 1128/101; 40% 649/52; 40% rep 548/66; 50% 1436/151; 60% 1646/89; 70% 1683/113; 70% rep 2297/316; HK 1/665. Differences of a few % between replicate tubes (40%: 92.6 vs 89.3; 70%: 93.7 vs 87.9) are the noise level of this single experiment.');

// ---------- NEW Dose-response ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Is there any trend with dose?', 'Viability per tube with 95% confidence intervals and a linear trend line');
s.addImage({ path: 'fig6_dose_response.png', x: 0.6, y: 1.55, w: 8.0, h: 8.0 / 1.518 });
s.addText('−0.17%', { x: 8.95, y: 1.7, w: 3.9, h: 1.0, fontFace: HF, fontSize: 48, bold: true, color: NAVY, margin: 0, isTextBox: true });
s.addText('change in viability per +10% plasma (95% CI −1.17 to +0.82; p = 0.69).', { x: 8.95, y: 2.7, w: 3.85, h: 0.9, fontFace: BF, fontSize: 15, color: INK, margin: 0, isTextBox: true });
plain(s, 'The trend line is flat and its uncertainty band crosses zero. Going from 0% to 70% plasma changes viability by about 1% at most, which is smaller than the difference between two tubes of the same dose.', 8.95, 3.8, 3.85, 2.95, TEAL, TEALT, 'In plain words');
foot(s);
s.addNotes('Error bars: Wilson 95% interval for each tube proportion (live / live+dead). Trend: ordinary least-squares on 8 tube values (plasma % as x). These are technical tubes from one experiment, so p-values describe this run only; independent biological repeats (n >= 3) are needed for a formal claim. The 60% vs 70% repeat difference (94.9 vs 87.9) shows the tube-to-tube noise.');

// ---------- 12 Dye shift ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'A subtle clue: live cells get slightly brighter in plasma', 'Viability dye signal of cells counted as live');
s.addImage({ path: 'fig4_dye.png', x: 1.25, y: 1.55, w: 10.8, h: 10.8 / 2.708 });
plain(s, 'Live and dead cells are very clearly separated (left). But live cells in plasma carry 3–4× more dye signal than live cells without plasma (right). A likely reason: plasma proteins stick to the cell surface and grab some dye. That is still far below "dead", but protein coating of cells is exactly what E3 wants to measure for C3.', 0.6, 5.6, 12.1, 1.35, PURPLE, 'EFEDFA', 'What this means');
foot(s);
s.addNotes('Median APC-Cy7 of live cells: unstained 5, 0% 22, 30% 59, 40% 74, 40% rep 82, 50% 84, 60% 80, 70% 97, 70% rep 87. If the dye is amine-reactive (e.g. Zombie NIR, LIVE/DEAD Near-IR), it reacts with any protein, so bound plasma proteins would add background. Alternative explanations: mild membrane stress, or dye carry-over if washing differed.');

// ---------- NEW Granularity ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Do live cells change shape in plasma?', 'Side scatter (granularity) of live cells only; size (FSC) did not change');
s.addImage({ path: 'fig8_granularity.png', x: 1.17, y: 1.55, w: 11.0, h: 11.0 / 2.6 });
plain(s, 'Live cells in plasma look grainier, rising from 114k at 0% to 138k at 70%. THP-1 are monocytes and may be swallowing plasma particles. But the unstained tube (no plasma) is just as grainy as 70%, and dose also follows the order the tubes were run. So this is a clue to test, not a result yet.', 0.6, 5.9, 12.1, 1.1, PURPLE, 'EFEDFA', 'Careful interpretation');
foot(s);
s.addNotes('Median SSC-A of live cells (recommended gating): unstained 138k, 0% 114k, 30% 125k, 40% 126k, 40% rep 129k, 50% 132k, 60% 137k, 70% 138k, 70% rep 138k. 95% CIs from 300 bootstrap resamples. Plasma tubes were run 14:44-15:02 in dose order, and the 0% tube last (15:09) after the heat-killed tube. To test properly: run tubes in random order, include a no-plasma tube that was handled identically, and consider a particle-uptake readout (e.g. fluorescent beads or labelled plasma).');

// ---------- 13 Singlet gate ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Problem 3: the single-cell gate is too narrow', 'Red dots are thrown away but sit on the same diagonal as the kept cells');
s.addImage({ path: 'fig5_singlets.png', x: 0.6, y: 1.6, w: 8.3, h: 8.3 / 2.4 });
s.addText([
  { text: 'The lower edge of the triangle runs through the middle of the cell population.', options: { breakLine: true } },
  { text: ' ', options: { fontSize: 8, breakLine: true } },
  { text: 'At 0% plasma it removes ~46% of cells; at 30% it removes ~76%.', options: { bold: true, breakLine: true } },
  { text: ' ', options: { fontSize: 8, breakLine: true } },
  { text: 'Fewer cells means noisier percentages, and the cells removed may not be random.', options: {} },
], { x: 9.2, y: 1.7, w: 3.6, h: 3.2, fontFace: BF, fontSize: 15, color: INK, valign: 'top', margin: 0, isTextBox: true });
plain(s, 'Single cells form one straight diagonal band. Doublets (two stuck cells) fall below it as a separate group. Draw the gate around the whole band, like the purple dashed lines, not through its middle.', 0.6, 5.3, 12.1, 1.4, NAVY, TINT, 'How to fix it');
foot(s);
s.addNotes('Current gate keeps 53.8% (0%), 24.0% (30%), 53-55% (40%). A band of FSC-H/FSC-A = 0.55-0.90 keeps nearly all events in the main diagonal. Adjust by eye in FlowJo on the 0% sample and apply to the group.');

// ---------- NEW Recommended gating ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Recommended gating strategy', 'Keep dead cells, drop plasma particles, then split live from dead');
s.addImage({ path: 'fig9_new_gating.png', x: 0.6, y: 1.5, w: 8.35, h: 8.35 / 1.5625 });
s.addText([
  { text: '1 · All cells', options: { bold: true, color: CORAL, breakLine: true } },
  { text: 'Wide gate: everything big enough to be a cell, including shrunken, grainy dead cells up to the top of the scale. The lower-left notch removes the plasma particle cloud.', options: { breakLine: true } },
  { text: ' ', options: { fontSize: 6, breakLine: true } },
  { text: '2 · Singlets', options: { bold: true, color: CORAL, breakLine: true } },
  { text: 'A band around the whole FSC-A vs FSC-H diagonal (ratio 0.55–0.90).', options: { breakLine: true } },
  { text: ' ', options: { fontSize: 6, breakLine: true } },
  { text: '3 · Live vs dead', options: { bold: true, color: CORAL, breakLine: true } },
  { text: 'One cut-off on the dye. Heat-killed control: 99.8% dead. Unstained: 99.9% live.', options: {} },
], { x: 9.2, y: 1.6, w: 3.65, h: 5.2, fontFace: BF, fontSize: 13.5, color: INK, valign: 'top', margin: 0, isTextBox: true });
foot(s);
s.addNotes('All-cells polygon (FSC-A, SSC-A): (60k,270k) (270k,270k) (270k,100.8k) (175.5k,58k) (122k,42k) (100k,68k) (100k,100k) (60k,115k). Singlets: FSC-H/FSC-A 0.55-0.90. Dye cut-off 535 (unstained 99.9th percentile = 473). Full 10-sample version supplied as figS1 files. For E3, apply the same logic and then read MHC II and C3 on live singlets.');

// ---------- 14 Caveats ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Before trusting the answer: four checks', 'What this dataset cannot yet prove');
const cav = [
  ['1', 'Does the dye work in plasma?', 'The heat-killed control had no plasma. If the dye is amine-reactive, plasma proteins can soak it up and hide dead cells. Run heat-killed cells + 70% plasma.', CORAL],
  ['2', 'Plasma-only tube', 'Plasma with no cells, to confirm the small particles come from plasma and to set a size threshold that removes them.', PURPLE],
  ['3', 'Repeat the experiment', 'This is one experiment (n = 1). Replicate tubes differ by up to 4%, so a real effect needs ≥3 independent repeats.', NAVY],
  ['4', 'Match the time', 'Viability after a short incubation may differ from 24 h. Test the same exposure time you will use in E3.', TEAL],
];
cav.forEach((c, i) => {
  const x = 0.6 + (i % 2) * 6.2, y = 1.8 + Math.floor(i / 2) * 2.5;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 5.9, h: 2.2, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.15 });
  circle(s, x + 0.3, y + 0.35, 0.75, c[0], c[3]);
  s.addText(c[1], { x: x + 1.3, y: y + 0.3, w: 4.4, h: 0.5, fontFace: HF, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true });
  s.addText(c[2], { x: x + 1.3, y: y + 0.85, w: 4.4, h: 1.25, fontFace: BF, fontSize: 14, color: MUTED, margin: 0, valign: 'top', isTextBox: true });
});
foot(s);
s.addNotes('Also technical: lower SSC voltage so dead cells are on scale; collect more events in HK (only 1,357 events); record flow-rate setting and use counting beads. The 0% sample was acquired last (15:09) after HK; a quick wash between tubes avoids carry-over.');

// ---------- 15 Link to E3 ----------
s = pres.addSlide(); s.background = { color: WHITE };
title(s, 'Carrying this forward to E2 and E3', 'Lessons from E1 that will decide whether C3 can be seen at all');
const e3 = [
  ['Anticoagulant', 'EDTA or citrate plasma removes the calcium and magnesium complement needs, so no C3 is deposited. Use lepirudin (hirudin) plasma to keep complement active.', CORAL],
  ['Complement controls', 'Include heat-inactivated plasma (56 °C, 30 min) as a "no complement" negative control. Store plasma at −80 °C and avoid freeze–thaw.', NAVY],
  ['Better gating', 'Remove plasma particles with an FSC threshold, gate dead cells out with the dye first, then read MHC II and C3 on live single cells.', TEAL],
];
e3.forEach((e, i) => {
  const y = 1.7 + i * 1.4;
  circle(s, 0.6, y + 0.1, 0.9, String(i + 1), e[2]);
  s.addText(e[0], { x: 1.8, y, w: 10.5, h: 0.5, fontFace: HF, fontSize: 20, bold: true, color: INK, margin: 0, isTextBox: true });
  s.addText(e[1], { x: 1.8, y: y + 0.5, w: 10.8, h: 0.9, fontFace: BF, fontSize: 15, color: MUTED, margin: 0, valign: 'top', isTextBox: true });
});
plain(s, 'Dead cells stick proteins, including complement, non-specifically. Removing them properly is what lets E3 claim that C3 follows MHC II, not cell death.', 0.6, 5.95, 12.1, 0.95, CORAL, CORALT, 'Why it matters');
foot(s);
s.addNotes('Heparin partly preserves complement but can interfere with some complement steps; lepirudin is the usual choice for complement-preserving plasma. For E3 panel design, the viability dye must be spectrally separate from the MHC II and C3 antibody fluorochromes, and the dye should be applied in protein-free buffer before plasma or after washing.');

// ---------- 16 Conclusion ----------
s = pres.addSlide(); s.background = { color: NAVY };
s.addText('Take-home messages', { x: 0.8, y: 0.6, w: 11, h: 0.8, fontFace: HF, fontSize: 36, bold: true, color: WHITE, margin: 0, isTextBox: true });
const th = [
  ['88–95%', 'THP-1 viability at 0–70% mouse plasma, no significant dose trend (p = 0.69). Plasma looks safe for E3.', TEAL],
  ['~98%', 'The original gates overestimated viability because dead cells sat outside the THP-1 gate.', CORAL],
  ['100×', 'More plasma particles at 70%. Cells were diluted, not lost.', PURPLE],
];
th.forEach((t, i) => {
  const y = 1.7 + i * 1.35;
  s.addText(t[0], { x: 0.8, y, w: 3.2, h: 1.1, fontFace: HF, fontSize: 40, bold: true, color: t[2], valign: 'middle', margin: 0, isTextBox: true });
  s.addText(t[1], { x: 4.1, y, w: 8.5, h: 1.1, fontFace: BF, fontSize: 18, color: 'E6ECF4', valign: 'middle', margin: 0, isTextBox: true });
});
s.addText([
  { text: 'Next: ', options: { bold: true, color: '8FD6CC' } },
  { text: 'repeat with heat-killed + plasma, a plasma-only tube, counting beads and a wider singlet gate; confirm the plasma anticoagulant before E3.', options: { color: 'CADCFC' } }
], { x: 0.8, y: 5.95, w: 11.8, h: 0.8, fontFace: BF, fontSize: 16, margin: 0, isTextBox: true });
s.addNotes('Summary for discussion with Dr Fahad Ali. Recommended working concentration can be chosen once the dye-in-plasma control confirms dead cells are detectable in plasma.');

pres.writeFile({ fileName: 'E1_THP1_plasma_viability.pptx' }).then(f => console.log('wrote', f));
