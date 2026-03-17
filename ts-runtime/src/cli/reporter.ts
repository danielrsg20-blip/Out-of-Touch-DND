import type { GenerateVectorMapResponse, OverlayElement } from '../lib/vectorMap/types.js'
import type { HarnessArgs } from './args.js'

function hr(char = '─', width = 60): string {
  return char.repeat(width)
}

function countByType(elements: OverlayElement[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const el of elements) {
    counts[el.type] = (counts[el.type] ?? 0) + 1
  }
  return counts
}

function formatTagHistogram(tagCounts: Record<string, number>): string {
  const entries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return '  (none)'
  return entries.map(([tag, count]) => `  ${tag.padEnd(20)} ${count}`).join('\n')
}

/**
 * Format a GenerateVectorMapResponse into a human-readable report string.
 * This is written to report.txt in each seed output directory.
 */
export function formatReport(
  response: GenerateVectorMapResponse,
  seed: number,
  args: HarnessArgs,
): string {
  const { overlay, traversal_grid, reports, hashes, movement_model } = response
  const { payload_validation, grid_validation, color_validation } = reports

  // --- Overlay element summary ---
  const layerLines: string[] = []
  let totalElements = 0
  for (const layer of overlay.layers) {
    const byType = countByType(layer.elements)
    const typeStr = Object.entries(byType)
      .map(([t, n]) => `${t}×${n}`)
      .join(', ')
    layerLines.push(`  [${layer.z_index}] ${layer.name.padEnd(24)} ${layer.elements.length} elements  (${typeStr || 'empty'})`)
    totalElements += layer.elements.length
  }

  // --- Grid stats ---
  const grid = traversal_grid
  const totalCells = grid.cells.length
  const blockedCells = grid.cells.filter(c => !c.traversable).length
  const blockedPct = totalCells > 0 ? ((blockedCells / totalCells) * 100).toFixed(1) : '0.0'

  const moveCosts = grid.cells.filter(c => c.traversable).map(c => c.movement_cost)
  const avgCost = moveCosts.length > 0
    ? (moveCosts.reduce((s, v) => s + v, 0) / moveCosts.length).toFixed(2)
    : 'N/A'
  const maxCost = moveCosts.length > 0
    ? Math.max(...moveCosts).toFixed(2)
    : 'N/A'

  // --- Saturation ---
  const maxObservedSat = Object.values(color_validation.max_observed_saturation_by_layer)
  const globalMaxSat = maxObservedSat.length > 0 ? Math.max(...maxObservedSat).toFixed(3) : 'N/A'
  const satLayerLines = Object.entries(color_validation.max_observed_saturation_by_layer)
    .sort((a, b) => b[1] - a[1])
    .map(([layerName, sat]) => `  ${layerName.padEnd(28)} ${sat.toFixed(3)}`)
    .join('\n')

  // --- Status ---
  const hasErrors = payload_validation.rejected_elements > 0 || payload_validation.duplicate_ids > 0
  const hasWarnings =
    payload_validation.fixed_geometries > 0 ||
    payload_validation.out_of_bounds_clamped > 0 ||
    payload_validation.warnings.length > 0 ||
    grid_validation.unknown_blocking_tags.length > 0 ||
    color_validation.elements_with_colors_clamped > 0

  const statusLine = hasErrors
    ? '[ ERRORS ]'
    : hasWarnings
    ? '[ WARNINGS ]'
    : '[ OK ]'

  const lines: string[] = [
    `Vector Map Generation Report`,
    hr(),
    `Seed:           ${seed}`,
    `Biome:          ${args.biome}`,
    `Preset:         ${args.preset}`,
    `Prompt:         ${args.prompt || '(none)'}`,
    `Map size:       ${args.width} × ${args.height} world units`,
    `Grid cell size: ${args.cellSize} world units  (resolution ×${args.resolution})`,
    `Validation:     ${args.validation}`,
    `Generated at:   ${overlay.created_at}`,
    '',
    hr('─'),
    'OVERLAY',
    hr('─'),
    `Layers:         ${overlay.layers.length}`,
    `Total elements: ${totalElements}`,
    '',
    ...layerLines,
    '',
    hr('─'),
    'VALIDATION',
    hr('─'),
    `Fixed geometries:       ${payload_validation.fixed_geometries}`,
    `Rejected elements:      ${payload_validation.rejected_elements}`,
    `Duplicate IDs:          ${payload_validation.duplicate_ids}`,
    `Out-of-bounds clamped:  ${payload_validation.out_of_bounds_clamped}`,
    ...(payload_validation.warnings.length > 0
      ? ['', 'Warnings:', ...payload_validation.warnings.map(w => `  • ${w}`)]
      : []),
    '',
    hr('─'),
    'TRAVERSAL GRID',
    hr('─'),
    `Grid size:      ${grid.width_cells} × ${grid.height_cells} (${totalCells} cells)`,
    `Cell size:      ${grid.cell_size_world} world units  (resolution_scale=${grid.resolution_scale})`,
    `Blocked cells:  ${blockedCells} / ${totalCells} (${blockedPct}%)`,
    `Traversable movement cost — avg: ${avgCost}  max: ${maxCost}`,
    `Blocked-tag mismatch:  ${grid_validation.blocked_tag_mismatch_count}`,
    ...(grid_validation.unknown_blocking_tags.length > 0
      ? [`Unknown blocking tags:  ${grid_validation.unknown_blocking_tags.join(', ')}`]
      : []),
    '',
    'Tag histogram:',
    formatTagHistogram(grid_validation.tag_counts),
    '',
    hr('─'),
    'COLOR / SATURATION',
    hr('─'),
    `Elements with clamped colors:  ${color_validation.elements_with_colors_clamped} / ${color_validation.elements_total}  (${(color_validation.clamp_ratio * 100).toFixed(1)}%)`,
    `Rejected (invalid colors):     ${color_validation.out_of_bounds_rejected}`,
    `Global max observed saturation: ${globalMaxSat}`,
    '',
    'Max observed saturation by layer:',
    satLayerLines || '  (no data)',
    '',
    hr('─'),
    'MOVEMENT MODEL',
    hr('─'),
    `Metric:                    ${movement_model.metric}`,
    `Cell size (world):         ${movement_model.cell_size_world}`,
    `Default speed (world/turn): ${movement_model.speed_world_per_turn_default}`,
    `Cells per turn:            ${movement_model.derived_cells_per_turn_default}`,
    '',
    hr('─'),
    'HASHES',
    hr('─'),
    `overlay_hash:       ${hashes.overlay_hash}`,
    `grid_hash:          ${hashes.grid_hash}`,
    ...(hashes.compatibility_hash ? [`compat_hash:        ${hashes.compatibility_hash}`] : []),
    '',
    hr('═', 60),
    `STATUS: ${statusLine}`,
    hr('═', 60),
  ]

  return lines.join('\n')
}

/**
 * Returns true if the response has errors that should cause a non-zero exit.
 * Warnings-only exits are controlled by --allow-warnings.
 */
export function hasErrors(response: GenerateVectorMapResponse): boolean {
  const { payload_validation } = response.reports
  return payload_validation.rejected_elements > 0 || payload_validation.duplicate_ids > 0
}

/**
 * Returns true if any fixups or warnings were applied (but no hard errors).
 */
export function hasWarnings(response: GenerateVectorMapResponse): boolean {
  const { payload_validation, grid_validation, color_validation } = response.reports
  return (
    payload_validation.fixed_geometries > 0 ||
    payload_validation.out_of_bounds_clamped > 0 ||
    payload_validation.warnings.length > 0 ||
    grid_validation.unknown_blocking_tags.length > 0 ||
    color_validation.elements_with_colors_clamped > 0
  )
}
