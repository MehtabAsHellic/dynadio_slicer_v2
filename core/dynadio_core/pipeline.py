"""The one function everything calls.

``slice_model`` runs stages 1 to 8 and returns everything the command line, the
HTTP API and the interface need.  It has no import from any UI or web package.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np

from . import clean, curves as curves_module, gcode as gcode_module, link as link_module
from .order import optimize_loop_starts, order_strokes
from .orient import orient_and_scale
from .quality import QualityWarning, assess
from .settings import Settings, SettingsError
from .simulate import Simulation, simulate_gcode
from .slicer import Mesh, slice_plane
from .stl import MeshInfo, StlError, inspect_stl

ProgressCallback = Callable[[str, int, int], None]
CancelCallback = Callable[[], bool]


class SliceCancelled(Exception):
    """Raised when the caller asks the slicer to stop."""


@dataclass
class SliceResult:
    strokes: list[np.ndarray]
    kinds: list[str]
    layer_ranges: list[tuple[int, int]]  # 0-based inclusive cuts
    gcode: str
    stats: dict[str, Any]
    warnings: list[QualityWarning]
    mesh_info: MeshInfo
    settings: Settings
    scale: float
    layer_count: int
    zs: np.ndarray
    simulation: Simulation
    model_name: str = ""
    elapsed_s: float = 0.0
    extra: dict[str, Any] = field(default_factory=dict)

    def meta(self) -> dict[str, Any]:
        return {
            "model": self.model_name,
            "scale": self.scale,
            "settings": self.settings.to_json(),
            "layers": self.layer_count,
            "layer_z": [float(z) for z in self.zs],
            "strokes": [
                {
                    "index": i,
                    "kind": kind,
                    "layer_start": int(r[0]),
                    "layer_end": int(r[1]),
                    "points": int(len(stroke)),
                }
                for i, (stroke, kind, r) in enumerate(
                    zip(self.strokes, self.kinds, self.layer_ranges)
                )
            ],
            "stats": self.stats,
            "warnings": [w.to_json() for w in self.warnings],
            "pump_events": [e.to_json() for e in self.simulation.pump_events],
            "simulation": self.simulation.to_json(),
            "mesh": self.mesh_info.to_json(),
            "elapsed_s": self.elapsed_s,
        }


def _check_cancel(should_cancel: CancelCallback | None) -> None:
    if should_cancel is not None and should_cancel():
        raise SliceCancelled("Slicing cancelled.")


def _report(on_progress: ProgressCallback | None, stage: str, done: int, total: int) -> None:
    if on_progress is not None:
        on_progress(stage, int(done), int(total))


def slice_model(
    stl_path: str,
    settings: Settings,
    on_progress: ProgressCallback | None = None,
    should_cancel: CancelCallback | None = None,
) -> SliceResult:
    """Slice one STL file into printable strokes and G-code."""
    import time as _time

    started = _time.perf_counter()
    path = Path(stl_path)
    _report(on_progress, "load", 0, 1)
    mesh_info, triangles = inspect_stl(path, name=path.name)
    _check_cancel(should_cancel)
    _report(on_progress, "load", 1, 1)

    _report(on_progress, "orient", 0, 1)
    try:
        transformed, scale = orient_and_scale(
            triangles,
            up_axis=settings.get("up_axis"),
            length=settings.get("length"),
            tilt_deg=settings.get("tilt"),
            flip=settings.get("flip"),
            offset_x=settings.get("offset_x"),
            offset_y=settings.get("offset_y"),
        )
    except SettingsError:
        raise
    mesh = Mesh(transformed)
    height = float(mesh.P[:, 2].max())
    first_plane = settings.get("first_plane")
    pitch = settings.get("pitch")
    layer_count = int(math.floor((height - first_plane) / pitch)) + 1
    if layer_count < 1:
        raise SettingsError(
            "The model is shorter than the first cut plane. Reduce the first cut height "
            "or increase the model size."
        )
    zs = settings.get("z0") + first_plane + np.arange(layer_count) * pitch
    _report(on_progress, "orient", 1, 1)
    _check_cancel(should_cancel)

    # ---- stage 3 + 4: cut and clean, one progress tick per layer ----------
    layers: list[list[dict[str, Any]]] = []
    bead_width = settings.get("bead_width")
    thin_count = 0
    for k in range(layer_count):
        raw_loops = slice_plane(mesh, first_plane + k * pitch)
        prepared: list[dict[str, Any]] = []
        for raw in raw_loops:
            loop = clean.prep_loop(raw, settings)
            if loop is None:
                continue
            thick = clean.thickness(loop)
            if thick < bead_width:
                thin_count += 1
            prepared.append({"a": loop, "per": clean.perimeter(loop), "thick": thick})
        layers.append(prepared)
        _report(on_progress, "slice", k + 1, layer_count)
        _check_cancel(should_cancel)

    if not any(layers):
        raise SettingsError(
            "No printable outlines were produced. The model may be too small for the "
            "needle, or the layer distance may be larger than the model."
        )

    # ---- stage 5: link or keep every outline separate ----------------------
    method = settings.get("print_method")
    if method == "layered":
        chains = link_module.layered_chains(layers)
        _report(on_progress, "link", layer_count, layer_count)
    else:
        tilt = min(float(settings.get("tilt")), 85.0)
        link_limit = settings.get("link") + pitch * math.tan(math.radians(tilt))
        chains = link_module.link_layers(layers, link_limit)
        _report(on_progress, "link", layer_count, layer_count)
    _check_cancel(should_cancel)

    # ---- stage 6: chains to curves ----------------------------------------
    stroke_curves: list[np.ndarray] = []
    total_chains = len(chains)
    for n, chain in enumerate(chains):
        stroke_curves.append(curves_module.chain_curve(chain, layers, zs, settings))
        _report(on_progress, "curves", n + 1, total_chains)
        if n % 8 == 7:
            _check_cancel(should_cancel)
    _check_cancel(should_cancel)

    # ---- stage 7: order ----------------------------------------------------
    _report(on_progress, "order", 0, 1)
    order = order_strokes(stroke_curves, chains)
    if method == "layered" and settings.get("optimize_layer_start"):
        optimize_loop_starts(stroke_curves, order)
    ordered_curves = [stroke_curves[i] for i in order]
    ordered_chains = [chains[i] for i in order]
    kinds = ["spiral" if len(c) > 1 else "flat" for c in ordered_chains]
    ranges = [(int(c[0][0]), int(c[-1][0])) for c in ordered_chains]
    _report(on_progress, "order", 1, 1)
    _check_cancel(should_cancel)

    # ---- stage 8: G-code ---------------------------------------------------
    _report(on_progress, "gcode", 0, len(ordered_curves))
    top_z = float(zs[-1])
    text = gcode_module.build_gcode(
        ordered_curves,
        kinds,
        ordered_chains,
        settings,
        model_name=path.name,
        scale=scale,
        layer_count=layer_count,
        top_z=top_z,
    )
    _report(on_progress, "gcode", len(ordered_curves), len(ordered_curves))
    _check_cancel(should_cancel)

    simulation = simulate_gcode(text, settings)
    stats = _compute_stats(
        ordered_curves,
        ordered_chains,
        settings,
        scale,
        layer_count,
        top_z,
        zs,
        simulation,
    )

    # ---- quality -----------------------------------------------------------
    all_points = np.vstack(ordered_curves)
    bounds_min = all_points.min(axis=0)
    bounds_max = all_points.max(axis=0)
    spiral_count = sum(1 for k in kinds if k == "spiral")
    flat_count = len(kinds) - spiral_count
    warnings = assess(
        settings,
        mesh_info,
        bounds_min=bounds_min,
        bounds_max=bounds_max,
        layer_count=layer_count,
        z_top=top_z,
        spiral_count=spiral_count,
        flat_count=flat_count,
        thin_count=thin_count,
    )
    warnings.sort(key=lambda w: {"serious": 0, "warning": 1, "info": 2}[w.severity])
    _report(on_progress, "done", 1, 1)

    return SliceResult(
        strokes=ordered_curves,
        kinds=kinds,
        layer_ranges=ranges,
        gcode=text,
        stats=stats,
        warnings=warnings,
        mesh_info=mesh_info,
        settings=settings,
        scale=scale,
        layer_count=layer_count,
        zs=zs,
        simulation=simulation,
        model_name=path.name,
        elapsed_s=_time.perf_counter() - started,
    )


def _compute_stats(
    strokes: list[np.ndarray],
    chains: list[list[tuple[int, int]]],
    settings: Settings,
    scale: float,
    layer_count: int,
    top_z: float,
    zs: np.ndarray,
    simulation: Simulation,
) -> dict[str, Any]:
    all_points = np.vstack(strokes)
    steps = [np.linalg.norm(np.diff(c, axis=0), axis=1) for c in strokes]
    max_step = max((float(s.max()) for s in steps if len(s)), default=0.0)
    travels = [
        float(np.linalg.norm(strokes[n + 1][0] - strokes[n][-1]))
        for n in range(len(strokes) - 1)
    ]
    draw_length = float(sum(float(s.sum()) for s in steps))
    spiral_count = sum(1 for c in chains if len(c) > 1)
    flat_count = len(chains) - spiral_count
    return {
        "layers": int(layer_count),
        "strokes": int(len(strokes)),
        "spirals": int(spiral_count),
        "flat": int(flat_count),
        "points": int(len(all_points)),
        "draw_length_mm": round(draw_length, 4),
        "travel_length_mm": round(simulation.travel_length_mm, 4),
        "total_length_mm": round(draw_length + simulation.travel_length_mm, 4),
        "time_s": round(simulation.time_s, 4),
        "gel_ml": round(simulation.gel_ml, 6),
        "max_step_mm": round(max_step, 5),
        "longest_travel_mm": round(max(travels) if travels else 0.0, 5),
        "scale": round(scale, 8),
        "bounds_min": [round(float(v), 4) for v in all_points.min(axis=0)],
        "bounds_max": [round(float(v), 4) for v in all_points.max(axis=0)],
        "z_top_mm": round(float(zs[-1]), 4),
        "z_first_mm": round(float(zs[0]), 4),
        "bead_width_mm": settings.get("bead_width"),
        "pitch_mm": settings.get("pitch"),
        "method": settings.get("print_method"),
        "layer_z": [round(float(z), 5) for z in zs],
        "elapsed_s": simulation.time_s,
    }


def read_gcode_result(path: str | Path) -> str:
    return Path(path).read_text(encoding="utf-8")
