"""
Procedural noise generation for terrain variant clustering.

Provides deterministic Perlin noise evaluation at tile coordinates, enabling
natural-looking clusters of terrain variants (high-noise areas get cracked/rubble,
low-noise areas get pristine/clean variants).
"""

import hashlib
import struct
from typing import Tuple


# ==============================================================================
# SEEDED PERLIN NOISE IMPLEMENTATION
# ==============================================================================
# Fast, deterministic 2D Perlin noise using hash-based gradients.
# Same seed + position always produces same noise value.

class PerlinNoise:
    """
    Deterministic 2D Perlin noise generator seeded with an integer.
    
    Uses a permutation table generated from the seed, ensuring consistent
    noise values across multiple evaluations with the same seed.
    """
    
    # Permutation table size (power of 2, usually 256)
    PERM_SIZE = 256
    
    # Gradient vectors for 2D Perlin (unit directions)
    GRADIENTS = [
        (1, 1), (1, -1), (-1, 1), (-1, -1),
        (1, 0), (-1, 0), (0, 1), (0, -1),
    ]
    
    def __init__(self, seed: int):
        """
        Initialize noise generator with seed.
        
        Args:
            seed: Integer seed value. Same seed always produces same noise.
        """
        self.seed = seed
        # Generate deterministic permutation table from seed
        self.p = self._make_permutation_table(seed)
    
    def _make_permutation_table(self, seed: int) -> list[int]:
        """
        Create a deterministic 256-entry permutation table from seed.
        
        Args:
            seed: Integer seed
        
        Returns:
            List of 256 unique integers [0-255], seeded with hash(seed)
        """
        # Use SHA256 hash of seed to get deterministic randomness
        h = hashlib.sha256(struct.pack('>Q', seed & 0xFFFFFFFFFFFFFFFF)).digest()
        
        # Create initial range [0, 1, 2, ..., 255]
        perm = list(range(self.PERM_SIZE))
        
        # Shuffle using hash bytes as pseudo-random source
        for i in range(self.PERM_SIZE):
            j = (i + int.from_bytes(h[i % len(h):i % len(h) + 1], 'big')) % self.PERM_SIZE
            perm[i], perm[j] = perm[j], perm[i]
        
        return perm
    
    def _gradient(self, hash_val: int, dx: float, dy: float) -> float:
        """
        Compute dot product of gradient vector with offset vector.
        
        Args:
            hash_val: Hash value (0-7) selecting gradient vector
            dx: X offset from grid point
            dy: Y offset from grid point
        
        Returns:
            Dot product (float)
        """
        grad = self.GRADIENTS[hash_val & 7]
        return grad[0] * dx + grad[1] * dy
    
    def _interpolate(self, t: float) -> float:
        """
        Smoothstep interpolation function (3t² - 2t³).
        Smooth easing for interpolation.
        
        Args:
            t: Interpolation parameter [0, 1]
        
        Returns:
            Smoothed value [0, 1]
        """
        return t * t * (3 - 2 * t)
    
    def eval(self, x: float, y: float) -> float:
        """
        Evaluate 2D Perlin noise at (x, y).
        
        Args:
            x, y: Coordinates to evaluate at
        
        Returns:
            Noise value in range [-1, 1] (approximately)
        """
        # Grid cell coordinates
        xi = int(x) & 0xFF
        yi = int(y) & 0xFF
        
        # Local coordinates within grid cell [0, 1]
        xf = x - int(x)
        yf = y - int(y)
        
        # Hash values at four corners of grid cell
        n00 = self.p[(self.p[xi] + yi) & 0xFF]
        n01 = self.p[(self.p[xi] + yi + 1) & 0xFF]
        n10 = self.p[(self.p[xi + 1] + yi) & 0xFF]
        n11 = self.p[(self.p[xi + 1] + yi + 1) & 0xFF]
        
        # Gradient dot products at four corners
        g00 = self._gradient(n00, xf, yf)
        g10 = self._gradient(n10, xf - 1, yf)
        g01 = self._gradient(n01, xf, yf - 1)
        g11 = self._gradient(n11, xf - 1, yf - 1)
        
        # Interpolation parameters
        sx = self._interpolate(xf)
        sy = self._interpolate(yf)
        
        # Bilinear interpolation
        n0 = g00 * (1 - sx) + g10 * sx
        n1 = g01 * (1 - sx) + g11 * sx
        result = n0 * (1 - sy) + n1 * sy
        
        # Normalize to approximately [0, 1] range
        # (Perlin noise output is roughly [-0.7, 0.7], we stretch to [-1, 1])
        return (result + 1.0) / 2.0
    
    def __call__(self, x: float, y: float) -> float:
        """Allow PerlinNoise instance to be called directly."""
        return self.eval(x, y)


# ==============================================================================
# FRACTAL BROWNIAN MOTION (Octaves)
# ==============================================================================
# Combine multiple noise octaves for more natural terrain variation.

def eval_noise_at(x: int, y: int, seed: int, octaves: int = 2, persistence: float = 0.5) -> float:
    """
    Evaluate multi-octave Perlin noise at tile coordinates.
    
    Combines multiple noise scales using fractal Brownian motion (fBm),
    producing more natural-looking variation than single-octave noise.
    
    Args:
        x, y: Tile grid coordinates
        seed: Deterministic seed
        octaves: Number of noise octaves to combine (2-3 recommended)
        persistence: How much each octave contributes (0.5 = previous octave × 0.5 amplitude)
    
    Returns:
        Noise value in range [0, 1]
    """
    noise = PerlinNoise(seed)
    
    value = 0.0
    amplitude = 1.0
    frequency = 1.0
    max_value = 0.0
    
    for _ in range(octaves):
        value += noise(x * frequency / 10.0, y * frequency / 10.0) * amplitude
        max_value += amplitude
        amplitude *= persistence
        frequency *= 2.0
    
    # Normalize to [0, 1]
    return value / max_value if max_value > 0 else 0.5


# ==============================================================================
# HASH-BASED SEEDING
# ==============================================================================
# Deterministic seed hashing for position-specific noise.

def hash_seed(base_seed: int, x: int, y: int) -> int:
    """
    Create a deterministic hash-based seed for a specific tile position.
    
    Used to seed the RNG for variant selection at (x, y) such that the
    same base_seed always produces the same variant at each position.
    
    Args:
        base_seed: Base seed value
        x, y: Tile coordinates
    
    Returns:
        Integer seed for this position
    """
    # Combine seed + position using XOR mixing
    combined = base_seed ^ (x << 16) ^ y
    
    # Use SHA256 to hash the combination
    h = hashlib.sha256(struct.pack('>Q', combined & 0xFFFFFFFFFFFFFFFF)).digest()
    
    # Extract first 4 bytes as integer
    return int.from_bytes(h[:4], 'big', signed=False)
