"""Spell system: slot tracking, concentration, spell data."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .characters import Character

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
