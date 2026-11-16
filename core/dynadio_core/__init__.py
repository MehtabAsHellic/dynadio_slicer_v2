"""DynaDio Slicer core.

The core is pure Python (numpy/scipy) and never imports UI, web or CLI code.
Every public number that reaches the screen comes from this package.
"""

from .settings import SETTINGS, SETTINGS_BY_KEY, Settings, SettingsError
from .pipeline import SliceResult, SliceCancelled, slice_model
from .stl import MeshInfo, StlError, inspect_stl, load_stl

__all__ = [
    "SETTINGS",
    "SETTINGS_BY_KEY",
    "Settings",
    "SettingsError",
    "SliceResult",
    "SliceCancelled",
    "slice_model",
    "MeshInfo",
    "StlError",
    "inspect_stl",
    "load_stl",
]

__version__ = "1.0.0"
