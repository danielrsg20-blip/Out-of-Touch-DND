"""Deterministic session-start protocol generator for DM bootstrap."""

from __future__ import annotations

import hashlib
from typing import Any

from .session import GameSession


def _normalize(text: str) -> str:
    return " ".join((text or "").strip().split())


def _build_recap(session: GameSession) -> str:
    summaries = list(session.orchestrator.memory.session_summaries)
    if summaries:
        recent = summaries[-2:]
        lines = [f"- {_normalize(s)}" for s in recent if _normalize(s)]
        recap = (
            "You return to the adventure with your previous progress still intact. "
            + " ".join(lines)
            + " The party's immediate objective remains active."
        )
        return _normalize(recap)

    history = session.orchestrator.conversation_history[-8:]
    user_turns = [str(m.get("content", "")) for m in history if m.get("role") == "user"]
    if user_turns:
        last_actions = ", ".join(_normalize(t)[:80] for t in user_turns[-2:])
        return _normalize(
            f"The party regroups at the start of the session. "
            f"Recent momentum came from player actions such as {last_actions}. "
            "Your objectives remain unresolved, and the current scene is ready for immediate play."
        )

    # Use campaign premise if set by the host during session creation
    premise = _normalize(session.orchestrator.memory.campaign_premise)
    tone = _normalize(session.orchestrator.memory.campaign_tone)
    if premise:
        tone_hint = f" Tone: {tone}." if tone else ""
        return _normalize(
            f"A new adventure begins.{tone_hint} "
            f"{premise} "
            "Draw the party in immediately — set the scene with vivid sensory detail, "
            "establish any immediate tension, and end with something that demands their first decision."
        )

    return (
        "The party gathers at the start of a new session. "
        "No major events have been recorded yet, so the adventure begins from the current setup. "
        "Establish your first move to set the tone for this expedition."
    )


def _build_party_status(session: GameSession) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for player in sorted(session.players.values(), key=lambda p: (p.name.lower(), p.id)):
        char = session.orchestrator.characters.get(player.character_id or "")
        if not char:
            rows.append({
                "player_name": player.name,
                "character_name": None,
                "role": None,
                "hp": {"current": None, "max": None},
                "spell_slots": None,
                "conditions": [],
                "status": "missing_character",
            })
            continue

        spell_slots: dict[str, dict[str, int]] | None = None
        if char.spell_slots:
            spell_slots = {}
            for level in sorted(char.spell_slots.keys()):
                total = int(char.spell_slots.get(level, 0))
                used = int(char.spell_slots_used.get(level, 0))
                spell_slots[str(level)] = {
                    "total": total,
                    "used": used,
                    "remaining": max(0, total - used),
                }

        rows.append({
            "player_name": player.name,
            "character_name": char.name,
            "role": f"{char.race} {char.char_class}",
            "hp": {"current": int(char.hp), "max": int(char.max_hp)},
            "spell_slots": spell_slots,
            "conditions": list(char.conditions or []),
            "status": "ok",
        })

    return rows


def _build_scene(session: GameSession) -> str:
    gmap = session.orchestrator.game_map
    if not gmap:
        return (
            "The party is not yet placed on an active map. "
            "Lighting and terrain are currently undefined. "
            "Set the location so exploration can begin immediately."
        )

    metadata = gmap.metadata or {}
    location = _normalize(str(metadata.get("location") or metadata.get("map_id") or metadata.get("environment") or "an unknown location"))
    lighting = _normalize(str(metadata.get("lighting") or metadata.get("time_of_day") or "uncertain lighting"))
    atmosphere = _normalize(str(metadata.get("atmosphere") or metadata.get("encounter_type") or "tense and expectant"))

    tile_types = [str(t.tile_type) for t in gmap.tiles.values()]
    key_terrain = []
    for terrain in ("wall", "water", "door", "pillar", "pit", "rubble", "stairs_up", "stairs_down"):
        if terrain in tile_types:
            key_terrain.append(terrain)
    terrain_text = ", ".join(key_terrain[:4]) if key_terrain else "open ground"

    structures = [e.name for e in gmap.entities.values() if e.entity_type in {"object", "npc"}]
    structure_text = ", ".join(sorted(structures)[:3]) if structures else "no obvious structures"

    return _normalize(
        f"You are at {location}. "
        f"The scene is under {lighting}, with an atmosphere that feels {atmosphere}. "
        f"Key terrain includes {terrain_text}. "
        f"Visible points of interest include {structure_text}."
    )


