"""
Procedural terrain variant system for natural-looking, non-repetitive tile rendering.

Tiles are organized into terrain types (stone_floor, dirt_floor, etc.), where each type
has multiple visual variants (clean, cracked, rubble, mossy) with relative weights.

Variant selection is deterministic based on tile position and seed, using Perlin noise
to cluster similar variants together (e.g., cracks and rubble in high-noise areas).

This module defines the terrain variant groups and properties. The actual selection
logic lives in seeded_random.py.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class TerrainVariant:
    """
    A visual variant of a terrain type.
    
    Attributes:
        id: Unique identifier (e.g., "clean", "cracked", "rubble")
        sprite_label: Label in sprite atlas (e.g., "orange brick", "stone floor_cracked")
        weight: Relative selection probability (higher = more common)
        cluster_bias: Noise bias for this variant:
            - positive: preferred in high-noise areas (worn/damaged)
            - negative: preferred in low-noise areas (pristine)
            - 0: no bias (neutral distribution)
    """
    id: str
    sprite_label: str
    weight: int
    cluster_bias: float = 0.0


@dataclass(frozen=True)
class TerrainGroup:
    """
    A group of visual variants for a terrain type.
    
    Attributes:
        terrain_type: Game-level terrain type (e.g., "floor", "wall", "water")
        variants: List of visual variant options for this terrain
        description: Human description of this terrain type
    """
    terrain_type: str
    variants: tuple  # tuple of TerrainVariant
    description: str


# ==============================================================================
# TERRAIN VARIANT DEFINITIONS
# ==============================================================================
# Design: 3-4 variants per terrain type with weights favoring the base appearance.
# Cluster biases create natural-looking patterns (high-noise → cracked, low-noise → clean).

TERRAIN_VARIANTS: Dict[str, TerrainGroup] = {
    # STONE FLOOR: Urban dungeon, crypt, cave environments
    # Natural progression: clean stone → surface cracks → debris/rubble → moss patches
    "stone_floor": TerrainGroup(
        terrain_type="floor",
        variants=(
            TerrainVariant(
                id="clean",
                sprite_label="orange brick",  # fallback to existing atlas
                weight=5,
                cluster_bias=-0.3,  # clean tiles prefer low-noise areas
            ),
            TerrainVariant(
                id="cracked",
                sprite_label="stone passage",  # will map to "stone floor_cracked" if available
                weight=2,
                cluster_bias=0.4,  # cracked tiles prefer high-noise areas
            ),
            TerrainVariant(
                id="rubble",
                sprite_label="ruined stone",  # will map to "stone floor_rubble" if available
                weight=1,
                cluster_bias=0.6,  # rubble is clustered in highest-noise areas
            ),
            TerrainVariant(
                id="mossy",
                sprite_label="water tiles",  # placeholder; will map to "stone floor_mossy" if available
                weight=1,
                cluster_bias=0.2,  # subtle clustering
            ),
        ),
        description="Stone dungeon floor with cracks, rubble, and moss patches",
    ),

    # STONE WALL: Dungeon and crypt walls
    "stone_wall": TerrainGroup(
        terrain_type="wall",
        variants=(
            TerrainVariant(
                id="smooth",
                sprite_label="orange brick",
                weight=5,
                cluster_bias=-0.2,
            ),
            TerrainVariant(
                id="cracked",
                sprite_label="stone passage",
                weight=2,
                cluster_bias=0.3,
            ),
            TerrainVariant(
                id="worn",
                sprite_label="stone pillar",
                weight=1,
                cluster_bias=0.1,
            ),
            TerrainVariant(
                id="dark",
                sprite_label="dark stone wall",  # will map to "stone wall_dark" if available
                weight=1,
                cluster_bias=0.2,
            ),
        ),
        description="Stone dungeon wall with weathering and cracks",
    ),

    # DIRT FLOOR: Forest, cave, and outdoor environments
    "dirt_floor": TerrainGroup(
        terrain_type="floor",
        variants=(
            TerrainVariant(
                id="clean",
                sprite_label="green moss",  # earth tone in forest
                weight=4,
                cluster_bias=-0.3,
            ),
            TerrainVariant(
                id="patchy",
                sprite_label="green tree",  # vegetation creeping in
                weight=2,
                cluster_bias=0.2,
            ),
            TerrainVariant(
                id="grass_creep",
                sprite_label="water shallow",  # grass/vegetation overgrowth
                weight=2,
                cluster_bias=0.3,
            ),
            TerrainVariant(
                id="stone_patch",
                sprite_label="stone archway",  # exposed stone
                weight=1,
                cluster_bias=0.1,
            ),
        ),
        description="Dirt floor with grass and vegetation patches",
    ),

    # DIRT WALL: Cave and natural wall environments
    "dirt_wall": TerrainGroup(
        terrain_type="wall",
        variants=(
            TerrainVariant(
                id="earthy",
                sprite_label="green moss",
                weight=5,
                cluster_bias=-0.2,
            ),
            TerrainVariant(
                id="root_cluster",
                sprite_label="green tree",  # roots hanging down
                weight=2,
                cluster_bias=0.4,
            ),
            TerrainVariant(
                id="cave_wall",
                sprite_label="stone lit",  # rocky cave
                weight=2,
                cluster_bias=0.3,
            ),
            TerrainVariant(
                id="stone_vein",
                sprite_label="brown crystal",  # mineral deposits
                weight=1,
                cluster_bias=0.2,
            ),
        ),
        description="Dirt and cave wall with root clusters and stone veins",
    ),

    # WATER: Pond, stream, and wet environments
    "water": TerrainGroup(
        terrain_type="water",
        variants=(
            TerrainVariant(
                id="calm",
                sprite_label="water tiles",
                weight=3,
                cluster_bias=-0.2,
            ),
            TerrainVariant(
                id="waves",
                sprite_label="water tile",
                weight=2,
                cluster_bias=0.1,
            ),
            TerrainVariant(
                id="murky",
                sprite_label="water medium",
                weight=2,
                cluster_bias=0.3,
            ),
            TerrainVariant(
                id="algae",
                sprite_label="green moss",  # algae-covered
                weight=1,
                cluster_bias=0.5,
            ),
        ),
        description="Water with varying clarity and surface conditions",
    ),

    # WOOD FLOOR: Tavern, building, and wooden structure interiors
    "wood_floor": TerrainGroup(
        terrain_type="floor",
        variants=(
            TerrainVariant(
                id="boards",
                sprite_label="stone passage",  # tan/wood color
                weight=4,
                cluster_bias=-0.2,
            ),
            TerrainVariant(
                id="worn",
                sprite_label="orange brick",  # worn finish
                weight=2,
                cluster_bias=0.2,
            ),
            TerrainVariant(
                id="cracked",
                sprite_label="ruined brick",  # splintered wood
                weight=2,
                cluster_bias=0.4,
            ),
            TerrainVariant(
                id="rotted",
                sprite_label="water tiles",  # dark, water-damaged
                weight=1,
                cluster_bias=0.5,
            ),
        ),
        description="Wooden floor with wear, cracks, and rot",
    ),

    # WOOD WALL: Wooden structure walls
    "wood_wall": TerrainGroup(
        terrain_type="wall",
        variants=(
            TerrainVariant(
                id="panels",
                sprite_label="stone passage",  # wooden boards
                weight=4,
                cluster_bias=-0.2,
            ),
            TerrainVariant(
                id="weathered",
                sprite_label="orange brick",
                weight=2,
                cluster_bias=0.2,
            ),
            TerrainVariant(
                id="splintered",
                sprite_label="ruined brick",
                weight=1,
                cluster_bias=0.4,
            ),
            TerrainVariant(
                id="rotten",
                sprite_label="water tiles",
                weight=1,
                cluster_bias=0.5,
            ),
        ),
        description="Wooden wall with weathering and decay",
    ),
}


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def get_terrain_variants(terrain_type: str) -> Optional[TerrainGroup]:
    """
    Retrieve the variant group for a given terrain type.
    
    Args:
        terrain_type: Terrain type string (e.g., "stone_floor")
    
    Returns:
        TerrainGroup if found, None otherwise
    """
    return TERRAIN_VARIANTS.get(terrain_type)


def get_variant_by_id(terrain_type: str, variant_id: str) -> Optional[TerrainVariant]:
    """
    Retrieve a specific variant within a terrain type.
    
    Args:
        terrain_type: Terrain type string (e.g., "stone_floor")
        variant_id: Variant ID (e.g., "cracked")
    
    Returns:
        TerrainVariant if found, None otherwise
    """
    group = get_terrain_variants(terrain_type)
    if not group:
        return None
    return next((v for v in group.variants if v.id == variant_id), None)


def get_base_variant(terrain_type: str) -> Optional[TerrainVariant]:
    """
    Get the most common variant (highest weight) for a terrain type.
    Used as fallback when variant selection fails.
    
    Args:
        terrain_type: Terrain type string
    
    Returns:
        TerrainVariant with highest weight, or None
    """
    group = get_terrain_variants(terrain_type)
    if not group or not group.variants:
        return None
    return max(group.variants, key=lambda v: v.weight)
