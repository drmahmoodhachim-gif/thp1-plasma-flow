"""
run_all.py - reproduce every figure and table of the E1 analysis.

    python run_all.py --data /path/to/folder_with_fcs_and_wsp --out ./output

Steps
  1. verify the Python gates reproduce FlowJo's counts (parse_workspace.py)
  2. exploratory overview figures          (figures_overview.py)
  3. figures 1-5, original gating problems (figures_part1.py)
  4. figures 6-9 + S1, recommended gating  (figures_part2.py)
  5. CSV tables                            (tables.py)
  6. fancy figures 10-15 + 3D HTML         (figures_fancy.py)
"""
import argparse, os
import config as C


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=C.DATA_DIR, help="folder with the .fcs files and .wsp")
    ap.add_argument("--out", default=C.OUT_DIR, help="output folder")
    ap.add_argument("--skip-overview", action="store_true", help="skip the slow exploratory grid")
    a = ap.parse_args()
    C.DATA_DIR, C.OUT_DIR = a.data, a.out
    os.makedirs(a.out, exist_ok=True)

    import flowdata as F, parse_workspace, figures_overview, figures_part1, figures_part2, tables, figures_fancy
    print("1) Checking gates against the FlowJo workspace")
    parse_workspace.main(a.data)
    print("\nLoading FCS files ...")
    data, meta = F.load_all(a.data)
    if not a.skip_overview:
        print("2) Overview figures"); figures_overview.make(data, a.out)
    print("3) Figures 1-5"); figures_part1.make(data, a.out)
    print("4) Figures 6-9, S1"); T = figures_part2.make(data, a.out)
    print("5) Tables"); tables.make(data, meta, a.out, T)
    print("6) Fancy figures + interactive 3D"); figures_fancy.make(data, meta, a.out)
    print(f"\nTrend: {T['slope10']:+.2f}% per +10% plasma "
          f"(95% CI {T['ci10'][0]:+.2f} to {T['ci10'][1]:+.2f}), p = {T['lr'].pvalue:.2f}")
    print("Done. Outputs in", os.path.abspath(a.out))


if __name__ == "__main__":
    main()
