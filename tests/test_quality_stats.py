from __future__ import annotations

import numpy as np
import pytest

from dynadio_core.settings import Settings


def test_cube_has_no_serious_warnings(cube):
    assert not [w for w in cube.warnings if w.severity == "serious"]
    assert not any(w.code == "mesh_open" for w in cube.warnings)


def test_jet_warning_advice_is_actionable(jet):
    codes = {w.code for w in jet.warnings}
    assert "many_flat_strokes" in codes
    assert "thin_features" in codes
    action = next(w.action for w in jet.warnings if w.code == "many_flat_strokes")
    assert action["kind"] == "settings"
    assert action["values"] == {"print_method": "layered"}


def test_open_sphere_is_reported(sphere):
    assert any(w.code == "mesh_open" for w in sphere.warnings)


def test_oversized_bed_and_height_are_serious(sliced):
    result = sliced("cube.stl", bed_x=5.0, bed_y=5.0, max_z=5.0)
    codes = {w.code for w in result.warnings}
    assert "bed_exceeded" in codes
    assert "height_exceeded" in codes
    bed = next(w for w in result.warnings if w.code == "bed_exceeded")
    assert bed.severity == "serious"
    assert bed.action["kind"] == "settings"
    assert "length" in bed.action["values"]


def test_stats_and_simulation_agree(jet):
    s = jet.stats
    assert s["time_s"] == pytest.approx(jet.simulation.time_s)
    assert s["gel_ml"] == pytest.approx(jet.simulation.gel_ml, abs=5e-7)
    assert s["layers"] == 75
    assert s["z_first_mm"] == pytest.approx(0.33)
    assert s["z_top_mm"] == pytest.approx(9.95)
    assert len(s["layer_z"]) == 75


def test_preview_curves_never_oscillate_in_z(jet):
    # Ordering may print a spiral downward to shorten travel (the reference does
    # this), but no single stroke may go up and down again.
    for stroke in jet.strokes:
        dz = np.diff(stroke[:, 2])
        assert dz.min() >= -1e-9 or dz.max() <= 1e-9


def test_stroke_order_starts_bottom_to_top(jet):
    starts = [r[0] for r in jet.layer_ranges]
    assert starts == sorted(starts)
    longest = max(range(len(jet.strokes)), key=lambda i: len(jet.strokes[i]))
    z = jet.strokes[longest][:, 2]
    assert z[-1] >= z[0]


def test_layered_mode_uses_one_pump_start_per_outline(sliced):
    jet = sliced("f22.stl", print_method="layered")
    assert jet.stats["strokes"] == 87
    assert jet.stats["spirals"] == 0
    assert jet.stats["flat"] == 87


def test_optimize_layer_start_off_by_default_keeps_reference(jet):
    assert jet.settings.get("optimize_layer_start") is False


def test_optimize_layer_start_does_not_change_stroke_count(sliced):
    normal = sliced("f22.stl", print_method="layered")
    optimized = sliced("f22.stl", print_method="layered", optimize_layer_start=True)
    assert optimized.stats["strokes"] == normal.stats["strokes"]
