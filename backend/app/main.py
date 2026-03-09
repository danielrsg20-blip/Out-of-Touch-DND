"""FastAPI application: REST endpoints and WebSocket hub."""

from __future__ import annotations

import base64
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from .config import CORS_ALLOW_ORIGINS
from .map_catalog import validate_map_catalog_startup
from .session import GameSession, Player, SessionManager
from .voice import speech_to_text, text_to_speech, dm_speak
from .models.database import init_db, async_session
from .models.campaign import SavedCampaign
from .tools import ToolDispatcher
from .rules.spells import (
    get_castable_spell_options,
    get_known_spells_limit,
    get_selectable_spells_for_character,
    get_spell_slot_states,
    get_spellcasting_mode,
    get_prepared_spells_limit,
    initialize_spell_slots,
    validate_spell_selections,
)
from .models.user import User  # noqa: F401 — ensures table is created by init_db
from .auth import create_access_token, decode_token, hash_password, verify_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

session_manager = SessionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Out-of-Touch-DND server starting")
    validate_map_catalog_startup()
    await init_db()
    yield
    logger.info("Server shutting down")


app = FastAPI(title="Out-of-Touch-DND", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- REST Endpoints ---

# Auth

class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    token: str
    user_id: str
    username: str


@app.post("/api/auth/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    if len(req.username) < 3:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 6:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    from sqlalchemy import select
    async with async_session() as db:
        existing = await db.execute(select(User).where(User.username == req.username))
        if existing.scalar_one_or_none():
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail="Username already taken")

        user_id = str(uuid.uuid4())
        user = User(id=user_id, username=req.username, hashed_password=hash_password(req.password))
        db.add(user)
        await db.commit()

    token = create_access_token(user_id=user_id, username=req.username)
    logger.info("User registered: %s", req.username)
    return AuthResponse(token=token, user_id=user_id, username=req.username)


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    from sqlalchemy import select
    from fastapi import HTTPException
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == req.username))
        user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user_id=user.id, username=user.username)
    logger.info("User logged in: %s", req.username)
    return AuthResponse(token=token, user_id=user.id, username=user.username)


@app.get("/api/auth/me")
async def auth_me(request: Request):
    from fastapi import HTTPException
    from jose import JWTError
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth_header.removeprefix("Bearer ")
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"user_id": payload["sub"], "username": payload["username"]}


class CreateSessionRequest(BaseModel):
    player_name: str

class CreateSessionResponse(BaseModel):
    room_code: str
    player_id: str

class JoinSessionRequest(BaseModel):
    room_code: str
    player_name: str

class JoinSessionResponse(BaseModel):
    player_id: str
    session: dict

class CreateCharacterRequest(BaseModel):
    room_code: str
    player_id: str
    name: str
    race: str
    char_class: str
    abilities: dict[str, int]
    sprite_id: str | None = None
    known_spells: list[str] | None = None
    prepared_spells: list[str] | None = None


class CharacterSpellOptionsRequest(BaseModel):
    room_code: str
    player_id: str
    in_combat: bool = False


class LevelUpRequest(BaseModel):
    room_code: str
    player_id: str
    new_level: int
    known_spells: list[str] | None = None
    prepared_spells: list[str] | None = None


@app.get("/api/items")
async def list_items(category: str | None = None):
    from .rules.items import ITEM_CATALOG
    items = [item.to_dict() for item in ITEM_CATALOG.values()]
    if category:
        items = [i for i in items if i["category"] == category]
    return {"items": items}


@app.get("/api/health")
async def health():
    return {"status": "ok", "sessions": len(session_manager.sessions)}


