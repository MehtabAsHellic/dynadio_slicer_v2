"""Stage 7: order strokes so the needle never travels back down through gel."""

from __future__ import annotations

import numpy as np


def order_strokes(curves: list[np.ndarray], chains: list[list[tuple[int, int]]]) -> list[int]:
    """Return stroke indices in print order.  Curves may be reversed in place."""
    main = max(range(len(curves)), key=lambda i: len(curves[i]))
    remaining = sorted(range(len(curves)), key=lambda i: (chains[i][0][0], i))
    order: list[int] = []
    position = None
    for i in remaining:
        c = curves[i]
        if i == main or position is None:
            if i != main and c[-1][2] < c[0][2]:
                curves[i] = c[::-1].copy()
        elif np.linalg.norm(c[-1] - position) < np.linalg.norm(c[0] - position):
            curves[i] = c[::-1].copy()
        order.append(i)
        position = curves[i][-1]
    return order


def is_closed_curve(curve: np.ndarray, tol: float = 1e-6) -> bool:
    return len(curve) > 3 and float(np.linalg.norm(curve[-1] - curve[0])) <= tol


def optimize_loop_starts(curves: list[np.ndarray], order: list[int]) -> None:
    """Rotate closed loops so each begins nearest the previous stroke's end.

    Only used when the user explicitly enables ``optimize_layer_start``.  The
    loop geometry, point count and closure are preserved exactly.
    """
    if len(order) < 2:
        return
    for n in range(1, len(order)):
        i = order[n]
        curve = curves[i]
        if not is_closed_curve(curve):
            continue
        unique = curve[:-1]
        if len(unique) < 4:
            continue
        previous_end = curves[order[n - 1]][-1]
        j = int(np.hypot(*(unique[:, :2] - previous_end[:2]).T).argmin())
        if j == 0:
            continue
        rotated = np.vstack([unique[j:], unique[:j]])
        curves[i] = np.vstack([rotated, rotated[:1]])
