import type {
  GenerateVectorMapRequest,
  GenerateVectorMapResponse,
  OverlayLayer,
  OverlayPayload,
  Point,
  RegionElement,
} from './types.js'
import { canonicalHash, createRng, deterministicId, splitSeed, stableSeed } from './deterministic.js'
import { rasterizeToGrid } from './rasterize.js'
import { deriveLegacyEntities, deriveLegacyTiles } from './compatibility.js'
import { validateOverlayPayload, validateTraversalGrid } from './validation.js'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function defaultLayers(seed: number): OverlayLayer[] {
  return [
    { id: deterministicId('layer', [seed, 'base']), name: 'BaseBiomeOverlay', z_index: 10, visible: true, blend_mode: 'normal', opacity: 1, elements: [], clipped_to_bounds: true },
    { id: deterministicId('layer', [seed, 'detail']), name: 'DetailOverlay', z_index: 20, visible: true, blend_mode: 'normal', opacity: 1, elements: [], clipped_to_bounds: true },
    { id: deterministicId('layer', [seed, 'hazard']), name: 'HazardOverlay', z_index: 30, visible: true, blend_mode: 'normal', opacity: 1, elements: [], clipped_to_bounds: true },
    { id: deterministicId('layer', [seed, 'label']), name: 'LabelOverlay', z_index: 40, visible: true, blend_mode: 'normal', opacity: 1, elements: [], clipped_to_bounds: true },
  ]
}

function blobPolygon(cx: number, cy: number, rx: number, ry: number, points: number, rand: () => number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2
    const wobble = 0.8 + rand() * 0.4
    out.push({ x: cx + rx * wobble * Math.cos(angle), y: cy + ry * wobble * Math.sin(angle) })
  }
  return out
}

function makeOverlay(req: GenerateVectorMapRequest): OverlayPayload {
  const generatorVersion = 'vector-gen-1.0.0'
  const rootSeed = stableSeed(req.seed, req, generatorVersion)
  const layoutRng = createRng(splitSeed(rootSeed, 'layout'))
  const featureRng = createRng(splitSeed(rootSeed, 'features'))

  const roomCount = Math.max(3, Math.floor(req.generation_params?.room_count ?? 8))
  const bounds = req.bounds_world
  const minX = bounds.origin_x
  const minY = bounds.origin_y
  const maxX = bounds.origin_x + bounds.width_world
  const maxY = bounds.origin_y + bounds.height_world

  const layers = defaultLayers(rootSeed)
  const base = layers[0]!
  const detail = layers[1]!
  const hazard = layers[2]!
  const labels = layers[3]!

  const bg: RegionElement = {
    type: 'polygon',
    id: deterministicId('region', [rootSeed, 'bg']),
    name: 'MapBounds',
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: minY },
    ],
    fill: { color: req.biome === 'forest' ? '#5a8a40' : '#c8d4b0' },
    fill_opacity: 1,
    tags: ['terrain', 'floor'],
  }
  base.elements.push(bg)

  for (let i = 0; i < roomCount; i += 1) {
    const cx = minX + (0.1 + layoutRng.random() * 0.8) * bounds.width_world
    const cy = minY + (0.1 + layoutRng.random() * 0.8) * bounds.height_world
    const rx = clamp(bounds.width_world * (0.06 + layoutRng.random() * 0.08), 12, bounds.width_world * 0.2)
    const ry = clamp(bounds.height_world * (0.06 + layoutRng.random() * 0.08), 12, bounds.height_world * 0.2)
    const points = blobPolygon(cx, cy, rx, ry, 10, () => layoutRng.random())
    const region: RegionElement = {
      type: 'polygon',
      id: deterministicId('region', [rootSeed, 'room', i]),
      name: `Room ${i + 1}`,
      points,
      fill: { color: '#c8d4b0' },
      fill_opacity: 0.95,
      stroke: { color: '#7a6a52', width: 2, line_cap: 'round', line_join: 'round' },
      tags: ['terrain', 'floor', 'room'],
    }
    base.elements.push(region)

    labels.elements.push({
      type: 'text',
      id: deterministicId('text', [rootSeed, 'room', i]),
      name: `RoomLabel${i + 1}`,
      position: { x: cx, y: cy },
      text: `Room ${i + 1}`,
      color: '#f6f7fb',
      font_size: 11,
      visible: true,
      dm_only: false,
      tags: ['room_label'],
    })
  }

  const corridors = Math.max(2, roomCount - 1)
  for (let i = 0; i < corridors; i += 1) {
    const x1 = minX + layoutRng.random() * bounds.width_world
    const y1 = minY + layoutRng.random() * bounds.height_world
    const x2 = minX + layoutRng.random() * bounds.width_world
    const y2 = minY + layoutRng.random() * bounds.height_world
    detail.elements.push({
      type: 'polyline',
      id: deterministicId('path', [rootSeed, 'corr', i]),
      name: `Corridor ${i + 1}`,
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      stroke: { color: '#8a7050', width: Math.max(6, (req.generation_params?.corridor_width_cells ?? 2) * 3), line_cap: 'round', line_join: 'round' },
      stroke_opacity: 0.7,
      end_cap_style: 'round',
      tags: ['trail', 'road'],
    })
  }

  const obstacleCount = Math.max(1, Math.floor((req.generation_params?.obstacle_density ?? 0.1) * 20))
  for (let i = 0; i < obstacleCount; i += 1) {
    const cx = minX + featureRng.random() * bounds.width_world
    const cy = minY + featureRng.random() * bounds.height_world
    const points = blobPolygon(cx, cy, 8 + featureRng.random() * 14, 8 + featureRng.random() * 14, 8, () => featureRng.random())
    hazard.elements.push({
      type: 'polygon',
      id: deterministicId('region', [rootSeed, 'obs', i]),
      name: `Obstacle ${i + 1}`,
      points,
      fill: { color: '#4f4c49' },
      fill_opacity: 1,
      tags: ['blocking', 'wall'],
    })
  }

  const hazardCount = Math.max(1, Math.floor((req.generation_params?.hazard_density ?? 0.1) * 16))
  for (let i = 0; i < hazardCount; i += 1) {
    const x = minX + featureRng.random() * bounds.width_world
    const y = minY + featureRng.random() * bounds.height_world
    hazard.elements.push({
      type: 'decal',
      id: deterministicId('decal', [rootSeed, 'hz', i]),
      name: `Hazard ${i + 1}`,
      position: { x, y },
      decal_type: 'hazard_spot',
      scale: 1,
      opacity: 0.8,
      blend_mode: 'normal',
      tags: ['deep_mud', 'hazard', 'difficult'],
    })
  }

  const overlay: OverlayPayload = {
    id: deterministicId('overlay', [rootSeed, req.map_id ?? 'map']),
    name: req.name ?? 'Generated Vector Map',
    version: '1.0',
    created_at: new Date((rootSeed % 2147483647) * 1000).toISOString(),
    map_id: req.map_id,
    metadata: {
      seed: req.seed,
      story_context: req.story_prompt ?? '',
      narrative_tags: req.story_prompt ? req.story_prompt.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 12) : [],
      world_bounds: bounds,
      generator_version: generatorVersion,
      vectorized_from_map: false,
    },
    styles: {
      default: {
        id: req.style_preset ?? 'default',
        name: req.style_preset ?? 'Default Style',
        palette: {
          primary: '#3a3a3a',
          secondary: '#8b8b8b',
          accent_1: '#ff6b35',
          accent_2: '#4ecdc4',
          accent_3: '#95e1d3',
        },
        noise_seed: rootSeed,
        edge_feathering: 3,
        jitter: 0.1,
        decal_library: {},
      },
    },
    layers: layers.sort((a, b) => a.z_index - b.z_index),
  }

  return overlay
}

