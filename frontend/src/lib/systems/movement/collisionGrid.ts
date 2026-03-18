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
   * Gameplay scenes are traversal-grid authoritative.
   */
  buildFromMap(
    _tiles: any[],
    width: number,
    height: number,
    traversalGrid?: any | null,
    options?: { mapMode?: string | null },
  ): void {
    // Reset to all walkable
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(true));
    this.movementCost = Array(height)
      .fill(null)
      .map(() => Array(width).fill(1));

    const mapMode = typeof options?.mapMode === 'string' ? options.mapMode.trim().toLowerCase() : ''
    const aiMode = mapMode === 'ai_generated_image'
    const hasTraversalGrid = Boolean(
      traversalGrid
      && Array.isArray(traversalGrid.cells)
      && traversalGrid.width_cells
      && traversalGrid.height_cells,
    )

    if (hasTraversalGrid) {
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

    // Legacy tile fallback is disabled for gameplay scenes. Lock movement until traversal arrives.
    this.walkable = Array(height)
      .fill(null)
      .map(() => Array(width).fill(false));
    this.movementCost = Array(height)
      .fill(null)
      .map(() => Array(width).fill(Number.POSITIVE_INFINITY));

    if (aiMode) {
      console.warn('[CollisionGrid] AI map mode active but traversal_grid missing; movement grid locked until traversal data arrives.');
    } else {
      console.warn('[CollisionGrid] Non-AI map mode encountered in gameplay scene; legacy tile collision is disabled.');
    }

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
}
