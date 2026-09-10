"""plotstyle.py - shared matplotlib style and small drawing helpers."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import config as C
import flowdata as F

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.titleweight": "bold", "axes.titlesize": 12,
})


def k_axis(ax, x=True, y=True):
    """Label linear scatter axes as 0 / 100k / 200k."""
    if x:
        ax.set_xticks([0, 100000, 200000]); ax.set_xticklabels(["0", "100k", "200k"])
    if y:
        ax.set_yticks([0, 100000, 200000]); ax.set_yticklabels(["0", "100k", "200k"])


def draw_polygon(ax, poly, color=C.NAVY, lw=2, ytransform=None):
    p = np.array(list(poly) + [poly[0]], float)
    y = p[:, 1] if ytransform is None else ytransform(p[:, 1])
    ax.plot(p[:, 0], y, c=color, lw=lw)


def logicle_yaxis(ax, lo=-2000):
    ax.set_yticks(F.logicle(F.LOGICLE_TICKS)); ax.set_yticklabels(F.LOGICLE_LABELS)
    ax.set_ylim(F.logicle([lo, C.SCALE_MAX]))


def logicle_xaxis(ax):
    ax.set_xticks(F.logicle(F.LOGICLE_TICKS)); ax.set_xticklabels(F.LOGICLE_LABELS)


def save(fig, path):
    fig.savefig(path, dpi=C.DPI)
    plt.close(fig)
    print("  wrote", path)
