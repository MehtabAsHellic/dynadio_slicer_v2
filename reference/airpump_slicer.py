#!/usr/bin/env python3
"""
airpump_slicer.py - slice an STL into a spiral/flat toolpath for an air-pump (gel) printer.

    python3 airpump_slicer.py model.stl out.gcode --length 9.7 --pitch 0.13
    python3 airpump_slicer.py model.stl out.gcode --length 9.7 --up-axis x --tilt 55 --preview prev.png

PIPELINE
  1. load STL (binary or ASCII)                           load_stl()
  2. orient: choose which model axis becomes print-Z,
     optionally lean it (--tilt) so layers stay horizontal
     while the body climbs; uniform scale; centre XY      orient_and_scale()
  3. slice with horizontal planes every --pitch mm        slice_plane()
  4. clean each loop: CCW, resample, gaussian-round the
     corners, drop specks/slivers                         prep_loop()
  5. link loops of layer k to layer k+1 (assignment
     problem) -> chains. A chain with >1 loop becomes ONE
     rising spiral; a loop with no partner is a flat slice  link_layers()
  6. turn every chain into one 3D curve with fixed step   chain_curve()
  7. order strokes bottom -> top, direction nearest pen   order_strokes()
  8. write G-code: travel (pump off) -> M3 S<kick> on the
     first step -> M3 S<draw> -> M5 -> G4 dwell           write_gcode()

Needs only numpy and scipy (matplotlib only for --preview).
"""
import argparse
import math
import struct
import sys

import numpy as np
from scipy.optimize import linear_sum_assignment


