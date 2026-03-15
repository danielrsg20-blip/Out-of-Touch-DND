import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { validateMoveRequest } from '../movement.js'
import { deriveLegacyTiles } from './compatibility.js'
import { generateVectorMap } from './generateVectorMap.js'
import {
  buildWalkableMatrixFromTraversalGrid,
  calculateTraversalPathWorldCost,
  hasLineOfSightOnTraversalGrid,
  movementFeetPerStepFromTraversalGrid,
} from './runtime.js'
import type { GenerateVectorMapRequest, TraversalGrid } from './types.js'

function makeRequest(seed: number, resolutionScale = 2, biome: GenerateVectorMapRequest['biome'] = 'forest', storyPrompt = 'Forest crossing with ambush signs near muddy stream banks'): GenerateVectorMapRequest {
  return {
    seed,
    biome,
    name: 'Safety Suite Map',
    bounds_world: {
      origin_x: 0,
      origin_y: 0,
      width_world: 100,
      height_world: 75,
    },
    generation_params: {
      room_count: 7,
      corridor_width_cells: 2,
      obstacle_density: 0.15,
      hazard_density: 0.1,
    },
    grid_config: {
      base_cell_size_world: 5,
      resolution_scale: resolutionScale,
      diagonal_policy: 'allow',
      movement_cost_mode: 'world_units',
    },
    validation_mode: 'fixup',
    style_preset: 'default',
    story_prompt: storyPrompt,
  }
}

function tileWalkableMatrix(width: number, height: number, tiles: Array<{ x: number; y: number; blocks_movement: boolean }>): boolean[][] {
  const walkable = Array.from({ length: height }, () => Array.from({ length: width }, () => true))
  for (const tile of tiles) {
    if (tile.y >= 0 && tile.y < height && tile.x >= 0 && tile.x < width) {
      walkable[tile.y]![tile.x] = !tile.blocks_movement
    }
  }
  return walkable
}

function withTraversalFlags<T>(callback: () => T): T {
  const previousAuthoritative = process.env.VECTOR_GRID_AUTHORITATIVE_ENABLED
  const previousDerivation = process.env.VECTOR_GRID_DERIVATION_ENABLED
  process.env.VECTOR_GRID_AUTHORITATIVE_ENABLED = 'true'
  process.env.VECTOR_GRID_DERIVATION_ENABLED = 'true'
  try {
    return callback()
  } finally {
    if (previousAuthoritative == null) {
      delete process.env.VECTOR_GRID_AUTHORITATIVE_ENABLED
    } else {
      process.env.VECTOR_GRID_AUTHORITATIVE_ENABLED = previousAuthoritative
    }
    if (previousDerivation == null) {
      delete process.env.VECTOR_GRID_DERIVATION_ENABLED
    } else {
      process.env.VECTOR_GRID_DERIVATION_ENABLED = previousDerivation
    }
  }
}

test('blocked-cell safety: traversal grid collapses to the same blocked tiles as compatibility output', () => {
  const output = generateVectorMap(makeRequest(90210, 2, 'dungeon', 'Dungeon halls with collapsed pillars and tight choke points'))
  const legacy = deriveLegacyTiles(output.traversal_grid)
  const fromTraversal = buildWalkableMatrixFromTraversalGrid(output.traversal_grid, legacy.width, legacy.height)
  const fromLegacy = tileWalkableMatrix(legacy.width, legacy.height, legacy.tiles)

  assert.deepEqual(fromTraversal, fromLegacy)
})

test('path-cost safety: traversal path world cost honors difficult terrain and aggregate movement stays 5 ft per legacy step', () => {
  const handcrafted: TraversalGrid = {
    width_cells: 3,
    height_cells: 1,
    cell_size_world: 5,
    world_bounds: { origin_x: 0, origin_y: 0, width_world: 15, height_world: 5 },
    resolution_scale: 1,
    derivation_version: 'test',
    cells: [
      { x: 0, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] },
      { x: 1, y: 0, traversable: true, movement_cost: 2, movement_blocking_tags: [], tags: ['deep_mud', 'difficult'] },
      { x: 2, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] },
    ],
  }

  const cost = calculateTraversalPathWorldCost(handcrafted, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])
  assert.equal(cost, 15)

  const generated = generateVectorMap(makeRequest(90210, 4))
  const traversal = generated.traversal_grid
  const authorityWidth = Math.max(1, Math.round(traversal.width_cells / Math.max(1, traversal.resolution_scale)))
  const authorityHeight = Math.max(1, Math.round(traversal.height_cells / Math.max(1, traversal.resolution_scale)))
  assert.equal(movementFeetPerStepFromTraversalGrid(traversal, authorityWidth, authorityHeight), 5)
})

