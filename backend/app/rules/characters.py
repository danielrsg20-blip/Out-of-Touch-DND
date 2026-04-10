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

# 5e multiclass prerequisites (PHB p163): must meet BOTH current AND new class
MULTICLASS_PREREQUISITES: dict[str, dict[str, int]] = {
    "Barbarian":  {"STR": 13},
    "Bard":       {"CHA": 13},
    "Cleric":     {"WIS": 13},
    "Druid":      {"WIS": 13},
    "Fighter":    {"STR": 13},   # STR *or* DEX 13 — checked specially
    "Monk":       {"DEX": 13, "WIS": 13},
    "Paladin":    {"STR": 13, "CHA": 13},
    "Ranger":     {"DEX": 13, "WIS": 13},
    "Rogue":      {"DEX": 13},
    "Sorcerer":   {"CHA": 13},
    "Warlock":    {"CHA": 13},
    "Wizard":     {"INT": 13},
}

# ASI levels vary by class (most: 4,8,12,16,19; Fighter extra 6,14; Rogue extra 10)
ASI_LEVELS_BY_CLASS: dict[str, set[int]] = {
    "Barbarian":  {4, 8, 12, 16, 19},
    "Bard":       {4, 8, 12, 16, 19},
    "Cleric":     {4, 8, 12, 16, 19},
    "Druid":      {4, 8, 12, 16, 19},
    "Fighter":    {4, 6, 8, 12, 14, 16, 19},
    "Monk":       {4, 8, 12, 16, 19},
    "Paladin":    {4, 8, 12, 16, 19},
    "Ranger":     {4, 8, 12, 16, 19},
    "Rogue":      {4, 8, 10, 12, 16, 19},
    "Sorcerer":   {4, 8, 12, 16, 19},
    "Warlock":    {4, 8, 12, 16, 19},
    "Wizard":     {4, 8, 12, 16, 19},
}

SKILLS = {
    "Acrobatics": "DEX", "Animal Handling": "WIS", "Arcana": "INT",
    "Athletics": "STR", "Deception": "CHA", "History": "INT",
    "Insight": "WIS", "Intimidation": "CHA", "Investigation": "INT",
    "Medicine": "WIS", "Nature": "INT", "Perception": "WIS",
    "Performance": "CHA", "Persuasion": "CHA", "Religion": "INT",
    "Sleight of Hand": "DEX", "Stealth": "DEX", "Survival": "WIS",
}

BACKGROUNDS: dict[str, dict] = {
    "Acolyte":       {"description": "Served in a temple.",               "skill_proficiencies": ["Insight", "Religion"]},
    "Criminal":      {"description": "Life outside the law.",             "skill_proficiencies": ["Deception", "Stealth"]},
    "Folk Hero":     {"description": "Champion of the common people.",    "skill_proficiencies": ["Animal Handling", "Survival"]},
    "Guild Artisan": {"description": "Skilled tradesperson with guild ties.", "skill_proficiencies": ["Insight", "Persuasion"]},
    "Hermit":        {"description": "Secluded life of contemplation.",   "skill_proficiencies": ["Medicine", "Religion"]},
    "Noble":         {"description": "Aristocratic upbringing.",          "skill_proficiencies": ["History", "Persuasion"]},
    "Outlander":     {"description": "Grew up in the wilderness.",        "skill_proficiencies": ["Athletics", "Survival"]},
    "Sage":          {"description": "Lifelong academic pursuit.",        "skill_proficiencies": ["Arcana", "History"]},
    "Sailor":        {"description": "Life on the open sea.",             "skill_proficiencies": ["Athletics", "Perception"]},
    "Soldier":       {"description": "Military training and service.",    "skill_proficiencies": ["Athletics", "Intimidation"]},
    "Urchin":        {"description": "Grew up on city streets.",          "skill_proficiencies": ["Sleight of Hand", "Stealth"]},
}