def _extract_user_id(request: Request) -> str | None:
    """Extract user_id from optional Authorization header. Returns None if missing/invalid."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload = decode_token(auth.removeprefix("Bearer "))
        return str(payload["sub"])
    except Exception:  # noqa: BLE001
        return None


@app.post("/api/session/create", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest, request: Request):
    player_id = str(uuid.uuid4())[:8]
    session = session_manager.create_session(host_id=player_id)
    player = Player(id=player_id, name=req.player_name, user_id=_extract_user_id(request))
    session.add_player(player)
    logger.info("Session %s created by %s (%s)", session.room_code, req.player_name, player_id)
    return CreateSessionResponse(room_code=session.room_code, player_id=player_id)


@app.post("/api/session/join", response_model=JoinSessionResponse)
async def join_session(req: JoinSessionRequest, request: Request):
    session = session_manager.get_session(req.room_code)
    if not session:
        return JoinSessionResponse(player_id="", session={"error": "Session not found"})

    player_id = str(uuid.uuid4())[:8]
    player = Player(id=player_id, name=req.player_name, user_id=_extract_user_id(request))
    session.add_player(player)
    logger.info("Player %s (%s) joined %s", req.player_name, player_id, req.room_code)
    return JoinSessionResponse(player_id=player_id, session=session.to_dict())


async def _auto_save_campaign(session: GameSession, room_code: str, user_id: str) -> None:
    """Persist session state so it appears in the user's campaign lobby slots."""
    from sqlalchemy import select
    async with async_session() as db:
        result = await db.execute(select(SavedCampaign).where(SavedCampaign.id == room_code))
        campaign = result.scalar_one_or_none()
        if not campaign:
            campaign = SavedCampaign(id=room_code, name=room_code)
            db.add(campaign)
        if not campaign.owner_id:
            campaign.owner_id = user_id
        campaign.set_characters({cid: c.to_dict() for cid, c in session.orchestrator.characters.items()})
        campaign.set_conversation(session.orchestrator.conversation_history[-20:])
        campaign.session_count = (campaign.session_count or 0) + 1
        pc_map: dict[str, dict] = {}
        for p in session.players.values():
            if p.user_id and p.character_id:
                char = session.orchestrator.characters.get(p.character_id)
                if char:
                    pc_map[p.user_id] = {
                        "name": char.name, "class": char.char_class,
                        "level": char.level, "char_id": p.character_id,
                    }
        campaign.set_player_characters(pc_map)
        await db.commit()
    logger.info("Auto-saved campaign %s for user %s", room_code, user_id)


@app.post("/api/character/create")
async def create_character(req: CreateCharacterRequest, request: Request):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    char_id = f"pc_{req.player_id}"
    try:
        char = session.create_character_for_player(
            player_id=req.player_id,
            char_id=char_id,
            name=req.name,
            race=req.race,
            char_class=req.char_class,
            abilities=req.abilities,
            known_spells=req.known_spells,
            prepared_spells=req.prepared_spells,
            sprite_id=req.sprite_id,
        )
    except ValueError as e:
        return {"error": str(e)}

    await session.broadcast({
        "type": "character_created",
        "character": char.to_dict(),
    })

    user_id = _extract_user_id(request)
    player = session.players.get(req.player_id)
    if user_id and player:
        player.user_id = user_id
    if user_id:
        await _auto_save_campaign(session, req.room_code, user_id)

    return {"character": char.to_dict()}


