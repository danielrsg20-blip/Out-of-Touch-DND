/**
 * dungeonGenerator.ts
 *
 * Guide-compliant generator for Dungeon, Ruin, and Interior maps.
 * Implements the philosophy from Examples/svg_dungeon_map_general_guide.md:
 *
 *   "Never draw walls. Draw floors instead."
 *   — Near-black background = solid stone.
 *   — Floor shapes are parchment rectangles punched out of that darkness.
 *   — Passage openings are erased with floor-colored polygons, not designed.
 *
 * Layout: hub-and-spoke (hub → corridors → chambers → alcoves).
 * All rooms are rectangular. Coordinates derived from hub, not scattered.
 *
 * For organic presets (biome: cavern) the layout is blob-based but the
 * guide palette and layer scheme are still applied.
 *
 * Output feeds the same applySaturationConstraint → rasterizeToGrid →
 * validateOverlayPayload pipeline as the existing generator.
 */

import type {
  GenerateVectorMapRequest,
  OverlayElement,
  OverlayLayer,
  OverlayPayload,
  PathElement,
  Point,
  RegionElement,
  TextElement,
} from './types.js'
import { canonicalHash, createRng, deterministicId, splitSeed, stableSeed } from './deterministic.js'
import { getDungeonPalette, type DungeonPalette } from './dungeonPalette.js'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type Direction = 'N' | 'S' | 'E' | 'W'

type RoomDef = {
  id: string
  type: 'hub' | 'corridor' | 'chamber' | 'alcove'
  x: number
  y: number
  w: number
  h: number
  direction?: Direction
  parentId?: string
}

type Passage = {
  /** The room containing the wall being opened. */
  roomId: string
  /** Axis: 'H' = horizontal wall (top/bottom); 'V' = vertical wall (left/right). */
  axis: 'H' | 'V'
  /** World-space coordinate of the wall line being opened (the y for H, x for V). */
  wallCoord: number
  /** Start & end of the gap along the perpendicular axis. */
  gapStart: number
  gapEnd: number
}

type DungeonLayout = {
  rooms: RoomDef[]
  passages: Passage[]
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function rectPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]
}

/**
 * N-gon polygon approximating a circle with given radius.
 * Used for columns and altar rings (no native circle element type yet).
 */
function circlePoints(cx: number, cy: number, r: number, sides = 16): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

