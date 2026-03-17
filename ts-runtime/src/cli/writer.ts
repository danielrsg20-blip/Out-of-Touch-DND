import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GenerateVectorMapResponse } from '../lib/vectorMap/types.js'
import type { HarnessArgs } from './args.js'
import { formatReport } from './reporter.js'

export type SeedManifest = {
  seed: number
  biome: string
  preset: string
  prompt: string
  width: number
  height: number
  cellSize: number
  resolution: number
  diagonal: string
  validation: string
  generatedAt: string
  hashes: GenerateVectorMapResponse['hashes']
  elementCounts: {
    layers: number
    totalElements: number
    byType: Record<string, number>
  }
  gridStats: {
    widthCells: number
    heightCells: number
    totalCells: number
    blockedCells: number
    blockedPercent: number
    avgMoveCost: number
    maxMoveCost: number
  }
  validationSummary: {
    hasErrors: boolean
    hasWarnings: boolean
    fixedGeometries: number
    rejectedElements: number
    colorClampedCount: number
  }
  outputDir: string
}

function countElements(response: GenerateVectorMapResponse): SeedManifest['elementCounts'] {
  let totalElements = 0
  const byType: Record<string, number> = {}
  for (const layer of response.overlay.layers) {
    totalElements += layer.elements.length
    for (const el of layer.elements) {
      byType[el.type] = (byType[el.type] ?? 0) + 1
    }
  }
  return { layers: response.overlay.layers.length, totalElements, byType }
}

function gridStats(response: GenerateVectorMapResponse): SeedManifest['gridStats'] {
  const grid = response.traversal_grid
  const totalCells = grid.cells.length
  const blockedCells = grid.cells.filter(c => !c.traversable).length
  const moveCosts = grid.cells.filter(c => c.traversable).map(c => c.movement_cost)
  const avgMoveCost =
    moveCosts.length > 0 ? moveCosts.reduce((s, v) => s + v, 0) / moveCosts.length : 0
  const maxMoveCost = moveCosts.length > 0 ? Math.max(...moveCosts) : 0
  return {
    widthCells: grid.width_cells,
    heightCells: grid.height_cells,
    totalCells,
    blockedCells,
    blockedPercent: totalCells > 0 ? (blockedCells / totalCells) * 100 : 0,
    avgMoveCost,
    maxMoveCost,
  }
}

/**
 * Write all output files for a single seed into <outDir>/seed-<seed>/.
 * Returns the manifest object (used for gallery index building).
 */
export function writeOutputs(
  outDir: string,
  response: GenerateVectorMapResponse,
  seed: number,
  args: HarnessArgs,
): SeedManifest {
  const seedDir = join(outDir, `seed-${seed}`)
  mkdirSync(seedDir, { recursive: true })

  // overlay.json
  writeFileSync(
    join(seedDir, 'overlay.json'),
    JSON.stringify(response.overlay, null, 2),
    'utf-8',
  )

  // traversal_grid.json
  writeFileSync(
    join(seedDir, 'traversal_grid.json'),
    JSON.stringify(response.traversal_grid, null, 2),
    'utf-8',
  )

  // compatibility.json (optional)
  if (!args.noCompat) {
    writeFileSync(
      join(seedDir, 'compatibility.json'),
      JSON.stringify(response.compatibility, null, 2),
      'utf-8',
    )
  }

  // report.txt
  const reportText = formatReport(response, seed, args)
  writeFileSync(join(seedDir, 'report.txt'), reportText, 'utf-8')

  // Build manifest
  const { payload_validation, color_validation } = response.reports
  const manifest: SeedManifest = {
    seed,
    biome: args.biome,
    preset: args.preset,
    prompt: args.prompt,
    width: args.width,
    height: args.height,
    cellSize: args.cellSize,
    resolution: args.resolution,
    diagonal: args.diagonal,
    validation: args.validation,
    generatedAt: response.overlay.created_at,
    hashes: response.hashes,
    elementCounts: countElements(response),
    gridStats: gridStats(response),
    validationSummary: {
      hasErrors: payload_validation.rejected_elements > 0 || payload_validation.duplicate_ids > 0,
      hasWarnings:
        payload_validation.fixed_geometries > 0 ||
        payload_validation.warnings.length > 0 ||
        color_validation.elements_with_colors_clamped > 0,
      fixedGeometries: payload_validation.fixed_geometries,
      rejectedElements: payload_validation.rejected_elements,
      colorClampedCount: color_validation.elements_with_colors_clamped,
    },
    outputDir: seedDir,
  }

  writeFileSync(join(seedDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

  return manifest
}

/**
 * Write gallery.json + a self-contained index.html to outDir.
 */
export function writeGallery(outDir: string, manifests: SeedManifest[]): void {
  mkdirSync(outDir, { recursive: true })

  writeFileSync(
    join(outDir, 'gallery.json'),
    JSON.stringify(manifests, null, 2),
    'utf-8',
  )

  const rows = manifests.map((m) => {
    const status = m.validationSummary.hasErrors
      ? 'ERRORS'
      : m.validationSummary.hasWarnings
      ? 'WARN'
      : 'OK'
    return `
      <tr>
        <td>${m.seed}</td>
        <td>${m.biome}</td>
        <td>${m.elementCounts.totalElements}</td>
        <td>${m.gridStats.widthCells}×${m.gridStats.heightCells}</td>
        <td>${m.gridStats.blockedPercent.toFixed(1)}%</td>
        <td>${status}</td>
        <td>${m.hashes.overlay_hash.slice(0, 12)}…</td>
        <td><a href="seed-${m.seed}/overlay.json">overlay</a></td>
        <td><a href="seed-${m.seed}/traversal_grid.json">grid</a></td>
        <td><a href="seed-${m.seed}/report.txt">report</a></td>
      </tr>`.trim()
  })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vector Map Gallery</title>
  <style>
    body { font-family: monospace; background: #1a1a2a; color: #ccc; padding: 2rem; }
    h1 { color: #9bf; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: .4rem .8rem; border: 1px solid #334; text-align: left; }
    th { background: #2a2a3a; color: #9bf; }
    tr:hover td { background: #22223a; }
    a { color: #7af; }
  </style>
</head>
<body>
  <h1>Vector Map Gallery (${manifests.length} maps)</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <table>
    <thead>
      <tr>
        <th>Seed</th><th>Biome</th><th>Elements</th>
        <th>Grid</th><th>Blocked%</th><th>Status</th>
        <th>Overlay hash</th><th>Overlay</th><th>Grid</th><th>Report</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join('\n      ')}
    </tbody>
  </table>
  <p style="margin-top:2rem;color:#666">
    Open the generated JSON files here, or run the standalone viewer and load them there.
  </p>
</body>
</html>`

  writeFileSync(join(outDir, 'index.html'), html, 'utf-8')
}
