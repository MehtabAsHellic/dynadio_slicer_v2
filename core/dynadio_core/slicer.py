"""Stage 3: cut a mesh with horizontal planes into closed loops.

This module is a careful port of ``slice_plane`` from the reference script,
including vertex welding at 6 decimals, the 1e-9 plane nudge, canonical edge
ordering and edge-key walking.  Those details are what make the reference
G-code reproducible to the third decimal.
"""

from __future__ import annotations

import numpy as np


class Mesh:
    """Welded triangle mesh used by all cut planes."""

    __slots__ = ("P", "tri")

    def __init__(self, triangles: np.ndarray):
        v = np.round(triangles.reshape(-1, 3), 6)
        self.P, inv = np.unique(v, axis=0, return_inverse=True)
        self.tri = inv.reshape(-1, 3)


def slice_plane(mesh: Mesh, height: float) -> list[np.ndarray]:
    """All closed outlines (``(n, 2)`` arrays in mm) at ``z = height``."""
    p, tri = mesh.P, mesh.tri
    s = p[:, 2] - height
    s[np.abs(s) < 1e-9] = 1e-9  # never let a vertex sit exactly on the plane
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
        lo, hi = np.minimum(u, v), np.maximum(u, v)
        # The point is computed from the canonical (low, high) vertex order so
        # the two triangles sharing an edge produce bit-identical points.
        fa = np.where(u == lo, f, 1 - f)
        point = p[lo] + (p[hi] - p[lo]) * fa[:, None]
        ids.append(np.nonzero(m)[0])
        keys.append(lo.astype(np.int64) * len(p) + hi)
        pts.append(point)
    if not ids:
        return []
    ids = np.concatenate(ids)
    keys = np.concatenate(keys)
    pts = np.concatenate(pts)
    order = np.argsort(ids, kind="stable")
    keys = keys[order].reshape(-1, 2)
    pts = pts[order].reshape(-1, 2, 3)

    adjacency: dict[int, list[int]] = {}
    coordinate: dict[int, np.ndarray] = {}
    for (k1, k2), (p1, p2) in zip(keys, pts):
        coordinate[k1] = p1[:2]
        coordinate[k2] = p2[:2]
        adjacency.setdefault(int(k1), []).append(int(k2))
        adjacency.setdefault(int(k2), []).append(int(k1))

    seen: set[int] = set()
    loops: list[np.ndarray] = []
    for k in adjacency:  # walk edge to edge until the loop closes
        if k in seen:
            continue
        loop = [k]
        prev, cur = None, k
        seen.add(k)
        while True:
            neighbours = [
                x for x in adjacency[cur] if x != prev and (x not in seen or x == loop[0])
            ]
            if not neighbours:
                break
            nxt = neighbours[0]
            if nxt == loop[0]:
                break
            loop.append(nxt)
            seen.add(nxt)
            prev, cur = cur, nxt
        if len(loop) >= 3:
            loops.append(np.array([coordinate[x] for x in loop]))
    return loops
