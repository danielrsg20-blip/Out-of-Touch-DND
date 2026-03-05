"""Database setup and session management."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from ..config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def _add_column_if_missing(conn, table: str, column: str, col_type: str) -> None:
    from sqlalchemy import text
    result = await conn.execute(text(f"PRAGMA table_info({table})"))  # noqa: S608
    cols = [row[1] for row in result.fetchall()]
    if column not in cols:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))  # noqa: S608


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _add_column_if_missing(conn, "campaigns", "owner_id", "VARCHAR")
        await _add_column_if_missing(conn, "campaigns", "player_characters_json", "TEXT")
