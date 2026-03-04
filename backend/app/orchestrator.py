"""LLM Orchestrator: manages Claude conversations with tool use for the DM."""

from __future__ import annotations

import hashlib
import json
import logging
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any

try:
    import anthropic
except ModuleNotFoundError:  # pragma: no cover - optional in local mock mode
    anthropic = None  # type: ignore[assignment]

from .config import ANTHROPIC_API_KEY, CLAUDE_MODEL, LOCAL_MOCK_MODE
from .map_engine import GameMap
from .memory import CampaignMemory
from .rules.characters import Character, create_character
from .rules.combat import CombatState
from .tools import TOOL_DEFINITIONS, ToolDispatcher

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an expert Dungeon Master running a Dungeons & Dragons 5th Edition campaign. \
You are creative, fair, and immersive. You describe scenes vividly, voice NPCs with \
distinct personalities, and keep the game exciting.

RULES:
- Always use the provided tools for dice rolls, attacks, ability checks, and damage. \
Never make up numbers.
- When combat starts, use start_combat with all participant IDs to roll initiative.
- Use the map tools to create and update the battle map. Generate maps when players \
enter new areas.
- Place PC tokens on the map when generating a new map. Use entity type "pc" for \
player characters and "enemy" for monsters.
- Track HP, conditions, and spell slots through the tools. Do not invent values.
- When generating a map, create a complete grid: every tile within the width/height \
should be defined (either wall or floor at minimum). Place walls around the borders.
- Keep narrative responses concise during combat (2-3 sentences per turn). \
Be more descriptive during exploration and roleplay.
- Address players by their character names.

