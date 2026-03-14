import json
import uuid

from app.overlay_api import overlay_api


def _build_generated_overlay_payload(overlay_id: str) -> dict:
    overlay_api.create_overlay(overlay_id, "Persistence Test", map_id="source-map")
    overlay_api.generate_from_narrative(
        overlay_id=overlay_id,
        narrative="battle in a cursed winter ruin",
        map_context={"width": 20, "height": 15, "tile_size": 32},
        replace=True,
    )
    payload = overlay_api.save_overlay_to_json(overlay_id)
    assert payload
    decoded = json.loads(payload)
    assert isinstance(decoded, dict)
    return decoded


def _restore_payload_to_room(room_code: str, overlay_payload: dict) -> dict:
    restored = dict(overlay_payload)
    restored["id"] = f"overlay_room_{room_code}"
    restored["map_id"] = room_code
    loaded = overlay_api.load_overlay_from_json(
        json.dumps(restored),
        overlay_id=restored["id"],
    )
    assert loaded is not None
    payload = overlay_api.save_overlay_to_json(loaded.id)
    assert payload
    decoded = json.loads(payload)
    assert isinstance(decoded, dict)
    return decoded


def test_overlay_payload_round_trip_through_campaign_json_blob() -> None:
    source_overlay_id = f"overlay_src_{uuid.uuid4().hex[:8]}"
    payload = _build_generated_overlay_payload(source_overlay_id)

    # Simulate campaign.overlay_json storage/retrieval without DB model imports.
    overlay_json_blob = json.dumps(payload)
    recovered = json.loads(overlay_json_blob)

    assert recovered is not None
    assert recovered.get("metadata", {}).get("story_context") == "battle in a cursed winter ruin"
    assert isinstance(recovered.get("layers"), list)
    assert sum(len(layer.get("elements", [])) for layer in recovered.get("layers", [])) > 0

    overlay_api.delete_overlay(source_overlay_id)


def test_restore_overlay_rebinds_payload_to_room_scope() -> None:
    source_overlay_id = f"overlay_src_{uuid.uuid4().hex[:8]}"
    room_code = f"ROOM{uuid.uuid4().hex[:6].upper()}"
    payload = _build_generated_overlay_payload(source_overlay_id)

    restored = _restore_payload_to_room(room_code, payload)
    assert restored is not None
    assert restored.get("id") == f"overlay_room_{room_code}"
    assert restored.get("map_id") == room_code

    room_payload_raw = overlay_api.save_overlay_to_json(f"overlay_room_{room_code}")
    assert room_payload_raw
    room_payload = json.loads(room_payload_raw)
    assert room_payload is not None
    assert room_payload.get("id") == f"overlay_room_{room_code}"
    assert sum(len(layer.get("elements", [])) for layer in room_payload.get("layers", [])) > 0

    overlay_api.delete_overlay(source_overlay_id)
    overlay_api.delete_overlay(f"overlay_room_{room_code}")
