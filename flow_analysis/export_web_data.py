"""
Pack FCS events into a compact binary + JSON for the browser app.

    python export_web_data.py --data "../Flow Files" --out "../site/data"
"""
import os, json, struct, argparse
import numpy as np
import config as C
import flowdata as F


def logicle_lut(n=1024):
    raw = np.linspace(-2000, C.SCALE_MAX, n)
    return dict(raw=raw.round(1).tolist(), y=np.round(F.logicle(raw), 5).tolist())


def pack_bin(tubes, path):
    with open(path, "wb") as f:
        f.write(b"E1F1")
        f.write(struct.pack("<I", 1))
        f.write(struct.pack("<I", len(tubes)))
        for t in tubes:
            f.write(struct.pack("<I", t["n"]))
            for key in ("fsc", "ssc", "fsch", "dye"):
                f.write(np.asarray(t[key], dtype="<i4").tobytes())


def export(data_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    data, meta_kw = F.load_all(data_dir)
    lut = logicle_lut()
    tubes_bin, tubes_meta = [], []
    for name in C.SAMPLES:
        d = data[name]
        fsc = np.round(d[C.FSC_A]).astype(np.int32)
        ssc = np.round(np.minimum(d[C.SSC_A], 262143)).astype(np.int32)
        fsch = np.round(d[C.FSC_H]).astype(np.int32)
        dye = np.round(d[C.DYE]).astype(np.int32)
        n = int(len(fsc))
        tubes_bin.append(dict(n=n, fsc=fsc, ssc=ssc, fsch=fsch, dye=dye))
        tubes_meta.append(dict(
            id=name,
            name=C.pretty(name),
            dose=C.DOSE.get(name),
            repeat=name in C.REPEAT_TUBES,
            n=n,
            seconds=round(F.acquisition_seconds(d, meta_kw[name]), 3),
            acqTime=C.ACQ_TIME.get(name),
        ))
        print(f"  {name}: {n:,}")
    meta = dict(
        experiment="E1 · THP-1 viability in mouse plasma",
        acquired="7 Sep 2026",
        defaults=dict(
            dyeCutoff=C.DYE_CUTOFF,
            singletLo=C.SINGLET_RATIO[0],
            singletHi=C.SINGLET_RATIO[1],
            gateMode="recommended",
            fscMin=float(C.REC_ALL_CELLS[0][0]),
        ),
        recommended=C.REC_ALL_CELLS,
        originalThp=C.ORIG_THP,
        originalSinglets=C.ORIG_SINGLETS,
        originalLive=C.ORIG_LIVE,
        scaleMax=C.SCALE_MAX,
        ticks=dict(vals=F.logicle(F.LOGICLE_TICKS).round(4).tolist(), text=F.LOGICLE_LABELS),
        logicleLut=lut,
        cutLogicle=round(float(F.logicle([C.DYE_CUTOFF])[0]), 4),
        tubes=tubes_meta,
    )
    json_path = os.path.join(out_dir, "meta.json")
    bin_path = os.path.join(out_dir, "events.bin")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    pack_bin(tubes_bin, bin_path)
    print("wrote", json_path, os.path.getsize(json_path))
    print("wrote", bin_path, os.path.getsize(bin_path))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=C.DATA_DIR)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "data"))
    a = ap.parse_args()
    export(a.data, a.out)
