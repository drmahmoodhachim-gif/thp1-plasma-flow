# Virtual THP-1 flow bench

A browser simulator for rehearsing E2-style experiments before using real cells or cytometer time. You set up the culture, the harvest and the LSRFortessa, then run a virtual experiment. The bench gives you:

- pre-flight checks;
- FlowJo-style plots;
- a results table;
- a breakdown of why cells died;
- the compensation matrix;
- FCS files you can gate in FlowJo;
- a Supabase lab notebook that stores each virtual run beside what really happened on the bench.

With the default settings ("As run on 12 Oct 2026") the simulator reproduces the real 12 Oct run:

| Arm | Live % (sim / real) | HLA-DR⁺ % (sim / real) | CD11b⁺ % (sim / real) |
|---|---|---|---|
| Untreated | 92.3 / 92.3 | 2.9 / 3.0 | 32 / 30 |
| IFN-γ | 87.6 / 88.5 | 24.1 / 24.9 | 61 / 64 |
| PMA | 32.9 / 32.0 | 23.6 / 23.6 | 94 / 90 |
| PMA + IFN-γ | 4.1 / 3.7 | 44.5 / 45.5 | 88 / 88 |

Run `node tests/calibrate.cjs` to regenerate this check.

## Files

Copy these into the `thp1-plasma-flow` repo, keeping the paths:

```
site/sim.html                                   the page (served at /sim)
site/sim/engine.js                              biology + cytometer model, gating, compensation, FCS writer
site/sim/ui.js                                  page logic, plots, Supabase notebook
site/sim/sim.css                                styles (same palette as the E1 explorer)
supabase/migrations/20261018_virtual_bench.sql  two tables + row-level security
tests/calibrate.cjs                             compares the model with the 12 Oct measurements
tests/scenarios.cjs                             runs the five built-in scenarios
netlify.toml                                    adds the /sim redirect (merge with yours)
```

The page reuses the existing `site/config.js` (`window.E1_CONFIG`), so it talks to the same Supabase project as the gate presets.

## Set it up with Cursor

1. **Open the repo in Cursor.** File › Open Folder › `thp1-plasma-flow`.
2. **Add the files.** Unzip this package into the repo root so the paths above line up. If Cursor asks about `netlify.toml`, keep your file and add this block:
   ```toml
   [[redirects]]
     from = "/sim"
     to = "/sim.html"
     status = 200
   ```
3. **Link it from the explorer.** In `site/index.html`, inside `<div class="header-links">`, add:
   ```html
   <a href="sim.html">Virtual bench</a>
   ```
4. **Create the Supabase tables.** In Supabase › SQL Editor, paste `supabase/migrations/20261018_virtual_bench.sql` and run it. With the Supabase CLI linked to the project, `supabase db push` does the same.
5. **Test locally.**
   ```bash
   cd site
   python -m http.server 8766
   ```
   Then open http://127.0.0.1:8766/sim.html. The pill on the Lab notebook card should say **Connected**.
6. **Check the model** (needs Node 18 or later).
   ```bash
   node tests/calibrate.cjs
   node tests/scenarios.cjs
   ```
7. **Deploy.** Commit and push. Netlify already publishes `site/`, so the bench appears at `https://thp1-plasma-flow.netlify.app/sim`.

### Useful Cursor prompts for later

- "In site/sim/engine.js, add a third marker channel (AF488 for C3) with its own spillover row and FMO, following how BV786/HLA-DR is done."
- "Add an IFN-γ time-course preset (24, 48, 72 h) to PRESETS in site/sim/ui.js."
- "Read sim_real_outcomes from Supabase and show a scatter of predicted vs measured live % across all saved runs."
- "Add Supabase Auth so only lab members can insert rows; update the RLS policies in a new migration."

## How to use it before a real experiment

1. Pick **Start from › As run on 12 Oct 2026** and confirm that the numbers in brackets match.
2. Change one thing, for example the PMA dose, wash and rest, IFN-γ timing or detachment method. Press **Run virtual experiment**.
3. Read the **Pre-flight check**. Anything marked *Fix first* means the real run would give data you cannot interpret.
4. Use **Why cells died** to see which step the model blames. Use **Colour by true cell state** in the tube viewer to see which events the gates misclassify.
5. Save the plan to the **Lab notebook**.
6. After the real run, record the measured live %, HLA-DR⁺ % and CD11b⁺ % against it. The comparison table shows where the model was right or wrong.

The built-in scenarios replay the problems seen so far:
- 29 Sep: controls acquired at different voltages;
- 4 Oct: antibody staining failed;
- 12 Oct: the FlowJo live gate let PI-dim cells in.

## What the model contains

**Biology** (`condition()` in engine.js). Death is modelled as a sum of hazards, one per cause:
- handling baseline;
- PMA in culture (depends on dose and time, reduced by washing it out);
- detachment method;
- pooled floating cells;
- IFN-γ alone;
- IFN-γ on PMA-activated cells (depends on dose and timing, much smaller after washout and rest);
- seeding density, serum, passage number and mycoplasma.

Culture causes produce more PI-dim (slowly dying) cells, and mechanical causes produce more PI-bright cells.

CD11b rises with PMA. HLA-DR is modelled as a responder fraction that rises with IFN-γ and PMA. Dying cells pick up non-specific BV786 and PE-Cy7 signal, which reproduces the 12 Oct FMO artefact. C1R is a bright HLA-DR⁺ control.

**Instrument** (`simulateTube()`). The instrument model has:
- five detectors, with gain proportional to voltage⁷ (k = 7.07 was measured from the 29 Sep SSC change);
- the 12 Oct spillover matrix, rescaled whenever voltages change;
- electronic and photon noise, which creates spillover spreading;
- saturation at 262,143 and an FSC threshold.

Compensation is measured from simulated single stains, exactly as DIVA or FlowJo do it. If controls are run at other voltages, the matrix is wrong in the same way it would be in reality.

**Gating** follows the E2 analysis:
- cells gate on FSC-A/SSC-A;
- singlets by FSC-H/FSC-A ratio;
- live = PI < 1,000;
- HLA-DR⁺ and CD11b⁺ cut-offs = the 99th percentile of the matching FMO's strictly live cells.

## Limits

The coefficients are estimates fitted to four runs from one lab (7 Sep, 29 Sep, 4 Oct and 12 Oct 2026), not published constants. Predictions far outside those conditions are informed guesses, for example very low PMA doses or long IFN-γ time courses. The simulator is meant to choose what to test and to catch design mistakes before the bench. The real experiment decides what is true. Every real result you record in the notebook is data for re-fitting the model.

The Supabase policies let anyone with the site read and insert rows, the same as the existing gate presets. Add Supabase Auth before making the site widely public.