test('LOS safety: blocking wall cells interrupt traversal-grid line of sight', () => {
  const wallGrid: TraversalGrid = {
    width_cells: 5,
    height_cells: 1,
    cell_size_world: 5,
    world_bounds: { origin_x: 0, origin_y: 0, width_world: 25, height_world: 5 },
    resolution_scale: 1,
    derivation_version: 'test',
    cells: [
      { x: 0, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] },
      { x: 1, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] },
      { x: 2, y: 0, traversable: false, movement_cost: 9999, movement_blocking_tags: ['wall'], tags: ['wall'] },
      { x: 3, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] },
      { x: 4, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] },
    ],
  }

  assert.equal(hasLineOfSightOnTraversalGrid(wallGrid, { x: 0, y: 0 }, { x: 4, y: 0 }), false)

  const openGrid: TraversalGrid = {
    ...wallGrid,
    cells: wallGrid.cells.map((cell) => ({ ...cell, traversable: true, movement_blocking_tags: [], tags: [] })),
  }
  assert.equal(hasLineOfSightOnTraversalGrid(openGrid, { x: 0, y: 0 }, { x: 4, y: 0 }), true)
})

test('movement invariance safety: traversal-grid authority preserves 5-foot movement across resolutions', () => {
  const mapBase = {
    width: 4,
    height: 1,
    tiles: [
      { x: 0, y: 0, type: 'floor', blocks_movement: false },
      { x: 1, y: 0, type: 'floor', blocks_movement: false },
      { x: 2, y: 0, type: 'floor', blocks_movement: false },
      { x: 3, y: 0, type: 'floor', blocks_movement: false },
    ],
    entities: [{ id: 'pc_1', x: 0, y: 0, blocks_movement: true }],
  }

  const scale1: TraversalGrid = {
    width_cells: 4,
    height_cells: 1,
    cell_size_world: 5,
    world_bounds: { origin_x: 0, origin_y: 0, width_world: 20, height_world: 5 },
    resolution_scale: 1,
    derivation_version: 'test',
    cells: Array.from({ length: 4 }, (_, x) => ({ x, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: [], tags: [] })),
  }

  const scale4: TraversalGrid = {
    width_cells: 16,
    height_cells: 4,
    cell_size_world: 1.25,
    world_bounds: { origin_x: 0, origin_y: 0, width_world: 20, height_world: 5 },
    resolution_scale: 4,
    derivation_version: 'test',
    cells: Array.from({ length: 64 }, (_, index) => ({
      x: index % 16,
      y: Math.floor(index / 16),
      traversable: true,
      movement_cost: 1,
      movement_blocking_tags: [],
      tags: [],
    })),
  }

  withTraversalFlags(() => {
    const result1 = validateMoveRequest({ map: { ...mapBase, traversal_grid: scale1 }, entityId: 'pc_1', targetX: 3, targetY: 0 })
    const result4 = validateMoveRequest({ map: { ...mapBase, traversal_grid: scale4 }, entityId: 'pc_1', targetX: 3, targetY: 0 })

    assert.equal(result1.valid, true)
    assert.equal(result4.valid, true)
    assert.equal(result1.distance_feet, 15)
    assert.equal(result4.distance_feet, 15)
  })
})

test('4x-cell performance safety: vector generation and traversal safety helpers stay within budget', () => {
  const started = performance.now()
  const output = generateVectorMap(makeRequest(44444, 4, 'mine', 'Mine tunnels with collapsed shafts, rails, and narrow choke points'))
  const legacy = output.compatibility.legacy_tiles
  const matrix = buildWalkableMatrixFromTraversalGrid(output.traversal_grid, legacy.width, legacy.height)
  const los = hasLineOfSightOnTraversalGrid(output.traversal_grid, { x: 0, y: 0 }, { x: Math.max(0, output.traversal_grid.width_cells - 1), y: Math.max(0, output.traversal_grid.height_cells - 1) })
  const elapsedMs = performance.now() - started

  assert.equal(matrix.length, legacy.height)
  assert.equal(typeof los, 'boolean')
  assert.ok(elapsedMs < 6000, `expected 4x traversal safety budget under 6000ms, received ${elapsedMs.toFixed(1)}ms`)
})