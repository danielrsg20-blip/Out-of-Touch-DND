/**
 * Structural assertions for dungeonGenerator.ts.
 *
 * These tests do NOT lock hash values — they assert invariants about the
 * shape and contents of the generated overlay: layer IDs, element counts,
 * coordinate bounds, and palette usage.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateVectorMap } from './generateVectorMap.js'
import type { GenerateVectorMapRequest } from './types.js'

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function dungeonReq(seed: number): GenerateVectorMapRequest {
  return {
    seed,
    biome: 'crypt',
    preset_id: 'ancient_tomb_crypt',
    name: 'Structure Test Dungeon',
    bounds_world: { origin_x: 0, origin_y: 0, width_world: 640, height_world: 480 },
    generation_params: {
      room_count: 7,
      corridor_width_cells: 2,
      obstacle_density: 0.15,
      hazard_density: 0.1,
    },
    grid_config: {
      base_cell_size_world: 5,
      resolution_scale: 2,
      diagonal_policy: 'allow',
      movement_cost_mode: 'world_units',
    },
    validation_mode: 'fixup',
    style_preset: 'ancient-crypt',
  }
}

function caveReq(seed: number): GenerateVectorMapRequest {
  return {
    seed,
    biome: 'cavern',
    preset_id: 'caves_caverns_lava_water',
    name: 'Structure Test Cave',
    bounds_world: { origin_x: 0, origin_y: 0, width_world: 640, height_world: 480 },
    generation_params: {
      room_count: 6,
      corridor_width_cells: 1,
      obstacle_density: 0.2,
      hazard_density: 0.2,
    },
    grid_config: {
      base_cell_size_world: 5,
      resolution_scale: 2,
      diagonal_policy: 'allow',
      movement_cost_mode: 'world_units',
    },
    validation_mode: 'fixup',
    style_preset: 'caverns-hazards',
  }
}

// ---------------------------------------------------------------------------
// Layer name helpers
// ---------------------------------------------------------------------------

function layerByName(output: ReturnType<typeof generateVectorMap>, name: string) {
  const layer = output.overlay.layers.find(l => l.name === name)
  assert.ok(layer, `Layer "${name}" not found. Available: ${output.overlay.layers.map(l => l.name).join(', ')}`)
  return layer
}

// ---------------------------------------------------------------------------
// Dungeon (hub-and-spoke) structural tests
// ---------------------------------------------------------------------------

test('dungeon overlay has required layers', () => {
  const output = generateVectorMap(dungeonReq(1001))
  const names = output.overlay.layers.map(l => l.name)

  for (const required of ['VoidLayer', 'FloorShapes', 'WallStrokes']) {
    assert.ok(names.includes(required), `Missing layer: ${required}`)
  }
})

test('dungeon VoidLayer has exactly one element', () => {
  const output = generateVectorMap(dungeonReq(1002))
  const voidLayer = layerByName(output, 'VoidLayer')
  assert.equal(voidLayer.elements.length, 1, 'VoidLayer should have exactly one full-canvas polygon')
})

test('dungeon FloorShapes contains at least room_count polygons', () => {
  const req = dungeonReq(1003)
  const output = generateVectorMap(req)
  const floorLayer = layerByName(output, 'FloorShapes')
  const roomCount = req.generation_params?.room_count ?? 7
  // Hub + 4 arms + chambers ≥ room_count
  assert.ok(
    floorLayer.elements.length >= roomCount,
    `FloorShapes has ${floorLayer.elements.length} elements, expected ≥ ${roomCount}`,
  )
})

test('dungeon WallStrokes count equals FloorShapes count', () => {
  const output = generateVectorMap(dungeonReq(1004))
  const floor = layerByName(output, 'FloorShapes')
  const wall  = layerByName(output, 'WallStrokes')
  assert.equal(
    wall.elements.length,
    floor.elements.length,
    'Each floor rect should have a corresponding wall stroke',
  )
})

test('dungeon layers are sorted by z_index ascending', () => {
  const output = generateVectorMap(dungeonReq(1005))
  const zs = output.overlay.layers.map(l => l.z_index)
  for (let i = 1; i < zs.length; i++) {
    assert.ok(zs[i] >= zs[i - 1], `Layers out of order at index ${i}: z ${zs[i - 1]} → ${zs[i]}`)
  }
})

test('dungeon VoidLayer z_index is lower than FloorShapes z_index', () => {
  const output = generateVectorMap(dungeonReq(1006))
  const voidZ  = layerByName(output, 'VoidLayer').z_index
  const floorZ = layerByName(output, 'FloorShapes').z_index
  assert.ok(voidZ < floorZ, `VoidLayer (z=${voidZ}) must be below FloorShapes (z=${floorZ})`)
})

test('dungeon floor polygon points are within bounds_world', () => {
  const req = dungeonReq(1007)
  const output = generateVectorMap(req)
  const { origin_x, origin_y, width_world, height_world } = req.bounds_world
  const maxX = origin_x + width_world
  const maxY = origin_y + height_world

  const floorLayer = layerByName(output, 'FloorShapes')
  for (const el of floorLayer.elements) {
    if (el.type === 'polygon' && Array.isArray(el.points)) {
      for (const pt of el.points) {
        assert.ok(
          pt.x >= origin_x - 1 && pt.x <= maxX + 1,
          `Floor polygon x=${pt.x} out of bounds [${origin_x}, ${maxX}]`,
        )
        assert.ok(
          pt.y >= origin_y - 1 && pt.y <= maxY + 1,
          `Floor polygon y=${pt.y} out of bounds [${origin_y}, ${maxY}]`,
        )
      }
    }
  }
})

test('dungeon generator_version is dungeon-gen-1.0.0', () => {
  const output = generateVectorMap(dungeonReq(1008))
  assert.equal(
    output.overlay.metadata?.generator_version,
    'dungeon-gen-1.0.0',
  )
})

test('dungeon overlay id is stable for same seed', () => {
  const req = dungeonReq(1009)
  const a = generateVectorMap(req)
  const b = generateVectorMap(req)
  assert.equal(a.overlay.id, b.overlay.id)
})

// ---------------------------------------------------------------------------
// Cave (organic blob) structural tests
// ---------------------------------------------------------------------------

test('cave overlay has required layers', () => {
  const output = generateVectorMap(caveReq(2001))
  const names = output.overlay.layers.map(l => l.name)

  for (const required of ['VoidLayer', 'FloorShapes', 'WallStrokes']) {
    assert.ok(names.includes(required), `Missing cave layer: ${required}`)
  }
})

test('cave VoidLayer has exactly one element', () => {
  const output = generateVectorMap(caveReq(2002))
  const voidLayer = layerByName(output, 'VoidLayer')
  assert.equal(voidLayer.elements.length, 1)
})

test('cave FloorShapes has at least room_count elements', () => {
  const req = caveReq(2003)
  const output = generateVectorMap(req)
  const floorLayer = layerByName(output, 'FloorShapes')
  const roomCount = req.generation_params?.room_count ?? 6
  assert.ok(
    floorLayer.elements.length >= roomCount,
    `Cave FloorShapes has ${floorLayer.elements.length} elements, expected ≥ ${roomCount}`,
  )
})

test('cave generator_version is dungeon-gen-1.0.0', () => {
  const output = generateVectorMap(caveReq(2004))
  assert.equal(output.overlay.metadata?.generator_version, 'dungeon-gen-1.0.0')
})

test('cave layers are sorted by z_index ascending', () => {
  const output = generateVectorMap(caveReq(2005))
  const zs = output.overlay.layers.map(l => l.z_index)
  for (let i = 1; i < zs.length; i++) {
    assert.ok(zs[i] >= zs[i - 1], `Cave layers out of order at index ${i}`)
  }
})
