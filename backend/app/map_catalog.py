from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import time
from collections import Counter, OrderedDict, deque
from pathlib import Path
from typing import Any, TypedDict, cast, Optional

from .config import LOCAL_MOCK_MODE, MAP_PACK_VALIDATION_MODE
from .maps.license_validation import validate_map_library_manifest
from .terrain_variants import get_terrain_variants
from .seeded_random import select_variant, SeededRNG


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
    terrain_theme: str
    encounter_type: str
    encounter_scale: str
    tactical_tags: list[str]
    width: int
    height: int
    seed: int  # Optional: deterministic seed for terrain variant generation


class NormalizedMapSelectionRequest(TypedDict, total=False):
    description: str
    environment: str
    terrain_theme: str
    encounter_type: str
    encounter_scale: str
    tactical_tags: list[str]
    width: int
    height: int
    seed: int  # Optional: deterministic seed for terrain variant generation


class TerrainAtlasEntry(TypedDict):
    x: int
    y: int
    tileSize: int
    label: str


_MAP_LIBRARY_PATH = Path(__file__).resolve().parent / "maps" / "data" / "map_library.json"
_TERRAIN_ATLAS_DIR = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "public"
    / "sprites"
    / "Environment"
)
_TERRAIN_ATLAS_CANDIDATE_PATHS = (
    _TERRAIN_ATLAS_DIR / "Stylized_environment.json",
    _TERRAIN_ATLAS_DIR / "Terrain_and_Props.json",
)
_GENERATED_MAP_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_GENERATED_CACHE_LIMIT = 64
_TERRAIN_ATLAS_CACHE: list[TerrainAtlasEntry] | None = None
logger = logging.getLogger(__name__)

_LEGACY_SPRITE_PIPELINE_ENABLED = str(os.getenv("OTDND_ENABLE_LEGACY_SPRITES", "0")).strip().lower() in {
    "1", "true", "yes", "on",
}

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

