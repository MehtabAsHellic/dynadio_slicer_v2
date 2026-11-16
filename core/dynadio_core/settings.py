"""The single table of every setting.

Nothing else in the project hard-codes a setting key, default or range.  The
command line, profile files, the HTTP API, the interface, validation and the
tests all read this table.  Adding a setting here makes it appear everywhere.

Defaults come from ``reference/airpump_slicer.py``; machine and needle values
come from the measured DynaDio hardware.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable, Literal, Mapping

Scope = Literal["process", "machine", "needle"]
Kind = Literal["float", "int", "bool", "enum", "text"]
Mode = Literal["simple", "advanced"]


class SettingsError(ValueError):
    """A setting name or value is not acceptable.  The message is user facing."""


@dataclass(frozen=True)
class Setting:
    key: str
    label: str
    unit: str
    default: Any
    kind: Kind
    group: str
    scope: Scope = "process"
    mode: Mode = "advanced"
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    choices: tuple[str, ...] = ()
    help: str = ""
    multiline: bool = False

    def validate(self, value: Any) -> Any:
        """Return the canonical value or raise SettingsError with a clear message."""
        if self.kind == "float":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise SettingsError(f"{self.label} must be a number.")
            v = float(value)
            if not math.isfinite(v):
                raise SettingsError(f"{self.label} must be a finite number.")
            self._check_range(v)
            return v
        if self.kind == "int":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise SettingsError(f"{self.label} must be a whole number.")
            v = float(value)
            if not math.isfinite(v) or abs(v - round(v)) > 1e-9:
                raise SettingsError(f"{self.label} must be a whole number.")
            iv = int(round(v))
            self._check_range(iv)
            return iv
        if self.kind == "bool":
            if not isinstance(value, bool):
                raise SettingsError(f"{self.label} must be on or off.")
            return value
        if self.kind == "enum":
            if not isinstance(value, str) or value not in self.choices:
                options = ", ".join(self.choices)
                raise SettingsError(f"{self.label} must be one of: {options}.")
            return value
        if self.kind == "text":
            if not isinstance(value, str):
                raise SettingsError(f"{self.label} must be text.")
            if len(value) > 50_000:
                raise SettingsError(f"{self.label} is too long (maximum 50,000 characters).")
            return value
        raise AssertionError(f"unknown kind {self.kind}")

    def _check_range(self, v: float) -> None:
        if self.minimum is not None and v < self.minimum - 1e-12:
            raise SettingsError(self.range_message())
        if self.maximum is not None and v > self.maximum + 1e-12:
            raise SettingsError(self.range_message())

    def range_message(self) -> str:
        unit = f" {self.unit}" if self.unit else ""
        if self.minimum is not None and self.maximum is not None:
            return f"{self.label} must be between {_fmt(self.minimum)}{unit} and {_fmt(self.maximum)}{unit}."
        if self.minimum is not None:
            return f"{self.label} must be at least {_fmt(self.minimum)}{unit}."
        if self.maximum is not None:
            return f"{self.label} must be at most {_fmt(self.maximum)}{unit}."
        return f"{self.label} is out of range."

    def to_json(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "unit": self.unit,
            "default": self.default,
            "type": self.kind,
            "group": self.group,
            "scope": self.scope,
            "mode": self.mode,
            "min": self.minimum,
            "max": self.maximum,
            "step": self.step,
            "choices": list(self.choices),
            "help": self.help,
            "multiline": self.multiline,
        }


def _fmt(v: float) -> str:
    return f"{v:g}"


# --------------------------------------------------------------------------- table
# Order matters: it is the order the interface and documentation use.
SETTINGS: tuple[Setting, ...] = (
    # ---- model -------------------------------------------------------------
    Setting(
        "length", "Size along up axis", "mm", 9.7, "float", "model", mode="simple",
        minimum=0.5, maximum=200.0, step=0.1,
        help="Uniform scale so the chosen up-axis dimension becomes this size. "
             "The model is never stretched.",
    ),
    Setting(
        "up_axis", "Up axis", "", "z", "enum", "model", mode="simple",
        choices=("x", "y", "z"),
        help="The model axis that becomes print Z. A cyclic swap keeps the model from being mirrored.",
    ),
    Setting(
        "tilt", "Tilt", "deg", 0.0, "float", "model", minimum=0.0, maximum=85.0, step=1.0,
        help="Lean the body about the print X axis. Layers stay horizontal, so the model is truly re-sliced.",
    ),
    Setting(
        "flip", "Lean the other way", "", False, "bool", "model",
        help="Mirror the tilt direction.",
    ),
    Setting(
        "offset_x", "Move X", "mm", 0.0, "float", "model", minimum=-100.0, maximum=100.0, step=0.1,
        help="Move the finished toolpath on the bed after automatic centring.",
    ),
    Setting(
        "offset_y", "Move Y", "mm", 0.0, "float", "model", minimum=-100.0, maximum=100.0, step=0.1,
        help="Move the finished toolpath on the bed after automatic centring.",
    ),
    # ---- layers ------------------------------------------------------------
    Setting(
        "pitch", "Layer distance", "mm", 0.13, "float", "layers", mode="simple",
        minimum=0.03, maximum=0.5, step=0.01,
        help="Distance between horizontal cutting planes. Also the gel bead height used for estimates.",
    ),
    Setting(
        "z0", "Z of the lowest point", "mm", 0.3, "float", "layers",
        minimum=0.0, maximum=5.0, step=0.05,
        help="Machine Z at which the bottom of the model is printed.",
    ),
    Setting(
        "first_plane", "First cut above lowest point", "mm", 0.03, "float", "layers",
        minimum=0.005, maximum=0.5, step=0.005,
        help="The first cut plane sits this far above the lowest point. It cannot be larger than the layer distance.",
    ),
    # ---- method ------------------------------------------------------------
    Setting(
        "print_method", "Print method", "", "spiral", "enum", "method", mode="simple",
        choices=("spiral", "layered"),
        help="Spiral links outlines that continue upward into one rising curve. "
             "Layered prints every outline as its own closed stroke with a pump start and stop.",
    ),
    Setting(
        "link", "Link limit", "mm", 0.22, "float", "method", minimum=0.0, maximum=1.0, step=0.01,
        help="Maximum outline distance for joining two layers into a spiral. "
             "The effective limit grows with tilt.",
    ),
    Setting(
        "optimize_layer_start", "Start loops nearest the needle", "", False, "bool", "method",
        help="In layered mode, rotate each closed loop to begin nearest the previous stroke. "
             "Off by default so output matches the reference script.",
    ),
    # ---- motion ------------------------------------------------------------
    Setting(
        "feed", "Feed", "mm/min", 500.0, "float", "motion", mode="simple",
        minimum=50.0, maximum=3000.0, step=10.0,
        help="Drawing and travel feed rate.",
    ),
    # ---- pump --------------------------------------------------------------
    Setting(
        "kick", "Pump kick", "S", 1000, "int", "pump", mode="simple",
        minimum=0, maximum=1000, step=10,
        help="Pump power on the first step of a stroke, to start gel flow quickly.",
    ),
    Setting(
        "draw", "Pump draw", "S", 350, "int", "pump", mode="simple",
        minimum=0, maximum=1000, step=10,
        help="Pump power for the rest of the stroke.",
    ),
    Setting(
        "dwell", "Dwell after stop", "s", 0.05, "float", "pump", mode="simple",
        minimum=0.0, maximum=2.0, step=0.01,
        help="G4 wait after M5 so air stored in the nozzle does not drip.",
    ),
    # ---- path --------------------------------------------------------------
    Setting(
        "step", "Distance between points", "mm", 0.065, "float", "path",
        minimum=0.02, maximum=0.3, step=0.005,
        help="Maximum distance between G-code points.",
    ),
    Setting(
        "resample", "Outline resample spacing", "mm", 0.015, "float", "path",
        minimum=0.005, maximum=0.1, step=0.001,
        help="Spacing used before corner rounding.",
    ),
    Setting(
        "corner_softness", "Corner softness", "mm", 0.075, "float", "path", mode="simple",
        minimum=0.0, maximum=0.5, step=0.005,
        help="Gaussian corner rounding distance. Stored in millimetres, so changing "
             "the resample spacing never silently changes how round corners are.",
    ),
    Setting(
        "min_perimeter", "Smallest outline kept", "mm", 0.2, "float", "path",
        minimum=0.0, maximum=5.0, step=0.05,
        help="Outlines with a shorter perimeter are discarded before smoothing.",
    ),
    Setting(
        "min_perimeter_after", "Smallest outline kept after smoothing", "mm", 0.5, "float", "path",
        minimum=0.0, maximum=5.0, step=0.05,
        help="Outlines with a shorter smoothed perimeter are discarded.",
    ),
    Setting(
        "min_thickness", "Thinnest feature drawn", "mm", 0.05, "float", "path",
        minimum=0.0, maximum=1.0, step=0.005,
        help="Outlines whose thickness 2A/P is below this are discarded as slivers.",
    ),
    # ---- machine -----------------------------------------------------------
    Setting(
        "bed_x", "Work area X", "mm", 18.84, "float", "machine", scope="machine",
        minimum=1.0, maximum=1000.0, step=0.01,
        help="Usable work area of the machine along X.",
    ),
    Setting(
        "bed_y", "Work area Y", "mm", 15.67, "float", "machine", scope="machine",
        minimum=1.0, maximum=1000.0, step=0.01,
        help="Usable work area of the machine along Y.",
    ),
    Setting(
        "max_z", "Height limit", "mm", 11.0, "float", "machine", scope="machine",
        minimum=1.0, maximum=1000.0, step=0.1,
        help="Maximum safe Z travel.",
    ),
    Setting(
        "dialect", "G-code dialect", "", "grbl", "enum", "machine", scope="machine",
        choices=("grbl",),
        help="GRBL understands G4 P in seconds and M3 S / M5 for the pump.",
    ),
    Setting(
        "start_gcode", "Start code", "", "G21\nG90\nG94\nM5\nG1 F{feed:g}", "text",
        "machine", scope="machine", multiline=True,
        help="Written before the strokes. Use {feed} to insert a setting value.",
    ),
    Setting(
        "end_gcode", "End code", "", "M5\nM2", "text",
        "machine", scope="machine", multiline=True,
        help="Written after the last stroke. Use {feed} to insert a setting value.",
    ),
    # ---- needle ------------------------------------------------------------
    Setting(
        "needle_gauge", "Needle gauge", "", "21G", "enum", "needle", scope="needle",
        choices=("14G", "16G", "18G", "20G", "21G", "22G", "23G", "25G", "27G", "30G"),
        help="Needle gauge label used by operators. The inner diameter is the number that affects the bead.",
    ),
    Setting(
        "needle_id", "Needle inner diameter", "mm", 0.514, "float", "needle", scope="needle",
        minimum=0.05, maximum=2.0, step=0.001,
        help="Measured inner diameter of the needle.",
    ),
    Setting(
        "bead_width", "Measured bead width", "mm", 0.65, "float", "needle", scope="needle",
        minimum=0.05, maximum=5.0, step=0.01,
        help="Width of a printed bead. Used for the preview and the gel volume estimate.",
    ),
)

SETTINGS_BY_KEY: dict[str, Setting] = {s.key: s for s in SETTINGS}

GROUP_ORDER: tuple[str, ...] = ("model", "layers", "method", "motion", "pump", "path", "machine", "needle")
GROUP_LABELS: dict[str, str] = {
    "model": "Model",
    "layers": "Layers",
    "method": "Print method",
    "motion": "Motion",
    "pump": "Pump",
    "path": "Path",
    "machine": "Machine",
    "needle": "Needle",
}
GROUP_SCOPE: dict[str, Scope] = {
    "model": "process",
    "layers": "process",
    "method": "process",
    "motion": "process",
    "pump": "process",
    "path": "process",
    "machine": "machine",
    "needle": "needle",
}
SCOPE_LABELS: dict[Scope, str] = {
    "process": "Process",
    "machine": "Machine",
    "needle": "Needle",
}


def defaults(scope: Scope | None = None) -> dict[str, Any]:
    return {
        s.key: s.default
        for s in SETTINGS
        if scope is None or s.scope == scope
    }


def definition(key: str) -> Setting:
    try:
        return SETTINGS_BY_KEY[key]
    except KeyError:
        raise SettingsError(f"Unknown setting '{key}'.") from None


# --------------------------------------------------------------------------- settings object
class Settings:
    """A validated, immutable snapshot of every setting in the table."""

    __slots__ = ("_values", "unknown")

    def __init__(self, values: Mapping[str, Any] | None = None, *, allow_unknown: bool = False):
        merged = defaults()
        unknown: list[str] = []
        for key, value in (values or {}).items():
            if key not in SETTINGS_BY_KEY:
                if allow_unknown:
                    unknown.append(key)
                    continue
                raise SettingsError(f"Unknown setting '{key}'.")
            merged[key] = SETTINGS_BY_KEY[key].validate(value)
        # Validate defaults too, so a broken table cannot ship.
        for key, value in merged.items():
            merged[key] = SETTINGS_BY_KEY[key].validate(value)
        self._values = merged
        self._cross_validate()
        # Kept only for the profile loader's report.
        self.unknown = tuple(unknown) if allow_unknown else ()

    # -- reading ---------------------------------------------------------
    def get(self, key: str, default: Any = None) -> Any:
        if key in SETTINGS_BY_KEY:
            return self._values[key]
        if default is not None:
            return default
        raise SettingsError(f"Unknown setting '{key}'.")

    def __getitem__(self, key: str) -> Any:
        return self.get(key)

    def __contains__(self, key: str) -> bool:
        return key in self._values

    def as_dict(self, scope: Scope | None = None) -> dict[str, Any]:
        out = {}
        for s in SETTINGS:
            if scope is None or s.scope == scope:
                out[s.key] = self._values[s.key]
        return out

    def scope_values(self, scope: Scope) -> dict[str, Any]:
        return self.as_dict(scope)

    def changed_from_defaults(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in self._values.items()
            if value != SETTINGS_BY_KEY[key].default
        }

    def replace(self, changes: Mapping[str, Any]) -> "Settings":
        merged = dict(self._values)
        merged.update(changes)
        return Settings(merged)

    def copy(self) -> "Settings":
        return Settings(dict(self._values))

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"Settings({self._values!r})"

    # -- validation ------------------------------------------------------
    def _cross_validate(self) -> None:
        if self._values["first_plane"] > self._values["pitch"] + 1e-12:
            raise SettingsError(
                f"First cut above lowest point ({_fmt(self._values['first_plane'])} mm) "
                f"cannot be larger than Layer distance ({_fmt(self._values['pitch'])} mm)."
            )
        if self._values["tilt"] > 85:
            raise SettingsError("Tilt must be between 0 deg and 85 deg.")
        self._validate_template("start_gcode", self._values["start_gcode"])
        self._validate_template("end_gcode", self._values["end_gcode"])

    def _validate_template(self, field: str, template: str) -> None:
        try:
            template.format_map(_TemplateContext(self._values))
        except KeyError as exc:
            raise SettingsError(
                f"{definition(field).label} uses unknown setting {{{exc.args[0]}}}."
            ) from None
        except (ValueError, IndexError) as exc:
            raise SettingsError(f"{definition(field).label} is not a valid template: {exc}") from None

    def render_template(self, field: str) -> str:
        template = self._values[field]
        try:
            return template.format_map(_TemplateContext(self._values))
        except KeyError as exc:
            raise SettingsError(
                f"{definition(field).label} uses unknown setting {{{exc.args[0]}}}."
            ) from None

    # -- serialization ---------------------------------------------------
    def to_json(self, scope: Scope | None = None) -> dict[str, Any]:
        return self.as_dict(scope)


class _TemplateContext(dict):
    """format_map helper: missing keys become a SettingsError, not a traceback."""

    def __missing__(self, key: str):  # pragma: no cover - exercised through format_map
        raise KeyError(key)


def settings_from_profile_values(
    values: Mapping[str, Any], base: Settings | None = None
) -> tuple[Settings, dict[str, str]]:
    """Apply profile values on top of ``base`` and report unknown keys.

    Unknown keys are kept for forwards compatibility and returned in the second
    value; they never silently change slicing.
    """
    merged = dict((base or Settings()).as_dict())
    unknown: dict[str, str] = {}
    for key, value in values.items():
        definition_ = SETTINGS_BY_KEY.get(key)
        if definition_ is None:
            unknown[key] = "unknown setting (kept for forward compatibility)"
            continue
        merged[key] = definition_.validate(value)
    return Settings(merged), unknown


def schema_json() -> dict[str, Any]:
    """Everything the interface needs to draw the settings panel."""
    return {
        "version": 1,
        "groups": [
            {
                "id": g,
                "label": GROUP_LABELS[g],
                "scope": GROUP_SCOPE[g],
                "settings": [s.key for s in SETTINGS if s.group == g],
            }
            for g in GROUP_ORDER
        ],
        "scopes": [{"id": scope, "label": label} for scope, label in SCOPE_LABELS.items()],
        "settings": [s.to_json() for s in SETTINGS],
        "defaults": defaults(),
        "limits": {"max_start_end_template": 50_000},
    }


def iter_settings(scope: Scope | None = None, mode: Mode | None = None) -> Iterable[Setting]:
    for s in SETTINGS:
        if scope is not None and s.scope != scope:
            continue
        if mode is not None and s.mode != mode:
            continue
        yield s
