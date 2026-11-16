"""Stage 4: make every outline printable.

Counter-clockwise, equal-spaced, then Gaussian-rounded corners.  The rounding is
essential: sharp turns trap air bubbles in the gel, so it must not be removed.
"""

from __future__ import annotations

import numpy as np

from .settings import Settings, SettingsError


def perimeter(a: np.ndarray) -> float:
    b = np.vstack([a, a[:1]])
    return float(np.hypot(*np.diff(b, axis=0).T).sum())


def shoelace(a: np.ndarray) -> float:
    return 0.5 * float(
        np.sum(a[:, 0] * np.roll(a[:, 1], -1) - np.roll(a[:, 0], -1) * a[:, 1])
    )


def thickness(a: np.ndarray) -> float:
    """Bead thickness proxy ``2A/P``.  Drops specks and slivers."""
    p = perimeter(a)
    if p <= 1e-12:
        return 0.0
    return 2.0 * abs(shoelace(a)) / p


def prep_loop(a: np.ndarray, settings: Settings) -> np.ndarray | None:
    """Clean one raw loop.  Returns None when the loop is too small to print."""
    if len(a) < 3:
        return None
    if shoelace(a) < 0:
        a = a[::-1]  # every loop counter-clockwise
    p = perimeter(a)
    if p < settings.get("min_perimeter"):
        return None
    b = np.vstack([a, a[:1]])
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(b, axis=0).T))]
    resample = settings.get("resample")
    n = max(int(p / resample), 16)
    t = np.linspace(0, p, n, endpoint=False)
    r = np.c_[np.interp(t, d, b[:, 0]), np.interp(t, d, b[:, 1])]

    sigma = settings.get("corner_softness") / resample
    if sigma > 1e-12:
        k = int(sigma * 3)
        kernel = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2)
        kernel /= kernel.sum()
        pad = np.pad(r, ((k, k), (0, 0)), mode="wrap")
        r = np.stack(
            [np.convolve(pad[:, i], kernel, "valid") for i in range(2)], axis=1
        )

    p2 = perimeter(r)
    if p2 <= 1e-12:
        return None
    area = abs(shoelace(r))
    if p2 < settings.get("min_perimeter_after") or 2 * area / p2 < settings.get("min_thickness"):
        return None
    return r


def ensure_settings(settings: Settings) -> Settings:
    if not isinstance(settings, Settings):
        raise SettingsError("Expected a Settings object.")
    return settings
