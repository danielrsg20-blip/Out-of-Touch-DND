/**
 * Standalone vector-map generation harness.
 *
 * Usage:
 *   pnpm generate:vector-map --seed 42
 *   pnpm generate:vector-map --seed-start 100 --count 20 --biome cavern
 *   pnpm generate:vector-map --help
 */

// Force every feature flag on before ANY import that reads process.env
const featureEnvs = [
  'VECTOR_MAP_GENERATION_TS_ENABLED',
  'VECTOR_GRID_DERIVATION_ENABLED',
  'VECTOR_COMPAT_OUTPUTS_ENABLED',
  'GRID_RESOLUTION_V2_ENABLED',
  'VECTOR_GRID_AUTHORITATIVE_ENABLED',
] as const
for (const key of featureEnvs) {
  process.env[key] = 'true'
}

import { parseHarnessArgs, printHelp } from './args.js'
import { hasErrors, hasWarnings } from './reporter.js'
import { writeGallery, writeOutputs } from './writer.js'
import { generateVectorMap } from '../lib/vectorMap/generateVectorMap.js'
import type { GenerateVectorMapRequest } from '../lib/vectorMap/types.js'

function buildRequest(seed: number, args: ReturnType<typeof parseHarnessArgs>): GenerateVectorMapRequest {
  return {
    seed,
    biome: args.biome,
    name: `${args.biome}-${seed}`,
    story_prompt: args.prompt || undefined,
    style_preset: args.preset || undefined,
    bounds_world: {
      origin_x: 0,
      origin_y: 0,
      width_world: args.width,
      height_world: args.height,
    },
    generation_params: {
      room_count: args.rooms,
      corridor_width_cells: args.corridorWidth,
      obstacle_density: args.obstacles,
      hazard_density: args.hazards,
    },
    grid_config: {
      base_cell_size_world: args.cellSize,
      resolution_scale: args.resolution,
      diagonal_policy: args.diagonal,
      movement_cost_mode: 'world_units',
    },
    validation_mode: args.validation,
    saturation_constraint: {
      max_saturation: 1.0,
      allow_magic_glow: true,
    },
  }
}

function pluralSeeds(n: number): string {
  return n === 1 ? '1 seed' : `${n} seeds`
}

async function main(): Promise<void> {
  const rawArgv = process.argv.slice(2)

  if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  let args: ReturnType<typeof parseHarnessArgs>
  try {
    args = parseHarnessArgs(rawArgv)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[generate-vector-map] Error: ${msg}\n`)
    process.stderr.write(`Run with --help for usage.\n`)
    process.exit(1)
  }

  // Determine seed range
  const seeds: number[] = []
  if (args.seed !== null) {
    seeds.push(args.seed)
  } else {
    for (let i = 0; i < args.count; i++) {
      seeds.push(args.seedStart + i)
    }
  }

  const outDir = args.out
  const isGallery = seeds.length > 1
  const manifests: Awaited<ReturnType<typeof writeOutputs>>[] = []

  process.stdout.write(`[generate-vector-map] Generating ${pluralSeeds(seeds.length)} → ${outDir}\n`)

  let errorCount = 0
  let warnCount = 0

  for (const seed of seeds) {
    let response: Awaited<ReturnType<typeof generateVectorMap>>
    try {
      const request = buildRequest(seed, args)
      response = generateVectorMap(request)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      process.stderr.write(`[generate-vector-map] seed ${seed}: generation FAILED — ${msg}\n`)
      errorCount++
      continue
    }

    const seedHasErrors = hasErrors(response)
    const seedHasWarnings = hasWarnings(response)

    const status = seedHasErrors ? 'ERRORS' : seedHasWarnings ? 'WARNINGS' : 'OK'
    process.stdout.write(`  seed ${seed}: ${status}\n`)

    if (seedHasErrors) errorCount++
    else if (seedHasWarnings) warnCount++

    const manifest = writeOutputs(outDir, response, seed, args)
    manifests.push(manifest)
  }

  if (isGallery && manifests.length > 0) {
    writeGallery(outDir, manifests)
    process.stdout.write(`[generate-vector-map] Gallery written → ${outDir}/index.html\n`)
  }

  process.stdout.write(
    `[generate-vector-map] Done: ${manifests.length}/${seeds.length} succeeded,` +
    ` ${errorCount} errors, ${warnCount} warnings.\n`,
  )

  if (errorCount > 0) {
    process.exit(1)
  }
  if (warnCount > 0 && !args.allowWarnings) {
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`[generate-vector-map] Unexpected error: ${String(err)}\n`)
  process.exit(2)
})
