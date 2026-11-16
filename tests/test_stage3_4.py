from __future__ import annotations

import numpy as np
import pytest

from dynadio_core.clean import perimeter, prep_loop, shoelace, thickness
from dynadio_core.orient import orient_and_scale
from dynadio_core.settings import Settings
from dynadio_core.slicer import Mesh, slice_plane
from dynadio_core.stl import load_stl

from .conftest import REFERENCE


def test_cube_half_height_is_one_closed_square():
    triangles = load_stl(REFERENCE / "cube.stl")
    t, _ = orient_and_scale(triangles, "z", 9.7)
    loops = slice_plane(Mesh(t), 4.85)
    assert len(loops) == 1
    loop = loops[0]
    ext = np.ptp(loop, axis=0)
    assert ext[0] == pytest.approx(9.7, abs=1e-9)
    assert ext[1] == pytest.approx(9.7, abs=1e-9)
    assert abs(shoelace(loop)) == pytest.approx(9.7 * 9.7, rel=1e-9)


def test_sphere_radius_at_the_middle():
    triangles = load_stl(REFERENCE / "sphere.stl")
    t, _ = orient_and_scale(triangles, "z", 9.7)
    loops = slice_plane(Mesh(t), 4.85)
    assert len(loops) == 1
    r = np.hypot(loops[0][:, 0], loops[0][:, 1])
    assert r.mean() == pytest.approx(4.85, abs=0.02)
    assert r.std() < 0.02


def test_torus_has_two_rings_per_layer():
    triangles = load_stl(REFERENCE / "torus.stl")
    t, _ = orient_and_scale(triangles, "z", 9.7)
    loops = slice_plane(Mesh(t), 4.85)
    assert len(loops) == 2
    radii = sorted(float(np.hypot(loop[:, 0], loop[:, 1]).mean()) for loop in loops)
    assert radii[0] == pytest.approx(9.75, abs=0.1)
    assert radii[1] == pytest.approx(19.5, abs=0.1)


def test_clean_makes_ccw_equal_spacing():
    theta = np.linspace(0, 2 * np.pi, 97, endpoint=False)
    circle = np.c_[5 * np.cos(theta), 5 * np.sin(theta)]
    cleaned = prep_loop(circle[::-1], Settings())
    assert cleaned is not None
    assert shoelace(cleaned) > 0
    seg = np.linalg.norm(np.diff(np.vstack([cleaned, cleaned[:1]]), axis=0), axis=1)
    spacing = perimeter(cleaned) / len(cleaned)
    assert spacing == pytest.approx(0.015, rel=0.01)
    assert seg.max() / seg.min() < 1.01


def test_specks_and_slivers_are_removed():
    tiny = np.array([[0.0, 0.0], [0.05, 0.0], [0.05, 0.05], [0.0, 0.05]])
    assert prep_loop(tiny, Settings()) is None
    sliver = np.array([[0.0, 0.0], [2.0, 0.0], [2.0, 0.01], [0.0, 0.01]])
    assert thickness(sliver) < 0.05
    assert prep_loop(sliver, Settings()) is None


def test_smoothing_rounds_a_square_without_collapsing_it():
    square = np.array([[-5.0, -5.0], [5.0, -5.0], [5.0, 5.0], [-5.0, 5.0]])
    cleaned = prep_loop(square, Settings())
    assert cleaned is not None
    ext = np.ptp(cleaned, axis=0)
    assert ext[0] == pytest.approx(10.0, abs=0.25)
    assert ext[1] == pytest.approx(10.0, abs=0.25)
    # No point may be an exact 90-degree corner any more.
    assert ext[0] < 10.0 and ext[1] < 10.0


def test_corner_softness_is_physical_not_sample_count():
    a = Settings({"corner_softness": 0.075, "resample": 0.015})
    b = Settings({"corner_softness": 0.075, "resample": 0.01})
    assert a.get("corner_softness") / a.get("resample") == pytest.approx(5.0)
    assert b.get("corner_softness") / b.get("resample") == pytest.approx(7.5)
