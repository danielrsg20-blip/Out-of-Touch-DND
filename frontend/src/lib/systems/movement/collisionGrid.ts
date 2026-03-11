/**
 * Collision Grid System (Frontend)
 * 
 * Client-side collision grid for fast local pathfinding validation.
 * Mirrors backend structure for consistency.
 */

export interface NavNode {
  x: number;
  y: number;
}

export class CollisionGrid {
  width: number;
  height: number;
  walkable: boolean[][];
  version: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    // Initialize all tiles as walkable
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(true));
  }

  /**
   * Build collision grid from map tile data.
   * 
   * Marks tiles as non-walkable if:
   * - tile.blocks_movement == true (or derived from type/state)
   * - tile is wall, pit, pillar, rubble, or closed door
   */
  buildFromMap(tiles: any[], width: number, height: number): void {
    // Reset to all walkable
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(true));

    // Mark blocking tiles
    let blockedCount = 0;
    for (const tile of tiles) {
      if (!this.isTileWalkable(tile)) {
        if (tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y < height) {
          this.walkable[tile.y][tile.x] = false;
          blockedCount++;
        }
      }
    }

    // DEBUG: Log tile building
    console.log(`[CollisionGrid] Built from ${tiles.length} tiles, ${blockedCount} blocked. Sample tiles:`, tiles.slice(0, 5).map(t => ({ x: t.x, y: t.y, type: t.type, walkable: this.isTileWalkable(t) })));

    this.version++;
  }

  /**
   * Update collision grid with dynamic entity blocking.
   * 
   * Entities with blocks_movement=True occupy their tile.
   */
  updateEntityBlocking(entities: any[]): void {
    for (const entity of entities) {
      if (entity.blocks_movement && entity.x >= 0 && entity.x < this.width && entity.y >= 0 && entity.y < this.height) {
        this.walkable[entity.y][entity.x] = false;
      }
    }

    this.version++;
  }

  /**
   * Check if a tile is walkable.
   */
  isWalkable(x: number, y: number): boolean {
    if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
      return false;
    }
    return this.walkable[y][x];
  }

  /**
   * Get walkable neighbors of a tile.
   * 
   * Enforces diagonal corner blocking:
   * - Diagonal moves require BOTH adjacent orthogonal tiles to be walkable
   */
  getNeighbors(x: number, y: number, includeDiagonal: boolean = true): NavNode[] {
    const neighbors: NavNode[] = [];

    // Orthogonal neighbors
    if (this.isWalkable(x + 1, y)) neighbors.push({ x: x + 1, y });
    if (this.isWalkable(x - 1, y)) neighbors.push({ x: x - 1, y });
    if (this.isWalkable(x, y + 1)) neighbors.push({ x, y: y + 1 });
    if (this.isWalkable(x, y - 1)) neighbors.push({ x, y: y - 1 });

    if (includeDiagonal) {
      // NE: requires (x+1, y) AND (x, y-1)
      if (
        this.isWalkable(x + 1, y - 1) &&
        this.isWalkable(x + 1, y) &&
        this.isWalkable(x, y - 1)
      ) {
        neighbors.push({ x: x + 1, y: y - 1 });
      }
      // NW: requires (x-1, y) AND (x, y-1)
      if (
        this.isWalkable(x - 1, y - 1) &&
        this.isWalkable(x - 1, y) &&
        this.isWalkable(x, y - 1)
      ) {
        neighbors.push({ x: x - 1, y: y - 1 });
      }
      // SE: requires (x+1, y) AND (x, y+1)
      if (
        this.isWalkable(x + 1, y + 1) &&
        this.isWalkable(x + 1, y) &&
        this.isWalkable(x, y + 1)
      ) {
        neighbors.push({ x: x + 1, y: y + 1 });
      }
      // SW: requires (x-1, y) AND (x, y+1)
      if (
        this.isWalkable(x - 1, y + 1) &&
        this.isWalkable(x - 1, y) &&
        this.isWalkable(x, y + 1)
      ) {
        neighbors.push({ x: x - 1, y: y + 1 });
      }
    }

    return neighbors;
  }

  /**
   * Check if a tile is walkable based on type and state.
   */
  private isTileWalkable(tile: any): boolean {
    // Check explicit blocks_movement property
    if (typeof tile.blocks_movement === "boolean") {
      if (tile.type === "door") {
        const walkable = tile.state !== "closed";
        console.log(`[isTileWalkable] has blocks_movement, door: (${tile.x},${tile.y}) state=${tile.state} walkable=${walkable}`);
        return walkable;
      }
      const walkable = !tile.blocks_movement;
      console.log(`[isTileWalkable] has blocks_movement: (${tile.x},${tile.y}) blocks_movement=${tile.blocks_movement} walkable=${walkable}`);
      return walkable;
    }

    // Fallback to tile type
    const blockingTypes = ["wall", "pit", "pillar", "rubble"];
    if (blockingTypes.includes(tile.type)) {
      console.log(`[isTileWalkable] type-based: (${tile.x},${tile.y}) type=${tile.type} is BLOCKING`);
      return false;
    }

    // Doors block if closed
    if (tile.type === "door") {
      const walkable = tile.state !== "closed";
      console.log(`[isTileWalkable] type-based door: (${tile.x},${tile.y}) state=${tile.state} walkable=${walkable}`);
      return walkable;
    }

    console.log(`[isTileWalkable] type-based other: (${tile.x},${tile.y}) type=${tile.type} is WALKABLE`);
    return true;
  }
}
