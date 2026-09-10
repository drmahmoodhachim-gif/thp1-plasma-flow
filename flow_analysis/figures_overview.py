"""
figures_overview.py - first-pass exploratory figures (lower resolution).

  figS0_overview_all_samples.png : every sample x every original gate step,
                                   with dye-positive events highlighted
  figS0_dye_histograms.png       : APC-Cy7 histogram overlays
"""
import os
import numpy as np
import config as C
import flowdata as F
from plotstyle import plt, draw_polygon, save


def make(data, out):
    names = list(C.SAMPLES)
    fig, ax = plt.subplots(len(names), 4, figsize=(17, 3.3 * len(names)))
    for r, k in enumerate(names):
        d = data[k]; g = F.original_gating(d)
        fa, fh, ss, dye = d[C.FSC_A], d[C.FSC_H], d[C.SSC_A], d[C.DYE]
        t, s, l = g["thp"], g["singlets"], g["live"]
        pos = dye > C.DYE_CUTOFF
        a = ax[r, 0]
        a.hexbin(fa, ss, gridsize=120, bins="log", cmap="jet", mincnt=1,
                 extent=(0, C.SCALE_MAX, 0, C.SCALE_MAX))
        draw_polygon(a, C.ORIG_THP, "k", 1.5)
        a.set_title(f"{k} (n={len(fa):,})\nTHP gate: {t.sum():,} ({100*t.mean():.1f}%)", fontsize=9)
        a.set_xlabel("FSC-A"); a.set_ylabel("SSC-A")
        a = ax[r, 1]
        a.scatter(fa[~pos], ss[~pos], s=1, c="lightgrey", rasterized=True)
        a.scatter(fa[pos], ss[pos], s=2, c="red", rasterized=True)
        draw_polygon(a, C.ORIG_THP, "k", 1)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, C.SCALE_MAX)
        ins = 100 * pos[t].mean() if t.sum() else 0
        a.set_title(f"APC-Cy7+ (red) = {100*pos.mean():.1f}% of all\ninside THP {ins:.1f}% | outside {100*pos[~t].mean():.1f}%", fontsize=9)
        a.set_xlabel("FSC-A"); a.set_ylabel("SSC-A")
        a = ax[r, 2]
        if t.sum():
            a.scatter(fa[t], fh[t], s=2, c="navy", rasterized=True)
        draw_polygon(a, C.ORIG_SINGLETS, "r", 1.5)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, C.SCALE_MAX)
        a.set_title(f"THP → Single Cells: {s.sum():,} ({100*s.sum()/max(t.sum(),1):.1f}%)", fontsize=9)
        a.set_xlabel("FSC-A"); a.set_ylabel("FSC-H")
        a = ax[r, 3]
        if s.sum():
            a.scatter(fa[s], F.logicle(dye[s]), s=3, c="navy", rasterized=True)
        draw_polygon(a, C.ORIG_LIVE, "g", 1.5, F.logicle)
        a.set_yticks(F.logicle(F.LOGICLE_TICKS)); a.set_yticklabels(F.LOGICLE_LABELS)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(F.logicle([-2000, C.SCALE_MAX]))
        a.set_title(f"Singlets → APC-Cy7⁻: {l.sum():,} ({100*l.sum()/max(s.sum(),1):.1f}%)", fontsize=9)
        a.set_xlabel("FSC-A"); a.set_ylabel("APC-Cy7-A")
    plt.tight_layout(); save(fig, os.path.join(out, "figS0_overview_all_samples.png"))

    fig, ax = plt.subplots(1, 2, figsize=(13, 4.5))
    cols = plt.cm.viridis(np.linspace(0, 0.95, len(names)))
    bins = np.linspace(F.logicle([-2000])[0], 1, 150)
    for c, k in zip(cols, names):
        d = data[k]; dye = d[C.DYE]
        col = "k" if k == "Unstained" else ("red" if k == "HK" else c)
        lw = 1.6 if k in ("Unstained", "HK") else 1
        m = d[C.FSC_A] > 30000
        ax[0].hist(F.logicle(dye[m]), bins=bins, density=True, histtype="step", lw=lw, label=k, color=col)
        s = F.original_gating(d)["singlets"]
        if s.sum() > 50:
            ax[1].hist(F.logicle(dye[s]), bins=bins, density=True, histtype="step", lw=lw, label=k, color=col)
    for a, tt in zip(ax, ["All events with FSC-A > 30k", "THP → Single Cells"]):
        a.set_xticks(F.logicle(F.LOGICLE_TICKS)); a.set_xticklabels(F.LOGICLE_LABELS)
        a.axvline(F.logicle([C.DYE_CUTOFF])[0], ls="--", c="grey")
        a.set_title(tt); a.set_xlabel("APC-Cy7-A"); a.legend(fontsize=7)
    plt.tight_layout(); save(fig, os.path.join(out, "figS0_dye_histograms.png"))
