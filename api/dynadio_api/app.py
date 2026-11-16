"""Local HTTP API for DynaDio Slicer.

The interface talks to this process.  It contains no slicing logic: every
number and every G-code byte comes from ``dynadio_core``.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import struct
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from dynadio_core import __version__
from dynadio_core.gcode import editable_gcode_prefix, editable_gcode_suffix
from dynadio_core.orient import orient_and_scale
from dynadio_core.pipeline import SliceCancelled, SliceResult, slice_model
from dynadio_core.profiles import builtin_profiles, parse_profile
from dynadio_core.settings import Settings, SettingsError, schema_json
from dynadio_core.stl import StlError, choose_up_axis, inspect_stl, load_stl

MAX_UPLOAD_BYTES = 80 * 1024 * 1024
TERMINAL = {"complete", "error", "cancelled"}

STAGE_SPANS = [
    ("load", 3.0),
    ("orient", 2.0),
    ("slice", 55.0),
    ("link", 15.0),
    ("curves", 15.0),
    ("order", 2.0),
    ("gcode", 6.0),
    ("done", 2.0),
]
STAGE_BASE: dict[str, float] = {}
_cursor = 0.0
for _stage, _weight in STAGE_SPANS:
    STAGE_BASE[_stage] = _cursor
    _cursor += _weight


def default_workspace() -> Path:
    return Path(os.environ.get("DYNANADIO_HOME", str(Path.home() / ".dynadio")))


def project_root() -> Path:
    configured_root = os.environ.get("DYNADIO_ROOT")
    if configured_root:
        return Path(configured_root)
    return Path(__file__).resolve().parents[2]


@dataclass
class StoredModel:
    id: str
    name: str
    path: Path
    size_bytes: int
    info: Any
    created: float = field(default_factory=time.time)


@dataclass
class Job:
    id: str
    model: StoredModel
    settings: Settings
    cancel_event: threading.Event = field(default_factory=threading.Event)
    status: str = "queued"
    progress: dict[str, Any] = field(default_factory=dict)
    result: SliceResult | None = None
    error: str | None = None
    started: float = field(default_factory=time.time)
    finished: float | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)
    thread: threading.Thread | None = None

    def start(self) -> None:
        self.status = "running"
        self.progress = {
            "stage": "load",
            "stage_label": "Reading model",
            "done": 0,
            "total": 1,
            "percent": 0.0,
            "layer": 0,
            "layers": 0,
            "elapsed_s": 0.0,
            "eta_s": None,
        }
        self.thread = threading.Thread(target=self._run, name=f"slice-{self.id}", daemon=True)
        self.thread.start()

    def _run(self) -> None:
        try:
            result = slice_model(
                str(self.model.path),
                self.settings,
                on_progress=self._progress,
                should_cancel=self.cancel_event.is_set,
            )
        except SliceCancelled:
            with self.lock:
                self.status = "cancelled"
                self.finished = time.time()
            return
        except SettingsError as exc:
            with self.lock:
                self.status = "error"
                self.error = str(exc)
                self.finished = time.time()
            return
        except StlError as exc:
            with self.lock:
                self.status = "error"
                self.error = str(exc)
                self.finished = time.time()
            return
        except Exception as exc:  # pragma: no cover - last line of defence
            with self.lock:
                self.status = "error"
                self.error = f"Slicing failed: {exc}"
                self.finished = time.time()
            return
        with self.lock:
            self.result = result
            self.status = "complete"
            self.finished = time.time()
            self.progress = {
                **self.progress,
                "stage": "done",
                "stage_label": "Finished",
                "percent": 100.0,
                "elapsed_s": round(self.finished - self.started, 3),
                "eta_s": 0.0,
            }

    def _progress(self, stage: str, done: int, total: int) -> None:
        with self.lock:
            if self.status == "cancelled":
                return
            span = dict(STAGE_SPANS).get(stage, 1.0)
            base = STAGE_BASE.get(stage, 0.0)
            fraction = (done / total) if total else 0.0
            percent = min(100.0, base + span * fraction) if stage != "done" else 100.0
            elapsed = time.time() - self.started
            eta = None
            if percent >= 3 and percent < 100:
                eta = max(0.0, elapsed * (100.0 - percent) / percent)
            labels = {
                "load": "Reading model",
                "orient": "Orienting model",
                "slice": "Slicing layers",
                "link": "Linking outlines",
                "curves": "Building spirals",
                "order": "Ordering strokes",
                "gcode": "Writing G-code",
                "done": "Finished",
            }
            old_layers = self.progress.get("layers", 0)
            layers = total if stage == "slice" else old_layers
            self.progress = {
                "stage": stage,
                "stage_label": labels.get(stage, stage.title()),
                "done": done,
                "total": total,
                "percent": round(percent, 2),
                "layer": done if stage == "slice" else old_layers,
                # The API reports layer progress as 1-based for humans.
                "layer_index": done if stage == "slice" else old_layers,
                "layers": layers,
                "elapsed_s": round(elapsed, 3),
                "eta_s": round(eta, 2) if eta is not None else None,
            }

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            data = {
                "id": self.id,
                "status": self.status,
                "model": self.model.name,
                "progress": dict(self.progress),
                "error": self.error,
                "started": round(self.started, 3),
            }
            if self.finished is not None:
                data["elapsed_s"] = round(self.finished - self.started, 3)
            return data


def encode_strokes(strokes: list[np.ndarray]) -> bytes:
    chunks = [b"DDS1", struct.pack("<I", len(strokes))]
    for stroke in strokes:
        arr = np.ascontiguousarray(stroke, dtype="<f4")
        chunks.append(struct.pack("<I", len(arr)))
        chunks.append(arr.tobytes())
    return b"".join(chunks)


class SettingsBody(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class JobBody(BaseModel):
    model_id: str
    settings: dict[str, Any] = Field(default_factory=dict)


class DemoBody(BaseModel):
    sample: str = "jet.stl"


class OrientBody(BaseModel):
    strategy: str = "auto"
    settings: dict[str, Any] = Field(default_factory=dict)


class ProfileBody(BaseModel):
    profile: dict[str, Any]


def _settings_from_partial(values: dict[str, Any] | None) -> Settings:
    base = Settings()
    if values:
        return base.replace(values)
    return base


def create_app(
    workspace: str | Path | None = None,
    static_dir: str | Path | None = None,
) -> FastAPI:
    ws = Path(workspace) if workspace else default_workspace()
    models_dir = ws / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    static = Path(static_dir) if static_dir else project_root() / "ui" / "dist"

    app = FastAPI(title="DynaDio Slicer API", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.workspace = ws
    app.state.models = {}
    app.state.jobs = {}
    app.state.models_lock = threading.Lock()
    app.state.jobs_lock = threading.Lock()

    @app.exception_handler(SettingsError)
    async def settings_error_handler(_request: Request, exc: SettingsError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(StlError)
    async def stl_error_handler(_request: Request, exc: StlError):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    # ------------------------------------------------------------------ meta
    @app.get("/api/health")
    def health():
        return {
            "ok": True,
            "app": "DynaDio Slicer",
            "version": __version__,
            "workspace": str(ws),
        }

    @app.get("/api/schema")
    def schema():
        data = schema_json()
        data["presets"] = builtin_profiles()
        data["version"] = __version__
        data["limits"] = {"max_upload_bytes": MAX_UPLOAD_BYTES}
        data["templates"] = {
            "start": editable_gcode_prefix(Settings()),
            "end": editable_gcode_suffix(Settings()),
        }
        return data

    @app.get("/api/presets")
    def presets():
        return {"presets": builtin_profiles()}

    @app.get("/api/samples")
    def samples():
        samples_dir = project_root() / "samples"
        found = []
        if samples_dir.exists():
            for path in sorted(samples_dir.glob("*.stl")):
                found.append(
                    {
                        "id": path.name,
                        "name": path.name,
                        "size_bytes": path.stat().st_size,
                    }
                )
        return {"samples": found}

    # ------------------------------------------------------------------ models
    def store_model(source_path: Path, display_name: str) -> StoredModel:
        model_id = uuid.uuid4().hex
        directory = models_dir / model_id
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / display_name
        shutil.copyfile(source_path, target)
        info, _triangles = inspect_stl(target, name=display_name)
        model = StoredModel(
            id=model_id,
            name=display_name,
            path=target,
            size_bytes=target.stat().st_size,
            info=info,
        )
        app.state.models[model_id] = model
        return model

    def get_model(model_id: str) -> StoredModel:
        model = app.state.models.get(model_id)
        if model is None:
            raise HTTPException(status_code=404, detail="Model not found. Open the file again.")
        return model

    @app.post("/api/upload")
    async def upload(file: UploadFile = File(...)):
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="The file is empty.")
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"The file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )
        safe_name = Path(file.filename or "model.stl").name
        if not safe_name.lower().endswith(".stl"):
            safe_name += ".stl"
        model_id = uuid.uuid4().hex
        directory = models_dir / model_id
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / safe_name
        target.write_bytes(raw)
        try:
            info, _triangles = inspect_stl(target, name=safe_name)
        except StlError as exc:
            shutil.rmtree(directory, ignore_errors=True)
            raise HTTPException(status_code=422, detail=str(exc)) from None
        model = StoredModel(
            id=model_id,
            name=safe_name,
            path=target,
            size_bytes=len(raw),
            info=info,
        )
        app.state.models[model_id] = model
        return {"model": {**_model_json(model)}}

    @app.post("/api/demo")
    def demo(body: DemoBody | None = None):
        requested = (body.sample if body else "jet.stl") or "jet.stl"
        sample_name = Path(requested).name
        source = project_root() / "samples" / sample_name
        if not source.exists():
            fallback = project_root() / "reference" / "f22.stl"
            if fallback.exists():
                source = fallback
                sample_name = "f22.stl"
            else:
                raise HTTPException(status_code=404, detail="Demo model is not installed.")
        model = store_model(source, sample_name)
        return {"model": {**_model_json(model)}}

    def _model_json(model: StoredModel) -> dict[str, Any]:
        return {
            "id": model.id,
            "name": model.name,
            "size_bytes": model.size_bytes,
            "mesh": model.info.to_json(),
        }

    @app.get("/api/models/{model_id}")
    def model_info(model_id: str):
        return {"model": _model_json(get_model(model_id))}

    @app.post("/api/models/{model_id}/mesh")
    def model_mesh(model_id: str, body: SettingsBody):
        model = get_model(model_id)
        settings = _settings_from_partial(body.settings)
        triangles = load_stl(model.path)
        transformed, scale = orient_and_scale(
            triangles,
            up_axis=settings.get("up_axis"),
            length=settings.get("length"),
            tilt_deg=settings.get("tilt"),
            flip=settings.get("flip"),
            offset_x=settings.get("offset_x"),
            offset_y=settings.get("offset_y"),
        )
        arr = np.ascontiguousarray(transformed.reshape(-1, 3), dtype="<f4")
        v = transformed.reshape(-1, 3)
        headers = {
            "X-Triangle-Count": str(len(transformed)),
            "X-Bounds-Min": ",".join(f"{x:.5f}" for x in v.min(axis=0)),
            "X-Bounds-Max": ",".join(f"{x:.5f}" for x in v.max(axis=0)),
            "X-Scale": f"{scale:.8f}",
            "Cache-Control": "no-store",
        }
        return Response(content=arr.tobytes(), media_type="application/octet-stream", headers=headers)

    @app.post("/api/models/{model_id}/orient")
    def orient(model_id: str, body: OrientBody):
        model = get_model(model_id)
        settings = _settings_from_partial(body.settings)
        triangles = load_stl(model.path)
        strategy = body.strategy if body.strategy in ("auto", "flat") else "auto"
        result = choose_up_axis(
            triangles,
            strategy=strategy,
            bed_x=settings.get("bed_x"),
            bed_y=settings.get("bed_y"),
            max_z=settings.get("max_z"),
        )
        return result

    # ------------------------------------------------------------------ jobs
    @app.post("/api/jobs")
    def start_job(body: JobBody):
        model = get_model(body.model_id)
        settings = _settings_from_partial(body.settings)
        job = Job(id=uuid.uuid4().hex, model=model, settings=settings)
        app.state.jobs[job.id] = job
        job.start()
        return job.snapshot()

    def get_job(job_id: str) -> Job:
        job = app.state.jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Slice job not found.")
        return job

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str):
        return get_job(job_id).snapshot()

    @app.post("/api/jobs/{job_id}/cancel")
    def cancel_job(job_id: str):
        job = get_job(job_id)
        with job.lock:
            if job.status in TERMINAL:
                return job.snapshot()
            job.cancel_event.set()
            job.status = "cancelling"
            job.progress = {**job.progress, "stage_label": "Cancelling"}
        return job.snapshot()

    @app.get("/api/jobs/{job_id}/events")
    async def job_events(job_id: str):
        job = get_job(job_id)

        async def stream():
            last_payload = None
            while True:
                snap = job.snapshot()
                payload = json.dumps(snap, separators=(",", ":"))
                if payload != last_payload:
                    yield f"event: progress\ndata: {payload}\n\n"
                    last_payload = payload
                status = snap["status"]
                if status in TERMINAL:
                    event = {
                        "complete": "complete",
                        "error": "error",
                        "cancelled": "cancelled",
                    }[status]
                    yield f"event: {event}\ndata: {payload}\n\n"
                    break
                await asyncio.sleep(0.08)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    def require_result(job_id: str) -> Job:
        job = get_job(job_id)
        if job.status != "complete" or job.result is None:
            raise HTTPException(
                status_code=409,
                detail=f"The job is {job.status}; no result is available.",
            )
        return job

    @app.get("/api/jobs/{job_id}/result")
    def job_result(job_id: str):
        job = require_result(job_id)
        meta = job.result.meta()
        meta["job_id"] = job_id
        meta["model_id"] = job.model.id
        meta["elapsed_s"] = round((job.finished or time.time()) - job.started, 3)
        meta["estimated"] = True
        return meta

    @app.get("/api/jobs/{job_id}/strokes")
    def job_strokes(job_id: str):
        job = require_result(job_id)
        return Response(
            content=encode_strokes(job.result.strokes),
            media_type="application/octet-stream",
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/jobs/{job_id}/gcode")
    def job_gcode(job_id: str, download: bool = False):
        job = require_result(job_id)
        headers = {"Cache-Control": "no-store"}
        if download:
            filename = Path(job.model.name).stem + ".gcode"
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return Response(
            content=job.result.gcode,
            media_type="text/plain; charset=utf-8",
            headers=headers,
        )

    # ------------------------------------------------------------------ profiles
    @app.post("/api/profiles/validate")
    def validate_profile(body: ProfileBody):
        profile = parse_profile(body.profile)
        settings, unknown = profile.apply()
        return {
            "profile": profile.to_json(),
            "unknown": unknown,
            "values": settings.to_json(profile.kind if profile.kind != "process" else "process"),
        }

    # ------------------------------------------------------------------ static UI
    if static.exists() and (static / "index.html").exists():
        from fastapi.staticfiles import StaticFiles

        assets = static / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not found.")
            candidate = static / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(static / "index.html")

    return app


app = create_app()
