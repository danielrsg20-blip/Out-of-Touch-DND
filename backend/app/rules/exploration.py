"""Travel & exploration rules: pace, random encounters, weather, foraging."""

from __future__ import annotations

import random
from typing import Any

# ---------------------------------------------------------------------------
# Travel pace
# ---------------------------------------------------------------------------

TRAVEL_PACES = {
    "fast":   {"miles_per_hour": 4, "miles_per_day": 30, "stealth_penalty": True,  "perception_penalty": -5},
    "normal": {"miles_per_hour": 3, "miles_per_day": 24, "stealth_penalty": False, "perception_penalty": 0},
    "slow":   {"miles_per_hour": 2, "miles_per_day": 18, "stealth_penalty": False, "perception_penalty": 0, "stealth_allowed": True},
}

TERRAIN_MODIFIERS: dict[str, float] = {
    "road":       1.0,
    "plains":     1.0,
    "forest":     0.5,
    "hills":      0.5,
    "mountains":  0.5,
    "swamp":      0.5,
    "desert":     0.5,
    "arctic":     0.5,
    "coast":      1.0,
    "jungle":     0.33,
    "underdark":  0.5,
}

NAVIGATION_DC: dict[str, int] = {
    "road":       5,
    "plains":     10,
    "forest":     15,
    "hills":      10,
    "mountains":  15,
    "swamp":      15,
    "desert":     15,
    "arctic":     15,
    "coast":      10,
    "jungle":     15,
    "underdark":  20,
}


def calculate_travel(pace: str, terrain: str, hours: int = 8) -> dict:
    """Calculate distance traveled given pace, terrain, and hours of travel."""
    pace_data = TRAVEL_PACES.get(pace, TRAVEL_PACES["normal"])
    modifier = TERRAIN_MODIFIERS.get(terrain, 1.0)
    miles = pace_data["miles_per_hour"] * hours * modifier
    return {
        "pace": pace,
        "terrain": terrain,
        "hours": hours,
        "miles_traveled": round(miles, 1),
        "nav_dc": NAVIGATION_DC.get(terrain, 10),
        "stealth_penalty": pace_data.get("stealth_penalty", False),
        "perception_penalty": pace_data.get("perception_penalty", 0),
    }


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------

WEATHER_TABLE: dict[str, list[tuple[str, int]]] = {
    "temperate": [("clear", 40), ("cloudy", 25), ("rain", 20), ("fog", 10), ("storm", 5)],
    "tropical":  [("clear", 25), ("humid", 25), ("rain", 25), ("storm", 15), ("fog", 10)],
    "arctic":    [("clear", 20), ("cloudy", 20), ("snow", 30), ("blizzard", 15), ("fog", 15)],
    "desert":    [("clear", 50), ("hot", 25), ("sandstorm", 15), ("cloudy", 10)],
    "coastal":   [("clear", 30), ("cloudy", 20), ("rain", 25), ("fog", 15), ("storm", 10)],
    "mountain":  [("clear", 25), ("cloudy", 20), ("rain", 15), ("snow", 20), ("storm", 10), ("fog", 10)],
    "underground": [("still", 60), ("damp", 25), ("flooded", 10), ("spore_cloud", 5)],
}


def roll_weather(climate: str = "temperate") -> str:
    """Roll a random weather condition for the given climate."""
    table = WEATHER_TABLE.get(climate, WEATHER_TABLE["temperate"])
    roll = random.randint(1, 100)
    running = 0
    for condition, weight in table:
        running += weight
        if roll <= running:
            return condition
    return table[0][0]


WEATHER_EFFECTS: dict[str, dict] = {
    "clear":       {"visibility": "normal", "travel_modifier": 1.0},
    "cloudy":      {"visibility": "normal", "travel_modifier": 1.0},
    "rain":        {"visibility": "lightly_obscured", "travel_modifier": 0.9, "disadvantage": ["Perception (sight)"]},
    "fog":         {"visibility": "heavily_obscured", "travel_modifier": 0.75, "disadvantage": ["Perception (sight)"], "max_visibility_ft": 60},
    "storm":       {"visibility": "heavily_obscured", "travel_modifier": 0.5, "disadvantage": ["Perception (hearing)", "Perception (sight)"]},
    "snow":        {"visibility": "lightly_obscured", "travel_modifier": 0.75, "difficult_terrain": True},
    "blizzard":    {"visibility": "heavily_obscured", "travel_modifier": 0.33, "difficult_terrain": True, "cold_exposure": True},
    "hot":         {"visibility": "normal", "travel_modifier": 0.9, "exhaustion_risk": True},
    "humid":       {"visibility": "normal", "travel_modifier": 0.9, "exhaustion_risk": True},
    "sandstorm":   {"visibility": "heavily_obscured", "travel_modifier": 0.25, "disadvantage": ["Perception (sight)"]},
    "still":       {"visibility": "normal", "travel_modifier": 1.0},
    "damp":        {"visibility": "normal", "travel_modifier": 1.0},
    "flooded":     {"visibility": "normal", "travel_modifier": 0.5, "difficult_terrain": True},
    "spore_cloud": {"visibility": "lightly_obscured", "travel_modifier": 0.75, "poison_risk": True},
}


