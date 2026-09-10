"""
figures_fancy.py - presentation-grade "fancy" figures (300 dpi) + an interactive 3D explorer.

  fig10_summary_panel.png      publication-style multi-panel figure (A-F)
  fig11_ridgeline.png          ridgeline of viability-dye intensity, every tube
  fig12_density_difference.png where events gain/lose density: 70% vs 0% plasma
  fig13_gating_funnel.png      events surviving each gate, log scale, every tube
  fig14_jointplot.png          live-cell size vs granularity, 0% vs 70%, with marginals
  fig15_viability_donuts.png   small-multiple donuts of live/dead per tube
  fig16_debris_evidence.png    evidence that small events are plasma particles, not dead cells
  interactive_3d_explorer.html rotate/zoom FSC x SSC x dye in 3D, switch tubes
"""
import os, json
import numpy as np
from scipy import stats, ndimage
from matplotlib.colors import SymLogNorm, LinearSegmentedColormap
from matplotlib.patches import Wedge
import config as C
import flowdata as F
from plotstyle import plt, k_axis, draw_polygon, save
import figures_part2 as P2

MUTED = "#5B6573"
CMAP_FLOW = LinearSegmentedColormap.from_list("flow", ["#F4F7FB", "#9FD8CF", "#17A398", "#1B2A41", "#E4572E"])
DOSE_CMAP = LinearSegmentedColormap.from_list("dose", ["#1B2A41", "#17A398", "#C8961E"])


def _letter(ax, s):
    ax.text(-0.13, 1.06, s, transform=ax.transAxes, fontsize=18, fontweight="bold", color=C.NAVY, va="bottom")


def _viab(g):
    L, D = g["live"].sum(), g["dead"].sum()
    return 100 * L / max(L + D, 1), L, D


