from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from dynadio_core.stl import StlError, inspect_stl, inspect_triangles, load_stl, load_stl_bytes

from .conftest import REFERENCE


def _write_ascii(path: Path, triangles: np.ndarray) -> None:
    lines = ["solid test"]
    for tri in triangles:
        lines.append("  facet normal 0 0 0")
        lines.append("    outer loop")
        for v in tri:
            lines.append(f"      vertex {float(v[0])!r} {float(v[1])!r} {float(v[2])!r}")
        lines.append("    endloop")
        lines.append("  endfacet")
    lines.append("endsolid test")
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


def test_cube_binary_and_ascii_are_identical(tmp_path):
    binary = load_stl(REFERENCE / "cube.stl")
    ascii_path = tmp_path / "cube_ascii.stl"
    _write_ascii(ascii_path, binary)
    ascii_tris = load_stl(ascii_path)
    assert binary.shape == ascii_tris.shape
    assert np.array_equal(binary, ascii_tris)
    assert np.array_equal(load_stl_bytes(ascii_path.read_bytes()), binary)


def test_broken_file_is_rejected(tmp_path):
    path = tmp_path / "broken.stl"
    path.write_text("this is not a model", encoding="utf-8")
    with pytest.raises(StlError, match="Could not read STL"):
        load_stl(path)


def test_missing_file_is_clear(tmp_path):
    with pytest.raises(StlError, match="Could not open STL"):
        load_stl(tmp_path / "nope.stl")


def test_cube_is_watertight():
    info, triangles = inspect_stl(REFERENCE / "cube.stl")
    assert info.triangles == 12
    assert info.vertices == 8
    assert info.watertight is True
    assert info.open_edges == 0
    assert info.shells == 1
    assert info.volume_mm3 == pytest.approx(1.0)
    assert info.size == pytest.approx((1.0, 1.0, 1.0))


def test_sphere_is_open_on_purpose():
    info, _ = inspect_stl(REFERENCE / "sphere.stl")
    assert info.watertight is False
    assert info.open_edges > 0


def test_jet_facts():
    info, _ = inspect_stl(REFERENCE / "f22.stl")
    assert info.triangles > 1000
    assert info.shells == 1
    assert info.size[0] > info.size[1]
    assert not np.isnan(info.volume_mm3)
