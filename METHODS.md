# Methods: E1 flow cytometry re-analysis
### THP-1 viability after exposure to mouse plasma (acquired 7 Sep 2026)

This document describes every analysis step behind the figures and tables, in two layers:

- the **technical method**, written so it can be adapted for a thesis or paper;
- a **plain-language explanation** of why each step was done.

Items in [square brackets] were not recorded in the data files and must be filled in by the experimenter.

---

## 1. Data

**Samples.** There were ten FCS 3.0 files, one per tube:

- unstained THP-1;
- THP-1 exposed to 0, 30, 40, 50, 60 and 70% mouse plasma, with a second tube at 40% and at 70%;
- heat-killed (HK) THP-1 as the dead-cell positive control.

**Acquisition.** Tubes were run on a BD LSRFortessa on 7 Sep 2026 between 14:38 and 15:10. They were run in this order: unstained, 30%, 40%, 40% repeat, 50%, 60%, 70%, 70% repeat, HK, 0%.

**Parameters recorded.** Each file contains FSC-A/H/W, SSC-A/H/W, APC-Cy7-A (viability dye) and Time.

- Detector voltages: FSC 500 V, SSC 222 V, APC-Cy7 550 V.
- Scale: 18-bit (0–262,143).
- Time step: 0.01 s.

**Events recorded.** Counts ranged from 1,357 (HK) to 284,895 (70% repeat).

**Experimental details not in the files.**

- Viability dye: [name, e.g. Zombie NIR / LIVE/DEAD Fixable Near-IR / DRAQ7], [dilution].
- Staining buffer and whether cells were washed free of plasma before staining: [ ].
- Plasma exposure time: [ ]. Plasma anticoagulant: [ ].
- Heat-kill conditions: [e.g. 56 °C, 10 min].
- Acquisition stopping rule and flow-rate setting: [ ].

**Gating file.** The original gating was the FlowJo 10 workspace `20260907_TKm_F1_70%.wsp`.

> **Plain language:** Each tube was run through the cytometer, which recorded size (FSC), internal complexity (SSC) and dye brightness for every particle, plus the time it passed the laser.

---

## 2. Software

Analysis was done in Python 3.12 with:

- **FlowIO 1.4.0** – reads FCS files;
- **FlowUtils 1.2.2** – logicle transform;
- **NumPy 2.4** – arrays;
- **SciPy 1.17** – statistics;
- **Matplotlib 3.10** – figures, exported at 300 dpi.

Gate membership was tested with Matplotlib's `Path.contains_points` (a point-in-polygon test) on raw, untransformed values. This matches how FlowJo stores gate coordinates in the workspace. No compensation was applied, because only one fluorescent channel was used.

---

## 3. Reproducing the original FlowJo gating

Gate definitions were extracted from the workspace XML (Gating-ML 2.0 polygons) by `parse_workspace.py`. The original hierarchy was:

1. **THP**: a 12-vertex polygon on FSC-A vs SSC-A.
2. **Single Cells**: a 3-vertex polygon on FSC-A vs FSC-H.
3. **APC-Cy7⁻ (live)**: a polygon on FSC-A vs APC-Cy7-A. Its upper boundary is at APC-Cy7 ≈ 460–535.

Applying these polygons in Python reproduced FlowJo's population counts to within ±1.5% for every gate and sample. The one exception is the HK THP gate, which has only 20 events: FlowJo counted 20 and Python 19. The small differences come from events lying exactly on gate edges.

> **Plain language:** Before changing anything, I checked that I could get the same numbers FlowJo gives. That shows the Python analysis starts from your analysis, not a different one.

---

## 4. Display scales

Dye intensity is shown on a logicle (biexponential) scale with T = 262,144, M = 4.5, W = 0.8 and A = 0. This is FlowJo-like and keeps zero and negative values visible. Scatter parameters are shown on linear scales.

---

## 5. Assessing gating bias: where do dead cells go?

An event was called dye-positive if APC-Cy7-A was above 535, the upper edge of the original live gate. For each sample I counted dye-positive events inside and outside the THP gate (Fig. 2).

The HK control had no plasma. It was used to see where dead THP-1 cells fall in FSC/SSC space. Of its 1,293 dye-positive events, 1,274 (98.5%) lay outside the THP gate, and about 35% sat at the SSC ceiling.

