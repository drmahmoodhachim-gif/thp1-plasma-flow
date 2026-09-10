"""
tables.py - numeric outputs as CSV.

  table1_original_gating.csv      FlowJo hierarchy reproduced + simple extra metrics
  table2_event_rates.csv          events per second (plasma particles vs cells), flow stability
  table3_recommended_gating.csv   viability with Wilson 95% CI, composition, live-cell medians
  table4_trend_test.csv           linear trend of viability vs % plasma
"""
import os, csv
import numpy as np
import config as C
import flowdata as F


def _write(rows, path):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
    print("  wrote", path)


def table1(data, out):
    rows = []
    for k, d in data.items():
        g = F.original_gating(d); t, s, l = g["thp"], g["singlets"], g["live"]
        fa, ss, dye = d[C.FSC_A], d[C.SSC_A], d[C.DYE]
        cellsized = fa > C.SMALL_FSC
        rows.append(dict(
            sample=k, events=len(fa),
            THP_pct_of_total=round(100 * t.mean(), 1),
            singlets_pct_of_THP=round(100 * s.sum() / max(t.sum(), 1), 1),
            live_pct_of_singlets=round(100 * l.sum() / max(s.sum(), 1), 1),
            live_n=int(l.sum()),
            cellsized_pct_of_total=round(100 * cellsized.mean(), 1),
            dye_pos_pct_of_cellsized=round(100 * (dye[cellsized] > C.DYE_CUTOFF).mean(), 1),
            SSC_saturated_pct=round(100 * (ss >= 262000).mean(), 1),
            median_dye_singlets=round(float(np.median(dye[s])), 0) if s.sum() else ""))
    _write(rows, os.path.join(out, "table1_original_gating.csv"))


def table2(data, meta, out):
    rows = []
    for k, d in data.items():
        dur = F.acquisition_seconds(d, meta[k])
        fa, dye = d[C.FSC_A], d[C.DYE]
        thp = F.original_gating(d)["thp"]
        small, cell = fa < C.SMALL_FSC, fa >= C.SMALL_FSC
        # flow stability: coefficient of variation of counts in 10 equal time bins
        counts = np.histogram(d[C.TIME], 10)[0]
        rows.append(dict(
            sample=k, acquired=meta[k].get("btim"), duration_s=round(dur, 0),
            events_per_s=round(len(fa) / dur, 0),
            THP_gate_per_s=round(thp.sum() / dur, 1),
            small_particles_per_s=round(small.sum() / dur, 0),
            cellsized_per_s=round(cell.sum() / dur, 1),
            dye_pos_cellsized_per_s=round((cell & (dye > C.DYE_CUTOFF)).sum() / dur, 2),
            rate_CV_pct_10_time_bins=round(100 * counts.std() / counts.mean(), 1)))
    _write(rows, os.path.join(out, "table2_event_rates.csv"))


def table3(data, out):
    rows = []
    for k, d in data.items():
        g = F.recommended_gating(d); L, D = int(g["live"].sum()), int(g["dead"].sum()); n = len(d[C.FSC_A])
        lo, hi = F.wilson_ci(L, L + D)
        live = g["live"]
        rows.append(dict(
            sample=k, total_events=n, all_cells=int(g["cells"].sum()), singlets=int(g["singlets"].sum()),
            live=L, dead=D, viability_pct=round(100 * L / max(L + D, 1), 1),
            ci95_low=round(100 * lo, 1), ci95_high=round(100 * hi, 1),
            pct_events_plasma_debris=round(100 * (~g["cells"]).mean(), 1),
            pct_events_doublets=round(100 * (g["cells"] & ~g["singlets"]).mean(), 1),
            median_SSC_live=int(np.median(d[C.SSC_A][live])) if L else "",
            median_FSC_live=int(np.median(d[C.FSC_A][live])) if L else "",
            median_dye_live=round(float(np.median(d[C.DYE][live])), 1) if L else ""))
    _write(rows, os.path.join(out, "table3_recommended_gating.csv"))


def table4(T, out):
    lr = T["lr"]
    _write([dict(model="viability_pct ~ plasma_pct (OLS, 8 tubes)",
                 slope_per_10pct=round(T["slope10"], 3), ci95_low=round(T["ci10"][0], 3),
                 ci95_high=round(T["ci10"][1], 3), intercept=round(lr.intercept, 2),
                 r_squared=round(lr.rvalue ** 2, 3), p_value=round(lr.pvalue, 3), n_tubes=len(T["xs"]))],
           os.path.join(out, "table4_trend_test.csv"))


def make(data, meta, out, T):
    table1(data, out); table2(data, meta, out); table3(data, out); table4(T, out)