# ----------------------------------------------------------------------------- 1. STL
def load_stl(path):
    """Return triangles as (N,3,3) float array. Handles binary and ASCII STL."""
    b = open(path, "rb").read()
    if len(b) >= 84:
        n = struct.unpack("<I", b[80:84])[0]
        if 84 + 50 * n == len(b):                       # binary STL: size matches exactly
            dt = np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")])
            A = np.frombuffer(b[84:], dtype=dt)
            return A["v"].reshape(-1, 3, 3).astype(float)
    import re
    txt = b.decode("latin1")
    v = np.array(re.findall(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", txt), float)
    if len(v) == 0 or len(v) % 3:
        sys.exit("could not read STL (neither valid binary nor ASCII)")
    return v.reshape(-1, 3, 3)


# ----------------------------------------------------------------------------- 2. orient
def orient_and_scale(T, up_axis, length, tilt_deg, flip):
    """
    up_axis : model axis that becomes the print Z axis ('x','y' or 'z').
              A cyclic axis permutation is used, so the model is never mirrored.
    length  : the longest model dimension is scaled to this many mm (one uniform
              scale -> no stretching).
    tilt_deg: lean the body away from vertical about the print-X axis. 0 = stands
              straight up. The layers stay horizontal, so this is a TRUE re-slice
              of the tilted model (not a rotated toolpath).
    """
    perm = {"x": (1, 2, 0), "y": (2, 0, 1), "z": (0, 1, 2)}[up_axis]
    T = T[:, :, perm].copy()
    ext = np.ptp(T.reshape(-1, 3), axis=0)
    # scale on the extent along the (pre-tilt) up axis, like the original run;
    # fall back to the longest dimension if the user passed --scale-longest
    S = length / ext[2]
    T *= S
    if tilt_deg:
        a = math.radians(-tilt_deg if flip else tilt_deg)
        c, s = math.cos(a), math.sin(a)
        y, z = T[:, :, 1].copy(), T[:, :, 2].copy()
        T[:, :, 1] = y * c - z * s
        T[:, :, 2] = y * s + z * c
    V = T.reshape(-1, 3)
    lo, hi = V.min(0), V.max(0)
    T[:, :, 0] -= (lo[0] + hi[0]) / 2                   # centre XY on the bounding box
    T[:, :, 1] -= (lo[1] + hi[1]) / 2
    T[:, :, 2] -= lo[2]                                 # lowest point at z = 0
    return T, S


# ----------------------------------------------------------------------------- 3. slice
class Mesh:
    def __init__(self, T):
        V = np.round(T.reshape(-1, 3), 6)
        self.P, inv = np.unique(V, axis=0, return_inverse=True)   # weld duplicate vertices
        self.tri = inv.reshape(-1, 3)


def slice_plane(M, h):
    """All closed outlines (list of (n,2) arrays, mm) where the plane z=h cuts the mesh."""
    P, tri = M.P, M.tri
    s = P[:, 2] - h
    s[np.abs(s) < 1e-9] = 1e-9                           # never let a vertex sit exactly on the plane
    a = s[tri]
    neg = a < 0
    cnt = neg.sum(1)
    cross = (cnt == 1) | (cnt == 2)
    tt, aa = tri[cross], a[cross]
    ne = neg[cross]
    ids, keys, pts = [], [], []
    for e in range(3):
        i, j = e, (e + 1) % 3
        m = ne[:, i] != ne[:, j]
        if not m.any():
            continue
        u, v = tt[m, i], tt[m, j]
        f = aa[m, i] / (aa[m, i] - aa[m, j])
        lo_, hi_ = np.minimum(u, v), np.maximum(u, v)
        # compute the point from the canonical (low,high) vertex order so the two
        # triangles that share an edge produce bit-identical points
        fa = np.where(u == lo_, f, 1 - f)
        p = P[lo_] + (P[hi_] - P[lo_]) * fa[:, None]
        ids.append(np.nonzero(m)[0])
        keys.append(lo_.astype(np.int64) * len(P) + hi_)
        pts.append(p)
    if not ids:
        return []
    ids, keys, pts = np.concatenate(ids), np.concatenate(keys), np.concatenate(pts)
    o = np.argsort(ids, kind="stable")
    keys, pts = keys[o].reshape(-1, 2), pts[o].reshape(-1, 2, 3)
    adj, coord = {}, {}
    for (k1, k2), (p1, p2) in zip(keys, pts):
        coord[k1], coord[k2] = p1[:2], p2[:2]
        adj.setdefault(k1, []).append(k2)
        adj.setdefault(k2, []).append(k1)
    seen, loops = set(), []
    for k in adj:                                        # walk edge-to-edge until the loop closes
        if k in seen:
            continue
        loop, prev, cur = [k], None, k
        seen.add(k)
        while True:
            nb = [x for x in adj[cur] if x != prev and (x not in seen or x == loop[0])]
            if not nb:
                break
            nxt = nb[0]
            if nxt == loop[0]:
                break
            loop.append(nxt)
            seen.add(nxt)
            prev, cur = cur, nxt
        if len(loop) >= 3:
            loops.append(np.array([coord[x] for x in loop]))
    return loops


# ----------------------------------------------------------------------------- 4. clean loops
def perimeter(a):
    b = np.vstack([a, a[:1]])
    return float(np.hypot(*np.diff(b, axis=0).T).sum())


def shoelace(a):
    return 0.5 * np.sum(a[:, 0] * np.roll(a[:, 1], -1) - np.roll(a[:, 0], -1) * a[:, 1])


def prep_loop(a, o):
    if shoelace(a) < 0:
        a = a[::-1]                                      # make every loop counter-clockwise
    p = perimeter(a)
    if p < o.min_perimeter:
        return None
    b = np.vstack([a, a[:1]])
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(b, axis=0).T))]
    n = max(int(p / o.resample), 16)
    t = np.linspace(0, p, n, endpoint=False)
    r = np.c_[np.interp(t, d, b[:, 0]), np.interp(t, d, b[:, 1])]      # equal spacing
    k = int(o.sigma * 3)
    ker = np.exp(-0.5 * (np.arange(-k, k + 1) / o.sigma) ** 2)
    ker /= ker.sum()
    pad = np.pad(r, ((k, k), (0, 0)), mode="wrap")
    r = np.stack([np.convolve(pad[:, i], ker, "valid") for i in range(2)], 1)  # round every corner
    p2, ar = perimeter(r), abs(shoelace(r))
    if p2 < o.min_perimeter_after or 2 * ar / p2 < o.min_thickness:
        return None                                      # speck / sliver: too small to draw as a bubble line
    return r


# ----------------------------------------------------------------------------- 5. link layers
def mean_dist(a, b):
    a, b = a[::6], b[::6]
    D = np.hypot(a[:, None, 0] - b[None, :, 0], a[:, None, 1] - b[None, :, 1])
    return 0.5 * (D.min(1).mean() + D.min(0).mean())     # symmetric average nearest-point distance


def link_layers(layers, link):
    nxt, hasin = {}, set()
    for k in range(len(layers) - 1):
        A, B = layers[k], layers[k + 1]
        if not A or not B:
            continue
        C = np.full((len(A), len(B)), 1e6)
        for i, a in enumerate(A):
            for j, b in enumerate(B):
                r = b["per"] / a["per"]
                if 0.65 < r < 1.5:                       # outline size may not jump
                    C[i, j] = mean_dist(a["a"], b["a"])
        ri, ci = linear_sum_assignment(C)                # best one-to-one pairing
        for i, j in zip(ri, ci):
            if C[i, j] < link:                           # close enough -> same part continues upward
                nxt[(k, i)] = (k + 1, j)
                hasin.add((k + 1, j))
    heads = [(k, i) for k in range(len(layers)) for i in range(len(layers[k])) if (k, i) not in hasin]
    chains = []
    for h in heads:
        ch = [h]
        while ch[-1] in nxt:
            ch.append(nxt[ch[-1]])
        chains.append(ch)
    return chains


