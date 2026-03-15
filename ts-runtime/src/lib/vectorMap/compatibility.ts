import type { LegacyEntity, LegacyTile, OverlayPayload, TraversalGrid } from './types.js'

function tileTypeForCell(cell: { traversable: boolean; tags: string[] }): string {
  if (!cell.traversable) {
    if (cell.tags.includes('lava')) return 'pit'
    if (cell.tags.includes('cliff')) return 'wall'
    return 'wall'
  }
  if (cell.tags.includes('water') || cell.tags.includes('water_deep')) return 'water'
  if (cell.tags.includes('deep_mud')) return 'rubble'
  if (cell.tags.includes('trail') || cell.tags.includes('road')) return 'floor'
  return 'floor'
}

export function deriveLegacyTiles(grid: TraversalGrid): { width: number; height: number; tiles: LegacyTile[] } {
  const tiles: LegacyTile[] = grid.cells.map((cell) => {
    const type = tileTypeForCell(cell)
    return {
      x: cell.x,
      y: cell.y,
      type,
      blocks_movement: !cell.traversable,
      blocks_sight: type === 'wall',
    }
  })

  return {
    width: grid.width_cells,
    height: grid.height_cells,
    tiles,
  }
}

export function deriveLegacyEntities(overlay: OverlayPayload): { entities: LegacyEntity[] } {
  const entities: LegacyEntity[] = []
  for (const layer of overlay.layers) {
    for (const element of layer.elements) {
      if (element.type !== 'decal') continue
      entities.push({
        id: element.id,
        name: element.name,
        x: Math.round(element.position.x),
        y: Math.round(element.position.y),
        type: element.decal_type || 'object',
        blocks_movement: (element.tags ?? []).includes('blocked'),
        tags: element.tags ?? undefined,
      })
    }
  }
  return { entities }
}
