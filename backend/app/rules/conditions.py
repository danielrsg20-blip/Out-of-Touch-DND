"""5e condition effect automation.

Each condition maps to its mechanical effects so that combat rolls
automatically incorporate advantage/disadvantage, incapacitation, etc.
"""

from __future__ import annotations

from typing import Any


# ── Condition → mechanical effects ──────────────────────────────────────────
# Keys used:
#   attack_disadvantage       – attacker has disadvantage on attack rolls
#   attacked_advantage_melee  – melee attacks against this creature have advantage
#   attacked_advantage        – all attacks against this creature have advantage
#   attacked_disadvantage     – attacks against this creature have disadvantage
#   auto_fail_str_dex_saves   – auto-fail STR & DEX saving throws
#   speed_zero                – speed becomes 0
#   incapacitated             – can't take actions or reactions
#   breaks_concentration      – immediately breaks concentration
#   cant_speak                – can't speak (for verbal component checks)

CONDITION_EFFECTS: dict[str, dict[str, bool]] = {
    "Blinded": {
        "attack_disadvantage": True,
        "attacked_advantage": True,
    },
    "Charmed": {
        # Charmed creature can't attack charmer – handled narratively by DM
    },
    "Deafened": {
        # Can't hear – mainly narrative
    },
    "Frightened": {
        "attack_disadvantage": True,  # while source of fear is in line of sight
    },
    "Grappled": {
        "speed_zero": True,
    },
    "Incapacitated": {
        "incapacitated": True,
    },
    "Invisible": {
        "attacked_disadvantage": True,
        # Attacker's attacks have disadvantage; invisible creature's attacks have advantage
        # handled via get_attack_modifiers
    },
    "Paralyzed": {
        "incapacitated": True,
        "auto_fail_str_dex_saves": True,
        "attacked_advantage": True,
        "speed_zero": True,
        "breaks_concentration": True,
    },
    "Petrified": {
        "incapacitated": True,
        "auto_fail_str_dex_saves": True,
        "attacked_advantage": True,
        "speed_zero": True,
        "breaks_concentration": True,
    },
    "Poisoned": {
        "attack_disadvantage": True,
        # Also disadvantage on ability checks – handled in check tool
    },
    "Prone": {
        "attack_disadvantage": True,
        "attacked_advantage_melee": True,
        "attacked_disadvantage_ranged": True,
    },
    "Restrained": {
        "attack_disadvantage": True,
        "attacked_advantage": True,
        "speed_zero": True,
    },
    "Stunned": {
        "incapacitated": True,
        "auto_fail_str_dex_saves": True,
        "attacked_advantage": True,
        "breaks_concentration": True,
    },
    "Unconscious": {
        "incapacitated": True,
        "speed_zero": True,
        "auto_fail_str_dex_saves": True,
        "attacked_advantage": True,
        "breaks_concentration": True,
    },
}


def apply_condition(
    character: Any,
    condition: str,
    duration_rounds: int | None = None,
) -> dict[str, Any]:
    """Apply a condition to a character. Returns result dict.

    character.conditions is changed from a plain list of strings to a list
    of dicts: ``[{"name": "Blinded", "remaining_rounds": 3}, ...]``
    If *duration_rounds* is None the condition lasts until removed.
    """
    # Normalise legacy plain-string conditions on first touch
    _normalise_conditions(character)

    # Don't double-apply
    for c in character.conditions:
        if isinstance(c, dict) and c.get("name") == condition:
            # refresh duration
            if duration_rounds is not None:
                c["remaining_rounds"] = duration_rounds
            return {"already_applied": True, "condition": condition}

    entry: dict[str, Any] = {"name": condition}
    if duration_rounds is not None:
        entry["remaining_rounds"] = duration_rounds

    character.conditions.append(entry)

    result: dict[str, Any] = {
        "applied": True,
        "condition": condition,
        "duration_rounds": duration_rounds,
    }

    # Concentration break for stunned/paralyzed/unconscious/petrified
    effects = CONDITION_EFFECTS.get(condition, {})
    if effects.get("breaks_concentration") and getattr(character, "concentration_spell", None):
        result["concentration_broken"] = character.concentration_spell
        character.concentration_spell = None

    return result


def remove_condition(character: Any, condition: str) -> dict[str, Any]:
    """Remove a condition from a character."""
    _normalise_conditions(character)
    before = len(character.conditions)
    character.conditions = [
        c for c in character.conditions
        if not (isinstance(c, dict) and c.get("name") == condition)
    ]
    removed = len(character.conditions) < before
    return {"removed": removed, "condition": condition}


def tick_conditions(character: Any) -> list[dict[str, Any]]:
    """Decrement duration-based conditions at start of turn. Returns expired list."""
    _normalise_conditions(character)
    expired: list[dict[str, Any]] = []
    remaining: list[dict[str, Any]] = []
    for c in character.conditions:
        if not isinstance(c, dict):
            continue
        rounds = c.get("remaining_rounds")
        if rounds is not None:
            c["remaining_rounds"] = rounds - 1
            if c["remaining_rounds"] <= 0:
                expired.append(c)
                continue
        remaining.append(c)
    character.conditions = remaining
    return expired


def get_condition_names(character: Any) -> list[str]:
    """Return plain list of active condition names."""
    _normalise_conditions(character)
    return [
        c["name"] if isinstance(c, dict) else str(c)
        for c in character.conditions
    ]


def get_attack_modifiers(
    attacker: Any,
    target: Any,
    is_melee: bool = True,
) -> tuple[bool, bool]:
    """Return (advantage, disadvantage) booleans for an attack roll.

    Aggregates effects from both attacker's and target's conditions.
    """
    adv = False
    disadv = False

    attacker_conditions = get_condition_names(attacker)
    target_conditions = get_condition_names(target)

    # Attacker conditions
    for cond in attacker_conditions:
        effects = CONDITION_EFFECTS.get(cond, {})
        if effects.get("attack_disadvantage"):
            disadv = True
        # Invisible attacker gets advantage
        if cond == "Invisible":
            adv = True

    # Target conditions
    for cond in target_conditions:
        effects = CONDITION_EFFECTS.get(cond, {})
        if effects.get("attacked_advantage"):
            adv = True
        if effects.get("attacked_advantage_melee") and is_melee:
            adv = True
        if effects.get("attacked_disadvantage"):
            disadv = True
        if effects.get("attacked_disadvantage_ranged") and not is_melee:
            disadv = True
        # Invisible target — attacker has disadvantage
        if cond == "Invisible":
            disadv = True

    return adv, disadv


def has_condition_effect(character: Any, effect_key: str) -> bool:
    """Check if any of the character's conditions produce a given effect."""
    for cond in get_condition_names(character):
        if CONDITION_EFFECTS.get(cond, {}).get(effect_key):
            return True
    return False


def _normalise_conditions(character: Any) -> None:
    """Convert legacy plain-string condition lists to the dict format."""
    if not hasattr(character, "conditions") or not character.conditions:
        return
    normalised = []
    for c in character.conditions:
        if isinstance(c, str):
            normalised.append({"name": c})
        else:
            normalised.append(c)
    character.conditions = normalised
