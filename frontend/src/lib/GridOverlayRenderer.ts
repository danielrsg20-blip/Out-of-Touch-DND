/**
 * GridOverlayRenderer.ts
 *
 * Renders a toggleable grid overlay on top of the map canvas.
 * Supports four debug/gameplay modes using either:
 *   - the tile grid  (always available from MapData)
 *   - the traversal grid (from generate_vector_map, when available in the overlay store)
 *
 * Coordinate contract: ctx must already have the pan+zoom transform applied,
 * so all coordinates here are in map pixel space (tile_col × 32, tile_row × 32).
 */

import type { GridOverlayConfig, GridOverlayMode, FrontendTraversalGrid } from '../types'

const TILE_SIZE = 32   // must stay in sync with MapCanvas

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Interpolate between two [r,g,b] triples by factor t ∈ [0,1] */
function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const b2 = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${b2})`
}

/**
 * Map movement_cost → muted heatmap colour (alpha baked separately as ctx.globalAlpha).
 * Cost 1.0 → green. Cost 2.0 → amber. Cost ≥ 3.0 → muted red.
 * Normalised against the observed maximum across the grid.
 */
function movementCostColor(cost: number, maxCost: number): string {
  const GREEN:  [number, number, number] = [52,  140,  60]   // muted forest green
  const AMBER:  [number, number, number] = [160, 140,  40]   // muted warm amber
  const RED:    [number, number, number] = [160,  60,  40]   // muted rust red

  const t = maxCost > 1 ? Math.min(1, (cost - 1) / (maxCost - 1)) : 0
  if (t <= 0.5) return lerpColor(GREEN, AMBER, t * 2)
  return lerpColor(AMBER, RED, (t - 0.5) * 2)
}

/** Return a fill colour for the dominant tag, or null if no notable tag. */
function tagsToFill(tags: string[]): string | null {
  for (const tag of tags) {
    switch (tag) {
      case 'wall':
      case 'cliff':      return 'rgba(40,  35, 30, 0.60)'
      case 'water_deep': return 'rgba(30,  70,160, 0.50)'
      case 'lava':       return 'rgba(160, 55, 25, 0.55)'
      case 'deep_mud':   return 'rgba(110, 90, 50, 0.45)'
      case 'difficult':  return 'rgba(120,100, 50, 0.40)'
      case 'hazard':     return 'rgba(160,120, 25, 0.45)'
      case 'blocked':    return 'rgba( 90, 40, 40, 0.45)'
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/**
 * Draw line-only grid over the tile map.
 * Available whenever a MapData exists (no traversal grid needed).
 */
function renderTileGridLines(
  ctx: CanvasRenderingContext2D,
  mapWidth: number,
  mapHeight: number,
  lineColor: string,
  lineWidth: number,
): void {
  ctx.strokeStyle = lineColor
  ctx.lineWidth = lineWidth

  // Vertical lines
  for (let x = 0; x <= mapWidth; x++) {
    ctx.beginPath()
    ctx.moveTo(x * TILE_SIZE, 0)
    ctx.lineTo(x * TILE_SIZE, mapHeight * TILE_SIZE)
    ctx.stroke()
  }
  // Horizontal lines
  for (let y = 0; y <= mapHeight; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * TILE_SIZE)
    ctx.lineTo(mapWidth * TILE_SIZE, y * TILE_SIZE)
    ctx.stroke()
  }
}

/**
 * Render the traversal grid using a given mode.
 * Cells are projected from world-space into map pixel-space.
 *
 * World → pixel: pixel_x = (cell.x × cellSizeWorld − worldBounds.origin_x) × scaleX
 * Because origin_x is subtracted before scaling, a non-zero origin maps to pixel 0.
 */
function renderTraversalGrid(
  ctx: CanvasRenderingContext2D,
  config: GridOverlayConfig,
  grid: FrontendTraversalGrid,
  mapWidthPx: number,
  mapHeightPx: number,
): void {
  const { world_bounds, cell_size_world, cells } = grid
  const scaleX = mapWidthPx  / world_bounds.width_world
  const scaleY = mapHeightPx / world_bounds.height_world
  const cellW  = cell_size_world * scaleX
  const cellH  = cell_size_world * scaleY

  const maxMoveCost = cells.reduce(
    (m, c) => (c.traversable ? Math.max(m, c.movement_cost) : m),
    1,
  )

  // --- filled passes (blocked / movement_cost / tags) ---
  if (config.mode !== 'outlines') {
    for (const cell of cells) {
      const px = (cell.x * cell_size_world - world_bounds.origin_x) * scaleX
      const py = (cell.y * cell_size_world - world_bounds.origin_y) * scaleY

      let fill: string | null = null
      switch (config.mode) {
        case 'blocked':
          fill = cell.traversable ? null : 'rgba(200, 50, 50, 0.45)'
          break
        case 'movement_cost':
          fill = cell.traversable
            ? movementCostColor(cell.movement_cost, maxMoveCost)
            : 'rgba(20, 10, 10, 0.60)'
          break
        case 'tags': {
          const allTags = [...(cell.movement_blocking_tags ?? []), ...cell.tags]
          fill = tagsToFill(allTags)
          break
        }
      }
      if (fill) {
        ctx.fillStyle = fill
        ctx.fillRect(px, py, cellW, cellH)
      }
    }
  }

  // --- grid lines ---
  if (config.showGridLines || config.mode === 'outlines') {
    ctx.strokeStyle = config.gridLineColor
    ctx.lineWidth = config.gridLineWidth
    for (const cell of cells) {
      const px = (cell.x * cell_size_world - world_bounds.origin_x) * scaleX
      const py = (cell.y * cell_size_world - world_bounds.origin_y) * scaleY
      ctx.strokeRect(px, py, cellW, cellH)
    }
  }

  // --- tag labels (only when cells are large enough to read) ---
  if (config.mode === 'tags' && cellW >= 14) {
    const fontSize = Math.max(6, Math.min(10, cellW * 0.28))
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
    ctx.font = `${fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const cell of cells) {
      const allTags = [...(cell.movement_blocking_tags ?? []), ...cell.tags]
      if (allTags.length === 0) continue
      const px = (cell.x * cell_size_world - world_bounds.origin_x) * scaleX + cellW * 0.5
      const py = (cell.y * cell_size_world - world_bounds.origin_y) * scaleY + cellH * 0.5
      ctx.fillText(allTags[0].slice(0, 4), px, py)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the grid overlay.
 *
 * Must be called inside an already-transformed canvas context (pan+zoom applied).
 * Falls back to a simple tile-grid outline when no traversal grid is available.
 *
 * Toggle interface (call from outside React via overlayStore):
 *   overlayStore.getState().setGridOverlayConfig({ visible: true, mode: 'outlines' })
 *   overlayStore.getState().setGridOverlayConfig({ visible: false })
 */
export function renderGridOverlay(
  ctx: CanvasRenderingContext2D,
  config: GridOverlayConfig,
  map: { width: number; height: number } | null,
  traversalGrid: FrontendTraversalGrid | null,
): void {
  if (!config.visible || !map) return

  const mapWidthPx  = map.width  * TILE_SIZE
  const mapHeightPx = map.height * TILE_SIZE

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, config.opacity))

  if (traversalGrid) {
    renderTraversalGrid(ctx, config, traversalGrid, mapWidthPx, mapHeightPx)
  } else {
    // Fallback: plain tile-grid line overlay (outlines and blocked are both
    // useful without traversal data; movement_cost and tags are no-ops here).
    renderTileGridLines(ctx, map.width, map.height, config.gridLineColor, config.gridLineWidth)
  }

  ctx.restore()
}

// ---------------------------------------------------------------------------
// Show/hide helper exported for non-React callers (e.g. console scripts)
// ---------------------------------------------------------------------------

export type ShowGridOverlayFn = (mode: GridOverlayMode, opacity?: number) => void
export type HideGridOverlayFn = () => void