# ----------------------------------------------------------------------------- 6. chain -> curve
def arc_resample(x, M):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(x, axis=0).T))]
    t = np.linspace(0, d[-1], M)
    return np.c_[np.interp(t, d, x[:, 0]), np.interp(t, d, x[:, 1])]


def chain_curve(ch, layers, zs, o):
    """One continuous curve: each loop is blended into the next while z rises, so the
    nozzle never stops or jumps between layers (that is the spiral)."""
    parts, start = [], 0
    for n, (k, i) in enumerate(ch):
        a = np.roll(layers[k][i]["a"], -start, axis=0)
        aa = np.vstack([a, a[:1]])
        if n == len(ch) - 1:
            parts.append(np.c_[aa, np.full(len(aa), zs[k])])
            break
        k2, j = ch[n + 1]
        B = layers[k2][j]["a"]
        v = int(np.hypot(*(B - aa[0]).T).argmin())       # start next loop at the point nearest to where we are
        bb = np.roll(B, -v, axis=0)
        bb = np.vstack([bb, bb[:1]])
        start = v
        M = max(len(aa), len(bb))
        f = np.linspace(0, 1, M)[:, None]
        xy = (1 - f) * arc_resample(aa, M) + f * arc_resample(bb, M)
        parts.append(np.c_[xy, zs[k] + (zs[k2] - zs[k]) * f[:, 0]])
    C = np.vstack(parts)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    keep = np.r_[True, np.diff(d) > 1e-9]
    C, d = C[keep], d[keep]
    step = min(o.step, max(0.02, d[-1] / 24))            # tiny strokes still get >= 24 points
    n = max(int(d[-1] / step), 6)
    t = np.linspace(0, d[-1], n + 1)
    return np.stack([np.interp(t, d, C[:, j]) for j in range(3)], 1)


# ----------------------------------------------------------------------------- 7. order
def order_strokes(curves, chains):
    """Bottom -> top so the nozzle never travels back down through finished gel.
    The longest spiral always runs upward; the rest start at the end nearest the pen."""
    main = max(range(len(curves)), key=lambda i: len(curves[i]))
    rem = sorted(range(len(curves)), key=lambda i: (chains[i][0][0], i))
    order, pos = [], None
    for i in rem:
        C = curves[i]
        if i == main or pos is None:
            if i != main and C[-1][2] < C[0][2]:
                curves[i] = C[::-1].copy()
        elif np.linalg.norm(C[-1] - pos) < np.linalg.norm(C[0] - pos):
            curves[i] = C[::-1].copy()
        order.append(i)
        pos = curves[i][-1]
    return order


# ----------------------------------------------------------------------------- 8. G-code
def write_gcode(path, curves, chains, order, o, header):
    out = [f"; {h}" for h in header]
    out += [f"; PUMP per stroke: pump OFF travel -> M3 S{o.kick} kick on the first step -> M3 S{o.draw} drawing"
            f" -> M5 -> G4 P{o.dwell} (short wait so the air stored in the nozzle does not drip).",
            "G21", "G90", "G94", "M5", f"G1 F{o.feed:g}", ""]
    for n, i in enumerate(order):
        C = curves[i]
        kind = "spiral" if len(chains[i]) > 1 else "flat"
        out.append(f"; ---- stroke {n + 1}/{len(order)}  layers {chains[i][0][0] + 1}-{chains[i][-1][0] + 1} ({kind}) ----")
        out.append(f"G1 X{C[0][0]:.3f} Y{C[0][1]:.3f} Z{C[0][2]:.3f}")          # travel, pump off
        out.append(f"M3 S{o.kick}")                                              # kick on first step
        out.append(f"G1 X{C[1][0]:.3f} Y{C[1][1]:.3f} Z{C[1][2]:.3f}")
        out.append(f"M3 S{o.draw}")                                              # normal drawing power
        for j in range(2, len(C)):
            out.append(f"G1 X{C[j][0]:.3f} Y{C[j][1]:.3f} Z{C[j][2]:.3f}")
        out += ["M5", f"G4 P{o.dwell}", ""]
    out += ["M5", "M2"]
    open(path, "w").write("\n".join(out) + "\n")


