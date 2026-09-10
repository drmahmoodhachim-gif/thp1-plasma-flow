"""
flowdata.py - loading FCS files, applying gates, and small helpers.
"""
import os
import numpy as np
import flowio
from matplotlib.path import Path
from flowutils.transforms import logicle as _logicle

import config as C


# ----------------------------------------------------------------------------
# Loading
# ----------------------------------------------------------------------------
def load_fcs(path):
    """Return (dict channel -> numpy array, text keywords) for one FCS file.
    Values are the raw (linear, compensated-free) values written by FACSDiva."""
    fd = flowio.FlowData(path)
    events = np.reshape(fd.events, (-1, fd.channel_count)).astype(float)
    names = [fd.text[f"p{i}n"] for i in range(1, fd.channel_count + 1)]
    return {n: events[:, i] for i, n in enumerate(names)}, fd.text


def find_file(data_dir, fname):
    """Locate a file even if '%' in the original name was changed to '_' (or back)."""
    direct = os.path.join(data_dir, fname)
    if os.path.exists(direct):
        return direct
    norm = lambda n: n.replace("%", "_").lower()
    for f in os.listdir(data_dir):
        if norm(f) == norm(fname):
            return os.path.join(data_dir, f)
    raise FileNotFoundError(f"{fname} not found in {data_dir}")


def find_workspace(data_dir):
    try:
        return find_file(data_dir, C.WORKSPACE)
    except FileNotFoundError:
        wsps = [f for f in os.listdir(data_dir) if f.lower().endswith(".wsp")]
        if len(wsps) == 1:
            return os.path.join(data_dir, wsps[0])
        raise


def load_all(data_dir=None):
    data_dir = data_dir or C.DATA_DIR
    data, meta = {}, {}
    for name, fname in C.SAMPLES.items():
        data[name], meta[name] = load_fcs(find_file(data_dir, fname))
    return data, meta


# ----------------------------------------------------------------------------
# Gating
# ----------------------------------------------------------------------------
def in_polygon(poly, x, y):
    """Boolean mask: which (x, y) events fall inside polygon (list of vertices)."""
    return Path(poly).contains_points(np.c_[x, y])


def original_gating(d):
    """Reproduce the FlowJo hierarchy: THP -> Single Cells -> APC-Cy7 negative."""
    thp = in_polygon(C.ORIG_THP, d[C.FSC_A], d[C.SSC_A])
    sing = thp & in_polygon(C.ORIG_SINGLETS, d[C.FSC_A], d[C.FSC_H])
    live = sing & in_polygon(C.ORIG_LIVE, d[C.FSC_A], d[C.DYE])
    return {"thp": thp, "singlets": sing, "live": live}


def singlet_band(d):
    ratio = d[C.FSC_H] / np.maximum(d[C.FSC_A], 1)
    lo, hi = C.SINGLET_RATIO
    return (ratio > lo) & (ratio < hi)


def recommended_gating(d):
    """All cells (incl. dead) -> singlets -> live / dead split on the dye."""
    cells = in_polygon(C.REC_ALL_CELLS, d[C.FSC_A], d[C.SSC_A])
    sing = cells & singlet_band(d)
    live = sing & (d[C.DYE] <= C.DYE_CUTOFF)
    dead = sing & (d[C.DYE] > C.DYE_CUTOFF)
    return {"cells": cells, "singlets": sing, "live": live, "dead": dead}


# ----------------------------------------------------------------------------
# Transforms and statistics
# ----------------------------------------------------------------------------
def logicle(v):
    """Logicle (biexponential) display transform, FlowJo-like parameters."""
    v = np.asarray(v, float).reshape(-1, 1)
    return _logicle(v, [0], t=C.SCALE_MAX, m=4.5, w=0.8, a=0).ravel()


LOGICLE_TICKS = [-1000, 0, 1000, 10000, 100000]
LOGICLE_LABELS = ["−10³", "0", "10³", "10⁴", "10⁵"]


def wilson_ci(k, n, z=1.96):
    """Wilson score 95% confidence interval for a proportion k/n."""
    if n == 0:
        return np.nan, np.nan
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return centre - half, centre + half


def bootstrap_median_ci(x, n_boot=300, seed=1):
    rng = np.random.default_rng(seed)
    meds = [np.median(rng.choice(x, len(x))) for _ in range(n_boot)]
    return np.percentile(meds, [2.5, 97.5])


def acquisition_seconds(d, meta):
    """Acquisition duration from the Time channel x $TIMESTEP (s)."""
    step = float(meta.get("timestep", 0.01))
    return (d[C.TIME].max() - d[C.TIME].min()) * step