@app.get("/api/spells/options/{char_class}/{level}")
async def get_spell_options_for_class(char_class: str, level: int):
    from .rules.characters import Character
    from .rules.spells import get_class_features_for_level

    probe = Character(
        id="probe",
        name="Probe",
        race="Human",
        char_class=char_class,
        level=max(1, level),
        abilities={"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
    )
    initialize_spell_slots(probe)

    mode = get_spellcasting_mode(char_class)
    options = get_selectable_spells_for_character(probe, probe.rules_version)
    known_limit = get_known_spells_limit(char_class, probe.level)
    prepared_limit = get_prepared_spells_limit(probe)

    return {
        "class": char_class,
        "level": probe.level,
        "spellcasting_mode": mode,
        "known_limit": known_limit,
        "prepared_limit": prepared_limit,
        "spells": options,
    }


@app.post("/api/character/spell-options")
async def get_character_spell_options(req: CharacterSpellOptionsRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    player = session.players.get(req.player_id)
    if not player or not player.character_id:
        return {"error": "Character not found for player"}

    character = session.orchestrator.characters.get(player.character_id)
    if not character:
        return {"error": "Character not found"}

    in_combat = bool(req.in_combat)
    return {
        "character_id": character.id,
        "spellcasting_mode": get_spellcasting_mode(character.char_class),
        "castable_spells": get_castable_spell_options(character, in_combat=in_combat, rules_version=character.rules_version),
        "slot_states": get_spell_slot_states(character, in_combat=in_combat),
    }


@app.post("/api/character/level-up")
async def level_up_character(req: LevelUpRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    player = session.players.get(req.player_id)
    if not player or not player.character_id:
        return {"error": "Character not found for player"}

    character = session.orchestrator.characters.get(player.character_id)
    if not character:
        return {"error": "Character not found"}

    in_combat = bool(session.orchestrator.combat and session.orchestrator.combat.is_active)
    if in_combat and req.prepared_spells is not None:
        return {"error": "Prepared spells cannot be changed during active combat"}

    if req.new_level < character.level or req.new_level > 20:
        return {"error": "Invalid level value"}

    character.level = req.new_level
    initialize_spell_slots(character)

    selection = validate_spell_selections(
        character,
        known_spells=req.known_spells if req.known_spells is not None else character.known_spells,
        prepared_spells=req.prepared_spells if req.prepared_spells is not None else character.prepared_spells,
        rules_version=character.rules_version,
    )
    if not selection.get("valid", False):
        return {"error": selection.get("error", "Invalid spell selection")}

    character.known_spells = list(selection.get("known_spells", character.known_spells))
    character.prepared_spells = list(selection.get("prepared_spells", character.prepared_spells))

    await session.broadcast({
        "type": "character_updated",
        "character": character.to_dict(),
    })
    await session.broadcast({
        "type": "state_sync",
        "state": session.orchestrator.get_full_state(),
    })

    return {"character": character.to_dict()}


class TTSRequest(BaseModel):
    text: str
    voice: str = "dm_default"

@app.post("/api/tts")
async def tts_endpoint(req: TTSRequest):
    try:
        audio_bytes = await dm_speak(req.text, req.voice)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/session/{room_code}")
async def get_session(room_code: str):
    session = session_manager.get_session(room_code)
    if not session:
        return {"error": "Session not found"}
    state = session.orchestrator.get_full_state()
    state["session"] = session.to_dict()
    return state


class SaveCampaignRequest(BaseModel):
    room_code: str
    campaign_name: str

@app.post("/api/campaign/save")
async def save_campaign(req: SaveCampaignRequest, request: Request):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    from sqlalchemy import select
    campaign_id = req.room_code
    user_id = _extract_user_id(request)

    async with async_session() as db:
        result = await db.execute(select(SavedCampaign).where(SavedCampaign.id == campaign_id))
        campaign = result.scalar_one_or_none()

        if not campaign:
            campaign = SavedCampaign(id=campaign_id, name=req.campaign_name)
            db.add(campaign)

        campaign.name = req.campaign_name
        campaign.set_characters({cid: c.to_dict() for cid, c in session.orchestrator.characters.items()})
        if session.orchestrator.game_map:
            campaign.set_map(session.orchestrator.game_map.to_dict())
        campaign.set_conversation(session.orchestrator.conversation_history[-20:])
        campaign.session_count = (campaign.session_count or 0) + 1

        if user_id and not campaign.owner_id:
            campaign.owner_id = user_id

        pc_map: dict[str, dict] = {}
        for player in session.players.values():
            if player.user_id and player.character_id:
                char = session.orchestrator.characters.get(player.character_id)
                if char:
                    pc_map[player.user_id] = {
                        "name": char.name,
                        "class": char.char_class,
                        "level": char.level,
                        "char_id": player.character_id,
                    }
        campaign.set_player_characters(pc_map)

        await db.commit()

    return {"saved": True, "campaign_id": campaign_id, "name": req.campaign_name}


@app.get("/api/campaign/list")
async def list_campaigns(request: Request):
    from sqlalchemy import select
    user_id = _extract_user_id(request)

    async with async_session() as db:
        query = select(SavedCampaign).order_by(SavedCampaign.updated_at.desc())
        if user_id:
            query = query.where(SavedCampaign.owner_id == user_id).limit(5)
        result = await db.execute(query)
        campaigns = result.scalars().all()

    out = []
    for c in campaigns:
        pc_map = c.get_player_characters()
        my_char = pc_map.get(user_id) if user_id else None
        out.append({
            "id": c.id,
            "name": c.name,
            "updated_at": str(c.updated_at),
            "session_count": c.session_count,
            "my_character": my_char,
        })
    return {"campaigns": out}


class LoadCampaignRequest(BaseModel):
    campaign_id: str
    room_code: str


class PlayerActionRequest(BaseModel):
    room_code: str
    player_id: str
    content: str


class NextTurnRequest(BaseModel):
    room_code: str
    player_id: str


class MoveTokenRequest(BaseModel):
    room_code: str
    player_id: str
    character_id: str
    x: int
    y: int

@app.post("/api/campaign/load")
async def load_campaign(req: LoadCampaignRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    from sqlalchemy import select
    from .map_engine import build_map_from_data
    from .rules.characters import Character

    async with async_session() as db:
        result = await db.execute(select(SavedCampaign).where(SavedCampaign.id == req.campaign_id))
        campaign = result.scalar_one_or_none()

    if not campaign:
        return {"error": "Campaign not found"}

    chars_data = campaign.get_characters()
    for cid, cd in chars_data.items():
        char = Character(
            id=cd["id"], name=cd["name"], race=cd["race"], char_class=cd["class"],
            level=cd["level"], abilities=cd["abilities"], hp=cd["hp"], max_hp=cd["max_hp"],
            temp_hp=cd.get("temp_hp", 0), ac=cd["ac"], speed=cd["speed"],
            skill_proficiencies=cd.get("skill_proficiencies", []),
            conditions=cd.get("conditions", []),
            inventory=cd.get("inventory", []),
            spell_slots={int(k): int(v) for k, v in cd.get("spell_slots", {}).items()},
            spell_slots_used={int(k): int(v) for k, v in cd.get("spell_slots_used", {}).items()},
            known_spells=cd.get("known_spells", []),
            prepared_spells=cd.get("prepared_spells", []),
            class_features=cd.get("class_features", []),
            traits=cd.get("traits", []), xp=cd.get("xp", 0),
            gold_gp=cd.get("gold_gp", 0),
            rules_version=cd.get("rules_version", "2024"),
        )
        if not char.class_features:
            char.class_features = get_class_features_for_level(char.char_class, char.level)
        session.orchestrator.characters[cid] = char

    map_data = campaign.get_map()
    if map_data:
        session.orchestrator.game_map = build_map_from_data(map_data)

    conversation = campaign.get_conversation()
    session.orchestrator.conversation_history = conversation

    return {"loaded": True, "name": campaign.name, "characters": len(chars_data)}


class ResumeCampaignRequest(BaseModel):
    campaign_id: str
    player_name: str
    character_id: str | None = None


@app.get("/api/campaign/{campaign_id}/characters")
async def get_campaign_characters(campaign_id: str, request: Request):
    """Return the character list for a saved campaign (no session created)."""
    from sqlalchemy import select
    user_id = _extract_user_id(request)

    async with async_session() as db:
        result = await db.execute(select(SavedCampaign).where(SavedCampaign.id == campaign_id))
        campaign = result.scalar_one_or_none()

    if not campaign:
        return {"error": "Campaign not found"}
    if campaign.owner_id and campaign.owner_id != user_id:
        return {"error": "Not your campaign"}

    chars_data = campaign.get_characters()
    pc_map = campaign.get_player_characters()
    my_char_id = pc_map.get(user_id, {}).get("char_id") if user_id else None

    characters = [
        {
            "char_id": cid,
            "name": cd.get("name", "Unknown"),
            "class": cd.get("class", "Unknown"),
            "level": cd.get("level", 1),
            "is_mine": cid == my_char_id,
        }
        for cid, cd in chars_data.items()
    ]
    return {"characters": characters}


@app.post("/api/campaign/resume")
async def resume_campaign(req: ResumeCampaignRequest, request: Request):
    """Create a new live session from a saved campaign in one atomic call."""
    from sqlalchemy import select
    from .map_engine import build_map_from_data
    from .rules.characters import Character

    user_id = _extract_user_id(request)
    if not user_id:
        return {"error": "Authentication required"}

    async with async_session() as db:
        result = await db.execute(select(SavedCampaign).where(SavedCampaign.id == req.campaign_id))
        campaign = result.scalar_one_or_none()

    if not campaign:
        return {"error": "Campaign not found"}
    if campaign.owner_id and campaign.owner_id != user_id:
        return {"error": "Not your campaign"}

    player_id = str(uuid.uuid4())[:8]
    session = session_manager.create_session(host_id=player_id)
    player = Player(id=player_id, name=req.player_name, user_id=user_id)
    session.add_player(player)

    chars_data = campaign.get_characters()
    for cid, cd in chars_data.items():
        char = Character(
            id=cd["id"], name=cd["name"], race=cd["race"], char_class=cd["class"],
            level=cd["level"], abilities=cd["abilities"], hp=cd["hp"], max_hp=cd["max_hp"],
            temp_hp=cd.get("temp_hp", 0), ac=cd["ac"], speed=cd["speed"],
            skill_proficiencies=cd.get("skill_proficiencies", []),
            conditions=cd.get("conditions", []),
            inventory=cd.get("inventory", []),
            spell_slots={int(k): int(v) for k, v in cd.get("spell_slots", {}).items()},
            spell_slots_used={int(k): int(v) for k, v in cd.get("spell_slots_used", {}).items()},
            known_spells=cd.get("known_spells", []),
            prepared_spells=cd.get("prepared_spells", []),
            class_features=cd.get("class_features", []),
            traits=cd.get("traits", []), xp=cd.get("xp", 0),
            gold_gp=cd.get("gold_gp", 0),
            rules_version=cd.get("rules_version", "2024"),
        )
        if not char.class_features:
            char.class_features = get_class_features_for_level(char.char_class, char.level)
        session.orchestrator.characters[cid] = char

    map_data = campaign.get_map()
    if map_data:
        session.orchestrator.game_map = build_map_from_data(map_data)

    session.orchestrator.conversation_history = campaign.get_conversation()

    pc_map = campaign.get_player_characters()
    if req.character_id and req.character_id in chars_data:
        player.character_id = req.character_id
        logger.info("Resumed chosen character %s for user %s in session %s", player.character_id, user_id, session.room_code)
    else:
        user_char_info = pc_map.get(user_id)
        if user_char_info and user_char_info.get("char_id"):
            player.character_id = user_char_info["char_id"]
            logger.info("Resumed character %s for user %s in session %s", player.character_id, user_id, session.room_code)

    logger.info("Campaign %s resumed as session %s by %s", req.campaign_id, session.room_code, req.player_name)
    return {
        "room_code": session.room_code,
        "player_id": player_id,
        "campaign_name": campaign.name,
        "characters_count": len(chars_data),
        "has_character": player.character_id is not None,
    }


@app.post("/api/action")
async def action_endpoint(req: PlayerActionRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    player = session.players.get(req.player_id)
    if not player:
        return {"error": "Player not found in session"}

    action_text = req.content.strip()
    if not action_text:
        return {"error": "Action text is required"}

    await session.broadcast({
        "type": "player_message",
        "player_id": player.id,
        "player_name": player.name,
        "content": action_text,
    })

    events = await session.orchestrator.process_player_action(
        player_id=player.id,
        player_name=player.name,
        action=action_text,
    )

    narratives: list[str] = []
    dice_results: list[dict[str, Any]] = []

    for event in events:
        if event.get("type") == "narrative":
            content = str(event.get("content", "")).strip()
            if content:
                narratives.append(content)
                await session.broadcast({
                    "type": "dm_narrative",
                    "content": content,
                })
        elif event.get("type") == "tool_result":
            tool_name = str(event.get("tool", ""))
            result = event.get("result")
            if tool_name in ("attack", "apply_damage", "heal_character", "check_ability", "roll_dice", "cast_spell"):
                payload = {
                    "type": "dice_result",
                    "tool": tool_name,
                    "data": result,
                }
                dice_results.append(payload)
                await session.broadcast(payload)

    state = session.orchestrator.get_full_state()
    await session.broadcast({"type": "state_sync", "state": state})

    return {
        "ok": True,
        "narratives": narratives,
        "dice_results": dice_results,
        "state": state,
    }


@app.post("/api/combat/next-turn")
async def combat_next_turn(req: NextTurnRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    player = session.players.get(req.player_id)
    if not player:
        return {"error": "Player not found in session"}

    dispatcher = ToolDispatcher(
        session.orchestrator.characters,
        session.orchestrator.game_map,
        session.orchestrator.combat,
        session.orchestrator.memory,
    )
    result = dispatcher.dispatch("next_turn", {})
    if isinstance(result, dict) and result.get("error"):
        return {"error": str(result.get("error"))}

    if dispatcher.combat and dispatcher.combat.is_active:
        safety = 0
        while dispatcher.combat.current_participant and dispatcher.combat.current_participant.character.id.startswith("enemy_") and safety < 12:
            safety += 1
            result = dispatcher.dispatch("next_turn", {})
            if isinstance(result, dict) and result.get("error"):
                break

    session.orchestrator.game_map = dispatcher.game_map
    session.orchestrator.combat = dispatcher.combat
    session.orchestrator.memory = dispatcher.memory

    combat_state = session.orchestrator.combat.to_dict() if session.orchestrator.combat else None
    await session.broadcast({
        "type": "combat_update",
        "action": "next_turn",
        "data": result if isinstance(result, dict) else {"message": "Turn advanced."},
        "combat": combat_state,
    })

    state = session.orchestrator.get_full_state()
    await session.broadcast({"type": "state_sync", "state": state})

    return {
        "ok": True,
        "combat": combat_state,
        "state": state,
        "data": result if isinstance(result, dict) else {"message": "Turn advanced."},
    }


@app.post("/api/move-token")
async def move_token_endpoint(req: MoveTokenRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    player = session.players.get(req.player_id)
    if not player:
        return {"error": "Player not found in session"}

    if player.character_id and req.character_id != player.character_id:
        return {"error": "You can only move your own character token"}

    game_map = session.orchestrator.game_map
    if not game_map:
        return {"error": "No map loaded"}

    entity = game_map.entities.get(req.character_id)
    if entity is None:
        return {"error": f"Entity {req.character_id} not found"}

    distance_tiles = abs(int(req.x) - int(entity.x)) + abs(int(req.y) - int(entity.y))
    combat = session.orchestrator.combat
    if combat and combat.is_active:
        current = combat.current_participant
        if current is None:
            return {"error": "Combat turn state is invalid"}
        if current.character.id != req.character_id:
            return {"error": "It is not your turn"}

        remaining_feet = int(current.movement_remaining)
        required_feet = distance_tiles * 5
        if required_feet > remaining_feet:
            return {"error": f"Not enough movement remaining ({remaining_feet} ft left)"}

    dispatcher = ToolDispatcher(
        session.orchestrator.characters,
        session.orchestrator.game_map,
        session.orchestrator.combat,
        session.orchestrator.memory,
    )
    result = dispatcher.dispatch("move_entity", {
        "entity_id": req.character_id,
        "x": req.x,
        "y": req.y,
    })

    session.orchestrator.game_map = dispatcher.game_map
    session.orchestrator.combat = dispatcher.combat
    session.orchestrator.memory = dispatcher.memory

    if isinstance(result, dict) and result.get("error"):
        return {"error": str(result.get("error"))}

    if combat and combat.is_active:
        current = combat.current_participant
        if current and current.character.id == req.character_id:
            required_feet = distance_tiles * 5
            current.movement_remaining = max(0, int(current.movement_remaining) - required_feet)

    await session.broadcast({
        "type": "map_change",
        "action": "move_entity",
        "data": result,
    })

    if combat and combat.is_active:
        await session.broadcast({
            "type": "combat_update",
            "action": "movement_update",
            "combat": combat.to_dict(),
            "data": {
                "message": f"Movement remaining: {combat.current_participant.movement_remaining if combat.current_participant else 0} ft",
            },
        })

    state = session.orchestrator.get_full_state()
    await session.broadcast({"type": "state_sync", "state": state})

    return {
        "ok": True,
        "data": result,
        "state": state,
    }


class PlayerEquipRequest(BaseModel):
    room_code: str
    player_id: str
    item_id: str
    equip: bool = True


@app.post("/api/player-equip")
async def player_equip_endpoint(req: PlayerEquipRequest):
    """Let a player equip or unequip their own item outside of combat."""
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    player = session.players.get(req.player_id)
    if not player:
        return {"error": "Player not found in session"}

    if not player.character_id:
        return {"error": "You have no character in this session"}

    combat = session.orchestrator.combat
    if combat and combat.is_active:
        return {"error": "You cannot change equipment during combat"}

    dispatcher = ToolDispatcher(
        session.orchestrator.characters,
        session.orchestrator.game_map,
        session.orchestrator.combat,
        session.orchestrator.memory,
    )
    result = dispatcher.dispatch("equip_item", {
        "character_id": player.character_id,
        "item_id": req.item_id,
        "equip": req.equip,
    })

    if isinstance(result, dict) and result.get("error"):
        return {"error": str(result["error"])}

    await session.broadcast({
        "type": "inventory_update",
        "tool": "equip_item",
        "data": result,
    })

    state = session.orchestrator.get_full_state()
    await session.broadcast({"type": "state_sync", "state": state})

    return {"ok": True, "data": result}


# --- WebSocket ---

@app.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str):
    session = session_manager.get_session(room_code)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    player = session.players.get(player_id)
    if not player:
        await websocket.close(code=4004, reason="Player not found in session")
        return

    await websocket.accept()
    player.websocket = websocket

    await websocket.send_json({
        "type": "connected",
        "player_id": player_id,
        "session": session.to_dict(),
        "game_state": session.orchestrator.get_full_state(),
    })

    await session.broadcast({
        "type": "player_connected",
        "player": player.to_dict(),
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON"})
                continue

            try:
                await handle_ws_message(session, player, msg)
            except Exception as e:
                logger.exception("Unhandled ws message error for room=%s player=%s", room_code, player_id)
                await session.send_to_player(player.id, {
                    "type": "error",
                    "content": f"Server error while processing action: {e}",
                })

    except WebSocketDisconnect:
        logger.info("Player %s disconnected from %s", player.name, room_code)
        player.websocket = None
        await session.broadcast({
            "type": "player_disconnected",
            "player_id": player_id,
            "player_name": player.name,
        })


async def handle_ws_message(session: GameSession, player: Player, msg: dict[str, Any]) -> None:
    msg_type = msg.get("type", "")

    if msg_type == "cast_spell":
        if not player.character_id:
            await session.send_to_player(player.id, {"type": "error", "content": "No character assigned"})
            return

        spell_name = str(msg.get("spell_name", "")).strip()
        slot_level = int(msg.get("slot_level", 0))
        target_id = msg.get("target_id")
        if not spell_name:
            await session.send_to_player(player.id, {"type": "error", "content": "Spell name is required"})
            return

        dispatcher = ToolDispatcher(
            session.orchestrator.characters,
            session.orchestrator.game_map,
            session.orchestrator.combat,
            session.orchestrator.memory,
        )
        result = dispatcher.dispatch("cast_spell", {
            "caster_id": player.character_id,
            "spell_name": spell_name,
            "slot_level": slot_level,
            "target_id": target_id,
            "enforce_restrictions": True,
        })

        session.orchestrator.game_map = dispatcher.game_map
        session.orchestrator.combat = dispatcher.combat
        session.orchestrator.memory = dispatcher.memory

        if isinstance(result, dict) and result.get("error"):
            await session.send_to_player(player.id, {"type": "error", "content": str(result.get("error"))})
        else:
            await session.broadcast({
                "type": "dice_result",
                "tool": "cast_spell",
                "data": result,
            })

        state = session.orchestrator.get_full_state()
        await session.broadcast({"type": "state_sync", "state": state})
        return

    if msg_type == "player_action":
        action_text = msg.get("content", "").strip()
        if not action_text:
            return

        await session.broadcast({
            "type": "player_message",
            "player_id": player.id,
            "player_name": player.name,
            "content": action_text,
        })

        events = await session.orchestrator.process_player_action(
            player_id=player.id,
            player_name=player.name,
            action=action_text,
        )

        for event in events:
            if event["type"] == "narrative":
                await session.broadcast({
                    "type": "dm_narrative",
                    "content": event["content"],
                })
            elif event["type"] == "tool_result":
                tool_name = event["tool"]
                result = event["result"]

                if tool_name == "generate_map":
                    fov = None
                    gmap = session.orchestrator.game_map
                    if gmap:
                        pc_ids = [
                            p.character_id for p in session.players.values()
                            if p.character_id and p.character_id in (gmap.entities or {})
                        ]
                        if pc_ids:
                            fov = gmap.compute_party_fov(pc_ids)
                        map_data = gmap.to_dict(fov)
                    else:
                        map_data = result
                    await session.broadcast({
                        "type": "map_update",
                        "map": map_data,
                        "description": result.get("description", ""),
                    })

                elif tool_name in ("place_entity", "move_entity", "remove_entity", "update_tile"):
                    if isinstance(result, dict) and result.get("error"):
                        await session.send_to_player(player.id, {
                            "type": "error",
                            "content": str(result.get("error")),
                        })
                    else:
                        await session.broadcast({
                            "type": "map_change",
                            "action": tool_name,
                            "data": result,
                        })

                elif tool_name == "start_combat":
                    await session.broadcast({
                        "type": "combat_start",
                        "combat": result,
                    })

                elif tool_name in ("next_turn", "end_combat"):
                    combat_state = session.orchestrator.combat.to_dict() if session.orchestrator.combat else None
                    await session.broadcast({
                        "type": "combat_update",
                        "action": tool_name,
                        "data": result,
                        "combat": combat_state,
                    })

                elif tool_name in ("give_item", "remove_item", "equip_item"):
                    await session.broadcast({
                        "type": "inventory_update",
                        "tool": tool_name,
                        "data": result,
                    })

                elif tool_name in ("give_gold", "spend_gold"):
                    await session.broadcast({
                        "type": "gold_update",
                        "tool": tool_name,
                        "data": result,
                    })

                elif tool_name in ("attack", "apply_damage", "heal_character", "check_ability", "roll_dice"):
                    await session.broadcast({
                        "type": "dice_result",
                        "tool": tool_name,
                        "data": result,
                    })

                elif tool_name == "get_character":
                    await session.send_to_player(player.id, {
                        "type": "character_info",
                        "data": result,
                    })

            elif event["type"] == "error":
                await session.send_to_player(player.id, {
                    "type": "error",
                    "content": event["content"],
                })

        state = session.orchestrator.get_full_state()
        await session.broadcast({"type": "state_sync", "state": state})

    elif msg_type == "voice_input":
        audio_b64 = msg.get("audio", "")
        try:
            audio_bytes = base64.b64decode(audio_b64)
            transcript = await speech_to_text(audio_bytes)
            if transcript:
                await session.send_to_player(player.id, {
                    "type": "voice_transcript",
                    "text": transcript,
                })
                await handle_ws_message(session, player, {"type": "player_action", "content": transcript})
        except Exception as e:
            logger.error("Voice input error: %s", e)
            await session.send_to_player(player.id, {"type": "error", "content": f"Voice error: {e}"})

    elif msg_type == "tts_request":
        text = msg.get("text", "")
        voice = msg.get("voice", "dm_default")
        try:
            audio_bytes = await dm_speak(text, voice)
            audio_b64 = base64.b64encode(audio_bytes).decode()
            await session.broadcast({
                "type": "tts_audio",
                "audio": audio_b64,
                "text": text,
            })
        except Exception as e:
            logger.error("TTS error: %s", e)

    elif msg_type == "move_token":
        char_id = msg.get("character_id")
        try:
            x, y = int(msg.get("x", 0)), int(msg.get("y", 0))
        except (TypeError, ValueError):
            await session.send_to_player(player.id, {
                "type": "error",
                "content": "Invalid movement coordinates.",
            })
            return
        gmap = session.orchestrator.game_map

        if gmap and char_id and player.character_id == char_id:
            entity = gmap.entities.get(char_id)
            if entity is None:
                await session.send_to_player(player.id, {
                    "type": "error",
                    "content": "Character token not found on map.",
                })
                return

            combat = session.orchestrator.combat
            if combat and combat.is_active:
                current = combat.current_participant
                if not current or current.character.id != char_id:
                    await session.send_to_player(player.id, {
                        "type": "error",
                        "content": "You can only move on your turn during combat.",
                    })
                    return

                original_x, original_y = entity.x, entity.y
                move_cost_feet = (abs(original_x - x) + abs(original_y - y)) * 5
                if move_cost_feet > current.movement_remaining:
                    await session.send_to_player(player.id, {
                        "type": "error",
                        "content": f"Not enough movement remaining ({current.movement_remaining} ft left).",
                    })
                    return
            else:
                original_x, original_y = entity.x, entity.y

            if gmap.is_walkable(x, y):
                gmap.move_entity(char_id, x, y)

                if combat and combat.is_active:
                    current = combat.current_participant
                    if current and current.character.id == char_id:
                        move_cost_feet = (abs(original_x - x) + abs(original_y - y)) * 5
                        current.movement_remaining = max(0, current.movement_remaining - move_cost_feet)

                await session.broadcast({
                    "type": "map_change",
                    "action": "move_entity",
                    "data": {"moved": char_id, "to": {"x": x, "y": y}},
                })

                if combat and combat.is_active:
                    await session.broadcast({
                        "type": "combat_update",
                        "action": "move_token",
                        "combat": combat.to_dict(),
                    })

    elif msg_type == "ping":
        await session.send_to_player(player.id, {"type": "pong"})