# Class resource definitions: maps class name -> list of resources
# Each resource has: name, max_by_level (dict of level->max), resets_on ("short_rest" or "long_rest")
CLASS_RESOURCES: dict[str, list[dict]] = {
    "Barbarian": [
        {"name": "Rage", "max_by_level": {1: 2, 3: 3, 6: 4, 12: 5, 17: 6, 20: -1}, "resets_on": "long_rest"},
    ],
    "Bard": [
        {"name": "Bardic Inspiration", "max_by_level": {1: "CHA"}, "resets_on": "short_rest"},
    ],
    "Cleric": [
        {"name": "Channel Divinity", "max_by_level": {2: 1, 6: 2, 18: 3}, "resets_on": "short_rest"},
    ],
    "Druid": [
        {"name": "Wild Shape", "max_by_level": {2: 2}, "resets_on": "short_rest"},
    ],
    "Fighter": [
        {"name": "Second Wind", "max_by_level": {1: 1}, "resets_on": "short_rest"},
        {"name": "Action Surge", "max_by_level": {2: 1, 17: 2}, "resets_on": "short_rest"},
    ],
    "Monk": [
        {"name": "Ki", "max_by_level": {2: "level"}, "resets_on": "short_rest"},
    ],
    "Paladin": [
        {"name": "Lay on Hands", "max_by_level": {1: "level*5"}, "resets_on": "long_rest"},
        {"name": "Channel Divinity", "max_by_level": {3: 1}, "resets_on": "short_rest"},
    ],
    "Ranger": [],
    "Rogue": [],
    "Sorcerer": [
        {"name": "Sorcery Points", "max_by_level": {2: "level"}, "resets_on": "long_rest"},
    ],
    "Warlock": [],
    "Wizard": [
        {"name": "Arcane Recovery", "max_by_level": {1: 1}, "resets_on": "long_rest"},
    ],
}


def _resolve_resource_max(value: int | str, level: int, abilities: dict[str, int]) -> int:
    """Resolve a resource max value that could be a number, ability mod name, or formula."""
    if isinstance(value, int):
        return value
    if value == "level":
        return level
    if value == "level*5":
        return level * 5
    if value in ABILITY_NAMES:
        return max(1, modifier_for(abilities.get(value, 10)))
    return 1


