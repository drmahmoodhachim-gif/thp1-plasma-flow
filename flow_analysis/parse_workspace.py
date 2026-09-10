"""
parse_workspace.py - read the FlowJo workspace (.wsp), print the gating hierarchy
with FlowJo's own counts, extract the gate vertices, and check that the Python
re-implementation (flowdata.original_gating) reproduces FlowJo's counts.

Usage:  python parse_workspace.py [--data ./data]
"""
import os, re, argparse
import xml.etree.ElementTree as ET
import config as C
import flowdata as F

GML = "{http://www.isac-net.org/std/Gating-ML/v2.0/gating}"
DT = "{http://www.isac-net.org/std/Gating-ML/v2.0/datatypes}"


def gate_info(pop):
    """Return (gate type, dimensions, vertices) for a FlowJo Population node."""
    g = pop.find("Gate")
    if g is None:
        return None
    for child in g:
        kind = child.tag.split("}")[1]
        dims = [fd.get(DT + "name") for fd in child.iter(DT + "fcs-dimension")]
        verts = []
        if kind == "PolygonGate":
            for v in child.findall(GML + "vertex"):
                c = [float(x.get(DT + "value")) for x in v.findall(GML + "coordinate")]
                verts.append(tuple(c))
        elif kind == "RectangleGate":
            verts = [(d.get(GML + "min"), d.get(GML + "max")) for d in child.findall(GML + "dimension")]
        return kind, dims, verts


def walk(node, depth=1, parent=None, out=None):
    out = [] if out is None else out
    for pop in node.findall("Subpopulations/Population"):
        count = int(pop.get("count"))
        out.append((depth, pop.get("name"), count, parent, gate_info(pop)))
        walk(pop, depth + 1, count, out)
    return out


def normalise(fname):
    return re.sub(r"[%]", "_", os.path.basename(fname))


def main(data_dir):
    root = ET.parse(F.find_workspace(data_dir)).getroot()
    file_to_name = {normalise(v): k for k, v in C.SAMPLES.items()}
    printed_gates = False
    for s in root.iter("Sample"):
        sn = s.find("SampleNode")
        fname = normalise(sn.get("name"))
        name = file_to_name.get(fname) or file_to_name.get(normalise(s.find("DataSet").get("uri", "")))
        pops = walk(sn, parent=int(sn.get("count")))
        if not printed_gates:
            print("\nGate definitions (raw scale):")
            for depth, pname, _, _, gi in pops:
                print("  " * depth + f"{pname}: {gi[0]} on {gi[1]}\n" + "  " * depth + f"   vertices = {[tuple(round(v) for v in p) for p in gi[2]]}")
            print(f"{'Sample':12s} {'Population':28s} {'FlowJo':>7s} {'Python':>7s}  diff")
            printed_gates = True
        if name is None:
            print(f"  (could not match {sn.get('name')})")
            continue
        d, _ = F.load_fcs(F.find_file(data_dir, C.SAMPLES[name]))
        g = F.original_gating(d)
        py = {"THP": g["thp"].sum(), "Single Cells": g["singlets"].sum()}
        for depth, pname, count, parent, gi in pops:
            key = "Single Cells" if "Single" in pname else ("THP" if pname == "THP" else "Live")
            pyc = py.get(key, g["live"].sum())
            diff = 100 * (pyc - count) / max(count, 1)
            print(f"{name:12s} {'  '*(depth-1)+pname:28s} {count:7d} {pyc:7d}  {diff:+.1f}%")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=C.DATA_DIR)
    main(ap.parse_args().data)
