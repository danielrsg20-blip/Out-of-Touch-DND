"""Build a vector overlay payload from legacy grid map data.

This module provides a compatibility bridge so campaigns with only map_json
can still load into the vector draw pipeline, and new saves can persist a
canonical vector scene graph.
"""

from __future__ import annotations

from collections import deque
from typing import Any

TILE_SIZE = 32

_TILE_FILL = {
    "floor": "#394257",
    "wall": "#1d2232",
    "door": "#8a6f46",
    "water": "#2c5f91",
    "pit": "#17171d",
    "pillar": "#565a6f",
    "stairs_up": "#3c6f4a",
    "stairs_down": "#6a4f40",
    "chest": "#7f6a2f",
    "rubble": "#4d4b41",
}

_TILE_STROKE = {
    "wall": "#0f1320",
    "water": "#1b456f",
    "pit": "#07080c",
}


def _tile_points(x: int, y: int) -> list[dict[str, float]]:
    px = float(x * TILE_SIZE)
    py = float(y * TILE_SIZE)
    return [
        {"x": px, "y": py},
        {"x": px + TILE_SIZE, "y": py},
        {"x": px + TILE_SIZE, "y": py + TILE_SIZE},
        {"x": px, "y": py + TILE_SIZE},
    ]


def _circle_points(cx: float, cy: float, radius: float, segments: int = 12) -> list[dict[str, float]]:
    import math

    out: list[dict[str, float]] = []
    for i in range(segments):
        angle = (2.0 * math.pi * i) / max(segments, 3)
        out.append({"x": cx + math.cos(angle) * radius, "y": cy + math.sin(angle) * radius})
    return out


def _walkable(tile_type: str) -> bool:
    return tile_type in {"floor", "door", "stairs_up", "stairs_down"}


def _room_components(tiles: list[dict[str, Any]]) -> list[list[tuple[int, int]]]:
    tile_by_key: dict[tuple[int, int], str] = {}
    for tile in tiles:
        try:
            key = (int(tile.get("x", 0)), int(tile.get("y", 0)))
            tile_by_key[key] = str(tile.get("type", "floor"))
        except Exception:
            continue

    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []

    for (x, y), tile_type in tile_by_key.items():
        if not _walkable(tile_type) or (x, y) in visited:
            continue

        queue: deque[tuple[int, int]] = deque([(x, y)])
        visited.add((x, y))
        comp: list[tuple[int, int]] = []

        while queue:
            cx, cy = queue.popleft()
            comp.append((cx, cy))

            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if (nx, ny) in visited:
                    continue
                ntype = tile_by_key.get((nx, ny))
                if not ntype or not _walkable(ntype):
                    continue
                visited.add((nx, ny))
                queue.append((nx, ny))

        if len(comp) >= 6:
            components.append(comp)

    components.sort(key=len, reverse=True)
    return components


def _entity_color(entity_type: str) -> str:
    if entity_type == "pc":
        return "#3f86cf"
    if entity_type == "enemy":
        return "#c94e4e"
    if entity_type == "object":
        return "#b48c42"
    return "#4ca36f"


def _label_element(
    *,
    label_id: str,
    parent_id: str,
    text: str,
    x: float,
    y: float,
    dm_only: bool,
    tags: list[str],
) -> dict[str, Any]:
    return {
        "type": "text",
        "id": label_id,
        "name": f"{text} label",
        "parent_object_id": parent_id,
        "position": {"x": x, "y": y},
        "text": text,
        "color": "#f4f6fb" if not dm_only else "#ffd9d9",
        "font_size": 10,
        "outline_color": "rgba(8, 10, 16, 0.82)" if not dm_only else "rgba(20, 6, 6, 0.9)",
        "outline_width": 2,
        "chip_color": "rgba(5, 8, 13, 0.42)" if not dm_only else "rgba(54, 18, 18, 0.5)",
        "chip_padding": 2,
        "dm_only": dm_only,
        "visible": not dm_only,
        "scale_with_zoom": True,
        "min_screen_px": 8,
        "max_screen_px": 15,
        "tags": tags,
    }


