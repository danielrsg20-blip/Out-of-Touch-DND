"""
Collision Grid System

Represents the walkability of the map as a 2D boolean grid derived from:
- Terrain tile properties (walls, pits, rubble, etc.)
- Entity positions and blocking properties

Cached for performance; invalidated when entities move/spawn/despawn.
"""

from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass


@dataclass
class NavNode:
    """Represents a position on the navigation grid."""
    x: int
    y: int

    def __eq__(self, other):
        if not isinstance(other, NavNode):
            return False
        return self.x == other.x and self.y == other.y

    def __hash__(self):
        return hash((self.x, self.y))


class CollisionGrid:
    """
    2D grid representing walkability at each tile position.
    
    Structure:
    - walkable[y][x] = True if tile is traversable, False if blocked
    - Includes terrain blocking + entity occupancy
    """

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        # Initialize all tiles as walkable
        self.walkable: List[List[bool]] = [
            [True for _ in range(width)] for _ in range(height)
        ]
        self.version: int = 0  # Cache-busting version number

    def build_from_map(self, map_data) -> None:
        """
        Build collision grid from map data.
        
        Marks tiles as non-walkable if:
        - tile.blocks_movement == True
        - tile is a wall, pit, pillar, rubble
        - tile is a door with state="closed"
        
        Args:
            map_data: Map object with tiles dict and width/height
        """
        # Reset to all walkable
        self.walkable = [
            [True for _ in range(self.width)] for _ in range(self.height)
        ]

        # Iterate through all tiles and mark blocking tiles
        for (x, y), tile in map_data.tiles.items():
            if not self._is_tile_walkable(tile):
                if 0 <= x < self.width and 0 <= y < self.height:
                    self.walkable[y][x] = False

        self.version += 1

    def update_entity_blocking(self, entities: List) -> None:
        """
        Update collision grid with dynamic entity blocking.
        
        Entities with blocks_movement=True occupy their tile and make it unwalkable.
        This is called after entity positions change.
        
        Args:
            entities: List of entity objects with x, y, blocks_movement properties
        """
        # First, rebuild terrain blocking (don't rely on cumulative state)
        # This is a simplified version; in production, you'd rebuild from map_data
        # For now, we track entity blocking separately
        
        for entity in entities:
            if hasattr(entity, "blocks_movement") and entity.blocks_movement:
                x = getattr(entity, "x", None)
                y = getattr(entity, "y", None)
                if x is not None and y is not None:
                    if 0 <= x < self.width and 0 <= y < self.height:
                        self.walkable[y][x] = False

        self.version += 1

    def is_walkable(self, x: int, y: int) -> bool:
        """Check if a tile is walkable."""
        if not (0 <= x < self.width and 0 <= y < self.height):
            return False
        return self.walkable[y][x]

    def get_neighbors(
        self, x: int, y: int, include_diagonal: bool = True
    ) -> List[NavNode]:
        """
        Get walkable neighbors of a tile.
        
        Enforces diagonal corner blocking:
        - A diagonal move requires BOTH adjacent orthogonal tiles to be walkable.
        - E.g., moving NE from (x, y) to (x+1, y-1) requires:
          - (x+1, y) walkable (right)
          - (x, y-1) walkable (up)
        
        Args:
            x, y: Tile coordinates
            include_diagonal: Whether to include diagonal neighbors
            
        Returns:
            List of walkable NavNode neighbors
        """
        neighbors: List[NavNode] = []

        # Orthogonal neighbors (always check these)
        # Right
        if self.is_walkable(x + 1, y):
            neighbors.append(NavNode(x + 1, y))
        # Left
        if self.is_walkable(x - 1, y):
            neighbors.append(NavNode(x - 1, y))
        # Down
        if self.is_walkable(x, y + 1):
            neighbors.append(NavNode(x, y + 1))
        # Up
        if self.is_walkable(x, y - 1):
            neighbors.append(NavNode(x, y - 1))

        if include_diagonal:
            # Diagonal neighbors with corner blocking rules
            # NE: (x+1, y-1) — requires (x+1, y) AND (x, y-1) walkable
            if self.is_walkable(x + 1, y - 1) and self.is_walkable(x + 1, y) and self.is_walkable(x, y - 1):
                neighbors.append(NavNode(x + 1, y - 1))
            # NW: (x-1, y-1) — requires (x-1, y) AND (x, y-1) walkable
            if self.is_walkable(x - 1, y - 1) and self.is_walkable(x - 1, y) and self.is_walkable(x, y - 1):
                neighbors.append(NavNode(x - 1, y - 1))
            # SE: (x+1, y+1) — requires (x+1, y) AND (x, y+1) walkable
            if self.is_walkable(x + 1, y + 1) and self.is_walkable(x + 1, y) and self.is_walkable(x, y + 1):
                neighbors.append(NavNode(x + 1, y + 1))
            # SW: (x-1, y+1) — requires (x-1, y) AND (x, y+1) walkable
            if self.is_walkable(x - 1, y + 1) and self.is_walkable(x - 1, y) and self.is_walkable(x, y + 1):
                neighbors.append(NavNode(x - 1, y + 1))

        return neighbors

    @staticmethod
    def _is_tile_walkable(tile) -> bool:
        """
        Determine if a tile is walkable based on its type and state.
        
        Returns True if walkable, False if blocking.
        """
        # Check explicit blocks_movement property first
        if hasattr(tile, "blocks_movement"):
            blocks = getattr(tile, "blocks_movement", False)
            # Special case: doors block only if state == "closed"
            tile_type = getattr(tile, "tile_type", getattr(tile, "type", "floor"))
            if tile_type == "door":
                state = getattr(tile, "state", None)
                return state != "closed"
            return not blocks

        # Fallback to tile type (check both tile_type and type for compatibility)
        tile_type = getattr(tile, "tile_type", getattr(tile, "type", "floor"))
        blocking_types = {"wall", "pit", "pillar", "rubble"}
        
        if tile_type in blocking_types:
            return False
        
        # Doors block if closed
        if tile_type == "door":
            state = getattr(tile, "state", None)
            return state != "closed"

        return True
