"""
config.py - all settings in one place.

Edit DATA_DIR (or pass --data on the command line of run_all.py) to point at the
folder containing the .fcs files and the FlowJo workspace (.wsp).
"""
import os

# ----------------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------------
DATA_DIR = os.environ.get("FLOW_DATA_DIR", "./data")     # folder with .fcs + .wsp
OUT_DIR = os.environ.get("FLOW_OUT_DIR", "./output")     # figures + tables go here
WORKSPACE = "20260907_TKm_F1_70_.wsp"

# Display name -> file name. Order = order used in tables/figures.
SAMPLES = {
    "Unstained": "Specimen_001_untained.fcs",
    "0%":        "Specimen_001_THP_0_.fcs",
    "30%":       "Specimen_001_THP_30_.fcs",
    "40%":       "Specimen_001_THP_40_.fcs",
    "40% (2)":   "Specimen_001_THP_40__2.fcs",
    "50%":       "Specimen_001_THP_50_.fcs",
    "60%":       "Specimen_001_THP_60_.fcs",
    "70%":       "Specimen_001_THP_70_.fcs",
    "70% (002)": "Specimen_001_THP_70__002.fcs",
    "HK":        "Specimen_001_THP_HK.fcs",
}
# % mouse plasma for the dose-response analyses (controls excluded)
DOSE = {"0%": 0, "30%": 30, "40%": 40, "40% (2)": 40, "50%": 50,
        "60%": 60, "70%": 70, "70% (002)": 70}
REPEAT_TUBES = {"40% (2)", "70% (002)"}

# Channel names as stored in the FCS files
FSC_A, FSC_H, SSC_A, DYE, TIME = "FSC-A", "FSC-H", "SSC-A", "APC-Cy7-A", "Time"
SCALE_MAX = 262144          # 18-bit Fortessa scale; SSC >= 262000 = saturated

# ----------------------------------------------------------------------------
# ORIGINAL FlowJo gates (raw-scale vertices read from the .wsp; see
# parse_workspace.py, which extracts and checks them automatically)
# ----------------------------------------------------------------------------
ORIG_THP = [(71212, 93395), (72244, 133725), (115591, 188913), (170290, 232427),
            (227054, 236673), (259048, 235611), (261112, 135848), (261112, 100825),
            (175451, 54127), (117655, 30778), (84629, 48820), (79469, 70047)]   # FSC-A vs SSC-A
ORIG_SINGLETS = [(1032, 11674), (245631, 202711), (261112, 165565)]          # FSC-A vs FSC-H
ORIG_LIVE = [(2064, 463), (261112, 535), (261112, -910), (0, -942)]           # FSC-A vs APC-Cy7-A

# ----------------------------------------------------------------------------
# RECOMMENDED gating (this re-analysis)
# ----------------------------------------------------------------------------
# Step 1 "All cells" (FSC-A vs SSC-A): keeps shrunken/granular dead cells up to the
# top of the SSC scale, but notches out the plasma-particle cloud at lower left.
REC_ALL_CELLS = [(60000, 270000), (270000, 270000), (270000, 100825), (175451, 58000),
                 (122000, 42000), (100000, 68000), (100000, 100000), (60000, 115000)]
# Step 2 singlets: FSC-H / FSC-A ratio band
SINGLET_RATIO = (0.55, 0.90)
# Step 3 live/dead cut-off on the dye (upper edge of the original FlowJo live gate;
# unstained 99.9th percentile = ~473, so this is conservative)
DYE_CUTOFF = 535

# Simple size threshold used for "small particle" and "cell-sized" rate metrics
SMALL_FSC = 60000

# ----------------------------------------------------------------------------
# Plot style
# ----------------------------------------------------------------------------
NAVY, TEAL, CORAL, PURPLE, GREY = "#1B2A41", "#17A398", "#E4572E", "#7B6FD0", "#C9CED6"
DPI = 300
ACQ_TIME = {"Unstained": "14:38", "30%": "14:44", "40%": "14:51", "40% (2)": "14:54",
            "50%": "14:56", "60%": "14:58", "70%": "15:00", "70% (002)": "15:02",
            "HK": "15:05", "0%": "15:09"}   # $BTIM keyword, rounded


def pretty(name):
    """'70% (002)' -> '70% rep' for axis labels."""
    return name.replace(" (002)", " rep").replace(" (2)", " rep")
