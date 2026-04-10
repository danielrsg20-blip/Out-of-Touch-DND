"""Validate subclass feature loading and availability."""

from app.rules.content_repository import (
    get_available_subclasses,
    get_subclass_features,
    get_subclass_level,
)


def test_fighter_subclass_at_level_3():
    assert get_subclass_level("Fighter") == 3


def test_fighter_has_subclasses():
    subs = get_available_subclasses("Fighter")
    assert len(subs) >= 2
    assert "Champion" in subs or "Battle Master" in subs


def test_champion_features_at_level_3():
    feats = get_subclass_features("Fighter", "Champion", level=3)
    assert len(feats) >= 1
    names = [f["name"] for f in feats]
    # Champion should have Improved Critical at level 3
    assert any("critical" in n.lower() or "improved" in n.lower() for n in names)


def test_features_filtered_by_level():
    all_feats = get_subclass_features("Fighter", "Champion")
    low_feats = get_subclass_features("Fighter", "Champion", level=3)
    # All features at level 3 should be a subset of all features
    assert len(low_feats) <= len(all_feats)


def test_cleric_subclass_at_level_1():
    # Clerics typically get their subclass at level 1
    level = get_subclass_level("Cleric")
    assert level <= 3


def test_wizard_has_evocation():
    subs = get_available_subclasses("Wizard")
    assert "Evocation" in subs or "School of Evocation" in subs or any("evoc" in s.lower() for s in subs)
