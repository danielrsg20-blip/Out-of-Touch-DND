"""SQLAlchemy models for campaign persistence."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, DateTime, Integer
from .database import Base


class SavedCampaign(Base):
    __tablename__ = "campaigns"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    characters_json = Column(Text, default="{}")
    map_json = Column(Text, nullable=True)
    combat_json = Column(Text, nullable=True)
    conversation_json = Column(Text, default="[]")
    session_count = Column(Integer, default=0)

    def set_characters(self, chars_dict: dict) -> None:
        self.characters_json = json.dumps(chars_dict)

    def get_characters(self) -> dict:
        return json.loads(self.characters_json or "{}")

    def set_map(self, map_data: dict | None) -> None:
        self.map_json = json.dumps(map_data) if map_data else None

    def get_map(self) -> dict | None:
        return json.loads(self.map_json) if self.map_json else None

    def set_conversation(self, history: list) -> None:
        self.conversation_json = json.dumps(history)

    def get_conversation(self) -> list:
        return json.loads(self.conversation_json or "[]")
