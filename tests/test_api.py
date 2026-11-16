from __future__ import annotations

import json
import struct
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from dynadio_api.app import create_app

from .conftest import REFERENCE


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    workspace = tmp_path_factory.mktemp("dynadio-api")
    app = create_app(workspace=workspace, static_dir=workspace / "no-static")
    with TestClient(app) as c:
        yield c


def _demo(client, sample="jet.stl"):
    response = client.post("/api/demo", json={"sample": sample})
    assert response.status_code == 200, response.text
    return response.json()["model"]


def _wait(client, job_id, timeout=30.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = client.get(f"/api/jobs/{job_id}").json()
        if last["status"] in ("complete", "error", "cancelled"):
            return last
        time.sleep(0.05)
    raise AssertionError(f"job did not finish: {last}")


def _parse_strokes(data: bytes):
    assert data[:4] == b"DDS1"
    count = struct.unpack("<I", data[4:8])[0]
    offset = 8
    arrays = []
    for _ in range(count):
        n = struct.unpack("<I", data[offset : offset + 4])[0]
        offset += 4
        arr = np.frombuffer(data[offset : offset + n * 12], dtype="<f4").reshape(-1, 3)
        offset += n * 12
        arrays.append(arr)
    assert offset == len(data)
    return arrays


def test_health_and_schema(client):
    health = client.get("/api/health").json()
    assert health["ok"] is True
    schema = client.get("/api/schema").json()
    assert len(schema["settings"]) >= 20
    assert any(s["key"] == "pitch" for s in schema["settings"])
    assert set(schema["presets"]) == {"process", "machine", "needle"}


def test_jet_job_matches_golden_and_binary_transfer(client):
    model = _demo(client, "jet.stl")
    response = client.post(
        "/api/jobs",
        json={"model_id": model["id"], "settings": {"up_axis": "x", "length": 9.7}},
    )
    assert response.status_code == 200, response.text
    job = _wait(client, response.json()["id"])
    assert job["status"] == "complete", job

    result = client.get(f"/api/jobs/{job['id']}/result").json()
    s = result["stats"]
    assert (s["layers"], s["strokes"], s["spirals"], s["flat"], s["points"]) == (
        75,
        11,
        4,
        7,
        7754,
    )
    assert len(result["pump_events"]) > 10
    assert result["simulation"]["gel_ml"] > 0

    raw = client.get(f"/api/jobs/{job['id']}/strokes").content
    strokes = _parse_strokes(raw)
    assert len(strokes) == 11
    assert sum(len(x) for x in strokes) == 7754
    combined = np.vstack(strokes)
    assert combined[:, 2].min() == pytest.approx(result["stats"]["bounds_min"][2], abs=1e-4)
    assert combined[:, 2].max() == pytest.approx(result["stats"]["bounds_max"][2], abs=1e-4)

    gcode = client.get(f"/api/jobs/{job['id']}/gcode").text
    expected = (REFERENCE / "out_default.gcode").read_text(encoding="utf-8")
    ours_lines = [
        line for line in gcode.splitlines() if line.strip() and not line.startswith(";")
    ]
    ref_lines = [
        line for line in expected.splitlines() if line.strip() and not line.startswith(";")
    ]
    assert ours_lines == ref_lines


def test_sse_stream_completes(client):
    model = _demo(client, "cube.stl")
    job_id = client.post(
        "/api/jobs", json={"model_id": model["id"], "settings": {"up_axis": "z"}}
    ).json()["id"]
    _wait(client, job_id)
    with client.stream("GET", f"/api/jobs/{job_id}/events") as response:
        text = "".join(response.iter_text())
    assert "event: progress" in text
    assert "event: complete" in text
    assert '"percent":100.0' in text


def test_cancel_stops_a_long_job(client):
    model = _demo(client, "torus.stl")
    job_id = client.post(
        "/api/jobs", json={"model_id": model["id"], "settings": {"up_axis": "z"}}
    ).json()["id"]
    time.sleep(0.15)
    cancelled = client.post(f"/api/jobs/{job_id}/cancel").json()
    assert cancelled["status"] in ("cancelling", "cancelled")
    final = _wait(client, job_id)
    assert final["status"] == "cancelled"
    assert client.get(f"/api/jobs/{job_id}/result").status_code == 409


def test_bad_settings_give_a_clear_422(client):
    model = _demo(client, "cube.stl")
    response = client.post(
        "/api/jobs",
        json={"model_id": model["id"], "settings": {"pitch": 99}},
    )
    assert response.status_code == 422
    assert "Layer distance" in response.json()["detail"]


def test_mesh_transform_returns_float32_triangles(client):
    model = _demo(client, "cube.stl")
    response = client.post(
        f"/api/models/{model['id']}/mesh",
        json={"settings": {"up_axis": "z", "length": 9.7, "tilt": 0}},
    )
    assert response.status_code == 200
    assert response.headers["x-triangle-count"] == "12"
    arr = np.frombuffer(response.content, dtype="<f4").reshape(-1, 3)
    assert arr.shape == (36, 3)
    lo = [float(v) for v in response.headers["x-bounds-min"].split(",")]
    hi = [float(v) for v in response.headers["x-bounds-max"].split(",")]
    assert hi[2] - lo[2] == pytest.approx(9.7, abs=1e-4)
    assert lo[2] == pytest.approx(0.0, abs=1e-5)


def test_orient_suggests_a_fitting_axis(client):
    model = _demo(client, "jet.stl")
    response = client.post(
        f"/api/models/{model['id']}/orient",
        json={"strategy": "auto", "settings": {}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["up_axis"] in "xyz"
    assert len(data["candidates"]) == 3


def test_profile_validation_endpoint(client):
    profile = {
        "schema": 1,
        "kind": "process",
        "name": "test",
        "values": {"pitch": 0.2, "future_key": True},
    }
    response = client.post("/api/profiles/validate", json={"profile": profile})
    assert response.status_code == 200
    data = response.json()
    assert data["profile"]["values"]["pitch"] == 0.2
    assert "future_key" in data["unknown"]
