"""Stage 1: read an STL file and inspect the mesh.

The loader is deliberately byte-compatible with ``reference/airpump_slicer.py``:
a file is binary when ``84 + 50 * triangle_count`` equals its size, otherwise it
is searched for ASCII ``vertex x y z`` triples.  Inspection (open edges, shells,
volume) is extra information for the quality advisor and never changes the
triangles used for slicing.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


class StlError(ValueError):
    """The file is not an STL we can read."""


@dataclass(frozen=True)
class MeshInfo:
    triangles: int
    vertices: int
    min: tuple[float, float, float]
    max: tuple[float, float, float]
    size: tuple[float, float, float]
    watertight: bool
    open_edges: int
    non_manifold_edges: int
    degenerate_triangles: int
    shells: int
    volume_mm3: float
    inverted: bool
    name: str = ""

    @property
    def dimensions(self) -> tuple[float, float, float]:
        return self.size

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "triangles": self.triangles,
            "vertices": self.vertices,
            "min": list(self.min),
            "max": list(self.max),
            "size": list(self.size),
            "watertight": self.watertight,
            "open_edges": self.open_edges,
            "non_manifold_edges": self.non_manifold_edges,
            "degenerate_triangles": self.degenerate_triangles,
            "shells": self.shells,
            "volume_mm3": self.volume_mm3,
            "inverted": self.inverted,
        }


def load_stl(path: str | Path) -> np.ndarray:
    """Return triangles as an ``(N, 3, 3)`` float array. Binary or ASCII."""
    path = Path(path)
    try:
        b = path.read_bytes()
    except OSError as exc:
        raise StlError(f"Could not open STL file: {exc.strerror or exc}") from None
    if len(b) >= 84:
        n = struct.unpack("<I", b[80:84])[0]
        if 84 + 50 * n == len(b):
            dt = np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")])
            a = np.frombuffer(b[84:], dtype=dt)
            return a["v"].reshape(-1, 3, 3).astype(float)
    txt = b.decode("latin1")
    v = np.array(re.findall(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", txt), dtype=float)
    if len(v) == 0 or len(v) % 3:
        raise StlError("Could not read STL: neither a valid binary nor a valid ASCII STL file.")
    return v.reshape(-1, 3, 3)


def load_stl_bytes(data: bytes) -> np.ndarray:
    """Same loader for an in-memory upload."""
    if len(data) >= 84:
        n = struct.unpack("<I", data[80:84])[0]
        if 84 + 50 * n == len(data):
            dt = np.dtype([("n", "<3f4"), ("v", "<9f4"), ("a", "<u2")])
            a = np.frombuffer(data[84:], dtype=dt)
            return a["v"].reshape(-1, 3, 3).astype(float)
    txt = data.decode("latin1")
    v = np.array(re.findall(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", txt), dtype=float)
    if len(v) == 0 or len(v) % 3:
        raise StlError("Could not read STL: neither a valid binary nor a valid ASCII STL file.")
    return v.reshape(-1, 3, 3)


def weld_vertices(triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Weld by rounding to 6 decimals, exactly as the slicer does."""
    v = np.round(triangles.reshape(-1, 3), 6)
    points, inverse = np.unique(v, axis=0, return_inverse=True)
    return points, inverse.reshape(-1, 3)


def inspect_stl(path: str | Path, *, name: str | None = None) -> tuple[MeshInfo, np.ndarray]:
    """Load the file, compute printability facts and return both."""
    triangles = load_stl(path)
    return inspect_triangles(triangles, name=name or Path(path).name), triangles


def mesh_info(triangles: np.ndarray, name: str = "") -> MeshInfo:
    return inspect_triangles(triangles, name=name)


