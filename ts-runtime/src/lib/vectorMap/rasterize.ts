import type { GridCellData, GridConfig, OverlayPayload, PathElement, Point, RegionElement, TraversalGrid } from './types.js'

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi
    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const ab2 = abx * abx + aby * aby
  if (ab2 === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y)
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
  const cx = a.x + abx * t
  const cy = a.y + aby * t
  return Math.hypot(p.x - cx, p.y - cy)
}

function lineFootprintContains(point: Point, path: PathElement): boolean {
  const halfWidth = Math.max(0.5, path.stroke.width * 0.5)
  for (let i = 0; i < path.points.length - 1; i += 1) {
    if (distancePointToSegment(point, path.points[i]!, path.points[i + 1]!) <= halfWidth) {
      return true
    }
  }
  return false
}

function applyTagRule(cell: GridCellData, tags: string[]): void {
  for (const tag of tags) {
    if (!cell.tags.includes(tag)) {
      cell.tags.push(tag)
    }
    if (tag === 'wall' || tag === 'cliff' || tag === 'blocked' || tag === 'lava' || tag === 'water_deep') {
      if (!cell.movement_blocking_tags.includes(tag)) {
        cell.movement_blocking_tags.push(tag)
      }
      cell.traversable = false
      cell.movement_cost = Math.max(cell.movement_cost, 9999)
    }
    if (tag === 'water' || tag === 'deep_mud' || tag === 'difficult') {
      cell.movement_cost = Math.max(cell.movement_cost, 2)
    }
    if (tag === 'trail' || tag === 'road') {
      cell.movement_cost = Math.min(cell.movement_cost, 0.8)
    }
  }
}

function newCell(x: number, y: number): GridCellData {
  return {
    x,
    y,
    traversable: true,
    movement_cost: 1,
    movement_blocking_tags: [],
    tags: [],
  }
}

export function rasterizeToGrid(overlay: OverlayPayload, gridConfig: GridConfig): TraversalGrid {
  const bounds = overlay.metadata?.world_bounds as { origin_x: number; origin_y: number; width_world: number; height_world: number } | undefined
  const world = bounds ?? { origin_x: 0, origin_y: 0, width_world: 640, height_world: 480 }

  const scale = Math.max(1, Math.floor(gridConfig.resolution_scale || 2))
  const baseCell = Math.max(0.25, gridConfig.base_cell_size_world || 5)
  const cellSize = baseCell / scale

  const widthCells = Math.max(1, Math.floor(world.width_world / cellSize))
  const heightCells = Math.max(1, Math.floor(world.height_world / cellSize))
  const cells: GridCellData[] = []

  for (let y = 0; y < heightCells; y += 1) {
    for (let x = 0; x < widthCells; x += 1) {
      cells.push(newCell(x, y))
    }
  }

  for (const layer of [...overlay.layers].sort((a, b) => a.z_index - b.z_index)) {
    for (const element of layer.elements) {
      const tags = [...(element.tags ?? [])].map((tag) => String(tag))
      if (!tags.length) {
        continue
      }

      if (element.type === 'polygon') {
        const region = element as RegionElement
        for (const cell of cells) {
          const point = {
            x: world.origin_x + (cell.x + 0.5) * cellSize,
            y: world.origin_y + (cell.y + 0.5) * cellSize,
          }
          if (pointInPolygon(point, region.points)) {
            applyTagRule(cell, tags)
          }
        }
      } else if (element.type === 'polyline') {
        const path = element as PathElement
        for (const cell of cells) {
          const point = {
            x: world.origin_x + (cell.x + 0.5) * cellSize,
            y: world.origin_y + (cell.y + 0.5) * cellSize,
          }
          if (lineFootprintContains(point, path)) {
            applyTagRule(cell, tags)
          }
        }
      } else if (element.type === 'decal') {
        const position = element.position
        const radius = 6 * (element.scale ?? 1)
        for (const cell of cells) {
          const point = {
            x: world.origin_x + (cell.x + 0.5) * cellSize,
            y: world.origin_y + (cell.y + 0.5) * cellSize,
          }
          if (Math.hypot(point.x - position.x, point.y - position.y) <= radius) {
            applyTagRule(cell, tags)
          }
        }
      }
    }
  }

  return {
    width_cells: widthCells,
    height_cells: heightCells,
    cell_size_world: cellSize,
    world_bounds: world,
    resolution_scale: scale,
    derivation_version: 'grid-derive-1.0.0',
    cells,
  }
}