# ---------------------------------------------------------------------------
# Random encounters
# ---------------------------------------------------------------------------

ENCOUNTER_TABLES: dict[str, list[dict]] = {
    "forest": [
        {"cr_range": [0, 1], "monsters": ["Wolf", "Giant Rat", "Stirge", "Kobold"]},
        {"cr_range": [1, 3], "monsters": ["Dire Wolf", "Owlbear", "Bugbear", "Gnoll"]},
        {"cr_range": [3, 6], "monsters": ["Werewolf", "Manticore", "Troll"]},
    ],
    "plains": [
        {"cr_range": [0, 1], "monsters": ["Wolf", "Giant Rat", "Goblin"]},
        {"cr_range": [1, 3], "monsters": ["Orc", "Ogre", "Hobgoblin"]},
        {"cr_range": [3, 6], "monsters": ["Manticore", "Wyvern"]},
    ],
    "mountains": [
        {"cr_range": [0, 1], "monsters": ["Bat", "Kobold", "Stirge"]},
        {"cr_range": [1, 3], "monsters": ["Gargoyle", "Basilisk", "Hobgoblin"]},
        {"cr_range": [3, 6], "monsters": ["Manticore", "Ettin", "Wyvern"]},
    ],
    "swamp": [
        {"cr_range": [0, 1], "monsters": ["Giant Rat", "Stirge", "Skeleton"]},
        {"cr_range": [1, 3], "monsters": ["Ghoul", "Ghast", "Orc", "Worg"]},
        {"cr_range": [3, 6], "monsters": ["Troll", "Basilisk", "Wraith"]},
    ],
    "desert": [
        {"cr_range": [0, 1], "monsters": ["Scorpion", "Kobold", "Skeleton"]},
        {"cr_range": [1, 3], "monsters": ["Gnoll", "Ogre", "Gargoyle"]},
        {"cr_range": [3, 6], "monsters": ["Medusa", "Manticore"]},
    ],
    "underdark": [
        {"cr_range": [0, 1], "monsters": ["Giant Rat", "Bat", "Skeleton"]},
        {"cr_range": [1, 3], "monsters": ["Bugbear", "Ghoul", "Shadow"]},
        {"cr_range": [3, 6], "monsters": ["Basilisk", "Wraith", "Black Pudding"]},
    ],
    "arctic": [
        {"cr_range": [0, 1], "monsters": ["Wolf", "Bat"]},
        {"cr_range": [1, 3], "monsters": ["Dire Wolf", "Orc", "Worg"]},
        {"cr_range": [3, 6], "monsters": ["Troll", "Owlbear"]},
    ],
    "coast": [
        {"cr_range": [0, 1], "monsters": ["Giant Rat", "Goblin"]},
        {"cr_range": [1, 3], "monsters": ["Ghoul", "Hobgoblin", "Orc"]},
        {"cr_range": [3, 6], "monsters": ["Manticore", "Wyvern"]},
    ],
}


def check_random_encounter(terrain: str, party_level: int, encounter_chance: int = 18) -> dict | None:
    """Roll d20; on >= encounter_chance, return a random encounter. Returns None if no encounter."""
    roll = random.randint(1, 20)
    if roll < encounter_chance:
        return None

    table = ENCOUNTER_TABLES.get(terrain, ENCOUNTER_TABLES.get("plains", []))
    # Find tier matching party level
    suitable = [t for t in table if t["cr_range"][0] <= party_level]
    if not suitable:
        suitable = table[:1]
    tier = suitable[-1]  # Highest suitable tier

    monster = random.choice(tier["monsters"])
    count = random.randint(1, max(1, 4 - (party_level // 3)))

    return {
        "encounter": True,
        "monster": monster,
        "count": count,
        "d20_roll": roll,
        "terrain": terrain,
    }


# ---------------------------------------------------------------------------
# Foraging
# ---------------------------------------------------------------------------

FORAGE_DC: dict[str, int] = {
    "forest":    10,
    "plains":    10,
    "coast":     10,
    "swamp":     15,
    "mountains": 15,
    "hills":     10,
    "desert":    20,
    "arctic":    15,
    "jungle":    10,
    "underdark":  20,
    "road":      15,
}


def forage_dc(terrain: str) -> int:
    """Return the DC for foraging in the given terrain."""
    return FORAGE_DC.get(terrain, 15)
