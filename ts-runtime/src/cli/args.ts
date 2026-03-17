import { parseArgs } from 'node:util'

export type HarnessArgs = {
  // Single-map mode
  seed: number | null
  // Gallery mode
  seedStart: number
  count: number
  // Map parameters
  biome: 'dungeon' | 'cavern' | 'forest' | 'village' | 'crypt' | 'mine' | 'custom'
  preset: string
  prompt: string
  width: number
  height: number
  rooms: number
  corridorWidth: number
  obstacles: number
  hazards: number
  cellSize: number
  resolution: 1 | 2
  diagonal: 'allow' | 'forbid'
  // Output
  out: string
  noCompat: boolean
  // Validation
  validation: 'strict' | 'fixup'
  allowWarnings: boolean
}

const BIOMES = ['dungeon', 'cavern', 'forest', 'village', 'crypt', 'mine', 'custom'] as const
type Biome = (typeof BIOMES)[number]

function isBiome(v: string): v is Biome {
  return (BIOMES as readonly string[]).includes(v)
}

function assertPositiveInt(name: string, v: number): number {
  if (!Number.isInteger(v) || v < 1) throw new Error(`--${name} must be a positive integer, got: ${v}`)
  return v
}

function assertRange(name: string, v: number, min: number, max: number): number {
  if (!Number.isFinite(v) || v < min || v > max)
    throw new Error(`--${name} must be between ${min} and ${max}, got: ${v}`)
  return v
}

export function parseHarnessArgs(argv: string[] = process.argv.slice(2)): HarnessArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      seed:          { type: 'string' },
      'seed-start':  { type: 'string' },
      count:         { type: 'string' },
      biome:         { type: 'string', default: 'dungeon' },
      preset:        { type: 'string', default: 'default' },
      prompt:        { type: 'string', default: '' },
      width:         { type: 'string', default: '512' },
      height:        { type: 'string', default: '384' },
      rooms:         { type: 'string', default: '8' },
      'corridor-width': { type: 'string', default: '2' },
      obstacles:     { type: 'string', default: '0.1' },
      hazards:       { type: 'string', default: '0.1' },
      'cell-size':   { type: 'string', default: '5' },
      resolution:    { type: 'string', default: '2' },
      diagonal:      { type: 'string', default: 'allow' },
      out:           { type: 'string', default: './out/vector-maps' },
      'no-compat':   { type: 'boolean', default: false },
      validation:    { type: 'string', default: 'fixup' },
      'allow-warnings': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(', ')}`)
  }

  // --- seed / count / seed-start ---
  const countRaw = values['count'] != null ? parseInt(String(values['count']), 10) : 0
  const seedStartRaw = values['seed-start'] != null ? parseInt(String(values['seed-start']), 10) : 1
  const seedRaw = values['seed'] != null ? parseInt(String(values['seed']), 10) : null

  if (countRaw === 0 && seedRaw === null) {
    throw new Error('Either --seed <n> (single map) or --count <n> --seed-start <n> (gallery) is required.')
  }
  if (countRaw > 0 && !Number.isInteger(seedStartRaw)) {
    throw new Error('--seed-start must be an integer')
  }
  if (countRaw > 0) assertPositiveInt('count', countRaw)
  if (seedRaw !== null && !Number.isInteger(seedRaw)) {
    throw new Error('--seed must be an integer')
  }

  // --- biome ---
  const biomeStr = String(values['biome'])
  if (!isBiome(biomeStr)) {
    throw new Error(`--biome must be one of: ${BIOMES.join(', ')}; got: ${biomeStr}`)
  }

  // --- resolution ---
  const resolutionRaw = parseInt(String(values['resolution']), 10)
  if (resolutionRaw !== 1 && resolutionRaw !== 2) {
    throw new Error('--resolution must be 1 or 2')
  }

  // --- diagonal ---
  const diagonalStr = String(values['diagonal'])
  if (diagonalStr !== 'allow' && diagonalStr !== 'forbid') {
    throw new Error('--diagonal must be "allow" or "forbid"')
  }

  // --- validation ---
  const validationStr = String(values['validation'])
  if (validationStr !== 'strict' && validationStr !== 'fixup') {
    throw new Error('--validation must be "strict" or "fixup"')
  }

  return {
    seed: seedRaw,
    seedStart: assertPositiveInt('seed-start', isNaN(seedStartRaw) ? 1 : seedStartRaw),
    count: countRaw,
    biome: biomeStr,
    preset: String(values['preset']),
    prompt: String(values['prompt']),
    width: assertPositiveInt('width', parseInt(String(values['width']), 10)),
    height: assertPositiveInt('height', parseInt(String(values['height']), 10)),
    rooms: assertPositiveInt('rooms', parseInt(String(values['rooms']), 10)),
    corridorWidth: assertPositiveInt('corridor-width', parseInt(String(values['corridor-width']), 10)),
    obstacles: assertRange('obstacles', parseFloat(String(values['obstacles'])), 0, 1),
    hazards: assertRange('hazards', parseFloat(String(values['hazards'])), 0, 1),
    cellSize: assertPositiveInt('cell-size', parseInt(String(values['cell-size']), 10)),
    resolution: resolutionRaw as 1 | 2,
    diagonal: diagonalStr,
    out: String(values['out']),
    noCompat: Boolean(values['no-compat']),
    validation: validationStr,
    allowWarnings: Boolean(values['allow-warnings']),
  }
}

export function printHelp(): void {
  console.log(`
Usage: generate-vector-map [options]

Single map:
  --seed <n>                    Seed (required unless --count is used)

Gallery / sweep mode:
  --count <n>                   Number of maps to generate
  --seed-start <n>              Starting seed for sweep (default: 1)

Map parameters:
  --biome <type>                dungeon|cavern|forest|village|crypt|mine|custom (default: dungeon)
  --preset <string>             Style preset name (default: default)
  --prompt <string>             Story prompt / narrative hint
  --width <n>                   Map width in world units (default: 512)
  --height <n>                  Map height in world units (default: 384)
  --rooms <n>                   Room count hint (default: 8)
  --corridor-width <n>          Corridor width in cells (default: 2)
  --obstacles <0-1>             Obstacle density (default: 0.1)
  --hazards <0-1>               Hazard density (default: 0.1)
  --cell-size <n>               Base grid cell size in world units (default: 5)
  --resolution 1|2              Grid resolution multiplier (default: 2)
  --diagonal allow|forbid       Diagonal movement policy (default: allow)

Output:
  --out <path>                  Output directory (default: ./out/vector-maps)
  --no-compat                   Skip writing compatibility.json

Validation:
  --validation strict|fixup     Validation mode (default: fixup)
  --allow-warnings              Exit 0 even when warnings or fixups were applied

Examples:
  pnpm generate:vector-map --seed 123
  pnpm generate:vector-map --seed 123 --biome forest --prompt "ancient ruins" --out ./out
  pnpm generate:vector-map --count 50 --seed-start 1000 --biome dungeon --out ./out/sweep
  pnpm generate:vector-map --seed 42 --validation strict
`.trim())
}
