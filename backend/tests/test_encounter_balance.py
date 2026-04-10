"""Validate encounter difficulty calculator."""

from app.rules.encounter_balance import calculate_encounter_difficulty


def test_four_goblins_vs_level_3_party():
    """4 × level-3 party vs 4 goblins (CR 1/4 each) should be easy–medium."""
    result = calculate_encounter_difficulty(
        party_levels=[3, 3, 3, 3],
        monster_crs=[0.25, 0.25, 0.25, 0.25],
    )
    assert result["difficulty"] in ("easy", "medium")
    assert result["party_size"] == 4
    assert result["monster_count"] == 4


def test_single_goblin_is_trivial():
    """4 × level-5 party vs 1 goblin should be trivial or easy."""
    result = calculate_encounter_difficulty(
        party_levels=[5, 5, 5, 5],
        monster_crs=[0.25],
    )
    assert result["difficulty"] in ("trivial", "easy")


def test_many_high_cr_is_deadly():
    """4 × level-3 party vs 4 CR 5 creatures should be deadly."""
    result = calculate_encounter_difficulty(
        party_levels=[3, 3, 3, 3],
        monster_crs=[5, 5, 5, 5],
    )
    assert result["difficulty"] == "deadly"


def test_result_has_expected_keys():
    result = calculate_encounter_difficulty(
        party_levels=[3, 3],
        monster_crs=[1],
    )
    assert "difficulty" in result
    assert "adjusted_xp" in result
    assert "thresholds" in result
    assert "easy" in result["thresholds"]
    assert "deadly" in result["thresholds"]


def test_multiplier_scales_with_monster_count():
    """More monsters should increase the effective XP multiplier."""
    r1 = calculate_encounter_difficulty([5, 5, 5, 5], [1])
    r2 = calculate_encounter_difficulty([5, 5, 5, 5], [1, 1, 1, 1])
    assert r2["multiplier"] > r1["multiplier"]
    assert r2["adjusted_xp"] > r2["raw_xp"]
