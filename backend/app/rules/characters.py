"""Character data structures and 5e stat calculations."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..config import SRD_RULES_VERSION
from .dice import modifier_for

ABILITY_NAMES = ("STR", "DEX", "CON", "INT", "WIS", "CHA")

RACES = {
    "Human": {"ability_bonuses": {a: 1 for a in ABILITY_NAMES}, "speed": 30, "size": "Medium"},
    "Elf": {"ability_bonuses": {"DEX": 2}, "speed": 30, "size": "Medium", "traits": ["Darkvision", "Fey Ancestry"]},
    "Dwarf": {"ability_bonuses": {"CON": 2}, "speed": 25, "size": "Medium", "traits": ["Darkvision", "Dwarven Resilience"]},
    "Halfling": {"ability_bonuses": {"DEX": 2}, "speed": 25, "size": "Small", "traits": ["Lucky", "Brave"]},
    "Dragonborn": {"ability_bonuses": {"STR": 2, "CHA": 1}, "speed": 30, "size": "Medium", "traits": ["Breath Weapon"]},
    "Gnome": {"ability_bonuses": {"INT": 2}, "speed": 25, "size": "Small", "traits": ["Darkvision", "Gnome Cunning"]},
    "Half-Elf": {"ability_bonuses": {"CHA": 2}, "speed": 30, "size": "Medium", "traits": ["Darkvision", "Fey Ancestry"]},
    "Half-Orc": {"ability_bonuses": {"STR": 2, "CON": 1}, "speed": 30, "size": "Medium", "traits": ["Darkvision", "Relentless Endurance"]},
    "Tiefling": {"ability_bonuses": {"CHA": 2, "INT": 1}, "speed": 30, "size": "Medium", "traits": ["Darkvision", "Hellish Resistance"]},
}

CLASSES = {
    "Barbarian": {"hit_die": 12, "primary_ability": "STR", "saving_throws": ["STR", "CON"], "armor_proficiencies": ["light", "medium", "shields"], "weapon_proficiencies": ["simple", "martial"]},
    "Bard": {"hit_die": 8, "primary_ability": "CHA", "saving_throws": ["DEX", "CHA"], "armor_proficiencies": ["light"], "weapon_proficiencies": ["simple", "hand crossbows", "longswords", "rapiers", "shortswords"], "spellcaster": True},
    "Cleric": {"hit_die": 8, "primary_ability": "WIS", "saving_throws": ["WIS", "CHA"], "armor_proficiencies": ["light", "medium", "shields"], "weapon_proficiencies": ["simple"], "spellcaster": True},
    "Druid": {"hit_die": 8, "primary_ability": "WIS", "saving_throws": ["INT", "WIS"], "armor_proficiencies": ["light", "medium", "shields"], "weapon_proficiencies": ["clubs", "daggers", "darts", "javelins", "maces", "quarterstaffs", "scimitars", "sickles", "slings", "spears"], "spellcaster": True},
    "Fighter": {"hit_die": 10, "primary_ability": "STR", "saving_throws": ["STR", "CON"], "armor_proficiencies": ["light", "medium", "heavy", "shields"], "weapon_proficiencies": ["simple", "martial"]},
    "Monk": {"hit_die": 8, "primary_ability": "DEX", "saving_throws": ["STR", "DEX"], "armor_proficiencies": [], "weapon_proficiencies": ["simple", "shortswords"]},
    "Paladin": {"hit_die": 10, "primary_ability": "STR", "saving_throws": ["WIS", "CHA"], "armor_proficiencies": ["light", "medium", "heavy", "shields"], "weapon_proficiencies": ["simple", "martial"], "spellcaster": True},
    "Ranger": {"hit_die": 10, "primary_ability": "DEX", "saving_throws": ["STR", "DEX"], "armor_proficiencies": ["light", "medium", "shields"], "weapon_proficiencies": ["simple", "martial"], "spellcaster": True},
    "Rogue": {"hit_die": 8, "primary_ability": "DEX", "saving_throws": ["DEX", "INT"], "armor_proficiencies": ["light"], "weapon_proficiencies": ["simple", "hand crossbows", "longswords", "rapiers", "shortswords"]},
    "Sorcerer": {"hit_die": 6, "primary_ability": "CHA", "saving_throws": ["CON", "CHA"], "armor_proficiencies": [], "weapon_proficiencies": ["daggers", "darts", "slings", "quarterstaffs", "light crossbows"], "spellcaster": True},
    "Warlock": {"hit_die": 8, "primary_ability": "CHA", "saving_throws": ["WIS", "CHA"], "armor_proficiencies": ["light"], "weapon_proficiencies": ["simple"], "spellcaster": True},
    "Wizard": {"hit_die": 6, "primary_ability": "INT", "saving_throws": ["INT", "WIS"], "armor_proficiencies": [], "weapon_proficiencies": ["daggers", "darts", "slings", "quarterstaffs", "light crossbows"], "spellcaster": True},
}

PROFICIENCY_BY_LEVEL = {
    1: 2, 2: 2, 3: 2, 4: 2,
    5: 3, 6: 3, 7: 3, 8: 3,
    9: 4, 10: 4, 11: 4, 12: 4,
    13: 5, 14: 5, 15: 5, 16: 5,
    17: 6, 18: 6, 19: 6, 20: 6,
}

SKILLS = {
    "Acrobatics": "DEX", "Animal Handling": "WIS", "Arcana": "INT",
    "Athletics": "STR", "Deception": "CHA", "History": "INT",
    "Insight": "WIS", "Intimidation": "CHA", "Investigation": "INT",
    "Medicine": "WIS", "Nature": "INT", "Perception": "WIS",
    "Performance": "CHA", "Persuasion": "CHA", "Religion": "INT",
    "Sleight of Hand": "DEX", "Stealth": "DEX", "Survival": "WIS",
}


@dataclass
class Character:
    id: str
    name: str
    race: str
    char_class: str
    level: int = 1
    abilities: dict[str, int] = field(default_factory=dict)
    hp: int = 0
    max_hp: int = 0
    temp_hp: int = 0
    ac: int = 10
    speed: int = 30
    proficiencies: list[str] = field(default_factory=list)
    skill_proficiencies: list[str] = field(default_factory=list)
    inventory: list[dict[str, Any]] = field(default_factory=list)
    spell_slots: dict[int, int] = field(default_factory=dict)
    spell_slots_used: dict[int, int] = field(default_factory=dict)
    known_spells: list[str] = field(default_factory=list)
    prepared_spells: list[str] = field(default_factory=list)
    class_features: list[dict[str, Any]] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)
    death_saves: dict[str, int] = field(default_factory=lambda: {"successes": 0, "failures": 0})
    xp: int = 0
    gold_gp: int = 0
    traits: list[str] = field(default_factory=list)
    rules_version: str = SRD_RULES_VERSION
    player_id: str | None = None
    sprite_id: str | None = None

    @property
    def proficiency_bonus(self) -> int:
        return PROFICIENCY_BY_LEVEL.get(self.level, 2)

    def ability_modifier(self, ability: str) -> int:
        return modifier_for(self.abilities.get(ability, 10))

    def skill_modifier(self, skill: str) -> int:
        ability = SKILLS.get(skill, "STR")
        mod = self.ability_modifier(ability)
        if skill in self.skill_proficiencies:
            mod += self.proficiency_bonus
        return mod

    def is_alive(self) -> bool:
        return self.hp > 0 or self.death_saves["failures"] < 3

    def take_damage(self, amount: int) -> dict:
        absorbed_by_temp = min(self.temp_hp, amount)
        self.temp_hp -= absorbed_by_temp
        remaining = amount - absorbed_by_temp
        self.hp = max(0, self.hp - remaining)
        result = {
            "damage_taken": amount,
            "temp_hp_absorbed": absorbed_by_temp,
            "hp_damage": remaining,
            "current_hp": self.hp,
            "unconscious": self.hp == 0,
        }
        return result

    def heal(self, amount: int) -> dict:
        old_hp = self.hp
        self.hp = min(self.max_hp, self.hp + amount)
        if old_hp == 0 and self.hp > 0:
            self.death_saves = {"successes": 0, "failures": 0}
        return {"healed": self.hp - old_hp, "current_hp": self.hp}

    def to_dict(self) -> dict:
        from .spells import get_spellcasting_mode, get_class_features_for_level

        if not self.class_features:
            self.class_features = get_class_features_for_level(self.char_class, self.level)

        return {
            "id": self.id,
            "name": self.name,
            "race": self.race,
            "class": self.char_class,
            "level": self.level,
            "abilities": self.abilities,
            "modifiers": {a: self.ability_modifier(a) for a in ABILITY_NAMES},
            "hp": self.hp,
            "max_hp": self.max_hp,
            "temp_hp": self.temp_hp,
            "ac": self.ac,
            "speed": self.speed,
            "proficiency_bonus": self.proficiency_bonus,
            "skill_proficiencies": self.skill_proficiencies,
            "conditions": self.conditions,
            "inventory": self.inventory,
            "spell_slots": self.spell_slots,
            "spell_slots_used": self.spell_slots_used,
            "known_spells": self.known_spells,
            "prepared_spells": self.prepared_spells,
            "class_features": self.class_features,
            "traits": self.traits,
            "xp": self.xp,
            "gold_gp": self.gold_gp,
            "is_alive": self.is_alive(),
            "rules_version": self.rules_version,
            "spellcasting_mode": get_spellcasting_mode(self.char_class),
            "sprite_id": self.sprite_id,
        }


def create_character(
    char_id: str,
    name: str,
    race: str,
    char_class: str,
    abilities: dict[str, int],
    level: int = 1,
    player_id: str | None = None,
    known_spells: list[str] | None = None,
    prepared_spells: list[str] | None = None,
    sprite_id: str | None = None,
) -> Character:
    race_data = RACES.get(race, {})
    class_data = CLASSES.get(char_class, {})

    final_abilities = dict(abilities)
    for ab, bonus in race_data.get("ability_bonuses", {}).items():
        final_abilities[ab] = final_abilities.get(ab, 10) + bonus

    hit_die = class_data.get("hit_die", 8)
    con_mod = modifier_for(final_abilities.get("CON", 10))
    max_hp = hit_die + con_mod
    for _ in range(1, level):
        max_hp += max(1, (hit_die // 2 + 1) + con_mod)

    speed = race_data.get("speed", 30)
    traits = list(race_data.get("traits", []))

    dex_mod = modifier_for(final_abilities.get("DEX", 10))
    ac = 10 + dex_mod

    char = Character(
        id=char_id,
        name=name,
        race=race,
        char_class=char_class,
        level=level,
        abilities=final_abilities,
        hp=max_hp,
        max_hp=max_hp,
        ac=ac,
        speed=speed,
        traits=traits,
        player_id=player_id,
        sprite_id=sprite_id,
    )

    from .items import get_starting_inventory, calculate_ac_from_inventory, STARTING_GOLD
    from .spells import (
        get_class_features_for_level,
        get_spellcasting_mode,
        get_selectable_spells_for_character,
        initialize_spell_slots,
        validate_spell_selections,
    )
    initialize_spell_slots(char)

    all_selectable_spells = [s["name"] for s in get_selectable_spells_for_character(char, char.rules_version)]
    mode = get_spellcasting_mode(char.char_class)

    validation = validate_spell_selections(
        char,
        known_spells=known_spells,
        prepared_spells=prepared_spells,
        rules_version=char.rules_version,
    )
    if not validation.get("valid", False):
        raise ValueError(str(validation.get("error", "Invalid spell selection")))

    if mode == "known":
        char.known_spells = list(validation.get("known_spells", []))
        char.prepared_spells = []
    elif mode == "prepared":
        char.known_spells = list(all_selectable_spells)
        char.prepared_spells = list(validation.get("prepared_spells", []))
    else:
        char.known_spells = []
        char.prepared_spells = []

    char.class_features = get_class_features_for_level(char.char_class, char.level)
    char.inventory = get_starting_inventory(char_class)
    char.ac = calculate_ac_from_inventory(char.inventory, dex_mod)
    char.gold_gp = STARTING_GOLD.get(char_class, 25)

    return char
