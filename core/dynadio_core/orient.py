"""Stage 2: up-axis swap, uniform scale, tilt and placement.

A cyclic permutation is used for the up axis so the model is never mirrored.
Scaling is uniform: ``length / extent along the new Z``.  Tilt is a true
re-orientation of the triangles, not a rotation of an already sliced toolpath.
"""

from __future__ import annotations

import math

import numpy as np

from .settings import Settings, SettingsError

_PERMUTATIONS = {
    "x": (1, 2, 0),
    "y": (2, 0, 1),
    "z": (0, 1, 2),
}


def orient_and_scale(
    triangles: np.ndarray,
    up_axis: str,
    length: float,
    tilt_deg: float = 0.0,
    flip: bool = False,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> tuple[np.ndarray, float]:
    """Return transformed triangles and the uniform scale used."""
    if up_axis not in _PERMUTATIONS:
        raise SettingsError("Up axis must be one of: x, y, z.")
    t = triangles[:, :, _PERMUTATIONS[up_axis]].copy()
    ext = np.ptp(t.reshape(-1, 3), axis=0)
    if not math.isfinite(float(ext[2])) or ext[2] <= 1e-12:
        raise SettingsError(
            "The model has no height along the chosen up axis. Choose another up axis."
        )
    scale = float(length / ext[2])
    t *= scale
    if tilt_deg:
        angle = math.radians(-tilt_deg if flip else tilt_deg)
        c, s = math.cos(angle), math.sin(angle)
        y, z = t[:, :, 1].copy(), t[:, :, 2].copy()
        t[:, :, 1] = y * c - z * s
        t[:, :, 2] = y * s + z * c
    v = t.reshape(-1, 3)
    lo, hi = v.min(0), v.max(0)
    t[:, :, 0] -= (lo[0] + hi[0]) / 2
    t[:, :, 1] -= (lo[1] + hi[1]) / 2
    t[:, :, 2] -= lo[2]
    if offset_x:
        t[:, :, 0] += offset_x
    if offset_y:
        t[:, :, 1] += offset_y
    return t, scale


def orient_from_settings(triangles: np.ndarray, settings: Settings) -> tuple[np.ndarray, float]:
    return orient_and_scale(
        triangles,
        up_axis=settings.get("up_axis"),
        length=settings.get("length"),
        tilt_deg=settings.get("tilt"),
        flip=settings.get("flip"),
        offset_x=settings.get("offset_x"),
        offset_y=settings.get("offset_y"),
    )