/** Blob polygon — used for organic cave rooms. */
function blobPolygon(
  cx: number, cy: number, rx: number, ry: number, pts: number,
  rand: () => number,
): Point[] {
  const out: Point[] = []
  for (let i = 0; i < pts; i++) {
    const angle = (i / pts) * Math.PI * 2
    const wobble = 0.75 + rand() * 0.5
    out.push({ x: cx + rx * wobble * Math.cos(angle), y: cy + ry * wobble * Math.sin(angle) })
  }
  // close
  out.push({ ...out[0]! })
  return out
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ---------------------------------------------------------------------------
// Layer factory helpers
// ---------------------------------------------------------------------------

function makeLayer(
  seed: number,
  namespace: string,
  name: string,
  zIndex: number,
  extra?: Partial<OverlayLayer>,
): OverlayLayer {
  return {
    id: deterministicId('layer', [seed, namespace]),
    name,
    z_index: zIndex,
    visible: true,
    blend_mode: 'normal',
    opacity: 1,
    elements: [],
    clipped_to_bounds: true,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Hub-and-spoke layout builder
// ---------------------------------------------------------------------------

function buildHubAndSpokeLayout(
  req: GenerateVectorMapRequest,
  rootSeed: number,
): DungeonLayout {
  const layoutRng = createRng(splitSeed(rootSeed, 'dungeon-layout'))
  const rand = () => layoutRng.random()

  const bounds = req.bounds_world
  const bw = bounds.width_world
  const bh = bounds.height_world
  const ox = bounds.origin_x
  const oy = bounds.origin_y
  const inset = 4 // world-unit margin from canvas edge

  const hints = req.generation_params?.layout_hints

  const cellSize = (req.grid_config?.base_cell_size_world ?? 5)
  const corridorW = clamp(
    (req.generation_params?.corridor_width_cells ?? 2) * cellSize,
    24, 96,
  )

  // Hub: 26%/28% of canvas, centered
  const hubW = bw * 0.26
  const hubH = bh * 0.28
  const hubX = ox + (bw - hubW) / 2
  const hubY = oy + (bh - hubH) / 2
  const hubCX = hubX + hubW / 2
  const hubCY = hubY + hubH / 2

  const rooms: RoomDef[] = []
  const passages: Passage[] = []

  const hubId = deterministicId('room', [rootSeed, 'hub'])
  rooms.push({ id: hubId, type: 'hub', x: hubX, y: hubY, w: hubW, h: hubH })

  // If layout_hints.rooms provided, derive room_count from hint count (+1 for hub)
  const hintRooms = hints?.rooms
  const baseRoomCount = hintRooms && hintRooms.length > 0
    ? hintRooms.length + 1
    : Math.max(3, Math.floor(req.generation_params?.room_count ?? 8))
  const roomCount = Math.max(3, baseRoomCount)

  // Determine which directions get corridors+chambers.
  // With room_count 3: N+S only. 4+: all four. 5–9: some alcoves.
  const directions: Direction[] = roomCount >= 4 ? ['N', 'S', 'E', 'W'] : ['N', 'S']
  const alcoveCount = Math.max(0, roomCount - directions.length - 1)

  // Build a size→multiplier map for hint-driven sizing
  const sizeMultiplier: Record<string, number> = { small: 0.6, medium: 1.0, large: 1.4 }

  // -- Corridor + chamber per direction --
  const chamberIds: string[] = []
  for (let di = 0; di < directions.length; di++) {
    const dir = directions[di]!
    const hint = hintRooms?.[di]
    const sizeMul = sizeMultiplier[hint?.size ?? 'medium'] ?? 1.0

    const corrId = deterministicId('room', [rootSeed, 'corr', dir])
    const chamId = deterministicId('room', [rootSeed, 'cham', dir])

    let corrX: number, corrY: number, corrW: number, corrH: number
    let chamX: number, chamY: number, chamW: number, chamH: number

    // Chamber size: ~60% of hub with small seeded variation, scaled by hint size
    const chamW0 = hubW * (0.55 + rand() * 0.15) * sizeMul
    const chamH0 = hubH * (0.55 + rand() * 0.15) * sizeMul

    if (dir === 'N') {
      // Corridor runs upward from hub top edge
      const corrLen = clamp(bh * (0.15 + rand() * 0.1), corridorW + 20, (hubY - oy - inset) * 0.9)
      corrW = corridorW
      corrH = corrLen
      corrX = hubCX - corrW / 2
      corrY = clamp(hubY - corrLen, oy + inset, hubY - 10)

      chamW = chamW0
      chamH = chamH0
      chamX = clamp(hubCX - chamW / 2 + (rand() - 0.5) * corridorW * 0.5, ox + inset, ox + bw - inset - chamW)
      chamY = clamp(corrY - chamH, oy + inset, corrY - 8)

      // Passage: hub top wall, gap centred on corridor
      passages.push({ roomId: hubId, axis: 'H', wallCoord: hubY, gapStart: corrX + 2, gapEnd: corrX + corrW - 2 })
      passages.push({ roomId: corrId, axis: 'H', wallCoord: corrY, gapStart: corrX + 2, gapEnd: corrX + corrW - 2 })
    } else if (dir === 'S') {
      const corrLen = clamp(bh * (0.15 + rand() * 0.1), 20, (oy + bh - inset - (hubY + hubH)) * 0.9)
      corrW = corridorW
      corrH = corrLen
      corrX = hubCX - corrW / 2
      corrY = hubY + hubH

      chamW = chamW0
      chamH = chamH0
      chamX = clamp(hubCX - chamW / 2 + (rand() - 0.5) * corridorW * 0.5, ox + inset, ox + bw - inset - chamW)
      chamY = clamp(corrY + corrLen, corrY + corrLen, oy + bh - inset - chamH)

      passages.push({ roomId: hubId, axis: 'H', wallCoord: hubY + hubH, gapStart: corrX + 2, gapEnd: corrX + corrW - 2 })
      passages.push({ roomId: corrId, axis: 'H', wallCoord: corrY + corrLen, gapStart: corrX + 2, gapEnd: corrX + corrW - 2 })
    } else if (dir === 'E') {
      const corrLen = clamp(bw * (0.15 + rand() * 0.1), 20, (oy + bw - inset - (hubX + hubW)) * 0.9)
      corrW = corrLen
      corrH = corridorW
      corrX = hubX + hubW
      corrY = hubCY - corrH / 2

      chamW = chamH0
      chamH = chamW0
      chamX = clamp(corrX + corrLen, corrX + corrLen, ox + bw - inset - chamW)
      chamY = clamp(hubCY - chamH / 2 + (rand() - 0.5) * corridorW * 0.5, oy + inset, oy + bh - inset - chamH)

      passages.push({ roomId: hubId, axis: 'V', wallCoord: hubX + hubW, gapStart: corrY + 2, gapEnd: corrY + corrH - 2 })
      passages.push({ roomId: corrId, axis: 'V', wallCoord: corrX + corrLen, gapStart: corrY + 2, gapEnd: corrY + corrH - 2 })
    } else {
      // W
      const corrLen = clamp(bw * (0.15 + rand() * 0.1), 20, (hubX - ox - inset) * 0.9)
      corrW = corrLen
      corrH = corridorW
      corrX = clamp(hubX - corrLen, ox + inset, hubX - 10)
      corrY = hubCY - corrH / 2

      chamW = chamH0
      chamH = chamW0
      chamX = clamp(corrX - chamW, ox + inset, corrX - 8)
      chamY = clamp(hubCY - chamH / 2 + (rand() - 0.5) * corridorW * 0.5, oy + inset, oy + bh - inset - chamH)

      passages.push({ roomId: hubId, axis: 'V', wallCoord: hubX, gapStart: corrY + 2, gapEnd: corrY + corrH - 2 })
      passages.push({ roomId: corrId, axis: 'V', wallCoord: corrX, gapStart: corrY + 2, gapEnd: corrY + corrH - 2 })
    }

    // Clamp all room coords to bounds
    corrX = clamp(corrX, ox + inset, ox + bw - inset - corrW)
    corrY = clamp(corrY, oy + inset, oy + bh - inset - corrH)
    chamX = clamp(chamX, ox + inset, ox + bw - inset - chamW)
    chamY = clamp(chamY, oy + inset, oy + bh - inset - chamH)

    rooms.push({ id: corrId, type: 'corridor', x: corrX, y: corrY, w: corrW, h: corrH, direction: dir, parentId: hubId })
    rooms.push({ id: chamId, type: 'chamber', x: chamX, y: chamY, w: chamW, h: chamH, direction: dir, parentId: corrId })
    chamberIds.push(chamId)
  }

  // -- Alcoves off random chambers --
  for (let a = 0; a < Math.min(alcoveCount, chamberIds.length); a++) {
    const parentCham = rooms.find(r => r.id === chamberIds[a % chamberIds.length])!
    const alcId = deterministicId('room', [rootSeed, 'alc', a])
    const alcW = parentCham.w * (0.35 + rand() * 0.2)
    const alcH = parentCham.h * (0.35 + rand() * 0.2)
    // Place on a random side of parent chamber
    const side = directions[Math.floor(rand() * directions.length)]!
    let ax: number, ay: number

    if (side === 'N') {
      ax = clamp(parentCham.x + (rand() * (parentCham.w - alcW)), ox + inset, ox + bw - inset - alcW)
      ay = clamp(parentCham.y - alcH, oy + inset, parentCham.y - 4)
    } else if (side === 'S') {
      ax = clamp(parentCham.x + (rand() * (parentCham.w - alcW)), ox + inset, ox + bw - inset - alcW)
      ay = clamp(parentCham.y + parentCham.h, parentCham.y + parentCham.h, oy + bh - inset - alcH)
    } else if (side === 'E') {
      ax = clamp(parentCham.x + parentCham.w, parentCham.x + parentCham.w, ox + bw - inset - alcW)
      ay = clamp(parentCham.y + (rand() * (parentCham.h - alcH)), oy + inset, oy + bh - inset - alcH)
    } else {
      ax = clamp(parentCham.x - alcW, ox + inset, parentCham.x - 4)
      ay = clamp(parentCham.y + (rand() * (parentCham.h - alcH)), oy + inset, oy + bh - inset - alcH)
    }

    rooms.push({ id: alcId, type: 'alcove', x: ax, y: ay, w: alcW, h: alcH, parentId: parentCham.id })
  }

  // -- Loop connectivity: add a passage connecting last chamber back to first --
  if (hints?.connectivity === 'loop' && chamberIds.length >= 2) {
    const first = rooms.find(r => r.id === chamberIds[0])!
    const last = rooms.find(r => r.id === chamberIds[chamberIds.length - 1])!
    const midX = (first.x + first.w / 2 + last.x + last.w / 2) / 2
    const midY = (first.y + first.h / 2 + last.y + last.h / 2) / 2
    // Horizontal or vertical passage depending on orientation
    if (Math.abs(first.x - last.x) > Math.abs(first.y - last.y)) {
      passages.push({ roomId: first.id, axis: 'V', wallCoord: midX, gapStart: midY - corridorW / 2, gapEnd: midY + corridorW / 2 })
    } else {
      passages.push({ roomId: first.id, axis: 'H', wallCoord: midY, gapStart: midX - corridorW / 2, gapEnd: midX + corridorW / 2 })
    }
  }

  return { rooms, passages }
}

// ---------------------------------------------------------------------------
// Organic cave layout (blob rooms, guide palette)
// ---------------------------------------------------------------------------

function buildOrganicLayout(
  req: GenerateVectorMapRequest,
  rootSeed: number,
): DungeonLayout {
  const layoutRng = createRng(splitSeed(rootSeed, 'cave-layout'))
  const rand = () => layoutRng.random()

  const bounds = req.bounds_world
  const ox = bounds.origin_x
  const oy = bounds.origin_y
  const bw = bounds.width_world
  const bh = bounds.height_world

  const roomCount = Math.max(3, Math.floor(req.generation_params?.room_count ?? 7))
  const rooms: RoomDef[] = []

  for (let i = 0; i < roomCount; i++) {
    const cx = ox + (0.15 + rand() * 0.7) * bw
    const cy = oy + (0.15 + rand() * 0.7) * bh
    const rw = clamp(bw * (0.08 + rand() * 0.1), 16, bw * 0.25)
    const rh = clamp(bh * (0.08 + rand() * 0.1), 16, bh * 0.25)
    rooms.push({
      id: deterministicId('room', [rootSeed, 'cave', i]),
      type: i === 0 ? 'hub' : 'chamber',
      // For organic rooms x/y store the CENTER (reused by blob emitters)
      x: cx, y: cy, w: rw, h: rh,
    })
  }

  return { rooms, passages: [] }
}

// ---------------------------------------------------------------------------
// Element emitters
// ---------------------------------------------------------------------------

/** Full-canvas void background — solid stone. */
function emitVoid(bounds: GenerateVectorMapRequest['bounds_world'], palette: DungeonPalette, seed: number): RegionElement {
  const { origin_x: ox, origin_y: oy, width_world: bw, height_world: bh } = bounds
  return {
    type: 'polygon',
    id: deterministicId('region', [seed, 'void']),
    name: 'VoidBackground',
    points: rectPoints(ox, oy, bw, bh),
    fill: { color: palette.void },
    fill_opacity: 1,
    tags: ['wall', 'blocking'],
  }
}

/** Floor polygon for a rectangular room. */
function emitFloor(room: RoomDef, palette: DungeonPalette, seed: number): RegionElement {
  return {
    type: 'polygon',
    id: deterministicId('region', [seed, 'floor', room.id]),
    name: `Floor_${room.type}_${room.direction ?? room.id.slice(-4)}`,
    points: rectPoints(room.x, room.y, room.w, room.h),
    fill: { color: palette.floor },
    fill_opacity: 1,
    tags: ['terrain', 'floor'],
  }
}

/** Wall outline stroke — same shape, fill_opacity: 0, dark stroke. */
function emitWall(room: RoomDef, palette: DungeonPalette, seed: number): RegionElement {
  return {
    type: 'polygon',
    id: deterministicId('region', [seed, 'wall', room.id]),
    name: `Wall_${room.type}_${room.direction ?? room.id.slice(-4)}`,
    points: rectPoints(room.x, room.y, room.w, room.h),
    fill: { color: palette.void },
    fill_opacity: 0,
    stroke: { color: palette.wall_stroke, width: 3, line_cap: 'square', line_join: 'miter' },
    tags: [],
  }
}

/** Passage erase — floor-colored thin polygon painted over the shared wall edge. */
function emitPassageErase(p: Passage, palette: DungeonPalette, seed: number): RegionElement {
  let x: number, y: number, w: number, h: number
  if (p.axis === 'H') {
    x = p.gapStart
    y = p.wallCoord - 2
    w = Math.max(0, p.gapEnd - p.gapStart)
    h = 5
  } else {
    x = p.wallCoord - 2
    y = p.gapStart
    w = 5
    h = Math.max(0, p.gapEnd - p.gapStart)
  }
  return {
    type: 'polygon',
    id: deterministicId('region', [seed, 'erase', p.roomId, p.wallCoord]),
    name: 'PassageErase',
    points: rectPoints(x, y, w, h),
    fill: { color: palette.floor },
    fill_opacity: 1,
    tags: [],
  }
}

/**
 * Door symbol — 4 PathElements following the guide's recipe:
 * 1. Erase line (parchment, wide stroke)
 * 2. Door leaf (dark thin line)
 * 3. Frame ticks at each end (perpendicular)
 * 4. Swing arc (dashed quarter-circle approximation)
 */
function emitDoor(p: Passage, palette: DungeonPalette, seed: number): PathElement[] {
  const mid = (p.gapStart + p.gapEnd) / 2
  const half = (p.gapEnd - p.gapStart) / 2 * 0.75 // slightly narrower than opening

  // Positions along/across the door opening
  let x1: number, y1: number, x2: number, y2: number
  let tx1: number, ty1: number, tx2: number, ty2: number
  let arcPts: Point[]

  if (p.axis === 'H') {
    // Horizontal wall: door runs left-right
    x1 = mid - half; y1 = p.wallCoord
    x2 = mid + half; y2 = p.wallCoord
    // Ticks go perpendicular (up/down)
    tx1 = x1; ty1 = y1 - 4
    tx2 = x2; ty2 = y2 - 4
    // Arc bows upward (toward room north side)
    arcPts = arcApprox(x1, y1, x2, y2, -1)
  } else {
    // Vertical wall: door runs up-down
    x1 = p.wallCoord; y1 = mid - half
    x2 = p.wallCoord; y2 = mid + half
    tx1 = x1 - 4; ty1 = y1
    tx2 = x2 - 4; ty2 = y2
    arcPts = arcApprox(x1, y1, x2, y2, -1)
  }

  const baseId = deterministicId('path', [seed, 'door', p.roomId, p.wallCoord])

  // 1. Erase line
  const erase: PathElement = {
    type: 'polyline',
    id: `${baseId}_er`,
    name: 'DoorErase',
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    stroke: { color: palette.floor, width: 5, line_cap: 'butt', line_join: 'miter' },
    tags: [],
  }
  // 2. Door leaf
  const leaf: PathElement = {
    type: 'polyline',
    id: `${baseId}_lf`,
    name: 'DoorLeaf',
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
    tags: ['door'],
  }
  // 3. Frame ticks (two)
  const tickA: PathElement = {
    type: 'polyline',
    id: `${baseId}_ta`,
    name: 'DoorTickA',
    points: p.axis === 'H'
      ? [{ x: tx1, y: ty1 }, { x: tx1, y: ty1 + 8 }]
      : [{ x: tx1, y: ty1 }, { x: tx1 + 8, y: ty1 }],
    stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
    tags: [],
  }
  const tickB: PathElement = {
    type: 'polyline',
    id: `${baseId}_tb`,
    name: 'DoorTickB',
    points: p.axis === 'H'
      ? [{ x: tx2, y: ty2 }, { x: tx2, y: ty2 + 8 }]
      : [{ x: tx2, y: ty2 }, { x: tx2 + 8, y: ty2 }],
    stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
    tags: [],
  }
  // 4. Swing arc (dashed)
  const arc: PathElement = {
    type: 'polyline',
    id: `${baseId}_arc`,
    name: 'DoorArc',
    points: arcPts,
    stroke: { color: palette.wall_stroke, width: 1, line_cap: 'round', line_join: 'round', dash_array: [3, 2] },
    tags: [],
  }

  return [erase, leaf, tickA, tickB, arc]
}

/** Approximate a quarter-circle arc as 12 polyline points. dir: -1 = bows toward negative axis. */
function arcApprox(x1: number, y1: number, x2: number, y2: number, dir: -1 | 1): Point[] {
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const r = Math.hypot(x2 - x1, y2 - y1) / 2
  const pts: Point[] = []
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Lerp from x1/y1 to x2/y2, bowing away by r * sin(π*t)
    const lx = x1 + (x2 - x1) * t
    const ly = y1 + (y2 - y1) * t
    // Perpendicular direction
    const dx = -(y2 - y1) / (2 * r)
    const dy = (x2 - x1) / (2 * r)
    const bow = r * 0.4 * Math.sin(Math.PI * t) * dir
    pts.push({ x: lx + dx * bow, y: ly + dy * bow })
  }
  return pts
}

/**
 * Stair treads — 5 parallel polylines + 2 side rails.
 * Fills a corridor rectangle transversely.
 */
function emitStairs(room: RoomDef, palette: DungeonPalette, seed: number): PathElement[] {
  const elements: PathElement[] = []
  const treadCount = 5
  const { x, y, w, h } = room
  const isHorizontal = w > h // corridor orientation

  if (isHorizontal) {
    // Treads are vertical lines spaced evenly across corridor width
    const step = w / (treadCount + 1)
    for (let i = 1; i <= treadCount; i++) {
      const tx = x + step * i
      elements.push({
        type: 'polyline',
        id: deterministicId('path', [seed, 'stair', 'tread', i]),
        name: `StairTread${i}`,
        points: [{ x: tx, y: y + 3 }, { x: tx, y: y + h - 3 }],
        stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter' },
        tags: ['stairs'],
      })
    }
    // Side rails
    elements.push({
      type: 'polyline',
      id: deterministicId('path', [seed, 'stair', 'railT']),
      name: 'StairRailTop',
      points: [{ x: x + 3, y: y + 3 }, { x: x + w - 3, y: y + 3 }],
      stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
      tags: [],
    })
    elements.push({
      type: 'polyline',
      id: deterministicId('path', [seed, 'stair', 'railB']),
      name: 'StairRailBottom',
      points: [{ x: x + 3, y: y + h - 3 }, { x: x + w - 3, y: y + h - 3 }],
      stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
      tags: [],
    })
  } else {
    // Treads are horizontal lines spaced evenly
    const step = h / (treadCount + 1)
    for (let i = 1; i <= treadCount; i++) {
      const ty = y + step * i
      elements.push({
        type: 'polyline',
        id: deterministicId('path', [seed, 'stair', 'tread', i]),
        name: `StairTread${i}`,
        points: [{ x: x + 3, y: ty }, { x: x + w - 3, y: ty }],
        stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter' },
        tags: ['stairs'],
      })
    }
    elements.push({
      type: 'polyline',
      id: deterministicId('path', [seed, 'stair', 'railL']),
      name: 'StairRailLeft',
      points: [{ x: x + 3, y: y + 3 }, { x: x + 3, y: y + h - 3 }],
      stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
      tags: [],
    })
    elements.push({
      type: 'polyline',
      id: deterministicId('path', [seed, 'stair', 'railR']),
      name: 'StairRailRight',
      points: [{ x: x + w - 3, y: y + 3 }, { x: x + w - 3, y: y + h - 3 }],
      stroke: { color: palette.wall_stroke, width: 2, line_cap: 'butt', line_join: 'miter' },
      tags: [],
    })
  }

  return elements
}

/**
 * Column — 16-point polygon approximating a circle.
 * Placed at given center, representing an architectural column.
 */
function emitColumn(cx: number, cy: number, r: number, palette: DungeonPalette, seed: number, idx: number): RegionElement {
  return {
    type: 'polygon',
    id: deterministicId('region', [seed, 'col', idx, cx, cy]),
    name: `Column${idx}`,
    points: circlePoints(cx, cy, r),
    fill: { color: palette.column_fill },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 1.5, line_cap: 'round', line_join: 'round' },
    tags: ['wall', 'blocking', 'column'],
  }
}

/**
 * Altar ring — concentric polyline rings.
 * Number of rings: 2 (outer + inner disc).
 */
function emitAltarRing(cx: number, cy: number, outerR: number, palette: DungeonPalette, seed: number): OverlayElement[] {
  const elements: OverlayElement[] = []

  // Outer ring
  elements.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'altar', 'outer', cx, cy]),
    name: 'AltarOuter',
    points: circlePoints(cx, cy, outerR, 20),
    fill: { color: palette.floor },
    fill_opacity: 0,
    stroke: { color: palette.wall_stroke, width: 1.5, line_cap: 'round', line_join: 'round' },
    tags: [],
  })

  const innerR = outerR * 0.6
  // Inner ring (dashed)
  elements.push({
    type: 'polyline',
    id: deterministicId('path', [seed, 'altar', 'inner', cx, cy]),
    name: 'AltarInner',
    points: circlePoints(cx, cy, innerR, 20),
    stroke: { color: palette.wall_stroke, width: 0.8, line_cap: 'round', line_join: 'round', dash_array: [4, 3] },
    tags: [],
  })

  // Filled center disc
  elements.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'altar', 'disc', cx, cy]),
    name: 'AltarDisc',
    points: circlePoints(cx, cy, outerR * 0.22, 12),
    fill: { color: palette.feature_mid },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 1, line_cap: 'round', line_join: 'round' },
    tags: [],
  })

  // Cardinal cross-hair polylines
  elements.push({
    type: 'polyline',
    id: deterministicId('path', [seed, 'altar', 'crossV', cx, cy]),
    name: 'AltarCrossV',
    points: [{ x: cx, y: cy - innerR * 0.8 }, { x: cx, y: cy + innerR * 0.8 }],
    stroke: { color: palette.wall_stroke, width: 1.5, line_cap: 'round', line_join: 'round' },
    tags: [],
  })
  elements.push({
    type: 'polyline',
    id: deterministicId('path', [seed, 'altar', 'crossH', cx, cy]),
    name: 'AltarCrossH',
    points: [{ x: cx - innerR * 0.8, y: cy }, { x: cx + innerR * 0.8, y: cy }],
    stroke: { color: palette.wall_stroke, width: 1.5, line_cap: 'round', line_join: 'round' },
    tags: [],
  })

  return elements
}

