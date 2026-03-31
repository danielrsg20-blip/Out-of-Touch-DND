/**
 * useMovement Hook
 *
 * Integrates with Supabase edge function for movement commands.
 * Handles RPC calls, realtime updates, and animation orchestration.
 */

import { useCallback, useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { MovementController } from "../lib/systems/movement/movementController";
import { CollisionGrid } from "../lib/systems/movement/collisionGrid";
import type { NavNode } from "../lib/systems/movement/collisionGrid";
import { resolveMapMode } from "../lib/battlemapState";
import { createMapGridTransform } from "../lib/mapGridTransform";

export interface UseMovementReturn {
  isMoving: boolean;
  error: string | null;
  executeMove: (
    entityId: string,
    targetX: number,
    targetY: number,
  ) => Promise<boolean>;
  calculateReachable: (entityId: string) => Set<string>;
  getPathPreview: (
    entityId: string,
    targetX: number,
    targetY: number,
  ) => NavNode[];
  getPathPreviewWorld: (
    entityId: string,
    targetX: number,
    targetY: number,
  ) => Array<{ x: number; y: number }>;
}

export function useMovement(
  sendMoveToken?: (characterId: string, x: number, y: number) => void,
): UseMovementReturn {
  const gameStore = useGameStore();
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build collision grid from current game state
  const collisionGrid = useCallback(() => {
    const mapData = gameStore.map;
    if (!mapData) return null;

    const grid = new CollisionGrid(mapData.width, mapData.height);
    grid.buildFromMap(
      mapData.tiles,
      mapData.width,
      mapData.height,
      mapData.traversal_grid,
      { mapMode: resolveMapMode(mapData) },
    );

    // Add entity blocking
    if (mapData.entities) {
      grid.updateEntityBlocking(mapData.entities);
    }

    return grid;
  }, [gameStore.map]);

  // Execute movement request
  const executeMove = useCallback(
    async (
      entityId: string,
      targetX: number,
      targetY: number,
    ): Promise<boolean> => {
      const grid = collisionGrid();
      if (!grid || !gameStore.map) {
        setError("Game state not available");
        return false;
      }

      // Validate locally first
      const validation = MovementController.validateLocalMove(
        entityId,
        targetX,
        targetY,
        grid,
        gameStore,
        gameStore.map,
      );

      if (!validation.valid) {
        setError(validation.error || "Invalid move");
        return false;
      }

      setIsMoving(true);
      setError(null);

      try {
        // Call the move function (either edge function or REST endpoint)
        if (!sendMoveToken) {
          throw new Error("Move function not available");
        }

        // sendMoveToken handles the actual RPC/REST call
        // It will emit realtime updates on success
        sendMoveToken(entityId, targetX, targetY);

        return true;
      } catch (err: any) {
        setError(err.message || "Move failed");
        return false;
      } finally {
        setIsMoving(false);
      }
    },
    [gameStore, collisionGrid, sendMoveToken],
  );

  // Calculate reachable tiles for UI overlay
  const calculateReachable = useCallback(
    (entityId: string): Set<string> => {
      if (!gameStore.map) return new Set();
      const entity = gameStore.map.entities.find((e: any) => e.id === entityId);
      if (!entity) return new Set();

      const grid = collisionGrid();
      if (!grid) return new Set();

      // Movement remaining may not be available in EntityData if not in combat
      // In that case, assume unlimited movement for display purposes
      const movementRemaining = (entity as any).movement_remaining || 300; // 300 ft default
      return MovementController.calculateReachableTiles(
        entity.x,
        entity.y,
        movementRemaining,
        grid,
      );
    },
    [gameStore.map, collisionGrid],
  );

  // Get path preview for hover
  const getPathPreview = useCallback(
    (entityId: string, targetX: number, targetY: number): NavNode[] => {
      if (!gameStore.map) return [];
      const entity = gameStore.map.entities.find((e: any) => e.id === entityId);
      if (!entity) return [];

      const grid = collisionGrid();
      if (!grid) return [];

      return MovementController.getPathPreview(
        entity.x,
        entity.y,
        targetX,
        targetY,
        grid,
      );
    },
    [gameStore.map, collisionGrid],
  );

  // Get path preview projected to world-space pixels via shared map-grid transform.
  const getPathPreviewWorld = useCallback(
    (
      entityId: string,
      targetX: number,
      targetY: number,
    ): Array<{ x: number; y: number }> => {
      const mapData = gameStore.map;
      if (!mapData) return [];
      const path = getPathPreview(entityId, targetX, targetY);
      const gridTransform = createMapGridTransform(mapData);
      return path.map((node) =>
        gridTransform.cellToPixelCenter(node.x, node.y),
      );
    },
    [gameStore.map, getPathPreview],
  );

  return {
    isMoving,
    error,
    executeMove,
    calculateReachable,
    getPathPreview,
    getPathPreviewWorld,
  };
}
