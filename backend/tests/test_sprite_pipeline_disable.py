from app.map_catalog import build_automated_map
from app.map_catalog import MapSelectionRequest
from app.tools import ToolDispatcher
from app.tools import _LEGACY_SPRITE_PIPELINE_ENABLED


def test_generated_map_has_no_tile_sprite_fields_when_legacy_disabled() -> None:
    if _LEGACY_SPRITE_PIPELINE_ENABLED:
        return

    req: MapSelectionRequest = {
        "description": "A damp crypt with collapsed passages",
        "environment": "dungeon",
        "terrain_theme": "ruined",
        "encounter_type": "exploration",
        "encounter_scale": "small",
        "width": 20,
        "height": 15,
        "seed": 4242,
    }
    generated = build_automated_map(req)

    for tile in generated.get("tiles", []):
        assert "sprite" not in tile
        assert "variant" not in tile

    for entity in generated.get("entities", []):
        sprite = str(entity.get("sprite", "")).strip().lower()
        assert sprite in {"", "default"}


def test_tool_generate_map_strips_manual_sprite_payload_when_legacy_disabled() -> None:
    if _LEGACY_SPRITE_PIPELINE_ENABLED:
        return

    dispatcher = ToolDispatcher({}, None, None)
    result = dispatcher.dispatch(
        "generate_map",
        {
            "description": "Manual map payload with legacy sprite keys",
            "environment": "dungeon",
            "terrain_theme": "ancient",
            "encounter_type": "exploration",
            "encounter_scale": "small",
            "width": 8,
            "height": 6,
            "tiles": [
                {"x": 0, "y": 0, "type": "floor", "sprite": "env:floor_01", "variant": "worn"},
                {"x": 1, "y": 0, "type": "wall", "sprite": "env:wall_01", "variant": "cracked"},
            ],
            "entities": [
                {"id": "crate_1", "name": "Crate", "x": 2, "y": 2, "type": "object", "sprite": "prop:crate_wood"},
            ],
        },
    )

    assert "error" not in result

    for tile in result.get("tiles", []):
        assert "sprite" not in tile
        assert "variant" not in tile

    for entity in result.get("entities", []):
        sprite = str(entity.get("sprite", "")).strip().lower()
        assert sprite in {"", "default"}

    metadata = result.get("metadata", {})
    assert metadata.get("sprite_pipeline_enabled") is False
    assert metadata.get("sprite_render_verification") == "assert_sprite_free"
    removed = metadata.get("sprite_fields_removed", {})
    assert removed.get("tile_sprite", 0) >= 1
    assert removed.get("tile_variant", 0) >= 1
    assert removed.get("entity_sprite", 0) >= 1