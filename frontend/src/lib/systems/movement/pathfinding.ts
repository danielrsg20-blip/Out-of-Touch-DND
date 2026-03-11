/**
 * A* Pathfinding Algorithm (Frontend)
 * 
 * Client-side A* for fast local pathfinding.
 * Used for reachability visualization and move validation before server submission.
 */

import { CollisionGrid } from "./collisionGrid";
import type { NavNode } from "./collisionGrid";

export interface PathfindingResult {
  path: NavNode[] | null;
  distance: number | null;
  error?: string;
}

export class AStarPathfinder {
  /**
   * Find optimal path from start to goal using A*.
   */
  static findPath(
    collisionGrid: CollisionGrid,
    start: NavNode,
    goal: NavNode,
    allowDiagonal: boolean = true
  ): NavNode[] {
    if (start.x === goal.x && start.y === goal.y) {
      return [start];
    }

    // Check walkability
    if (!collisionGrid.isWalkable(start.x, start.y)) {
      return [];
    }
    if (!collisionGrid.isWalkable(goal.x, goal.y)) {
      return [];
    }

    // Open set (min-heap by f-score)
    const openSet: Array<{ fScore: number; node: NavNode }> = [];
    openSet.push({ fScore: this.heuristic(start, goal), node: start });

    const cameFrom = new Map<string, NavNode>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const openSetHash = new Set<string>();

    const key = (node: NavNode) => `${node.x},${node.y}`;
    const startKey = key(start);
    const goalKey = key(goal);

    gScore.set(startKey, 0);
    fScore.set(startKey, this.heuristic(start, goal));
    openSetHash.add(startKey);

    while (openSet.length > 0) {
      // Pop node with lowest f-score
      openSet.sort((a, b) => a.fScore - b.fScore);
      const { node: current } = openSet.shift()!;
      const currentKey = key(current);

      if (currentKey === goalKey) {
        return this.reconstructPath(cameFrom, current);
      }

      openSetHash.delete(currentKey);

      // Explore neighbors
      const neighbors = collisionGrid.getNeighbors(current.x, current.y, allowDiagonal);

      for (const neighbor of neighbors) {
        const neighborKey = key(neighbor);
        const tentativeG = (gScore.get(currentKey) || 0) + 1;

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)!) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          const f = tentativeG + this.heuristic(neighbor, goal);
          fScore.set(neighborKey, f);

          if (!openSetHash.has(neighborKey)) {
            openSet.push({ fScore: f, node: neighbor });
            openSetHash.add(neighborKey);
          }
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Check if a goal is reachable from start.
   */
  static canReach(
    collisionGrid: CollisionGrid,
    start: NavNode,
    goal: NavNode,
    allowDiagonal: boolean = true
  ): boolean {
    const path = this.findPath(collisionGrid, start, goal, allowDiagonal);
    return path.length > 0;
  }

  /**
   * Calculate movement cost in feet for a path.
   * 
   * Each tile costs 5 feet (standard D&D grid).
   * distance = (path.length - 1) * 5
   */
  static pathDistance(path: NavNode[]): number {
    if (path.length <= 1) {
      return 0;
    }
    return (path.length - 1) * 5;
  }

  /**
   * Manhattan distance heuristic.
   */
  private static heuristic(node: NavNode, goal: NavNode): number {
    return Math.abs(node.x - goal.x) + Math.abs(node.y - goal.y);
  }

  /**
   * Reconstruct path from start to current using came_from map.
   */
  private static reconstructPath(
    cameFrom: Map<string, NavNode>,
    current: NavNode
  ): NavNode[] {
    const path: NavNode[] = [current];
    const key = (node: NavNode) => `${node.x},${node.y}`;
    let currentKey = key(current);

    while (cameFrom.has(currentKey)) {
      current = cameFrom.get(currentKey)!;
      path.push(current);
      currentKey = key(current);
    }

    path.reverse();
    return path;
  }
}