# --------------------------------------------------------------------------- A
def fig10(data, meta, gates, out):
    fig = plt.figure(figsize=(16, 9.6))
    gs = fig.add_gridspec(2, 3, hspace=0.42, wspace=0.28)
    # A, B pseudocolour with recommended gate
    for i, (k, t) in enumerate([("0%", "0% plasma"), ("70% (002)", "70% plasma")]):
        ax = fig.add_subplot(gs[0, i]); d = data[k]
        ax.hexbin(d[C.FSC_A], np.minimum(d[C.SSC_A], 262000), gridsize=130, bins="log", cmap="turbo",
                  mincnt=1, extent=(0, C.SCALE_MAX, 0, C.SCALE_MAX), linewidths=0)
        draw_polygon(ax, [(x, min(y, C.SCALE_MAX)) for x, y in C.REC_ALL_CELLS], "white", lw=2.5)
        draw_polygon(ax, [(x, min(y, C.SCALE_MAX)) for x, y in C.REC_ALL_CELLS], C.NAVY, lw=1.2)
        ax.set_xlim(0, C.SCALE_MAX); ax.set_ylim(0, C.SCALE_MAX); k_axis(ax)
        ax.set_facecolor("#F4F7FB")
        ax.set_title(f"{t}: {100*gates[k]['cells'].mean():.1f}% of events are cells", fontsize=12)
        ax.set_xlabel("FSC-A (size)"); ax.set_ylabel("SSC-A (granularity)"); _letter(ax, "AB"[i])
    # C dye distribution: live vs HK
    ax = fig.add_subplot(gs[0, 2]); bins = np.linspace(F.logicle([-1500])[0], 1, 140)
    for k, c, lab in [("0%", C.NAVY, "0% plasma"), ("70% (002)", C.TEAL, "70% plasma"), ("HK", C.CORAL, "Heat-killed")]:
        v = F.logicle(data[k][C.DYE][gates[k]["singlets"]])
        h, e = np.histogram(v, bins, density=True); h = ndimage.gaussian_filter1d(h, 1.2)
        ax.fill_between(e[:-1], h, color=c, alpha=.25, step="post"); ax.plot(e[:-1], h, color=c, lw=1.8, label=lab, drawstyle="steps-post")
    ax.axvline(F.logicle([C.DYE_CUTOFF])[0], color="k", ls="--", lw=1)
    ax.set_xticks(F.logicle(F.LOGICLE_TICKS)); ax.set_xticklabels(F.LOGICLE_LABELS)
    ax.set_yticks([]); ax.set_xlabel("Viability dye (APC-Cy7-A)"); ax.set_title("Live and dead cells separate cleanly", fontsize=12)
    ax.legend(frameon=False, fontsize=10); _letter(ax, "C")
    # D event rates (log)
    ax = fig.add_subplot(gs[1, 0]); ks = list(C.DOSE); x = np.arange(len(ks))
    sm, ce = [], []
    for k in ks:
        d = data[k]; dur = F.acquisition_seconds(d, meta[k])
        sm.append((~gates[k]["cells"]).sum() / dur); ce.append(gates[k]["singlets"].sum() / dur)
    ax.bar(x - 0.2, sm, 0.4, color="#C9CED6", label="plasma particles / debris")
    ax.bar(x + 0.2, ce, 0.4, color=C.TEAL, label="single cells")
    ax.set_yscale("log"); ax.set_xticks(x); ax.set_xticklabels([C.pretty(k) for k in ks], rotation=35, ha="right")
    ax.set_ylabel("Events per second (log)"); ax.set_title("Particles rise ~100×; no downward trend in cells", fontsize=12)
    ax.legend(frameon=False, fontsize=9.5, loc="upper left"); _letter(ax, "D")
    # E dose-response
    ax = fig.add_subplot(gs[1, 1]); T = P2.trend_test(gates); lr = T["lr"]
    xx = np.linspace(0, 70, 50); yy = lr.intercept + lr.slope * xx
    band = T["tcrit"] * T["resid_se"] * np.sqrt(1 / 8 + (xx - T["xs"].mean()) ** 2 / np.sum((T["xs"] - T["xs"].mean()) ** 2))
    ax.fill_between(xx, yy - band, yy + band, color=C.TEAL, alpha=.15, lw=0); ax.plot(xx, yy, "--", color=C.TEAL)
    for k in C.DOSE:
        v, L, D = _viab(gates[k]); lo, hi = F.wilson_ci(L, L + D)
        ax.errorbar(P2._xpos(k), v, yerr=[[v - 100 * lo], [100 * hi - v]], fmt="s" if k in C.REPEAT_TUBES else "o",
                    ms=8, color=C.NAVY if k == "0%" else C.TEAL, ecolor=MUTED, capsize=3, mec="white")
    ax.set_ylim(80, 100); ax.set_xlim(-5, 75); ax.set_xticks([0, 30, 40, 50, 60, 70])
    ax.set_xticklabels(["0", "30", "40", "50", "60", "70"]); ax.set_xlabel("Mouse plasma (%)"); ax.set_ylabel("Viability (%)")
    ax.set_title(f"No dose trend (p = {lr.pvalue:.2f})", fontsize=12); _letter(ax, "E")
    # F donuts 0 vs 70
    ax = fig.add_subplot(gs[1, 2]); ax.set_xlim(0, 2.2); ax.set_ylim(0, 1.2); ax.axis("off"); ax.set_aspect("equal")
    for i, (ks, lab) in enumerate([(["0%"], "0% plasma"), (["70%", "70% (002)"], "70% plasma (2 tubes)")]):
        L = sum(gates[k]["live"].sum() for k in ks); D = sum(gates[k]["dead"].sum() for k in ks)
        v = 100 * L / (L + D); cx = 0.55 + i * 1.1
        ax.add_patch(Wedge((cx, 0.62), 0.45, 90 - 3.6 * v, 90, width=0.14, color=C.TEAL))
        ax.add_patch(Wedge((cx, 0.62), 0.45, 90, 90 + 3.6 * (100 - v), width=0.14, color=C.CORAL))
        ax.text(cx, 0.64, f"{v:.0f}%", ha="center", va="center", fontsize=22, fontweight="bold", color=C.NAVY)
        ax.text(cx, 0.48, "alive", ha="center", va="center", fontsize=10, color=MUTED)
        ax.text(cx, 0.06, lab, ha="center", fontsize=12, fontweight="bold", color=C.NAVY)
    ax.set_title("Similar viability with or without plasma", fontsize=12); _letter(ax, "F")
    fig.suptitle("E1 · No dose-dependent loss of THP-1 viability up to 70% mouse plasma (single experiment)", fontsize=18, fontweight="bold", color=C.NAVY, y=0.99)
    save(fig, os.path.join(out, "fig10_summary_panel.png"))


