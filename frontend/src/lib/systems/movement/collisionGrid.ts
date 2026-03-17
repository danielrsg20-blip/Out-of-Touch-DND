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
  movementCost: number[][];
  version: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    // Initialize all tiles as walkable
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(true));
    this.movementCost = Array(height)
      .fill(null)
      .map(() => Array(width).fill(1));
  }

  /**
   * Build collision grid from map tile data.
   * 
   * Marks tiles as non-walkable if:
   * - tile.blocks_movement == true (or derived from type/state)
   * - tile is wall, pit, pillar, rubble, or closed door
   */
  buildFromMap(tiles: any[], width: number, height: number, traversalGrid?: any | null): void {
    // Reset to all walkable
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(true));
    this.movementCost = Array(height)
      .fill(null)
      .map(() => Array(width).fill(1));

    if (traversalGrid && Array.isArray(traversalGrid.cells) && traversalGrid.width_cells && traversalGrid.height_cells) {
      const scaleX = Number(traversalGrid.width_cells) / Math.max(1, width)
      const scaleY = Number(traversalGrid.height_cells) / Math.max(1, height)
      const cellsByKey = new Map<string, any>()
      for (const cell of traversalGrid.cells) {
        cellsByKey.set(`${cell.x},${cell.y}`, cell)
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx0 = Math.floor(x * scaleX)
          const sx1 = Math.max(sx0, Math.floor((x + 1) * scaleX) - 1)
          const sy0 = Math.floor(y * scaleY)
          const sy1 = Math.max(sy0, Math.floor((y + 1) * scaleY) - 1)
          let anyTraversable = false
          let maxCost = 1

          for (let sy = sy0; sy <= sy1; sy++) {
            for (let sx = sx0; sx <= sx1; sx++) {
              const cell = cellsByKey.get(`${sx},${sy}`)
              if (!cell) continue
              if (cell.traversable) {
                anyTraversable = true
                const candidate = Number.isFinite(cell.movement_cost) ? Number(cell.movement_cost) : 1
                maxCost = Math.max(maxCost, candidate)
              }
            }
          }

          this.walkable[y][x] = anyTraversable
          this.movementCost[y][x] = Math.max(1, maxCost)
        }
      }

      this.version++
      return
    }

    // Mark blocking tiles
    let blockedCount = 0;
    for (const tile of tiles) {
      if (!this.isTileWalkable(tile)) {
        if (tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y < height) {
          this.walkable[tile.y][tile.x] = false;
          this.movementCost[tile.y][tile.x] = Number.POSITIVE_INFINITY;
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

  getMovementCost(x: number, y: number): number {
    if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
      return Number.POSITIVE_INFINITY
    }
    return this.movementCost[y][x]
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
