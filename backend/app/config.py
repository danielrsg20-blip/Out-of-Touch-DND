from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
LOCAL_MOCK_MODE: bool = os.getenv("LOCAL_MOCK_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}

CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

MAX_SESSION_COST_USD: float = float(os.getenv("MAX_SESSION_COST_USD", "20.0"))
MONTHLY_SPEND_CAP_USD: float = float(os.getenv("MONTHLY_SPEND_CAP_USD", "80.0"))

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./campaign.db")
