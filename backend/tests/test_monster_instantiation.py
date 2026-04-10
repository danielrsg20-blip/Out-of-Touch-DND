"""Validate that create_monster produces correct Character objects from monsters.json."""

from app.rules.characters import create_monster


def test_goblin_has_correct_stats():
    goblin = create_monster("Goblin", "mob-1")
    assert goblin.id == "mob-1"
    assert goblin.is_monster is True
    assert goblin.name == "Goblin"
    assert goblin.ac == 15
    assert goblin.hp == 7
    assert goblin.max_hp == 7
    assert goblin.speed == 30
    assert goblin.abilities["DEX"] == 14
    assert goblin.abilities["STR"] == 8


def test_goblin_has_attacks():
    goblin = create_monster("Goblin", "mob-2")
    assert len(goblin.monster_attacks) > 0
    names = [a["name"] for a in goblin.monster_attacks]
    assert "Scimitar" in names or "Shortbow" in names


def test_monster_is_alive_initially():
    goblin = create_monster("Goblin", "mob-3")
    assert goblin.is_alive() is True


def test_monster_take_damage():
    goblin = create_monster("Goblin", "mob-4")
    result = goblin.take_damage(5)
    assert result["damage_taken"] == 5
    assert goblin.hp == 2


def test_monster_can_be_killed():
    goblin = create_monster("Goblin", "mob-5")
    goblin.take_damage(20)
    assert goblin.hp == 0
    # At 0 HP, creature enters death saves — 3 failures = dead
    goblin.death_saves["failures"] = 3
    assert goblin.is_alive() is False


def test_dragon_has_higher_stats():
    """A higher-CR creature should have higher stats than a goblin."""
    # Use any CR>1 creature in the catalogue
    import json
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "app" / "rules" / "data" / "monsters.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    big_name = next((n for n, v in data.items() if v.get("cr", 0) >= 5), None)
    if big_name is None:
        return  # catalogue too small — skip
    big = create_monster(big_name, "mob-big")
    goblin = create_monster("Goblin", "mob-g")
    assert big.max_hp > goblin.max_hp