_TERRAIN_THEME_KEYWORDS: dict[str, list[str]] = {
    "ruined": ["ruined", "rubble", "broken", "cracked", "debris", "worn"],
    "overgrown": ["moss", "vines", "grass", "roots", "green", "mushroom"],
    "ancient": ["stone", "pillar", "statue", "crypt", "ornate", "carved"],
    "volcanic": ["lava", "ash", "char", "basalt", "smoke", "fire"],
    "frozen": ["ice", "frost", "snow", "cold", "glacier", "crystal"],
    "flooded": ["water", "pond", "river", "wet", "murky", "algae"],
    "arcane": ["rune", "glyph", "arcane", "magic", "crystal", "glow"],
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

_MAX_PALETTE_BY_TILE_TYPE: dict[str, int] = {
    "floor": 4,
    "wall": 3,
    "door": 2,
    "water": 2,
    "pit": 1,
    "pillar": 2,
    "rubble": 2,
    "stairs_up": 1,
    "stairs_down": 1,
    "chest": 1,
}

_MIN_PALETTE_BY_TILE_TYPE: dict[str, int] = {
    "floor": 2,
    "wall": 2,
}

_BLOCKED_SPRITE_KEYWORDS = [
    "wall", "rock", "rubble", "pit", "chasm", "cliff", "boulder", "collapsed",
    "debris", "void", "lava", "pillar", "column", "stalagmite", "barrier",
]


def _normalize_label(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").split())


def _append_atlas_entry(
    entries: list[TerrainAtlasEntry],
    x: int,
    y: int,
    tile_size: int,
    label: str,
) -> None:
    normalized = _normalize_label(label)
    if not normalized:
        return
    entries.append({"x": x, "y": y, "tileSize": tile_size, "label": normalized})


def _load_terrain_atlas() -> list[TerrainAtlasEntry]:
    global _TERRAIN_ATLAS_CACHE
    if _TERRAIN_ATLAS_CACHE is not None:
        return _TERRAIN_ATLAS_CACHE

    payload: Any | None = None
    atlas_path: Path | None = None
    for candidate in _TERRAIN_ATLAS_CANDIDATE_PATHS:
        if not candidate.exists():
            continue
        atlas_path = candidate
        try:
            with candidate.open("r", encoding="utf-8-sig") as f:
                payload = json.load(f)
        except json.JSONDecodeError as exc:
            logger.warning("Terrain atlas JSON invalid at %s: %s", candidate, exc)
            _TERRAIN_ATLAS_CACHE = []
            return _TERRAIN_ATLAS_CACHE
        break

    if payload is None or atlas_path is None:
        logger.warning("Terrain atlas JSON missing. Checked: %s", ", ".join(str(p) for p in _TERRAIN_ATLAS_CANDIDATE_PATHS))
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
            _append_atlas_entry(entries, x, y, tile_size, label)
    elif isinstance(payload, dict):
        meta = payload.get("meta", {})
        default_tile_size = 32
        if isinstance(meta, dict):
            try:
                default_tile_size = int(meta.get("tileSize", 32))
            except (TypeError, ValueError):
                default_tile_size = 32

        frames = payload.get("frames", {})
        if isinstance(frames, dict):
            for frame_key, frame_data in frames.items():
                if not isinstance(frame_data, dict):
                    continue
                frame = frame_data.get("frame", {})
                if not isinstance(frame, dict):
                    continue

                try:
                    x = int(frame.get("x", 0))
                    y = int(frame.get("y", 0))
                    w = int(frame.get("w", default_tile_size))
                    h = int(frame.get("h", default_tile_size))
                except (TypeError, ValueError):
                    continue

                tile_size = w if w > 0 else h if h > 0 else default_tile_size
                if tile_size <= 0:
                    continue

                base_label = str(frame_data.get("baseLabel", "")).strip()
                frame_label = str(frame_key).strip()

                if base_label:
                    _append_atlas_entry(entries, x, y, tile_size, base_label)
                if frame_label:
                    _append_atlas_entry(entries, x, y, tile_size, frame_label)

    if not entries:
        logger.warning("Terrain atlas parsed but no usable entries found at %s", atlas_path)

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


def _cohere_tile_palette(candidates: list[str], tile_type: str, rng: random.Random) -> list[str]:
    if not candidates:
        return []

    deduped = list(dict.fromkeys(candidates))
    max_keep = _MAX_PALETTE_BY_TILE_TYPE.get(tile_type, 2)
    min_keep = _MIN_PALETTE_BY_TILE_TYPE.get(tile_type, 1)

    if len(deduped) <= max_keep:
        return deduped

    shuffled = list(deduped)
    rng.shuffle(shuffled)
    keep = max(min_keep, min(max_keep, len(shuffled)))
    return shuffled[:keep]


def _collect_palette_label_sets(palette: dict[str, list[str]]) -> tuple[set[str], set[str]]:
    traversable_labels: set[str] = set()
    blocked_labels: set[str] = set()
    for tile_type, labels in palette.items():
        if _is_walkable(tile_type):
            traversable_labels.update(labels)
        else:
            blocked_labels.update(labels)
    return traversable_labels, blocked_labels


def _choose_blocked_variants_for_map(
    palette: dict[str, list[str]],
    rng: random.Random,
    deterministic_seed: Optional[int],
) -> list[str]:
    blocked_pool: list[str] = []
    seen: set[str] = set()
    for tile_type, labels in palette.items():
        if _is_walkable(tile_type):
            continue
        for label in labels:
            if label in seen:
                continue
            seen.add(label)
            blocked_pool.append(label)

    if not blocked_pool:
        return []

    heavy = [
        label for label in blocked_pool
        if any(keyword in label for keyword in _BLOCKED_SPRITE_KEYWORDS)
    ]
    candidates = heavy if heavy else blocked_pool

    chooser = random.Random(((int(deterministic_seed) if deterministic_seed is not None else 0) ^ 0x6E6F5F6D) & 0xFFFFFFFF)
    if deterministic_seed is None:
        chooser = rng

    max_pick = min(3, len(candidates))
    if max_pick == 1:
        pick_count = 1
    else:
        pick_count = chooser.choice([1, 2, max_pick])

    shuffled = list(candidates)
    chooser.shuffle(shuffled)
    return shuffled[:pick_count]


def _build_tile_sprite_palette(
    environment: str,
    terrain_theme: str,
    description: str,
    mock_mode: bool,
    rng: random.Random,
) -> dict[str, list[str]]:
    entries = _load_terrain_atlas()
    if not entries:
        return {}

    env_key = environment if environment in _ENV_THEME_KEYWORDS else "dungeon"
    env_keywords = list(_ENV_THEME_KEYWORDS.get(env_key, []))

    normalized_theme = _normalize_label(terrain_theme)
    if normalized_theme:
        if normalized_theme in _TERRAIN_THEME_KEYWORDS:
            env_keywords.extend(_TERRAIN_THEME_KEYWORDS[normalized_theme])
        else:
            env_keywords.extend([token for token in normalized_theme.split(" ") if token])

    lowered_description = description.lower()
    if "water" in lowered_description or "river" in lowered_description:
        env_keywords.extend(["water", "river", "pond"]) 

    base_theme = _select_labels(entries, env_keywords, limit=120)
    if not base_theme:
        base_theme = _select_labels(entries, ["stone", "floor", "dirt"], limit=120)

    # Keep floor/wall pools separate and exclude object-like labels so map tiles
    # don't resolve to props like bookshelves, pillars, doors, or trees.
    floor_surface_keywords = [
        "grass", "dirt", "earth", "sand", "path", "road", "trail", "soil",
        "stone", "cobble", "moss", "mud", "ground", "wood", "brick", "tile", "floor",
    ]
    wall_surface_keywords = [
        "wall", "brick", "stone", "hedge", "cliff", "fence", "wood", "rock", "cobble",
        "masonry", "cave", "dungeon",
    ]
    reject_surface_keywords = [
        "bookshelf", "book", "shelf", "crate", "chest", "barrel", "table", "chair",
        "door", "gate", "archway", "torch", "tree", "bush", "pillar", "column",
        "statue", "stalagmite", "mushroom", "bones", "urn", "cart", "anvil", "altar",
        "pedestal", "lever", "wheel", "fountain", "tomb", "tombstone", "skull",
    ]

    def _surface_candidates(keywords: list[str], limit: int) -> list[str]:
        env_filtered = [
            label
            for label in base_theme
            if any(keyword in label for keyword in keywords)
            and not any(bad in label for bad in reject_surface_keywords)
        ]
        if env_filtered:
            return env_filtered

        fallback = _select_labels(entries, keywords, limit=limit)
        return [
            label
            for label in fallback
            if not any(bad in label for bad in reject_surface_keywords)
        ]

    floor_candidates = _surface_candidates(floor_surface_keywords, limit=160)
    wall_candidates = _surface_candidates(wall_surface_keywords, limit=160)

    floor_candidates = _cohere_tile_palette(floor_candidates, "floor", rng)
    wall_candidates = _cohere_tile_palette(wall_candidates, "wall", rng)

    palette: dict[str, list[str]] = {}
    if floor_candidates:
        palette["floor"] = list(floor_candidates)
    if wall_candidates:
        palette["wall"] = list(wall_candidates)

    for tile_type, keywords in _TILE_LABEL_KEYWORDS.items():
        if tile_type in {"floor", "wall"}:
            continue
        env_filtered = [label for label in base_theme if any(keyword in label for keyword in keywords)]
        global_fallback = _select_labels(entries, keywords, limit=120)

        candidates = env_filtered if env_filtered else global_fallback
        candidates = _cohere_tile_palette(candidates, tile_type, rng)

        if candidates:
            palette[tile_type] = candidates

    return palette


def _assign_tile_sprites(
    tiles: list[dict[str, Any]],
    palette: dict[str, list[str]],
    rng: random.Random,
    environment: str,
    deterministic_seed: Optional[int] = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Assign sprite labels and variants to tiles using procedural variation.
    
    If deterministic_seed is provided, uses noise-based variant clustering.
    Otherwise, falls back to random sprite selection from palette.
    
    Args:
        tiles: List of tile dictionaries with "type" field
        palette: Dict mapping tile_type -> list of sprite labels
        rng: Random instance for non-deterministic selection
        deterministic_seed: Optional seed for procedural variant selection
    
    Returns:
        List of tiles with assigned "sprite" and optional "variant" fields
    """
    if not palette:
        return [dict(tile) for tile in tiles], []

    def terrain_key_for(tile_type: str) -> str:
        env = environment.strip().lower()
        if tile_type == "floor":
            if env in {"forest", "cave"}:
                return "dirt_floor"
            if env == "tavern":
                return "wood_floor"
            return "stone_floor"
        if tile_type == "wall":
            if env in {"forest", "cave"}:
                return "dirt_wall"
            if env == "tavern":
                return "wood_wall"
            return "stone_wall"
        return tile_type

    traversable_labels, blocked_labels = _collect_palette_label_sets(palette)
    blocked_variants = _choose_blocked_variants_for_map(palette, rng, deterministic_seed)

    # Keep pools disjoint so blocked-looking sprites never leak onto walkable tiles.
    blocked_variant_set = set(blocked_variants)
    traversable_only = traversable_labels - blocked_variant_set
    blocked_only = (blocked_labels | blocked_variant_set) - traversable_only

    # Dominant base sprite per tile type for cohesive appearance.
    dominant_by_tile_type: dict[str, str] = {}
    for tile_type, labels in palette.items():
        if labels:
            dominant_by_tile_type[tile_type] = labels[0]

    decorated: list[dict[str, Any]] = []
    seeded_rng = SeededRNG(deterministic_seed) if deterministic_seed is not None else None
    
    for tile in tiles:
        tile_copy = dict(tile)
        tile_type = str(tile_copy.get("type", "floor"))
        terrain_type = terrain_key_for(tile_type)
        
        # If we have a seed for procedural generation, use variant selection
        if deterministic_seed is not None and seeded_rng is not None:
            x = tile_copy.get("x", 0)
            y = tile_copy.get("y", 0)
            
            # Try variant-based selection
            variant_id, sprite_label = select_variant(
                terrain_type=terrain_type,
                x=x,
                y=y,
                base_seed=deterministic_seed,
                rng=seeded_rng,
            )

            # Choose base label from a clustered region instead of per-tile randomness.
            # This avoids noisy "every tile is different" mosaics while keeping variety.
            is_blocked_tile = not _is_walkable(tile_type)
            if is_blocked_tile and blocked_variants:
                base_candidates = blocked_variants
            else:
                dominant = dominant_by_tile_type.get(tile_type)
                base_candidates = [dominant] if dominant else []
                if not base_candidates:
                    base_candidates = [
                        label for label in palette.get(tile_type, [])
                        if (label in blocked_only) == is_blocked_tile
                    ]
                    if not base_candidates:
                        pool = blocked_only if is_blocked_tile else traversable_only
                        base_candidates = list(pool)
                    if not base_candidates:
                        base_candidates = list(palette.get(tile_type, []))

            if base_candidates:
                cluster_span = 4 if tile_type == "floor" else 5 if tile_type == "wall" else 3
                cluster_x = int(x) // cluster_span
                cluster_y = int(y) // cluster_span
                tile_seed = (
                    (int(deterministic_seed) * 73856093)
                    ^ (int(cluster_x) * 19349663)
                    ^ (int(cluster_y) * 83492791)
                ) & 0xFFFFFFFF
                base_label = base_candidates[tile_seed % len(base_candidates)]
            else:
                base_label = sprite_label if sprite_label and sprite_label != terrain_type else tile_type

            # Store base label in sprite so the frontend can append the variant suffix
            # itself ("env:{base}_{variant}"). Double-encoding (embedding variant here AND
            # setting tile["variant"]) caused the frontend to produce "base_v_v" keys that
            # were never found in the atlas, collapsing all tiles to solid color fallbacks.
            tile_copy["sprite"] = f"env:{base_label}"
            if variant_id and variant_id != "default":
                tile_copy["variant"] = variant_id
        else:
            # Non-deterministic mode: use traditional random selection
            is_blocked_tile = not _is_walkable(tile_type)
            if is_blocked_tile and blocked_variants:
                candidates = blocked_variants
            else:
                dominant = dominant_by_tile_type.get(tile_type)
                candidates = [dominant] if dominant else []
                if not candidates:
                    candidates = [
                        label for label in palette.get(tile_type, [])
                        if (label in blocked_only) == is_blocked_tile
                    ]
                    if not candidates:
                        pool = blocked_only if is_blocked_tile else traversable_only
                        candidates = list(pool)
                    if not candidates:
                        candidates = palette.get(tile_type)
            if candidates:
                label = rng.choice(candidates)
                tile_copy["sprite"] = f"env:{label}"
        
        decorated.append(tile_copy)
    
    return decorated, blocked_variants


def assign_terrain_atlas_sprites(
    raw_request: MapSelectionRequest,
    tiles: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Assign sprite labels to an existing tile grid.

    Uses a seeded RNG based on request parameters plus a timestamp for variety.
    Each call will produce different but coherent sprite selections.
    
    If the request contains a 'seed' parameter, uses deterministic variant selection.
    """
    if not _LEGACY_SPRITE_PIPELINE_ENABLED:
        return [
            {
                k: v
                for k, v in dict(tile).items()
                if k not in {"sprite", "variant"}
            }
            for tile in tiles
        ]

    request = _normalize_request(raw_request)
    
    # Extract optional deterministic seed; otherwise use generated seed per call.
    explicit_seed = request.get("seed")
    
    # Include full timestamp so each call produces different sprite selections
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
        "timestamp_ms": int(time.time() * 1000),  # Use full timestamp for variety across all map loads
    }
    seed = int(hashlib.sha256(json.dumps(seed_payload, sort_keys=True).encode("utf-8")).hexdigest()[:8], 16)
    rng = random.Random(seed)
    effective_seed = int(explicit_seed) if explicit_seed is not None else seed

    palette = _build_tile_sprite_palette(
        environment=request["environment"],
        terrain_theme=request.get("terrain_theme", ""),
        description=request["description"],
        mock_mode=LOCAL_MOCK_MODE,
        rng=rng,
    )
    decorated, _blocked_variants = _assign_tile_sprites(
        tiles,
        palette,
        rng,
        environment=request["environment"],
        deterministic_seed=effective_seed,
    )
    return decorated


def _atlas_label_set(entries: list[TerrainAtlasEntry]) -> set[str]:
    labels: set[str] = set()
    for entry in entries:
        normalized = _normalize_label(str(entry.get("label", "")))
        if normalized:
            labels.add(normalized)
    return labels


def _extract_env_sprite_label(sprite: Any) -> str | None:
    if not isinstance(sprite, str):
        return None
    normalized = sprite.strip()
    if not normalized:
        return None
    if not normalized.lower().startswith("env:"):
        return None
    label = normalized.split(":", 1)[1]
    return _normalize_label(label)


def _atlas_resolves_env_label(base_label: str, variant: str, atlas_labels: set[str]) -> bool:
    if base_label in atlas_labels:
        return True
    if variant:
        variant_key = _normalize_label(f"{base_label}_{variant}")
        if variant_key in atlas_labels:
            return True
    return False


def _collect_unresolved_env_labels(
    records: list[dict[str, Any]],
    atlas_labels: set[str],
) -> tuple[int, Counter[str]]:
    checked = 0
    unresolved: Counter[str] = Counter()

    for record in records:
        base_label = _extract_env_sprite_label(record.get("sprite"))
        if not base_label:
            continue

        checked += 1
        raw_variant = record.get("variant")
        variant = _normalize_label(str(raw_variant)) if isinstance(raw_variant, str) else ""

        if _atlas_resolves_env_label(base_label, variant, atlas_labels):
            continue

        key = _normalize_label(f"{base_label}_{variant}") if variant else base_label
        unresolved[key] += 1

    return checked, unresolved


def run_terrain_atlas_resolution_check() -> dict[str, Any]:
    """Validate that generated env sprite labels resolve to atlas frames.

    Returns a report suitable for health endpoints and CI/release gating.
    """
    entries = _load_terrain_atlas()
    atlas_labels = _atlas_label_set(entries)

    if not entries or not atlas_labels:
        return {
            "ok": False,
            "atlas_entry_count": len(entries),
            "atlas_label_count": len(atlas_labels),
            "sample_count": 0,
            "env_sprite_labels_checked": 0,
            "unresolved_count": 0,
            "unresolved_top": [],
            "errors": ["Terrain atlas is missing or contains no valid labels"],
        }

    total_checked = 0
    unresolved_totals: Counter[str] = Counter()
    sample_reports: list[dict[str, Any]] = []
    errors: list[str] = []

    generated_requests: list[MapSelectionRequest] = [
        {
            "description": "Ancient dungeon with collapsed sections and narrow corridors",
            "environment": "dungeon",
            "terrain_theme": "ancient",
            "encounter_type": "exploration",
            "encounter_scale": "medium",
            "tactical_tags": ["cover", "line_of_sight"],
            "width": 20,
            "height": 15,
            "seed": 10101,
        },
        {
            "description": "Dense forest clearing with shallow streams",
            "environment": "forest",
            "terrain_theme": "overgrown",
            "encounter_type": "exploration",
            "encounter_scale": "medium",
            "tactical_tags": ["cover"],
            "width": 20,
            "height": 15,
            "seed": 20202,
        },
        {
            "description": "Wind-carved cave chambers and rocky ledges",
            "environment": "cave",
            "terrain_theme": "ruined",
            "encounter_type": "combat",
            "encounter_scale": "large",
            "tactical_tags": ["line_of_sight"],
            "width": 20,
            "height": 15,
            "seed": 30303,
        },
        {
            "description": "Busy tavern interior with tables and support pillars",
            "environment": "tavern",
            "terrain_theme": "ancient",
            "encounter_type": "social",
            "encounter_scale": "small",
            "tactical_tags": ["cover"],
            "width": 20,
            "height": 15,
            "seed": 40404,
        },
        {
            "description": "Stone city plaza and connecting alleys",
            "environment": "city",
            "terrain_theme": "ancient",
            "encounter_type": "exploration",
            "encounter_scale": "small",
            "tactical_tags": ["line_of_sight"],
            "width": 20,
            "height": 15,
            "seed": 50505,
        },
    ]

    for idx, request in enumerate(generated_requests):
        sample_name = f"generated_{idx}_{request['environment']}"
        try:
            generated = build_automated_map(request)
            tiles = [dict(tile) for tile in generated.get("tiles", []) if isinstance(tile, dict)]
            entities = [dict(entity) for entity in generated.get("entities", []) if isinstance(entity, dict)]

            checked_tiles, unresolved_tiles = _collect_unresolved_env_labels(tiles, atlas_labels)
            checked_entities, unresolved_entities = _collect_unresolved_env_labels(entities, atlas_labels)

            sample_checked = checked_tiles + checked_entities
            sample_unresolved = unresolved_tiles + unresolved_entities

            total_checked += sample_checked
            unresolved_totals.update(sample_unresolved)

            sample_reports.append(
                {
                    "name": sample_name,
                    "checked": sample_checked,
                    "unresolved": int(sum(sample_unresolved.values())),
                }
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{sample_name}: {exc}")

    prebuilt_template_tiles: list[dict[str, Any]] = [
        {"x": 0, "y": 0, "type": "floor"},
        {"x": 1, "y": 0, "type": "wall"},
        {"x": 2, "y": 0, "type": "door"},
        {"x": 3, "y": 0, "type": "water"},
        {"x": 4, "y": 0, "type": "pit"},
        {"x": 5, "y": 0, "type": "pillar"},
        {"x": 6, "y": 0, "type": "rubble"},
        {"x": 7, "y": 0, "type": "stairs_up"},
        {"x": 8, "y": 0, "type": "stairs_down"},
        {"x": 9, "y": 0, "type": "chest"},
    ]

    for env_index, environment in enumerate(["dungeon", "forest", "cave", "tavern", "city"]):
        sample_name = f"prebuilt_{environment}"
        try:
            decorated = assign_terrain_atlas_sprites(
                {
                    "description": f"Prebuilt validation map for {environment}",
                    "environment": environment,
                    "terrain_theme": "ancient",
                    "encounter_type": "exploration",
                    "encounter_scale": "small",
                    "tactical_tags": ["line_of_sight"],
                    "width": 10,
                    "height": 1,
                    "seed": 90000 + env_index,
                },
                [dict(tile) for tile in prebuilt_template_tiles],
            )

            checked, unresolved = _collect_unresolved_env_labels(decorated, atlas_labels)
            total_checked += checked
            unresolved_totals.update(unresolved)
            sample_reports.append(
                {
                    "name": sample_name,
                    "checked": checked,
                    "unresolved": int(sum(unresolved.values())),
                }
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{sample_name}: {exc}")

    unresolved_total_count = int(sum(unresolved_totals.values()))
    unresolved_top = [
        {"label": label, "count": count}
        for label, count in unresolved_totals.most_common(20)
    ]

    ok = unresolved_total_count == 0 and not errors
    return {
        "ok": ok,
        "atlas_entry_count": len(entries),
        "atlas_label_count": len(atlas_labels),
        "sample_count": len(sample_reports),
        "env_sprite_labels_checked": total_checked,
        "unresolved_count": unresolved_total_count,
        "unresolved_top": unresolved_top,
        "errors": errors,
        "samples": sample_reports,
    }


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
    terrain_theme = str(raw.get("terrain_theme", "")).strip().lower()
    encounter_type = (raw.get("encounter_type") or _infer_encounter_type(description)).strip().lower()
    encounter_scale = (raw.get("encounter_scale") or _infer_scale(width, height)).strip().lower()
    tactical_tags = [t.strip().lower() for t in raw.get("tactical_tags", []) if str(t).strip()]

    normalized: NormalizedMapSelectionRequest = {
        "description": description,
        "environment": environment,
        "terrain_theme": terrain_theme,
        "encounter_type": encounter_type,
        "encounter_scale": encounter_scale,
        "tactical_tags": tactical_tags,
        "width": width,
        "height": height,
    }
    
    # Pass through optional seed if provided
    if "seed" in raw:
        normalized["seed"] = raw["seed"]
    
    return normalized


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


def _pick_library_entry(
    request: NormalizedMapSelectionRequest,
    library: list[MapLibraryEntry],
    rng: random.Random,
    deterministic: bool,
) -> tuple[MapLibraryEntry | None, int]:
    scored = [(entry, _score_entry(entry, request)) for entry in library]
    if not scored:
        return None, 0

    if LOCAL_MOCK_MODE:
        env_match = [entry for entry, score in scored if entry["environment"] == request["environment"]]
        if env_match:
            return rng.choice(env_match), 0
        eligible = [entry for entry, score in scored if score >= 4]
        if not eligible:
            eligible = [entry for entry, _score in scored]
        return rng.choice(eligible), 0

    if not deterministic:
        scored.sort(key=lambda item: item[1], reverse=True)
        best_score = scored[0][1]
        threshold = max(0, best_score - 1)
        top_choices = [entry for entry, score in scored if score >= threshold]
        if top_choices:
            return rng.choice(top_choices), best_score

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
        mid_x = width // 2 + rng.randint(-2, 2)
        mid_y = height // 2 + rng.randint(-1, 1)

        left_x1, left_y1 = 2 + rng.randint(0, 2), 2 + rng.randint(0, 2)
        left_x2, left_y2 = max(left_x1 + 4, mid_x - rng.randint(0, 2)), max(left_y1 + 4, mid_y + rng.randint(-1, 1))

        right_x1, right_y1 = min(width - 6, mid_x - rng.randint(1, 2)), min(height - 6, mid_y - rng.randint(1, 2))
        right_x2, right_y2 = width - (3 + rng.randint(0, 2)), height - (3 + rng.randint(0, 2))

        _apply_rect_wall(tiles_by_pos, left_x1, left_y1, left_x2, left_y2)
        _apply_rect_wall(tiles_by_pos, right_x1, right_y1, right_x2, right_y2)

        door_a = (max(left_x1 + 1, min(left_x2 - 1, mid_x)), left_y1)
        door_b = (max(right_x1 + 1, min(right_x2 - 1, mid_x)), max(right_y1 + 1, min(right_y2 - 1, mid_y)))
        tiles_by_pos[door_a] = "door"
        tiles_by_pos[door_b] = "door"

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


def _build_from_library(entry: MapLibraryEntry, request: NormalizedMapSelectionRequest, rng: random.Random, deterministic_seed: Optional[int] = None) -> dict[str, Any]:
    width = int(request["width"])
    height = int(request["height"])
    tiles = _apply_layout(entry["layout"], width, height, rng)

    if not _is_valid_layout(width, height, tiles):
        tiles = _empty_map(width, height)

    blocked_variants: list[str] = []
    palette: dict[str, list[str]] = {}
    if _LEGACY_SPRITE_PIPELINE_ENABLED:
        palette = _build_tile_sprite_palette(
            environment=entry["environment"],
            terrain_theme=request.get("terrain_theme", ""),
            description=request["description"],
            mock_mode=LOCAL_MOCK_MODE,
            rng=rng,
        )
        tiles, blocked_variants = _assign_tile_sprites(
            tiles,
            palette,
            rng,
            environment=entry["environment"],
            deterministic_seed=deterministic_seed,
        )

        # TEMP DEBUG: Track selected environment/theme and first floor sprite keys.
        floor_sprites = [str(t.get("sprite", "")) for t in tiles if str(t.get("type", "")) == "floor" and t.get("sprite")]
        logger.info(
            "[terrain-debug] map_source=library env=%s theme=%s floor_sprites_first20=%s",
            entry["environment"],
            request.get("terrain_theme", ""),
            floor_sprites[:20],
        )
    else:
        tiles = [{k: v for k, v in dict(tile).items() if k not in {"sprite", "variant"}} for tile in tiles]

    entities = _spawn_environment_props(tiles, entry["environment"], palette, rng)
    if not _LEGACY_SPRITE_PIPELINE_ENABLED:
        for entity in entities:
            entity["sprite"] = "default"

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
            "blocked_variants": blocked_variants,
            "map_config": {
                "blocked_variants": blocked_variants,
            },
        },
    }


def _generate_dynamic(request: NormalizedMapSelectionRequest, rng: random.Random, deterministic_seed: Optional[int] = None) -> dict[str, Any]:
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

    blocked_variants: list[str] = []
    palette: dict[str, list[str]] = {}
    if _LEGACY_SPRITE_PIPELINE_ENABLED:
        palette = _build_tile_sprite_palette(
            environment=request["environment"],
            terrain_theme=request.get("terrain_theme", ""),
            description=request["description"],
            mock_mode=LOCAL_MOCK_MODE,
            rng=rng,
        )
        best_tiles, blocked_variants = _assign_tile_sprites(
            best_tiles,
            palette,
            rng,
            environment=request["environment"],
            deterministic_seed=deterministic_seed,
        )

        # TEMP DEBUG: Track selected environment/theme and first floor sprite keys.
        floor_sprites = [str(t.get("sprite", "")) for t in best_tiles if str(t.get("type", "")) == "floor" and t.get("sprite")]
        logger.info(
            "[terrain-debug] map_source=generated env=%s theme=%s floor_sprites_first20=%s",
            request["environment"],
            request.get("terrain_theme", ""),
            floor_sprites[:20],
        )
    else:
        best_tiles = [{k: v for k, v in dict(tile).items() if k not in {"sprite", "variant"}} for tile in best_tiles]

    entities = _spawn_environment_props(best_tiles, request["environment"], palette, rng)
    if not _LEGACY_SPRITE_PIPELINE_ENABLED:
        for entity in entities:
            entity["sprite"] = "default"

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
            "blocked_variants": blocked_variants,
            "map_config": {
                "blocked_variants": blocked_variants,
            },
        },
    }