def build_overlay_payload_from_map(
    map_data: dict[str, Any],
    *,
    overlay_id: str,
    map_id: str | None,
    overlay_name: str,
) -> dict[str, Any]:
    tiles = list(map_data.get("tiles") or [])
    entities = list(map_data.get("entities") or [])
    metadata_raw = map_data.get("metadata")
    metadata: dict[str, Any] = metadata_raw if isinstance(metadata_raw, dict) else {}

    base_tile_elements: list[dict[str, Any]] = []
    token_elements: list[dict[str, Any]] = []
    label_elements: list[dict[str, Any]] = []

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tile_type = str(tile.get("type", "floor"))

        region_id = f"tile_{x}_{y}"
        base_tile_elements.append(
            {
                "type": "polygon",
                "id": region_id,
                "name": f"{tile_type}_{x}_{y}",
                "points": _tile_points(x, y),
                "fill": {"color": _TILE_FILL.get(tile_type, "#2f3548")},
                "fill_opacity": 0.9 if tile_type == "floor" else 1.0,
                "stroke": {
                    "color": _TILE_STROKE.get(tile_type, "rgba(255, 255, 255, 0.08)"),
                    "width": 0.5 if tile_type == "floor" else 1.0,
                },
                "tags": ["tile", tile_type],
            }
        )

        if tile_type in {"door", "stairs_up", "stairs_down"}:
            text = "Door" if tile_type == "door" else "Stairs Up" if tile_type == "stairs_up" else "Stairs Down"
            label_elements.append(
                _label_element(
                    label_id=f"label_tile_{x}_{y}",
                    parent_id=region_id,
                    text=text,
                    x=float(x * TILE_SIZE + TILE_SIZE * 0.5),
                    y=float(y * TILE_SIZE + TILE_SIZE * 0.52),
                    dm_only=False,
                    tags=["generated_label", tile_type],
                )
            )

    for entity in entities:
        entity_id = str(entity.get("id", "entity"))
        entity_name = str(entity.get("name", entity_id))
        entity_type = str(entity.get("type", "npc"))
        x = int(entity.get("x", 0))
        y = int(entity.get("y", 0))

        cx = float(x * TILE_SIZE + TILE_SIZE * 0.5)
        cy = float(y * TILE_SIZE + TILE_SIZE * 0.5)

        token_id = f"entity_{entity_id}"
        token_elements.append(
            {
                "type": "polygon",
                "id": token_id,
                "name": entity_name,
                "points": _circle_points(cx, cy, TILE_SIZE * 0.33),
                "fill": {"color": _entity_color(entity_type)},
                "fill_opacity": 0.92,
                "stroke": {"color": "rgba(9, 12, 18, 0.9)", "width": 1.5},
                "tags": ["token", entity_type],
            }
        )

        lname = entity_name.lower()
        is_trap = "trap" in lname
        is_secret_door = "secret" in lname and "door" in lname
        if entity_type == "object" and (is_trap or is_secret_door):
            label_elements.append(
                _label_element(
                    label_id=f"label_entity_{entity_id}",
                    parent_id=token_id,
                    text="Secret Door" if is_secret_door else "Trap",
                    x=cx,
                    y=cy - TILE_SIZE * 0.62,
                    dm_only=True,
                    tags=["generated_label", "dm_only"],
                )
            )

    for i, component in enumerate(_room_components(tiles), start=1):
        avg_x = sum(x for x, _ in component) / len(component)
        avg_y = sum(y for _, y in component) / len(component)
        label_elements.append(
            {
                "type": "text",
                "id": f"label_room_{i}",
                "name": f"Room {i}",
                "parent_object_id": f"room_{i}",
                "position": {
                    "x": avg_x * TILE_SIZE + TILE_SIZE * 0.5,
                    "y": avg_y * TILE_SIZE + TILE_SIZE * 0.5,
                },
                "text": f"Room {i}",
                "color": "#f6f7fb",
                "font_size": 11,
                "outline_color": "rgba(8, 10, 16, 0.8)",
                "outline_width": 2,
                "chip_color": "rgba(7, 11, 18, 0.45)",
                "chip_padding": 3,
                "dm_only": False,
                "visible": True,
                "scale_with_zoom": True,
                "min_screen_px": 9,
                "max_screen_px": 16,
                "tags": ["room_label"],
            }
        )

    return {
        "id": overlay_id,
        "name": overlay_name,
        "version": "1.0",
        "created_at": metadata.get("created_at") if isinstance(metadata.get("created_at"), str) else None,
        "map_id": map_id,
        "metadata": {
            "vectorized_from_map": True,
            "label_mode": {
                "showLabels": True,
                "showDmOnlyLabels": False,
            },
        },
        "styles": {
            "default": {
                "id": "default",
                "name": "Default Style",
                "palette": {
                    "primary": "#3a3a3a",
                    "secondary": "#8b8b8b",
                    "accent_1": "#ff6b35",
                    "accent_2": "#4ecdc4",
                    "accent_3": "#95e1d3",
                },
                "noise_seed": 0,
                "edge_feathering": 3.0,
                "jitter": 0.1,
                "decal_library": {},
            }
        },
        "layers": [
            {
                "id": "layer_vector_base_tiles",
                "name": "VectorBaseTiles",
                "z_index": 5,
                "visible": True,
                "blend_mode": "normal",
                "opacity": 1.0,
                "elements": base_tile_elements,
                "clipped_to_bounds": True,
            },
            {
                "id": "layer_vector_base_tokens",
                "name": "VectorBaseTokens",
                "z_index": 25,
                "visible": True,
                "blend_mode": "normal",
                "opacity": 1.0,
                "elements": token_elements,
                "clipped_to_bounds": True,
            },
            {
                "id": "layer_vector_base_labels",
                "name": "VectorBaseLabels",
                "z_index": 35,
                "visible": True,
                "blend_mode": "normal",
                "opacity": 1.0,
                "elements": label_elements,
                "clipped_to_bounds": True,
            },
        ],
    }
