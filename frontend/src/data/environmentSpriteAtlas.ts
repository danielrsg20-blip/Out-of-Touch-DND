export type EnvironmentSpriteRect = {
  x: number
  y: number
  w: number
  h: number
}

type EnvironmentSpriteAtlasEntry = {
  x: number
  y: number
  tileSize: number
  label: string
}

export const ENVIRONMENT_SPRITESHEET_URL = '/sprites/Environment/Terrain_and_Props.png'
const ENVIRONMENT_SPRITE_INDEX_URL = '/sprites/Environment/Terrain_and_Props.json'

let lookupCache: Map<string, EnvironmentSpriteRect> | null = null
let lookupLoadPromise: Promise<Map<string, EnvironmentSpriteRect>> | null = null

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[\s_]+/g, ' ')
}

function stripSurfaceTerms(label: string): string {
  return label
    .replace(/\b(floor|wall)\b/g, ' ')
    .replace(/[\s_]+/g, ' ')
    .trim()
}

function toLookup(entries: EnvironmentSpriteAtlasEntry[]): Map<string, EnvironmentSpriteRect> {
  const byLabel = new Map<string, EnvironmentSpriteRect>()

  for (const entry of entries) {
    const normalized = normalizeLabel(entry.label)
    if (!normalized || byLabel.has(normalized)) {
      continue
    }

    byLabel.set(normalized, {
      x: entry.x,
      y: entry.y,
      w: entry.tileSize,
      h: entry.tileSize,
    })
  }

  return byLabel
}

export function loadEnvironmentSpriteLookup(): Promise<Map<string, EnvironmentSpriteRect>> {
  if (lookupCache) {
    return Promise.resolve(lookupCache)
  }
  if (lookupLoadPromise) {
    return lookupLoadPromise
  }

  lookupLoadPromise = fetch(ENVIRONMENT_SPRITE_INDEX_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load environment sprite index: ${response.status}`)
      }

      const entries = (await response.json()) as EnvironmentSpriteAtlasEntry[]
      const lookup = toLookup(entries)
      lookupCache = lookup
      return lookup
    })
    .catch((error) => {
      lookupLoadPromise = null
      throw error
    })

  return lookupLoadPromise
}

export function resolveEnvironmentSpriteRect(spriteKey: string): EnvironmentSpriteRect | null {
  const cache = lookupCache
  if (!cache) {
    return null
  }

  const normalizedInput = spriteKey.trim()
  if (!normalizedInput) {
    return null
  }

  const label = normalizedInput
    .replace(/^env(ironment)?:/i, '')
    .trim()
  if (!label) {
    return null
  }

  const normalized = normalizeLabel(label)
  
  // First try exact normalized label match (handles "{base}_{variant}" formats)
  const exact = cache.get(normalized)
  if (exact) {
    return exact
  }

  // If variant-suffixed label doesn't exist, try stripping the variant suffix
  // and falling back to base label (e.g., "stone floor_cracked" → "stone floor")
  const variantMatch = normalized.match(/^(.+?)_(\w+)$/)
  if (variantMatch) {
    const baseLabel = variantMatch[1]
    const baseExact = cache.get(baseLabel)
    if (baseExact) {
      return baseExact
    }
  }

  // Backward compatibility: older selectors may include "floor"/"wall" even
  // when atlas labels were normalized to shared surface labels (e.g. "stone").
  const stripped = stripSurfaceTerms(normalized)
  if (stripped) {
    const normalizedSurface = normalizeLabel(stripped)
    const directSurface = cache.get(normalizedSurface)
    if (directSurface) {
      return directSurface
    }
  }

  return null
}

export async function getEnvironmentSpriteLabels(): Promise<string[]> {
  const lookup = await loadEnvironmentSpriteLookup()
  return Array.from(lookup.keys()).sort((a, b) => a.localeCompare(b))
}

export function getEnvironmentSpriteLabelsSync(): string[] {
  if (!lookupCache) {
    return []
  }
  return Array.from(lookupCache.keys()).sort((a, b) => a.localeCompare(b))
}
