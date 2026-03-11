"""
Movement Validation System

Authoritative movement validation at the engine level.
Checks:
1. Entity exists and is movable
2. Target is in map bounds
3. Target tile is walkable
4. Path exists to target
5. Sufficient movement pool
6. Turn ownership (in combat)
7. Entity placement validity (for spawning)
"""

from typing import Tuple, Optional, List, Any
from dataclasses import dataclass
from .collision_grid import CollisionGrid, NavNode
from .pathfinding import AStarPathfinder


@dataclass
class MovementValidationResult:
    """Result of movement validation."""
    valid: bool
    error: Optional[str]
    path: Optional[List[NavNode]] = None
    distance_feet: Optional[int] = None


class MovementValidator:
    """Validates movement requests at the engine level."""

    @staticmethod
    def validate_move_request(
        entity: Any,
        target_x: int,
        target_y: int,
        collision_grid: CollisionGrid,
        map_data: Any,
        combat_state: Optional[Any] = None,
        check_movement_pool: bool = True,
    ) -> MovementValidationResult:
        """
        Validate a movement request.
        
        Performs comprehensive checks including bounds, walkability, pathfinding,
        movement pool, and turn ownership.
        """
        print(f"[MovementValidator] START: target=({target_x},{target_y})", flush=True)
        
        # Check 1: Entity exists and is movable
        if entity is None:
            print(f"[MovementValidator] FAIL: Entity does not exist", flush=True)
            return MovementValidationResult(
                valid=False, error="Entity does not exist"
            )

        if not getattr(entity, "movable", True):
            print(f"[MovementValidator] FAIL: Entity is not movable", flush=True)
            return MovementValidationResult(
                valid=False, error="Entity is not movable"
            )

        # Check 2: Target in bounds
        if not (0 <= target_x < map_data.width and 0 <= target_y < map_data.height):
            print(f"[MovementValidator] FAIL: Out of bounds ({target_x},{target_y}) vs {map_data.width}x{map_data.height}", flush=True)
            return MovementValidationResult(
                valid=False, error="Target out of bounds"
            )

        # Check 3: Target is walkable
        is_walkable = collision_grid.is_walkable(target_x, target_y)
        tile = map_data.get_tile(target_x, target_y)
        tile_type = tile.tile_type if tile else "NONE"
        tile_blocks = tile.blocks_movement if tile else "N/A"
        print(f"[MovementValidator] Walkability: ({target_x},{target_y}) type={tile_type} blocks_movement={tile_blocks} grid_walkable={is_walkable}", flush=True)
        
        if not is_walkable:
            print(f"[MovementValidator] FAIL: Target tile is not walkable", flush=True)
            return MovementValidationResult(
                valid=False, error="Target tile is not walkable"
            )

        # Check 4: Path exists
        start = NavNode(entity.x, entity.y)
        goal = NavNode(target_x, target_y)
        
        print(f"[MovementValidator] Pathfinding from ({start.x},{start.y}) to ({goal.x},{goal.y})", flush=True)
        # Allow diagonal movement
        path = AStarPathfinder.find_path(collision_grid, start, goal, allow_diagonal=True)
        
        if not path:
            print(f"[MovementValidator] FAIL: No path to target", flush=True)
            return MovementValidationResult(
                valid=False, error="No path to target"
            )

        distance_feet = AStarPathfinder.path_distance(path)
        print(f"[MovementValidator] Path found: {len(path)} nodes, {distance_feet} feet", flush=True)

        current_participant = None
        current_turn_id = None
        if combat_state is not None:
            current_participant = getattr(combat_state, "current_participant", None)
            current_character = getattr(current_participant, "character", None)
            current_turn_id = getattr(current_character, "id", None)

            if current_turn_id and current_turn_id != entity.id:
                print(f"[MovementValidator] FAIL: Not your turn", flush=True)
                return MovementValidationResult(
                    valid=False, error="Not your turn"
                )

        # Check 5: Sufficient movement pool
        if check_movement_pool:
            if current_turn_id == entity.id and current_participant is not None:
                movement_remaining = getattr(current_participant, "movement_remaining", float("inf"))
            else:
                movement_remaining = getattr(entity, "movement_remaining", float("inf"))

            print(f"[MovementValidator] Movement check: have={movement_remaining}, need={distance_feet}", flush=True)
            if movement_remaining < distance_feet:
                print(f"[MovementValidator] FAIL: Insufficient movement pool", flush=True)
                return MovementValidationResult(
                    valid=False,
                    error=f"Insufficient movement pool ({movement_remaining} < {distance_feet})",
                )

        print(f"[MovementValidator] SUCCESS: Move is valid", flush=True)
        return MovementValidationResult(
            valid=True,
            error=None,
            path=path,
            distance_feet=distance_feet,
        )

    @staticmethod
    def validate_entity_placement(
        x: int,
        y: int,
        collision_grid: CollisionGrid,
        map_data: Any,
        exclude_entity_id: Optional[str] = None,
        entities: Optional[List[Any]] = None,
    ) -> Tuple[bool, Optional[Tuple[int, int]]]:
        """
        Validate if an entity can be placed at a location.
        
        Checks:
        1. Tile is walkable
        2. No blocking entity occupies the tile
        
        Args:
            x, y: Placement coordinates
            collision_grid: The collision grid
            map_data: Map data
            exclude_entity_id: Entity ID to exclude from occupancy check
            entities: List of entities (for occupancy checking)
            
        Returns:
            Tuple of (is_valid, fallback_position)
            - is_valid: True if placement is valid
            - fallback_position: Nearest walkable, unoccupied tile (if invalid and found)
        """
        
        # Check bounds
        if not (0 <= x < map_data.width and 0 <= y < map_data.height):
            return False, None

        # Check walkable
        if not collision_grid.is_walkable(x, y):
            fallback = MovementValidator.find_nearest_walkable_tile(
                x, y, collision_grid, map_data, entities, exclude_entity_id, radius=10
            )
            return False, fallback

        # Check occupancy
        if entities:
            for entity in entities:
                if exclude_entity_id and entity.id == exclude_entity_id:
                    continue
                if (
                    getattr(entity, "blocks_movement", False)
                    and entity.x == x
                    and entity.y == y
                ):
                    fallback = MovementValidator.find_nearest_walkable_tile(
                        x, y, collision_grid, map_data, entities, exclude_entity_id
                    )
                    return False, fallback

        return True, None

    @staticmethod
    def find_nearest_walkable_tile(
        from_x: int,
        from_y: int,
        collision_grid: CollisionGrid,
        map_data: Any,
        entities: Optional[List[Any]] = None,
        exclude_entity_id: Optional[str] = None,
        radius: int = 10,
    ) -> Optional[Tuple[int, int]]:
        """
        Find nearest walkable, unoccupied tile within radius.
        
        Uses BFS to search in expanding rings from the origin.
        
        Args:
            from_x, from_y: Origin coordinates
            collision_grid: Collision grid for walkability
            map_data: Map data
            entities: Entities (for occupancy check)
            exclude_entity_id: Entity to exclude from occupancy
            radius: Search radius in tiles
            
        Returns:
            Tuple of (x, y) for nearest valid tile, or None if not found
        """
        from collections import deque

        queue: deque = deque([(from_x, from_y, 0)])
        visited: set = {(from_x, from_y)}

        while queue:
            x, y, dist = queue.popleft()

            if dist > radius:
                continue

            # Check if this tile is valid
            if collision_grid.is_walkable(x, y):
                # Check occupancy
                occupied = False
                if entities:
                    for entity in entities:
                        if exclude_entity_id and entity.id == exclude_entity_id:
                            continue
                        if (
                            getattr(entity, "blocks_movement", False)
                            and entity.x == x
                            and entity.y == y
                        ):
                            occupied = True
                            break

                if not occupied:
                    return (x, y)

            # Explore neighbors
            for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
                nx, ny = x + dx, y + dy
                if (
                    0 <= nx < map_data.width
                    and 0 <= ny < map_data.height
                    and (nx, ny) not in visited
                ):
                    visited.add((nx, ny))
                    queue.append((nx, ny, dist + 1))

        return None
