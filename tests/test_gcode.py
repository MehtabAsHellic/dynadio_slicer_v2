from __future__ import annotations

import re

import numpy as np
import pytest

from dynadio_core.gcode import build_gcode, editable_gcode_prefix, editable_gcode_suffix
from dynadio_core.settings import Settings
from dynadio_core.simulate import simulate_gcode


def _stroke_segments(gcode: str) -> list[list[str]]:
    segments: list[list[str]] = []
    current: list[str] | None = None
    for line in gcode.splitlines():
        if line.startswith("; ---- stroke"):
            current = []
            segments.append(current)
        elif current is not None:
            if line.strip() == "M2" or line.strip() == "":
                current = None
            elif not line.strip().startswith(";"):
                current.append(line.strip())
    return segments


def test_every_stroke_has_the_exact_pump_sequence(jet):
    segments = _stroke_segments(jet.gcode)
    assert len(segments) == len(jet.strokes)
    kick = jet.settings.get("kick")
    draw = jet.settings.get("draw")
    dwell = jet.settings.get("dwell")
    for lines, stroke in zip(segments, jet.strokes):
        assert lines[0].startswith("G1 ")
        assert lines[1] == f"M3 S{kick}"
        assert lines[2].startswith("G1 ")
        assert lines[3] == f"M3 S{draw}"
        assert lines[-2] == "M5"
        assert lines[-1] == f"G4 P{dwell:g}"
        assert all(line.startswith("G1 ") for line in lines[4:-2])
        # travel + kick step + all remaining draw steps, plus M3/M3/M5/G4
        assert len(lines) == len(stroke) + 4


def test_pump_is_never_on_during_travel(jet):
    segments = _stroke_segments(jet.gcode)
    for lines in segments:
        # The first line of every stroke is travel and comes before the first M3.
        assert lines[0].startswith("G1 ")
        first_m3 = next(i for i, line in enumerate(lines) if line.startswith("M3 "))
        assert first_m3 > 0
        assert all(line.startswith("G1 ") for line in lines[:first_m3])


def test_file_start_and_end(jet):
    lines = [
        line for line in jet.gcode.splitlines() if line.strip() and not line.startswith(";")
    ]
    assert lines[:5] == ["G21", "G90", "G94", "M5", "G1 F500"]
    assert lines[-2:] == ["M5", "M2"]
    assert jet.gcode.endswith("\n")
    assert "\r" not in jet.gcode


def test_editable_start_and_end_code_are_used():
    s = Settings(
        {
            "start_gcode": "G21\nG90\nM5\nG1 F{feed:g}\n; custom start",
            "end_gcode": "M5\nM2\n; custom end",
        }
    )
    result = build_gcode(
        [np.array([[0.0, 0.0, 1.0], [1.0, 0.0, 1.0], [2.0, 0.0, 1.0]])],
        ["flat"],
        [[(0, 0), (0, 0)]],
        s,
        model_name="test.stl",
        scale=1.0,
        layer_count=1,
        top_z=1.0,
    )
    assert "; custom start" in result
    assert "; custom end" in result
    assert result.splitlines()[-2:] == ["M2", "; custom end"]
    assert editable_gcode_prefix(s)[-1] == "; custom start"
    assert editable_gcode_suffix(s)[-1] == "; custom end"


def test_simulation_matches_hand_calculation_for_one_stroke(jet):
    stroke = jet.strokes[0]
    layer_range = jet.layer_ranges[0]
    gcode = build_gcode(
        [stroke],
        [jet.kinds[0]],
        [[(layer_range[0], 0), (layer_range[1], 0)]],
        jet.settings,
        model_name="one.stl",
        scale=jet.scale,
        layer_count=jet.layer_count,
        top_z=float(jet.zs[-1]),
    )
    sim = simulate_gcode(gcode, jet.settings)
    length = float(np.linalg.norm(np.diff(stroke, axis=0), axis=1).sum())
    travel = float(np.linalg.norm(stroke[0]))  # simulation starts at machine origin
    # The written file rounds each point to 0.001 mm, so allow 1 %.
    expected_time = (
        (length + travel) / jet.settings.get("feed") * 60 + jet.settings.get("dwell")
    )
    expected_gel = (
        jet.settings.get("bead_width") * jet.settings.get("pitch") * length / 1000.0
    )
    assert sim.time_s == pytest.approx(expected_time, rel=0.01)
    assert sim.gel_ml == pytest.approx(expected_gel, rel=0.01)
    assert sim.draw_length_mm == pytest.approx(length, rel=0.01)


def test_simulation_reads_pump_events(jet):
    sim = jet.simulation
    assert sim.time_s > 0
    assert sim.pump_events[0].value == 0
    assert any(e.value == jet.settings.get("kick") for e in sim.pump_events)
    assert any(e.value == jet.settings.get("draw") for e in sim.pump_events)
    assert sim.pump_events[-1].value == 0
    times = [e.time_s for e in sim.pump_events]
    assert times == sorted(times)
