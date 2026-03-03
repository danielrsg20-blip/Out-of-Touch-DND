"""Spell system: slot tracking, selection rules, and cast validation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .characters import Character
from .content_repository import (
    get_class_features,
    get_spell,
    get_spells_for_class,
    is_spell_available_to_class,
)

SPELL_SLOTS_BY_LEVEL: dict[int, dict[int, int]] = {
    1:  {1: 2},
    2:  {1: 3},
    3:  {1: 4, 2: 2},
    4:  {1: 4, 2: 3},
    5:  {1: 4, 2: 3, 3: 2},
    6:  {1: 4, 2: 3, 3: 3},
    7:  {1: 4, 2: 3, 3: 3, 4: 1},
    8:  {1: 4, 2: 3, 3: 3, 4: 2},
    9:  {1: 4, 2: 3, 3: 3, 4: 3, 5: 1},
    10: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2},
    11: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1},
    12: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1},
    13: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1},
    14: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1},
    15: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1},
    16: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1},
    17: {1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1},
    18: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1},
    19: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1},
    20: {1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1},
}

HALF_CASTERS = {"Paladin", "Ranger"}
THIRD_CASTERS = {"Eldritch Knight", "Arcane Trickster"}

PREPARED_CASTERS = {"Cleric", "Druid", "Paladin", "Wizard"}
KNOWN_CASTERS = {"Bard", "Sorcerer", "Warlock", "Ranger"}

KNOWN_SPELLS_BY_LEVEL: dict[str, list[int]] = {
    "Bard": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 20, 22, 22],
    "Sorcerer": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
    "Warlock": [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
    "Ranger": [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
}


def get_spell_slots(char_class: str, level: int) -> dict[int, int]:
    """Get available spell slots for a given class and level."""
    from .characters import CLASSES
    cls_data = CLASSES.get(char_class, {})
    if not cls_data.get("spellcaster"):
        return {}

    effective_level = level
    if char_class in HALF_CASTERS:
        effective_level = max(1, level // 2)

    return dict(SPELL_SLOTS_BY_LEVEL.get(effective_level, {}))


def initialize_spell_slots(character: Character) -> None:
    """Set up spell slots on a character based on class and level."""
    slots = get_spell_slots(character.char_class, character.level)
    character.spell_slots = slots
    character.spell_slots_used = {k: 0 for k in slots}


def get_spellcasting_mode(char_class: str) -> str:
    if char_class in PREPARED_CASTERS:
        return "prepared"
    if char_class in KNOWN_CASTERS:
        return "known"
    return "none"


def max_spell_level_for_character(char_class: str, level: int) -> int:
    slots = get_spell_slots(char_class, level)
    if not slots:
        return 0
    return max(slots)


def get_known_spells_limit(char_class: str, level: int) -> int:
    if char_class not in KNOWN_CASTERS:
        return 0
    table = KNOWN_SPELLS_BY_LEVEL.get(char_class, [])
    if not table:
        return 0
    safe_level = max(1, min(level, len(table)))
    return int(table[safe_level - 1])


def get_prepared_spells_limit(character: Character) -> int:
    if get_spellcasting_mode(character.char_class) != "prepared":
        return 0
    if not get_spell_slots(character.char_class, character.level):
        return 0

    from .characters import CLASSES
    cls_data = CLASSES.get(character.char_class, {})
    spellcasting_ability = cls_data.get("primary_ability", "INT")
    return max(1, character.level + character.ability_modifier(spellcasting_ability))


def _normalize_unique(spells: list[str] | None) -> list[str]:
    if not spells:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for name in spells:
        key = str(name).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(str(name).strip())
    return out


def _is_spell_level_legal_for_character(spell_name: str, char_class: str, level: int, rules_version: str | None = None) -> bool:
    spell = get_spell(spell_name, rules_version)
    if not spell:
        return False
    spell_level = int(spell.get("level", 0))
    if spell_level == 0:
        return True
    return spell_level <= max_spell_level_for_character(char_class, level)


def get_selectable_spells_for_character(character: Character, rules_version: str | None = None) -> list[dict[str, Any]]:
    selectable: list[dict[str, Any]] = []
    for spell_name in get_class_spell_list(character.char_class):
        if not _is_spell_level_legal_for_character(spell_name, character.char_class, character.level, rules_version):
            continue
        spell = get_spell_definition(spell_name)
        if not spell:
            continue
        selectable.append({
            "name": spell_name,
            "level": int(spell.get("level", 0)),
            "school": spell.get("school", ""),
        })
    return sorted(selectable, key=lambda s: (int(s.get("level", 0)), str(s.get("name", ""))))


def validate_spell_selections(
    character: Character,
    known_spells: list[str] | None = None,
    prepared_spells: list[str] | None = None,
    rules_version: str | None = None,
) -> dict[str, Any]:
    mode = get_spellcasting_mode(character.char_class)
    allowed_spells = {s["name"] for s in get_selectable_spells_for_character(character, rules_version)}

    norm_known = _normalize_unique(known_spells)
    norm_prepared = _normalize_unique(prepared_spells)

    invalid_known = [s for s in norm_known if s not in allowed_spells]
    invalid_prepared = [s for s in norm_prepared if s not in allowed_spells]
    if invalid_known or invalid_prepared:
        return {
            "valid": False,
            "error": "One or more selected spells are not legal for this class/level/ruleset",
            "invalid_known_spells": invalid_known,
            "invalid_prepared_spells": invalid_prepared,
        }

    if mode == "known":
        known_limit = get_known_spells_limit(character.char_class, character.level)
        if len(norm_known) > known_limit:
            return {
                "valid": False,
                "error": f"{character.char_class} can know at most {known_limit} spells at level {character.level}",
            }
        if known_limit > 0 and not norm_known:
            default_known = [s["name"] for s in get_selectable_spells_for_character(character, rules_version) if int(s.get("level", 0)) > 0][:known_limit]
            norm_known = default_known
        return {
            "valid": True,
            "known_spells": norm_known,
            "prepared_spells": [],
            "mode": mode,
            "known_limit": known_limit,
            "prepared_limit": 0,
        }

    if mode == "prepared":
        prepared_limit = get_prepared_spells_limit(character)
        if len(norm_prepared) > prepared_limit:
            return {
                "valid": False,
                "error": f"{character.char_class} can prepare at most {prepared_limit} spells at level {character.level}",
            }
        if prepared_limit > 0 and not norm_prepared:
            default_prepared = [s["name"] for s in get_selectable_spells_for_character(character, rules_version) if int(s.get("level", 0)) > 0][:prepared_limit]
            norm_prepared = default_prepared
        return {
            "valid": True,
            "known_spells": norm_known,
            "prepared_spells": norm_prepared,
            "mode": mode,
            "known_limit": 0,
            "prepared_limit": prepared_limit,
        }

    return {
        "valid": True,
        "known_spells": [],
        "prepared_spells": [],
        "mode": mode,
        "known_limit": 0,
        "prepared_limit": 0,
    }


def evaluate_cast_permission(
    character: Character,
    spell_name: str,
    slot_level: int,
    in_combat: bool | None = None,
    enforce_noncombat_restrictions: bool = False,
    rules_version: str | None = None,
) -> dict[str, Any]:
    spell_def = get_spell(spell_name, rules_version)
    if not spell_def:
        return {"allowed": False, "error": f"Unknown spell '{spell_name}' for current SRD dataset", "reason": "unknown_spell"}

    if not is_spell_available_to_class(spell_name, character.char_class, rules_version):
        return {"allowed": False, "error": f"{spell_name} is not on the {character.char_class} spell list", "reason": "class_restricted"}

    mode = get_spellcasting_mode(character.char_class)
    if mode == "known" and spell_name not in (character.known_spells or []):
        return {"allowed": False, "error": f"{character.name} does not know {spell_name}", "reason": "not_known"}
    if mode == "prepared" and spell_name not in (character.prepared_spells or []):
        return {"allowed": False, "error": f"{spell_name} is not currently prepared", "reason": "not_prepared"}

    required_level = int(spell_def.get("level", 0))

    if enforce_noncombat_restrictions and in_combat is False and slot_level > 0:
        return {
            "allowed": False,
            "error": f"{spell_name} cannot be cast from the action bar outside combat",
            "reason": "restricted_out_of_combat",
        }

    if slot_level == 0 and required_level > 0:
        return {"allowed": False, "error": f"{spell_name} is level {required_level} and requires a spell slot", "reason": "slot_required"}

    if slot_level > 0 and required_level == 0:
        return {"allowed": False, "error": f"{spell_name} is a cantrip and does not use spell slots", "reason": "cantrip_slot_mismatch"}

    if slot_level > 0 and slot_level < required_level:
        return {"allowed": False, "error": f"{spell_name} requires at least a level {required_level} slot", "reason": "slot_too_low"}

    if slot_level > 0:
        available = character.spell_slots.get(slot_level, 0)
        used = character.spell_slots_used.get(slot_level, 0)
        if available == 0:
            return {"allowed": False, "error": f"{character.name} has no level {slot_level} spell slots", "reason": "no_slot_level"}
        if used >= available:
            return {
                "allowed": False,
                "error": f"{character.name} has no remaining level {slot_level} slots ({used}/{available} used)",
                "reason": "slots_exhausted",
            }

    return {
        "allowed": True,
        "reason": "ok",
        "spell_level": required_level,
        "mode": mode,
    }


def get_spell_slot_states(character: Character, in_combat: bool) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for level in sorted(character.spell_slots.keys()):
        total = int(character.spell_slots.get(level, 0))
        used = int(character.spell_slots_used.get(level, 0))
        remaining = max(0, total - used)
        restricted = (not in_combat) and level > 0
        state = "available"
        if restricted:
            state = "restricted"
        elif remaining <= 0:
            state = "unavailable"

        rows.append({
            "level": int(level),
            "total": total,
            "used": used,
            "remaining": remaining,
            "state": state,
            "restricted": restricted,
        })
    return rows


def get_castable_spell_options(character: Character, in_combat: bool, rules_version: str | None = None) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    mode = get_spellcasting_mode(character.char_class)
    if mode == "known":
        source_spells = list(character.known_spells or [])
    elif mode == "prepared":
        source_spells = list(character.prepared_spells or [])
    else:
        source_spells = []

    for spell_name in source_spells:
        spell_def = get_spell(spell_name, rules_version)
        if not spell_def:
            continue
        spell_level = int(spell_def.get("level", 0))

        if spell_level == 0:
            permissions = evaluate_cast_permission(character, spell_name, 0, in_combat=in_combat, rules_version=rules_version)
            options.append({
                "name": spell_name,
                "level": spell_level,
                "castable": bool(permissions.get("allowed", False)),
                "reason": permissions.get("reason"),
                "slot_options": [0],
            })
            continue

        legal_slot_levels = sorted([lvl for lvl, total in character.spell_slots.items() if total > 0 and int(lvl) >= spell_level])
        castable = False
        best_reason: str | None = None
        slot_options: list[int] = []
        for lvl in legal_slot_levels:
            permission = evaluate_cast_permission(
                character,
                spell_name,
                int(lvl),
                in_combat=in_combat,
                enforce_noncombat_restrictions=True,
                rules_version=rules_version,
            )
            if permission.get("allowed"):
                castable = True
                slot_options.append(int(lvl))
            elif best_reason is None:
                best_reason = str(permission.get("reason"))

        options.append({
            "name": spell_name,
            "level": spell_level,
            "castable": castable,
            "reason": None if castable else (best_reason or "not_castable"),
            "slot_options": slot_options if castable else legal_slot_levels,
        })

    return sorted(options, key=lambda s: (int(s.get("level", 0)), str(s.get("name", ""))))


def use_spell_slot(character: Character, slot_level: int) -> dict[str, Any]:
    """Expend a spell slot of the given level."""
    available = character.spell_slots.get(slot_level, 0)
    used = character.spell_slots_used.get(slot_level, 0)

    if available == 0:
        return {"error": f"{character.name} has no level {slot_level} spell slots"}
    if used >= available:
        return {"error": f"{character.name} has no remaining level {slot_level} slots ({used}/{available} used)"}

    character.spell_slots_used[slot_level] = used + 1
    remaining = available - used - 1

    return {
        "character": character.name,
        "slot_level": slot_level,
        "remaining": remaining,
        "total": available,
        "message": f"{character.name} expends a level {slot_level} spell slot ({remaining}/{available} remaining)",
    }


def restore_all_slots(character: Character) -> dict:
    """Restore all spell slots (long rest)."""
    character.spell_slots_used = {k: 0 for k in character.spell_slots}
    return {"character": character.name, "message": f"{character.name}'s spell slots restored."}


CANTRIP_DAMAGE_SCALING = {1: 1, 5: 2, 11: 3, 17: 4}


def cantrip_dice_count(character_level: int) -> int:
    count = 1
    for threshold, dice in sorted(CANTRIP_DAMAGE_SCALING.items()):
        if character_level >= threshold:
            count = dice
    return count


def get_spell_definition(spell_name: str) -> dict[str, Any] | None:
    return get_spell(spell_name)


def get_class_spell_list(char_class: str) -> list[str]:
    return get_spells_for_class(char_class)


def can_class_cast_spell(char_class: str, spell_name: str) -> bool:
    return is_spell_available_to_class(spell_name, char_class)


def get_class_features_for_level(char_class: str, level: int) -> list[dict[str, Any]]:
    return get_class_features(char_class, level=level)