/**
 * Sarcophagus — outer case rect + inner lid rect + ellipse head polygon.
 */
function emitSarcophagus(
  cx: number, cy: number,
  palette: DungeonPalette,
  seed: number, idx: number,
): RegionElement[] {
  const ow = 18, oh = 30
  const x = cx - ow / 2, y = cy - oh / 2
  // Outer case
  const outer: RegionElement = {
    type: 'polygon',
    id: deterministicId('region', [seed, 'sarc', 'outer', idx]),
    name: `SarcOuter${idx}`,
    points: rectPoints(x, y, ow, oh),
    fill: { color: palette.feature_mid },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 1.5, line_cap: 'square', line_join: 'miter' },
    tags: ['wall', 'blocking'],
  }
  // Inner lid
  const inner: RegionElement = {
    type: 'polygon',
    id: deterministicId('region', [seed, 'sarc', 'inner', idx]),
    name: `SarcInner${idx}`,
    points: rectPoints(x + 3, y + 3, ow - 6, oh - 6),
    fill: { color: palette.feature_dark },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 1, line_cap: 'square', line_join: 'miter' },
    tags: [],
  }
  // Head ellipse approximated as a 12-gon
  const head: RegionElement = {
    type: 'polygon',
    id: deterministicId('region', [seed, 'sarc', 'head', idx]),
    name: `SarcHead${idx}`,
    points: circlePoints(cx, y + 9, 5, 12).map(p => ({ x: p.x, y: p.y * 0.7 + cy * 0.3 })),
    fill: { color: palette.feature_mid },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 1, line_cap: 'round', line_join: 'round' },
    tags: [],
  }
  return [outer, inner, head]
}