# --------------------------------------------------------------------------- B
def fig11(data, gates, out):
    names = list(C.SAMPLES)[::-1]
    grid = np.linspace(F.logicle([-1500])[0], 1, 400)
    cut = F.logicle([C.DYE_CUTOFF])[0]
    fig, ax = plt.subplots(figsize=(11, 9))
    step = 1.0
    for i, k in enumerate(names):
        v = F.logicle(data[k][C.DYE][gates[k]["singlets"]])
        kde = stats.gaussian_kde(v, bw_method=0.06)(grid)
        y = np.sqrt(kde / kde.max()) * 1.7          # sqrt scale so rare dead cells are visible
        base = i * step
        col_live = "#8A94A6" if k == "Unstained" else (C.NAVY if k == "0%" else C.TEAL)
        ax.fill_between(grid, base, base + y, where=grid <= cut, color=col_live, alpha=.85, lw=0, zorder=len(names) - i)
        ax.fill_between(grid, base, base + y, where=grid >= cut, color=C.CORAL, alpha=.9, lw=0, zorder=len(names) - i)
        ax.plot(grid, base + y, color="white", lw=1.2, zorder=len(names) - i + 0.1)
        vv, L, D = _viab(gates[k])
        ax.text(-0.02, base + 0.18, {"HK": "Heat-killed"}.get(k, C.pretty(k)), ha="right", va="bottom",
                fontsize=12, fontweight="bold", color=C.NAVY, transform=ax.get_yaxis_transform())
        ax.text(1.01, base + 0.18, f"{100-vv:.1f}% dead", ha="left", va="bottom", fontsize=11,
                color=C.CORAL if k == "HK" else MUTED, transform=ax.get_yaxis_transform())
    ax.axvline(cut, color=C.NAVY, ls="--", lw=1, zorder=100)
    ax.text(cut, len(names) * step + 0.9, " live | dead ", ha="center", fontsize=10, color=C.NAVY,
            bbox=dict(fc="white", ec=C.NAVY, lw=0.8, boxstyle="round,pad=0.3"))
    ax.set_xticks(F.logicle(F.LOGICLE_TICKS)); ax.set_xticklabels(F.LOGICLE_LABELS)
    ax.set_yticks([]); ax.spines["left"].set_visible(False)
    ax.set_xlim(grid[0], 1); ax.set_ylim(-0.1, len(names) * step + 1.4)
    ax.set_xlabel("Viability dye intensity (APC-Cy7-A)")
    ax.set_title("Every tube at a glance: dye signal of single cells\n(ridge height = √density, so rare dead cells stay visible)", fontsize=13)
    plt.tight_layout(); save(fig, os.path.join(out, "fig11_ridgeline.png"))


# --------------------------------------------------------------------------- C
def fig12(data, gates, out):
    """Row 1: all events (dilution by plasma). Row 2: live cells only (shape change)."""
    edges = np.linspace(0, C.SCALE_MAX, 131)
    ext = (0, C.SCALE_MAX, 0, C.SCALE_MAX)

    def dens(keys, mask_key=None):
        fa, ss = [], []
        for k in keys:
            m = np.ones(len(data[k][C.FSC_A]), bool) if mask_key is None else gates[k][mask_key]
            fa.append(data[k][C.FSC_A][m]); ss.append(np.minimum(data[k][C.SSC_A][m], 262000))
        h, _, _ = np.histogram2d(np.concatenate(fa), np.concatenate(ss), [edges, edges])
        h = ndimage.gaussian_filter(h, 1.6)
        return h / h.sum()

    fig, ax = plt.subplots(2, 3, figsize=(16, 10.2))
    rows = [(None, "all events", "Row 1 · All events: plasma particles swamp the tube"),
            ("live", "live cells only", "Row 2 · Live cells only: the cells shift to higher granularity")]
    for r, (mk, lab, rowtitle) in enumerate(rows):
        d0, d70 = dens(["0%"], mk), dens(["70%", "70% (002)"], mk)
        diff = 100 * (d70 - d0)
        for c, (h, t) in enumerate([(d0, f"0% plasma · {lab}"), (d70, f"70% plasma · {lab}")]):
            a = ax[r, c]
            im = a.imshow(np.ma.masked_less(h.T, 1e-6), origin="lower", extent=ext, cmap=CMAP_FLOW,
                          norm=plt.matplotlib.colors.LogNorm(1e-6, 2e-2), aspect="auto", interpolation="bilinear")
            a.set_facecolor("#F4F7FB"); a.set_title(t, fontsize=11.5)
        lim = np.percentile(np.abs(diff), 99.9)
        a = ax[r, 2]
        im2 = a.imshow(diff.T, origin="lower", extent=ext, cmap="RdBu_r", vmin=-lim, vmax=lim,
                       aspect="auto", interpolation="bilinear")
        a.set_title(f"Difference (70% − 0%) · {lab}", fontsize=11.5)
        cb = fig.colorbar(im2, ax=a, fraction=0.046, pad=0.03); cb.set_label("Δ % per bin (red = more in 70%)", fontsize=9)
        for c in range(3):
            draw_polygon(ax[r, c], [(x, min(y, C.SCALE_MAX)) for x, y in C.REC_ALL_CELLS], C.NAVY, lw=1.1)
            ax[r, c].set_xlim(0, C.SCALE_MAX); ax[r, c].set_ylim(0, C.SCALE_MAX); k_axis(ax[r, c])
            ax[r, c].set_xlabel("FSC-A (size)", fontsize=10)
        ax[r, 0].set_ylabel("SSC-A (granularity)")
        ax[r, 0].text(0, 1.14, rowtitle, transform=ax[r, 0].transAxes, fontsize=13, fontweight="bold", color=C.NAVY)
    ax[0, 2].annotate("plasma particles\n(more)", xy=(35000, 30000), xytext=(120000, 215000), fontsize=10, color="#8B1E0E",
                      arrowprops=dict(arrowstyle="->", color="#8B1E0E"))
    ax[0, 2].annotate("cells: a smaller\nshare (diluted)", xy=(185000, 110000), xytext=(150000, 160000), fontsize=10, color=C.NAVY)
    ax[1, 2].annotate("grainier cells\n(more in 70%)", xy=(170000, 175000), xytext=(90000, 235000), fontsize=10, color="#8B1E0E",
                      arrowprops=dict(arrowstyle="->", color="#8B1E0E"))
    ax[1, 2].annotate("less grainy cells\n(more in 0%)", xy=(185000, 85000), xytext=(150000, 20000), fontsize=10, color=C.NAVY,
                      arrowprops=dict(arrowstyle="->", color=C.NAVY))
    cax = fig.add_axes([0.12, 0.06, 0.42, 0.013])
    cbd = fig.colorbar(im, cax=cax, orientation="horizontal"); cbd.set_label("fraction of events per bin (log scale)", fontsize=10)
    fig.suptitle("Where do the events go when plasma is added?", fontsize=16, fontweight="bold", color=C.NAVY, y=0.995)
    fig.subplots_adjust(left=0.05, right=0.93, top=0.9, bottom=0.13, wspace=0.3, hspace=0.42)
    save(fig, os.path.join(out, "fig12_density_difference.png"))


