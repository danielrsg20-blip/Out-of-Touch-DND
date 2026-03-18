import type { FrontendTraversalGrid, MapData, MapMetadata, MapMode } from '../types'

type JsonRecord = Record<string, unknown>

type BattlemapAssetLike = {
  id?: string
  image_url?: string
  image_width_px?: number
  image_height_px?: number
  traversal_grid?: FrontendTraversalGrid
  grid_overlay_config?: {
    cell_size_world?: number
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

export const MAP_MODE_AI: MapMode = 'ai_generated_image'

function normalizeMapMode(value: unknown): MapMode | null {
  if (typeof value !== 'string') {
    return null
  }
  const mode = value.trim().toLowerCase()
  if (mode === MAP_MODE_AI) {
    return MAP_MODE_AI
  }
  if (mode === 'legacy_procedural_tiles') {
    console.warn('[battlemapState] legacy map_mode received; forcing ai_generated_image')
    return MAP_MODE_AI
  }
  return null
}

export function inferMapMode(metadata: MapMetadata | null | undefined, traversalGrid?: FrontendTraversalGrid | null): MapMode {
  const explicitMode = normalizeMapMode(metadata?.map_mode)
  if (explicitMode) {
    return explicitMode
  }

  const imageUrl = typeof metadata?.image_url === 'string' ? metadata.image_url.trim() : ''
  const mapSource = typeof metadata?.map_source === 'string' ? metadata.map_source.trim().toLowerCase() : ''
  const hasTraversalCells = Boolean(traversalGrid && Array.isArray((traversalGrid as any).cells) && (traversalGrid as any).cells.length > 0)

  const generationStatus = typeof metadata?.generation_status === 'string'
    ? metadata.generation_status.trim().toLowerCase()
    : ''

  if (imageUrl || hasTraversalCells || mapSource.includes('vector') || mapSource === 'generated' || generationStatus === 'pending' || generationStatus === 'ready') {
    return MAP_MODE_AI
  }

  // Gameplay maps are AI-first: never route back to legacy terrain mode.
  return MAP_MODE_AI
}

function deriveGridMetadata(
  metadata: MapMetadata,
  traversalGrid: FrontendTraversalGrid | null | undefined,
): Pick<MapMetadata, 'grid_width_cells' | 'grid_height_cells' | 'grid_cell_size_px'> {
  const widthCells = Number((traversalGrid as any)?.width_cells ?? metadata.grid_width_cells ?? 0)
  const heightCells = Number((traversalGrid as any)?.height_cells ?? metadata.grid_height_cells ?? 0)
  const imageWidthPx = Number(metadata.image_width_px ?? 0)
  const imageHeightPx = Number(metadata.image_height_px ?? 0)

  const normalizedWidthCells = Number.isFinite(widthCells) && widthCells > 0
    ? Math.trunc(widthCells)
    : undefined
  const normalizedHeightCells = Number.isFinite(heightCells) && heightCells > 0
    ? Math.trunc(heightCells)
    : undefined

  let gridCellSizePx = Number(metadata.grid_cell_size_px ?? 0)
  if ((!Number.isFinite(gridCellSizePx) || gridCellSizePx <= 0) && normalizedWidthCells && normalizedHeightCells && imageWidthPx > 0 && imageHeightPx > 0) {
    const byWidth = imageWidthPx / normalizedWidthCells
    const byHeight = imageHeightPx / normalizedHeightCells
    gridCellSizePx = Math.min(byWidth, byHeight)
  }

  return {
    grid_width_cells: normalizedWidthCells,
    grid_height_cells: normalizedHeightCells,
    grid_cell_size_px: Number.isFinite(gridCellSizePx) && gridCellSizePx > 0 ? gridCellSizePx : undefined,
  }
}

export function resolveMapMode(map: MapData | null | undefined): MapMode {
  return inferMapMode(map?.metadata, map?.traversal_grid)
}

export function isAIGeneratedMap(map: MapData | null | undefined): boolean {
  return resolveMapMode(map) === MAP_MODE_AI
}

export function extractTraversalGridFromPayload(payload: Record<string, unknown>): FrontendTraversalGrid | null {
  const direct = asRecord(payload.traversal_grid)
  if (direct) return direct as unknown as FrontendTraversalGrid

  const map = asRecord(payload.map)
  const fromMap = map ? asRecord(map.traversal_grid) : null
  if (fromMap) return fromMap as unknown as FrontendTraversalGrid

  const asset = asRecord(payload.battlemap_asset)
  const fromAsset = asset ? asRecord(asset.traversal_grid) : null
  if (fromAsset) return fromAsset as unknown as FrontendTraversalGrid

  return null
}

export function mergeBattlemapAssetIntoMap(map: MapData | null, battlemapAssetRaw: unknown): MapData | null {
  if (!map) return map

  const battlemapAsset = asRecord(battlemapAssetRaw) as BattlemapAssetLike | null
  if (!battlemapAsset) {
    return map
  }

  const traversalGrid = battlemapAsset.traversal_grid ?? map.traversal_grid
  const metadataCandidate: MapMetadata = {
    ...(map.metadata ?? {}),
    map_id: typeof battlemapAsset.id === 'string' ? battlemapAsset.id : map.metadata?.map_id,
    battlemap_id: typeof battlemapAsset.id === 'string' ? battlemapAsset.id : map.metadata?.battlemap_id,
    image_url: typeof battlemapAsset.image_url === 'string' ? battlemapAsset.image_url : map.metadata?.image_url,
    image_width_px: typeof battlemapAsset.image_width_px === 'number' ? battlemapAsset.image_width_px : map.metadata?.image_width_px,
    image_height_px: typeof battlemapAsset.image_height_px === 'number' ? battlemapAsset.image_height_px : map.metadata?.image_height_px,
    image_opacity: map.metadata?.image_opacity ?? 1,
    map_source: typeof map.metadata?.map_source === 'string' ? map.metadata.map_source : 'generated',
  }

  const metadata: MapMetadata = {
    ...metadataCandidate,
    ...deriveGridMetadata(metadataCandidate, traversalGrid),
    map_mode: inferMapMode(metadataCandidate, traversalGrid),
  }

  const merged: MapData = {
    ...map,
    metadata,
  }

  if (traversalGrid) {
    merged.traversal_grid = traversalGrid
  }

  return merged
}

export function resolveBattlemapId(map: MapData | null): string | null {
  if (!map?.metadata) {
    return null
  }
  const metadata = map.metadata as MapMetadata
  if (typeof metadata.battlemap_id === 'string' && metadata.battlemap_id.trim()) {
    return metadata.battlemap_id
  }
  if (typeof metadata.map_id === 'string' && metadata.map_id.trim()) {
    return metadata.map_id
  }
  return null
}

export function applyBattlemapResponseToMap(map: MapData | null, payload: Record<string, unknown>): MapData | null {
  let nextMap = map
  if (!nextMap) {
    return nextMap
  }

  const mapPatch = asRecord(payload.map_patch)
  if (mapPatch) {
    const patchMetadata = asRecord(mapPatch.metadata)
    const patchTraversal = asRecord(mapPatch.traversal_grid)

    if (patchMetadata) {
      const metadataCandidate: MapMetadata = {
        ...(nextMap.metadata ?? {}),
        ...patchMetadata,
      } as MapMetadata

      nextMap = {
        ...nextMap,
        metadata: {
          ...metadataCandidate,
          ...deriveGridMetadata(metadataCandidate, nextMap.traversal_grid),
          map_mode: inferMapMode(metadataCandidate, nextMap.traversal_grid),
        },
      }
    }

    if (patchTraversal) {
      nextMap = {
        ...nextMap,
        traversal_grid: patchTraversal as unknown as FrontendTraversalGrid,
      }
    }
  }
  const merged = mergeBattlemapAssetIntoMap(nextMap, payload.battlemap_asset)
  if (!merged) {
    return merged
  }
  return {
    ...merged,
    metadata: {
      ...(merged.metadata ?? {}),
      ...deriveGridMetadata((merged.metadata ?? {}) as MapMetadata, merged.traversal_grid),
      map_mode: inferMapMode(merged.metadata, merged.traversal_grid),
    },
  }
}
