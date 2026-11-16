from __future__ import annotations

import json

import pytest

from dynadio_core.profiles import (
    Profile,
    builtin_profiles,
    load_profile,
    parse_profile,
    profile_from_settings,
    save_profile,
)
from dynadio_core.settings import (
    SETTINGS,
    SETTINGS_BY_KEY,
    Settings,
    SettingsError,
    defaults,
    schema_json,
)


def _probe(setting):
    if setting.kind == "bool":
        return not setting.default
    if setting.kind == "enum":
        for choice in setting.choices:
            if choice != setting.default:
                return choice
        return setting.choices[0]
    if setting.kind == "float":
        if setting.default != setting.minimum and setting.minimum is not None:
            return setting.minimum
        return setting.maximum
    if setting.kind == "int":
        return int(setting.maximum if setting.default != setting.maximum else setting.minimum)
    return setting.default


def test_every_setting_round_trips_through_settings():
    base = Settings()
    for setting in SETTINGS:
        probe = _probe(setting)
        updated = base.replace({setting.key: probe})
        assert updated.get(setting.key) == probe
        assert updated.as_dict()[setting.key] == probe


def test_every_setting_round_trips_through_a_profile(tmp_path):
    for scope in ("process", "machine", "needle"):
        values = {}
        for setting in SETTINGS:
            if setting.scope != scope:
                continue
            values[setting.key] = _probe(setting)
        profile = Profile(kind=scope, name=f"{scope} all", values=values)
        path = tmp_path / f"{scope}.json"
        save_profile(profile, path)
        loaded = load_profile(path)
        assert loaded.kind == scope
        applied, unknown = loaded.apply(Settings())
        assert unknown == {}
        for key, value in values.items():
            assert applied.get(key) == value


def test_out_of_range_values_are_rejected_with_a_clear_message():
    for setting in SETTINGS:
        if setting.kind in ("float", "int"):
            bad = (setting.maximum + 1) if setting.maximum is not None else (setting.minimum - 1)
            if setting.kind == "int":
                bad = int(bad) if bad > 0 else -1
            with pytest.raises(SettingsError) as exc:
                Settings({setting.key: bad})
            message = str(exc.value)
            assert setting.label in message
            assert "between" in message or "at least" in message or "at most" in message
        elif setting.kind == "enum":
            with pytest.raises(SettingsError, match="must be one of"):
                Settings({setting.key: "not-a-choice"})
        elif setting.kind == "bool":
            with pytest.raises(SettingsError, match="on or off"):
                Settings({setting.key: "yes"})
        elif setting.kind == "text":
            with pytest.raises(SettingsError, match="too long"):
                Settings({setting.key: "x" * 50_001})


def test_unknown_setting_is_rejected():
    with pytest.raises(SettingsError, match="Unknown setting"):
        Settings({"not_a_setting": 1})


def test_first_plane_cannot_exceed_pitch():
    with pytest.raises(SettingsError, match="cannot be larger than Layer distance"):
        Settings({"pitch": 0.05, "first_plane": 0.1})


def test_start_template_rejects_unknown_placeholder():
    with pytest.raises(SettingsError, match="unknown setting"):
        Settings({"start_gcode": "G21\nG1 F{does_not_exist}"})


def test_profile_unknown_keys_are_kept_and_reported():
    data = {
        "schema": 1,
        "kind": "process",
        "name": "future",
        "values": {"pitch": 0.2, "from_the_future": 42},
    }
    profile = parse_profile(data)
    assert profile.values == {"pitch": 0.2}
    assert "from_the_future" in profile.unknown
    assert profile.to_json()["unknown"]["from_the_future"]
    applied, unknown = profile.apply()
    assert applied.get("pitch") == 0.2
    assert "from_the_future" in unknown


def test_profile_rejects_wrong_scope():
    with pytest.raises(SettingsError, match="machine profile"):
        parse_profile(
            {"schema": 1, "kind": "process", "name": "x", "values": {"bed_x": 100}}
        )


def test_profile_rejects_bad_json_and_bad_shape():
    with pytest.raises(SettingsError, match="not valid JSON"):
        parse_profile("{nope")
    with pytest.raises(SettingsError, match="kind"):
        parse_profile({"schema": 1, "kind": "nope", "values": {}})
    with pytest.raises(SettingsError, match="values"):
        parse_profile({"schema": 1, "kind": "process", "values": []})


def test_profile_from_settings_only_writes_changed_values():
    s = Settings({"pitch": 0.2})
    profile = profile_from_settings(s, "process", "custom")
    assert profile.values == {"pitch": 0.2}
    assert profile.to_json()["schema"] == 1


def test_missing_profile_values_take_defaults():
    profile = parse_profile({"schema": 1, "kind": "process", "values": {"pitch": 0.2}})
    applied, _ = profile.apply()
    assert applied.get("pitch") == 0.2
    assert applied.get("feed") == 500
    assert applied.get("kick") == 1000


def test_builtin_profiles_are_valid_and_apply_cleanly():
    data = builtin_profiles()
    assert set(data) == {"process", "machine", "needle"}
    for kind, presets in data.items():
        assert presets
        for preset in presets:
            profile = parse_profile(
                {
                    "schema": 1,
                    "kind": kind,
                    "name": preset["name"],
                    "values": preset["values"],
                }
            )
            applied, unknown = profile.apply()
            assert not unknown
            assert applied.get("pitch") > 0


def test_schema_is_generated_from_the_same_table():
    schema = schema_json()
    assert len(schema["settings"]) == len(SETTINGS)
    keys = {item["key"] for item in schema["settings"]}
    assert keys == set(SETTINGS_BY_KEY)
    assert schema["defaults"] == defaults()
    for group in schema["groups"]:
        assert group["settings"]
        assert group["label"]
