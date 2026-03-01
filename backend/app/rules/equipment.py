"""Equipment data: weapons, armor, and common items."""

from __future__ import annotations

from typing import Any

WEAPONS: dict[str, dict[str, Any]] = {
    "Club": {"damage": "1d4", "type": "bludgeoning", "properties": ["Light"], "category": "simple", "cost": "1 sp", "weight": 2},
    "Dagger": {"damage": "1d4", "type": "piercing", "properties": ["Finesse", "Light", "Thrown (20/60)"], "category": "simple", "cost": "2 gp", "weight": 1},
    "Greatclub": {"damage": "1d8", "type": "bludgeoning", "properties": ["Two-Handed"], "category": "simple", "cost": "2 sp", "weight": 10},
    "Handaxe": {"damage": "1d6", "type": "slashing", "properties": ["Light", "Thrown (20/60)"], "category": "simple", "cost": "5 gp", "weight": 2},
    "Javelin": {"damage": "1d6", "type": "piercing", "properties": ["Thrown (30/120)"], "category": "simple", "cost": "5 sp", "weight": 2},
    "Light Hammer": {"damage": "1d4", "type": "bludgeoning", "properties": ["Light", "Thrown (20/60)"], "category": "simple", "cost": "2 gp", "weight": 2},
    "Mace": {"damage": "1d6", "type": "bludgeoning", "properties": [], "category": "simple", "cost": "5 gp", "weight": 4},
    "Quarterstaff": {"damage": "1d6", "type": "bludgeoning", "properties": ["Versatile (1d8)"], "category": "simple", "cost": "2 sp", "weight": 4},
    "Sickle": {"damage": "1d4", "type": "slashing", "properties": ["Light"], "category": "simple", "cost": "1 gp", "weight": 2},
    "Spear": {"damage": "1d6", "type": "piercing", "properties": ["Thrown (20/60)", "Versatile (1d8)"], "category": "simple", "cost": "1 gp", "weight": 3},
    "Light Crossbow": {"damage": "1d8", "type": "piercing", "properties": ["Ammunition (80/320)", "Loading", "Two-Handed"], "category": "simple", "cost": "25 gp", "weight": 5},
    "Shortbow": {"damage": "1d6", "type": "piercing", "properties": ["Ammunition (80/320)", "Two-Handed"], "category": "simple", "cost": "25 gp", "weight": 2},
    "Battleaxe": {"damage": "1d8", "type": "slashing", "properties": ["Versatile (1d10)"], "category": "martial", "cost": "10 gp", "weight": 4},
    "Flail": {"damage": "1d8", "type": "bludgeoning", "properties": [], "category": "martial", "cost": "10 gp", "weight": 2},
    "Glaive": {"damage": "1d10", "type": "slashing", "properties": ["Heavy", "Reach", "Two-Handed"], "category": "martial", "cost": "20 gp", "weight": 6},
    "Greataxe": {"damage": "1d12", "type": "slashing", "properties": ["Heavy", "Two-Handed"], "category": "martial", "cost": "30 gp", "weight": 7},
    "Greatsword": {"damage": "2d6", "type": "slashing", "properties": ["Heavy", "Two-Handed"], "category": "martial", "cost": "50 gp", "weight": 6},
    "Longsword": {"damage": "1d8", "type": "slashing", "properties": ["Versatile (1d10)"], "category": "martial", "cost": "15 gp", "weight": 3},
    "Rapier": {"damage": "1d8", "type": "piercing", "properties": ["Finesse"], "category": "martial", "cost": "25 gp", "weight": 2},
    "Scimitar": {"damage": "1d6", "type": "slashing", "properties": ["Finesse", "Light"], "category": "martial", "cost": "25 gp", "weight": 3},
    "Shortsword": {"damage": "1d6", "type": "piercing", "properties": ["Finesse", "Light"], "category": "martial", "cost": "10 gp", "weight": 2},
    "Warhammer": {"damage": "1d8", "type": "bludgeoning", "properties": ["Versatile (1d10)"], "category": "martial", "cost": "15 gp", "weight": 2},
    "Hand Crossbow": {"damage": "1d6", "type": "piercing", "properties": ["Ammunition (30/120)", "Light", "Loading"], "category": "martial", "cost": "75 gp", "weight": 3},
    "Heavy Crossbow": {"damage": "1d10", "type": "piercing", "properties": ["Ammunition (100/400)", "Heavy", "Loading", "Two-Handed"], "category": "martial", "cost": "50 gp", "weight": 18},
    "Longbow": {"damage": "1d8", "type": "piercing", "properties": ["Ammunition (150/600)", "Heavy", "Two-Handed"], "category": "martial", "cost": "50 gp", "weight": 2},
}

ARMOR: dict[str, dict[str, Any]] = {
    "Padded": {"ac": 11, "dex_mod": True, "max_dex": None, "stealth_disadvantage": True, "category": "light", "cost": "5 gp", "weight": 8},
    "Leather": {"ac": 11, "dex_mod": True, "max_dex": None, "stealth_disadvantage": False, "category": "light", "cost": "10 gp", "weight": 10},
    "Studded Leather": {"ac": 12, "dex_mod": True, "max_dex": None, "stealth_disadvantage": False, "category": "light", "cost": "45 gp", "weight": 13},
    "Hide": {"ac": 12, "dex_mod": True, "max_dex": 2, "stealth_disadvantage": False, "category": "medium", "cost": "10 gp", "weight": 12},
    "Chain Shirt": {"ac": 13, "dex_mod": True, "max_dex": 2, "stealth_disadvantage": False, "category": "medium", "cost": "50 gp", "weight": 20},
    "Scale Mail": {"ac": 14, "dex_mod": True, "max_dex": 2, "stealth_disadvantage": True, "category": "medium", "cost": "50 gp", "weight": 45},
    "Breastplate": {"ac": 14, "dex_mod": True, "max_dex": 2, "stealth_disadvantage": False, "category": "medium", "cost": "400 gp", "weight": 20},
    "Half Plate": {"ac": 15, "dex_mod": True, "max_dex": 2, "stealth_disadvantage": True, "category": "medium", "cost": "750 gp", "weight": 40},
    "Ring Mail": {"ac": 14, "dex_mod": False, "max_dex": 0, "stealth_disadvantage": True, "category": "heavy", "cost": "30 gp", "weight": 40},
    "Chain Mail": {"ac": 16, "dex_mod": False, "max_dex": 0, "stealth_disadvantage": True, "category": "heavy", "cost": "75 gp", "weight": 55, "str_req": 13},
    "Splint": {"ac": 17, "dex_mod": False, "max_dex": 0, "stealth_disadvantage": True, "category": "heavy", "cost": "200 gp", "weight": 60, "str_req": 15},
    "Plate": {"ac": 18, "dex_mod": False, "max_dex": 0, "stealth_disadvantage": True, "category": "heavy", "cost": "1500 gp", "weight": 65, "str_req": 15},
    "Shield": {"ac_bonus": 2, "category": "shield", "cost": "10 gp", "weight": 6},
}


def calculate_ac(base_armor: str | None, dex_modifier: int, has_shield: bool = False) -> int:
    if base_armor is None:
        ac = 10 + dex_modifier
    else:
        armor = ARMOR.get(base_armor, {})
        ac = armor.get("ac", 10)
        if armor.get("dex_mod"):
            max_dex = armor.get("max_dex")
            dex_bonus = dex_modifier if max_dex is None else min(dex_modifier, max_dex)
            ac += dex_bonus

    if has_shield:
        ac += 2

    return ac