> **Plain language:** The original first gate was drawn around healthy-looking cells. Dead cells shrink and become grainy, so they fall outside that gate and never reach the viability step. That makes every sample look about 99% alive.

---

## 6. Event-rate analysis: dilution or cell loss?

**Why rates.** Percentages of total events cannot tell "fewer cells" apart from "more non-cell particles". I therefore calculated events per second.

**How.** Acquisition time was taken as the range of the Time channel multiplied by the time step (`$TIMESTEP`). For each tube I counted:

- small particles (FSC-A < 60,000);
- events in the THP gate;
- flow stability, as the coefficient of variation (CV) of event counts across 10 equal time bins.

Results are in Table 2.

**Assumption.** This comparison assumes the same flow-rate setting and similar cell input in every tube. Neither was recorded. Absolute counts would need counting beads or volumetric acquisition.

> **Plain language:** From 0% to 70% plasma, small particles rose about 100-fold, while intact cells kept arriving at the same or a higher rate. So the cells were diluted among plasma particles, not destroyed.

---

## 7. Recommended gating strategy

All settings are in `config.py`, and the gates are shown on every sample in Fig. 9 and S1.

1. **All cells (FSC-A vs SSC-A).** An 8-vertex polygon with these vertices: (60k, 270k), (270k, 270k), (270k, 100.8k), (175.5k, 58k), (122k, 42k), (100k, 68k), (100k, 100k), (60k, 115k).
   - It extends to the top of the SSC scale so shrunken, granular dead cells are kept, including events saturated at 262,143.
   - Its lower-left notch excludes the plasma-particle cloud.
   - Without the notch, about 780 plasma aggregates in the 70% repeat tube would have been counted as "live cells".
2. **Singlets.** Events with an FSC-H/FSC-A ratio between 0.55 and 0.90. This band covers the whole singlet diagonal. The original triangle ran through the middle of it and excluded 46–76% of cells.
3. **Live vs dead.** A single cut-off at APC-Cy7-A = 535.
   - It sits above the 99.9th percentile of unstained singlets (473).
   - It classifies 99.9% of unstained cells as live and 99.8% of HK cells as dead.

**Viability** = live ÷ (live + dead) among singlets in the "All cells" gate.

> **Plain language:** The new gates keep dead cells in the analysis but still throw away plasma particles. The two controls prove the gates work: unstained cells come out alive and heat-killed cells come out dead.

---

## 8. Statistics

**Viability.** Each tube's viability has a 95% confidence interval from the Wilson score interval for a binomial proportion. These intervals reflect counting error only; they do not include tube-to-tube or experiment-to-experiment variation.

**Dose trend.** I fitted an ordinary least-squares regression of tube viability (%) on plasma concentration (%) across the 8 plasma tubes, including 0%.

- The slope is reported per 10% plasma, with a 95% confidence interval from the t-distribution (df = 6) and a two-sided p-value.
- The shaded band on Fig. 6 is the 95% confidence band of the fitted line.
- Result: **−0.17% per +10% plasma (95% CI −1.17 to +0.82), R² = 0.03, p = 0.69.**

**Composition (Fig. 7).** Every recorded event was assigned to one category:

- **plasma particles / debris**: outside the All-cells gate; this also includes dead-cell fragments and, in the 0% tube, culture debris;
- **doublets**: inside the All-cells gate but outside the singlet band;
- **live**;
- **dead**.

**Granularity (Fig. 8).** I took the median SSC-A of live cells, with a 95% confidence interval from 300 bootstrap resamples (random seed = 1). Acquisition times are shown on the plot, because plasma dose and acquisition order are confounded.

**Dye signal of live cells (Fig. 4).** I compared the median APC-Cy7-A of cells in the original live gate across tubes.

**Important caveat on inference.** All tubes come from a single experiment. The repeat tubes (40% and 70%) are technical replicates. The p-value therefore describes this run only. A formal claim of "no toxicity" requires at least three independent biological repeats, for example analysed with viability per experiment as the unit.

> **Plain language:** Error bars show how precise each tube's percentage is. The trend line asks whether more plasma means fewer live cells. It does not: the line is flat, and its uncertainty is smaller than the difference between two tubes of the same dose.

