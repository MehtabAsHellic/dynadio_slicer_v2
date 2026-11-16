"""Stage 6: turn a chain of outlines into one continuous 3D curve."""

from __future__ import annotations

from typing import Any

import numpy as np

from .settings import Settings


def arc_resample(x: np.ndarray, count: int) -> np.ndarray:
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(x, axis=0).T))]
    t = np.linspace(0, d[-1], count)
    return np.c_[np.interp(t, d, x[:, 0]), np.interp(t, d, x[:, 1])]


def chain_curve(
    chain: list[tuple[int, int]],
    layers: list[list[dict[str, Any]]],
    zs: np.ndarray,
    settings: Settings,
) -> np.ndarray:
    """Blend each adjacent pair while Z rises; the last outline is printed flat."""
    parts: list[np.ndarray] = []
    start = 0
    for n, (k, i) in enumerate(chain):
        a = np.roll(layers[k][i]["a"], -start, axis=0)
        aa = np.vstack([a, a[:1]])
        if n == len(chain) - 1:
            parts.append(np.c_[aa, np.full(len(aa), zs[k])])
            break
        k2, j = chain[n + 1]
        b = layers[k2][j]["a"]
        v = int(np.hypot(*(b - aa[0]).T).argmin())
        bb = np.roll(b, -v, axis=0)
        bb = np.vstack([bb, bb[:1]])
        start = v
        count = max(len(aa), len(bb))
        f = np.linspace(0, 1, count)[:, None]
        xy = (1 - f) * arc_resample(aa, count) + f * arc_resample(bb, count)
        parts.append(np.c_[xy, zs[k] + (zs[k2] - zs[k]) * f[:, 0]])
    curve = np.vstack(parts)

    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(curve, axis=0), axis=1))]
    keep = np.r_[True, np.diff(d) > 1e-9]
    curve, d = curve[keep], d[keep]
    step = min(settings.get("step"), max(0.02, float(d[-1]) / 24))
    n = max(int(d[-1] / step), 6)
    t = np.linspace(0, d[-1], n + 1)
    return np.stack([np.interp(t, d, curve[:, j]) for j in range(3)], axis=1)
