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

  return cache.get(normalizeLabel(label)) ?? null
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
