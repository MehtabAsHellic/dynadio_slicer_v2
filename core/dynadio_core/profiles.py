"""Read and write versioned JSON profiles.

A profile is always a plain object::

    {"schema": 1, "kind": "process", "name": "Jet", "values": {...}}

Missing values take defaults. Unknown keys are kept and reported (never applied),
so a newer file opens in an older app without losing data.  Out-of-range values
raise a SettingsError that names the key and its allowed range.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from .settings import (
    SETTINGS_BY_KEY,
    Settings,
    SettingsError,
    SCOPE_LABELS,
    defaults,
    settings_from_profile_values,
)

PROFILE_SCHEMA = 1
KINDS = ("process", "machine", "needle")
SCOPE_BY_KIND = {"process": "process", "machine": "machine", "needle": "needle"}


@dataclass
class Profile:
    kind: str
    name: str
    values: dict[str, Any]
    schema: int = PROFILE_SCHEMA
    unknown: dict[str, str] = field(default_factory=dict)
    source: str | None = None

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "schema": self.schema,
            "kind": self.kind,
            "name": self.name,
            "values": self.values,
        }
        if self.unknown:
            data["unknown"] = self.unknown
        return data

    def apply(self, base: Settings | None = None) -> tuple[Settings, dict[str, str]]:
        settings, unknown = settings_from_profile_values(self.values, base)
        unknown = {**unknown, **self.unknown}
        return settings, unknown


def parse_profile(data: Mapping[str, Any] | str | bytes) -> Profile:
    if isinstance(data, (str, bytes)):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as exc:
            raise SettingsError(f"Profile is not valid JSON: {exc.msg} at line {exc.lineno}.") from None
    if not isinstance(data, Mapping):
        raise SettingsError("Profile must be a JSON object.")
    schema = data.get("schema", PROFILE_SCHEMA)
    if not isinstance(schema, int) or schema < 1:
        raise SettingsError("Profile schema must be a whole number of 1 or more.")
    kind = data.get("kind")
    if kind not in KINDS:
        raise SettingsError("Profile kind must be one of: process, machine, needle.")
    name = data.get("name", "Untitled profile")
    if not isinstance(name, str) or not name.strip():
        raise SettingsError("Profile name must be a non-empty string.")
    values = data.get("values", {})
    if not isinstance(values, Mapping):
        raise SettingsError("Profile values must be a JSON object.")

    scope = SCOPE_BY_KIND[kind]
    applied: dict[str, Any] = {}
    unknown: dict[str, str] = {}
    for key, value in values.items():
        definition = SETTINGS_BY_KEY.get(key)
        if definition is None:
            unknown[key] = "unknown setting (kept for forward compatibility)"
            continue
        if definition.scope != scope:
            raise SettingsError(
                f"Setting '{key}' belongs to a {SCOPE_LABELS[definition.scope].lower()} profile, "
                f"not a {kind} profile."
            )
        try:
            applied[key] = definition.validate(value)
        except SettingsError as exc:
            raise SettingsError(f"Profile '{name}': {exc}") from None
    # Cross-field checks only make sense against a complete settings snapshot.
    settings_from_profile_values(applied)
    return Profile(
        kind=kind,
        name=name.strip(),
        values=applied,
        schema=schema,
        unknown=unknown,
    )


def load_profile(path: str | Path) -> Profile:
    path = Path(path)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SettingsError(f"Could not open profile: {exc.strerror or exc}") from None
    profile = parse_profile(text)
    profile.source = str(path)
    return profile


def save_profile(profile: Profile | Mapping[str, Any], path: str | Path) -> None:
    if not isinstance(profile, Profile):
        profile = parse_profile(profile)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "schema": profile.schema,
        "kind": profile.kind,
        "name": profile.name,
        "values": profile.values,
    }
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def profile_from_settings(settings: Settings, kind: str, name: str) -> Profile:
    if kind not in KINDS:
        raise SettingsError("Profile kind must be one of: process, machine, needle.")
    scope = SCOPE_BY_KIND[kind]
    values = {
        key: value
        for key, value in settings.as_dict(scope).items()
        if value != SETTINGS_BY_KEY[key].default
    }
    return Profile(kind=kind, name=name, values=values)


def builtin_profiles() -> dict[str, list[dict[str, Any]]]:
    """Presets shown in the interface.  Values are applied over defaults."""

    def prof(kind: str, name: str, values: dict[str, Any], description: str = "") -> dict[str, Any]:
        scope = SCOPE_BY_KIND[kind]
        for key, value in values.items():
            if key not in SETTINGS_BY_KEY:
                raise AssertionError(f"preset uses unknown setting {key}")
            if SETTINGS_BY_KEY[key].scope != scope:
                raise AssertionError(f"preset {name} mixes scopes at {key}")
        return {
            "id": f"{kind}:{name.lower().replace(' ', '-').replace('·', '').replace('_', '-')}",
            "kind": kind,
            "name": name,
            "description": description,
            "values": values,
        }

    return {
        "process": [
            prof(
                "process",
                "Jet 9.7 mm · Spiral",
                {"up_axis": "x", "length": 9.7, "print_method": "spiral"},
                "The reference process for the jet model. Reproduces out_default.gcode.",
            ),
            prof(
                "process",
                "Jet 9.7 mm · Layered",
                {"up_axis": "x", "length": 9.7, "print_method": "layered"},
                "Every outline gets its own pump start and stop.",
            ),
            prof(
                "process",
                "Fine detail",
                {
                    "pitch": 0.08,
                    "first_plane": 0.02,
                    "step": 0.05,
                    "resample": 0.01,
                    "corner_softness": 0.07,
                    "min_perimeter": 0.15,
                    "feed": 400.0,
                },
                "Thinner layers and shorter steps for small, delicate parts.",
            ),
            prof(
                "process",
                "Fast draft",
                {
                    "pitch": 0.2,
                    "step": 0.1,
                    "feed": 700.0,
                    "corner_softness": 0.1,
                },
                "Fewer, thicker layers for a quick shape check.",
            ),
        ],
        "machine": [
            prof(
                "machine",
                "DynaDio air-pump bed",
                {
                    "bed_x": 18.84,
                    "bed_y": 15.67,
                    "max_z": 11.0,
                    "dialect": "grbl",
                },
                "Measured work area of the DynaDio printer.",
            ),
            prof(
                "machine",
                "DynaDio · tall",
                {"max_z": 25.0},
                "Same bed with a taller Z allowance, for a raised gantry.",
            ),
        ],
        "needle": [
            prof(
                "needle",
                "21G · 0.514 mm",
                {"needle_gauge": "21G", "needle_id": 0.514, "bead_width": 0.65},
                "The measured production needle and bead.",
            ),
            prof(
                "needle",
                "20G · 0.584 mm",
                {"needle_gauge": "20G", "needle_id": 0.584, "bead_width": 0.72},
                "Wider bead for faster coverage.",
            ),
            prof(
                "needle",
                "22G · 0.394 mm",
                {"needle_gauge": "22G", "needle_id": 0.394, "bead_width": 0.52},
                "Narrower bead for fine features.",
            ),
            prof(
                "needle",
                "25G · 0.241 mm",
                {"needle_gauge": "25G", "needle_id": 0.241, "bead_width": 0.34},
                "Very fine features; check the bead width with a test print.",
            ),
        ],
    }
