import type { FastifyInstance } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { PythonRandom } from '../lib/pythonRandom.js'

type JsonRecord = Record<string, unknown>

type Point = { x: number; y: number }
type LayerElement = JsonRecord

type OverlayLayer = {
  id: string
  name: string
  z_index: number
  visible: boolean
  blend_mode: string
  opacity: number
  elements: LayerElement[]
  clip_region: null
  clipped_to_bounds: boolean
}

type OverlayPayload = {
  id: string
  name: string
  version: string
  created_at: string
  map_id?: string
  metadata: JsonRecord
  styles: JsonRecord
  layers: OverlayLayer[]
}

const PYTHON_BASE_URL = process.env.PYTHON_BRIDGE_BASE_URL?.trim() || 'http://127.0.0.1:8010'
const USE_PYTHON_BRIDGE = (process.env.TS_RUNTIME_USE_PYTHON_BRIDGE?.trim().toLowerCase() ?? 'true') !== 'false'

async function parseJsonSafe(res: Response): Promise<JsonRecord> {
  const text = await res.text()
  if (!text.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as JsonRecord) : {}
  } catch {
    return { error: 'Invalid JSON from upstream' }
  }
}

function nowIsoUtc(): string {
  return new Date().toISOString()
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return fallback
}

function stableSeed(text: string, seed?: number): number {
  const source = `${text}|${seed !== undefined ? seed : 'auto'}`
  const digest = createHash('sha256').update(source, 'utf8').digest('hex')
  return Number.parseInt(digest.slice(0, 8), 16)
}

function mapBounds(body: JsonRecord): { width: number; height: number; tileSize: number } {
  const tileSize = toNumber(body.tile_size, 32)
  const width = toNumber(body.map_width, 20)
  const height = toNumber(body.map_height, 15)

  if (width <= 200 && height <= 200) {
    return {
      width: Math.max(64, width * tileSize),
      height: Math.max(64, height * tileSize),
      tileSize,
    }
  }

  return {
    width: Math.max(64, width),
    height: Math.max(64, height),
    tileSize,
  }
}

function defaultStyles(): JsonRecord {
  return {
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
  }
}

function defaultLayers(): OverlayLayer[] {
  return [
    {
      id: `layer_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name: 'BaseBiomeOverlay',
      z_index: 10,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: [],
      clip_region: null,
      clipped_to_bounds: true,
    },
    {
      id: `layer_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name: 'DetailOverlay',
      z_index: 20,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: [],
      clip_region: null,
      clipped_to_bounds: true,
    },
    {
      id: `layer_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name: 'WeatherOverlay',
      z_index: 30,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: [],
      clip_region: null,
      clipped_to_bounds: true,
    },
    {
      id: `layer_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name: 'MagicOverlay',
      z_index: 40,
      visible: true,
      blend_mode: 'normal',
      opacity: 1,
      elements: [],
      clip_region: null,
      clipped_to_bounds: true,
    },
  ]
}

function ensureLayer(layers: OverlayLayer[], name: string, zIndex: number, blendMode = 'normal'): OverlayLayer {
  const existing = layers.find((layer) => layer.name === name)
  if (existing) {
    return existing
  }

  const created: OverlayLayer = {
    id: `layer_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name,
    z_index: zIndex,
    visible: true,
    blend_mode: blendMode,
    opacity: 1,
    elements: [],
    clip_region: null,
    clipped_to_bounds: true,
  }

  layers.push(created)
  layers.sort((a, b) => a.z_index - b.z_index)
  return created
}

function makeBlobPolygon(rng: PythonRandom, cx: number, cy: number, rx: number, ry: number, points = 7): Point[] {
  const out: Point[] = []
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * 6.28318530718
    const wobble = 0.75 + rng.random() * 0.5
    const px = cx + (rx * wobble) * (i % 2 === 0 ? 1 : 0.92) * Math.cos(angle)
    const py = cy + (ry * wobble) * (i % 2 === 1 ? 1 : 0.92) * Math.sin(angle)
    out.push({ x: px, y: py })
  }
  return out
}

function makeRegion(params: {
  name: string
  points: Point[]
  fillColor: string
  fillOpacity: number
  strokeColor?: string
  strokeWidth?: number
  noise?: JsonRecord
  feather?: number
  tags?: string[]
}): LayerElement {
  return {
    type: 'polygon',
    id: `region_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: params.name,
    points: params.points,
    fill: { color: params.fillColor, gradient: null },
    fill_opacity: params.fillOpacity,
    stroke: params.strokeColor
      ? {
          color: params.strokeColor,
          width: params.strokeWidth ?? 1,
          line_cap: 'round',
          line_join: 'round',
          dash_array: null,
          width_profile: null,
        }
      : null,
    noise_mask: params.noise ?? null,
    feather: params.feather ?? null,
    tags: params.tags ?? null,
  }
}

