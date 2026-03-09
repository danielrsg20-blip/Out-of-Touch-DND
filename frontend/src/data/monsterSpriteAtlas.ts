export type MonsterSpriteRect = {
  x: number
  y: number
  w: number
  h: number
  frameKey: string
  baseLabel: string
}

type MonsterSpriteAtlasFrame = {
  frame: {
    x: number
    y: number
    w: number
    h: number
  }
  baseLabel?: string
}

type MonsterSpriteAtlasPayload = {
  frames?: Record<string, MonsterSpriteAtlasFrame>
}

export const MONSTER_SPRITESHEET_URL = '/sprites/Monsters/monsters.png'
const MONSTER_SPRITE_INDEX_URL = '/sprites/Monsters/monsters.json'

let frameLookupCache: Map<string, MonsterSpriteRect> | null = null
let baseLookupCache: Map<string, string[]> | null = null
let lookupLoadPromise: Promise<void> | null = null

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeSpriteKey(spriteKey: string): string {
  return normalizeKey(spriteKey.replace(/^monster:/i, ''))
}

function toLookup(payload: MonsterSpriteAtlasPayload): {
  byFrame: Map<string, MonsterSpriteRect>
  byBase: Map<string, string[]>
} {
  const byFrame = new Map<string, MonsterSpriteRect>()
  const byBase = new Map<string, string[]>()
  const frames = payload.frames ?? {}

  for (const [frameKeyRaw, frameData] of Object.entries(frames)) {
    const frameKey = normalizeKey(frameKeyRaw)
    const rect = frameData?.frame
    if (!frameKey || !rect) {
      continue
    }

    const baseLabelRaw = frameData.baseLabel || frameKeyRaw
    const baseLabel = normalizeKey(baseLabelRaw)
    if (!baseLabel) {
      continue
    }

    const spriteRect: MonsterSpriteRect = {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      frameKey,
      baseLabel,
    }

    byFrame.set(frameKey, spriteRect)
    const existing = byBase.get(baseLabel)
    if (existing) {
      existing.push(frameKey)
    } else {
      byBase.set(baseLabel, [frameKey])
    }
  }

  return { byFrame, byBase }
}

export function loadMonsterSpriteLookup(): Promise<void> {
  if (frameLookupCache && baseLookupCache) {
    return Promise.resolve()
  }
  if (lookupLoadPromise) {
    return lookupLoadPromise
  }

  lookupLoadPromise = fetch(MONSTER_SPRITE_INDEX_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load monster sprite index: ${response.status}`)
      }

      const payload = (await response.json()) as MonsterSpriteAtlasPayload
      const lookup = toLookup(payload)
      frameLookupCache = lookup.byFrame
      baseLookupCache = lookup.byBase
    })
    .catch((error) => {
      lookupLoadPromise = null
      throw error
    })

  return lookupLoadPromise
}

export function resolveMonsterSpriteRect(spriteKey: string): MonsterSpriteRect | null {
  const frameLookup = frameLookupCache
  const baseLookup = baseLookupCache
  if (!frameLookup || !baseLookup) {
    return null
  }

  const normalized = normalizeSpriteKey(spriteKey)
  if (!normalized) {
    return null
  }

  const exactFrame = frameLookup.get(normalized)
  if (exactFrame) {
    return exactFrame
  }

  const firstVariant = baseLookup.get(normalized)?.[0]
  return firstVariant ? frameLookup.get(firstVariant) ?? null : null
}

export function getMonsterFrameKeysForBaseLabel(baseLabel: string): string[] {
  const baseLookup = baseLookupCache
  if (!baseLookup) {
    return []
  }

  const normalized = normalizeSpriteKey(baseLabel)
  if (!normalized) {
    return []
  }

  return [...(baseLookup.get(normalized) ?? [])]
}

export function getMonsterBaseLabelsSync(): string[] {
  if (!baseLookupCache) {
    return []
  }
  return Array.from(baseLookupCache.keys()).sort((a, b) => a.localeCompare(b))
}

export async function getMonsterBaseLabels(): Promise<string[]> {
  await loadMonsterSpriteLookup()
  return getMonsterBaseLabelsSync()
}