def inspect_triangles(triangles: np.ndarray, name: str = "") -> MeshInfo:
    if triangles.ndim != 3 or triangles.shape[1:] != (3, 3):
        raise StlError("Could not read STL: the triangle array has an unexpected shape.")
    if len(triangles) == 0:
        raise StlError("Could not read STL: the file contains no triangles.")
    if not np.isfinite(triangles).all():
        raise StlError("Could not read STL: coordinates contain NaN or infinity.")

    points, tri = weld_vertices(triangles)
    lo = points.min(axis=0)
    hi = points.max(axis=0)
    size = hi - lo

    # Geometric normal area catches zero-area triangles.
    e1 = triangles[:, 1] - triangles[:, 0]
    e2 = triangles[:, 2] - triangles[:, 0]
    area2 = np.linalg.norm(np.cross(e1, e2), axis=1)
    degenerate = int(np.count_nonzero(area2 < 1e-14))

    # Each undirected edge should occur exactly twice in a closed surface.
    edges = np.concatenate(
        [
            tri[:, [0, 1]],
            tri[:, [1, 2]],
            tri[:, [2, 0]],
        ],
        axis=0,
    )
    edges = np.sort(edges, axis=1)
    unique_edges, counts = np.unique(edges, axis=0, return_counts=True)
    open_edges = int(np.count_nonzero(counts == 1))
    non_manifold = int(np.count_nonzero(counts > 2))
    watertight = open_edges == 0 and non_manifold == 0

    shells = _count_shells(points, tri)
    signed_volume = float(
        np.einsum("ij,ij->i", triangles[:, 0], np.cross(triangles[:, 1], triangles[:, 2])).sum() / 6.0
    )
    volume = abs(signed_volume)
    inverted = signed_volume < 0

    return MeshInfo(
        name=name,
        triangles=int(len(triangles)),
        vertices=int(len(points)),
        min=tuple(float(v) for v in lo),
        max=tuple(float(v) for v in hi),
        size=tuple(float(v) for v in size),
        watertight=watertight,
        open_edges=open_edges,
        non_manifold_edges=non_manifold,
        degenerate_triangles=degenerate,
        shells=shells,
        volume_mm3=volume,
        inverted=inverted,
    )


def _count_shells(points: np.ndarray, tri: np.ndarray) -> int:
    """Number of connected surface components (separate parts of the model)."""
    if len(points) == 0:
        return 0
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components

    a = np.concatenate([tri[:, 0], tri[:, 1], tri[:, 2]])
    b = np.concatenate([tri[:, 1], tri[:, 2], tri[:, 0]])
    n = len(points)
    graph = coo_matrix((np.ones(len(a)), (a, b)), shape=(n, n))
    graph = graph + graph.T
    count, _ = connected_components(graph, directed=False)
    return int(count)


_PRINT_AXES = {"x": (1, 2, 0), "y": (2, 0, 1), "z": (0, 1, 2)}


def choose_up_axis(
    triangles: np.ndarray,
    *,
    strategy: str = "auto",
    bed_x: float | None = None,
    bed_y: float | None = None,
    max_z: float | None = None,
) -> dict[str, Any]:
    """Suggest an up axis.

    ``auto`` stands the model on its longest dimension (the usual upright
    orientation), ``flat`` lays it on its largest face.  Both prefer an axis
    whose scaled footprint fits the bed.  The caller writes the answer back to
    the ordinary ``up_axis`` setting, so nothing hidden happens in the slicer.
    """
    ext = np.ptp(triangles.reshape(-1, 3), axis=0)
    candidates = []
    for up, perm in _PRINT_AXES.items():
        height = float(ext[perm[2]])
        print_x = float(ext[perm[0]])
        print_y = float(ext[perm[1]])
        fits_bed = True
        if bed_x is not None and bed_y is not None:
            fits_bed = print_x <= bed_x + 1e-9 and print_y <= bed_y + 1e-9
        fits_height = max_z is None or height <= max_z + 1e-9
        candidates.append(
            {
                "up_axis": up,
                "height": height,
                "print_x": print_x,
                "print_y": print_y,
                "fits_bed": fits_bed,
                "fits_height": fits_height,
                "score": (
                    0 if fits_bed and fits_height else 1,
                    -height if strategy == "auto" else height,
                ),
            }
        )
    candidates.sort(key=lambda c: c["score"])
    best = dict(candidates[0])
    best.pop("score", None)
    best["strategy"] = strategy
    best["candidates"] = [{k: v for k, v in c.items() if k != "score"} for c in candidates]
    return best


def suggest_up_axis(
    triangles: np.ndarray,
    *,
    bed_x: float | None = None,
    bed_y: float | None = None,
    max_z: float | None = None,
) -> dict[str, Any]:
    """Backwards-compatible shortcut for laying a model flat."""
    return choose_up_axis(
        triangles, strategy="flat", bed_x=bed_x, bed_y=bed_y, max_z=max_z
    )
