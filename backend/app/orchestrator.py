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
distinct personalities, and keep the game excited.

RULES:
- Always use the provided tools for dice rolls, attacks, ability checks, and damage. \
Never make up numbers.
- DICE ROLLING RESPONSIBILITY: Player characters (PCs) roll their own dice. \
When a PC needs to make an attack roll, ability check, or saving throw, use request_player_roll \
instead of attack, roll_dice, or check_ability. \
Monsters, NPCs, environmental hazards, traps, and any hidden or behind-the-scenes checks are \
rolled by the DM — use attack, roll_dice, check_ability, and apply_damage for those. \
After calling request_player_roll, narrate that you are awaiting the player's roll. \
When the player submits their result (e.g. "[Roll Result] Attack Roll: d20 → 14 + 5 = 19"), \
use it to resolve the action and narrate the outcome without rolling again.
- When a player mentions combat, initiative, fighting, attacking, or similar combat-related keywords, \
use start_combat with all participant IDs to roll initiative.
- When combat starts, use start_combat with all participant IDs to roll initiative.
- Use the map tools to create and update the battle map. Generate maps when players \
enter new areas.
- When generating maps, set environment plus terrain_theme to match scene tone \
and visual motifs (e.g. ruined, overgrown, ancient, volcanic, frozen, flooded, arcane).
- Place PC tokens on the map when generating a new map. Use entity type "pc" for \
player characters and "enemy" for monsters.
- Track HP, conditions, and spell slots through the tools. Do not invent values.
- When generating a map, create a complete grid: every tile within the width/height \
should be defined (either wall or floor at minimum). Place walls around the borders.
- Keep narrative responses concise during combat (2-3 sentences per turn). \
Be more descriptive during exploration and roleplay.
- Address players by their character names.
- Always honour the player's stated intent. If an action is impossible, explain why \
clearly and offer 2 concrete alternatives. Never silently redirect or railroad.
- End every narrative turn with a direct prompt for action, such as "What do you do?" \
or a specific open question that invites a response.
- CLARIFYING QUESTIONS: When a player's action is genuinely ambiguous and proceeding \
incorrectly would affect game state (e.g. "I cast a spell" without specifying which), \
ask 1-2 clarifying questions instead of guessing. Begin your ENTIRE response with \
[CLARIFY] on its own line. Do NOT call any tools in a [CLARIFY] turn.

BREVITY POLICY (HIGH PRIORITY):
Default responses must be brief and actionable. Use a two-layer structure:
  (A) Primary — always included. 1–3 short paragraphs OR 4–8 bullet lines max. \
End with a direct prompt to the players (e.g., "What do you do?").
  (B) Optional Details — only provide if explicitly requested by a player, required \
for a fair ruling, or needed to avoid confusion.
Do NOT include lore dumps, exhaustive option lists, or full rules explanations unless \
(1) a player asked for detail, (2) detail is required to make a fair ruling, or \
(3) a safety boundary requires explicit clarification.
If multiple players act in the same round, resolve each in 1–3 sentences then move on.
Combat turns: one tactical sentence + one sensory sentence. \
Only restate statuses that just changed (new conditions, HP thresholds, concentration breaks).
Hard limit: if your Primary response is growing long, stop early and ask a question \
instead. Example: "I can describe more, but first—what's your approach: stealth, talk, \
or force?"
Detail on demand: when a player requests more, respond under clearly labelled headers \
("More detail:" / "Rules note:" / "What you know:" / "If you want more:"). \
Offer a quick menu first instead of dumping everything: \
e.g., "Want: (1) room layout, (2) NPC read, (3) rules clarification, or (4) recap?"

