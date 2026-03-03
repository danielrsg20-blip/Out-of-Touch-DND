from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
LOCAL_MOCK_MODE: bool = os.getenv("LOCAL_MOCK_MODE", "false").strip().lower() in {"1", "true", "yes", "on"}
SRD_RULES_VERSION: str = os.getenv("SRD_RULES_VERSION", "2024").strip() or "2024"

CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

MAX_SESSION_COST_USD: float = float(os.getenv("MAX_SESSION_COST_USD", "20.0"))
MONTHLY_SPEND_CAP_USD: float = float(os.getenv("MONTHLY_SPEND_CAP_USD", "80.0"))

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./campaign.db")

JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me-to-a-long-random-secret")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