def preview(png, curves, order):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(18, 9))
    ax = fig.add_subplot(131, projection="3d")
    ax2, ax3 = fig.add_subplot(132), fig.add_subplot(133)
    cols = plt.cm.tab20(np.linspace(0, 1, 20))
    for n, i in enumerate(order):
        C = curves[i]
        ax.plot(C[:, 0], C[:, 1], C[:, 2], color=cols[n % 20], lw=.3)
        ax2.plot(C[:, 0], C[:, 2], color=cols[n % 20], lw=.3)
        ax3.plot(C[:, 1], C[:, 2], color=cols[n % 20], lw=.3)
    ax2.set_aspect("equal")
    ax3.set_aspect("equal")
    ax2.set_title("front (X-Z)")
    ax3.set_title("side (Y-Z)")
    plt.savefig(png, dpi=60)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stl")
    ap.add_argument("out")
    ap.add_argument("--length", type=float, default=9.7, help="size along the up axis in mm (default 9.7)")
    ap.add_argument("--up-axis", choices="xyz", default="x", help="model axis that becomes print Z (jet: x)")
    ap.add_argument("--tilt", type=float, default=0.0, help="lean the body this many deg from vertical (0 = upright)")
    ap.add_argument("--flip", action="store_true", help="lean to the other side")
    ap.add_argument("--pitch", type=float, default=0.13, help="layer distance mm")
    ap.add_argument("--z0", type=float, default=0.3, help="Z of the lowest point")
    ap.add_argument("--first-plane", type=float, default=0.03, help="first cut this far above the lowest point (mm)")
    ap.add_argument("--feed", type=float, default=500)
    ap.add_argument("--kick", type=int, default=1000, help="pump S value on the first step of a stroke")
    ap.add_argument("--draw", type=int, default=350, help="pump S value while drawing")
    ap.add_argument("--dwell", type=float, default=0.05, help="G4 wait after M5 (s)")
    ap.add_argument("--step", type=float, default=0.065, help="max distance between G-code points (mm)")
    ap.add_argument("--resample", type=float, default=0.015, help="outline resample spacing before smoothing (mm)")
    ap.add_argument("--sigma", type=float, default=5.0, help="corner rounding (gaussian, in resample steps)")
    ap.add_argument("--min-perimeter", type=float, default=0.2)
    ap.add_argument("--min-perimeter-after", type=float, default=0.5)
    ap.add_argument("--min-thickness", type=float, default=0.05, help="drop slivers thinner than this (mm)")
    ap.add_argument("--link", type=float, default=0.22, help="max outline distance to continue a spiral (mm)")
    ap.add_argument("--preview", help="write a PNG preview")
    o = ap.parse_args()

    T = load_stl(o.stl)
    T, S = orient_and_scale(T, o.up_axis, o.length, o.tilt, o.flip)
    M = Mesh(T)
    H = float(M.P[:, 2].max())
    nl = int(math.floor((H - o.first_plane) / o.pitch)) + 1
    zs = o.z0 + o.first_plane + np.arange(nl) * o.pitch
    link = o.link + o.pitch * math.tan(math.radians(min(o.tilt, 85)))   # a leaning body shifts sideways every layer

    layers = []
    for k in range(nl):
        L = [prep_loop(l, o) for l in slice_plane(M, o.first_plane + k * o.pitch)]
        layers.append([dict(a=a, per=perimeter(a)) for a in L if a is not None])
    chains = link_layers(layers, link)
    curves = [chain_curve(c, layers, zs, o) for c in chains]
    order = order_strokes(curves, chains)

    header = [f"{o.stl.split('/')[-1]} -> AIR-PUMP. Uniform scale {S:.5f} (no stretch). up-axis={o.up_axis} tilt={o.tilt:g}deg"
              f"{' (flipped)' if o.flip else ''}, Z{o.z0:g} -> Z{zs[-1]:.2f}.",
              f"Layers {o.pitch} mm apart. Loops that continue from layer to layer are drawn as rising SPIRALS; "
              f"loops that appear/disappear are drawn as flat horizontal slices.",
              "All corners are rounded (smoothed) so no bubbles collect at sharp turns."]
    write_gcode(o.out, curves, chains, order, o, header)
    if o.preview:
        preview(o.preview, curves, order)

    allp = np.vstack(curves)
    trav = [np.linalg.norm(curves[order[n + 1]][0] - curves[order[n]][-1]) for n in range(len(order) - 1)]
    steps = np.concatenate([np.linalg.norm(np.diff(c, axis=0), axis=1) for c in curves])
    print(f"layers {nl}  strokes {len(curves)}  spirals {sum(len(c) > 1 for c in chains)}  "
          f"flat {sum(len(c) == 1 for c in chains)}  points {len(allp)}")
    print(f"X {allp[:,0].min():.2f}..{allp[:,0].max():.2f}  Y {allp[:,1].min():.2f}..{allp[:,1].max():.2f}  "
          f"Z {allp[:,2].min():.2f}..{allp[:,2].max():.2f}")
    print(f"max step {steps.max():.3f} mm   longest travel {max(trav) if trav else 0:.2f} mm   scale {S:.5f}")


if __name__ == "__main__":
    main()