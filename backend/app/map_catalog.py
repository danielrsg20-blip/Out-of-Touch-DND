from __future__ import annotations

import hashlib
import json
import logging
import random
from collections import OrderedDict, deque
from pathlib import Path
from typing import Any, TypedDict, cast

from .config import LOCAL_MOCK_MODE, MAP_PACK_VALIDATION_MODE
from .maps.license_validation import validate_map_library_manifest


class MapLibraryEntry(TypedDict):
    id: str
    name: str
    environment: str
    encounter_types: list[str]
    size_class: str
    difficulty: str
    tags: list[str]
    layout: str
    width: int
    height: int
    pack_id: str
    image_url: str
    image_opacity: float
    license: str | dict[str, Any]
    source: str
    source_url: str
    author: str
    attribution_text: str
    requires_attribution: bool


class MapSelectionRequest(TypedDict, total=False):
    description: str
    environment: str
    encounter_type: str
    encounter_scale: str
    tactical_tags: list[str]
    width: int
    height: int


class NormalizedMapSelectionRequest(TypedDict):
    description: str
    environment: str
    encounter_type: str
    encounter_scale: str
    tactical_tags: list[str]
    width: int
    height: int


_MAP_LIBRARY_PATH = Path(__file__).resolve().parent / "maps" / "data" / "map_library.json"
_GENERATED_MAP_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_GENERATED_CACHE_LIMIT = 64
logger = logging.getLogger(__name__)

_ENV_KEYWORDS: dict[str, list[str]] = {
    "dungeon": ["dungeon", "crypt", "ruin", "catacomb", "vault", "corridor"],
    "forest": ["forest", "woods", "grove", "thicket", "tree"],
    "tavern": ["tavern", "inn", "alehouse", "pub"],
    "cave": ["cave", "cavern", "underground", "grotto"],
    "city": ["city", "street", "market", "plaza", "alley", "town"],
}

_ENCOUNTER_KEYWORDS: dict[str, list[str]] = {
    "combat": ["attack", "fight", "battle", "ambush", "enemy", "combat"],
    "exploration": ["explore", "search", "scout", "travel", "investigate"],
    "social": ["talk", "parley", "negotiate", "meet", "speak", "social"],
}


def _load_library() -> list[MapLibraryEntry]:
    with _MAP_LIBRARY_PATH.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    packs = payload.get("packs", [])
    pack_by_id = {
        str(pack.get("id", "")): pack
        for pack in packs
        if isinstance(pack, dict) and str(pack.get("id", "")).strip()
    }

    enriched: list[MapLibraryEntry] = []
    for raw_entry in payload.get("maps", []):
        if not isinstance(raw_entry, dict):
            continue

        entry = dict(raw_entry)
        pack = pack_by_id.get(str(entry.get("pack_id", "")), {})
        pack_license = pack.get("license", {}) if isinstance(pack, dict) else {}

        if "license" not in entry and isinstance(pack_license, dict):
            entry["license"] = dict(pack_license)
        if "author" not in entry and isinstance(pack_license, dict):
            entry["author"] = str(pack_license.get("author", "Unknown"))
        if "source_url" not in entry and isinstance(pack_license, dict):
            entry["source_url"] = str(pack_license.get("source_url", ""))
        if "requires_attribution" not in entry and isinstance(pack_license, dict):
            entry["requires_attribution"] = bool(pack_license.get("attribution_required", False))
        if "attribution_text" not in entry and isinstance(pack_license, dict):
            entry["attribution_text"] = str(pack_license.get("attribution_text", ""))

        enriched.append(cast(MapLibraryEntry, entry))

    return enriched


def validate_map_catalog_startup() -> None:
    mode = MAP_PACK_VALIDATION_MODE
    if mode not in {"off", "warn", "error"}:
        logger.warning("Unknown MAP_PACK_VALIDATION_MODE '%s'; defaulting to warn", mode)
        mode = "warn"

    if mode == "off":
        logger.info("Map pack validation is disabled")
        return

    errors = validate_map_library_manifest(_MAP_LIBRARY_PATH)
    if not errors:
        logger.info("Map pack validation passed (%s)", _MAP_LIBRARY_PATH)
        return

    if mode == "error":
        raise RuntimeError("Map pack validation failed:\n" + "\n".join(f"- {e}" for e in errors))

    logger.warning("Map pack validation found %d issue(s):", len(errors))
    for issue in errors:
        logger.warning("- %s", issue)


