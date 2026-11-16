from __future__ import annotations

import time

import pytest

from dynadio_core.pipeline import slice_model
from dynadio_core.settings import Settings

from .conftest import REFERENCE


@pytest.mark.slow
def test_jet_slices_in_under_three_seconds():
    started = time.perf_counter()
    slice_model(str(REFERENCE / "f22.stl"), Settings({"up_axis": "x", "length": 9.7}))
    assert time.perf_counter() - started < 3.0


@pytest.mark.slow
def test_torus_slices_in_under_ten_seconds():
    started = time.perf_counter()
    slice_model(str(REFERENCE / "torus.stl"), Settings({"up_axis": "z", "length": 9.7}))
    assert time.perf_counter() - started < 10.0


def test_progress_is_reported_for_every_layer():
    events = []
    slice_model(
        str(REFERENCE / "cube.stl"),
        Settings({"up_axis": "z"}),
        on_progress=lambda stage, done, total: events.append((stage, done, total)),
    )
    slicing = [e for e in events if e[0] == "slice"]
    assert len(slicing) == 75
    assert [e[1] for e in slicing] == list(range(1, 76))
    assert any(e[0] == "done" for e in events)


def test_cancel_stops_between_layers():
    from dynadio_core.pipeline import SliceCancelled

    state = {"layers": 0}

    def progress(stage, done, total):
        if stage == "slice":
            state["layers"] = done

    def cancel():
        return state["layers"] >= 3

    with pytest.raises(SliceCancelled):
        slice_model(
            str(REFERENCE / "torus.stl"),
            Settings({"up_axis": "z"}),
            on_progress=progress,
            should_cancel=cancel,
        )
    assert state["layers"] <= 4
