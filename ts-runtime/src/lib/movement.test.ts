import assert from 'node:assert/strict'
import test from 'node:test'

import { validateMoveRequest } from './movement.js'

function buildTraversalGrid(width: number, height: number) {
  const cells: Array<{
    x: number
    y: number
    traversable: boolean
    movement_cost: number
    movement_blocking_tags: string[]
    tags: string[]
  }> = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({
        x,
        y,
        traversable: true,
        movement_cost: 1,
        movement_blocking_tags: [],
        tags: [],
      })
    }
  }

  return {
    width_cells: width,
    height_cells: height,
    cell_size_world: 5,
    world_bounds: {
      origin_x: 0,
      origin_y: 0,
      width_world: width * 5,
      height_world: height * 5,
    },
    resolution_scale: 1,
    derivation_version: 'test',
    cells,
  }
}

test('validateMoveRequest requires traversal grid for gameplay maps', () => {
  const map = {
    width: 3,
    height: 3,
    entities: [{ id: 'pc_1', x: 0, y: 0, blocks_movement: true }],
    tiles: [
      { x: 1, y: 0, type: 'floor', blocks_movement: false },
    ],
    metadata: {
      map_mode: 'legacy_procedural_tiles',
    },
  }

  const result = validateMoveRequest({
    map,
    entityId: 'pc_1',
    targetX: 1,
    targetY: 0,
  })

  assert.equal(result.valid, false)
  assert.match(result.error ?? '', /Traversal grid is required/i)
})

test('validateMoveRequest uses traversal grid authority over legacy tile payload', () => {
  const map = {
    width: 3,
    height: 3,
    entities: [{ id: 'pc_1', x: 0, y: 0, blocks_movement: true }],
    tiles: [
      { x: 1, y: 0, type: 'wall', blocks_movement: true },
      { x: 2, y: 0, type: 'wall', blocks_movement: true },
    ],
    traversal_grid: buildTraversalGrid(3, 3),
    metadata: {
      map_mode: 'ai_generated_image',
    },
  }

  const result = validateMoveRequest({
    map,
    entityId: 'pc_1',
    targetX: 2,
    targetY: 0,
  })

  assert.equal(result.valid, true)
  assert.equal(result.error, null)
  assert.equal(result.path?.[0]?.x, 0)
  assert.equal(result.path?.[0]?.y, 0)
  assert.equal(result.path?.at(-1)?.x, 2)
  assert.equal(result.path?.at(-1)?.y, 0)
  assert.equal(result.distance_feet, 10)
})
