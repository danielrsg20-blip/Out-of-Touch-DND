"""Session management: rooms, players, game state per session."""

from __future__ import annotations

import random
import string
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from .orchestrator import Orchestrator
from .rules.characters import Character, create_character

WORD_LIST = [
    "goblin", "dragon", "wizard", "sword", "dungeon", "castle", "tavern",
    "knight", "rogue", "dwarf", "elf", "orc", "troll", "mage", "cleric",
    "ranger", "bard", "paladin", "warlock", "sorcerer", "kobold", "mimic",
    "lich", "golem", "wraith", "hydra", "wyvern", "basilisk", "manticore",
]


def generate_room_code() -> str:
    word = random.choice(WORD_LIST).upper()
    num = random.randint(10, 99)
    return f"{word}-{num}"


@dataclass
class Player:
    id: str
    name: str
    character_id: str | None = None
    user_id: str | None = None
    websocket: WebSocket | None = field(default=None, repr=False)
    last_action_at: float | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "character_id": self.character_id,
        }


@dataclass
class GameSession:
    room_code: str
    host_id: str
    players: dict[str, Player] = field(default_factory=dict)
    orchestrator: Orchestrator = field(default_factory=Orchestrator)
    started: bool = False

    def add_player(self, player: Player) -> None:
        self.players[player.id] = player

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)

    def create_character_for_player(
        self,
        player_id: str,
        char_id: str,
        name: str,
        race: str,
        char_class: str,
        abilities: dict[str, int],
        known_spells: list[str] | None = None,
        prepared_spells: list[str] | None = None,
        sprite_id: str | None = None,
    ) -> Character:
        char = create_character(
            char_id=char_id,
            name=name,
            race=race,
            char_class=char_class,
            abilities=abilities,
            player_id=player_id,
            known_spells=known_spells,
            prepared_spells=prepared_spells,
            sprite_id=sprite_id,
        )
        self.orchestrator.characters[char_id] = char
        self.players[player_id].character_id = char_id
        return char

    async def broadcast(self, message: dict[str, Any]) -> None:
        disconnected = []
        for pid, player in self.players.items():
            if player.websocket:
                try:
                    await player.websocket.send_json(message)
                except Exception:
                    disconnected.append(pid)
        for pid in disconnected:
            self.players[pid].websocket = None

    async def send_to_player(self, player_id: str, message: dict[str, Any]) -> None:
        player = self.players.get(player_id)
        if player and player.websocket:
            try:
                await player.websocket.send_json(message)
            except Exception:
                player.websocket = None

    def to_dict(self) -> dict:
        return {
            "room_code": self.room_code,
            "host_id": self.host_id,
            "players": [p.to_dict() for p in self.players.values()],
            "started": self.started,
            "characters": {
                cid: c.to_dict()
                for cid, c in self.orchestrator.characters.items()
            },
        }


class SessionManager:
    def __init__(self) -> None:
        self.sessions: dict[str, GameSession] = {}

    def create_session(self, host_id: str) -> GameSession:
        code = generate_room_code()
        while code in self.sessions:
            code = generate_room_code()

        session = GameSession(room_code=code, host_id=host_id)
        self.sessions[code] = session
        return session

    def get_session(self, room_code: str) -> GameSession | None:
        return self.sessions.get(room_code.upper())

    def remove_session(self, room_code: str) -> None:
        self.sessions.pop(room_code, None)
