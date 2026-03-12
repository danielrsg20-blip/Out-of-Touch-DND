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

type EnvironmentSpriteAtlasFrame = {
  frame?: {
    x?: number
    y?: number
    w?: number
    h?: number
  }
  baseLabel?: string
}

type EnvironmentSpriteAtlasPayload =
  | EnvironmentSpriteAtlasEntry[]
  | {
      frames?: Record<string, EnvironmentSpriteAtlasFrame>
      meta?: {
        tileSize?: number
      }
    }

export const ENVIRONMENT_SPRITESHEET_URL = '/sprites/Environment/Stylized_environment.png'
const ENVIRONMENT_SPRITE_INDEX_URL = '/sprites/Environment/Stylized_environment.json'
const LEGACY_ENVIRONMENT_SPRITE_INDEX_URL = '/sprites/Environment/Terrain_and_Props.json'

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

function addLookupEntry(
  byLabel: Map<string, EnvironmentSpriteRect>,
  label: string,
  x: number,
  y: number,
  tileSize: number,
) {
  const normalized = normalizeLabel(label)
  if (!normalized || byLabel.has(normalized)) {
    return
  }
  byLabel.set(normalized, { x, y, w: tileSize, h: tileSize })
}

function toLookupFromFrames(payload: Exclude<EnvironmentSpriteAtlasPayload, EnvironmentSpriteAtlasEntry[]>): Map<string, EnvironmentSpriteRect> {
  const byLabel = new Map<string, EnvironmentSpriteRect>()
  const defaultTileSize = payload.meta?.tileSize ?? 32
  const frames = payload.frames ?? {}

  for (const [frameKey, frameData] of Object.entries(frames)) {
    const frame = frameData?.frame
    if (!frame) {
      continue
    }

    const x = Number(frame.x ?? 0)
    const y = Number(frame.y ?? 0)
    const w = Number(frame.w ?? defaultTileSize)
    const h = Number(frame.h ?? defaultTileSize)
    const tileSize = Number.isFinite(w) && w > 0
      ? w
      : Number.isFinite(h) && h > 0
        ? h
        : defaultTileSize

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tileSize) || tileSize <= 0) {
      continue
    }

    addLookupEntry(byLabel, frameKey, x, y, tileSize)

    const baseLabel = frameData?.baseLabel?.trim()
    if (baseLabel) {
      addLookupEntry(byLabel, baseLabel, x, y, tileSize)
    }
  }

  return byLabel
}

function parseLookup(payload: EnvironmentSpriteAtlasPayload): Map<string, EnvironmentSpriteRect> {
  if (Array.isArray(payload)) {
    return toLookup(payload)
  }
  return toLookupFromFrames(payload)
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
      if (response.ok) {
        return response.json() as Promise<EnvironmentSpriteAtlasPayload>
      }

      const legacyResponse = await fetch(LEGACY_ENVIRONMENT_SPRITE_INDEX_URL)
      if (!legacyResponse.ok) {
        throw new Error(`Failed to load environment sprite index: ${response.status}`)
      }
      return legacyResponse.json() as Promise<EnvironmentSpriteAtlasPayload>
    })
    .then((payload) => {
      const lookup = parseLookup(payload)
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

  // First try exact normalized label match (handles direct base/frame labels).
  const exact = cache.get(normalized)
  if (exact) {
    return exact
  }

  // For variant-suffixed keys, strip the suffix from the raw label (before
  // underscore normalization) and retry the base label.
  const rawVariantMatch = label.match(/^(.+?)_([a-z0-9_]+)$/i)
  if (rawVariantMatch) {
    const rawBaseLabel = rawVariantMatch[1]
    const normalizedBaseLabel = normalizeLabel(rawBaseLabel)
    const baseExact = cache.get(normalizedBaseLabel)
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
