import type { FrontendTraversalGrid, MapData, MapMetadata } from '../types'

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

  const metadata: MapMetadata = {
    ...(map.metadata ?? {}),
    map_id: typeof battlemapAsset.id === 'string' ? battlemapAsset.id : map.metadata?.map_id,
    battlemap_id: typeof battlemapAsset.id === 'string' ? battlemapAsset.id : map.metadata?.battlemap_id,
    image_url: typeof battlemapAsset.image_url === 'string' ? battlemapAsset.image_url : map.metadata?.image_url,
    image_opacity: map.metadata?.image_opacity ?? 1,
    map_source: 'generated',
  }

  const merged: MapData = {
    ...map,
    metadata,
  }

  if (battlemapAsset.traversal_grid) {
    merged.traversal_grid = battlemapAsset.traversal_grid
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
      nextMap = {
        ...nextMap,
        metadata: {
          ...(nextMap.metadata ?? {}),
          ...patchMetadata,
        } as MapMetadata,
      }
    }

    if (patchTraversal) {
      nextMap = {
        ...nextMap,
        traversal_grid: patchTraversal as unknown as FrontendTraversalGrid,
      }
    }
  }

  return mergeBattlemapAssetIntoMap(nextMap, payload.battlemap_asset)
}