function makePath(params: {
  name: string
  points: Point[]
  strokeColor: string
  strokeWidth: number
  strokeOpacity: number
  dashArray?: number[]
  widthProfile?: number[]
  jitter?: number
  tags?: string[]
}): LayerElement {
  return {
    type: 'polyline',
    id: `path_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: params.name,
    points: params.points,
    stroke: {
      color: params.strokeColor,
      width: params.strokeWidth,
      line_cap: 'round',
      line_join: 'round',
      dash_array: params.dashArray ?? null,
      width_profile: params.widthProfile ?? null,
    },
    stroke_opacity: params.strokeOpacity,
    style_jitter: params.jitter ?? 0,
    noise_mask: null,
    end_cap_style: 'round',
    tags: params.tags ?? null,
  }
}

function makeDecal(name: string, decalType: string, x: number, y: number, scale: number, tags: string[]): LayerElement {
  return {
    type: 'decal',
    id: `decal_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name,
    position: { x, y },
    decal_type: decalType,
    scale,
    rotation: 0,
    opacity: 1,
    blend_mode: 'normal',
    tags,
  }
}

function appendBattleMarks(overlay: OverlayPayload, rng: PythonRandom, width: number, height: number): void {
  const detail = ensureLayer(overlay.layers, 'DetailOverlay', 20, 'normal')
  const magic = ensureLayer(overlay.layers, 'MagicOverlay', 40, 'multiply')

  for (let i = 0; i < 3; i += 1) {
    const cx = rng.uniform(width * 0.15, width * 0.85)
    const cy = rng.uniform(height * 0.2, height * 0.8)
    const poly = makeBlobPolygon(rng, cx, cy, rng.uniform(30, 60), rng.uniform(20, 48), 8)
    magic.elements.push(
      makeRegion({
        name: `scorch_zone_${i + 1}`,
        points: poly,
        fillColor: '#3a2110aa',
        fillOpacity: 0.68,
        strokeColor: '#8b4513',
        strokeWidth: 1.5,
        noise: {
          enabled: true,
          intensity: 0.45,
          scale: 8,
          seed: rng.randint(1, 999999),
          octaves: 3,
        },
        feather: 4,
        tags: ['battle', 'scorch', 'fire_damage'],
      }),
    )
  }

  for (let i = 0; i < 8; i += 1) {
    detail.elements.push(
      makeDecal(
        `blood_stain_${i}`,
        'blood_stain',
        rng.uniform(width * 0.2, width * 0.8),
        rng.uniform(height * 0.2, height * 0.8),
        0.9,
        ['battle', 'blood'],
      ),
    )
  }
}

