"""Stage 5: link outlines between neighbouring layers.

Outlines whose perimeter ratio stays within 0.65..1.5 are paired one-to-one
with the Hungarian assignment.  A pair continues the same rising spiral only
when its symmetric mean nearest-point distance is below the link limit.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.optimize import linear_sum_assignment


def mean_dist(a: np.ndarray, b: np.ndarray) -> float:
    a = a[::6]
    b = b[::6]
    d = np.hypot(a[:, None, 0] - b[None, :, 0], a[:, None, 1] - b[None, :, 1])
    return float(0.5 * (d.min(1).mean() + d.min(0).mean()))


def link_layers(layers: list[list[dict[str, Any]]], link: float) -> list[list[tuple[int, int]]]:
    """Return chains, each a list of ``(layer, loop_index)`` from bottom to top."""
    nxt: dict[tuple[int, int], tuple[int, int]] = {}
    has_in: set[tuple[int, int]] = set()
    for k in range(len(layers) - 1):
        a_layer, b_layer = layers[k], layers[k + 1]
        if not a_layer or not b_layer:
            continue
        cost = np.full((len(a_layer), len(b_layer)), 1e6)
        for i, a in enumerate(a_layer):
            for j, b in enumerate(b_layer):
                ratio = b["per"] / a["per"]
                if 0.65 < ratio < 1.5:
                    cost[i, j] = mean_dist(a["a"], b["a"])
        rows, cols = linear_sum_assignment(cost)
        for i, j in zip(rows, cols):
            if cost[i, j] < link:
                nxt[(k, i)] = (k + 1, j)
                has_in.add((k + 1, j))
    heads = [
        (k, i)
        for k in range(len(layers))
        for i in range(len(layers[k]))
        if (k, i) not in has_in
    ]
    chains: list[list[tuple[int, int]]] = []
    for head in heads:
        chain = [head]
        while chain[-1] in nxt:
            chain.append(nxt[chain[-1]])
        chains.append(chain)
    return chains


def layered_chains(layers: list[list[dict[str, Any]]]) -> list[list[tuple[int, int]]]:
    """Every cleaned outline is its own chain: pump start/stop at each outline."""
    return [[(k, i)] for k in range(len(layers)) for i in range(len(layers[k]))]
