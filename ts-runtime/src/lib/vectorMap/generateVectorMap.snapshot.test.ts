import test from 'node:test'
import assert from 'node:assert/strict'
import { generateVectorMap } from './generateVectorMap.js'
import type { GenerateVectorMapRequest } from './types.js'

function makeRequest(seed: number): GenerateVectorMapRequest {
  return {
    seed,
    biome: 'forest',
    name: 'Golden Snapshot Map',
    bounds_world: {
      origin_x: 0,
      origin_y: 0,
      width_world: 640,
      height_world: 480,
    },
    generation_params: {
      room_count: 7,
      corridor_width_cells: 2,
      obstacle_density: 0.2,
      hazard_density: 0.15,
    },
    grid_config: {
      base_cell_size_world: 5,
      resolution_scale: 2,
      diagonal_policy: 'allow',
      movement_cost_mode: 'world_units',
    },
    validation_mode: 'fixup',
    style_preset: 'default',
    story_prompt: 'Forest crossing with ambush signs near muddy stream banks',
  }
}

test('generateVectorMap is deterministic for identical seed and input', () => {
  const req = makeRequest(90210)
  const first = generateVectorMap(req)
  const second = generateVectorMap(req)

  assert.equal(first.hashes.overlay_hash, second.hashes.overlay_hash)
  assert.equal(first.hashes.grid_hash, second.hashes.grid_hash)
  assert.deepEqual(first.reports.payload_validation, second.reports.payload_validation)
  assert.deepEqual(first.reports.grid_validation, second.reports.grid_validation)
})

test('golden snapshot seed 90210 hash lock', () => {
  const output = generateVectorMap(makeRequest(90210))
  assert.equal(output.hashes.overlay_hash, 'ad541ccf23afa99e6f57a07a9c379abfdd97f98e78ae284b6a88287a9e96424b')
  assert.equal(output.hashes.grid_hash, 'd5855d62de0f0cd1404ffe2a459c2a525f83063616eb30b2da1e3fa71b4e2599')
})

test('golden snapshot seed 12345 hash lock', () => {
  const output = generateVectorMap(makeRequest(12345))
  assert.equal(output.hashes.overlay_hash, 'f73bef0f7e672b42f598ee13ce476df1ed6bd35db032f756be551463f0004c02')
  assert.equal(output.hashes.grid_hash, '7acce2a4cb3055be595e418a92b58836cc23f6a69a704f25a2bd8a32846bce44')
})

// ---------------------------------------------------------------------------
// Dungeon generator determinism tests
// ---------------------------------------------------------------------------

function makeDungeonRequest(seed: number, presetId: string, biome: GenerateVectorMapRequest['biome']): GenerateVectorMapRequest {
  return {
    seed,
    biome,
    preset_id: presetId,
    name: 'Dungeon Snapshot Map',
    bounds_world: {
      origin_x: 0,
      origin_y: 0,
      width_world: 640,
      height_world: 480,
    },
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

function makeCaveRequest(seed: number): GenerateVectorMapRequest {
  return {
    seed,
    biome: 'cavern',
    preset_id: 'caves_caverns_lava_water',
    name: 'Cave Snapshot Map',
    bounds_world: {
      origin_x: 0,
      origin_y: 0,
      width_world: 640,
      height_world: 480,
    },
    generation_params: {
      room_count: 7,
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

test('dungeon generator is deterministic for ancient_tomb_crypt', () => {
  const req = makeDungeonRequest(5555, 'ancient_tomb_crypt', 'crypt')
  const first = generateVectorMap(req)
  const second = generateVectorMap(req)

  assert.equal(first.hashes.overlay_hash, second.hashes.overlay_hash,
    'overlay hash must be identical on two calls with same input')
  assert.equal(first.hashes.grid_hash, second.hashes.grid_hash,
    'grid hash must be identical on two calls with same input')
})

test('dungeon generator is deterministic for caves_caverns_lava_water', () => {
  const req = makeCaveRequest(7777)
  const first = generateVectorMap(req)
  const second = generateVectorMap(req)

  assert.equal(first.hashes.overlay_hash, second.hashes.overlay_hash,
    'cave overlay hash must be identical on two calls')
  assert.equal(first.hashes.grid_hash, second.hashes.grid_hash,
    'cave grid hash must be identical on two calls')
})

test('forest golden hashes are unchanged after dungeon routing added', () => {
  const output90210 = generateVectorMap(makeRequest(90210))
  assert.equal(output90210.hashes.overlay_hash, 'ad541ccf23afa99e6f57a07a9c379abfdd97f98e78ae284b6a88287a9e96424b',
    'forest seed 90210 overlay hash must not change')
  assert.equal(output90210.hashes.grid_hash, 'd5855d62de0f0cd1404ffe2a459c2a525f83063616eb30b2da1e3fa71b4e2599',
    'forest seed 90210 grid hash must not change')
})