**Presentation figures (figures_fancy.py).**
- *Ridgeline (Fig. 11):* a Gaussian kernel density estimate (bandwidth factor 0.06) of logicle-transformed dye intensity for singlets in each tube. Ridge height is √(density / max) so that the rare dead-cell tail stays visible. The fill is split at the live/dead cut-off.
- *Density difference (Fig. 12):* 2D histograms (130 × 130 bins on linear FSC-A/SSC-A) smoothed with a Gaussian filter (σ = 1.6 bins) and normalised to sum to 1. The 70% map pools both 70% tubes. The difference map is 70% minus 0%, shown for all events (row 1) and for live cells only (row 2).
- *Gating funnel (Fig. 13):* event counts remaining after each gate, on a log scale.
- *Joint plot (Fig. 14):* live-cell FSC-A vs SSC-A; contours at the 50/75/90/97th percentiles of a 2D Gaussian KDE (bandwidth factor 0.25); marginal 1D KDEs with medians. SSC-saturated events are excluded from this plot only.
- *Debris evidence (Fig. 16):* small events = outside the All-cells gate. (A) their FSC/SSC location in the 70% repeat tube vs heat-killed debris; (B) their dye distribution vs unstained and heat-killed debris; (C) rates (events/s) of dye⁻ small events, dye⁺ small events and single cells vs dose; (D) dye intensity of dead (dye⁺) singlets per tube, to check the dye is not quenched in plasma.
- *3D explorer:* up to 2,500 randomly sampled events per category per tube (seed 0), coloured by gating category, rendered with plotly.js.

---

## 9. Results summary

| Tube | Live / Dead | Viability (95% CI) |
|---|---|---|
| Unstained | 6,970 / 6 | 99.9% (99.8–100) |
| 0% | 2,511 / 182 | 93.2% (92.2–94.1) |
| 30% | 1,128 / 101 | 91.8% (90.1–93.2) |
| 40% | 649 / 52 | 92.6% (90.4–94.3) |
| 40% repeat | 548 / 66 | 89.3% (86.6–91.5) |
| 50% | 1,436 / 151 | 90.5% (88.9–91.8) |
| 60% | 1,646 / 89 | 94.9% (93.7–95.8) |
| 70% | 1,683 / 113 | 93.7% (92.5–94.7) |
| 70% repeat | 2,297 / 316 | 87.9% (86.6–89.1) |
| Heat-killed | 1 / 665 | 0.2% (0.0–0.8) |

---

## 10. Limitations

1. **The dye was not validated in plasma.** The positive control (HK) contained no plasma. If the dye is amine-reactive, plasma protein could reduce staining of dead cells. An HK + 70% plasma control is needed.
2. **The source of the particles was not directly tested.** No plasma-only tube was run to confirm that the small particles come from plasma.
3. **Only one experiment was done** (n = 1); see Section 8.
4. **Acquisition order was confounded with dose.** Plasma tubes were run in dose order and the 0% tube last. The granularity trend (Fig. 8) therefore cannot be attributed to plasma. The unstained tube, which had no plasma, was as granular as the 70% tube.
5. **The SSC voltage was too high for dead cells.** About 35% of HK events were saturated.
6. **The 30% tube was different from the others.** Its flow was unstable (rate CV 112%) and it had about 7.5% doublets, suggesting clumping.
7. **Gates were set on this run only.** They should be re-checked on every new acquisition.

---

## 11. Methods paragraph (thesis draft)

> *Flow cytometry analysis.* Data were acquired on a BD LSRFortessa and analysed in FlowJo v10 and independently in Python 3.12 (FlowIO, FlowUtils, NumPy, SciPy, Matplotlib). Gates from the FlowJo workspace were reproduced in Python to within 1.5% of FlowJo counts.
>
> Cells were gated on FSC-A/SSC-A using a gate that retained shrunken, high-SSC dead cells while excluding plasma-derived particles. Singlets were then defined by an FSC-H/FSC-A ratio of 0.55–0.90. Dead cells were defined as [viability dye]-positive (APC-Cy7-A > 535), a threshold above the 99.9th percentile of unstained cells that classified 99.8% of heat-killed cells as dead.
>
> Viability was expressed as live/(live+dead) singlets, with Wilson 95% confidence intervals. The effect of plasma concentration on viability was tested by linear regression.
>
> THP-1 viability was 88–95% across 0–70% mouse plasma, compared with 93.2% without plasma. There was no dose-dependent trend (−0.17% per 10% plasma; 95% CI −1.17 to +0.82; p = 0.69; single experiment, [n = 1]).
