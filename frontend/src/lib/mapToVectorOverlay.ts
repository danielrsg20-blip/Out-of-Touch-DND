import type { Decal, MapData, Overlay, OverlayElement, OverlayLayer, OverlayWorldBounds, Path, Point, Region, TextLabel } from '../types'
import { applySaturationConstraint } from './colorUtils'

const TILE_SIZE = 32

type LabelOptions = {
  showLabels: boolean
  showDmOnlyLabels: boolean
  scaleLabelsWithZoom: boolean
}

const TILE_FILL: Record<string, string> = {
  floor: '#394257',
  wall: '#1d2232',
  door: '#8a6f46',
  water: '#2c5f91',
  pit: '#17171d',
  pillar: '#565a6f',
  stairs_up: '#3c6f4a',
  stairs_down: '#6a4f40',
  chest: '#7f6a2f',
  rubble: '#4d4b41',
}

const TILE_STROKE: Record<string, string> = {
  wall: '#0f1320',
  water: '#1b456f',
  pit: '#07080c',
}

function tilePolygonPoints(x: number, y: number): Point[] {
  const px = x * TILE_SIZE
  const py = y * TILE_SIZE
  return [
    { x: px, y: py },
    { x: px + TILE_SIZE, y: py },
    { x: px + TILE_SIZE, y: py + TILE_SIZE },
    { x: px, y: py + TILE_SIZE },
  ]
}

function circlePolygonPoints(cx: number, cy: number, radius: number, segments = 12): Point[] {
  const points: Point[] = []
  for (let i = 0; i < segments; i++) {
    const a = (Math.PI * 2 * i) / segments
    points.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
  }
  return points
}

function isRoomWalkable(tileType: string): boolean {
  return tileType === 'floor' || tileType === 'door' || tileType === 'stairs_up' || tileType === 'stairs_down'
}

function roomComponents(map: MapData): Array<Array<{ x: number; y: number }>> {
  const tileByKey = new Map<string, string>()
  for (const tile of map.tiles) {
    tileByKey.set(`${tile.x},${tile.y}`, tile.type)
  }

  const visited = new Set<string>()
  const components: Array<Array<{ x: number; y: number }>> = []

  for (const tile of map.tiles) {
    if (!isRoomWalkable(tile.type)) {
      continue
    }

    const startKey = `${tile.x},${tile.y}`
    if (visited.has(startKey)) {
      continue
    }

    const queue = [{ x: tile.x, y: tile.y }]
    const component: Array<{ x: number; y: number }> = []
    visited.add(startKey)

    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ]

      for (const next of neighbors) {
        const key = `${next.x},${next.y}`
        if (visited.has(key)) {
          continue
        }
        const type = tileByKey.get(key)
        if (!type || !isRoomWalkable(type)) {
          continue
        }
        visited.add(key)
        queue.push(next)
      }
    }

    if (component.length >= 6) {
      components.push(component)
    }
  }

  components.sort((a, b) => b.length - a.length)
  return components
}

function avoidOverlap(position: Point, occupied: Array<{ x: number; y: number; w: number; h: number }>): Point {
  const labelW = 50
  const labelH = 16
  for (let i = 0; i < 6; i++) {
    const yShift = i * 12
    const candidate = { x: position.x, y: position.y + yShift }
    const rect = {
      x: candidate.x - labelW / 2,
      y: candidate.y - labelH / 2,
      w: labelW,
      h: labelH,
    }

    const collides = occupied.some((other) =>
      !(rect.x + rect.w < other.x || rect.x > other.x + other.w || rect.y + rect.h < other.y || rect.y > other.y + other.h),
    )

    if (!collides) {
      occupied.push(rect)
      return candidate
    }
  }

  const fallback = { x: position.x, y: position.y }
  occupied.push({ x: fallback.x - labelW / 2, y: fallback.y - labelH / 2, w: labelW, h: labelH })
  return fallback
}