export function generateVectorMap(req: GenerateVectorMapRequest): GenerateVectorMapResponse {
  const validationMode = req.validation_mode ?? 'fixup'
  const overlay = makeOverlay(req)

  const bounds = {
    minX: req.bounds_world.origin_x,
    minY: req.bounds_world.origin_y,
    maxX: req.bounds_world.origin_x + req.bounds_world.width_world,
    maxY: req.bounds_world.origin_y + req.bounds_world.height_world,
  }

  const payloadValidation = validateOverlayPayload(overlay, validationMode, bounds)
  const gridConfig = {
    base_cell_size_world: req.grid_config?.base_cell_size_world ?? 5,
    resolution_scale: req.grid_config?.resolution_scale ?? 2,
    diagonal_policy: req.grid_config?.diagonal_policy ?? 'allow',
    movement_cost_mode: 'world_units' as const,
  }

  const traversalGrid = rasterizeToGrid(overlay, gridConfig)
  const gridValidation = validateTraversalGrid(traversalGrid)
  const legacyTiles = deriveLegacyTiles(traversalGrid)
  const legacyEntities = deriveLegacyEntities(overlay)

  const speedWorldPerTurnDefault = 30
  const derivedCellsPerTurnDefault = Math.floor(speedWorldPerTurnDefault / traversalGrid.cell_size_world)

  return {
    overlay,
    traversal_grid: traversalGrid,
    compatibility: {
      legacy_tiles: legacyTiles,
      legacy_entities: legacyEntities,
    },
    reports: {
      payload_validation: payloadValidation,
      grid_validation: gridValidation,
    },
    movement_model: {
      metric: 'world_units',
      cell_size_world: traversalGrid.cell_size_world,
      speed_world_per_turn_default: speedWorldPerTurnDefault,
      derived_cells_per_turn_default: derivedCellsPerTurnDefault,
    },
    hashes: {
      overlay_hash: canonicalHash(overlay),
      grid_hash: canonicalHash(traversalGrid),
      compatibility_hash: canonicalHash({ legacy_tiles: legacyTiles, legacy_entities: legacyEntities }),
    },
  }
}
