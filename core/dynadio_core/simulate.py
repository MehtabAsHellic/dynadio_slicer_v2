"""Read the generated G-code and estimate time, gel volume and pump events.

Deliberately reads the *output file*, not the in-memory stroke list, so the
number shown in the interface is a property of what will be sent to the machine.
Acceleration is not modelled; the estimate is the steady-feed time plus dwells.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .settings import Settings

_AXIS_RE = re.compile(r"([XYZF])\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)")
_P_RE = re.compile(r"P\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)")
_S_RE = re.compile(r"S\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)")


@dataclass
class PumpEvent:
    time_s: float
    value: float

    def to_json(self) -> dict[str, float]:
        return {"t": round(self.time_s, 6), "s": self.value}


@dataclass
class Simulation:
    time_s: float = 0.0
    draw_length_mm: float = 0.0
    travel_length_mm: float = 0.0
    gel_ml: float = 0.0
    pump_events: list[PumpEvent] = field(default_factory=list)
    times: np.ndarray = field(default_factory=lambda: np.zeros(1))
    xyz: np.ndarray = field(default_factory=lambda: np.zeros((1, 3)))
    feed: np.ndarray = field(default_factory=lambda: np.zeros(1))
    pump: np.ndarray = field(default_factory=lambda: np.zeros(1))
    gel_cum: np.ndarray = field(default_factory=lambda: np.zeros(1))
    point_times: np.ndarray = field(default_factory=lambda: np.zeros(1))

    def to_json(self) -> dict[str, Any]:
        return {
            "time_s": self.time_s,
            "draw_length_mm": self.draw_length_mm,
            "travel_length_mm": self.travel_length_mm,
            "gel_ml": self.gel_ml,
            "pump_events": [e.to_json() for e in self.pump_events],
        }


def simulate_gcode(gcode: str, settings: Settings) -> Simulation:
    """Parse G-code and return time, lengths, volume and pump timeline."""
    bead_width = settings.get("bead_width")
    pitch = settings.get("pitch")
    feed = float(settings.get("feed"))
    x = y = z = 0.0
    pump_value = 0.0
    time_s = 0.0
    draw_len = 0.0
    travel_len = 0.0
    gel = 0.0

    times = [0.0]
    xyz = [(0.0, 0.0, 0.0)]
    feeds = [feed]
    pumps = [0.0]
    gels = [0.0]
    point_times = [0.0]
    events: list[PumpEvent] = []
    last_event: float | None = None

    def add_event(value: float) -> None:
        nonlocal last_event
        if last_event is not None and abs(last_event - value) < 1e-12:
            return
        events.append(PumpEvent(time_s, value))
        last_event = value

    for raw in gcode.splitlines():
        line = raw.strip()
        if not line or line.startswith(";"):
            continue
        code = line.split(";", 1)[0].strip().upper()
        if code.startswith("G4"):
            m = _P_RE.search(code)
            if m:
                time_s += max(0.0, float(m.group(1)))
            continue
        if code.startswith("M3"):
            m = _S_RE.search(code)
            pump_value = float(m.group(1)) if m else 1000.0
            add_event(pump_value)
            continue
        if code.startswith("M5"):
            pump_value = 0.0
            add_event(0.0)
            continue
        if code.startswith("M2"):
            break
        if not code.startswith("G1") and not code.startswith("G0"):
            continue
        params = {k: float(v) for k, v in _AXIS_RE.findall(code)}
        nx = params.get("X", x)
        ny = params.get("Y", y)
        nz = params.get("Z", z)
        if "F" in params:
            feed = params["F"] if params["F"] > 0 else feed
        dist = math.dist((x, y, z), (nx, ny, nz))
        dt = (dist / feed * 60.0) if feed > 0 else 0.0
        time_s += dt
        if pump_value > 0:
            draw_len += dist
            gel += bead_width * pitch * dist
        else:
            travel_len += dist
        x, y, z = nx, ny, nz
        times.append(time_s)
        xyz.append((x, y, z))
        feeds.append(feed)
        pumps.append(pump_value)
        gels.append(gel)
        point_times.append(time_s)

    add_event(0.0)
    if events and events[-1].time_s < time_s:
        events.append(PumpEvent(time_s, 0.0))

    return Simulation(
        time_s=time_s,
        draw_length_mm=draw_len,
        travel_length_mm=travel_len,
        gel_ml=gel / 1000.0,
        pump_events=events,
        times=np.asarray(times, dtype=float),
        xyz=np.asarray(xyz, dtype=float),
        feed=np.asarray(feeds, dtype=float),
        pump=np.asarray(pumps, dtype=float),
        gel_cum=np.asarray(gels, dtype=float),
        point_times=np.asarray(point_times, dtype=float),
    )


def format_duration(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"
