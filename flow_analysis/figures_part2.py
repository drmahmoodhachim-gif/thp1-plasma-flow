"""
figures_part2.py - figures 6-9 + S1 (300 dpi), using the RECOMMENDED gating.

  fig6_dose_response.png        viability vs % plasma, Wilson 95% CI, linear trend
  fig7_composition.png          what each tube contains (live/dead/doublets/plasma)
  fig8_granularity.png          SSC of live cells vs dose (bootstrap 95% CI)
  fig9_new_gating.png           recommended 3-step gating, 5 key samples
  figS1_new_gating_all_a/b.png  recommended gating, all 10 samples
"""
import os
import numpy as np
from scipy import stats
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter
import config as C
import flowdata as F
from plotstyle import plt, k_axis, draw_polygon, logicle_yaxis, save


def _xpos(k):
    """x position for a dose point; first/repeat tubes nudged apart."""
    x = C.DOSE[k]
    if k in C.REPEAT_TUBES:
        return x + 1.4
    return x - 1.4 if x in (40, 70) else x


def trend_test(gates):
    """Linear regression of tube viability (%) on % plasma. Returns dict."""
    xs, ys = [], []
    for k in C.DOSE:
        L, D = gates[k]["live"].sum(), gates[k]["dead"].sum()
        xs.append(C.DOSE[k]); ys.append(100 * L / (L + D))
    xs, ys = np.array(xs, float), np.array(ys)
    lr = stats.linregress(xs, ys)
    n = len(xs); tcrit = stats.t.ppf(0.975, n - 2)
    resid_se = np.sqrt(np.sum((ys - (lr.intercept + lr.slope * xs)) ** 2) / (n - 2))
    return dict(lr=lr, xs=xs, ys=ys, tcrit=tcrit, resid_se=resid_se,
                slope10=10 * lr.slope, ci10=(10 * (lr.slope - tcrit * lr.stderr), 10 * (lr.slope + tcrit * lr.stderr)))


def fig6(data, gates, out):
    T = trend_test(gates); lr = T["lr"]
    xx = np.linspace(0, 70, 50); yy = lr.intercept + lr.slope * xx
    band = T["tcrit"] * T["resid_se"] * np.sqrt(1 / len(T["xs"]) + (xx - T["xs"].mean()) ** 2 / np.sum((T["xs"] - T["xs"].mean()) ** 2))

    def points(ax, ms, label_values):
        for k in C.DOSE:
            L, D = gates[k]["live"].sum(), gates[k]["dead"].sum(); v = 100 * L / (L + D)
            lo, hi = F.wilson_ci(L, L + D); x = _xpos(k)
            ax.errorbar(x, v, yerr=[[v - 100 * lo], [100 * hi - v]], fmt="s" if k in C.REPEAT_TUBES else "o",
                        ms=ms, color=C.NAVY if C.DOSE[k] == 0 else C.TEAL, ecolor="#5B6573", capsize=ms / 2,
                        lw=1.5, mec="white", mew=1.5, zorder=3)
            if label_values:
                ax.annotate(f"{v:.1f}", (x, 100 * hi), textcoords="offset points", xytext=(0, 6), ha="center", fontsize=9, color="#5B6573")
        ax.fill_between(xx, yy - band, yy + band, color=C.TEAL, alpha=.12, lw=0)
        ax.plot(xx, yy, "--", color=C.TEAL, lw=1.5)

    fig, ax = plt.subplots(figsize=(8.5, 5.6))
    points(ax, 10, True)
    hk = gates["HK"]; hkv = 100 * hk["live"].sum() / (hk["live"].sum() + hk["dead"].sum())
    ax.axhline(hkv, color=C.CORAL, lw=1.5, ls=":")
    ax.text(71, 3, f"heat-killed control ({hkv:.0f}%)", color=C.CORAL, ha="right", fontsize=10)
    ax.text(2, 12, f"Trend: {T['slope10']:+.2f}% viability per +10% plasma\n"
                   f"95% CI {T['ci10'][0]:+.2f} to {T['ci10'][1]:+.2f}  ·  p = {lr.pvalue:.2f}",
            fontsize=11, color=C.NAVY, bbox=dict(fc="white", ec="#E1E5EA"))
    ins = ax.inset_axes([0.33, 0.34, 0.4, 0.36]); points(ins, 6, False)
    ins.set_ylim(85, 97.5); ins.set_xlim(-5, 75); ins.set_xticks([0, 30, 50, 70])
    ins.set_xticklabels(["0%", "30%", "50%", "70%"], fontsize=8); ins.tick_params(labelsize=8)
    ins.set_title("zoom: 85–97% (bars = 95% CI)", fontsize=9, fontweight="normal")
    ax.set_ylim(0, 100); ax.set_xlim(-5, 75)
    ax.set_xticks([0, 30, 40, 50, 60, 70]); ax.set_xticklabels(["0%", "30%", "40%", "50%", "60%", "70%"])
    ax.set_xlabel("Mouse plasma in culture"); ax.set_ylabel("Live cells (% of single cells)")
    ax.set_title("No clear trend in THP-1 viability with plasma dose")
    ax.legend(handles=[Line2D([], [], marker="o", ls="", color=C.TEAL, ms=9, label="first tube"),
                       Line2D([], [], marker="s", ls="", color=C.TEAL, ms=9, label="repeat tube"),
                       Line2D([], [], marker="o", ls="", color=C.NAVY, ms=9, label="no plasma"),
                       Line2D([], [], ls="--", color=C.TEAL, label="linear trend ± 95% CI")],
              loc="lower right", bbox_to_anchor=(1, 0.08), frameon=False, fontsize=10)
    plt.tight_layout(); save(fig, os.path.join(out, "fig6_dose_response.png"))
    return T