function roomLabelElement(roomIndex: number, tiles: Array<{ x: number; y: number }>, options: LabelOptions, occupied: Array<{ x: number; y: number; w: number; h: number }>): TextLabel {
  const avgX = tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length
  const avgY = tiles.reduce((sum, t) => sum + t.y, 0) / tiles.length
  const basePosition = {
    x: avgX * TILE_SIZE + TILE_SIZE * 0.5,
    y: avgY * TILE_SIZE + TILE_SIZE * 0.5,
  }
  const placed = avoidOverlap(basePosition, occupied)

  return {
    type: 'text',
    id: `label_room_${roomIndex}`,
    name: `Room ${roomIndex}`,
    parent_object_id: `room_${roomIndex}`,
    text: `Room ${roomIndex}`,
    position: placed,
    color: '#f6f7fb',
    font_size: 11,
    outline_color: 'rgba(8, 10, 16, 0.8)',
    outline_width: 2,
    chip_color: 'rgba(7, 11, 18, 0.45)',
    chip_padding: 3,
    dm_only: false,
    visible: options.showLabels,
    scale_with_zoom: options.scaleLabelsWithZoom,
    min_screen_px: 9,
    max_screen_px: 16,
    tags: ['room_label'],
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getWorldBounds(overlay: Overlay | null): OverlayWorldBounds | null {
  const bounds = overlay?.metadata?.world_bounds
  if (!bounds) {
    return null
  }

  if (
    !isFiniteNumber(bounds.origin_x)
    || !isFiniteNumber(bounds.origin_y)
    || !isFiniteNumber(bounds.width_world)
    || !isFiniteNumber(bounds.height_world)
    || bounds.width_world <= 0
    || bounds.height_world <= 0
  ) {
    return null
  }

  return bounds
}

function scalePointToMapSpace(point: Point, bounds: OverlayWorldBounds, scaleX: number, scaleY: number): Point {
  return {
    x: (point.x - bounds.origin_x) * scaleX,
    y: (point.y - bounds.origin_y) * scaleY,
  }
}

function scaleValue(value: number | undefined, factor: number): number | undefined {
  if (!isFiniteNumber(value)) {
    return value
  }
  return value * factor
}

function scaleDashArray(dashArray: number[] | undefined, factor: number): number[] | undefined {
  if (!dashArray) {
    return dashArray
  }
  return dashArray.map((entry) => entry * factor)
}

function normalizeNarrativeElementToMapSpace(
  element: OverlayElement,
  bounds: OverlayWorldBounds,
  scaleX: number,
  scaleY: number,
  scalarScale: number,
): OverlayElement {
  switch (element.type) {
    case 'polygon': {
      const region = element as Region
      return {
        ...region,
        points: region.points.map((point) => scalePointToMapSpace(point, bounds, scaleX, scaleY)),
        stroke: region.stroke
          ? {
              ...region.stroke,
              width: region.stroke.width * scalarScale,
              dash_array: scaleDashArray(region.stroke.dash_array, scalarScale),
            }
          : region.stroke,
        feather: scaleValue(region.feather, scalarScale),
        noise_mask: region.noise_mask
          ? {
              ...region.noise_mask,
              scale: region.noise_mask.scale * scalarScale,
            }
          : region.noise_mask,
      }
    }
    case 'polyline': {
      const path = element as Path
      return {
        ...path,
        points: path.points.map((point) => scalePointToMapSpace(point, bounds, scaleX, scaleY)),
        stroke: {
          ...path.stroke,
          width: path.stroke.width * scalarScale,
          dash_array: scaleDashArray(path.stroke.dash_array, scalarScale),
        },
      }
    }
    case 'decal': {
      const decal = element as Decal
      return {
        ...decal,
        position: scalePointToMapSpace(decal.position, bounds, scaleX, scaleY),
        scale: (decal.scale ?? 1) * scalarScale,
      }
    }
    case 'text': {
      const label = element as TextLabel
      return {
        ...label,
        position: scalePointToMapSpace(label.position, bounds, scaleX, scaleY),
        offset: label.offset
          ? {
              x: label.offset.x * scaleX,
              y: label.offset.y * scaleY,
            }
          : label.offset,
        font_size: scaleValue(label.font_size, scalarScale),
        outline_width: scaleValue(label.outline_width, scalarScale),
        chip_padding: scaleValue(label.chip_padding, scalarScale),
      }
    }
  }
}

function normalizeNarrativeOverlayToMapSpace(map: MapData, narrativeOverlay: Overlay | null): Overlay | null {
  const bounds = getWorldBounds(narrativeOverlay)
  if (!narrativeOverlay || !bounds || narrativeOverlay.metadata?.normalized_to_map_space) {
    return narrativeOverlay
  }

  const mapWidthPx = map.width * TILE_SIZE
  const mapHeightPx = map.height * TILE_SIZE
  const scaleX = mapWidthPx / bounds.width_world
  const scaleY = mapHeightPx / bounds.height_world
  const scalarScale = (scaleX + scaleY) / 2

  const geometryNormalized: Overlay = {
    ...narrativeOverlay,
    metadata: {
      ...(narrativeOverlay.metadata ?? {}),
      normalized_to_map_space: true,
    },
    layers: narrativeOverlay.layers.map((layer) => ({
      ...layer,
      clip_region: layer.clip_region?.map((point) => scalePointToMapSpace(point, bounds, scaleX, scaleY)),
      elements: layer.elements.map((element) =>
        normalizeNarrativeElementToMapSpace(element, bounds, scaleX, scaleY, scalarScale),
      ),
    })),
  }

  // Clamp saturation on narrative layers coming from external sources (Python backend,
  // Supabase edge functions) that may not have applied the ts-runtime saturation constraint.
  const globalMaxSat =
    (narrativeOverlay.styles['default'] as { max_saturation?: number } | undefined)?.max_saturation
    ?? 0.65
  const { result } = applySaturationConstraint(geometryNormalized, globalMaxSat)
  return result
}

export function buildVectorBaseOverlayFromMap(
  map: MapData,
  options: LabelOptions,
  narrativeOverlay: Overlay | null,
): Overlay {
  const baseTileElements: OverlayElement[] = []
  const tokenElements: OverlayElement[] = []
  const labelElements: OverlayElement[] = []
  const occupiedLabelBoxes: Array<{ x: number; y: number; w: number; h: number }> = []

  for (const tile of map.tiles) {
    const region: Region = {
      type: 'polygon',
      id: `tile_${tile.x}_${tile.y}`,
      name: `${tile.type}_${tile.x}_${tile.y}`,
      points: tilePolygonPoints(tile.x, tile.y),
      fill: { color: TILE_FILL[tile.type] ?? '#2f3548' },
      fill_opacity: tile.type === 'floor' ? 0.9 : 1,
      stroke: {
        color: TILE_STROKE[tile.type] ?? 'rgba(255, 255, 255, 0.08)',
        width: tile.type === 'floor' ? 0.5 : 1,
      },
      tags: ['tile', tile.type],
    }
    baseTileElements.push(region)

    if (tile.type === 'door' || tile.type === 'stairs_up' || tile.type === 'stairs_down') {
      const text = tile.type === 'door'
        ? 'Door'
        : tile.type === 'stairs_up'
          ? 'Stairs Up'
          : 'Stairs Down'
      labelElements.push({
        type: 'text',
        id: `label_tile_${tile.x}_${tile.y}`,
        name: `${text} label`,
        parent_object_id: region.id,
        text,
        position: { x: tile.x * TILE_SIZE + TILE_SIZE * 0.5, y: tile.y * TILE_SIZE + TILE_SIZE * 0.52 },
        color: '#f4f6fb',
        font_size: 10,
        outline_color: 'rgba(8, 10, 16, 0.82)',
        outline_width: 2,
        chip_color: 'rgba(5, 8, 13, 0.42)',
        chip_padding: 2,
        dm_only: false,
        visible: options.showLabels,
        scale_with_zoom: options.scaleLabelsWithZoom,
        min_screen_px: 8,
        max_screen_px: 15,
        tags: ['generated_label', tile.type],
      })
    }
  }

  for (const entity of map.entities) {
    const cx = entity.x * TILE_SIZE + TILE_SIZE * 0.5
    const cy = entity.y * TILE_SIZE + TILE_SIZE * 0.5

    const token: Region = {
      type: 'polygon',
      id: `entity_${entity.id}`,
      name: entity.name,
      points: circlePolygonPoints(cx, cy, TILE_SIZE * 0.33),
      fill: {
        color:
          entity.type === 'pc'
            ? '#3f86cf'
            : entity.type === 'enemy'
              ? '#c94e4e'
              : entity.type === 'object'
                ? '#b48c42'
                : '#4ca36f',
      },
      fill_opacity: 0.92,
      stroke: { color: 'rgba(9, 12, 18, 0.9)', width: 1.5 },
      tags: ['token', entity.type],
    }
    tokenElements.push(token)

    const lowerName = entity.name.toLowerCase()
    const isTrap = lowerName.includes('trap')
    const isSecretDoor = lowerName.includes('secret') && lowerName.includes('door')
    if (entity.type === 'object' && (isTrap || isSecretDoor)) {
      labelElements.push({
        type: 'text',
        id: `label_entity_${entity.id}`,
        name: `${entity.name} label`,
        parent_object_id: token.id,
        text: isSecretDoor ? 'Secret Door' : 'Trap',
        position: { x: cx, y: cy - TILE_SIZE * 0.62 },
        color: '#ffd9d9',
        font_size: 10,
        outline_color: 'rgba(20, 6, 6, 0.9)',
        outline_width: 2,
        chip_color: 'rgba(54, 18, 18, 0.5)',
        chip_padding: 2,
        dm_only: true,
        visible: options.showLabels && options.showDmOnlyLabels,
        scale_with_zoom: options.scaleLabelsWithZoom,
        min_screen_px: 8,
        max_screen_px: 14,
        tags: ['generated_label', 'dm_only'],
      })
    }
  }

  const rooms = roomComponents(map)
  rooms.forEach((component, idx) => {
    labelElements.push(roomLabelElement(idx + 1, component, options, occupiedLabelBoxes))
  })

  const baseLayers: OverlayLayer[] = [
    {
      id: 'layer_vector_base_tiles',
      name: 'VectorBaseTiles',
      z_index: 5,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: baseTileElements,
      clipped_to_bounds: true,
    },
    {
      id: 'layer_vector_base_tokens',
      name: 'VectorBaseTokens',
      z_index: 25,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: tokenElements,
      clipped_to_bounds: true,
    },
    {
      id: 'layer_vector_base_labels',
      name: 'VectorBaseLabels',
      z_index: 35,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: labelElements,
      clipped_to_bounds: true,
    },
  ]

  const normalizedNarrativeOverlay = normalizeNarrativeOverlayToMapSpace(map, narrativeOverlay)
  const narrativeLayers = normalizedNarrativeOverlay?.layers ? [...normalizedNarrativeOverlay.layers] : []

  return {
    id: normalizedNarrativeOverlay?.id ?? `overlay_vectorized_${map.metadata?.map_id ?? 'map'}`,
    name: normalizedNarrativeOverlay?.name ?? 'Vectorized Map Overlay',
    version: normalizedNarrativeOverlay?.version ?? '1.0',
    created_at: normalizedNarrativeOverlay?.created_at ?? new Date().toISOString(),
    map_id: normalizedNarrativeOverlay?.map_id ?? map.metadata?.map_id,
    metadata: {
      ...(normalizedNarrativeOverlay?.metadata ?? {}),
      vectorized_from_map: true,
      label_mode: {
        showLabels: options.showLabels,
        showDmOnlyLabels: options.showDmOnlyLabels,
      },
    },
    styles: normalizedNarrativeOverlay?.styles ?? {
      default: {
        id: 'default',
        name: 'Default Style',
        palette: {
          primary: '#3a3a3a',
          secondary: '#8b8b8b',
          accent_1: '#ff6b35',
          accent_2: '#4ecdc4',
          accent_3: '#95e1d3',
        },
        noise_seed: 0,
        edge_feathering: 3,
        jitter: 0.1,
        decal_library: {},
      },
    },
    layers: [...baseLayers, ...narrativeLayers].sort((a, b) => a.z_index - b.z_index),
  }
}
