"""Character import / export — portable JSON serialization."""

from __future__ import annotations

from typing import Any

from .rules.characters import Character, CLASSES, ABILITY_NAMES, RACES

# Current export format version so we can migrate in the future.
EXPORT_VERSION = 1

# Fields that are always included in an export.
_REQUIRED_FIELDS = {"name", "race", "class", "level", "abilities"}

# Ability score bounds
_MIN_ABILITY = 1
_MAX_ABILITY = 30


def export_character(character: Character) -> dict[str, Any]:
    """Serialize a Character to a portable JSON-safe dict."""
    data = character.to_dict()
    # Strip transient / internal-only keys
    for key in ("is_monster", "monster_type", "monster_attacks",
                "damage_vulnerabilities", "damage_immunities",
                "challenge_rating", "xp_value", "monster_traits"):
        data.pop(key, None)
    data["_export_version"] = EXPORT_VERSION
    return data


def validate_import(data: dict[str, Any]) -> dict[str, Any]:
    """Validate an import payload. Returns {"valid": True} or {"valid": False, "errors": [...]}."""
    errors: list[str] = []

    for field in _REQUIRED_FIELDS:
        if field not in data:
            errors.append(f"Missing required field: {field}")

    if "name" in data:
        name = str(data["name"]).strip()
        if len(name) < 2 or len(name) > 64:
            errors.append("Name must be 2-64 characters")

    if "race" in data and data["race"] not in RACES:
        errors.append(f"Unknown race: {data['race']}")

    cls = data.get("class", data.get("char_class", ""))
    if cls and cls not in CLASSES:
        errors.append(f"Unknown class: {cls}")

    level = data.get("level", 0)
    if not isinstance(level, int) or level < 1 or level > 20:
        errors.append("Level must be an integer between 1 and 20")

    abilities = data.get("abilities", {})
    if not isinstance(abilities, dict):
        errors.append("Abilities must be a dict")
    else:
        for ab in ABILITY_NAMES:
            val = abilities.get(ab)
            if val is None:
                errors.append(f"Missing ability score: {ab}")
            elif not isinstance(val, int) or val < _MIN_ABILITY or val > _MAX_ABILITY:
                errors.append(f"{ab} must be an integer between {_MIN_ABILITY} and {_MAX_ABILITY}")

    if errors:
        return {"valid": False, "errors": errors}
    return {"valid": True}


def import_character(data: dict[str, Any], char_id: str) -> Character:
    """Build a Character from an import payload.

    Validates first, then creates the character re-using from_dict for
    maximum field coverage.  Raises ValueError on validation failure.
    """
    validation = validate_import(data)
    if not validation.get("valid"):
        raise ValueError("; ".join(validation.get("errors", ["Invalid data"])))

    # Normalize class key
    if "char_class" not in data and "class" in data:
        data["char_class"] = data["class"]

    # Force the id to the one we assign
    data["id"] = char_id

    # Sanitize ability scores (clamp)
    abilities = data.get("abilities", {})
    for ab in ABILITY_NAMES:
        val = abilities.get(ab, 10)
        abilities[ab] = max(_MIN_ABILITY, min(_MAX_ABILITY, int(val)))
    data["abilities"] = abilities

    # Clamp level
    data["level"] = max(1, min(20, int(data.get("level", 1))))

    # Clamp HP
    if "hp" in data:
        data["hp"] = max(0, int(data["hp"]))
    if "max_hp" in data:
        data["max_hp"] = max(1, int(data["max_hp"]))

    char = Character.from_dict(data)

    # Re-initialize spell slots to be consistent
    from .rules.spells import initialize_spell_slots
    initialize_spell_slots(char)

    return char
