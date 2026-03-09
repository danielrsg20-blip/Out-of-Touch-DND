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


class TerrainAtlasEntry(TypedDict):
    x: int
    y: int
    tileSize: int
    label: str


_MAP_LIBRARY_PATH = Path(__file__).resolve().parent / "maps" / "data" / "map_library.json"
_TERRAIN_ATLAS_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "sprites"
    / "Environment"
    / "Terrain_and_Props.json"
)
_GENERATED_MAP_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_GENERATED_CACHE_LIMIT = 64
_TERRAIN_ATLAS_CACHE: list[TerrainAtlasEntry] | None = None
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

_TILE_LABEL_KEYWORDS: dict[str, list[str]] = {
    "floor": [
        "grass", "dirt", "earth", "sand", "path", "road", "trail",
        "soil", "stone", "cobble", "moss", "mud", "ground", "wood", "brick",
    ],
    "wall": [
        "brick", "stone", "hedge", "tree", "cliff", "rock", "fence", "wood",
    ],
    "door": ["door", "gate", "archway", "portcullis", "entrance"],
    "water": ["water", "river", "pond", "stream", "pool", "swamp"],
    "pit": ["pit", "chasm", "hole", "void", "lava"],
    "pillar": ["pillar", "column", "statue", "stalagmite", "boulder", "rock", "crystal"],
    "rubble": ["rubble", "debris", "ruin", "bones", "broken", "wreckage"],
    "stairs_up": ["stairs up", "stair up", "ladder up", "upstairs"],
    "stairs_down": ["stairs down", "stair down", "ladder down", "downstairs"],
    "chest": ["chest", "crate", "barrel", "cache", "treasure"],
}

_ENV_THEME_KEYWORDS: dict[str, list[str]] = {
    "forest": ["grass", "forest", "tree", "moss", "dirt", "log", "bush", "nature"],
    "cave": ["cave", "rock", "stone", "crystal", "stalagmite", "mushroom"],
    "tavern": ["wood", "plank", "table", "barrel", "crate", "floor"],
    "city": ["stone", "road", "cobble", "brick", "paved"],
    "dungeon": ["dungeon", "crypt", "stone", "brick", "tile", "rubble", "bones"],
}

_PROP_CATEGORY_RULES: dict[str, dict[str, Any]] = {
    "obstacle": {
        "blocks_movement": True,
        "keywords": [
            "tree", "bush", "log", "rock", "boulder", "pillar", "column",
            "stalagmite", "crate", "barrel", "chest", "table", "chair", "tomb",
            "urn", "statue", "anvil", "cart",
        ],
    },
    "decorative": {
        "blocks_movement": False,
        "keywords": [
            "torch", "bones", "mushroom", "flower", "grass", "banner", "candle",
            "lantern", "blood", "skull", "rune", "mark", "moss", "vines",
        ],
    },
}


