"""
figures_part1.py - figures 1-5 (300 dpi): what the ORIGINAL gating shows and why
it over-estimates viability.

  fig1_gating.png            original 3-step FlowJo gating, 0% vs 70% (repeat)
  fig2_hidden_dead.png       dye-positive events inside vs outside the THP gate
  fig3_plasma_particles.png  plasma-particle cloud at 0 / 50 / 70% plasma
  fig4_dye.png               dye histograms + median dye signal of live cells
  fig5_singlets.png          current singlet gate vs a wider band
"""
import os
import numpy as np
import config as C
import flowdata as F
from plotstyle import plt, k_axis, draw_polygon, logicle_yaxis, logicle_xaxis, save


def fig1(data, out):
    fig, ax = plt.subplots(2, 3, figsize=(13, 8.2))
    for r, k in enumerate(["0%", "70% (002)"]):
        d = data[k]; g = F.original_gating(d)
        fa, fh, ss, dye = d[C.FSC_A], d[C.FSC_H], d[C.SSC_A], d[C.DYE]
        t, s, l = g["thp"], g["singlets"], g["live"]
        a = ax[r, 0]
        a.hexbin(fa, ss, gridsize=150, bins="log", cmap="viridis", mincnt=1,
                 extent=(0, C.SCALE_MAX, 0, C.SCALE_MAX), linewidths=0)
        draw_polygon(a, C.ORIG_THP)
        nm = k.replace(" (002)", " repeat")
        a.set_title(f"{nm} plasma · Step 1: THP-1 cells\n{t.sum():,} of {len(fa):,} events ({100*t.mean():.1f}%)", fontsize=11)
        a.set_xlabel("FSC-A (size)"); a.set_ylabel("SSC-A (granularity)"); k_axis(a)
        a = ax[r, 1]
        a.scatter(fa[t], fh[t], s=3, c=C.NAVY, alpha=.5, lw=0, rasterized=True)
        draw_polygon(a, C.ORIG_SINGLETS, C.CORAL)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, C.SCALE_MAX); k_axis(a)
        a.set_title(f"Step 2: single cells\n{s.sum():,} of {t.sum():,} ({100*s.sum()/t.sum():.1f}%)", fontsize=11)
        a.set_xlabel("FSC-A"); a.set_ylabel("FSC-H")
        a = ax[r, 2]
        a.scatter(fa[s], F.logicle(dye[s]), s=4, c=C.TEAL, alpha=.6, lw=0, rasterized=True)
        draw_polygon(a, C.ORIG_LIVE, C.NAVY, ytransform=F.logicle)
        logicle_yaxis(a); a.set_xlim(0, C.SCALE_MAX); k_axis(a, y=False)
        a.set_title(f"Step 3: dye-negative (live)\n{l.sum():,} of {s.sum():,} ({100*l.sum()/s.sum():.1f}%)", fontsize=11)
        a.set_xlabel("FSC-A"); a.set_ylabel("APC-Cy7-A (viability dye)")
    plt.tight_layout(); save(fig, os.path.join(out, "fig1_gating.png"))


def fig2(data, out):
    fig, ax = plt.subplots(1, 3, figsize=(14, 4.8))
    names = {"0%": "0% plasma", "70% (002)": "70% plasma", "HK": "Heat-killed control"}
    for a, k in zip(ax, names):
        d = data[k]; t = F.original_gating(d)["thp"]
        fa, ss = d[C.FSC_A], d[C.SSC_A]; pos = d[C.DYE] > C.DYE_CUTOFF
        a.scatter(fa[~pos], ss[~pos], s=2, c=C.GREY, lw=0, rasterized=True, label="dye-negative (live)")
        a.scatter(fa[pos], ss[pos], s=6, c=C.CORAL, lw=0, rasterized=True, label="dye-positive (dead cells / fragments)")
        draw_polygon(a, C.ORIG_THP)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, 265000); k_axis(a)
        a.set_title(f"{names[k]}\ndye+ events: {(pos&t).sum():,} inside gate · {(pos&~t).sum():,} outside", fontsize=10.5)
        a.set_xlabel("FSC-A (size)"); a.set_ylabel("SSC-A (granularity)")
    h, lb = ax[0].get_legend_handles_labels()
    fig.legend(h, lb, loc="lower center", ncol=3, markerscale=4, frameon=False, fontsize=11)
    plt.tight_layout(rect=(0, 0.07, 1, 1)); save(fig, os.path.join(out, "fig2_hidden_dead.png"))