def get_class_resources_for(char_class: str, level: int, abilities: dict[str, int]) -> dict[str, dict]:
    """Build class_resources dict for a character at a given class and level."""
    resources: dict[str, dict] = {}
    for res_def in CLASS_RESOURCES.get(char_class, []):
        # Find the applicable max based on level thresholds
        applicable_max = None
        for threshold_level, max_val in sorted(res_def["max_by_level"].items(), key=lambda x: int(x[0])):
            if level >= int(threshold_level):
                applicable_max = max_val
        if applicable_max is not None:
            resolved = _resolve_resource_max(applicable_max, level, abilities)
            resources[res_def["name"]] = {
                "max": resolved,
                "used": 0,
                "resets_on": res_def["resets_on"],
            }
    return resources


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
    hit_dice_used: int = 0
    concentration_spell: str | None = None
    background: str = ""
    inspiration: bool = False
    alignment: str = ""
    # Monster-specific fields
    is_monster: bool = False
    monster_type: str = ""
    monster_attacks: list[dict[str, Any]] = field(default_factory=list)
    damage_vulnerabilities: list[str] = field(default_factory=list)
    damage_immunities: list[str] = field(default_factory=list)
    challenge_rating: float = 0
    xp_value: int = 0
    monster_traits: list[str] = field(default_factory=list)
    # Subclass and class resources (Phase 1.2 / 1.3)
    subclass: str = ""
    class_resources: dict[str, dict[str, Any]] = field(default_factory=dict)
    feats: list[str] = field(default_factory=list)
    # Multiclass: maps class name → level in that class
    class_levels: dict[str, int] = field(default_factory=dict)

    @property
    def proficiency_bonus(self) -> int:
        return PROFICIENCY_BY_LEVEL.get(self.level, 2)

    @property
    def is_multiclass(self) -> bool:
        return len(self.class_levels) > 1

    def total_level(self) -> int:
        """Sum of all class levels (equals self.level)."""
        if self.class_levels:
            return sum(self.class_levels.values())
        return self.level

    def primary_class(self) -> str:
        """The class with the most levels (ties go to char_class)."""
        if not self.class_levels:
            return self.char_class
        return max(self.class_levels, key=lambda c: self.class_levels[c])

    def class_display(self) -> str:
        """Human-readable class string, e.g. 'Fighter 5 / Wizard 3'."""
        if not self.class_levels or len(self.class_levels) <= 1:
            return f"{self.char_class} {self.level}"
        return " / ".join(f"{c} {lvl}" for c, lvl in self.class_levels.items())

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
            "death_saves": dict(self.death_saves),
            "hit_dice_used": self.hit_dice_used,
            "hit_dice_available": max(0, self.level - self.hit_dice_used),
            "concentration_spell": self.concentration_spell,
            "background": self.background,
            "inspiration": self.inspiration,
            "alignment": self.alignment,
            "is_monster": self.is_monster,
            "monster_type": self.monster_type,
            "monster_attacks": self.monster_attacks,
            "damage_vulnerabilities": self.damage_vulnerabilities,
            "damage_immunities": self.damage_immunities,
            "challenge_rating": self.challenge_rating,
            "xp_value": self.xp_value,
            "monster_traits": self.monster_traits,
            "subclass": self.subclass,
            "class_resources": self.class_resources,
            "feats": self.feats,
            "class_levels": self.class_levels if self.class_levels else {self.char_class: self.level},
            "class_display": self.class_display(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Character":
        """Reconstruct a Character from a dict (e.g. campaign save)."""
        return cls(
            id=data.get("id", ""),
            name=data.get("name", "Unknown"),
            race=data.get("race", "Human"),
            char_class=data.get("class", data.get("char_class", "Fighter")),
            level=data.get("level", 1),
            abilities=data.get("abilities", {}),
            hp=data.get("hp", 0),
            max_hp=data.get("max_hp", 0),
            temp_hp=data.get("temp_hp", 0),
            ac=data.get("ac", 10),
            speed=data.get("speed", 30),
            proficiencies=data.get("proficiencies", []),
            skill_proficiencies=data.get("skill_proficiencies", []),
            inventory=data.get("inventory", []),
            spell_slots=data.get("spell_slots", {}),
            spell_slots_used=data.get("spell_slots_used", {}),
            known_spells=data.get("known_spells", []),
            prepared_spells=data.get("prepared_spells", []),
            class_features=data.get("class_features", []),
            conditions=data.get("conditions", []),
            death_saves=data.get("death_saves", {"successes": 0, "failures": 0}),
            xp=data.get("xp", 0),
            gold_gp=data.get("gold_gp", 0),
            traits=data.get("traits", []),
            rules_version=data.get("rules_version", SRD_RULES_VERSION),
            player_id=data.get("player_id"),
            sprite_id=data.get("sprite_id"),
            hit_dice_used=data.get("hit_dice_used", 0),
            concentration_spell=data.get("concentration_spell"),
            background=data.get("background", ""),
            inspiration=data.get("inspiration", False),
            alignment=data.get("alignment", ""),
            is_monster=data.get("is_monster", False),
            monster_type=data.get("monster_type", ""),
            monster_attacks=data.get("monster_attacks", []),
            damage_vulnerabilities=data.get("damage_vulnerabilities", []),
            damage_immunities=data.get("damage_immunities", []),
            challenge_rating=data.get("challenge_rating", 0),
            xp_value=data.get("xp_value", 0),
            monster_traits=data.get("monster_traits", []),
            subclass=data.get("subclass", ""),
            class_resources=data.get("class_resources", {}),
            feats=data.get("feats", []),
            class_levels=data.get("class_levels", {}),
        )


def _check_class_prereqs(character: "Character", class_name: str) -> str | None:
    """Return a failure reason if character doesn't meet prereqs for class_name, else None."""
    if class_name == "Fighter":
        if character.abilities.get("STR", 10) < 13 and character.abilities.get("DEX", 10) < 13:
            return f"Need STR 13 or DEX 13 for {class_name}"
        return None
    reqs = MULTICLASS_PREREQUISITES.get(class_name, {})
    for ability, minimum in reqs.items():
        if character.abilities.get(ability, 10) < minimum:
            return f"Need {ability} {minimum}+ for {class_name}"
    return None


def check_multiclass_eligible(character: "Character", new_class: str) -> dict:
    """Check if a character meets the prerequisites to multiclass into new_class.

    Returns {"eligible": True} or {"eligible": False, "reason": str}.
    """
    if new_class not in CLASSES:
        return {"eligible": False, "reason": f"Unknown class: {new_class}"}

    if character.level >= 20:
        return {"eligible": False, "reason": "Already at max level (20)"}

    # Must meet prerequisites of CURRENT class(es)
    for cls_name in (character.class_levels or {character.char_class: character.level}):
        reason = _check_class_prereqs(character, cls_name)
        if reason:
            return {"eligible": False, "reason": reason}

    # Must meet prerequisites of NEW class
    reason = _check_class_prereqs(character, new_class)
    if reason:
        return {"eligible": False, "reason": reason}

    return {"eligible": True}


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
    background: str = "",
    alignment: str = "",
    class_skill_choices: list[str] | None = None,
    racial_ability_choices: dict[str, int] | None = None,
    subclass: str = "",
) -> Character:
    race_data = RACES.get(race, {})
    class_data = CLASSES.get(char_class, {})

    final_abilities = dict(abilities)
    for ab, bonus in race_data.get("ability_bonuses", {}).items():
        final_abilities[ab] = final_abilities.get(ab, 10) + bonus

    # Half-Elf flexible +1/+1 to two additional ability scores
    if race == "Half-Elf" and racial_ability_choices:
        chosen = list(racial_ability_choices.items())[:2]
        for ab, _ in chosen:
            if ab in final_abilities:
                final_abilities[ab] = final_abilities.get(ab, 10) + 1

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

    if background and background in BACKGROUNDS:
        char.skill_proficiencies = list(BACKGROUNDS[background]["skill_proficiencies"])
    char.background = background
    char.alignment = alignment
    char.subclass = subclass
    char.class_levels = {char_class: level}

    # Merge class skill choices (validated against class options)
    if class_skill_choices:
        valid_class_skills = [
            s for s in class_skill_choices
            if s in SKILLS
        ]
        merged = list(dict.fromkeys(char.skill_proficiencies + valid_class_skills))
        char.skill_proficiencies = merged

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
    char.class_resources = get_class_resources_for(char.char_class, char.level, char.abilities)

    return char


