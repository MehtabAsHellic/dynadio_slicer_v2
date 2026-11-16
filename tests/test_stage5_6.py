from __future__ import annotations

import numpy as np
import pytest

from dynadio_core import clean
from dynadio_core.curves import chain_curve
from dynadio_core.link import link_layers
from dynadio_core.orient import orient_and_scale
from dynadio_core.settings import Settings
from dynadio_core.slicer import Mesh, slice_plane
from dynadio_core.stl import load_stl

from .conftest import REFERENCE


def _prepared_layers(name: str, axis: str, count: int = 75):
    triangles = load_stl(REFERENCE / name)
    t, _ = orient_and_scale(triangles, axis, 9.7)
    mesh = Mesh(t)
    settings = Settings({"up_axis": axis, "length": 9.7})
    layers = []
    for k in range(count):
        prepared = []
        for raw in slice_plane(mesh, 0.03 + k * 0.13):
            loop = clean.prep_loop(raw, settings)
            if loop is not None:
                prepared.append({"a": loop, "per": clean.perimeter(loop)})
        layers.append(prepared)
    return layers, settings


def test_cube_links_all_layers_into_one_chain():
    layers, _ = _prepared_layers("cube.stl", "z")
    chains = link_layers(layers, 0.22)
    assert len(chains) == 1
    assert len(chains[0]) == 75


def test_torus_rings_never_link_to_each_other():
    layers, _ = _prepared_layers("torus.stl", "z")
    chains = link_layers(layers, 0.22)
    assert len(chains) == 22
    long_chains = sorted(chains, key=len, reverse=True)[:2]
    for chain in long_chains:
        radii = []
        for k, i in chain:
            loop = layers[k][i]["a"]
            radii.append(float(np.hypot(loop[:, 0], loop[:, 1]).mean()))
        # Each chain follows one boundary ring; inner and outer rings are ~9.75 mm apart.
        assert max(radii) - min(radii) < 3.0


def test_chain_curve_step_and_z():
    layers, settings = _prepared_layers("cube.stl", "z")
    chains = link_layers(layers, 0.22)
    zs = 0.3 + 0.03 + np.arange(75) * 0.13
    curve = chain_curve(chains[0], layers, zs, settings)
    step = np.linalg.norm(np.diff(curve, axis=0), axis=1)
    assert step.max() <= settings.get("step") + 0.001
    assert np.all(np.diff(curve[:, 2]) >= -1e-9)
    assert curve[0, 2] == pytest.approx(zs[0])
    assert curve[-1, 2] == pytest.approx(zs[-1])


def test_flat_chain_stays_at_one_z():
    layers, settings = _prepared_layers("cube.stl", "z")
    zs = 0.3 + 0.03 + np.arange(75) * 0.13
    chain = [[3, 0]]
    curve = chain_curve(chain, layers, zs, settings)
    assert np.ptp(curve[:, 2]) == pytest.approx(0.0)
    assert np.linalg.norm(curve[0] - curve[-1]) == pytest.approx(0.0, abs=1e-9)