/**
 * Ritual circle (wizard library) — 2 concentric rings + disc + dashed middle.
 */
function emitRitualCircle(
  cx: number, cy: number, r: number,
  palette: DungeonPalette, seed: number, idx: number,
): OverlayElement[] {
  return [
    {
      type: 'polygon',
      id: deterministicId('region', [seed, 'ritual', 'outer', idx]),
      name: `RitualOuter${idx}`,
      points: circlePoints(cx, cy, r, 20),
      fill: { color: palette.floor },
      fill_opacity: 0,
      stroke: { color: palette.wall_stroke, width: 1.2, line_cap: 'round', line_join: 'round' },
      tags: [],
    } as RegionElement,
    {
      type: 'polyline',
      id: deterministicId('path', [seed, 'ritual', 'mid', idx]),
      name: `RitualMid${idx}`,
      points: circlePoints(cx, cy, r * 0.65, 20),
      stroke: { color: palette.wall_stroke, width: 0.8, line_cap: 'round', line_join: 'round', dash_array: [4, 3] },
      tags: [],
    } as PathElement,
    {
      type: 'polygon',
      id: deterministicId('region', [seed, 'ritual', 'disc', idx]),
      name: `RitualDisc${idx}`,
      points: circlePoints(cx, cy, r * 0.2, 10),
      fill: { color: palette.feature_mid },
      fill_opacity: 1,
      stroke: { color: palette.wall_stroke, width: 1, line_cap: 'round', line_join: 'round' },
      tags: [],
    } as RegionElement,
  ]
}

