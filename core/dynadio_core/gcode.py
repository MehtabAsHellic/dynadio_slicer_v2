"""Stage 8: write the GRBL G-code exactly as the machine expects it.

The pump sequence for every stroke is fixed and visible in the output:

    travel with pump off  ->  M3 S<kick>  ->  one step  ->  M3 S<draw>
    ->  remaining steps  ->  M5  ->  G4 P<dwell>

Start and end code are editable templates from the machine profile.  The
default templates reproduce the reference file's non-comment lines exactly.
"""

from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

from .settings import Settings


def _template_lines(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def build_header(
    *,
    model_name: str,
    settings: Settings,
    scale: float,
    layer_count: int,
    top_z: float,
) -> list[str]:
    method = settings.get("print_method")
    return [
        f"; DynaDio Slicer 1.0 - air-pump gel printer",
        f"; {model_name} -> {method.upper()}. Uniform scale {scale:.5f} (no stretch). "
        f"up-axis={settings.get('up_axis')} tilt={settings.get('tilt'):g}deg"
        f"{' (flipped)' if settings.get('flip') else ''}, "
        f"Z{settings.get('z0'):g} -> Z{top_z:.2f}.",
        f"; Layers {settings.get('pitch'):g} mm apart. "
        "Loops that continue from layer to layer are drawn as rising SPIRALS; "
        "loops that appear/disappear are drawn as flat horizontal slices.",
        "; All corners are rounded (smoothed) so no bubbles collect at sharp turns.",
        f"; PUMP per stroke: pump OFF travel -> M3 S{settings.get('kick')} kick on the first step "
        f"-> M3 S{settings.get('draw')} drawing -> M5 -> G4 P{settings.get('dwell'):g} "
        "(short wait so the air stored in the nozzle does not drip).",
    ]


def build_gcode(
    strokes: Sequence[np.ndarray],
    kinds: Sequence[str],
    chains_or_ranges: Sequence[Sequence],
    settings: Settings,
    *,
    model_name: str,
    scale: float,
    layer_count: int,
    top_z: float,
) -> str:
    """Return the complete G-code text with LF line endings (deterministic)."""
    out = build_header(
        model_name=model_name,
        settings=settings,
        scale=scale,
        layer_count=layer_count,
        top_z=top_z,
    )
    out.extend(_template_lines(settings.render_template("start_gcode")))
    out.append("")
    kick = settings.get("kick")
    draw = settings.get("draw")
    dwell = settings.get("dwell")
    for n, (curve, kind, chain) in enumerate(zip(strokes, kinds, chains_or_ranges)):
        first_layer = int(chain[0][0]) + 1
        last_layer = int(chain[-1][0]) + 1
        out.append(
            f"; ---- stroke {n + 1}/{len(strokes)}  layers {first_layer}-{last_layer} ({kind}) ----"
        )
        out.append(f"G1 X{curve[0][0]:.3f} Y{curve[0][1]:.3f} Z{curve[0][2]:.3f}")
        out.append(f"M3 S{kick}")
        out.append(f"G1 X{curve[1][0]:.3f} Y{curve[1][1]:.3f} Z{curve[1][2]:.3f}")
        out.append(f"M3 S{draw}")
        for j in range(2, len(curve)):
            out.append(f"G1 X{curve[j][0]:.3f} Y{curve[j][1]:.3f} Z{curve[j][2]:.3f}")
        out.append("M5")
        out.append(f"G4 P{dwell:g}")
        out.append("")
    out.extend(_template_lines(settings.render_template("end_gcode")))
    return "\n".join(out) + "\n"


def editable_gcode_prefix(settings: Settings) -> list[str]:
    """Convenience for the interface's export sheet."""
    return _template_lines(settings.render_template("start_gcode"))


def editable_gcode_suffix(settings: Settings) -> list[str]:
    return _template_lines(settings.render_template("end_gcode"))


def iter_gcode_lines(gcode: str) -> Iterable[str]:
    return (line.rstrip("\r") for line in gcode.splitlines())
