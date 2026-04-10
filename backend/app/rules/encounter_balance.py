"""Encounter balancing: XP thresholds, difficulty calculation, monster suggestions."""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# XP thresholds per character level (DMG 2024)
# ---------------------------------------------------------------------------

XP_THRESHOLDS: dict[int, dict[str, int]] = {
    1:  {"easy": 25,  "medium": 50,   "hard": 75,   "deadly": 100},
    2:  {"easy": 50,  "medium": 100,  "hard": 150,  "deadly": 200},
    3:  {"easy": 75,  "medium": 150,  "hard": 225,  "deadly": 400},
    4:  {"easy": 125, "medium": 250,  "hard": 375,  "deadly": 500},
    5:  {"easy": 250, "medium": 500,  "hard": 750,  "deadly": 1100},
    6:  {"easy": 300, "medium": 600,  "hard": 900,  "deadly": 1400},
    7:  {"easy": 350, "medium": 750,  "hard": 1100, "deadly": 1700},
    8:  {"easy": 450, "medium": 900,  "hard": 1400, "deadly": 2100},
    9:  {"easy": 550, "medium": 1100, "hard": 1600, "deadly": 2400},
    10: {"easy": 600, "medium": 1200, "hard": 1900, "deadly": 2800},
    11: {"easy": 800, "medium": 1600, "hard": 2400, "deadly": 3600},
    12: {"easy": 1000, "medium": 2000, "hard": 3000, "deadly": 4500},
    13: {"easy": 1100, "medium": 2200, "hard": 3400, "deadly": 5100},
    14: {"easy": 1250, "medium": 2500, "hard": 3800, "deadly": 5700},
    15: {"easy": 1400, "medium": 2800, "hard": 4300, "deadly": 6400},
    16: {"easy": 1600, "medium": 3200, "hard": 4800, "deadly": 7200},
    17: {"easy": 2000, "medium": 3900, "hard": 5900, "deadly": 8800},
    18: {"easy": 2100, "medium": 4200, "hard": 6300, "deadly": 9500},
    19: {"easy": 2400, "medium": 4900, "hard": 7300, "deadly": 10900},
    20: {"easy": 2800, "medium": 5700, "hard": 8500, "deadly": 12700},
}

# CR to XP mapping
CR_XP: dict[float, int] = {
    0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
    1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
    6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
    11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
    16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
}

# Encounter multiplier based on number of monsters
MULTIPLIER_TABLE: list[tuple[int, float]] = [
    (1, 1.0),
    (2, 1.5),
    (3, 2.0),   # 3-6
    (7, 2.5),   # 7-10
    (11, 3.0),  # 11-14
    (15, 4.0),  # 15+
]


def _get_multiplier(monster_count: int) -> float:
    """Get the encounter multiplier based on number of monsters."""
    mult = 1.0
    for threshold, m in MULTIPLIER_TABLE:
        if monster_count >= threshold:
            mult = m
    return mult


def calculate_encounter_difficulty(
    party_levels: list[int],
    monster_crs: list[float],
) -> dict:
    """
    Calculate encounter difficulty for a party vs a group of monsters.
    Returns difficulty rating and XP budget analysis.
    """
    # Party thresholds
    thresholds: dict[str, int] = {"easy": 0, "medium": 0, "hard": 0, "deadly": 0}
    for level in party_levels:
        level_thresholds = XP_THRESHOLDS.get(min(level, 20), XP_THRESHOLDS[1])
        for diff in thresholds:
            thresholds[diff] += level_thresholds[diff]

    # Monster XP with multiplier
    raw_xp = sum(CR_XP.get(cr, 10) for cr in monster_crs)
    multiplier = _get_multiplier(len(monster_crs))
    adjusted_xp = int(raw_xp * multiplier)

    # Determine difficulty
    if adjusted_xp >= thresholds["deadly"]:
        difficulty = "deadly"
    elif adjusted_xp >= thresholds["hard"]:
        difficulty = "hard"
    elif adjusted_xp >= thresholds["medium"]:
        difficulty = "medium"
    elif adjusted_xp >= thresholds["easy"]:
        difficulty = "easy"
    else:
        difficulty = "trivial"

    return {
        "difficulty": difficulty,
        "adjusted_xp": adjusted_xp,
        "raw_xp": raw_xp,
        "multiplier": multiplier,
        "monster_count": len(monster_crs),
        "party_size": len(party_levels),
        "thresholds": thresholds,
    }


def suggest_encounter(
    party_levels: list[int],
    difficulty: str = "medium",
    terrain: str | None = None,
) -> dict:
    """
    Suggest a balanced encounter roster from the monster catalog.
    Returns suggested monsters with counts.
    """
    from .content_repository import list_monster_names, get_monster_stat_block
    from .exploration import ENCOUNTER_TABLES

    # Target XP budget
    target_threshold: dict[str, int] = {"easy": 0, "medium": 0, "hard": 0, "deadly": 0}
    for level in party_levels:
        level_thresholds = XP_THRESHOLDS.get(min(level, 20), XP_THRESHOLDS[1])
        for diff in target_threshold:
            target_threshold[diff] += level_thresholds[diff]

    target_xp = target_threshold.get(difficulty, target_threshold["medium"])

    # If terrain provided, prefer terrain-appropriate monsters
    preferred_monsters: list[str] = []
    if terrain and terrain in ENCOUNTER_TABLES:
        avg_level = sum(party_levels) // max(1, len(party_levels))
        for tier in ENCOUNTER_TABLES[terrain]:
            if tier["cr_range"][0] <= avg_level:
                preferred_monsters.extend(tier["monsters"])

    # Gather candidate monsters from catalog
    all_names = list_monster_names()
    candidates: list[dict] = []
    for name in all_names:
        stats = get_monster_stat_block(name)
        if stats:
            cr = stats.get("challenge_rating", 0)
            xp = CR_XP.get(cr, 10)
            candidates.append({"name": name, "cr": cr, "xp": xp})

    # Sort preferred first, then by CR ascending
    preferred_set = set(preferred_monsters)
    candidates.sort(key=lambda c: (0 if c["name"] in preferred_set else 1, c["cr"]))

    # Build roster that fits the XP budget
    roster: list[dict] = []
    remaining_xp = target_xp

    for candidate in candidates:
        if remaining_xp <= 0:
            break
        xp = candidate["xp"]
        if xp > remaining_xp:
            continue
        # How many can we fit?
        count = min(remaining_xp // max(1, xp), 4)
        if count < 1:
            continue
        # Check multiplier doesn't overshoot
        total_count = sum(r["count"] for r in roster) + count
        multiplier = _get_multiplier(total_count)
        total_adjusted = sum(r["xp"] * r["count"] for r in roster) + (xp * count)
        if total_adjusted * multiplier > target_xp * 1.3:
            count = 1
        roster.append({"name": candidate["name"], "cr": candidate["cr"], "xp": xp, "count": count})
        remaining_xp -= xp * count
        if len(roster) >= 3:
            break

    total_crs = []
    for r in roster:
        total_crs.extend([r["cr"]] * r["count"])
    assessment = calculate_encounter_difficulty(party_levels, total_crs)

    return {
        "target_difficulty": difficulty,
        "roster": roster,
        "assessment": assessment,
        "terrain": terrain,
    }