# --------------------------------------------------------------------------- D
def _spread(vals, gap):
    """Nudge label positions (log10 space) apart so they do not overlap."""
    order = np.argsort(vals); out = np.array(vals, float)
    for i in range(1, len(order)):
        a, b = order[i - 1], order[i]
        if out[b] - out[a] < gap:
            out[b] = out[a] + gap
    return out


def fig13(data, gates, out):
    stages = ["All events", "All cells", "Single cells", "Live cells"]
    fig, ax = plt.subplots(figsize=(11.5, 6.8))
    keys = list(C.SAMPLES); rows = []
    for k in keys:
        g = gates[k]
        counts = [len(data[k][C.FSC_A]), g["cells"].sum(), g["singlets"].sum(), max(g["live"].sum(), 1)]
        if k == "Unstained": col, ls = "#8A94A6", "-"
        elif k == "HK": col, ls = C.CORAL, "-"
        else: col, ls = DOSE_CMAP(C.DOSE[k] / 70), ("--" if k in C.REPEAT_TUBES else "-")
        ax.plot(range(4), counts, color=col, lw=2.4, ls=ls, marker="o", ms=7, mec="white", mew=1.2, alpha=.95, clip_on=True)
        rows.append((k, counts, col))
    ymin = 250
    # right-hand labels (skip HK, annotated separately)
    rr = [r for r in rows if r[0] != "HK"]
    pos = _spread([np.log10(r[1][-1]) for r in rr], 0.07)
    for (k, counts, col), p in zip(rr, pos):
        ax.annotate(f"{C.pretty(k)}  ({counts[-1]:,})", xy=(3, counts[-1]), xytext=(3.12, 10 ** p), va="center",
                    fontsize=9.5, color=col, fontweight="bold", arrowprops=dict(arrowstyle="-", color=col, lw=0.6))
    posl = _spread([np.log10(r[1][0]) for r in rows], 0.07)
    for (k, counts, col), p in zip(rows, posl):
        ax.annotate(f"{counts[0]:,}", xy=(0, counts[0]), xytext=(-0.12, 10 ** p), va="center", ha="right",
                    fontsize=8.5, color=col, arrowprops=dict(arrowstyle="-", color=col, lw=0.6))
    ax.annotate("Heat-killed: 1 live cell ↓\n(correctly all dead)", xy=(2.62, ymin * 1.05), fontsize=9.5,
                color=C.CORAL, fontweight="bold", ha="center", va="bottom")
    ax.set_yscale("log"); ax.set_ylim(ymin, 5e5)
    ax.set_xticks(range(4)); ax.set_xticklabels(stages, fontsize=12, fontweight="bold")
    ax.set_xlim(-0.7, 3.9); ax.set_ylabel("Events remaining (log scale)")
    for x in range(4):
        ax.axvline(x, color="#E1E5EA", lw=1, zorder=0)
    sm = plt.cm.ScalarMappable(cmap=DOSE_CMAP, norm=plt.Normalize(0, 70))
    cb = fig.colorbar(sm, ax=ax, fraction=0.03, pad=0.02); cb.set_label("% mouse plasma (dashed = repeat tube)")
    ax.set_title("The gating funnel: plasma adds events at the top,\nbut similar numbers of cells come out at the bottom", fontsize=13)
    plt.tight_layout(); save(fig, os.path.join(out, "fig13_gating_funnel.png"))