/**
 * Portcullis — horizontal rails + vertical bars across an opening.
 */
function emitPortcullis(p: Passage, palette: DungeonPalette, seed: number): PathElement[] {
  const elements: PathElement[] = []
  const barSpacing = 8

  if (p.axis === 'H') {
    const y = p.wallCoord
    const railY1 = y - 4
    const railY2 = y + 4
    // Rails
    elements.push({
      type: 'polyline', id: deterministicId('path', [seed, 'pcul', 'r1', p.wallCoord]),
      name: 'PortRail1', points: [{ x: p.gapStart, y: railY1 }, { x: p.gapEnd, y: railY1 }],
      stroke: { color: palette.wall_stroke, width: 1.2, line_cap: 'butt', line_join: 'miter' }, tags: [],
    })
    elements.push({
      type: 'polyline', id: deterministicId('path', [seed, 'pcul', 'r2', p.wallCoord]),
      name: 'PortRail2', points: [{ x: p.gapStart, y: railY2 }, { x: p.gapEnd, y: railY2 }],
      stroke: { color: palette.wall_stroke, width: 1.2, line_cap: 'butt', line_join: 'miter' }, tags: [],
    })
    // Bars
    let bx = p.gapStart + barSpacing / 2
    let bi = 0
    while (bx < p.gapEnd) {
      elements.push({
        type: 'polyline', id: deterministicId('path', [seed, 'pcul', 'bar', bi++, p.wallCoord]),
        name: `PortBar${bi}`, points: [{ x: bx, y: railY1 }, { x: bx, y: railY2 }],
        stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter' }, tags: [],
      })
      bx += barSpacing
    }
  } else {
    const x = p.wallCoord
    const railX1 = x - 4, railX2 = x + 4
    elements.push({
      type: 'polyline', id: deterministicId('path', [seed, 'pcul', 'r1', p.wallCoord]),
      name: 'PortRail1', points: [{ x: railX1, y: p.gapStart }, { x: railX1, y: p.gapEnd }],
      stroke: { color: palette.wall_stroke, width: 1.2, line_cap: 'butt', line_join: 'miter' }, tags: [],
    })
    elements.push({
      type: 'polyline', id: deterministicId('path', [seed, 'pcul', 'r2', p.wallCoord]),
      name: 'PortRail2', points: [{ x: railX2, y: p.gapStart }, { x: railX2, y: p.gapEnd }],
      stroke: { color: palette.wall_stroke, width: 1.2, line_cap: 'butt', line_join: 'miter' }, tags: [],
    })
    let by = p.gapStart + barSpacing / 2
    let bi = 0
    while (by < p.gapEnd) {
      elements.push({
        type: 'polyline', id: deterministicId('path', [seed, 'pcul', 'bar', bi++, p.wallCoord]),
        name: `PortBar${bi}`, points: [{ x: railX1, y: by }, { x: railX2, y: by }],
        stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter' }, tags: [],
      })
      by += barSpacing
    }
  }

  return elements
}

/** Water fill polygon (flooded area). */
function emitWaterFill(
  x: number, y: number, w: number, h: number,
  palette: DungeonPalette, seed: number, idx: number,
  tags: string[],
): RegionElement {
  return {
    type: 'polygon',
    id: deterministicId('region', [seed, 'water', idx]),
    name: `WaterFill${idx}`,
    points: rectPoints(x, y, w, h),
    fill: { color: tags.includes('lava') ? palette.lava : palette.water },
    fill_opacity: 0.8,
    stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter' },
    tags,
  }
}

/** Rubble pile — two overlapping ellipse polygons. */
function emitRubblePile(
  cx: number, cy: number,
  palette: DungeonPalette, seed: number, idx: number,
): RegionElement[] {
  return [
    {
      type: 'polygon',
      id: deterministicId('region', [seed, 'rubble', 'outer', idx]),
      name: `RubbleOuter${idx}`,
      points: circlePoints(cx, cy, 12, 10).map(p => ({ x: p.x, y: p.y * 0.65 + cy * 0.35 })),
      fill: { color: palette.feature_mid },
      fill_opacity: 1,
      stroke: { color: palette.wall_stroke, width: 1, line_cap: 'round', line_join: 'round' },
      tags: ['wall', 'blocking'],
    },
    {
      type: 'polygon',
      id: deterministicId('region', [seed, 'rubble', 'inner', idx]),
      name: `RubbleInner${idx}`,
      points: circlePoints(cx, cy, 7, 8).map(p => ({ x: p.x, y: p.y * 0.65 + cy * 0.35 })),
      fill: { color: palette.feature_dark },
      fill_opacity: 1,
      stroke: { color: palette.wall_stroke, width: 0.8, line_cap: 'round', line_join: 'round' },
      tags: [],
    },
  ]
}

/** Room label — serif italic, sized by room type. */
function emitLabel(room: RoomDef, label: string, palette: DungeonPalette, seed: number): TextElement {
  const fontSize = room.type === 'hub' ? 10 : room.type === 'chamber' ? 8 : 7
  const cx = room.x + room.w / 2
  const cy = room.y + room.h / 3  // upper third of room
  return {
    type: 'text',
    id: deterministicId('text', [seed, 'label', room.id]),
    name: `Label_${room.type}`,
    position: { x: cx, y: cy },
    text: label,
    color: palette.label_ink,
    font_size: fontSize,
    visible: true,
    tags: ['room_label'],
  }
}

// Cartographic elements ---

