from __future__ import annotations

import numpy as np
import pytest

from dynadio_core.orient import orient_and_scale
from dynadio_core.settings import Settings
from dynadio_core.stl import load_stl

from .conftest import REFERENCE


def signed_volume(t: np.ndarray) -> float:
    return float(
        np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() / 6.0
    )


@pytest.mark.parametrize("axis", ["x", "y", "z"])
def test_axis_swap_never_mirrors(axis):
    triangles = load_stl(REFERENCE / "cube.stl")
    before = signed_volume(triangles)
    after_t, scale = orient_and_scale(triangles, axis, 9.7)
    after = signed_volume(after_t)
    assert scale > 0
    assert np.sign(after) == np.sign(before)
    assert abs(after) > 0


def test_scale_is_uniform_and_size_is_exact():
    triangles = load_stl(REFERENCE / "f22.stl")
    t, scale = orient_and_scale(triangles, "x", 9.7)
    raw_ext = np.ptp(triangles.reshape(-1, 3), axis=0)
    out_ext = np.ptp(t.reshape(-1, 3), axis=0)
    expected = raw_ext * scale
    # X and Y are re-centred but their extents are unchanged by centring.
    assert out_ext[0] == pytest.approx(expected[1], abs=1e-9)
    assert out_ext[1] == pytest.approx(expected[2], abs=1e-9)
    assert out_ext[2] == pytest.approx(raw_ext[0] * scale, abs=1e-9)
    assert out_ext[2] == pytest.approx(9.7, abs=1e-9)


def test_lowest_point_at_zero_and_xy_centred():
    triangles = load_stl(REFERENCE / "sphere.stl")
    t, _ = orient_and_scale(triangles, "z", 9.7)
    v = t.reshape(-1, 3)
    assert v[:, 2].min() == pytest.approx(0.0, abs=1e-9)
    assert (v[:, 0].min() + v[:, 0].max()) / 2 == pytest.approx(0.0, abs=1e-9)
    assert (v[:, 1].min() + v[:, 1].max()) / 2 == pytest.approx(0.0, abs=1e-9)


def test_tilt_re_slices_and_stays_above_zero():
    triangles = load_stl(REFERENCE / "cube.stl")
    t, _ = orient_and_scale(triangles, "z", 9.7, tilt_deg=30, flip=False)
    v = t.reshape(-1, 3)
    assert v[:, 2].min() == pytest.approx(0.0, abs=1e-9)
    assert np.ptp(v[:, 2]) > 9.7  # a leaning body is taller in Z


def test_offset_moves_toolpath_without_changing_size():
    triangles = load_stl(REFERENCE / "cube.stl")
    a, _ = orient_and_scale(triangles, "z", 9.7)
    b, _ = orient_and_scale(triangles, "z", 9.7, offset_x=2.0, offset_y=-1.0)
    assert np.ptp(a[:, :, 0]) == pytest.approx(np.ptp(b[:, :, 0]), abs=1e-9)
    assert b[:, :, 0].mean() == pytest.approx(a[:, :, 0].mean() + 2.0, abs=1e-9)


def test_no_height_on_up_axis_is_a_clear_error():
    flat = np.array([[[0.0, 0, 0], [1.0, 0, 0], [0, 1, 0]]])
    from dynadio_core.settings import SettingsError

    with pytest.raises(SettingsError, match="no height"):
        orient_and_scale(flat, "z", 9.7)


def test_settings_defaults_match_reference_values():
    s = Settings()
    assert s.get("length") == 9.7
    assert s.get("pitch") == 0.13
    assert s.get("first_plane") == 0.03
    assert s.get("z0") == 0.3
    assert s.get("feed") == 500
    assert s.get("kick") == 1000
    assert s.get("draw") == 350
    assert s.get("dwell") == 0.05
    assert s.get("step") == 0.065
    assert s.get("resample") == 0.015
    assert s.get("corner_softness") == 0.075
    assert s.get("link") == 0.22
