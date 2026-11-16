"""Shared fixtures.  Golden models are sliced once per test session."""

from __future__ import annotations

from pathlib import Path

import pytest

from dynadio_core.pipeline import SliceResult, slice_model
from dynadio_core.settings import Settings

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference"
SAMPLES = ROOT / "samples"

GOLDEN_AXIS = {"cube.stl": "z", "sphere.stl": "z", "torus.stl": "z", "f22.stl": "x"}


@pytest.fixture(scope="session")
def sliced():
    cache: dict[tuple, SliceResult] = {}

    def get(name: str, **overrides) -> SliceResult:
        axis = overrides.pop("up_axis", GOLDEN_AXIS.get(name, "z"))
        values = {"up_axis": axis, "length": 9.7}
        values.update(overrides)
        key = (name, tuple(sorted(values.items())))
        if key not in cache:
            cache[key] = slice_model(str(REFERENCE / name), Settings(values))
        return cache[key]

    return get


@pytest.fixture(scope="session")
def cube(sliced):
    return sliced("cube.stl")


@pytest.fixture(scope="session")
def sphere(sliced):
    return sliced("sphere.stl")


@pytest.fixture(scope="session")
def torus(sliced):
    return sliced("torus.stl")


@pytest.fixture(scope="session")
def jet(sliced):
    return sliced("f22.stl")
