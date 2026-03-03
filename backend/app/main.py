"""FastAPI application: REST endpoints and WebSocket hub."""

from __future__ import annotations

import base64
import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from .session import GameSession, Player, SessionManager
from .voice import speech_to_text, text_to_speech, dm_speak
from .models.database import init_db, async_session
from .models.campaign import SavedCampaign

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

session_manager = SessionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Out-of-Touch-DND server starting")
    await init_db()
    yield
    logger.info("Server shutting down")


app = FastAPI(title="Out-of-Touch-DND", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- REST Endpoints ---

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


@app.post("/api/session/create", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest):
    player_id = str(uuid.uuid4())[:8]
    session = session_manager.create_session(host_id=player_id)
    player = Player(id=player_id, name=req.player_name)
    session.add_player(player)
    logger.info("Session %s created by %s (%s)", session.room_code, req.player_name, player_id)
    return CreateSessionResponse(room_code=session.room_code, player_id=player_id)


@app.post("/api/session/join", response_model=JoinSessionResponse)
async def join_session(req: JoinSessionRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return JoinSessionResponse(player_id="", session={"error": "Session not found"})

    player_id = str(uuid.uuid4())[:8]
    player = Player(id=player_id, name=req.player_name)
    session.add_player(player)
    logger.info("Player %s (%s) joined %s", req.player_name, player_id, req.room_code)
    return JoinSessionResponse(player_id=player_id, session=session.to_dict())


@app.post("/api/character/create")
async def create_character(req: CreateCharacterRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    char_id = f"pc_{req.player_id}"
    char = session.create_character_for_player(
        player_id=req.player_id,
        char_id=char_id,
        name=req.name,
        race=req.race,
        char_class=req.char_class,
        abilities=req.abilities,
    )

    await session.broadcast({
        "type": "character_created",
        "character": char.to_dict(),
    })

    return {"character": char.to_dict()}


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
async def save_campaign(req: SaveCampaignRequest):
    session = session_manager.get_session(req.room_code)
    if not session:
        return {"error": "Session not found"}

    from sqlalchemy import select
    campaign_id = req.room_code

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

        await db.commit()

    return {"saved": True, "campaign_id": campaign_id, "name": req.campaign_name}


@app.get("/api/campaign/list")
async def list_campaigns():
    from sqlalchemy import select
    async with async_session() as db:
        result = await db.execute(select(SavedCampaign).order_by(SavedCampaign.updated_at.desc()))
        campaigns = result.scalars().all()
        return {
            "campaigns": [
                {"id": c.id, "name": c.name, "updated_at": str(c.updated_at), "session_count": c.session_count}
                for c in campaigns
            ]
        }


class LoadCampaignRequest(BaseModel):
    campaign_id: str
    room_code: str

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
            spell_slots=cd.get("spell_slots", {}),
            spell_slots_used=cd.get("spell_slots_used", {}),
            traits=cd.get("traits", []), xp=cd.get("xp", 0),
        )
        session.orchestrator.characters[cid] = char

    map_data = campaign.get_map()
    if map_data:
        session.orchestrator.game_map = build_map_from_data(map_data)

    conversation = campaign.get_conversation()
    session.orchestrator.conversation_history = conversation

    return {"loaded": True, "name": campaign.name, "characters": len(chars_data)}


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
                    await session.broadcast({
                        "type": "combat_update",
                        "action": tool_name,
                        "data": result,
                    })

                elif tool_name in ("give_item", "remove_item", "equip_item"):
                    await session.broadcast({
                        "type": "inventory_update",
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
        x, y = msg.get("x", 0), msg.get("y", 0)
        gmap = session.orchestrator.game_map

        if gmap and char_id and player.character_id == char_id:
            if gmap.is_walkable(x, y):
                gmap.move_entity(char_id, x, y)
                await session.broadcast({
                    "type": "map_change",
                    "action": "move_entity",
                    "data": {"moved": char_id, "to": {"x": x, "y": y}},
                })

    elif msg_type == "ping":
        await session.send_to_player(player.id, {"type": "pong"})