def _resolve_license(entry: MapLibraryEntry) -> dict[str, Any]:
    raw_license = entry.get("license")
    if isinstance(raw_license, dict):
        return {
            "spdx": str(raw_license.get("spdx", "")),
            "author": str(raw_license.get("author", entry.get("author", "Unknown"))),
            "source_url": str(raw_license.get("source_url", entry.get("source_url", ""))),
            "attribution_required": bool(raw_license.get("attribution_required", entry.get("requires_attribution", False))),
            "attribution_text": str(raw_license.get("attribution_text", entry.get("attribution_text", ""))),
        }

    return {
        "spdx": str(raw_license or ""),
        "author": str(entry.get("author", "Unknown")),
        "source_url": str(entry.get("source_url", "")),
        "attribution_required": bool(entry.get("requires_attribution", False)),
        "attribution_text": str(entry.get("attribution_text", "")),
    }


def _infer_environment(description: str) -> str:
    lowered = description.lower()
    for env, keywords in _ENV_KEYWORDS.items():
        if any(k in lowered for k in keywords):
            return env
    return "dungeon"


def _infer_encounter_type(description: str) -> str:
    lowered = description.lower()
    for encounter_type, keywords in _ENCOUNTER_KEYWORDS.items():
        if any(k in lowered for k in keywords):
            return encounter_type
    return "exploration"


def _infer_scale(width: int, height: int) -> str:
    area = width * height
    if area <= 225:
        return "small"
    if area <= 525:
        return "medium"
    return "large"


def _normalize_request(raw: MapSelectionRequest) -> NormalizedMapSelectionRequest:
    description = raw.get("description", "")
    width = max(8, min(48, int(raw.get("width", 20))))
    height = max(8, min(36, int(raw.get("height", 15))))

    environment = (raw.get("environment") or _infer_environment(description)).strip().lower()
    encounter_type = (raw.get("encounter_type") or _infer_encounter_type(description)).strip().lower()
    encounter_scale = (raw.get("encounter_scale") or _infer_scale(width, height)).strip().lower()
    tactical_tags = [t.strip().lower() for t in raw.get("tactical_tags", []) if str(t).strip()]

    return {
        "description": description,
        "environment": environment,
        "encounter_type": encounter_type,
        "encounter_scale": encounter_scale,
        "tactical_tags": tactical_tags,
        "width": width,
        "height": height,
    }


def _score_entry(entry: MapLibraryEntry, request: NormalizedMapSelectionRequest) -> int:
    score = 0
    if entry["environment"] == request["environment"]:
        score += 4
    if request["encounter_type"] in entry["encounter_types"]:
        score += 3
    if entry["size_class"] == request["encounter_scale"]:
        score += 2

    tags = set(entry.get("tags", []))
    for tag in request.get("tactical_tags", []):
        if tag in tags:
            score += 1

    return score


def _pick_library_entry(request: NormalizedMapSelectionRequest, library: list[MapLibraryEntry]) -> tuple[MapLibraryEntry | None, int]:
    scored = [(entry, _score_entry(entry, request)) for entry in library]
    if not scored:
        return None, 0

    if LOCAL_MOCK_MODE:
        eligible = [entry for entry, score in scored if score >= 4]
        if not eligible:
            eligible = [entry for entry, _score in scored]
        return random.choice(eligible), 0

    scored.sort(key=lambda item: item[1], reverse=True)
    best_entry, best_score = scored[0]
    return best_entry, best_score


def _empty_map(width: int, height: int) -> list[dict[str, Any]]:
    tiles: list[dict[str, Any]] = []
    for y in range(height):
        for x in range(width):
            border = x == 0 or y == 0 or x == width - 1 or y == height - 1
            tile_type = "wall" if border else "floor"
            tiles.append({"x": x, "y": y, "type": tile_type})
    return tiles


