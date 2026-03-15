import fs from 'node:fs/promises'
import path from 'node:path'

const target = path.resolve(process.cwd(), 'supabase', 'functions', 'dm-action', 'index.ts')

const requiredPatterns = [
  {
    name: 'feature flag wiring',
    pattern: /vector_grid_authoritative_enabled:\s*parseEnvFlag\('VECTOR_GRID_AUTHORITATIVE_ENABLED',\s*false\)/,
  },
  {
    name: 'grid derivation flag wiring',
    pattern: /vector_grid_derivation_enabled:\s*parseEnvFlag\('VECTOR_GRID_DERIVATION_ENABLED',\s*true\)/,
  },
  {
    name: 'traversal grid extractor',
    pattern: /function\s+getTraversalGridFromMap\s*\(/,
  },
  {
    name: 'collision grid hydration from traversal grid',
    pattern: /function\s+hydrateCollisionGridFromTraversalGrid\s*\(/,
  },
  {
    name: 'feet-per-step helper from traversal grid',
    pattern: /function\s+movementFeetPerStepFromTraversalGrid\s*\(/,
  },
  {
    name: 'actionMoveToken authoritative traversal-grid branch',
    pattern: /const\s+traversalGrid\s*=\s*FEATURE_FLAGS\.vector_grid_authoritative_enabled\s*&&\s*FEATURE_FLAGS\.vector_grid_derivation_enabled\s*\?\s*getTraversalGridFromMap\(map\)\s*:\s*null/,
  },
  {
    name: 'actionMoveToken traversal-grid hydration call',
    pattern: /if\s*\(traversalGrid\)\s*{[\s\S]*?hydrateCollisionGridFromTraversalGrid\(grid,\s*traversalGrid,\s*width,\s*height\)/,
  },
  {
    name: 'actionMoveToken traversal-aware movement distance',
    pattern: /const\s+moveDistance\s*=\s*traversalGrid\s*\?[\s\S]*?movementFeetPerStepFromTraversalGrid\(traversalGrid,\s*width,\s*height\)/,
  },
]

async function main() {
  const source = await fs.readFile(target, 'utf8')

  const missing = requiredPatterns.filter(({ pattern }) => !pattern.test(source))

  if (missing.length > 0) {
    console.error('dm-action movement adapter validation failed.')
    console.error(`File checked: ${target}`)
    for (const item of missing) {
      console.error(`- Missing expected pattern: ${item.name}`)
    }
    process.exit(1)
  }

  console.log('dm-action movement adapter validation passed.')
  console.log(`Checked ${requiredPatterns.length} invariants in ${target}`)
}

main().catch((error) => {
  console.error('dm-action movement adapter validation errored.')
  console.error(error)
  process.exit(1)
})