# --------------------------------------------------------------------------- E
def fig14(data, gates, out):
    fig = plt.figure(figsize=(9, 8.5))
    gs = fig.add_gridspec(4, 4, hspace=0.05, wspace=0.05)
    main = fig.add_subplot(gs[1:, :3]); top = fig.add_subplot(gs[0, :3], sharex=main); right = fig.add_subplot(gs[1:, 3], sharey=main)
    grid = np.linspace(35000, C.SCALE_MAX, 200)
    for k, col, lab in [("0%", C.NAVY, "0% plasma"), ("70%", C.TEAL, "70% plasma")]:
        l = gates[k]["live"]; fa, ss = data[k][C.FSC_A][l], data[k][C.SSC_A][l]
        keep = ss < 262000; fa, ss = fa[keep], ss[keep]
        main.scatter(fa, ss, s=4, color=col, alpha=.18, lw=0, rasterized=True)
        kde = stats.gaussian_kde(np.vstack([fa, ss]), bw_method=0.25)
        X, Y = np.meshgrid(grid, grid); Z = kde(np.vstack([X.ravel(), Y.ravel()])).reshape(X.shape)
        lv = np.quantile(Z[Z > Z.max() * 0.01], [0.5, 0.75, 0.9, 0.97])
        main.contour(X, Y, Z, levels=lv, colors=col, linewidths=[1, 1.4, 1.8, 2.2])
        for data1, axm, orient in [(fa, top, "v"), (ss, right, "h")]:
            kd = stats.gaussian_kde(data1)(grid)
            if orient == "v": axm.fill_between(grid, kd, color=col, alpha=.3); axm.plot(grid, kd, color=col, lw=2)
            else: axm.fill_betweenx(grid, kd, color=col, alpha=.3); axm.plot(kd, grid, color=col, lw=2)
            med = np.median(data1)
            (axm.axvline if orient == "v" else axm.axhline)(med, color=col, ls=":", lw=1.5)
        main.plot([], [], color=col, lw=3, label=f"{lab}: size {np.median(fa)/1000:.0f}k · granularity {np.median(ss)/1000:.0f}k")
    main.set_xticks([100000, 150000, 200000, 250000]); main.set_xticklabels(["100k", "150k", "200k", "250k"])
    main.set_yticks([50000, 100000, 150000, 200000, 250000]); main.set_yticklabels(["50k", "100k", "150k", "200k", "250k"])
    main.set_xlim(55000, C.SCALE_MAX); main.set_ylim(35000, C.SCALE_MAX)
    main.set_xlabel("FSC-A (size)"); main.set_ylabel("SSC-A (granularity)")
    main.legend(loc="lower right", frameon=True, fontsize=10)
    for a in (top, right):
        a.axis("off")
    top.set_title("Live THP-1 cells: same size, slightly grainier in plasma", fontsize=13, fontweight="bold", color=C.NAVY)
    fig.text(0.5, 0.015, "Caution: tubes were run in dose order and 0% last, so acquisition order may contribute to the shift.",
             ha="center", fontsize=9.5, color=MUTED, style="italic")
    save(fig, os.path.join(out, "fig14_jointplot.png"))


# --------------------------------------------------------------------------- F
def fig15(data, gates, out):
    keys = list(C.SAMPLES)
    fig, axs = plt.subplots(2, 5, figsize=(15, 7.6))
    for a, k in zip(axs.ravel(), keys):
        v, L, D = _viab(gates[k]); a.set_xlim(-1.1, 1.1); a.set_ylim(-1.62, 1.05); a.set_aspect("equal"); a.axis("off")
        a.add_patch(Wedge((0, 0), 1, 90 - 3.6 * v, 90, width=0.28, color=C.TEAL))
        a.add_patch(Wedge((0, 0), 1, 90, 90 + 3.6 * (100 - v), width=0.28, color=C.CORAL))
        a.text(0, 0.08, f"{v:.1f}%", ha="center", va="center", fontsize=19, fontweight="bold", color=C.NAVY)
        a.text(0, -0.28, "alive", ha="center", fontsize=10, color=MUTED)
        a.text(0, -1.22, {"HK": "Heat-killed", "Unstained": "Unstained"}.get(k, C.pretty(k) + " plasma"),
               ha="center", fontsize=12, fontweight="bold", color=C.NAVY)
        a.text(0, -1.52, f"{L:,} live · {D:,} dead", ha="center", fontsize=9, color=MUTED)
    fig.suptitle("Viability in every tube (recommended gating)", fontsize=16, fontweight="bold", color=C.NAVY)
    plt.tight_layout(rect=(0, 0, 1, 0.95)); save(fig, os.path.join(out, "fig15_viability_donuts.png"))


