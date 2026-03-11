"""
A* Pathfinding Algorithm

Implements the A* algorithm for finding optimal paths on a grid.
Uses Manhattan distance as the heuristic for 2D grid-based navigation.

Works with the CollisionGrid to respect terrain blocking and diagonal corner rules.
"""

import heapq
from itertools import count
from typing import Optional, List
from .collision_grid import CollisionGrid, NavNode


class AStarPathfinder:
    """A* pathfinding implementation for grid-based maps."""

    @staticmethod
    def find_path(
        collision_grid: CollisionGrid,
        start: NavNode,
        goal: NavNode,
        allow_diagonal: bool = True,
    ) -> List[NavNode]:
        """
        Find optimal path from start to goal using A*.
        
        Args:
            collision_grid: The collision grid representing walkability
            start: Starting position (NavNode)
            goal: Goal position (NavNode)
            allow_diagonal: Whether to allow diagonal movement
            
        Returns:
            List of NavNodes representing the path from start to goal (inclusive).
            Returns empty list [] if no path exists.
            Returns [goal] if start == goal.
        """
        if start == goal:
            return [start]

        # Check if start and goal are walkable
        if not collision_grid.is_walkable(start.x, start.y):
            return []
        if not collision_grid.is_walkable(goal.x, goal.y):
            return []

        # Open set (priority queue) ordered by f-score
        open_set: List[tuple[int, int, NavNode]] = []
        tie_breaker = count()
        heapq.heappush(open_set, (0, next(tie_breaker), start))

        # Track visited nodes
        came_from: dict = {}
        g_score: dict = {start: 0}  # Cost from start to node
        f_score: dict = {start: AStarPathfinder._heuristic(start, goal)}

        open_set_hash: set = {start}

        while open_set:
            current_f, _, current = heapq.heappop(open_set)
            open_set_hash.discard(current)

            if current == goal:
                # Reconstruct path
                return AStarPathfinder._reconstruct_path(came_from, current)

            # Explore neighbors
            neighbors = collision_grid.get_neighbors(current.x, current.y, allow_diagonal)

            for neighbor in neighbors:
                tentative_g = g_score[current] + 1  # Uniform cost: 1 tile = 1 unit

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score[neighbor] = tentative_g + AStarPathfinder._heuristic(neighbor, goal)

                    if neighbor not in open_set_hash:
                        heapq.heappush(open_set, (f_score[neighbor], next(tie_breaker), neighbor))
                        open_set_hash.add(neighbor)

        # No path found
        return []

    @staticmethod
    def can_reach(
        collision_grid: CollisionGrid,
        start: NavNode,
        goal: NavNode,
        allow_diagonal: bool = True,
    ) -> bool:
        """
        Check if a goal is reachable from start without calculating full path.
        
        Args:
            collision_grid: The collision grid
            start: Starting position
            goal: Goal position
            allow_diagonal: Whether to allow diagonal movement
            
        Returns:
            True if a path exists, False otherwise
        """
        path = AStarPathfinder.find_path(
            collision_grid, start, goal, allow_diagonal
        )
        return len(path) > 0

    @staticmethod
    def _heuristic(node: NavNode, goal: NavNode) -> int:
        """Manhattan distance heuristic for 2D grids."""
        return abs(node.x - goal.x) + abs(node.y - goal.y)

    @staticmethod
    def _reconstruct_path(came_from: dict, current: NavNode) -> List[NavNode]:
        """Reconstruct path from start to current using came_from map."""
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    @staticmethod
    def path_distance(path: List[NavNode]) -> int:
        """
        Calculate movement cost in feet for a path.
        
        Each tile traversed costs 5 feet (standard D&D grid).
        Path distance = (number_of_tiles - 1) * 5
        
        Args:
            path: List of NavNodes representing the path
            
        Returns:
            Distance in feet
        """
        if len(path) <= 1:
            return 0
        # Distance between consecutive waypoints is 1 tile = 5 feet
        return (len(path) - 1) * 5
