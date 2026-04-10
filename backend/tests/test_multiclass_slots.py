"""Validate multiclass spell slot calculation."""

from app.rules.spells import get_multiclass_caster_level, get_multiclass_spell_slots


# ── Caster level calculation ──────────────────────────────────────────

def test_single_full_caster():
    """Wizard 5 → caster level 5."""
    level = get_multiclass_caster_level({"Wizard": 5})
    assert level == 5


def test_half_caster_rounds_down():
    """Paladin 5 → caster level 2 (floor(5/2))."""
    level = get_multiclass_caster_level({"Paladin": 5})
    assert level == 2


def test_fighter_wizard_multiclass():
    """Fighter 5 / Wizard 3 → 0 + 3 = caster level 3."""
    level = get_multiclass_caster_level({"Fighter": 5, "Wizard": 3})
    assert level == 3


def test_paladin_cleric_multiclass():
    """Paladin 4 / Cleric 3 → 2 + 3 = caster level 5."""
    level = get_multiclass_caster_level({"Paladin": 4, "Cleric": 3})
    assert level == 5


def test_pure_non_caster():
    """Fighter 10 → caster level 0."""
    level = get_multiclass_caster_level({"Fighter": 10})
    assert level == 0


# ── Slot tables ───────────────────────────────────────────────────────

def test_wizard_5_slots():
    """Wizard 5 should have 3rd-level slots."""
    slots = get_multiclass_spell_slots({"Wizard": 5})
    assert slots.get(1, 0) >= 4  # at least 4 1st level slots
    assert slots.get(3, 0) >= 2  # at least 2 3rd level slots


def test_fighter_wizard_slots():
    """Fighter 5 / Wizard 3 → caster level 3 → 2nd level slots."""
    slots = get_multiclass_spell_slots({"Fighter": 5, "Wizard": 3})
    assert slots.get(1, 0) >= 4
    assert slots.get(2, 0) >= 2
    # Should NOT have 3rd level slots at caster level 3
    # Caster level 3 = (4 1st, 2 2nd)
    assert slots.get(3, 0) == 0


def test_cleric_wizard_combined():
    """Cleric 3 / Wizard 3 → caster level 6 → should have 3rd level slots."""
    slots = get_multiclass_spell_slots({"Cleric": 3, "Wizard": 3})
    assert slots.get(3, 0) >= 2


def test_non_caster_has_no_slots():
    """Pure Fighter 10 → no spell slots."""
    slots = get_multiclass_spell_slots({"Fighter": 10})
    total = sum(slots.values()) if slots else 0
    assert total == 0