def _normalize_label(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").split())


def _load_terrain_atlas() -> list[TerrainAtlasEntry]:
    global _TERRAIN_ATLAS_CACHE
    if _TERRAIN_ATLAS_CACHE is not None:
        return _TERRAIN_ATLAS_CACHE

    try:
        with _TERRAIN_ATLAS_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except FileNotFoundError:
        logger.warning("Terrain atlas JSON missing at %s", _TERRAIN_ATLAS_PATH)
        _TERRAIN_ATLAS_CACHE = []
        return _TERRAIN_ATLAS_CACHE
    except json.JSONDecodeError as exc:
        logger.warning("Terrain atlas JSON invalid: %s", exc)
        _TERRAIN_ATLAS_CACHE = []
        return _TERRAIN_ATLAS_CACHE

    entries: list[TerrainAtlasEntry] = []
    if isinstance(payload, list):
        for row in payload:
            if not isinstance(row, dict):
                continue
            label = str(row.get("label", "")).strip()
            if not label:
                continue
            try:
                x = int(row.get("x", 0))
                y = int(row.get("y", 0))
                tile_size = int(row.get("tileSize", 32))
            except (TypeError, ValueError):
                continue
            if tile_size <= 0:
                continue
            entries.append({"x": x, "y": y, "tileSize": tile_size, "label": label})

    _TERRAIN_ATLAS_CACHE = entries
    return _TERRAIN_ATLAS_CACHE


def _select_labels(entries: list[TerrainAtlasEntry], keywords: list[str], limit: int = 60) -> list[str]:
    matched: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        normalized = _normalize_label(entry["label"])
        if normalized in seen:
            continue
        if any(keyword in normalized for keyword in keywords):
            seen.add(normalized)
            matched.append(normalized)
            if len(matched) >= limit:
                break
    return matched


def _build_tile_sprite_palette(
    environment: str,
    description: str,
    mock_mode: bool,
    rng: random.Random,
) -> dict[str, list[str]]:
    entries = _load_terrain_atlas()
    if not entries:
        return {}

    env_key = environment if environment in _ENV_THEME_KEYWORDS else "dungeon"
    env_keywords = list(_ENV_THEME_KEYWORDS.get(env_key, []))
    lowered_description = description.lower()
    if "water" in lowered_description or "river" in lowered_description:
        env_keywords.extend(["water", "river", "pond"]) 

    base_theme = _select_labels(entries, env_keywords, limit=120)
    if not base_theme:
        base_theme = _select_labels(entries, ["stone", "floor", "dirt"], limit=120)

    # Floor and wall now intentionally share one "surface" pool so either can
    # draw from assets that were previously split by naming convention.
    surface_keywords = sorted(set(_TILE_LABEL_KEYWORDS["floor"] + _TILE_LABEL_KEYWORDS["wall"]))
    env_surface = [label for label in base_theme if any(keyword in label for keyword in surface_keywords)]
    global_surface = _select_labels(entries, surface_keywords, limit=160)
    shared_surface_candidates = env_surface if env_surface else global_surface
    if mock_mode and shared_surface_candidates:
        shuffled_surface = list(shared_surface_candidates)
        rng.shuffle(shuffled_surface)
        shared_surface_candidates = shuffled_surface[: max(2, min(8, len(shuffled_surface)))]

    palette: dict[str, list[str]] = {}
    if shared_surface_candidates:
        palette["floor"] = list(shared_surface_candidates)
        palette["wall"] = list(shared_surface_candidates)

    for tile_type, keywords in _TILE_LABEL_KEYWORDS.items():
        if tile_type in {"floor", "wall"}:
            continue
        env_filtered = [label for label in base_theme if any(keyword in label for keyword in keywords)]
        global_fallback = _select_labels(entries, keywords, limit=120)

        candidates = env_filtered if env_filtered else global_fallback
        if mock_mode and candidates:
            # Keep mock output coherent by constraining each tile type to a small variant set.
            shuffled = list(candidates)
            rng.shuffle(shuffled)
            candidates = shuffled[: max(1, min(4, len(shuffled)))]

        if candidates:
            palette[tile_type] = candidates

    return palette


def _assign_tile_sprites(
    tiles: list[dict[str, Any]],
    palette: dict[str, list[str]],
    rng: random.Random,
) -> list[dict[str, Any]]:
    if not palette:
        return [dict(tile) for tile in tiles]

    decorated: list[dict[str, Any]] = []
    for tile in tiles:
        tile_copy = dict(tile)
        tile_type = str(tile_copy.get("type", ""))
        candidates = palette.get(tile_type)
        if candidates:
            label = rng.choice(candidates)
            tile_copy["sprite"] = f"env:{label}"
        decorated.append(tile_copy)
    return decorated


def assign_terrain_atlas_sprites(
    raw_request: MapSelectionRequest,
    tiles: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Assign deterministic env: sprite labels to an existing tile grid.

    This is used when an upstream caller already produced tile geometry but still
    wants coherent terrain atlas visuals.
    """
    request = _normalize_request(raw_request)
    seed_payload = {
        "description": request["description"],
        "environment": request["environment"],
        "encounter_type": request["encounter_type"],
        "encounter_scale": request["encounter_scale"],
        "tactical_tags": request["tactical_tags"],
        "width": request["width"],
        "height": request["height"],
        "tile_count": len(tiles),
        "mode": "prebuilt",
    }
    seed = int(hashlib.sha256(json.dumps(seed_payload, sort_keys=True).encode("utf-8")).hexdigest()[:8], 16)
    rng = random.Random(seed)

    palette = _build_tile_sprite_palette(
        environment=request["environment"],
        description=request["description"],
        mock_mode=LOCAL_MOCK_MODE,
        rng=rng,
    )
    return _assign_tile_sprites(tiles, palette, rng)


def _spawn_environment_props(
    tiles: list[dict[str, Any]],
    environment: str,
    palette: dict[str, list[str]],
    rng: random.Random,
) -> list[dict[str, Any]]:
    entries = _load_terrain_atlas()
    if not entries:
        return []

    walkable = [
        (int(tile["x"]), int(tile["y"]))
        for tile in tiles
        if _is_walkable(str(tile.get("type", "wall")))
    ]
    if not walkable:
        return []

    occupied = set()
    floor_labels = set(palette.get("floor", []))
    env_keywords = _ENV_THEME_KEYWORDS.get(environment, _ENV_THEME_KEYWORDS["dungeon"])
    prop_keywords = ["tree", "bush", "rock", "log", "crate", "barrel", "torch", "bones", "mushroom", "urn"]
    if environment == "tavern":
        prop_keywords = ["barrel", "crate", "table", "chair", "torch"]
    elif environment == "cave":
        prop_keywords = ["rock", "crystal", "stalagmite", "mushroom", "bones"]

    prop_labels = []
    seen: set[str] = set()
    for entry in entries:
        label = _normalize_label(entry["label"])
        if label in seen or label in floor_labels:
            continue
        if any(k in label for k in prop_keywords) and any(k in label for k in env_keywords):
            seen.add(label)
            prop_labels.append(label)

    if not prop_labels:
        prop_labels = _select_labels(entries, prop_keywords, limit=24)
    if not prop_labels:
        return []

    rng.shuffle(walkable)
    count = max(2, min(12, len(walkable) // 45))
    entities: list[dict[str, Any]] = []
    for idx in range(count):
        if idx >= len(walkable):
            break
        x, y = walkable[idx]
        if (x, y) in occupied:
            continue
        occupied.add((x, y))
        label = rng.choice(prop_labels)
        prop_category, blocks_movement = _classify_prop_label(label)
        entities.append({
            "id": f"prop_auto_{idx}_{x}_{y}",
            "name": label,
            "x": x,
            "y": y,
            "type": "object",
            "sprite": f"env:{label}",
            "prop_category": prop_category,
            "blocks_movement": blocks_movement,
        })

    return entities


def _classify_prop_label(label: str) -> tuple[str, bool]:
    normalized = _normalize_label(label)

    for category, rule in _PROP_CATEGORY_RULES.items():
        keywords = [str(k) for k in rule.get("keywords", [])]
        if any(keyword in normalized for keyword in keywords):
            return category, bool(rule.get("blocks_movement", False))

    # Unknown labels default to decorative so we do not introduce accidental hard blockers.
    return "decorative", False


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

    palette = _build_tile_sprite_palette(
        environment=entry["environment"],
        description=request["description"],
        mock_mode=LOCAL_MOCK_MODE,
        rng=rng,
    )
    tiles = _assign_tile_sprites(tiles, palette, rng)
    entities = _spawn_environment_props(tiles, entry["environment"], palette, rng)

    license_info = _resolve_license(entry)

    return {
        "width": width,
        "height": height,
        "tiles": tiles,
        "entities": entities,
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
            "tile_size_px": 32,
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

    palette = _build_tile_sprite_palette(
        environment=request["environment"],
        description=request["description"],
        mock_mode=LOCAL_MOCK_MODE,
        rng=rng,
    )
    best_tiles = _assign_tile_sprites(best_tiles, palette, rng)
    entities = _spawn_environment_props(best_tiles, request["environment"], palette, rng)

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
        "entities": entities,
        "metadata": {
            "map_id": f"gen_{fingerprint}",
            "map_source": "generated",
            "environment": request["environment"],
            "encounter_type": request["encounter_type"],
            "encounter_scale": request["encounter_scale"],
            "tactical_tags": tactical_tags,
            "grid_size": 5,
            "grid_units": "ft",
            "tile_size_px": 32,
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
