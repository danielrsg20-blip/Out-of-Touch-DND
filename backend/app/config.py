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

def _normalize_database_url(url: str) -> str:
	u = (url or "").strip()
	if not u:
		return "sqlite+aiosqlite:///./campaign.db"

	if u.startswith("postgres://"):
		return "postgresql+asyncpg://" + u.removeprefix("postgres://")

	if u.startswith("postgresql://") and not u.startswith("postgresql+asyncpg://"):
		return "postgresql+asyncpg://" + u.removeprefix("postgresql://")

	return u


DATABASE_URL: str = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./campaign.db"))

JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me-to-a-long-random-secret")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

MAP_PACK_VALIDATION_MODE: str = os.getenv("MAP_PACK_VALIDATION_MODE", "warn").strip().lower() or "warn"

CORS_ALLOW_ORIGINS_RAW: str = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5174,http://127.0.0.1:5174")
CORS_ALLOW_ORIGINS: list[str] = [
	origin.strip()
	for origin in CORS_ALLOW_ORIGINS_RAW.split(",")
	if origin.strip()
]