/** Compass rose — placed in a corner, polygon + text. */
function emitCompass(
  bounds: GenerateVectorMapRequest['bounds_world'],
  palette: DungeonPalette,
  seed: number,
): OverlayElement[] {
  const { origin_x: ox, origin_y: oy, width_world: bw, height_world: bh } = bounds
  // Place in bottom-left corner
  const r = Math.min(bw, bh) * 0.06
  const cx = ox + r + 6
  const cy = oy + bh - r - 6

  const elems: OverlayElement[] = []

  // Background circle (polygon approx)
  elems.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'compass', 'bg']),
    name: 'CompassBg',
    points: circlePoints(cx, cy, r, 20),
    fill: { color: palette.ui_parchment },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 1.2, line_cap: 'round', line_join: 'round' },
    tags: [],
  } as RegionElement)

  // N point (filled dark)
  elems.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'compass', 'N']),
    name: 'CompassN',
    points: [
      { x: cx, y: cy - r },
      { x: cx + r * 0.18, y: cy - r * 0.3 },
      { x: cx, y: cy - r * 0.45 },
      { x: cx - r * 0.18, y: cy - r * 0.3 },
      { x: cx, y: cy - r },
    ],
    fill: { color: palette.wall_stroke },
    fill_opacity: 1,
    tags: [],
  } as RegionElement)

  // S point (lighter)
  elems.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'compass', 'S']),
    name: 'CompassS',
    points: [
      { x: cx, y: cy + r },
      { x: cx + r * 0.18, y: cy + r * 0.3 },
      { x: cx, y: cy + r * 0.45 },
      { x: cx - r * 0.18, y: cy + r * 0.3 },
      { x: cx, y: cy + r },
    ],
    fill: { color: palette.feature_dark },
    fill_opacity: 1,
    tags: [],
  } as RegionElement)

  // E + W points
  for (const [dx, dy, ns] of [[ r, 0, 'E'], [-r, 0, 'W']] as [number, number, string][]) {
    elems.push({
      type: 'polygon',
      id: deterministicId('region', [seed, 'compass', ns]),
      name: `Compass${ns}`,
      points: [
        { x: cx + dx, y: cy + dy },
        { x: cx + dx * 0.3 + dy * 0.18, y: cy + dy * 0.3 - dx * 0.18 },
        { x: cx + dx * 0.45, y: cy + dy * 0.45 },
        { x: cx + dx * 0.3 - dy * 0.18, y: cy + dy * 0.3 + dx * 0.18 },
        { x: cx + dx, y: cy + dy },
      ],
      fill: { color: palette.wall_stroke },
      fill_opacity: 1,
      tags: [],
    } as RegionElement)
  }

  // N label
  elems.push({
    type: 'text',
    id: deterministicId('text', [seed, 'compass', 'Nlabel']),
    name: 'CompassNLabel',
    position: { x: cx, y: cy - r - 4 },
    text: 'N',
    color: palette.label_ink,
    font_size: Math.max(6, r * 0.55),
    visible: true,
    tags: [],
  } as TextElement)

  return elems
}

/** Scale bar — two adjacent polygons + 3 text labels. */
function emitScaleBar(
  bounds: GenerateVectorMapRequest['bounds_world'],
  palette: DungeonPalette,
  seed: number,
  cellSize: number,
): OverlayElement[] {
  const { origin_x: ox, origin_y: oy, width_world: bw, height_world: bh } = bounds

  // 8 world-units per bar half (= one 5ft square with default cell = 5)
  const halfW = cellSize * 2
  const barH = Math.max(3, bh * 0.012)
  const barX = ox + bw / 2 - halfW
  const barY = oy + bh - barH - 8

  const elems: OverlayElement[] = []

  // Filled first half
  elems.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'scalebar', 'filled']),
    name: 'ScaleBarFilled',
    points: rectPoints(barX, barY, halfW, barH),
    fill: { color: palette.wall_stroke },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 0.8, line_cap: 'butt', line_join: 'miter' },
    tags: [],
  } as RegionElement)

  // Empty second half
  elems.push({
    type: 'polygon',
    id: deterministicId('region', [seed, 'scalebar', 'empty']),
    name: 'ScaleBarEmpty',
    points: rectPoints(barX + halfW, barY, halfW, barH),
    fill: { color: palette.ui_parchment },
    fill_opacity: 1,
    stroke: { color: palette.wall_stroke, width: 0.8, line_cap: 'butt', line_join: 'miter' },
    tags: [],
  } as RegionElement)

  const labelY = barY + barH + 5
  for (const [tx, text] of [
    [barX, '0'],
    [barX + halfW, `${cellSize * 2} ft`],
    [barX + halfW * 2, `${cellSize * 4} ft`],
  ] as [number, string][]) {
    elems.push({
      type: 'text',
      id: deterministicId('text', [seed, 'scalebar', text]),
      name: `ScaleLabel_${text}`,
      position: { x: tx, y: labelY },
      text,
      color: palette.label_ink,
      font_size: 6,
      visible: true,
      tags: [],
    } as TextElement)
  }

  return elems
}

/** Title banner — polygon background + bold text. */
function emitTitleBanner(
  bounds: GenerateVectorMapRequest['bounds_world'],
  title: string,
  palette: DungeonPalette,
  seed: number,
): OverlayElement[] {
  const { origin_x: ox, origin_y: oy, width_world: bw } = bounds
  const bannerW = bw * 0.45
  const bannerH = 18
  const bannerX = ox + (bw - bannerW) / 2
  const bannerY = oy + 4

  return [
    {
      type: 'polygon',
      id: deterministicId('region', [seed, 'title', 'bg']),
      name: 'TitleBannerBg',
      points: rectPoints(bannerX, bannerY, bannerW, bannerH),
      fill: { color: palette.ui_parchment },
      fill_opacity: 1,
      stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter' },
      tags: [],
    } as RegionElement,
    {
      type: 'text',
      id: deterministicId('text', [seed, 'title', 'text']),
      name: 'TitleText',
      position: { x: ox + bw / 2, y: bannerY + bannerH * 0.65 },
      text: title,
      color: palette.wall_stroke,
      font_size: 10,
      visible: true,
      tags: [],
    } as TextElement,
  ]
}

// ---------------------------------------------------------------------------
// Column placement per room type
// ---------------------------------------------------------------------------

function emitColumnsForRoom(
  room: RoomDef,
  palette: DungeonPalette,
  seed: number,
  baseIdx: number,
): RegionElement[] {
  const { x, y, w, h } = room
  const r = Math.min(w, h) * 0.06
  if (r < 2) return []

  const inset = r + 4
  const elements: RegionElement[] = []

  if (room.type === 'hub') {
    // 4 columns near corners
    const positions = [
      { cx: x + inset, cy: y + inset },
      { cx: x + w - inset, cy: y + inset },
      { cx: x + inset, cy: y + h - inset },
      { cx: x + w - inset, cy: y + h - inset },
    ]
    positions.forEach((p, i) => {
      elements.push(emitColumn(p.cx, p.cy, r, palette, seed, baseIdx + i))
    })
  } else if (room.type === 'chamber') {
    // 2 columns on one side
    const cx1 = x + inset
    const cx2 = x + w - inset
    const cy = y + h * 0.35
    elements.push(emitColumn(cx1, cy, r * 0.85, palette, seed, baseIdx))
    elements.push(emitColumn(cx2, cy, r * 0.85, palette, seed, baseIdx + 1))
  }
  // alcoves and corridors get no columns

  return elements
}

// ---------------------------------------------------------------------------
// Signature feature dispatch
// ---------------------------------------------------------------------------

