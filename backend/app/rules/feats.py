"""Feat and Ability Score Improvement logic for 5e 2024 rules."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_FEATS_DATA: dict[str, dict] | None = None

ASI_LEVELS = {4, 8, 12, 16, 19}

ABILITY_NAMES = ("STR", "DEX", "CON", "INT", "WIS", "CHA")


def is_asi_level(level: int, class_levels: dict[str, int] | None = None, leveling_class: str | None = None) -> bool:
    """Check if an ASI is earned.

    For single-class characters, checks total level against ASI_LEVELS.
    For multiclass, checks if the *class being leveled* just hit one of its
    class-specific ASI levels.
    """
    if class_levels and leveling_class:
        from .characters import ASI_LEVELS_BY_CLASS
        cls_level = class_levels.get(leveling_class, 0)
        asi_set = ASI_LEVELS_BY_CLASS.get(leveling_class, ASI_LEVELS)
        return cls_level in asi_set
    return level in ASI_LEVELS


def _load_feats() -> dict[str, dict]:
    global _FEATS_DATA
    if _FEATS_DATA is None:
        path = Path(__file__).parent / "data" / "feats.json"
        with open(path, encoding="utf-8") as f:
            _FEATS_DATA = json.load(f)
    return _FEATS_DATA


def get_all_feats() -> dict[str, dict]:
    return _load_feats()


def get_feat(name: str) -> dict | None:
    feats = _load_feats()
    return feats.get(name)


def check_prerequisite(character: Any, feat_data: dict) -> tuple[bool, str]:
    """Check if a character meets a feat's prerequisite. Returns (ok, reason)."""
    prereq = feat_data.get("prerequisite")
    if not prereq:
        return True, ""

    # Ability score prerequisites like "DEX 13"
    parts = prereq.split()
    if len(parts) == 2 and parts[0] in ABILITY_NAMES:
        ability, score = parts[0], int(parts[1])
        current = character.abilities.get(ability, 10)
        if current < score:
            return False, f"Requires {ability} {score}, character has {current}"
        return True, ""

    # Armor proficiency prerequisites
    if "proficiency" in prereq.lower():
        if "heavy armor" in prereq.lower():
            if "heavy" in getattr(character, "proficiencies", []):
                return True, ""
            return False, "Requires heavy armor proficiency"
        if "medium armor" in prereq.lower():
            profs = getattr(character, "proficiencies", [])
            if "medium" in profs or "heavy" in profs:
                return True, ""
            return False, "Requires medium armor proficiency"

    # Spellcasting prerequisite
    if "spellcasting" in prereq.lower():
        from .characters import CLASSES
        class_data = CLASSES.get(character.char_class, {})
        if class_data.get("spellcaster"):
            return True, ""
        return False, "Requires spellcasting ability"

    return True, ""


def get_available_feats(character: Any) -> list[dict]:
    """Return feats the character qualifies for and doesn't already have."""
    feats = _load_feats()
    available = []
    existing = set(getattr(character, "feats", []))
    for name, data in feats.items():
        if name in existing:
            continue
        ok, _reason = check_prerequisite(character, data)
        if ok:
            available.append({"name": name, "description": data["description"]})
    return available


def apply_feat(character: Any, feat_name: str) -> dict:
    """Apply a feat to a character. Returns result dict."""
    feat_data = get_feat(feat_name)
    if not feat_data:
        return {"error": f"Unknown feat: {feat_name}"}

    existing = getattr(character, "feats", [])
    if feat_name in existing:
        return {"error": f"{character.name} already has {feat_name}"}

    ok, reason = check_prerequisite(character, feat_data)
    if not ok:
        return {"error": f"Prerequisite not met for {feat_name}: {reason}"}

    character.feats.append(feat_name)
    effects = feat_data.get("effects", {})
    applied = []

    # Speed bonus (Mobile)
    speed_bonus = effects.get("speed_bonus")
    if speed_bonus:
        character.speed += speed_bonus
        applied.append(f"Speed +{speed_bonus}")

    # HP bonus (Tough)
    hp_per_level = effects.get("hp_bonus_per_level")
    if hp_per_level:
        bonus = hp_per_level * character.level
        character.max_hp += bonus
        character.hp += bonus
        applied.append(f"HP +{bonus}")

    # Fixed ability increases (Durable: CON, Heavy Armor Master: STR, etc.)
    for key, val in effects.items():
        if key.startswith("ability_increase_"):
            ability = key.replace("ability_increase_", "").upper()
            if ability in character.abilities:
                character.abilities[ability] = min(20, character.abilities[ability] + val)
                applied.append(f"{ability} +{val}")

    # Armor proficiency
    armor_prof = effects.get("armor_proficiency")
    if armor_prof and hasattr(character, "proficiencies"):
        if armor_prof not in character.proficiencies:
            character.proficiencies.append(armor_prof)
            applied.append(f"Gained {armor_prof} armor proficiency")

    return {
        "feat": feat_name,
        "character": character.name,
        "description": feat_data["description"],
        "effects_applied": applied,
        "message": f"{character.name} gained the {feat_name} feat." + (f" ({', '.join(applied)})" if applied else ""),
    }


def apply_asi(character: Any, increases: dict[str, int]) -> dict:
    """Apply an Ability Score Improvement. Increases is e.g. {'STR': 2} or {'DEX': 1, 'CON': 1}."""
    total = sum(increases.values())
    if total > 2:
        return {"error": f"ASI allows max 2 total points, got {total}"}
    if total < 1:
        return {"error": "Must increase at least 1 ability point"}

    for ability, amount in increases.items():
        if ability not in ABILITY_NAMES:
            return {"error": f"Invalid ability: {ability}"}
        if amount < 1 or amount > 2:
            return {"error": f"Each ability can be increased by 1 or 2, got {amount} for {ability}"}

    applied = []
    for ability, amount in increases.items():
        old = character.abilities.get(ability, 10)
        new_val = min(20, old + amount)
        actual = new_val - old
        if actual > 0:
            character.abilities[ability] = new_val
            applied.append(f"{ability} {old} -> {new_val}")

    return {
        "character": character.name,
        "increases": applied,
        "message": f"{character.name} improved abilities: {', '.join(applied)}.",
    }
