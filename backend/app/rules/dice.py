"""Deterministic dice-rolling engine for 5e mechanics."""

from __future__ import annotations

import random
import re
from dataclasses import dataclass


@dataclass
class DiceResult:
    notation: str
    rolls: list[int]
    modifier: int
    total: int

    def to_dict(self) -> dict:
        return {
            "notation": self.notation,
            "rolls": self.rolls,
            "modifier": self.modifier,
            "total": self.total,
        }


_DICE_RE = re.compile(
    r"^(?P<count>\d+)?d(?P<sides>\d+)(?:(?P<mod_sign>[+-])(?P<mod>\d+))?$",
    re.IGNORECASE,
)


def roll(notation: str) -> DiceResult:
    """Roll dice using standard notation (e.g. '2d6+3', 'd20', '4d8-1')."""
    m = _DICE_RE.match(notation.strip())
    if not m:
        raise ValueError(f"Invalid dice notation: {notation!r}")

    count = int(m.group("count") or 1)
    sides = int(m.group("sides"))
    mod_sign = m.group("mod_sign") or "+"
    modifier = int(m.group("mod") or 0)
    if mod_sign == "-":
        modifier = -modifier

    if count < 1 or count > 100:
        raise ValueError("Dice count must be between 1 and 100")
    if sides < 2 or sides > 100:
        raise ValueError("Dice sides must be between 2 and 100")

    rolls = [random.randint(1, sides) for _ in range(count)]
    total = sum(rolls) + modifier
    return DiceResult(notation=notation.strip(), rolls=rolls, modifier=modifier, total=total)


def roll_with_advantage(sides: int = 20, modifier: int = 0) -> DiceResult:
    r1 = random.randint(1, sides)
    r2 = random.randint(1, sides)
    best = max(r1, r2)
    return DiceResult(
        notation=f"2d{sides}kh1{'+' if modifier >= 0 else ''}{modifier}",
        rolls=[r1, r2],
        modifier=modifier,
        total=best + modifier,
    )


def roll_with_disadvantage(sides: int = 20, modifier: int = 0) -> DiceResult:
    r1 = random.randint(1, sides)
    r2 = random.randint(1, sides)
    worst = min(r1, r2)
    return DiceResult(
        notation=f"2d{sides}kl1{'+' if modifier >= 0 else ''}{modifier}",
        rolls=[r1, r2],
        modifier=modifier,
        total=worst + modifier,
    )


def ability_score_roll() -> DiceResult:
    """Roll 4d6, drop lowest (standard ability score generation)."""
    rolls = [random.randint(1, 6) for _ in range(4)]
    kept = sorted(rolls, reverse=True)[:3]
    return DiceResult(
        notation="4d6kh3",
        rolls=rolls,
        modifier=0,
        total=sum(kept),
    )


def modifier_for(score: int) -> int:
    """Calculate ability modifier from an ability score."""
    return (score - 10) // 2