# --------------------------------------------------------------------------- G
def interactive_3d(data, gates, out, max_per_class=2500, seed=0):
    rng = np.random.default_rng(seed); payload = {}
    for k in C.SAMPLES:
        d = data[k]; g = gates[k]
        cls = np.full(len(d[C.FSC_A]), "Plasma particles / debris", dtype=object)
        cls[g["cells"] & ~g["singlets"]] = "Doublets"; cls[g["live"]] = "Live cells"; cls[g["dead"]] = "Dead cells"
        tube = {}
        for c in ["Plasma particles / debris", "Doublets", "Live cells", "Dead cells"]:
            idx = np.where(cls == c)[0]
            if len(idx) > max_per_class:
                idx = rng.choice(idx, max_per_class, replace=False)
            tube[c] = dict(x=np.round(d[C.FSC_A][idx]).astype(int).tolist(),
                           y=np.round(np.minimum(d[C.SSC_A][idx], 262143)).astype(int).tolist(),
                           z=np.round(F.logicle(d[C.DYE][idx]), 4).tolist(), n=int((cls == c).sum()))
        v, L, D = _viab(g); tube["_viab"] = round(v, 1)
        payload[C.pretty(k)] = tube
    ticks = dict(vals=F.logicle(F.LOGICLE_TICKS).round(4).tolist(), text=F.LOGICLE_LABELS)
    html = HTML_TEMPLATE.replace("__DATA__", json.dumps(payload)).replace("__TICKS__", json.dumps(ticks)) \
        .replace("__CUT__", str(round(float(F.logicle([C.DYE_CUTOFF])[0]), 4)))
    path = os.path.join(out, "interactive_3d_explorer.html")
    with open(path, "w") as f:
        f.write(html)
    print("  wrote", path)


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>E1 · 3D flow explorer</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js"></script>
<style>
 body{margin:0;font-family:Calibri,Segoe UI,Helvetica,Arial,sans-serif;background:#0F1826;color:#E6ECF4}
 header{padding:14px 18px 6px} h1{font-size:20px;margin:0 0 4px;font-family:Cambria,Georgia,serif}
 p{margin:0;color:#9FB0C8;font-size:13px}
 #tabs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 18px}
 button{background:#1B2A41;color:#CADCFC;border:1px solid #2E4262;border-radius:16px;padding:6px 12px;font-size:13px;cursor:pointer}
 button.on{background:#17A398;color:#fff;border-color:#17A398}
 #stats{padding:0 18px;font-size:13px;color:#9FB0C8} #stats b{color:#fff}
 #plot{width:100%;height:calc(100vh - 170px);min-height:420px}
</style></head><body>
<header><h1>THP-1 + mouse plasma · 3D flow explorer</h1>
<p>Drag to rotate · scroll/pinch to zoom · click legend items to hide groups. Axes: size (FSC-A), granularity (SSC-A), viability dye (logicle).</p></header>
<div id="tabs"></div><div id="stats"></div><div id="plot"></div>
<script>
const DATA=__DATA__, TICKS=__TICKS__, CUT=__CUT__;
const COL={"Plasma particles / debris":"#8A94A6","Doublets":"#7B6FD0","Live cells":"#17A398","Dead cells":"#E4572E"};
const SIZE={"Plasma particles / debris":1.6,"Doublets":2.2,"Live cells":2.4,"Dead cells":3.4};
const OP={"Plasma particles / debris":0.25,"Doublets":0.6,"Live cells":0.75,"Dead cells":0.95};
const names=Object.keys(DATA); let cur=names.includes("70% rep")?"70% rep":names[0];
const tabs=document.getElementById('tabs');
names.forEach(n=>{const b=document.createElement('button');b.textContent=n;b.onclick=()=>{cur=n;draw(true)};tabs.appendChild(b)});
function draw(keepCam){
  [...tabs.children].forEach(b=>b.classList.toggle('on',b.textContent===cur));
  const t=DATA[cur]; const traces=[];
  Object.keys(COL).forEach(c=>{const s=t[c]; if(!s||!s.x.length)return;
    traces.push({type:'scatter3d',mode:'markers',name:`${c} (${s.n.toLocaleString()})`,x:s.x,y:s.y,z:s.z,
      marker:{size:SIZE[c],color:COL[c],opacity:OP[c]},hovertemplate:'FSC %{x}<br>SSC %{y}<extra>'+c+'</extra>'})});
  // translucent live/dead cut-off plane
  traces.push({type:'mesh3d',x:[0,262144,262144,0],y:[0,0,262144,262144],z:[CUT,CUT,CUT,CUT],i:[0,0],j:[1,2],k:[2,3],
    color:'#FFFFFF',opacity:0.08,name:'live/dead cut-off',hoverinfo:'skip',showlegend:true});
  const tot=Object.keys(COL).reduce((a,c)=>a+(t[c]?t[c].n:0),0);
  document.getElementById('stats').innerHTML=`<b>${cur}</b> · ${tot.toLocaleString()} events · viability <b>${t._viab}%</b> (live ÷ live+dead singlets) · max 2,500 points shown per group`;
  const ax=(title)=>({title:{text:title,font:{color:'#CADCFC'}},gridcolor:'#2E4262',zerolinecolor:'#2E4262',color:'#9FB0C8',backgroundcolor:'#0F1826',showbackground:true});
  const gd=document.getElementById('plot');
  const layout={paper_bgcolor:'#0F1826',font:{color:'#E6ECF4'},margin:{l:0,r:0,t:0,b:0},
    legend:{x:0.01,y:0.98,bgcolor:'rgba(15,24,38,0.7)'},
    scene:{xaxis:ax('FSC-A (size)'),yaxis:ax('SSC-A (granularity)'),
      zaxis:Object.assign(ax('Viability dye'),{tickvals:TICKS.vals,ticktext:TICKS.text}),
      camera:(keepCam&&gd.layout&&gd.layout.scene)?gd.layout.scene.camera:{eye:{x:1.6,y:-1.6,z:0.8}},aspectmode:'cube'}};
  Plotly.react(gd,traces,layout,{responsive:true,displaylogo:false});
}
draw(false);
</script></body></html>"""


def make(data, meta, out):
    gates = {k: F.recommended_gating(d) for k, d in data.items()}
    fig10(data, meta, gates, out); fig11(data, gates, out); fig12(data, gates, out)
    fig13(data, gates, out); fig14(data, gates, out); fig15(data, gates, out)
    interactive_3d(data, gates, out)
    fig16(data, meta, gates, out)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default=C.DATA_DIR); ap.add_argument("--out", default=C.OUT_DIR)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    data, meta = F.load_all(a.data); make(data, meta, a.out)


# --------------------------------------------------------------------------- H
def fig16(data, meta, gates, out):
    """Evidence panel: are the small events plasma particles or dead-cell debris?"""
    fig = plt.figure(figsize=(15.5, 10))
    gs = fig.add_gridspec(2, 2, hspace=0.38, wspace=0.25)
    cut = C.DYE_CUTOFF

    # A: same scatter region, different dye status
    ax = fig.add_subplot(gs[0, 0])
    d = data["70% (002)"]; sm = ~gates["70% (002)"]["cells"]
    ax.hexbin(d[C.FSC_A][sm], np.minimum(d[C.SSC_A][sm], 119999), gridsize=90, bins="log", cmap="Greys",
              mincnt=1, extent=(0, 120000, 0, 120000), linewidths=0, alpha=.9)
    p70 = sm & (d[C.DYE] > cut)
    ax.scatter(d[C.FSC_A][p70], np.minimum(d[C.SSC_A][p70], 119999), s=4, c="#B23A1B", lw=0, alpha=.6, label="70% plasma: dye⁺ small events")
    h = data["HK"]; hs = ~gates["HK"]["cells"]
    ax.scatter(h[C.FSC_A][hs], np.minimum(h[C.SSC_A][hs], 119999), s=14, facecolors="none", edgecolors=C.CORAL, lw=1.1,
               label="Heat-killed debris (91% dye⁺)")
    ax.set_xlim(0, 120000); ax.set_ylim(0, 120000)
    ax.set_xticks([0, 50000, 100000]); ax.set_xticklabels(["0", "50k", "100k"]); ax.set_yticks([0, 50000, 100000]); ax.set_yticklabels(["0", "50k", "100k"])
    ax.set_xlabel("FSC-A"); ax.set_ylabel("SSC-A")
    ax.set_title("Small events: grey = 70% plasma tube (99.7% dye⁻)", fontsize=12)
    ax.legend(frameon=True, fontsize=9.5, loc="upper right", markerscale=1.5); _letter(ax, "A")

    # B: dye intensity of small events
    ax = fig.add_subplot(gs[0, 1]); bins = np.linspace(F.logicle([-1500])[0], 1, 150)
    for k, c, lab in [("Unstained", "#8A94A6", "Unstained tube (no dye)"), ("70% (002)", C.TEAL, "70% plasma tube"),
                      ("HK", C.CORAL, "Heat-killed debris")]:
        m = ~gates[k]["cells"]; v = F.logicle(data[k][C.DYE][m])
        hh, e = np.histogram(v, bins, density=True); hh = ndimage.gaussian_filter1d(hh, 1.2)
        ax.fill_between(e[:-1], hh, color=c, alpha=.25, step="post"); ax.plot(e[:-1], hh, color=c, lw=2, drawstyle="steps-post",
                                                                          label=f"{lab}: {100*(data[k][C.DYE][m] > cut).mean():.1f}% dye⁺")
    ax.axvline(F.logicle([cut])[0], color="k", ls="--", lw=1)
    ax.set_xticks(F.logicle(F.LOGICLE_TICKS)); ax.set_xticklabels(F.LOGICLE_LABELS); ax.set_yticks([])
    ax.set_xlabel("Viability dye (APC-Cy7-A) of small events"); ax.legend(frameon=False, fontsize=10, loc="upper right")
    ax.set_title("Dead-cell debris is dye-bright; the plasma cloud is not", fontsize=12); _letter(ax, "B")

    # C: rates vs dose
    ax = fig.add_subplot(gs[1, 0]); ks = list(C.DOSE); x = np.arange(len(ks))
    neg, pos, cel = [], [], []
    for k in ks:
        d = data[k]; g = gates[k]; dur = F.acquisition_seconds(d, meta[k]); sm = ~g["cells"]; pz = d[C.DYE] > cut
        neg.append((sm & ~pz).sum() / dur); pos.append((sm & pz).sum() / dur); cel.append(g["singlets"].sum() / dur)
    ax.plot(x, neg, "-o", color="#8A94A6", lw=2.5, ms=8, label="small, dye⁻ (plasma?)")
    ax.plot(x, cel, "-o", color=C.TEAL, lw=2.5, ms=8, label="single cells")
    ax.plot(x, pos, "-o", color=C.CORAL, lw=2.5, ms=8, label="small, dye⁺ (dead-cell debris)")
    ax.set_yscale("log"); ax.set_xticks(x); ax.set_xticklabels([C.pretty(k) for k in ks], rotation=30, ha="right")
    ax.set_ylabel("Events per second (log)"); ax.legend(frameon=False, fontsize=10)
    ax.set_title(f"Dye⁻ particles rise {neg[-2]/neg[0]:.0f}–{neg[-1]/neg[0]:.0f}× at 70%; dye⁺ debris only {pos[-2]/pos[0]:.1f}–{pos[-1]/pos[0]:.1f}×", fontsize=12); _letter(ax, "C")

    # D: brightness of dead cells per tube (dye not quenched)
    ax = fig.add_subplot(gs[1, 1]); ks2 = ["0%"] + [k for k in C.DOSE if k != "0%"] + ["HK"]
    vals = [F.logicle(data[k][C.DYE][gates[k]["dead"]]) for k in ks2]
    parts = ax.violinplot(vals, showmedians=True, widths=0.8)
    for i, b in enumerate(parts["bodies"]):
        b.set_facecolor(C.NAVY if ks2[i] == "0%" else (C.CORAL if ks2[i] == "HK" else C.TEAL)); b.set_alpha(.55)
    for key in ("cmedians", "cmins", "cmaxes", "cbars"):
        parts[key].set_color(MUTED)
    ax.set_xticks(range(1, len(ks2) + 1)); ax.set_xticklabels([{"HK": "Heat-\nkilled"}.get(k, C.pretty(k)) for k in ks2], rotation=30, ha="right")
    ax.set_yticks(F.logicle([1000, 10000, 100000])); ax.set_yticklabels(["10³", "10⁴", "10⁵"])
    ax.axhline(F.logicle([cut])[0], color="k", ls="--", lw=1)
    ax.set_ylabel("Dye signal of dead (dye⁺) single cells")
    ax.set_title("Dead cells in plasma stain as brightly as without plasma", fontsize=12); _letter(ax, "D")
    fig.suptitle("Are the small events plasma particles or dead cells?", fontsize=17, fontweight="bold", color=C.NAVY, y=0.995)
    save(fig, os.path.join(out, "fig16_debris_evidence.png"))