def fig3(data, out):
    fig, ax = plt.subplots(1, 3, figsize=(14, 4.8))
    for a, k in zip(ax, ["0%", "50%", "70% (002)"]):
        d = data[k]; fa, ss = d[C.FSC_A], d[C.SSC_A]
        a.hexbin(fa, ss, gridsize=150, bins="log", cmap="viridis", mincnt=1,
                 extent=(0, C.SCALE_MAX, 0, C.SCALE_MAX), linewidths=0)
        draw_polygon(a, C.ORIG_THP); k_axis(a)
        small = 100 * (fa < C.SMALL_FSC).mean()
        a.set_title(f"{k.replace(' (002)', '')} plasma\nsmall particles = {small:.0f}% of events", fontsize=11)
        a.set_xlabel("FSC-A (size)"); a.set_ylabel("SSC-A (granularity)")
        a.add_patch(plt.Rectangle((0, 0), C.SMALL_FSC, 90000, fill=False, ec=C.CORAL, lw=2, ls="--"))
    plt.tight_layout(); save(fig, os.path.join(out, "fig3_plasma_particles.png"))


def fig4(data, out):
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.8), gridspec_kw={"width_ratios": [1.5, 1]})
    show = [("Unstained", "#8A94A6", 2), ("0%", C.NAVY, 2), ("50%", C.PURPLE, 1.6),
            ("70% (002)", C.TEAL, 2), ("HK", C.CORAL, 2.4)]
    bins = np.linspace(F.logicle([-2000])[0], 1, 160)
    for k, c, lw in show:
        d = data[k]; m = d[C.FSC_A] > C.SMALL_FSC
        lab = {"HK": "Heat-killed", "Unstained": "Unstained"}.get(k, k.replace(" (002)", "") + " plasma")
        ax[0].hist(F.logicle(d[C.DYE][m]), bins=bins, density=True, histtype="step", lw=lw, color=c, label=lab)
    ax[0].axvline(F.logicle([C.DYE_CUTOFF])[0], ls="--", c="k", lw=1)
    ax[0].text(F.logicle([600])[0], 19, "live | dead\ncut-off", fontsize=9)
    logicle_xaxis(ax[0]); ax[0].set_xlabel("APC-Cy7-A (viability dye)"); ax[0].set_ylabel("Relative frequency")
    ax[0].set_title("Dye brightness: live cells left, dead cells right"); ax[0].legend(frameon=False, fontsize=9)
    names = [k for k in C.SAMPLES if k != "HK"]
    meds = [np.median(data[k][C.DYE][F.original_gating(data[k])["live"]]) for k in names]
    cols = ["#8A94A6", C.NAVY] + [C.TEAL] * (len(names) - 2)
    ax[1].bar([C.pretty(n) for n in names], meds, color=cols)
    for i, m in enumerate(meds):
        ax[1].text(i, m + 2, f"{m:.0f}", ha="center", fontsize=9)
    ax[1].set_ylabel("Median dye signal of LIVE cells"); ax[1].set_title("Live cells get slightly brighter in plasma")
    plt.setp(ax[1].get_xticklabels(), rotation=40, ha="right")
    plt.tight_layout(); save(fig, os.path.join(out, "fig4_dye.png"))


def fig5(data, out):
    fig, ax = plt.subplots(1, 2, figsize=(12, 5))
    lo, hi = C.SINGLET_RATIO
    for a, k in zip(ax, ["0%", "30%"]):
        d = data[k]; g = F.original_gating(d); t, s = g["thp"], g["singlets"]
        fa, fh = d[C.FSC_A], d[C.FSC_H]
        wider = t & F.singlet_band(d)
        a.scatter(fa[t & ~s], fh[t & ~s], s=5, c=C.CORAL, lw=0, alpha=.6, rasterized=True, label="excluded by current gate")
        a.scatter(fa[s], fh[s], s=5, c=C.TEAL, lw=0, alpha=.6, rasterized=True, label="kept by current gate")
        draw_polygon(a, C.ORIG_SINGLETS)
        xs = np.array([60000, C.SCALE_MAX])
        a.plot(xs, lo * xs, c=C.PURPLE, ls="--", lw=2, label="suggested wider gate"); a.plot(xs, hi * xs, c=C.PURPLE, ls="--", lw=2)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, C.SCALE_MAX); k_axis(a)
        a.set_title(f"{k} plasma: current gate keeps {100*s.sum()/t.sum():.0f}%\nwider gate would keep {100*wider.sum()/t.sum():.0f}%", fontsize=11)
        a.set_xlabel("FSC-A"); a.set_ylabel("FSC-H")
    ax[0].legend(frameon=False, fontsize=9, markerscale=3, loc="upper left")
    plt.tight_layout(); save(fig, os.path.join(out, "fig5_singlets.png"))


def make(data, out):
    for f in (fig1, fig2, fig3, fig4, fig5):
        f(data, out)