def fig7(data, gates, out):
    names = list(C.SAMPLES); labs = [C.pretty(n) for n in names]
    parts = {"Live cells": [], "Dead cells": [], "Doublets": [], "Plasma particles / debris": []}
    for k in names:
        g = gates[k]; n = len(data[k][C.FSC_A])
        parts["Live cells"].append(100 * g["live"].sum() / n)
        parts["Dead cells"].append(100 * g["dead"].sum() / n)
        parts["Doublets"].append(100 * (g["cells"] & ~g["singlets"]).sum() / n)
        parts["Plasma particles / debris"].append(100 * (~g["cells"]).sum() / n)
    cols = {"Live cells": C.TEAL, "Dead cells": C.CORAL, "Doublets": C.PURPLE, "Plasma particles / debris": "#D9DEE5"}
    fig, ax = plt.subplots(figsize=(13, 5.2)); bottom = np.zeros(len(names))
    for part, vals in parts.items():
        v = np.array(vals)
        ax.bar(labs, v, bottom=bottom, color=cols[part], label=part, width=0.7, edgecolor="white", lw=0.6)
        for i, (b, val) in enumerate(zip(bottom, v)):
            if val >= 4:
                ax.text(i, b + val / 2, f"{val:.0f}%", ha="center", va="center", fontsize=9, fontweight="bold",
                        color="#5B6573" if part.startswith("Plasma") else "white")
        bottom += v
    for i, k in enumerate(names):
        ax.text(i, 101.5, f"n={len(data[k][C.FSC_A]):,}", ha="center", fontsize=8.5, color="#5B6573")
    ax.set_ylim(0, 106); ax.set_ylabel("% of all recorded events")
    ax.set_title("What is inside each tube? Plasma particles crowd out the cells as dose rises", pad=16)
    ax.legend(ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.1), frameon=False, fontsize=11)
    plt.tight_layout(); save(fig, os.path.join(out, "fig7_composition.png"))


def fig8(data, gates, out):
    fig, ax = plt.subplots(1, 2, figsize=(13, 5), gridspec_kw={"width_ratios": [1, 1.15]})
    bins = np.linspace(0, C.SCALE_MAX, 70)
    for k, c, lab in [("Unstained", "#8A94A6", "Unstained (no dye, no plasma)"), ("0%", C.NAVY, "0% plasma"),
                      ("50%", C.PURPLE, "50% plasma"), ("70%", C.TEAL, "70% plasma")]:
        ss = data[k][C.SSC_A][gates[k]["live"]]
        ax[0].hist(ss, bins=bins, density=True, histtype="step", lw=2, color=c, label=lab)
        ax[0].axvline(np.median(ss), color=c, ls=":", lw=1.2)
    ax[0].set_xlabel("SSC-A of live cells (granularity)"); ax[0].set_ylabel("Relative frequency")
    k_axis(ax[0], y=False); ax[0].set_yticks([]); ax[0].legend(frameon=False, fontsize=9.5, loc="upper right")
    ax[0].set_title("Live-cell granularity")
    for k in ["Unstained"] + list(C.DOSE):
        ss = data[k][C.SSC_A][gates[k]["live"]]; m = np.median(ss); lo, hi = F.bootstrap_median_ci(ss)
        x = -12 if k == "Unstained" else _xpos(k)
        col = "#8A94A6" if k == "Unstained" else (C.NAVY if k == "0%" else C.TEAL)
        ax[1].errorbar(x, m, yerr=[[m - lo], [hi - m]], fmt="s" if k in C.REPEAT_TUBES else "o", ms=9,
                       color=col, ecolor="#5B6573", capsize=4, mec="white", mew=1.2)
        below = k in C.REPEAT_TUBES
        ax[1].annotate(C.ACQ_TIME[k], (x, lo if below else hi), textcoords="offset points",
                       xytext=(0, -12 if below else 5), ha="center", fontsize=8, color="#5B6573")
    ax[1].set_xticks([-12, 0, 30, 40, 50, 60, 70]); ax[1].set_xticklabels(["Unst.", "0%", "30%", "40%", "50%", "60%", "70%"])
    ax[1].set_xlabel("Mouse plasma in culture   (grey labels = time acquired)")
    ax[1].set_ylabel("Median SSC-A of live cells ± 95% CI")
    ax[1].yaxis.set_major_formatter(FuncFormatter(lambda v, p: f"{v/1000:.0f}k"))
    ax[1].set_title("Rises with dose, but the two no-plasma tubes disagree")
    plt.tight_layout(); save(fig, os.path.join(out, "fig8_granularity.png"))


