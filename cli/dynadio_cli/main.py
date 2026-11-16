"""``dynadio`` - the command line.  All real work is done by dynadio_core."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from dynadio_core import __version__
from dynadio_core.pipeline import SliceCancelled, SliceResult, slice_model
from dynadio_core.profiles import builtin_profiles, load_profile
from dynadio_core.settings import (
    SETTINGS,
    Settings,
    SettingsError,
    schema_json,
)
from dynadio_core.simulate import format_duration
from dynadio_core.stl import StlError, inspect_stl


# --------------------------------------------------------------------------- helpers
def _parse_override(key: str, raw: str) -> Any:
    from dynadio_core.settings import SETTINGS_BY_KEY

    definition = SETTINGS_BY_KEY.get(key)
    if definition is None:
        raise SettingsError(f"Unknown setting '{key}'.")
    if definition.kind == "bool":
        lowered = raw.strip().lower()
        if lowered in ("1", "true", "on", "yes"):
            return True
        if lowered in ("0", "false", "off", "no"):
            return False
        raise SettingsError(f"{definition.label} must be on or off.")
    if definition.kind in ("float", "int"):
        try:
            return float(raw) if definition.kind == "float" else int(float(raw))
        except ValueError:
            raise SettingsError(f"{definition.label} must be a number.") from None
    return raw


def _build_settings(args: argparse.Namespace) -> Settings:
    settings = Settings()
    if args.profile:
        profile = load_profile(args.profile)
        if profile.kind != "process":
            raise SettingsError("--profile expects a process profile.")
        settings, _unknown = profile.apply(settings)
    if args.machine:
        profile = load_profile(args.machine)
        if profile.kind != "machine":
            raise SettingsError("--machine expects a machine profile.")
        settings, _unknown = profile.apply(settings)
    if args.needle:
        profile = load_profile(args.needle)
        if profile.kind != "needle":
            raise SettingsError("--needle expects a needle profile.")
        settings, _unknown = profile.apply(settings)

    direct = {
        "length": args.length,
        "up_axis": args.up_axis,
        "pitch": args.pitch,
        "print_method": args.print_method,
        "tilt": args.tilt,
        "feed": args.feed,
        "link": args.link,
    }
    changes = {k: v for k, v in direct.items() if v is not None}
    for item in args.set or []:
        if "=" not in item:
            raise SettingsError(f"--set expects key=value, received '{item}'.")
        key, raw = item.split("=", 1)
        changes[key.strip()] = _parse_override(key.strip(), raw)
    if changes:
        settings = settings.replace(changes)
    return settings


def _progress_printer(quiet: bool):
    state = {"last": 0.0}

    def report(stage: str, done: int, total: int) -> None:
        if quiet:
            return
        now = time.perf_counter()
        if stage not in ("slice", "done") and now - state["last"] < 0.08:
            return
        state["last"] = now
        pct = 100.0 * done / total if total else 0.0
        sys.stderr.write(f"\r  {stage:<8} {done:>5}/{total:<5} {pct:5.1f}%")
        sys.stderr.flush()
        if stage == "done":
            sys.stderr.write("\n")
            sys.stderr.flush()

    return report


def _print_stats(result: SliceResult) -> None:
    s = result.stats
    print(
        f"layers {s['layers']}  strokes {s['strokes']}  spirals {s['spirals']}  "
        f"flat {s['flat']}  points {s['points']}"
    )
    mn, mx = s["bounds_min"], s["bounds_max"]
    print(f"X {mn[0]:.2f}..{mx[0]:.2f}  Y {mn[1]:.2f}..{mx[1]:.2f}  Z {mn[2]:.2f}..{mx[2]:.2f}")
    print(
        f"max step {s['max_step_mm']:.3f} mm   longest travel {s['longest_travel_mm']:.2f} mm   "
        f"scale {s['scale']:.5f}"
    )
    print(
        f"drawn {s['draw_length_mm']:.1f} mm  travel {s['travel_length_mm']:.1f} mm  "
        f"time {format_duration(s['time_s'])}  gel {s['gel_ml']:.4f} mL"
    )
    for warning in result.warnings:
        print(f"  [{warning.severity}] {warning.title}: {warning.detail}")


# --------------------------------------------------------------------------- commands
def command_slice(args: argparse.Namespace) -> int:
    settings = _build_settings(args)
    source = Path(args.model)
    if not source.exists():
        raise SettingsError(f"Model not found: {source}")
    out = Path(args.output)
    result = slice_model(
        str(source),
        settings,
        on_progress=_progress_printer(args.quiet),
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(result.gcode, encoding="utf-8", newline="\n")
    if args.json:
        payload = result.meta()
        payload.pop("settings", None)
        print(json.dumps(payload, indent=2))
    elif not args.quiet:
        _print_stats(result)
        print(f"wrote {out}")
    return 0


def command_inspect(args: argparse.Namespace) -> int:
    info, _triangles = inspect_stl(args.model)
    if args.json:
        print(json.dumps(info.to_json(), indent=2))
        return 0
    print(f"{info.name}")
    print(f"  triangles {info.triangles:,}  welded vertices {info.vertices:,}  shells {info.shells}")
    print(
        f"  size {info.size[0]:.3f} x {info.size[1]:.3f} x {info.size[2]:.3f} mm  "
        f"volume {info.volume_mm3:.3f} mm3"
    )
    print(
        f"  watertight {'yes' if info.watertight else 'no'}  "
        f"open edges {info.open_edges}  non-manifold edges {info.non_manifold_edges}  "
        f"degenerate triangles {info.degenerate_triangles}"
    )
    if not info.watertight:
        print("  warning: the mesh is not closed; version 1 reports it but does not repair it.")
    return 0


def command_schema(args: argparse.Namespace) -> int:
    data = schema_json()
    if args.json:
        print(json.dumps(data, indent=2))
        return 0
    print(f"{'key':<22} {'default':<12} {'range':<22} {'group':<10} mode")
    print("-" * 78)
    for s in SETTINGS:
        if s.minimum is not None and s.maximum is not None:
            rng = f"{s.minimum:g}..{s.maximum:g} {s.unit}".strip()
        elif s.choices:
            rng = " | ".join(s.choices)
        else:
            rng = "(text)"
        print(f"{s.key:<22} {str(s.default):<12} {rng:<22} {s.group:<10} {s.mode}")
    return 0


def command_profiles(args: argparse.Namespace) -> int:
    data = builtin_profiles()
    if args.json:
        print(json.dumps(data, indent=2))
        return 0
    for kind, presets in data.items():
        print(kind.capitalize())
        for preset in presets:
            print(f"  {preset['name']:<28} {preset['description']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dynadio",
        description="DynaDio air-pump gel printer slicer.",
    )
    parser.add_argument("--version", action="version", version=f"dynadio {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("slice", help="slice an STL into G-code")
    p.add_argument("model", help="input STL (binary or ASCII)")
    p.add_argument("output", help="output G-code path")
    p.add_argument("--profile", help="process profile JSON")
    p.add_argument("--machine", help="machine profile JSON")
    p.add_argument("--needle", help="needle profile JSON")
    p.add_argument("--set", action="append", metavar="KEY=VALUE", help="override any setting (repeatable)")
    p.add_argument("--length", type=float)
    p.add_argument("--up-axis", choices=("x", "y", "z"))
    p.add_argument("--pitch", type=float)
    p.add_argument("--print-method", choices=("spiral", "layered"))
    p.add_argument("--tilt", type=float)
    p.add_argument("--feed", type=float)
    p.add_argument("--link", type=float)
    p.add_argument("--json", action="store_true", help="print the slice report as JSON")
    p.add_argument("--quiet", action="store_true")
    p.set_defaults(func=command_slice)

    p = sub.add_parser("inspect", aliases=["check"], help="report STL size and mesh health")
    p.add_argument("model")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=command_inspect)

    p = sub.add_parser("schema", help="print the single settings table")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=command_schema)

    p = sub.add_parser("profiles", help="list built-in machine, needle and process presets")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=command_profiles)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except SliceCancelled:
        print("\nCancelled.", file=sys.stderr)
        return 130
    except (SettingsError, StlError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