CURRENT GAME STATE:
{game_state}
"""


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0

    @property
    def estimated_cost_usd(self) -> float:
        input_cost = (self.input_tokens / 1_000_000) * 3.0
        output_cost = (self.output_tokens / 1_000_000) * 15.0
        cache_read_cost = (self.cache_read_tokens / 1_000_000) * 0.30
        cache_write_cost = (self.cache_creation_tokens / 1_000_000) * 3.75
        return input_cost + output_cost + cache_read_cost + cache_write_cost


@dataclass
class Orchestrator:
    characters: dict[str, Character] = field(default_factory=dict)
    game_map: GameMap | None = None
    combat: CombatState | None = None
    conversation_history: list[dict] = field(default_factory=list)
    session_usage: TokenUsage = field(default_factory=TokenUsage)
    memory: CampaignMemory = field(default_factory=CampaignMemory)
    mock_turn_counter: int = 0
    _client: Any | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if ANTHROPIC_API_KEY and not LOCAL_MOCK_MODE and anthropic is not None:
            self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def _build_system_prompt(self) -> str:
        state_parts = []

        if self.characters:
            chars_summary = []
            for c in self.characters.values():
                chars_summary.append(
                    f"- {c.name} ({c.race} {c.char_class} L{c.level}) "
                    f"HP:{c.hp}/{c.max_hp} AC:{c.ac}"
                )
            state_parts.append("CHARACTERS:\n" + "\n".join(chars_summary))

        if self.combat and self.combat.is_active:
            current = self.combat.current_participant
            state_parts.append(
                f"COMBAT: Round {self.combat.round_number}, "
                f"Current turn: {current.character.name if current else 'unknown'}"
            )

        if self.game_map:
            state_parts.append(
                f"MAP: {self.game_map.width}x{self.game_map.height}, "
                f"{len(self.game_map.entities)} entities"
            )

        memory_block = self.memory.build_context_block()
        if memory_block:
            state_parts.append("CAMPAIGN MEMORY:\n" + memory_block)

        game_state = "\n\n".join(state_parts) if state_parts else "No game in progress yet. Ask the players about their characters and what kind of adventure they want."

        return SYSTEM_PROMPT.format(game_state=game_state)

    async def process_player_action(self, player_id: str, player_name: str, action: str) -> list[dict[str, Any]]:
        if LOCAL_MOCK_MODE:
            return self._process_mock_action(player_id=player_id, player_name=player_name, action=action)

        if anthropic is None:
            return [{"type": "error", "content": "anthropic package is not installed."}]

        if not self._client:
            return [{"type": "error", "content": "Anthropic API key not configured."}]

        self.conversation_history.append({
            "role": "user",
            "content": f"[{player_name}]: {action}",
        })

        MAX_HISTORY = 40
        if len(self.conversation_history) > MAX_HISTORY:
            self.conversation_history = self.conversation_history[-MAX_HISTORY:]

        events: list[dict[str, Any]] = []
        dispatcher = ToolDispatcher(self.characters, self.game_map, self.combat, self.memory)

        messages = list(self.conversation_history)
        max_tool_rounds = 10

        for _ in range(max_tool_rounds):
            try:
                response = self._client.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=4096,
                    system=[{"type": "text", "text": self._build_system_prompt(), "cache_control": {"type": "ephemeral"}}],
                    tools=TOOL_DEFINITIONS,
                    messages=messages,
                )
            except Exception as e:
                logger.error("Anthropic API error: %s", e)
                return [{"type": "error", "content": f"API error: {e}"}]

            if hasattr(response, "usage"):
                u = response.usage
                self.session_usage.input_tokens += getattr(u, "input_tokens", 0)
                self.session_usage.output_tokens += getattr(u, "output_tokens", 0)
                self.session_usage.cache_read_tokens += getattr(u, "cache_read_input_tokens", 0)
                self.session_usage.cache_creation_tokens += getattr(u, "cache_creation_input_tokens", 0)

            assistant_content = response.content

            has_tool_use = any(block.type == "tool_use" for block in assistant_content)

            for block in assistant_content:
                if block.type == "text" and block.text.strip():
                    events.append({"type": "narrative", "content": block.text.strip()})

            if not has_tool_use:
                self.conversation_history.append({
                    "role": "assistant",
                    "content": [_block_to_dict(b) for b in assistant_content],
                })
                break

            messages.append({
                "role": "assistant",
                "content": [_block_to_dict(b) for b in assistant_content],
            })

            tool_results = []
            for block in assistant_content:
                if block.type == "tool_use":
                    result = dispatcher.dispatch(block.name, block.input)

                    self.game_map = dispatcher.game_map
                    self.combat = dispatcher.combat
                    self.memory = dispatcher.memory

                    events.append({
                        "type": "tool_result",
                        "tool": block.name,
                        "input": block.input,
                        "result": result,
                    })

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages.append({"role": "user", "content": tool_results})
        else:
            self.conversation_history.append({
                "role": "assistant",
                "content": [_block_to_dict(b) for b in assistant_content],
            })

        self.conversation_history = messages[:1] + messages[1:]
        if len(self.conversation_history) > MAX_HISTORY:
            self.conversation_history = self.conversation_history[-MAX_HISTORY:]

        return events

    def _process_mock_action(self, player_id: str, player_name: str, action: str) -> list[dict[str, Any]]:
        self.mock_turn_counter += 1
        normalized_action = action.strip()
        lowered_action = normalized_action.lower()

        self.conversation_history.append({
            "role": "user",
            "content": f"[{player_name}]: {normalized_action}",
        })
        MAX_HISTORY = 40
        if len(self.conversation_history) > MAX_HISTORY:
            self.conversation_history = self.conversation_history[-MAX_HISTORY:]

        dispatcher = ToolDispatcher(self.characters, self.game_map, self.combat, self.memory)
        events: list[dict[str, Any]] = []

        seed_base = self._mock_seed(player_id, normalized_action, "base")
        rng = random.Random(seed_base)

        should_generate_map = (
            self.game_map is None
            or any(k in lowered_action for k in ("map", "explore", "enter", "look", "move", "travel", "north", "south", "east", "west"))
        )
        if should_generate_map and self.game_map is None:
            map_input = self._build_mock_map_input(seed_base)
            map_result = self._dispatch_tool(dispatcher, "generate_map", map_input, player_id, normalized_action)
            events.append({"type": "tool_result", "tool": "generate_map", "input": map_input, "result": map_result})

        placement_events = self._ensure_mock_entities(dispatcher, player_id, normalized_action)
        events.extend(placement_events)

        wants_combat = any(k in lowered_action for k in ("attack", "strike", "hit", "shoot", "cast", "combat", "fight", "initiative"))
        has_pcs = any(not cid.startswith("enemy_") for cid in self.characters.keys())

        if wants_combat and has_pcs and (not self.combat or not self.combat.is_active):
            enemy_id = self._ensure_mock_enemy(dispatcher, player_id, normalized_action)
            participant_ids = [cid for cid in self.characters.keys() if not cid.startswith("enemy_")]
            if enemy_id:
                participant_ids.append(enemy_id)
            start_input = {"participant_ids": participant_ids}
            start_result = self._dispatch_tool(dispatcher, "start_combat", start_input, player_id, normalized_action)
            events.append({"type": "tool_result", "tool": "start_combat", "input": start_input, "result": start_result})

        if self.combat and self.combat.is_active and wants_combat:
            attack_result: dict[str, Any] | None = None
            attacker_id = self._pick_attacker_id(player_id)
            target_id = self._pick_target_id(attacker_id)
            if attacker_id and target_id:
                attack_input = {
                    "attacker_id": attacker_id,
                    "target_id": target_id,
                    "damage_dice": "1d8",
                    "ability": "STR",
                }
                attack_result = self._dispatch_tool(dispatcher, "attack", attack_input, player_id, normalized_action)
                events.append({"type": "tool_result", "tool": "attack", "input": attack_input, "result": attack_result})

            next_result = self._dispatch_tool(dispatcher, "next_turn", {}, player_id, normalized_action)
            events.append({"type": "tool_result", "tool": "next_turn", "input": {}, "result": next_result})

            if self.combat and self.combat.is_active:
                current = self.combat.current_participant
                if current and current.character.id.startswith("enemy_"):
                    enemy_attack_result: dict[str, Any] | None = None
                    enemy_attacker_id = current.character.id
                    enemy_target_id = self._pick_target_id(enemy_attacker_id)
                    if enemy_target_id:
                        enemy_attack_input = {
                            "attacker_id": enemy_attacker_id,
                            "target_id": enemy_target_id,
                            "damage_dice": "1d6",
                            "ability": "STR",
                        }
                        enemy_attack_result = self._dispatch_tool(dispatcher, "attack", enemy_attack_input, player_id, normalized_action)
                        events.append({"type": "tool_result", "tool": "attack", "input": enemy_attack_input, "result": enemy_attack_result})

                    next_back_result = self._dispatch_tool(dispatcher, "next_turn", {}, player_id, normalized_action)
                    events.append({"type": "tool_result", "tool": "next_turn", "input": {}, "result": next_back_result})

                    if isinstance(enemy_attack_result, dict) and enemy_attack_result.get("target_hp") == 0:
                        end_result = self._dispatch_tool(dispatcher, "end_combat", {}, player_id, normalized_action)
                        events.append({"type": "tool_result", "tool": "end_combat", "input": {}, "result": end_result})

            if isinstance(attack_result, dict) and attack_result.get("target_hp") == 0:
                end_result = self._dispatch_tool(dispatcher, "end_combat", {}, player_id, normalized_action)
                events.append({"type": "tool_result", "tool": "end_combat", "input": {}, "result": end_result})

        elif any(k in lowered_action for k in ("check", "investigate", "search", "inspect", "perception")) and has_pcs:
            checker_id = self._pick_attacker_id(player_id)
            if checker_id:
                check_input = {
                    "character_id": checker_id,
                    "ability": "WIS",
                    "dc": 12,
                    "skill": "Perception",
                }
                check_result = self._dispatch_tool(dispatcher, "check_ability", check_input, player_id, normalized_action)
                events.append({"type": "tool_result", "tool": "check_ability", "input": check_input, "result": check_result})

        elif "roll" in lowered_action:
            notation_match = re.search(r"\b\d*d\d+(?:[+-]\d+)?\b", lowered_action)
            notation = notation_match.group(0) if notation_match else "1d20"
            roll_input = {"notation": notation}
            roll_result = self._dispatch_tool(dispatcher, "roll_dice", roll_input, player_id, normalized_action)
            events.append({"type": "tool_result", "tool": "roll_dice", "input": roll_input, "result": roll_result})

        narrative = self._mock_narrative(rng, player_name, normalized_action)
        events.insert(0, {"type": "narrative", "content": narrative})

        self.game_map = dispatcher.game_map
        self.combat = dispatcher.combat
        self.memory = dispatcher.memory

        self.conversation_history.append({
            "role": "assistant",
            "content": [{"type": "text", "text": narrative}],
        })
        if len(self.conversation_history) > MAX_HISTORY:
            self.conversation_history = self.conversation_history[-MAX_HISTORY:]

        return events

    def _mock_seed(self, player_id: str, action: str, label: str) -> int:
        payload = f"{self.mock_turn_counter}|{player_id}|{action}|{label}".encode("utf-8")
        digest = hashlib.sha256(payload).digest()
        return int.from_bytes(digest[:8], "big")

    def _dispatch_tool(self, dispatcher: ToolDispatcher, tool_name: str, tool_input: dict[str, Any], player_id: str, action: str) -> dict[str, Any]:
        state = random.getstate()
        random.seed(self._mock_seed(player_id, action, tool_name))
        try:
            result = dispatcher.dispatch(tool_name, tool_input)
            self.game_map = dispatcher.game_map
            self.combat = dispatcher.combat
            self.memory = dispatcher.memory
            return result
        finally:
            random.setstate(state)

    def _build_mock_map_input(self, seed: int) -> dict[str, Any]:
        environments = ["dungeon", "forest", "cave", "tavern", "city"]
        environment = environments[seed % len(environments)]
        return {
            "description": f"You step into a {environment} encounter area prepared for exploration and potential combat.",
            "environment": environment,
            "encounter_type": "exploration",
            "encounter_scale": "medium",
            "tactical_tags": ["cover", "line_of_sight"],
            "width": 20,
            "height": 15,
        }

    def _ensure_mock_entities(self, dispatcher: ToolDispatcher, player_id: str, action: str) -> list[dict[str, Any]]:
        if not self.game_map:
            return []

        events: list[dict[str, Any]] = []
        index = 0
        for cid, char in self.characters.items():
            if cid.startswith("enemy_"):
                continue
            if cid in self.game_map.entities:
                continue
            place_input = {
                "id": cid,
                "name": char.name,
                "x": 2 + index,
                "y": 2,
                "entity_type": "pc",
                "sprite": "default",
            }
            place_result = self._dispatch_tool(dispatcher, "place_entity", place_input, player_id, action)
            events.append({"type": "tool_result", "tool": "place_entity", "input": place_input, "result": place_result})
            index += 1
        return events

    def _ensure_mock_enemy(self, dispatcher: ToolDispatcher, player_id: str, action: str) -> str | None:
        enemy_id = "enemy_goblin_1"
        enemy = self.characters.get(enemy_id)
        if enemy is None:
            enemy = create_character(
                char_id=enemy_id,
                name="Goblin Raider",
                race="Halfling",
                char_class="Rogue",
                abilities={"STR": 10, "DEX": 14, "CON": 10, "INT": 8, "WIS": 10, "CHA": 8},
                level=1,
            )
            enemy.hp = 9
            enemy.max_hp = 9
            self.characters[enemy_id] = enemy

        if self.game_map and enemy_id not in self.game_map.entities:
            place_input = {
                "id": enemy_id,
                "name": enemy.name,
                "x": 12,
                "y": 8,
                "entity_type": "enemy",
                "sprite": "default",
            }
            self._dispatch_tool(dispatcher, "place_entity", place_input, player_id, action)

        return enemy_id

    def _pick_attacker_id(self, player_id: str) -> str | None:
        for cid, char in self.characters.items():
            if char.player_id == player_id:
                return cid
        for cid in self.characters:
            if not cid.startswith("enemy_"):
                return cid
        return None

    def _pick_target_id(self, attacker_id: str | None) -> str | None:
        if attacker_id is None:
            return None
        attacker_is_enemy = attacker_id.startswith("enemy_")
        for cid, char in self.characters.items():
            if cid == attacker_id:
                continue
            if attacker_is_enemy and not cid.startswith("enemy_") and char.hp > 0:
                return cid
            if not attacker_is_enemy and cid.startswith("enemy_") and char.hp > 0:
                return cid
        return None

    def _mock_narrative(self, rng: random.Random, player_name: str, action: str) -> str:
        if self.combat and self.combat.is_active:
            lines = [
                f"{player_name}, the clash tightens in the torchlight as steel rings against stone.",
                f"{player_name}, your move shifts the momentum and every foe watches your next step.",
                f"{player_name}, the battlefield narrows and the next heartbeat could decide the exchange.",
            ]
            return rng.choice(lines)

        lines = [
            f"{player_name}, your action is noted as the chamber answers with quiet echoes.",
            f"{player_name}, dust drifts through the lantern glow while the party presses onward.",
            f"{player_name}, the scene reacts subtly, revealing new details in the old stonework.",
        ]
        if action:
            return f"{rng.choice(lines)} You {action.lower()}."
        return rng.choice(lines)

    def get_full_state(self) -> dict:
        return {
            "characters": {cid: c.to_dict() for cid, c in self.characters.items()},
            "map": self.game_map.to_dict() if self.game_map else None,
            "combat": self.combat.to_dict() if self.combat else None,
            "usage": {
                "input_tokens": self.session_usage.input_tokens,
                "output_tokens": self.session_usage.output_tokens,
                "estimated_cost_usd": round(self.session_usage.estimated_cost_usd, 4),
            },
        }


def _block_to_dict(block: Any) -> dict:
    if block.type == "text":
        return {"type": "text", "text": block.text}
    elif block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    return {"type": block.type}
