"""SRD content repository for versioned spells, class spell lists, and class features."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import SRD_RULES_VERSION

_DATA_DIR = Path(__file__).resolve().parent / "data"


def _safe_key(value: str) -> str:
    return "".join(ch for ch in value.lower().strip() if ch.isalnum())


def _load_json_file(path: Path) -> dict[str, Any] | list[Any]:
    if not path.exists():
        return {} if path.suffix == ".json" else []
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=8)
def _load_spells(version: str) -> dict[str, dict[str, Any]]:
    versioned_path = _DATA_DIR / f"spells.{version}.json"
    legacy_path = _DATA_DIR / "spells.json"

    raw = _load_json_file(versioned_path)
    if not raw:
        raw = _load_json_file(legacy_path)

    spells: dict[str, dict[str, Any]] = {}
    if isinstance(raw, dict):
        for name, value in raw.items():
            if not isinstance(value, dict):
                continue
            spell = dict(value)
            spell.setdefault("name", name)
            spell.setdefault("id", _safe_key(name))
            spell.setdefault("rules_version", version)
            spell.setdefault("source", "SRD")
            spell.setdefault("license", "CC-BY-4.0")
            spell.setdefault("classes", [])
            key = _safe_key(spell["name"])
            spells[key] = spell
    elif isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict) or not entry.get("name"):
                continue
            spell = dict(entry)
            spell.setdefault("id", _safe_key(spell["name"]))
            spell.setdefault("rules_version", version)
            spell.setdefault("source", "SRD")
            spell.setdefault("license", "CC-BY-4.0")
            spell.setdefault("classes", [])
            spells[_safe_key(spell["name"])] = spell
    return spells


@lru_cache(maxsize=8)
def _load_class_spell_lists(version: str) -> dict[str, list[str]]:
    path = _DATA_DIR / f"class_spell_lists.{version}.json"
    raw = _load_json_file(path)

    if isinstance(raw, dict) and raw:
        normalized: dict[str, list[str]] = {}
        for class_name, spells in raw.items():
            if isinstance(spells, list):
                normalized[class_name] = [str(s) for s in spells]
        if normalized:
            return normalized

    # Fallback: derive class spell lists from spell catalog classes field.
    by_class: dict[str, list[str]] = {}
    for spell in _load_spells(version).values():
        for class_name in spell.get("classes", []):
            by_class.setdefault(class_name, []).append(spell["name"])

    for class_name in by_class:
        by_class[class_name] = sorted(set(by_class[class_name]))

    return by_class


@lru_cache(maxsize=8)
def _load_class_features(version: str) -> dict[str, list[dict[str, Any]]]:
    path = _DATA_DIR / f"class_features.{version}.json"
    raw = _load_json_file(path)
    if not isinstance(raw, dict):
        return {}

    out: dict[str, list[dict[str, Any]]] = {}
    for class_name, features in raw.items():
        if isinstance(features, list):
            out[class_name] = [f for f in features if isinstance(f, dict)]
    return out


def get_spell(spell_name: str, rules_version: str | None = None) -> dict[str, Any] | None:
    version = rules_version or SRD_RULES_VERSION
    return _load_spells(version).get(_safe_key(spell_name))


def get_spells_for_class(char_class: str, rules_version: str | None = None) -> list[str]:
    version = rules_version or SRD_RULES_VERSION
    spell_list = _load_class_spell_lists(version).get(char_class, [])
    return sorted(spell_list)


def is_spell_available_to_class(spell_name: str, char_class: str, rules_version: str | None = None) -> bool:
    version = rules_version or SRD_RULES_VERSION
    spell = get_spell(spell_name, version)
    if spell is None:
        return False

    allowed = spell.get("classes") or []
    if allowed:
        return char_class in allowed

    # Fallback to class list table when spell entry has no classes.
    return spell_name in _load_class_spell_lists(version).get(char_class, [])


def get_class_features(char_class: str, level: int | None = None, rules_version: str | None = None) -> list[dict[str, Any]]:
    version = rules_version or SRD_RULES_VERSION
    features = _load_class_features(version).get(char_class, [])
    if level is None:
        return list(features)
    return [f for f in features if int(f.get("level", 0)) <= level]