def _cache_key(request: NormalizedMapSelectionRequest) -> str:
    serialized = json.dumps(request, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def build_automated_map(raw_request: MapSelectionRequest) -> dict[str, Any]:
    request = _normalize_request(raw_request)
    library = _load_library()
    explicit_seed = request.get("seed")

    cache_key = _cache_key(request)
    # Only serve cache hits for explicitly-seeded requests.
    # Unseeded requests should regenerate to preserve visual variety across reloads.
    if explicit_seed is not None and cache_key in _GENERATED_MAP_CACHE:
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

    if explicit_seed is not None:
        rng_seed = int(explicit_seed)
    else:
        # Unseeded requests should vary every generation and across restarts.
        rng_seed_data = {
            "cache_key": cache_key,
            "timestamp_ns": time.time_ns(),
            "entropy": random.SystemRandom().getrandbits(32),
        }
        rng_seed = int(hashlib.sha256(json.dumps(rng_seed_data, sort_keys=True).encode("utf-8")).hexdigest()[:8], 16)

    rng = random.Random(rng_seed)
    effective_seed = int(explicit_seed) if explicit_seed is not None else rng_seed
    picked, score = _pick_library_entry(request, library, rng, deterministic=explicit_seed is not None)

    if LOCAL_MOCK_MODE:
        if picked is None:
            result = _generate_dynamic(request, rng, deterministic_seed=effective_seed)
        else:
            result = _build_from_library(picked, request, rng, deterministic_seed=effective_seed)
    else:
        if picked and score >= 6:
            result = _build_from_library(picked, request, rng, deterministic_seed=effective_seed)
        else:
            result = _generate_dynamic(request, rng, deterministic_seed=effective_seed)

    metadata = dict(result.get("metadata", {}))
    metadata["cache_hit"] = False
    result["metadata"] = metadata

    # Cache only explicitly-seeded maps to preserve deterministic replay behavior.
    if explicit_seed is not None:
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