function emitSignatureFeatures(
  rooms: RoomDef[],
  passages: Passage[],
  palette: DungeonPalette,
  seed: number,
  stylePreset: string,
  featureRng: { random: () => number },
): OverlayElement[] {
  const elems: OverlayElement[] = []
  const hub = rooms.find(r => r.type === 'hub')
  const chambers = rooms.filter(r => r.type === 'chamber')

  switch (stylePreset) {
    case 'ancient-crypt': {
      // Altar ring in hub center
      if (hub) {
        const r = Math.min(hub.w, hub.h) * 0.22
        elems.push(...emitAltarRing(hub.x + hub.w / 2, hub.y + hub.h / 2, r, palette, seed))
      }
      // Sarcophagi in chambers
      chambers.slice(0, 2).forEach((ch, i) => {
        const cx = ch.x + ch.w * 0.5
        const cy = ch.y + ch.h * 0.55
        elems.push(...emitSarcophagus(cx, cy, palette, seed, i))
      })
      break
    }

    case 'wizard-library': {
      // Ritual circles in hub
      if (hub) {
        const r1 = Math.min(hub.w, hub.h) * 0.18
        elems.push(...emitRitualCircle(hub.x + hub.w / 2, hub.y + hub.h / 2, r1, palette, seed, 0))
        // Second smaller circle offset
        const r2 = r1 * 0.5
        elems.push(...emitRitualCircle(hub.x + hub.w * 0.75, hub.y + hub.h * 0.3, r2, palette, seed, 1))
      }
      // Shelf parallels in alcoves
      rooms.filter(r => r.type === 'alcove').forEach((alc, i) => {
        const { x, y, w, h } = alc
        const isW = w > h
        const shelfCount = 3
        for (let s = 0; s < shelfCount; s++) {
          const t = (s + 1) / (shelfCount + 1)
          elems.push({
            type: 'polyline',
            id: deterministicId('path', [seed, 'shelf', i, s]),
            name: `Shelf${i}_${s}`,
            points: isW
              ? [{ x: x + 3, y: y + h * t }, { x: x + w - 3, y: y + h * t }]
              : [{ x: x + w * t, y: y + 3 }, { x: x + w * t, y: y + h - 3 }],
            stroke: { color: palette.wall_stroke, width: 1, line_cap: 'butt', line_join: 'miter', dash_array: null },
            tags: ['wall'],
          } as PathElement)
        }
      })
      break
    }

    case 'fortress-gate': {
      // Portcullis at the first passage into hub
      const hubPassage = passages.find(p => p.roomId === hub?.id)
      if (hubPassage) elems.push(...emitPortcullis(hubPassage, palette, seed))
      break
    }

    case 'temple-ruins': {
      // Altar ring in hub
      if (hub) {
        const r = Math.min(hub.w, hub.h) * 0.2
        elems.push(...emitAltarRing(hub.x + hub.w / 2, hub.y + hub.h / 2, r, palette, seed))
      }
      // Rubble piles in up to 2 chambers
      chambers.slice(0, 2).forEach((ch, i) => {
        const cx = ch.x + ch.w * (0.3 + featureRng.random() * 0.4)
        const cy = ch.y + ch.h * (0.4 + featureRng.random() * 0.2)
        elems.push(...emitRubblePile(cx, cy, palette, seed, i))
      })
      break
    }

    default:
      // No signature feature — hub columns already handled in Phase 3
      break
  }

  return elems
}

// ---------------------------------------------------------------------------
// Hazard water/lava emitter (organic preset)
// ---------------------------------------------------------------------------

function emitHazardsForOrganic(
  rooms: RoomDef[],
  palette: DungeonPalette,
  seed: number,
  featureRng: { random: () => number },
  stylePreset: string,
): RegionElement[] {
  const chambers = rooms.filter(r => r.type === 'chamber')
  const elems: RegionElement[] = []

  if (stylePreset === 'caverns-hazards') {
    if (chambers.length >= 1) {
      const ch = chambers[0]!
      // Water fill covering inner 60% of first chamber
      const pw = ch.w * 0.6, ph = ch.h * 0.6
      elems.push(emitWaterFill(
        ch.x + (ch.w - pw) / 2, ch.y + (ch.h - ph) / 2, pw, ph,
        palette, seed, 0, ['water'],
      ))
    }
    if (chambers.length >= 2) {
      const ch = chambers[1]!
      const pw = ch.w * 0.5, ph = ch.h * 0.5
      elems.push(emitWaterFill(
        ch.x + (ch.w - pw) / 2, ch.y + (ch.h - ph) / 2, pw, ph,
        palette, seed, 1, ['wall', 'lava'],
      ))
    }
  } else if (stylePreset === 'sewer-tunnels') {
    // Water channel down the first chamber
    if (chambers.length >= 1) {
      const ch = chambers[0]!
      const cw = ch.w * 0.25
      elems.push(emitWaterFill(
        ch.x + (ch.w - cw) / 2, ch.y, cw, ch.h,
        palette, seed, 0, ['water', 'difficult'],
      ))
    }
  }

  return elems
}

// ---------------------------------------------------------------------------
// Organic layer builder (caves/sewers)
// ---------------------------------------------------------------------------

function buildOrganicLayers(
  req: GenerateVectorMapRequest,
  rootSeed: number,
  palette: DungeonPalette,
  layout: DungeonLayout,
): OverlayLayer[] {
  const layoutRng = createRng(splitSeed(rootSeed, 'cave-layout'))
  const featureRng = createRng(splitSeed(rootSeed, 'cave-features'))
  const stylePreset = req.style_options?.style_preset ?? req.style_preset ?? ''

  const voidLayer  = makeLayer(rootSeed, 'void',     'VoidLayer',     10)
  const floorLayer = makeLayer(rootSeed, 'floors',   'FloorShapes',   20)
  const wallLayer  = makeLayer(rootSeed, 'walls',    'WallStrokes',   25)
  const waterLayer = makeLayer(rootSeed, 'water',    'HazardWater',   50)
  const labelLayer = makeLayer(rootSeed, 'labels',   'RoomLabels',    70)
  const cartoLayer = makeLayer(rootSeed, 'carto',    'Cartographic',  80)

  // Void
  voidLayer.elements.push(emitVoid(req.bounds_world, palette, rootSeed))

  // Blob rooms
  const bounds = req.bounds_world
  const roomNames = ['Cave Chamber', 'Side Passage', 'Hidden Grotto', 'Flooded Alcove', 'Deep Cavern',
    'Lava Vent', 'Crystal Cave', 'Dark Hollow', 'Narrow Squeeze', 'Bone Chamber']

  layout.rooms.forEach((room, i) => {
    const pts = blobPolygon(room.x, room.y, room.w, room.h, 10, () => layoutRng.random())

    floorLayer.elements.push({
      type: 'polygon',
      id: deterministicId('region', [rootSeed, 'floor', room.id]),
      name: `Floor_cave_${i}`,
      points: pts,
      fill: { color: palette.floor },
      fill_opacity: 1,
      tags: ['terrain', 'floor'],
    } as RegionElement)

    wallLayer.elements.push({
      type: 'polygon',
      id: deterministicId('region', [rootSeed, 'wall', room.id]),
      name: `Wall_cave_${i}`,
      points: pts,
      fill: { color: palette.void },
      fill_opacity: 0,
      stroke: { color: palette.wall_stroke, width: 3, line_cap: 'round', line_join: 'round' },
      tags: [],
    } as RegionElement)

    // Label
    const label = roomNames[i % roomNames.length] ?? `Cave ${i + 1}`
    labelLayer.elements.push({
      type: 'text',
      id: deterministicId('text', [rootSeed, 'label', room.id]),
      name: `Label_cave_${i}`,
      position: { x: room.x, y: room.y },
      text: label,
      color: palette.label_ink,
      font_size: i === 0 ? 10 : 8,
      visible: true,
      tags: ['room_label'],
    } as TextElement)
  })

  // Hazards
  const hazards = emitHazardsForOrganic(layout.rooms, palette, rootSeed, featureRng, stylePreset)
  waterLayer.elements.push(...hazards)

  // Cartographic
  const cellSize = req.grid_config?.base_cell_size_world ?? 5
  cartoLayer.elements.push(...emitCompass(bounds, palette, rootSeed))
  cartoLayer.elements.push(...emitScaleBar(bounds, palette, rootSeed, cellSize))
  cartoLayer.elements.push(...emitTitleBanner(bounds, req.name ?? 'Cavern Map', palette, rootSeed))

  return [voidLayer, floorLayer, wallLayer, waterLayer, labelLayer, cartoLayer]
}

// ---------------------------------------------------------------------------
// Hub-and-spoke layer builder
// ---------------------------------------------------------------------------

