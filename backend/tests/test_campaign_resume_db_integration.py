import asyncio
import uuid

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app, overlay_api, session_manager
from app.models.campaign import SavedCampaign
from app.models.database import Base


async def _create_schema(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _read_saved_campaign(session_factory: async_sessionmaker[AsyncSession], campaign_id: str) -> SavedCampaign | None:
    async with session_factory() as db:
        result = await db.execute(select(SavedCampaign).where(SavedCampaign.id == campaign_id))
        return result.scalar_one_or_none()


@pytest.fixture
def isolated_api_client(tmp_path, monkeypatch):
    db_path = tmp_path / 'campaign_integration.db'
    db_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"

    test_engine = create_async_engine(db_url, echo=False)
    test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    asyncio.run(_create_schema(test_engine))
    monkeypatch.setattr('app.main.async_session', test_session_factory)

    session_manager.sessions.clear()
    overlay_api.overlays.clear()

    with TestClient(app) as client:
        yield client, test_session_factory

    session_manager.sessions.clear()
    overlay_api.overlays.clear()
    asyncio.run(test_engine.dispose())


def test_campaign_save_resume_persists_overlay_in_db_and_restores_on_resume(isolated_api_client) -> None:
    client, test_session_factory = isolated_api_client

    username = f"integration_{uuid.uuid4().hex[:10]}"
    password = 'testpass123'

    auth_res = client.post('/api/auth/register', json={'username': username, 'password': password})
    assert auth_res.status_code == 200
    auth_payload = auth_res.json()
    token = auth_payload['token']
    auth_headers = {'Authorization': f'Bearer {token}'}

    create_session_res = client.post('/api/session/create', json={'player_name': 'Host'})
    assert create_session_res.status_code == 200
    create_session_payload = create_session_res.json()
    room_code = create_session_payload['room_code']

    room_overlay_id = f'overlay_room_{room_code}'
    narrative = 'battle in a cursed winter ruin with scorch marks'

    generate_res = client.post(
        '/api/overlays/generate',
        json={
            'narrative': narrative,
            'overlay_id': room_overlay_id,
            'overlay_name': 'Room Overlay',
            'room_code': room_code,
            'replace': True,
        },
    )
    assert generate_res.status_code == 200
    generated_overlay = generate_res.json().get('overlay')
    assert isinstance(generated_overlay, dict)
    assert generated_overlay.get('id') == room_overlay_id

    save_res = client.post(
        '/api/campaign/save',
        headers=auth_headers,
        json={'room_code': room_code, 'campaign_name': 'Overlay Persistence Campaign'},
    )
    assert save_res.status_code == 200
    save_payload = save_res.json()
    assert save_payload.get('saved') is True
    campaign_id = save_payload['campaign_id']

    saved_campaign = asyncio.run(_read_saved_campaign(test_session_factory, campaign_id))
    assert saved_campaign is not None
    overlay_blob = saved_campaign.get_overlay()
    assert isinstance(overlay_blob, dict)
    assert overlay_blob.get('id') == room_overlay_id
    assert overlay_blob.get('metadata', {}).get('story_context') == narrative

    overlay_api.delete_overlay(room_overlay_id)

    resume_res = client.post(
        '/api/campaign/resume',
        headers=auth_headers,
        json={'campaign_id': campaign_id, 'player_name': 'Host'},
    )
    assert resume_res.status_code == 200
    resume_payload = resume_res.json()

    assert isinstance(resume_payload.get('overlay'), dict)
    resumed_overlay = resume_payload['overlay']
    resumed_room_code = resume_payload['room_code']
    assert resumed_overlay.get('id') == f"overlay_room_{resumed_room_code}"
    assert resumed_overlay.get('map_id') == resumed_room_code
    assert resumed_overlay.get('metadata', {}).get('story_context') == narrative


def test_campaign_load_restores_overlay_into_existing_session_room(isolated_api_client) -> None:
    client, _test_session_factory = isolated_api_client

    username = f"integration_{uuid.uuid4().hex[:10]}"
    password = 'testpass123'

    auth_res = client.post('/api/auth/register', json={'username': username, 'password': password})
    assert auth_res.status_code == 200
    token = auth_res.json()['token']
    auth_headers = {'Authorization': f'Bearer {token}'}

    source_session_res = client.post('/api/session/create', json={'player_name': 'SourceHost'})
    assert source_session_res.status_code == 200
    source_room_code = source_session_res.json()['room_code']

    source_overlay_id = f'overlay_room_{source_room_code}'
    narrative = 'ancient temple ruins with cursed fog and moss'

    generate_res = client.post(
        '/api/overlays/generate',
        json={
            'narrative': narrative,
            'overlay_id': source_overlay_id,
            'overlay_name': 'Source Room Overlay',
            'room_code': source_room_code,
            'replace': True,
        },
    )
    assert generate_res.status_code == 200
    assert generate_res.json().get('overlay', {}).get('id') == source_overlay_id

    save_res = client.post(
        '/api/campaign/save',
        headers=auth_headers,
        json={'room_code': source_room_code, 'campaign_name': 'Load Overlay Campaign'},
    )
    assert save_res.status_code == 200
    campaign_id = save_res.json()['campaign_id']

    overlay_api.delete_overlay(source_overlay_id)

    destination_session_res = client.post('/api/session/create', json={'player_name': 'DestinationHost'})
    assert destination_session_res.status_code == 200
    destination_room_code = destination_session_res.json()['room_code']

    load_res = client.post(
        '/api/campaign/load',
        json={
            'campaign_id': campaign_id,
            'room_code': destination_room_code,
        },
    )
    assert load_res.status_code == 200
    load_payload = load_res.json()

    assert load_payload.get('loaded') is True
    loaded_overlay = load_payload.get('overlay')
    assert isinstance(loaded_overlay, dict)
    assert loaded_overlay.get('id') == f'overlay_room_{destination_room_code}'
    assert loaded_overlay.get('map_id') == destination_room_code
    assert loaded_overlay.get('metadata', {}).get('story_context') == narrative

    get_session_res = client.get(f'/api/session/{destination_room_code}')
    assert get_session_res.status_code == 200
    session_payload = get_session_res.json()
    session_overlay = session_payload.get('overlay')
    assert isinstance(session_overlay, dict)
    assert session_overlay.get('id') == f'overlay_room_{destination_room_code}'
