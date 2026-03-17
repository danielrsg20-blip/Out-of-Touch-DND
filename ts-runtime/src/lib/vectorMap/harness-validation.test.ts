import assert from 'node:assert/strict'
import test from 'node:test'
import { applySaturationConstraint } from './colorUtils.js'
import { validateOverlayPayload, validateTraversalGrid } from './validation.js'
import type { OverlayPayload, TraversalGrid } from './types.js'

function makeOverlay(): OverlayPayload {
  return {
    id: 'overlay-1',
    name: 'Harness Validation Overlay',
    version: '1.0.0',
    created_at: '2026-03-16T00:00:00.000Z',
    metadata: {
      world_bounds: {
        origin_x: 0,
        origin_y: 0,
        width_world: 100,
        height_world: 100,
      },
    },
    styles: {
      default: {
        id: 'default',
        name: 'Default',
        palette: {},
        noise_seed: 1,
        decal_library: {},
      },
    },
    layers: [
      {
        id: 'layer-1',
        name: 'Base',
        z_index: 10,
        visible: true,
        blend_mode: 'normal',
        opacity: 1,
        elements: [
          {
            type: 'polygon',
            id: 'poly-open',
            name: 'Open polygon',
            points: [
              { x: -5, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
            fill: { color: '#ff0000' },
          },
          {
            type: 'polygon',
            id: 'poly-open',
            name: 'Duplicate id polygon',
            points: [
              { x: 5, y: 5 },
              { x: 10, y: 5 },
              { x: 10, y: 10 },
            ],
            fill: { color: '#00ff00' },
          },
        ],
      },
    ],
  }
}

test('validateOverlayPayload fixup closes polygons, clamps bounds, and drops duplicates', () => {
  const overlay = makeOverlay()
  const report = validateOverlayPayload(overlay, 'fixup', {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  })

  assert.equal(report.fixed_geometries, 2)
  assert.equal(report.out_of_bounds_clamped, 1)
  assert.equal(report.duplicate_ids, 1)
  assert.equal(report.rejected_elements, 1)
  assert.equal(overlay.layers[0]?.elements.length, 1)

  const polygon = overlay.layers[0]?.elements[0]
  assert.ok(polygon && polygon.type === 'polygon')
  assert.deepEqual(polygon.points[0], polygon.points[polygon.points.length - 1])
  assert.equal(polygon.points[0]?.x, 0)
})

test('validateOverlayPayload strict mode rejects open polygons', () => {
  const overlay = makeOverlay()
  overlay.layers[0]!.elements = [overlay.layers[0]!.elements[0]!]

  const report = validateOverlayPayload(overlay, 'strict', {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
  })

  assert.equal(report.rejected_elements, 1)
  assert.equal(overlay.layers[0]?.elements.length, 0)
})

test('validateTraversalGrid reports unknown blocking tags and mismatch counts', () => {
  const grid: TraversalGrid = {
    width_cells: 2,
    height_cells: 1,
    cell_size_world: 5,
    world_bounds: { origin_x: 0, origin_y: 0, width_world: 10, height_world: 5 },
    resolution_scale: 1,
    derivation_version: 'test',
    cells: [
      { x: 0, y: 0, traversable: true, movement_cost: 1, movement_blocking_tags: ['wall'], tags: ['wall'] },
      { x: 1, y: 0, traversable: false, movement_cost: 9999, movement_blocking_tags: ['bog_beast'], tags: ['hazard'] },
    ],
  }

  const report = validateTraversalGrid(grid)
  assert.deepEqual(report.unknown_blocking_tags, ['bog_beast'])
  assert.equal(report.blocked_tag_mismatch_count, 1)
  assert.equal(report.tag_counts.wall, 1)
  assert.equal(report.tag_counts.hazard, 1)
})

test('applySaturationConstraint clamps over-saturated colors deterministically', () => {
  const overlay = makeOverlay()
  overlay.layers[0]!.elements = [
    {
      type: 'polygon',
      id: 'sat-test',
      name: 'Saturated polygon',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 0 },
      ],
      fill: { color: '#ff0000' },
      stroke: { color: '#00ff00', width: 1 },
    },
  ]

  const first = applySaturationConstraint(overlay, 0.2)
  const second = applySaturationConstraint(overlay, 0.2)

  const polygon = first.result.layers[0]!.elements[0]
  assert.ok(polygon && polygon.type === 'polygon')
  assert.notEqual(polygon.fill.color, '#ff0000')
  assert.equal(first.report.elements_with_colors_clamped, 1)
  assert.deepEqual(first.result, second.result)
  assert.deepEqual(first.report, second.report)
})