def create_monster(monster_name: str, entity_id: str) -> Character:
    """Create a Character object from a monsters.json stat block."""
    from .content_repository import get_monster_stat_block

    stat_block = get_monster_stat_block(monster_name)
    if stat_block is None:
        raise ValueError(f"Unknown monster: {monster_name}")

    abilities = stat_block.get("abilities", {})
    dex_mod = modifier_for(abilities.get("DEX", 10))

    return Character(
        id=entity_id,
        name=monster_name,
        race=stat_block.get("type", "monstrosity"),
        char_class="Monster",
        level=max(1, int(stat_block.get("cr", 1))),
        abilities=abilities,
        hp=stat_block.get("hp", 1),
        max_hp=stat_block.get("hp", 1),
        ac=stat_block.get("ac", 10),
        speed=stat_block.get("speed", 30),
        traits=stat_block.get("traits", []),
        is_monster=True,
        monster_type=stat_block.get("type", ""),
        monster_attacks=stat_block.get("attacks", []),
        damage_vulnerabilities=stat_block.get("vulnerabilities", []),
        damage_immunities=stat_block.get("immunities", []),
        challenge_rating=float(stat_block.get("cr", 0)),
        xp_value=stat_block.get("xp", 0),
        monster_traits=stat_block.get("traits", []),
    )
