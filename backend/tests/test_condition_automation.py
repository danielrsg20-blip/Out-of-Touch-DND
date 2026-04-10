"""Validate condition automation: advantage/disadvantage, ticking, concentration."""

from types import SimpleNamespace

from app.rules.conditions import (
    apply_condition,
    get_attack_modifiers,
    has_condition_effect,
    remove_condition,
    tick_conditions,
)


def _make_char(**overrides):
    defaults = dict(
        name="Test",
        conditions=[],
        concentration_spell=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ── apply / remove ────────────────────────────────────────────────────

def test_apply_blinded():
    c = _make_char()
    result = apply_condition(c, "Blinded")
    assert result["applied"] is True
    assert any(
        (cond["name"] if isinstance(cond, dict) else cond) == "Blinded"
        for cond in c.conditions
    )


def test_remove_condition():
    c = _make_char()
    apply_condition(c, "Blinded")
    result = remove_condition(c, "Blinded")
    assert result["removed"] is True
    names = [(cond["name"] if isinstance(cond, dict) else cond) for cond in c.conditions]
    assert "Blinded" not in names


# ── attack modifiers ─────────────────────────────────────────────────

def test_blinded_attacker_has_disadvantage():
    attacker = _make_char(name="Attacker")
    target = _make_char(name="Target")
    apply_condition(attacker, "Blinded")
    _adv, disadv = get_attack_modifiers(attacker, target, is_melee=True)
    assert disadv is True


def test_blinded_target_gives_advantage():
    attacker = _make_char(name="Attacker")
    target = _make_char(name="Target")
    apply_condition(target, "Blinded")
    adv, _disadv = get_attack_modifiers(attacker, target, is_melee=True)
    assert adv is True


def test_prone_melee_advantage():
    attacker = _make_char(name="Attacker")
    target = _make_char(name="Target")
    apply_condition(target, "Prone")
    adv, _disadv = get_attack_modifiers(attacker, target, is_melee=True)
    assert adv is True


def test_prone_ranged_disadvantage():
    attacker = _make_char(name="Attacker")
    target = _make_char(name="Target")
    apply_condition(target, "Prone")
    _adv, disadv = get_attack_modifiers(attacker, target, is_melee=False)
    assert disadv is True


def test_invisible_attacker_has_advantage():
    attacker = _make_char(name="Attacker")
    target = _make_char(name="Target")
    apply_condition(attacker, "Invisible")
    adv, _disadv = get_attack_modifiers(attacker, target)
    assert adv is True


# ── ticking ───────────────────────────────────────────────────────────

def test_tick_decrements_duration():
    c = _make_char()
    apply_condition(c, "Poisoned", duration_rounds=2)
    expired = tick_conditions(c)
    assert len(expired) == 0
    # One round left — tick again
    expired = tick_conditions(c)
    assert len(expired) == 1
    assert expired[0]["name"] == "Poisoned"


def test_permanent_condition_not_ticked():
    c = _make_char()
    apply_condition(c, "Charmed")  # no duration
    expired = tick_conditions(c)
    assert len(expired) == 0
    # Still present
    names = [(cond["name"] if isinstance(cond, dict) else cond) for cond in c.conditions]
    assert "Charmed" in names


# ── concentration break ───────────────────────────────────────────────

def test_stunned_breaks_concentration():
    c = _make_char(concentration_spell="Bless")
    result = apply_condition(c, "Stunned")
    assert result.get("concentration_broken") == "Bless" or c.concentration_spell is None


def test_unconscious_breaks_concentration():
    c = _make_char(concentration_spell="Hold Person")
    apply_condition(c, "Unconscious")
    assert c.concentration_spell is None


# ── utility ───────────────────────────────────────────────────────────

def test_has_condition_effect():
    c = _make_char()
    apply_condition(c, "Paralyzed")
    assert has_condition_effect(c, "incapacitated") is True
    assert has_condition_effect(c, "speed_zero") is True