function appendForestScene(overlay: OverlayPayload, rng: PythonRandom, width: number, height: number): void {
  const base = ensureLayer(overlay.layers, 'BaseBiomeOverlay', 10, 'normal')
  const detail = ensureLayer(overlay.layers, 'DetailOverlay', 20, 'normal')
  const weather = ensureLayer(overlay.layers, 'WeatherOverlay', 30, 'multiply')

  const clearing = makeBlobPolygon(rng, width * 0.5, height * 0.58, width * 0.24, height * 0.18, 10)
  base.elements.push(
    makeRegion({
      name: 'forest_clearing',
      points: clearing,
      fillColor: '#6f8a5e88',
      fillOpacity: 0.6,
      strokeColor: '#8ea86d',
      strokeWidth: 1.2,
      noise: {
        enabled: true,
        intensity: 0.3,
        scale: 11,
        seed: rng.randint(1, 999999),
        octaves: 2,
      },
      feather: 5,
      tags: ['forest', 'clearing', 'passable'],
    }),
  )

  const pathPoints: Point[] = [
    { x: width * 0.52, y: height * 0.96 },
    { x: width * 0.47 + rng.uniform(-18, 18), y: height * 0.78 },
    { x: width * 0.56 + rng.uniform(-22, 22), y: height * 0.63 },
    { x: width * 0.5 + rng.uniform(-26, 26), y: height * 0.46 },
    { x: width * 0.54 + rng.uniform(-20, 20), y: height * 0.24 },
  ]

  detail.elements.push(
    makePath({
      name: 'forest_path',
      points: pathPoints,
      strokeColor: '#8a6b46',
      strokeWidth: 9,
      strokeOpacity: 0.72,
      widthProfile: [1.2, 1.05, 0.95, 0.82, 0.7],
      jitter: 0.08,
      tags: ['forest', 'path', 'trail'],
    }),
  )

  for (let i = 0; i < 3; i += 1) {
    const y = rng.uniform(height * 0.2, height * 0.9)
    detail.elements.push(
      makePath({
        name: `underbrush_${i + 1}`,
        points: [
          { x: width * 0.08, y },
          { x: width * 0.42 + rng.uniform(-20, 20), y: y + rng.uniform(-24, 24) },
          { x: width * 0.86, y: y + rng.uniform(-18, 18) },
        ],
        strokeColor: '#3f5a35',
        strokeWidth: 2.2,
        strokeOpacity: 0.33,
        dashArray: [6, 8],
        jitter: 0.14,
        tags: ['forest', 'underbrush'],
      }),
    )
  }

  const shade = makeBlobPolygon(rng, width * 0.5, height * 0.45, width * 0.42, height * 0.34, 11)
  weather.elements.push(
    makeRegion({
      name: 'canopy_shadow',
      points: shade,
      fillColor: '#29402f55',
      fillOpacity: 0.45,
      strokeColor: '#385841',
      strokeWidth: 0.8,
      noise: {
        enabled: true,
        intensity: 0.28,
        scale: 14,
        seed: rng.randint(1, 999999),
        octaves: 2,
      },
      feather: 8,
      tags: ['forest', 'shade'],
    }),
  )

  for (let i = 0; i < 18; i += 1) {
    const side = rng.choice(['left', 'right', 'top'])
    if (side === 'left') {
      detail.elements.push(makeDecal(`pine_tree_${i}`, 'pine_tree', rng.uniform(8, width * 0.22), rng.uniform(10, height - 10), 0.92, ['forest', 'trees']))
    } else if (side === 'right') {
      detail.elements.push(makeDecal(`pine_tree_${i}`, 'pine_tree', rng.uniform(width * 0.78, width - 8), rng.uniform(10, height - 10), 0.92, ['forest', 'trees']))
    } else {
      detail.elements.push(makeDecal(`pine_tree_${i}`, 'pine_tree', rng.uniform(10, width - 10), rng.uniform(8, height * 0.2), 0.92, ['forest', 'trees']))
    }
  }
}

function appendStreamFeature(overlay: OverlayPayload, rng: PythonRandom, width: number, height: number): void {
  const detail = ensureLayer(overlay.layers, 'DetailOverlay', 20, 'normal')
  const weather = ensureLayer(overlay.layers, 'WeatherOverlay', 30, 'screen')

  const streamPoints: Point[] = [
    { x: width * 0.1, y: height * 0.18 },
    { x: width * 0.28 + rng.uniform(-12, 12), y: height * 0.14 },
    { x: width * 0.48 + rng.uniform(-14, 14), y: height * 0.2 },
    { x: width * 0.68 + rng.uniform(-10, 10), y: height * 0.15 },
    { x: width * 0.9, y: height * 0.22 },
  ]

  detail.elements.push(
    makePath({
      name: 'forest_stream',
      points: streamPoints,
      strokeColor: '#6da6cf',
      strokeWidth: 7,
      strokeOpacity: 0.7,
      widthProfile: [0.85, 1.0, 1.08, 1.0, 0.9],
      jitter: 0.06,
      tags: ['water', 'stream', 'difficult_terrain'],
    }),
  )

  weather.elements.push(
    makePath({
      name: 'stream_highlight',
      points: streamPoints,
      strokeColor: '#d2ecff',
      strokeWidth: 2,
      strokeOpacity: 0.45,
      dashArray: [10, 14],
      jitter: 0.03,
      tags: ['water', 'highlight'],
    }),
  )
}