def gating_grid(data, gates, samples, path):
    fig, ax = plt.subplots(3, len(samples), figsize=(15, 9.6))
    lo, hi = C.SINGLET_RATIO
    for j, k in enumerate(samples):
        d = data[k]; g = gates[k]
        fa, fh, ss, dye = d[C.FSC_A], d[C.FSC_H], d[C.SSC_A], d[C.DYE]
        nm = {"HK": "Heat-killed", "Unstained": "Unstained"}.get(k, C.pretty(k) + " plasma")
        a = ax[0, j]
        a.hexbin(fa, np.minimum(ss, 262000), gridsize=110, bins="log", cmap="viridis", mincnt=1,
                 extent=(0, C.SCALE_MAX, 0, C.SCALE_MAX), linewidths=0)
        draw_polygon(a, [(x, min(y, C.SCALE_MAX)) for x, y in C.REC_ALL_CELLS], C.CORAL)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, C.SCALE_MAX); k_axis(a)
        a.set_title(f"{nm}\n1 · All cells: {100*g['cells'].mean():.1f}%", fontsize=10.5)
        a = ax[1, j]; c = g["cells"]
        a.scatter(fa[c], fh[c], s=2, c=C.NAVY, alpha=.4, lw=0, rasterized=True)
        xs = np.array([60000, C.SCALE_MAX])
        a.plot(xs, lo * xs, c=C.CORAL, lw=2); a.plot(xs, hi * xs, c=C.CORAL, lw=2)
        a.plot([60000, 60000], [lo * 60000, hi * 60000], c=C.CORAL, lw=2)
        a.set_xlim(0, C.SCALE_MAX); a.set_ylim(0, C.SCALE_MAX); k_axis(a)
        a.set_title(f"2 · Singlets: {100*g['singlets'].sum()/max(c.sum(),1):.1f}%", fontsize=10.5)
        a = ax[2, j]; s = g["singlets"]; pos = dye > C.DYE_CUTOFF
        a.scatter(fa[s & ~pos], F.logicle(dye[s & ~pos]), s=3, c=C.TEAL, alpha=.5, lw=0, rasterized=True)
        a.scatter(fa[s & pos], F.logicle(dye[s & pos]), s=4, c=C.CORAL, alpha=.7, lw=0, rasterized=True)
        a.axhline(F.logicle([C.DYE_CUTOFF])[0], c=C.NAVY, lw=1.5, ls="--")
        a.set_xlim(0, C.SCALE_MAX); logicle_yaxis(a); k_axis(a, y=False)
        L, D = g["live"].sum(), g["dead"].sum()
        a.set_title(f"3 · Live {100*L/max(L+D,1):.1f}% · Dead {100*D/max(L+D,1):.1f}%", fontsize=10.5)
        if j == 0:
            ax[0, j].set_ylabel("SSC-A"); ax[1, j].set_ylabel("FSC-H"); ax[2, j].set_ylabel("APC-Cy7-A (dye)")
        for i in range(3):
            ax[i, j].set_xlabel("FSC-A", fontsize=9)
    plt.tight_layout(); save(fig, path)


def make(data, out):
    gates = {k: F.recommended_gating(d) for k, d in data.items()}
    T = fig6(data, gates, out)
    fig7(data, gates, out)
    fig8(data, gates, out)
    names = list(C.SAMPLES)
    gating_grid(data, gates, ["Unstained", "0%", "50%", "70% (002)", "HK"], os.path.join(out, "fig9_new_gating.png"))
    gating_grid(data, gates, names[:5], os.path.join(out, "figS1_new_gating_all_a.png"))
    gating_grid(data, gates, names[5:], os.path.join(out, "figS1_new_gating_all_b.png"))
    return T
