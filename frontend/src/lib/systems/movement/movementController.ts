/**
 * Movement Controller (Frontend)
 * 
 * Orchestrates movement requests:
 * 1. Client-side validation (using local game state + collision grid)
 * 2. Send request to server (edge function)
 * 3. Handle response (success/error feedback)
 * 4. Coordinate animation
 */

import { CollisionGrid } from "./collisionGrid";
import type { NavNode } from "./collisionGrid";
import { AStarPathfinder } from "./pathfinding";

export interface MovementRequest {
  entityId: string;
  targetX: number;
  targetY: number;
}

export interface MovementResponse {
  success: boolean;
  error?: string;
  path?: NavNode[];
  distanceFeet?: number;
}

export class MovementController {
  /**
   * Validate a movement request at the client level.
   * 
   * Performs local validation using collision grid and current game state.
   * Does NOT deduct movement or change entity position.
   * Server performs authoritative validation.
   */
  static validateLocalMove(
    entityId: string,
    targetX: number,
    targetY: number,
    collisionGrid: CollisionGrid,
    gameState: any,
    mapData: any
  ): { valid: boolean; error?: string; path?: NavNode[] } {
    console.log(`[validateLocalMove] START: entity=${entityId}, target=(${targetX},${targetY})`);
    
    const entity = gameState.entities?.find((e: any) => e.id === entityId);

    if (!entity) {
      console.log(`[validateLocalMove] FAIL: Entity not found`);
      return { valid: false, error: "Entity not found" };
    }

    if (!mapData) {
      console.log(`[validateLocalMove] FAIL: Map data not available`);
      return { valid: false, error: "Map data not available" };
    }

    // Check bounds
    if (!(targetX >= 0 && targetX < mapData.width && targetY >= 0 && targetY < mapData.height)) {
      console.log(`[validateLocalMove] FAIL: Out of bounds`);
      return { valid: false, error: "Target out of bounds" };
    }

    // Check walkable
    const isWalkable = collisionGrid.isWalkable(targetX, targetY);
    console.log(`[validateLocalMove] Walkability check: (${targetX},${targetY}) = ${isWalkable}`);
    if (!isWalkable) {
      console.log(`[validateLocalMove] FAIL: Target tile is not walkable`);
      return { valid: false, error: "Target tile is not walkable" };
    }

    // Find path
    const start: NavNode = { x: entity.x, y: entity.y };
    const goal: NavNode = { x: targetX, y: targetY };
    console.log(`[validateLocalMove] Pathfinding from (${start.x},${start.y}) to (${goal.x},${goal.y})`);
    const path = AStarPathfinder.findPath(collisionGrid, start, goal, true);

    if (!path || path.length === 0) {
      console.log(`[validateLocalMove] FAIL: No path to target`);
      return { valid: false, error: "No path to target" };
    }

    console.log(`[validateLocalMove] Path found: ${path.length} nodes`);

    // Check movement pool ONLY during active combat
    const isInCombat = gameState.combat?.is_active || false;
    if (isInCombat) {
      const pathDistance = AStarPathfinder.pathDistance(path);
      const movementRemaining = entity.movement_remaining || 0;

      console.log(`[validateLocalMove] In combat - Movement check: have=${movementRemaining}, need=${pathDistance}`);
      if (movementRemaining < pathDistance) {
        console.log(`[validateLocalMove] FAIL: Insufficient movement`);
        return {
          valid: false,
          error: `Insufficient movement (${movementRemaining} < ${pathDistance} ft)`,
        };
      }
    } else {
      console.log(`[validateLocalMove] Not in combat - skipping movement pool check`);
    }

    console.log(`[validateLocalMove] SUCCESS: Move is valid`);
    return { valid: true, path };
  }

  /**
   * Calculate reachable tiles within movement range.
   * 
   * Used for rendering the reachability overlay.
   * Returns set of tile coordinates (as "x,y" strings) that are reachable.
   */
  static calculateReachableTiles(
    entityX: number,
    entityY: number,
    movementRemaining: number,
    collisionGrid: CollisionGrid
  ): Set<string> {
    const reachable = new Set<string>();
    const queue: Array<{ node: NavNode; distance: number }> = [];
    const visited = new Set<string>();

    const start: NavNode = { x: entityX, y: entityY };
    queue.push({ node: start, distance: 0 });
    visited.add(`${start.x},${start.y}`);
    reachable.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const { node, distance } = queue.shift()!;
      const neighbors = collisionGrid.getNeighbors(node.x, node.y, true);

      for (const neighbor of neighbors) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (visited.has(key)) continue;

        visited.add(key);
        const newDistance = distance + 5; // 5 feet per tile

        if (newDistance <= movementRemaining) {
          reachable.add(key);
          queue.push({ node: neighbor, distance: newDistance });
        }
      }
    }

    return reachable;
  }

  /**
   * Get the path that would be taken to reach a tile.
   * 
   * Used for path preview on hover.
   */
  static getPathPreview(
    entityX: number,
    entityY: number,
    targetX: number,
    targetY: number,
    collisionGrid: CollisionGrid
  ): NavNode[] {
    const start: NavNode = { x: entityX, y: entityY };
    const goal: NavNode = { x: targetX, y: targetY };
    return AStarPathfinder.findPath(collisionGrid, start, goal, true);
  }
}