def _build_npc_present(session: GameSession) -> list[dict[str, str]] | str:
    gmap = session.orchestrator.game_map
    if not gmap:
        return "NONE"

    npc_entities = [e for e in gmap.entities.values() if e.entity_type == "npc"]
    if not npc_entities:
        return "NONE"

    npc_rows: list[dict[str, str]] = []
    memory_npcs = session.orchestrator.memory.npcs
    for npc in sorted(npc_entities, key=lambda e: e.name.lower()):
        mem = memory_npcs.get(npc.id)
        role = (mem.role if mem else "local figure") or "local figure"
        behavior = (mem.notes[-1] if mem and mem.notes else "observing the party's arrival")
        npc_rows.append({
            "name": npc.name,
            "role": _normalize(role),
            "behavior": _normalize(behavior),
        })
    return npc_rows


def _build_trigger(session: GameSession) -> str:
    gmap = session.orchestrator.game_map
    location = "unknown"
    if gmap and gmap.metadata:
        location = str(gmap.metadata.get("location") or gmap.metadata.get("map_id") or gmap.metadata.get("environment") or "unknown")

    seed_input = "|".join([
        session.room_code,
        str(session.orchestrator.memory.current_session),
        location,
        ",".join(sorted(p.name for p in session.players.values())),
    ])
    digest = hashlib.sha256(seed_input.encode("utf-8")).hexdigest()
    pick = int(digest[:8], 16) % 5

    triggers = [
        "A suspicious scraping sound echoes from just beyond the nearest line of sight.",
        "You notice a small environmental detail that seems recently disturbed, suggesting fresh activity.",
        "An NPC in view shifts posture and begins to speak, clearly expecting an immediate response.",
        "You catch movement at the edge of visibility, then silence returns before intent is clear.",
        "A subtle puzzle-like clue becomes visible on a nearby surface, hinting at a hidden mechanism.",
    ]
    return triggers[pick]


def _validate_session_state(session: GameSession, party_status: list[dict[str, Any]]) -> dict[str, Any]:
    issues: list[str] = []

    if not session.players:
        issues.append("No party members are registered in the session.")

    missing_chars = [row["player_name"] for row in party_status if row.get("status") != "ok"]
    if missing_chars:
        issues.append(f"Missing character assignment for: {', '.join(missing_chars)}")

    gmap = session.orchestrator.game_map
    if gmap is None:
        issues.append("Map/environment is not loaded.")

    for row in party_status:
        hp = row.get("hp") or {}
        current_hp = hp.get("current")
        max_hp = hp.get("max")
        if isinstance(current_hp, int) and isinstance(max_hp, int):
            if max_hp <= 0 or current_hp < 0 or current_hp > max_hp:
                name = row.get("character_name") or row.get("player_name") or "Unknown"
                issues.append(f"Invalid HP state for {name}.")

    return {
        "status": "SESSION_STATE_READY" if not issues else "SESSION_STATE_BLOCKED",
        "ready": len(issues) == 0,
        "issues": issues,
    }


def build_session_start_protocol(session: GameSession) -> dict[str, Any]:
    party_status = _build_party_status(session)
    validation = _validate_session_state(session, party_status)
    recap = _build_recap(session)
    scene = _build_scene(session)
    npc_present = _build_npc_present(session)
    trigger = _build_trigger(session)

    return {
        "type": "session_start",
        "protocol": {
            "SESSION_START": "SESSION_START",
            "SESSION_STATE_READY": validation,
            "SESSION_RECAP": recap,
            "PARTY_STATUS": party_status,
            "CURRENT_SCENE": scene,
            "NPC_PRESENT": npc_present,
            "EVENT_TRIGGER": trigger,
            "ACTION_PROMPT": "What would you like to do?",
        },
    }
