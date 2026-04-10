"""Validate feat application and ASI logic."""

from app.rules.characters import create_character
from app.rules.feats import apply_asi, apply_feat, get_available_feats


def _make_fighter():
    return create_character(
        char_id="test-1",
        name="Tester",
        race="Human",
        char_class="Fighter",
        abilities={"STR": 16, "DEX": 14, "CON": 14, "INT": 10, "WIS": 12, "CHA": 10},
        level=4,
    )


# ── Tough feat ────────────────────────────────────────────────────────

def test_tough_adds_hp():
    char = _make_fighter()
    old_max = char.max_hp
    result = apply_feat(char, "Tough")
    assert "Tough" in char.feats
    # Tough grants 2 × level HP
    assert char.max_hp == old_max + 2 * char.level
    assert "HP" in result.get("message", "")


# ── Mobile feat ───────────────────────────────────────────────────────

def test_mobile_adds_speed():
    char = _make_fighter()
    old_speed = char.speed
    apply_feat(char, "Mobile")
    assert char.speed == old_speed + 10


# ── Duplicate prevention ─────────────────────────────────────────────

def test_cannot_take_same_feat_twice():
    char = _make_fighter()
    apply_feat(char, "Alert")
    result = apply_feat(char, "Alert")
    assert "error" in result


# ── Prerequisite checks ──────────────────────────────────────────────

def test_defensive_duelist_requires_dex_13():
    char = create_character(
        char_id="low-dex",
        name="Weak",
        race="Human",
        char_class="Fighter",
        abilities={"STR": 16, "DEX": 8, "CON": 14, "INT": 10, "WIS": 10, "CHA": 10},
        level=4,
    )
    result = apply_feat(char, "Defensive Duelist")
    assert "error" in result


def test_available_feats_excludes_taken():
    char = _make_fighter()
    apply_feat(char, "Alert")
    available = get_available_feats(char)
    names = [f["name"] for f in available]
    assert "Alert" not in names


# ── ASI ───────────────────────────────────────────────────────────────

def test_asi_plus_two_strength():
    char = _make_fighter()
    old_str = char.abilities["STR"]
    result = apply_asi(char, {"STR": 2})
    assert char.abilities["STR"] == min(20, old_str + 2)
    assert "error" not in result


def test_asi_plus_one_each():
    char = _make_fighter()
    old_dex = char.abilities["DEX"]
    old_con = char.abilities["CON"]
    result = apply_asi(char, {"DEX": 1, "CON": 1})
    assert char.abilities["DEX"] == old_dex + 1
    assert char.abilities["CON"] == old_con + 1
    assert "error" not in result


def test_asi_rejects_three_points():
    char = _make_fighter()
    result = apply_asi(char, {"STR": 2, "DEX": 1})
    assert "error" in result


def test_asi_cap_at_20():
    char = create_character(
        char_id="cap",
        name="Maxed",
        race="Human",
        char_class="Fighter",
        abilities={"STR": 19, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
        level=4,
    )
    apply_asi(char, {"STR": 2})
    assert char.abilities["STR"] == 20  # capped, not 21