function appendFallbackTrail(overlay: OverlayPayload, rng: PythonRandom, width: number, height: number): void {
  const detail = ensureLayer(overlay.layers, 'DetailOverlay', 20, 'normal')
  detail.elements.push(
    makePath({
      name: 'narrative_trail',
      points: [
        { x: width * 0.1, y: height * 0.5 },
        { x: width * 0.5 + rng.uniform(-40, 40), y: height * 0.45 + rng.uniform(-30, 30) },
        { x: width * 0.9, y: height * 0.55 },
      ],
      strokeColor: '#7a6648',
      strokeWidth: 4,
      strokeOpacity: 0.5,
      jitter: 0.1,
      tags: ['trail', 'narrative_generated'],
    }),
  )
}

function generateNativeOverlay(body: JsonRecord): JsonRecord {
  const narrative = typeof body.narrative === 'string' ? body.narrative.trim() : ''
  if (!narrative) {
    return { error: 'Narrative prompt is required' }
  }

  const overlayId = typeof body.overlay_id === 'string' && body.overlay_id.trim()
    ? body.overlay_id.trim()
    : `overlay_${randomUUID().replace(/-/g, '').slice(0, 10)}`
  const overlayName = typeof body.overlay_name === 'string' && body.overlay_name.trim()
    ? body.overlay_name.trim()
    : 'Narrative Overlay'
  const styleId = typeof body.style_id === 'string' && body.style_id.trim() ? body.style_id.trim() : 'default'
  const userSeed = typeof body.seed === 'number' && Number.isFinite(body.seed) ? body.seed : undefined

  const bounds = mapBounds(body)
  const resolvedSeed = stableSeed(`${overlayId}|${narrative}|${styleId}`, userSeed)
  const rng = new PythonRandom(resolvedSeed)

  const overlay: OverlayPayload = {
    id: overlayId,
    name: overlayName,
    version: '1.0',
    created_at: nowIsoUtc(),
    map_id: typeof body.map_id === 'string' ? body.map_id : undefined,
    metadata: {
      narrative_tags: [],
      seed: resolvedSeed,
      story_context: narrative,
      style_id: styleId,
      generated_at: nowIsoUtc(),
    },
    styles: defaultStyles(),
    layers: defaultLayers(),
  }

  const text = narrative.toLowerCase()
  const tags: string[] = []

  if (['battle', 'siege', 'war', 'skirmish', 'aftermath', 'scorch', 'blood'].some((k) => text.includes(k))) {
    appendBattleMarks(overlay, rng, bounds.width, bounds.height)
    tags.push('battle')
  }

  if (['forest', 'woods', 'pine', 'clearing', 'canopy', 'underbrush', 'path', 'trail', 'earth', 'needles'].some((k) => text.includes(k))) {
    appendForestScene(overlay, rng, bounds.width, bounds.height)
    tags.push('forest')
  }

  if (['water', 'stream', 'river', 'creek', 'brook', 'running water'].some((k) => text.includes(k))) {
    appendStreamFeature(overlay, rng, bounds.width, bounds.height)
    tags.push('water')
  }

  if (tags.length === 0) {
    appendFallbackTrail(overlay, rng, bounds.width, bounds.height)
    tags.push('generic')
  }

  overlay.metadata.narrative_tags = tags

  return {
    overlay,
    overlay_id: overlayId,
    narrative,
  }
}

export async function registerOverlayGenerateRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/overlays/generate', async (request, reply) => {
    const body = (request.body ?? {}) as JsonRecord

    if (USE_PYTHON_BRIDGE) {
      const upstream = await fetch(`${PYTHON_BASE_URL}/api/overlays/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const payload = await parseJsonSafe(upstream)
      return reply.status(upstream.status).send(payload)
    }

    const nativePayload = generateNativeOverlay(body)
    if (typeof nativePayload.error === 'string') {
      return reply.status(400).send(nativePayload)
    }

    return reply.send(nativePayload)
  })
}
