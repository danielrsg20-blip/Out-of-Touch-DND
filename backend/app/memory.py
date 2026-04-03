"""Campaign memory system: tracks NPCs, locations, quest state, and world events.

Provides a structured memory that gets injected into the system prompt so Claude
maintains consistent world state across sessions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class NPCMemory:
    id: str
    name: str
    race: str = "Unknown"
    role: str = ""
    location: str = ""
    disposition: str = "neutral"
    notes: list[str] = field(default_factory=list)
    alive: bool = True
    first_met_session: int = 0
    tts_voice: str = ""
    last_spoke_session: int = 0
    secrets: list[str] = field(default_factory=list)
    relationships: dict[str, str] = field(default_factory=dict)
    portrait_url: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "race": self.race,
            "role": self.role,
            "location": self.location,
            "disposition": self.disposition,
            "notes": self.notes,
            "alive": self.alive,
            "tts_voice": self.tts_voice,
            "first_met_session": self.first_met_session,
            "last_spoke_session": self.last_spoke_session,
            "secrets": self.secrets,
            "relationships": self.relationships,
            "portrait_url": self.portrait_url,
        }

    def summary(self) -> str:
        status = "alive" if self.alive else "dead"
        parts = [f"{self.name} ({self.race}, {self.role}, {status})"]
        if self.location:
            parts.append(f"at {self.location}")
        if self.disposition != "neutral":
            parts.append(f"disposition: {self.disposition}")
        if self.tts_voice:
            parts.append(f"voice: {self.tts_voice}")
        if self.relationships:
            rel_parts = [f"{k}: {v}" for k, v in list(self.relationships.items())[:3]]
            parts.append(f"knows: {'; '.join(rel_parts)}")
        if self.secrets:
            parts.append(f"secrets[DM-only]: {'; '.join(self.secrets[:2])}")
        if self.last_spoke_session:
            parts.append(f"last spoke: session {self.last_spoke_session}")
        if self.notes:
            parts.append(f"notes: {'; '.join(self.notes[-3:])}")
        return " - ".join(parts)


@dataclass
class QuestMemory:
    id: str
    title: str
    description: str
    status: str = "active"
    giver_npc_id: str | None = None
    objectives: list[str] = field(default_factory=list)
    completed_objectives: list[str] = field(default_factory=list)
    reward: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "objectives": self.objectives,
            "completed_objectives": self.completed_objectives,
            "reward": self.reward,
        }

    def summary(self) -> str:
        done = len(self.completed_objectives)
        total = len(self.objectives)
        return f"[{self.status.upper()}] {self.title} ({done}/{total} objectives) - {self.description}"


@dataclass
class LocationMemory:
    id: str
    name: str
    description: str = ""
    region: str = ""
    visited: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "region": self.region,
            "visited": self.visited,
            "notes": self.notes,
        }


@dataclass
class WorldEvent:
    session: int
    description: str
    importance: str = "minor"

    def to_dict(self) -> dict:
        return {"session": self.session, "description": self.description, "importance": self.importance}


@dataclass
class CampaignMemory:
    npcs: dict[str, NPCMemory] = field(default_factory=dict)
    quests: dict[str, QuestMemory] = field(default_factory=dict)
    locations: dict[str, LocationMemory] = field(default_factory=dict)
    world_events: list[WorldEvent] = field(default_factory=list)
    session_summaries: list[str] = field(default_factory=list)
    current_session: int = 1
    party_notes: list[str] = field(default_factory=list)
    campaign_premise: str = ""
    campaign_tone: str = ""
    campaign_pacing: str = ""
    campaign_difficulty: str = ""
    campaign_title: str = ""
    world_time: dict = field(default_factory=lambda: {"day": 1, "hour": 8, "minute": 0})

    def add_npc(self, npc: NPCMemory) -> None:
        self.npcs[npc.id] = npc

    def add_quest(self, quest: QuestMemory) -> None:
        self.quests[quest.id] = quest

    def add_location(self, loc: LocationMemory) -> None:
        self.locations[loc.id] = loc

    def record_event(self, description: str, importance: str = "minor") -> None:
        self.world_events.append(WorldEvent(
            session=self.current_session,
            description=description,
            importance=importance,
        ))

    def end_session(self, summary: str) -> None:
        self.session_summaries.append(f"Session {self.current_session}: {summary}")
        self.current_session += 1

    def build_context_block(self) -> str:
        """Build a structured text block for the system prompt."""
        sections = []

        # 4d: Critical events upfront so Claude treats them as active world state
        critical_events = [e for e in self.world_events if e.importance == "critical"]
        if critical_events:
            recent_critical = critical_events[-3:]
            sections.append(
                "ACTIVE WORLD STATE (critical — affects current play):\n"
                + "\n".join(f"- {e.description}" for e in recent_critical)
            )

        # 4c: World clock
        wt = self.world_time
        hour = wt.get("hour", 8)
        time_of_day = "day" if 6 <= hour < 20 else "night"
        sections.append(
            f"CURRENT TIME: Day {wt.get('day', 1)}, "
            f"{hour:02d}:{wt.get('minute', 0):02d} ({time_of_day})"
        )

        if self.campaign_premise:
            tone_line = f"\nTone: {self.campaign_tone}" if self.campaign_tone else ""
            pacing_line = f"\nPacing: {self.campaign_pacing}" if self.campaign_pacing else ""
            difficulty_line = f"\nDifficulty: {self.campaign_difficulty}" if self.campaign_difficulty else ""
            title_line = f"\nTitle: {self.campaign_title}" if self.campaign_title else ""
            sections.append(f"CAMPAIGN PREMISE:{title_line}{tone_line}{pacing_line}{difficulty_line}\n{self.campaign_premise}")

        if self.session_summaries:
            recent = self.session_summaries[-5:]
            sections.append("PREVIOUS SESSIONS:\n" + "\n".join(recent))

        active_quests = [q for q in self.quests.values() if q.status == "active"]
        if active_quests:
            sections.append("ACTIVE QUESTS:\n" + "\n".join(q.summary() for q in active_quests))

        living_npcs = [n for n in self.npcs.values() if n.alive]
        if living_npcs:
            sections.append("KNOWN NPCs:\n" + "\n".join(n.summary() for n in living_npcs[:15]))

        visited = [l for l in self.locations.values() if l.visited]
        if visited:
            sections.append("VISITED LOCATIONS:\n" + "\n".join(f"- {l.name} ({l.region}): {l.description}" for l in visited[:10]))

        major_events = [e for e in self.world_events if e.importance in ("major", "critical")]
        if major_events:
            sections.append("MAJOR WORLD EVENTS:\n" + "\n".join(f"- Session {e.session}: {e.description}" for e in major_events[-10:]))

        if self.party_notes:
            sections.append("PARTY NOTES:\n" + "\n".join(f"- {n}" for n in self.party_notes[-10:]))

        return "\n\n".join(sections)

    def to_codex(self) -> dict:
        """Minimal snapshot for the frontend Codex panel (no session internals)."""
        return {
            "npcs": {k: v.to_dict() for k, v in self.npcs.items()},
            "locations": {k: v.to_dict() for k, v in self.locations.items()},
            "quests": {k: v.to_dict() for k, v in self.quests.items()},
            "world_events": [e.to_dict() for e in self.world_events if e.importance in ("major", "critical")],
            "world_time": self.world_time,
        }

    def to_dict(self) -> dict:
        return {
            "npcs": {k: v.to_dict() for k, v in self.npcs.items()},
            "quests": {k: v.to_dict() for k, v in self.quests.items()},
            "locations": {k: v.to_dict() for k, v in self.locations.items()},
            "world_events": [e.to_dict() for e in self.world_events],
            "session_summaries": self.session_summaries,
            "current_session": self.current_session,
            "party_notes": self.party_notes,
            "campaign_premise": self.campaign_premise,
            "campaign_tone": self.campaign_tone,
            "campaign_pacing": self.campaign_pacing,
            "campaign_difficulty": self.campaign_difficulty,
            "campaign_title": self.campaign_title,
            "world_time": self.world_time,
        }

    @classmethod
    def from_dict(cls, data: dict) -> CampaignMemory:
        mem = cls()
        mem.current_session = data.get("current_session", 1)
        mem.session_summaries = data.get("session_summaries", [])
        mem.party_notes = data.get("party_notes", [])
        mem.campaign_premise = data.get("campaign_premise", "")
        mem.campaign_tone = data.get("campaign_tone", "")
        mem.campaign_pacing = data.get("campaign_pacing", "")
        mem.campaign_difficulty = data.get("campaign_difficulty", "")
        mem.campaign_title = data.get("campaign_title", "")
        mem.world_time = data.get("world_time", {"day": 1, "hour": 8, "minute": 0})

        for npc_data in data.get("npcs", {}).values():
            mem.npcs[npc_data["id"]] = NPCMemory(**{k: v for k, v in npc_data.items() if k in NPCMemory.__dataclass_fields__})

        for q_data in data.get("quests", {}).values():
            mem.quests[q_data["id"]] = QuestMemory(**{k: v for k, v in q_data.items() if k in QuestMemory.__dataclass_fields__})

        for l_data in data.get("locations", {}).values():
            mem.locations[l_data["id"]] = LocationMemory(**{k: v for k, v in l_data.items() if k in LocationMemory.__dataclass_fields__})

        for e_data in data.get("world_events", []):
            mem.world_events.append(WorldEvent(**e_data))

        return mem
