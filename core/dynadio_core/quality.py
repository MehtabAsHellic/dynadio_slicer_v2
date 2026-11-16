"""Printability warnings: what, why and how to fix it.

Warnings never block slicing.  They are computed from the model, the final
toolpath and the machine profile and are returned with the slice result.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

import numpy as np

from .settings import Settings
from .stl import MeshInfo


@dataclass(frozen=True)
class QualityWarning:
    code: str
    severity: str  # "info" | "warning" | "serious"
    title: str
    detail: str
    fix: str
    action: dict[str, Any] | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "title": self.title,
            "detail": self.detail,
            "fix": self.fix,
            "action": self.action,
        }


def assess(
    settings: Settings,
    mesh: MeshInfo,
    *,
    bounds_min: np.ndarray,
    bounds_max: np.ndarray,
    layer_count: int,
    z_top: float,
    spiral_count: int,
    flat_count: int,
    thin_count: int = 0,
) -> list[QualityWarning]:
    warnings: list[QualityWarning] = []
    bed_x = settings.get("bed_x")
    bed_y = settings.get("bed_y")
    max_z = settings.get("max_z")
    width = float(bounds_max[0] - bounds_min[0])
    depth = float(bounds_max[1] - bounds_min[1])
    minimum_margin = 0.25

    if mesh.open_edges or mesh.non_manifold_edges:
        problems = []
        if mesh.open_edges:
            problems.append(f"{mesh.open_edges:,} open edge{'s' if mesh.open_edges != 1 else ''}")
        if mesh.non_manifold_edges:
            problems.append(
                f"{mesh.non_manifold_edges:,} non-manifold edge"
                f"{'s' if mesh.non_manifold_edges != 1 else ''}"
            )
        warnings.append(
            QualityWarning(
                "mesh_open",
                "warning",
                "The mesh is not closed",
                " and ".join(problems) + " found. The slicer will still cut it, but open surfaces can leave gaps in a layer.",
                "Version 1 reports mesh problems but does not repair them. Use a watertight model, or repair it in your CAD tool.",
            )
        )
    if mesh.degenerate_triangles:
        warnings.append(
            QualityWarning(
                "mesh_degenerate",
                "info",
                "Degenerate triangles",
                f"{mesh.degenerate_triangles:,} zero-area triangles were ignored by the cut planes.",
                "No action needed unless the preview shows holes.",
            )
        )
    if mesh.inverted:
        warnings.append(
            QualityWarning(
                "mesh_inverted",
                "info",
                "Triangle normals point inward",
                "The slicer does not need normals and still produces the same outlines.",
                "No action needed for this print method.",
            )
        )
    if mesh.shells > 1:
        warnings.append(
            QualityWarning(
                "multiple_shells",
                "warning",
                f"{mesh.shells} separate parts",
                "Version 1 slices all parts of one file as a single job and does not place them independently.",
                "Print one part per file, or merge the parts in CAD with a base that holds them together.",
            )
        )
    over_x = max(0.0, (width + minimum_margin) - bed_x)
    over_y = max(0.0, (depth + minimum_margin) - bed_y)
    if bounds_min[0] < -bed_x / 2 or bounds_max[0] > bed_x / 2 or bounds_min[1] < -bed_y / 2 or bounds_max[1] > bed_y / 2:
        factor = 1.0
        if width > 0:
            factor = min(factor, max(0.1, (bed_x - 2 * minimum_margin) / width))
        if depth > 0:
            factor = min(factor, max(0.1, (bed_y - 2 * minimum_margin) / depth))
        suggested_length = max(0.5, round(settings.get("length") * factor, 2))
        warnings.append(
            QualityWarning(
                "bed_exceeded",
                "serious",
                "The toolpath leaves the work area",
                f"The path reaches {width:.2f} x {depth:.2f} mm; the usable area is "
                f"{bed_x:.2f} x {bed_y:.2f} mm. The needle would hit the frame.",
                "Scale the model down, centre it with the offsets, or choose a different up axis.",
                action={
                    "kind": "settings",
                    "label": f"Fit to bed (size {suggested_length:g} mm)",
                    "values": {"length": suggested_length, "offset_x": 0.0, "offset_y": 0.0},
                },
            )
        )
    elif over_x > 0 or over_y > 0:
        warnings.append(
            QualityWarning(
                "bed_margin",
                "info",
                "Little room to the work-area edge",
                f"Only {min(bed_x - width, bed_y - depth):.2f} mm is left as a safety margin.",
                "A small margin is fine, but keep at least 0.25 mm around the path.",
            )
        )

    if z_top > max_z + 1e-9:
        usable = max(0.1, max_z - settings.get("z0") - 0.2)
        current = max(0.1, z_top - settings.get("z0"))
        suggested_length = max(0.5, round(settings.get("length") * usable / current, 2))
        warnings.append(
            QualityWarning(
                "height_exceeded",
                "serious",
                "The print is taller than the machine",
                f"The highest cut is at Z {z_top:.2f} mm; the height limit is Z {max_z:.2f} mm.",
                "Reduce the model size or the layer stack before exporting.",
                action={
                    "kind": "settings",
                    "label": f"Fit height (size {suggested_length:g} mm)",
                    "values": {"length": suggested_length},
                },
            )
        )
    elif z_top > max_z - 0.5:
        warnings.append(
            QualityWarning(
                "height_margin",
                "info",
                "Close to the height limit",
                f"The highest cut is at Z {z_top:.2f} mm of the {max_z:.2f} mm limit.",
                "Leave a little room for the nozzle and the tall gel bead.",
            )
        )

    if settings.get("print_method") == "spiral" and flat_count > 5:
        warnings.append(
            QualityWarning(
                "many_flat_strokes",
                "warning",
                f"{flat_count} outlines will print as single flat strokes",
                "Each flat stroke costs one pump start and one stop, which can leave a visible drip or seam.",
                "Try the layered method, or increase the link limit so more outlines join the spirals.",
                action={
                    "kind": "settings",
                    "label": "Switch to layered",
                    "values": {"print_method": "layered"},
                },
            )
        )

    if thin_count > 0:
        bead = settings.get("bead_width")
        warnings.append(
            QualityWarning(
                "thin_features",
                "warning",
                f"{thin_count} outline{'s are' if thin_count != 1 else ' is'} narrower than the bead",
                f"The bead is {bead:.2f} mm wide, so thin features can spread or sag sideways.",
                "Use a smaller needle and bead width, or scale the model up.",
            )
        )

    if layer_count < 3:
        warnings.append(
            QualityWarning(
                "few_layers",
                "info",
                "Very few layers",
                f"The model produced only {layer_count} layers at {settings.get('pitch'):g} mm spacing.",
                "Reduce the layer distance for more detail through the height.",
            )
        )

    if settings.get("print_method") == "spiral" and spiral_count == 0 and flat_count > 0:
        warnings.append(
            QualityWarning(
                "no_spirals",
                "info",
                "No outlines joined between layers",
                "The model may change shape too quickly for the current link limit.",
                "Increase the link limit only if the outlines really are the same feature.",
            )
        )

    return warnings
