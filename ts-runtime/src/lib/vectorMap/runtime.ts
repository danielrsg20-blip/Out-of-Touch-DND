import type { JsonRecord, TraversalGrid } from './types.js'

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getTraversalGridFromMap(map: JsonRecord | null): TraversalGrid | null {
  if (!map) {
    return null
  }

  const metadata = asRecord(map.metadata)
  const candidate = asRecord(map.traversal_grid) ?? asRecord(metadata?.traversal_grid)
  if (!candidate || !Array.isArray(candidate.cells)) {
    return null
  }

  const width = asNumber(candidate.width_cells)
  const height = asNumber(candidate.height_cells)
  const cellSizeWorld = asNumber(candidate.cell_size_world)
  if (width === null || height === null || cellSizeWorld === null || width <= 0 || height <= 0 || cellSizeWorld <= 0) {
    return null
  }

  return candidate as unknown as TraversalGrid
}

export function buildWalkableMatrixFromTraversalGrid(traversal: TraversalGrid, mapWidth: number, mapHeight: number): boolean[][] {
  const walkable = Array.from({ length: mapHeight }, () => Array.from({ length: mapWidth }, () => false))
  const byKey = new Map<string, { traversable: boolean }>()
  for (const cell of traversal.cells) {
    byKey.set(`${cell.x},${cell.y}`, cell)
  }

  const scaleX = traversal.width_cells / Math.max(1, mapWidth)
  const scaleY = traversal.height_cells / Math.max(1, mapHeight)

  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      const sx0 = Math.floor(x * scaleX)
      const sx1 = Math.max(sx0, Math.floor((x + 1) * scaleX) - 1)
      const sy0 = Math.floor(y * scaleY)
      const sy1 = Math.max(sy0, Math.floor((y + 1) * scaleY) - 1)

      let anyTraversable = false
      for (let sy = sy0; sy <= sy1 && !anyTraversable; sy += 1) {
        for (let sx = sx0; sx <= sx1; sx += 1) {
          const sub = byKey.get(`${sx},${sy}`)
          if (sub?.traversable) {
            anyTraversable = true
            break
          }
        }
      }

      walkable[y]![x] = anyTraversable
    }
  }

  return walkable
}

export function movementFeetPerStepFromTraversalGrid(traversal: TraversalGrid, mapWidth: number, mapHeight: number): number {
  const scaleX = traversal.width_cells / Math.max(1, mapWidth)
  const scaleY = traversal.height_cells / Math.max(1, mapHeight)
  const aggregateScale = Math.max(1, Math.max(scaleX, scaleY))
  return traversal.cell_size_world * aggregateScale
}

function cellByKey(traversal: TraversalGrid): Map<string, TraversalGrid['cells'][number]> {
  return new Map(traversal.cells.map((cell) => [`${cell.x},${cell.y}`, cell]))
}

export function hasLineOfSightOnTraversalGrid(
  traversal: TraversalGrid,
  start: { x: number; y: number },
  goal: { x: number; y: number },
): boolean {
  const cells = cellByKey(traversal)
  let x0 = Math.trunc(start.x)
  let y0 = Math.trunc(start.y)
  const x1 = Math.trunc(goal.x)
  const y1 = Math.trunc(goal.y)
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    const current = cells.get(`${x0},${y0}`)
    if (!current) {
      return false
    }
    const isEndpoint = x0 === Math.trunc(start.x) && y0 === Math.trunc(start.y)
      || x0 === x1 && y0 === y1
    if (!isEndpoint && (!current.traversable || current.movement_blocking_tags.includes('wall') || current.movement_blocking_tags.includes('blocked'))) {
      return false
    }
    if (x0 === x1 && y0 === y1) {
      return true
    }
    const e2 = err * 2
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
}

export function calculateTraversalPathWorldCost(
  traversal: TraversalGrid,
  path: Array<{ x: number; y: number }>,
): number {
  if (path.length <= 1) {
    return 0
  }

  const cells = cellByKey(traversal)
  let total = 0
  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1]!
    const current = path[i]!
    const cell = cells.get(`${current.x},${current.y}`)
    if (!cell) {
      return Number.POSITIVE_INFINITY
    }
    const diagonal = prev.x !== current.x && prev.y !== current.y
    const stepWorld = traversal.cell_size_world * (diagonal ? Math.SQRT2 : 1)
    total += stepWorld * Math.max(1, cell.movement_cost)
  }
  return total
}