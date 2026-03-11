"""
Seeded random variant selection for procedural tile rendering.

Combines Perlin noise clustering with weighted random selection to choose
terrain variants procedurally. Same seed + position always produces same variant.
"""

import random
from typing import List, Optional, Tuple

from .terrain_variants import TerrainVariant, get_base_variant, get_terrain_variants
from .procedural_noise import eval_noise_at


class SeededRNG:
    """
    Seeded random number generator with deterministic chain-able seed progression.
    
    Supports repeatable random selections across multiple calls by advancing
    the seed between calls, ensuring each call gets different randomness but
    the sequence is deterministic.
    """
    
    def __init__(self, base_seed: int):
        """
        Initialize with a base seed.
        
        Args:
            base_seed: Starting seed value
        """
        self.base_seed = base_seed
        self.current_seed = base_seed
    
    def advance_seed(self) -> int:
        """
        Advance the internal seed and return it for use.
        
        Returns:
            New seed value for next RNG operation
        """
        # Simple linear congruential advance
        self.current_seed = (self.current_seed * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.current_seed
    
    def choices(self, population: List, weights: List[float], k: int = 1):
        """
        Make weighted random choices (like random.choices but deterministic).
        
        Args:
            population: List of items to choose from
            weights: Relative weights for each item
            k: Number of items to choose (default 1)
        
        Returns:
            List of k chosen items
        """
        # Use advanced seed to initialize Random
        rng = random.Random(self.advance_seed())
        return rng.choices(population, weights=weights, k=k)


# ==============================================================================
# NOISE-BASED WEIGHT ADJUSTMENT
# ==============================================================================

def adjust_weights_for_noise(
    variants: Tuple[TerrainVariant, ...],
    noise_value: float
) -> List[float]:
    """
    Adjust variant weights based on Perlin noise value.
    
    Creates natural-looking clustering:
    - High noise (> 0.65): boost variants with positive cluster_bias (cracked, rubble)
    - Middle noise: neutral weights
    - Low noise (< 0.35): boost variants with negative cluster_bias (clean, pristine)
    
    Args:
        variants: Tuple of TerrainVariant objects for a terrain type
        noise_value: Perlin noise value [0, 1]
    
    Returns:
        List of adjusted weights (same length as variants)
    """
    adjusted = []
    
    for variant in variants:
        base_weight = variant.weight
        
        if noise_value > 0.65:
            # High-noise area: favor damaged/clustered variants
            # Apply boost based on positive cluster_bias
            boost = max(0, variant.cluster_bias)  # Only positive bias gets boost
            multiplier = 1.0 + (boost * 2.0)  # Scale boost by up to 2x
            adjusted_weight = base_weight * multiplier
        
        elif noise_value < 0.35:
            # Low-noise area: favor clean/pristine variants
            # Apply boost based on negative cluster_bias (inverted)
            boost = max(0, -variant.cluster_bias)  # Use negative bias inverted
            multiplier = 1.0 + (boost * 2.0)
            adjusted_weight = base_weight * multiplier
        
        else:
            # Middle range: neutral, use base weights
            adjusted_weight = base_weight
        
        adjusted.append(adjusted_weight)
    
    return adjusted


def _hash01(base_seed: int, a: int, b: int, salt: int) -> float:
    mixed = (
        (int(base_seed) * 0x9E3779B1)
        ^ (int(a) * 0x85EBCA6B)
        ^ (int(b) * 0xC2B2AE35)
        ^ int(salt)
    ) & 0xFFFFFFFF
    # Final avalanche to spread entropy before mapping to [0, 1).
    mixed ^= (mixed >> 16)
    mixed = (mixed * 0x7FEB352D) & 0xFFFFFFFF
    mixed ^= (mixed >> 15)
    mixed = (mixed * 0x846CA68B) & 0xFFFFFFFF
    mixed ^= (mixed >> 16)
    return mixed / 4294967296.0


def _variant_probability(x: int, y: int, base_seed: int) -> float:
    """
    Organic per-tile variant probability with target average ~15%.

    Uses two noise fields:
    - low-frequency "macro" field to create broad natural wear zones
    - medium-frequency "detail" field to add irregular edge breakup

    The probability is centered at 0.15 and modulated spatially, avoiding
    checkerboard/grid artifacts while still yielding sporadic isolated tiles.
    """
    macro = eval_noise_at(x, y, base_seed ^ 0x1F123BB5, octaves=3, persistence=0.58)
    detail = eval_noise_at(x + 19, y - 13, base_seed ^ 0x7A4D91C3, octaves=2, persistence=0.52)

    # Center around 15% with smooth spatial modulation.
    prob = 0.15
    prob += (macro - 0.5) * 0.14
    prob += (detail - 0.5) * 0.06

    # Keep rare singles and prevent over-dense noisy maps.
    if prob < 0.03:
        return 0.03
    if prob > 0.28:
        return 0.28
    return prob


# ==============================================================================
# TILE VARIANT SELECTION
# ==============================================================================

def select_variant(
    terrain_type: str,
    x: int,
    y: int,
    base_seed: Optional[int] = None,
    rng: Optional[SeededRNG] = None,
) -> Tuple[str, str]:
    """
    Select a terrain variant for a tile using noise-weighted random selection.
    
    Combines three elements:
    1. Perlin noise at tile position determines cluster_bias scaling
    2. Weighted random selection from variant pool
    3. Deterministic seeding ensures same position + seed = same variant
    
    Args:
        terrain_type: Terrain type string (e.g., "stone_floor"), or tile_type if no variant
        x, y: Tile grid coordinates
        base_seed: Optional base seed for deterministic generation.
                   If None, uses random seed.
        rng: Optional SeededRNG instance. If None, creates one from base_seed.
    
    Returns:
        Tuple of (variant_id, sprite_label) where:
        - variant_id: Variant ID (e.g., "cracked")
        - sprite_label: Sprite atlas label (e.g., "stone passage")
    
    Example:
        variant_id, sprite = select_variant("stone_floor", 5, 3, seed=12345)
        # Returns: ("cracked", "stone passage") consistently
    """
    # Get terrain group
    group = get_terrain_variants(terrain_type)
    if not group:
        # Unknown terrain type; return a default
        return ("default", terrain_type)
    
    # If no variants, return the terrain type itself
    if not group.variants:
        return ("default", terrain_type)
    
    # Initialize RNG if not provided
    if rng is None:
        rng = SeededRNG(base_seed if base_seed is not None else 0)
    
    # Evaluate Perlin noise at this tile position
    noise_seed = int(base_seed) if base_seed is not None else 0
    noise_value = eval_noise_at(x, y, noise_seed)

    # Dominant-base rule: variants appear based on an organic noise field with
    # target average ~15% coverage, producing irregular clusters plus sparse singles.
    variant_prob = _variant_probability(x, y, noise_seed)
    variant_roll = _hash01(noise_seed, int(x), int(y), 0x5EEDBEEF)
    is_variant_tile = variant_roll < variant_prob

    base_variant = get_base_variant(terrain_type)
    if not is_variant_tile and base_variant is not None:
        # Return default so caller does not append a variant suffix for base tiles.
        return ("default", base_variant.sprite_label)
    
    # Adjust weights based on noise
    adjusted_weights = adjust_weights_for_noise(group.variants, noise_value)

    # Exclude dominant base variant when a tile is selected as a variation tile.
    variant_population = list(group.variants)
    variant_weights = list(adjusted_weights)
    if base_variant is not None:
        filtered = [
            (variant, weight)
            for variant, weight in zip(variant_population, variant_weights)
            if variant.id != base_variant.id
        ]
        if filtered:
            variant_population = [variant for variant, _weight in filtered]
            variant_weights = [weight for _variant, weight in filtered]

    if not variant_population:
        fallback = base_variant if base_variant is not None else group.variants[0]
        return (fallback.id, fallback.sprite_label)

    # Position-aware deterministic randomness so each tile can vary independently.
    # This avoids identical picks across many tiles when called without shared RNG state.
    position_seed = (
        (noise_seed * 73856093)
        ^ (int(x) * 19349663)
        ^ (int(y) * 83492791)
    ) & 0xFFFFFFFF
    # Keep selection deterministic per seed+position and avoid sequence-coupled patterns.
    tile_rng = random.Random(position_seed)

    # Select variant using weighted random choice
    chosen = tile_rng.choices(variant_population, weights=variant_weights, k=1)[0]
    
    return (chosen.id, chosen.sprite_label)


def select_sprite_label(
    terrain_type: str,
    x: int,
    y: int,
    base_seed: Optional[int] = None,
) -> str:
    """
    Convenience function: select and return only the sprite label.
    
    Args:
        terrain_type: Terrain type string
        x, y: Tile coordinates
        base_seed: Optional seed for determinism
    
    Returns:
        Sprite label string (e.g., "stone passage")
    """
    _, sprite_label = select_variant(terrain_type, x, y, base_seed)
    return sprite_label
