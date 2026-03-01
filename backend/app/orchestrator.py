"""LLM Orchestrator: manages Claude conversations with tool use for the DM."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import anthropic

from .config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from .map_engine import GameMap
from .memory import CampaignMemory
from .rules.characters import Character
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
    _client: anthropic.Anthropic | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if ANTHROPIC_API_KEY:
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
            except anthropic.APIError as e:
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