function buildDungeonLayers(
  req: GenerateVectorMapRequest,
  rootSeed: number,
  palette: DungeonPalette,
  layout: DungeonLayout,
): OverlayLayer[] {
  const featureRng = createRng(splitSeed(rootSeed, 'dungeon-features'))
  const stylePreset = req.style_options?.style_preset ?? req.style_preset ?? ''

  const voidLayer    = makeLayer(rootSeed, 'void',    'VoidLayer',     10)
  const floorLayer   = makeLayer(rootSeed, 'floors',  'FloorShapes',   20)
  const wallLayer    = makeLayer(rootSeed, 'walls',   'WallStrokes',   25)
  const eraseLayer   = makeLayer(rootSeed, 'erases',  'PassageErases', 30)
  const doorLayer    = makeLayer(rootSeed, 'doors',   'Doors',         40)
  const stairLayer   = makeLayer(rootSeed, 'stairs',  'Stairs',        45)
  const waterLayer   = makeLayer(rootSeed, 'water',   'HazardWater',   50)
  const featureLayer = makeLayer(rootSeed, 'feats',   'Features',      60)
  const labelLayer   = makeLayer(rootSeed, 'labels',  'RoomLabels',    70)
  const cartoLayer   = makeLayer(rootSeed, 'carto',   'Cartographic',  80)

  // 1. Void background
  voidLayer.elements.push(emitVoid(req.bounds_world, palette, rootSeed))

  // 2 + 3. Floor shapes and wall strokes for every room
  layout.rooms.forEach(room => {
    floorLayer.elements.push(emitFloor(room, palette, rootSeed))
    wallLayer.elements.push(emitWall(room, palette, rootSeed))
  })

  // 4. Passage erase + doors
  layout.passages.forEach(p => {
    eraseLayer.elements.push(emitPassageErase(p, palette, rootSeed))
    doorLayer.elements.push(...emitDoor(p, palette, rootSeed))
  })

  // 5. Stairs in a seeded corridor selection
  const corridors = layout.rooms.filter(r => r.type === 'corridor')
  if (corridors.length > 0) {
    const stairCorrIdx = Math.floor(featureRng.random() * corridors.length)
    const stairCorr = corridors[stairCorrIdx]!
    stairLayer.elements.push(...emitStairs(stairCorr, palette, rootSeed))
  }

  // 6. Water hazards (only for specific presets)
  if (stylePreset === 'caverns-hazards' || stylePreset === 'sewer-tunnels') {
    const hazards = emitHazardsForOrganic(layout.rooms, palette, rootSeed, featureRng, stylePreset)
    waterLayer.elements.push(...hazards)
  }

  // 7. Columns for hub + chambers
  let colIdx = 0
  layout.rooms.forEach(room => {
    if (room.type === 'hub' || room.type === 'chamber') {
      const cols = emitColumnsForRoom(room, palette, rootSeed, colIdx)
      featureLayer.elements.push(...cols)
      colIdx += cols.length
    }
  })

  // 8. Signature feature per stylePreset
  const sigFeatures = emitSignatureFeatures(
    layout.rooms, layout.passages, palette, rootSeed, stylePreset, featureRng,
  )
  featureLayer.elements.push(...sigFeatures)

  // 9. Room labels — use layout_hints labels if available
  const hintRooms = req.generation_params?.layout_hints?.rooms
  const roomTypeNames: Record<string, string[]> = {
    hub:      ['Grand Hall', 'Main Chamber', 'Central Vault', 'Great Hall', 'Inner Sanctum'],
    chamber:  ['Guard Room', 'Burial Chamber', 'Treasure Room', 'Barracks', 'Ritual Chamber', 'Study'],
    alcove:   ['Alcove', 'Side Chamber', 'Closet', 'Shrine', 'Hidden Nook'],
    corridor: [],
  }
  const usedNames: Record<string, number> = {}
  let chamberIdx = 0
  layout.rooms.forEach((room, i) => {
    if (room.type === 'corridor') return // corridors are passages, not named spaces
    // Use hint label for chambers if available
    let label: string | undefined
    if (room.type === 'chamber' && hintRooms && chamberIdx < hintRooms.length) {
      label = hintRooms[chamberIdx]?.label
      chamberIdx++
    }
    if (!label) {
      const pool = roomTypeNames[room.type] ?? ['Room']
      const nameIdx = usedNames[room.type] ?? 0
      label = pool[nameIdx % pool.length] ?? `Room ${i + 1}`
      usedNames[room.type] = nameIdx + 1
    }
    labelLayer.elements.push(emitLabel(room, label, palette, rootSeed))
  })

  // 10. Cartographic
  const cellSize = req.grid_config?.base_cell_size_world ?? 5
  cartoLayer.elements.push(...emitCompass(req.bounds_world, palette, rootSeed))
  cartoLayer.elements.push(...emitScaleBar(req.bounds_world, palette, rootSeed, cellSize))
  cartoLayer.elements.push(...emitTitleBanner(req.bounds_world, req.name ?? 'Dungeon Map', palette, rootSeed))

  return [
    voidLayer, floorLayer, wallLayer, eraseLayer, doorLayer,
    stairLayer, waterLayer, featureLayer, labelLayer, cartoLayer,
  ]
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export type DungeonGeneratorOptions = {
  /** When true, use organic blob rooms instead of hub-and-spoke rectangles. */
  organic?: boolean
}

export function makeDungeonOverlay(
  req: GenerateVectorMapRequest,
  opts: DungeonGeneratorOptions = {},
): OverlayPayload {
  const generatorVersion = 'dungeon-gen-1.0.0'
  const rootSeed = stableSeed(req.seed, req, generatorVersion)

  const stylePreset = req.style_options?.style_preset ?? req.style_preset ?? ''
  const palette = getDungeonPalette(stylePreset)

  const layout: DungeonLayout = opts.organic
    ? buildOrganicLayout(req, rootSeed)
    : buildHubAndSpokeLayout(req, rootSeed)

  const layers = opts.organic
    ? buildOrganicLayers(req, rootSeed, palette, layout)
    : buildDungeonLayers(req, rootSeed, palette, layout)

  return {
    id: deterministicId('overlay', [rootSeed, req.map_id ?? 'dungeon']),
    name: req.name ?? 'Generated Dungeon Map',
    version: '1.0',
    created_at: new Date((rootSeed % 2147483647) * 1000).toISOString(),
    map_id: req.map_id,
    metadata: {
      seed: req.seed,
      ...(req.preset_id ? { preset_id: req.preset_id } : {}),
      story_context: req.story_prompt ?? '',
      narrative_tags: req.story_prompt
        ? req.story_prompt.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 12)
        : [],
      world_bounds: req.bounds_world,
      generator_version: generatorVersion,
      vectorized_from_map: false,
    },
    styles: {
      default: {
        id: stylePreset || 'dungeon-default',
        name: stylePreset || 'Dungeon Default',
        palette: {
          primary:   palette.void,
          secondary: palette.floor,
          accent_1:  palette.wall_stroke,
          accent_2:  palette.column_fill,
          accent_3:  palette.feature_mid,
        },
        noise_seed: rootSeed,
        edge_feathering: 0,
        jitter: 0,
        max_saturation: req.style_options?.max_saturation ?? 0.1,
        allow_magic_glow: req.style_options?.allow_magic_glow ?? false,
        decal_library: {},
      },
    },
    layers: layers.sort((a, b) => a.z_index - b.z_index),
  }
}