def _tile_map(tiles: list[dict[str, Any]]) -> dict[tuple[int, int], str]:
    return {(int(t["x"]), int(t["y"])): str(t["type"]) for t in tiles}


def _apply_rect_wall(tiles_by_pos: dict[tuple[int, int], str], x1: int, y1: int, x2: int, y2: int) -> None:
    for x in range(x1, x2 + 1):
        tiles_by_pos[(x, y1)] = "wall"
        tiles_by_pos[(x, y2)] = "wall"
    for y in range(y1, y2 + 1):
        tiles_by_pos[(x1, y)] = "wall"
        tiles_by_pos[(x2, y)] = "wall"


def _apply_layout(layout: str, width: int, height: int, rng: random.Random) -> list[dict[str, Any]]:
    tiles_by_pos = _tile_map(_empty_map(width, height))

    if layout == "room_cluster":
        _apply_rect_wall(tiles_by_pos, 3, 3, width // 2, height // 2)
        _apply_rect_wall(tiles_by_pos, width // 2 - 1, height // 2 - 1, width - 4, height - 4)
        tiles_by_pos[(width // 2, 3)] = "door"
        tiles_by_pos[(width // 2 - 1, height // 2)] = "door"

    elif layout == "crossroads":
        for y in range(1, height - 1):
            for x in range(1, width - 1):
                if abs(x - width // 2) <= 1 or abs(y - height // 2) <= 1:
                    tiles_by_pos[(x, y)] = "floor"
                elif rng.random() < 0.15:
                    tiles_by_pos[(x, y)] = "wall"

    elif layout == "forest":
        for y in range(1, height - 1):
            for x in range(1, width - 1):
                if rng.random() < 0.12:
                    tiles_by_pos[(x, y)] = "pillar"
                if rng.random() < 0.05:
                    tiles_by_pos[(x, y)] = "water"

    elif layout == "cave":
        for y in range(1, height - 1):
            for x in range(1, width - 1):
                noise = rng.random()
                if noise < 0.18:
                    tiles_by_pos[(x, y)] = "wall"
                elif noise < 0.23:
                    tiles_by_pos[(x, y)] = "rubble"

    elif layout == "tavern":
        for y in range(2, height - 2, 3):
            for x in range(3, width - 3, 4):
                tiles_by_pos[(x, y)] = "pillar"
        tiles_by_pos[(width // 2, 0)] = "door"

    return [{"x": x, "y": y, "type": tile_type} for (x, y), tile_type in tiles_by_pos.items()]


def _is_walkable(tile_type: str) -> bool:
    return tile_type not in {"wall", "door_closed", "pillar", "pit", "rubble"}


def _is_valid_layout(width: int, height: int, tiles: list[dict[str, Any]]) -> bool:
    by_pos = _tile_map(tiles)
    walkable = [(x, y) for (x, y), tile_type in by_pos.items() if _is_walkable(tile_type)]
    if len(walkable) < max(20, (width * height) // 6):
        return False

    start = walkable[0]
    visited = {start}
    queue: deque[tuple[int, int]] = deque([start])

    while queue:
        cx, cy = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if (nx, ny) in visited:
                continue
            tile_type = by_pos.get((nx, ny), "wall")
            if not _is_walkable(tile_type):
                continue
            visited.add((nx, ny))
            queue.append((nx, ny))

    return len(visited) >= int(len(walkable) * 0.7)


def _build_from_library(entry: MapLibraryEntry, request: NormalizedMapSelectionRequest, rng: random.Random) -> dict[str, Any]:
    width = int(request["width"])
    height = int(request["height"])
    tiles = _apply_layout(entry["layout"], width, height, rng)

    if not _is_valid_layout(width, height, tiles):
        tiles = _empty_map(width, height)

    license_info = _resolve_license(entry)

    return {
        "width": width,
        "height": height,
        "tiles": tiles,
        "entities": [],
        "metadata": {
            "map_id": entry["id"],
            "map_source": "library",
            "environment": entry["environment"],
            "encounter_type": request["encounter_type"],
            "encounter_scale": request["encounter_scale"],
            "difficulty": entry["difficulty"],
            "license": license_info.get("spdx", ""),
            "license_spdx": license_info.get("spdx", ""),
            "author": license_info.get("author", "Unknown"),
            "source_url": license_info.get("source_url", ""),
            "attribution_required": bool(license_info.get("attribution_required", False)),
            "attribution_text": str(license_info.get("attribution_text", "")),
            "library_source": entry["source"],
            "pack_id": entry.get("pack_id", ""),
            "tactical_tags": entry.get("tags", []),
            "grid_size": 5,
            "grid_units": "ft",
            "image_url": entry.get("image_url", ""),
            "image_opacity": float(entry.get("image_opacity", 0.85)),
        },
    }


def _generate_dynamic(request: NormalizedMapSelectionRequest, rng: random.Random) -> dict[str, Any]:
    width = int(request["width"])
    height = int(request["height"])
    tactical_tags = request.get("tactical_tags", [])

    layout = "room_cluster"
    if request["environment"] in {"forest", "city"}:
        layout = "crossroads"
    if request["environment"] == "cave":
        layout = "cave"
    if request["environment"] == "tavern":
        layout = "tavern"
    if "cover" in tactical_tags and layout != "forest":
        layout = "forest"

    best_tiles = _empty_map(width, height)
    for _ in range(4):
        tiles = _apply_layout(layout, width, height, rng)
        if _is_valid_layout(width, height, tiles):
            best_tiles = tiles
            break

    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "description": request["description"],
                "environment": request["environment"],
                "encounter_type": request["encounter_type"],
                "encounter_scale": request["encounter_scale"],
                "width": width,
                "height": height,
                "tags": tactical_tags,
            },
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:12]

    return {
        "width": width,
        "height": height,
        "tiles": best_tiles,
        "entities": [],
        "metadata": {
            "map_id": f"gen_{fingerprint}",
            "map_source": "generated",
            "environment": request["environment"],
            "encounter_type": request["encounter_type"],
            "encounter_scale": request["encounter_scale"],
            "tactical_tags": tactical_tags,
            "grid_size": 5,
            "grid_units": "ft",
        },
    }


def _cache_key(request: NormalizedMapSelectionRequest) -> str:
    serialized = json.dumps(request, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_automated_map(raw_request: MapSelectionRequest) -> dict[str, Any]:
    request = _normalize_request(raw_request)
    library = _load_library()

    cache_key = _cache_key(request)
    if cache_key in _GENERATED_MAP_CACHE:
        cached = _GENERATED_MAP_CACHE[cache_key]
        metadata = dict(cached.get("metadata", {}))
        metadata["cache_hit"] = True
        return {
            "width": cached["width"],
            "height": cached["height"],
            "tiles": [dict(t) for t in cached["tiles"]],
            "entities": [dict(e) for e in cached.get("entities", [])],
            "metadata": metadata,
        }

    picked, score = _pick_library_entry(request, library)
    rng_seed = int(hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:8], 16)
    rng = random.Random(rng_seed)

    if LOCAL_MOCK_MODE:
        if picked is None:
            result = _generate_dynamic(request, rng)
        else:
            result = _build_from_library(picked, request, rng)
    else:
        if picked and score >= 6:
            result = _build_from_library(picked, request, rng)
        else:
            result = _generate_dynamic(request, rng)

    metadata = dict(result.get("metadata", {}))
    metadata["cache_hit"] = False
    result["metadata"] = metadata

    _GENERATED_MAP_CACHE[cache_key] = result
    while len(_GENERATED_MAP_CACHE) > _GENERATED_CACHE_LIMIT:
        _GENERATED_MAP_CACHE.popitem(last=False)

    return {
        "width": result["width"],
        "height": result["height"],
        "tiles": [dict(t) for t in result["tiles"]],
        "entities": [dict(e) for e in result.get("entities", [])],
        "metadata": metadata,
    }