SAFETY:
- Do not produce graphic sexual content under any circumstances.
- Do not depict real-world hate groups, slurs, or targeted harassment.
- Dramatic violence is acceptable; fade to black for extreme gore — state the outcome \
without graphic detail.
- If a player pushes against these limits, redirect narratively without lecturing.
{safety_addendum}
HOUSE RULES:
{house_rules}

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
    awaiting_clarification: bool = False
    safety_lines: list[str] = field(default_factory=list)
    tracking_flags: dict[str, bool] = field(default_factory=lambda: {
        "ammo": False, "encumbrance": False, "rations": False, "time": False,
    })
    player_activity: dict[str, float | None] = field(default_factory=dict)
    mock_turn_counter: int = 0
    mock_session_nonce: int = field(default_factory=lambda: int(time.time_ns()) ^ random.getrandbits(32))
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
                    f"HP:{c.hp}/{c.max_hp} AC:{c.ac} GP:{c.gold_gp}"
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

        if self.player_activity:
            activity_lines = []
            for pname, secs in self.player_activity.items():
                if secs is None:
                    activity_lines.append(f"- {pname}: no actions yet this session")
                elif secs > 180:
                    activity_lines.append(f"- {pname}: last acted {int(secs // 60)} min ago — consider giving them spotlight")
                else:
                    activity_lines.append(f"- {pname}: recently active")
            state_parts.append("PLAYER ACTIVITY:\n" + "\n".join(activity_lines))

        game_state = "\n\n".join(state_parts) if state_parts else "No game in progress yet. Ask the players about their characters and what kind of adventure they want."

        if self.safety_lines:
            safety_addendum = "\nAdditional table safety rules:\n" + "\n".join(f"- {s}" for s in self.safety_lines)
        else:
            safety_addendum = ""

        active_tracking = [k for k, v in self.tracking_flags.items() if v]
        if active_tracking:
            house_rules = "Track the following resources strictly: " + ", ".join(active_tracking) + ". Deduct them via inventory tools and alert players when they run low."
        else:
            house_rules = "No special resource tracking is active. Use narrative common sense for consumables."

        return SYSTEM_PROMPT.format(
            game_state=game_state,
            safety_addendum=safety_addendum,
            house_rules=house_rules,
        )

    async def process_player_action(self, player_id: str, player_name: str, action: str) -> list[dict[str, Any]]:
        if LOCAL_MOCK_MODE:
            return self._process_mock_action(player_id=player_id, player_name=player_name, action=action)

        if anthropic is None:
            return [{"type": "error", "content": "anthropic package is not installed."}]

        if not self._client:
            return [{"type": "error", "content": "Anthropic API key not configured."}]

        # Bootstrap prompt: triggered by the frontend when the DM has not yet spoken.
        is_bootstrap = action.strip() == "[SESSION_START]"
        if is_bootstrap:
            user_content = (
                "(System — session bootstrap: The session has just begun. As Dungeon Master, open with "
                "vivid atmospheric description of where the party finds themselves right now — sensory "
                "details, ambient sounds, lighting. Reintroduce any key NPCs present and any unresolved "
                "tension from last time. End with a direct question or situation that demands the "
                "adventurers decide their first move. Do not acknowledge this system note.)"
            )
        else:
            user_content = f"[{player_name}]: {action}"

        self.conversation_history.append({
            "role": "user",
            "content": user_content,
        })

        MAX_HISTORY = 40
        if len(self.conversation_history) > MAX_HISTORY:
            self.conversation_history = self.conversation_history[-MAX_HISTORY:]

        events: list[dict[str, Any]] = []
        dispatcher = ToolDispatcher(self.characters, self.game_map, self.combat, self.memory)

        # If the previous turn was a clarifying question, skip tool dispatch this turn
        # so the player's clarifying answer is processed as plain conversation first.
        was_clarifying = self.awaiting_clarification
        self.awaiting_clarification = False

        messages = list(self.conversation_history)
        max_tool_rounds = 1 if was_clarifying else 10

        for _ in range(max_tool_rounds):
            api_kwargs: dict[str, Any] = {
                "model": CLAUDE_MODEL,
                "max_tokens": 4096,
                "system": [{"type": "text", "text": self._build_system_prompt(), "cache_control": {"type": "ephemeral"}}],
                "messages": messages,
            }
            if not was_clarifying:
                api_kwargs["tools"] = TOOL_DEFINITIONS
            try:
                response = self._client.messages.create(**api_kwargs)
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
                    text = block.text.strip()
                    if text.startswith("[CLARIFY]"):
                        self.awaiting_clarification = True
                        text = text[len("[CLARIFY]"):].lstrip("\n").strip()
                    if text:
                        events.append({"type": "narrative", "content": text})

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
        payload = f"{self.mock_session_nonce}|{self.mock_turn_counter}|{player_id}|{action}|{label}".encode("utf-8")
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
        themes = ["ruined", "overgrown", "ancient", "volcanic", "frozen", "flooded", "arcane"]
        environment = environments[seed % len(environments)]
        terrain_theme = themes[(seed // len(environments)) % len(themes)]
        return {
            "description": f"You step into a {terrain_theme} {environment} encounter area prepared for exploration and potential combat.",
            "environment": environment,
            "terrain_theme": terrain_theme,
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
        for cid, char in self.characters.items():
            if cid.startswith("enemy_"):
                continue
            if cid in self.game_map.entities:
                continue

            # Exhaustive interior scan ensures we never choose blocked fallback coordinates.
            spawn_pos: tuple[int, int] | None = None
            for y in range(1, self.game_map.height - 1):
                for x in range(1, self.game_map.width - 1):
                    if self.game_map.can_occupy(x, y):
                        spawn_pos = (x, y)
                        break
                if spawn_pos is not None:
                    break

            if spawn_pos is None:
                logger.warning(
                    "[spawn-debug] kind=pc id=%s chosen=None can_occupy=False reason=no_walkable_tile",
                    cid,
                )
                events.append({
                    "type": "tool_result",
                    "tool": "place_entity",
                    "input": {"id": cid, "name": char.name},
                    "result": {"error": "No walkable spawn tile available for player character"},
                })
                continue

            x, y = spawn_pos
            logger.info(
                "[spawn-debug] kind=pc id=%s chosen=(%s,%s) can_occupy=%s",
                cid,
                x,
                y,
                self.game_map.can_occupy(x, y),
            )
            
            place_input = {
                "id": cid,
                "name": char.name,
                "x": x,
                "y": y,
                "entity_type": "pc",
                "sprite": "default",
            }
            place_result = self._dispatch_tool(dispatcher, "place_entity", place_input, player_id, action)
            events.append({"type": "tool_result", "tool": "place_entity", "input": place_input, "result": place_result})
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
            # Find a walkable tile, preferring the right half of the map.
            x, y = self.game_map.width - 3, self.game_map.height // 2
            found = False
            start_x = max(self.game_map.width // 2, 1)
            for yy in range(1, self.game_map.height - 1):
                for xx in range(start_x, self.game_map.width - 1):
                    if self.game_map.can_occupy(xx, yy):
                        x, y = xx, yy
                        found = True
                        break
                if found:
                    break

            if not found:
                logger.warning(
                    "[spawn-debug] kind=enemy id=%s chosen=None can_occupy=False reason=no_walkable_tile",
                    enemy_id,
                )
                return enemy_id

            logger.info(
                "[spawn-debug] kind=enemy id=%s chosen=(%s,%s) can_occupy=%s",
                enemy_id,
                x,
                y,
                self.game_map.can_occupy(x, y),
            )
            
            place_input = {
                "id": enemy_id,
                "name": enemy.name,
                "x": x,
                "y": y,
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
            "dm_turn_count": sum(
                1 for m in self.conversation_history if m.get("role") == "assistant"
            ),
        }


def _block_to_dict(block: Any) -> dict:
    if block.type == "text":
        return {"type": "text", "text": block.text}
    elif block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    return {"type": block.type}
