"""5e combat engine: initiative, attacks, conditions, death saves."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from .characters import Character
from .dice import DiceResult, roll


CONDITIONS = {
    "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
    "Incapacitated", "Invisible", "Paralyzed", "Petrified",
    "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
    "Exhaustion",
}


@dataclass
class CombatParticipant:
    character: Character
    initiative: int = 0
    has_action: bool = True
    has_bonus_action: bool = True
    has_reaction: bool = True
    movement_remaining: int = 0
    concentrating_on: str | None = None

    def start_turn(self) -> None:
        self.has_action = True
        self.has_bonus_action = True
        self.movement_remaining = self.character.speed

    def to_dict(self) -> dict:
        return {
            "character": self.character.to_dict(),
            "initiative": self.initiative,
            "has_action": self.has_action,
            "has_bonus_action": self.has_bonus_action,
            "has_reaction": self.has_reaction,
            "movement_remaining": self.movement_remaining,
            "concentrating_on": self.concentrating_on,
        }


@dataclass
class CombatState:
    participants: list[CombatParticipant] = field(default_factory=list)
    turn_index: int = 0
    round_number: int = 1
    is_active: bool = False

    @property
    def current_participant(self) -> CombatParticipant | None:
        if not self.participants:
            return None
        return self.participants[self.turn_index % len(self.participants)]

    def to_dict(self) -> dict:
        current = self.current_participant
        return {
            "is_active": self.is_active,
            "round": self.round_number,
            "turn_index": self.turn_index,
            "current_turn": current.character.id if current else None,
            "initiative_order": [
                {"id": p.character.id, "name": p.character.name, "initiative": p.initiative, "hp": p.character.hp, "max_hp": p.character.max_hp}
                for p in self.participants
            ],
        }


def roll_initiative(characters: list[Character]) -> CombatState:
    participants = []
    for char in characters:
        init_roll = roll("1d20")
        initiative = init_roll.total + char.ability_modifier("DEX")
        participants.append(CombatParticipant(character=char, initiative=initiative))

    participants.sort(key=lambda p: (p.initiative, p.character.ability_modifier("DEX")), reverse=True)
    if participants:
        participants[0].start_turn()

    return CombatState(participants=participants, is_active=True)


def next_turn(combat: CombatState) -> dict:
    if not combat.is_active or not combat.participants:
        return {"error": "No active combat"}

    combat.turn_index += 1
    if combat.turn_index >= len(combat.participants):
        combat.turn_index = 0
        combat.round_number += 1

    current = combat.current_participant
    current.start_turn()
    current.has_reaction = True

    return {
        "round": combat.round_number,
        "current_turn": current.character.id,
        "current_name": current.character.name,
        "message": f"Round {combat.round_number}: {current.character.name}'s turn.",
    }


def attack_roll(
    attacker: Character,
    target: Character,
    weapon_bonus: int = 0,
    damage_notation: str = "1d8",
    ability: str = "STR",
    advantage: bool = False,
    disadvantage: bool = False,
) -> dict[str, Any]:
    attack_mod = attacker.ability_modifier(ability) + attacker.proficiency_bonus + weapon_bonus

    if advantage and not disadvantage:
        r1, r2 = random.randint(1, 20), random.randint(1, 20)
        d20 = max(r1, r2)
        roll_detail = f"({r1}, {r2}) -> {d20}"
    elif disadvantage and not advantage:
        r1, r2 = random.randint(1, 20), random.randint(1, 20)
        d20 = min(r1, r2)
        roll_detail = f"({r1}, {r2}) -> {d20}"
    else:
        d20 = random.randint(1, 20)
        roll_detail = str(d20)

    is_crit = d20 == 20
    is_fumble = d20 == 1
    total_attack = d20 + attack_mod
    hits = is_crit or (not is_fumble and total_attack >= target.ac)

    result: dict[str, Any] = {
        "attacker": attacker.name,
        "target": target.name,
        "attack_roll": total_attack,
        "d20": d20,
        "roll_detail": roll_detail,
        "modifier": attack_mod,
        "target_ac": target.ac,
        "hits": hits,
        "critical": is_crit,
        "fumble": is_fumble,
    }

    if hits:
        damage_roll = roll(damage_notation)
        damage = damage_roll.total + attacker.ability_modifier(ability)
        if is_crit:
            crit_roll = roll(damage_notation)
            damage += crit_roll.total
            result["crit_damage_roll"] = crit_roll.to_dict()

        damage = max(1, damage)
        damage_result = target.take_damage(damage)
        result["damage"] = damage
        result["damage_roll"] = damage_roll.to_dict()
        result["target_hp"] = damage_result["current_hp"]
        result["target_unconscious"] = damage_result["unconscious"]
    else:
        result["damage"] = 0

    return result


def death_saving_throw(character: Character) -> dict:
    if character.hp > 0:
        return {"error": f"{character.name} is not at 0 HP"}

    d20 = random.randint(1, 20)

    if d20 == 20:
        character.hp = 1
        character.death_saves = {"successes": 0, "failures": 0}
        return {"roll": d20, "result": "nat20", "message": f"{character.name} rolls a natural 20! They regain 1 HP and are conscious!"}

    if d20 == 1:
        character.death_saves["failures"] += 2
    elif d20 >= 10:
        character.death_saves["successes"] += 1
    else:
        character.death_saves["failures"] += 1

    if character.death_saves["successes"] >= 3:
        character.death_saves = {"successes": 0, "failures": 0}
        return {"roll": d20, "result": "stabilized", "message": f"{character.name} stabilizes with {d20}!"}

    if character.death_saves["failures"] >= 3:
        return {"roll": d20, "result": "dead", "message": f"{character.name} has died. (Roll: {d20})"}

    saves = character.death_saves
    return {
        "roll": d20,
        "result": "success" if d20 >= 10 else "failure",
        "successes": saves["successes"],
        "failures": saves["failures"],
        "message": f"{character.name} rolls {d20}: {'Success' if d20 >= 10 else 'Failure'} ({saves['successes']}/3 successes, {saves['failures']}/3 failures)",
    }
