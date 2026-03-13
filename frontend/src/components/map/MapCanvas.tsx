import { useRef, useEffect, useCallback, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useMapInteraction } from '../../hooks/useMapInteraction'
import { drawOverlays } from './OverlayLayer'
import type { TileData } from '../../types'
import { resolveSpriteUrl } from '../../data/spriteManifest'
import {
  ENVIRONMENT_SPRITESHEET_URL,
  loadEnvironmentSpriteLookup,
  resolveEnvironmentSpriteRect,
} from '../../data/environmentSpriteAtlas'
import {
  MONSTER_SPRITESHEET_URL,
  getMonsterFrameKeysForBaseLabel,
  loadMonsterSpriteLookup,
  resolveMonsterSpriteRect,
} from '../../data/monsterSpriteAtlas'
import {
  CHARACTER_SPRITESHEET_COLUMNS,
  CHARACTER_SPRITESHEET_ROWS,
  getCharacterSpriteId,
  getCharacterSpriteCell,
  getCharacterSpritesheetUrl,
} from '../../config/characterSprites'
import { getMonsterSpriteCandidates } from '../../config/monsterSprites'
import './MapCanvas.css'

const TILE_SIZE = 32
const BASE_TOKEN_SPRITE_SIZE = TILE_SIZE * 0.86
const CHARACTER_SPRITE_SCALE = 1.5

const TILE_COLORS: Record<string, string> = {
  floor: '#3a3a4a',
  wall: '#1a1a2a',
  door: '#8B7355',
  water: '#2a5a8a',
  pit: '#0a0a0a',
  pillar: '#5a5a6a',
  stairs_up: '#4a6a4a',
  stairs_down: '#6a4a4a',
  chest: '#3a3a4a',
  rubble: '#4a4a3a',
}

const TILE_TYPE_ATLAS_FALLBACK: Record<string, string> = {
  floor: 'env:dirt_floor',
  wall: 'env:stone_wall',
  door: 'env:stone_bricks',
  water: 'env:deep water',
  pit: 'env:lava_wall',
  pillar: 'env:stone_wall_dark',
  stairs_up: 'env:stone_floor',
  stairs_down: 'env:stone_floor',
  chest: 'env:stone_bricks',
  rubble: 'env:cracked_stone',
}

const ENTITY_COLORS: Record<string, string> = {
  pc: '#3498db',
  npc: '#2ecc71',
  enemy: '#e74c3c',
  object: '#e4a853',
}

interface TokenAnim {
  fromX: number; fromY: number
  toX: number; toY: number
  startTime: number; duration: number
}

interface DamagePopup {
  id: number
  worldX: number; worldY: number
  text: string; color: string
  startTime: number; duration: number
}

let dmgPopupCounter = 0

const CONDITION_INFO: Record<string, { abbr: string; color: string }> = {
  poisoned:      { abbr: 'PSN', color: '#27ae60' },
  blinded:       { abbr: 'BLD', color: '#7f8c8d' },
  stunned:       { abbr: 'STN', color: '#e74c3c' },
  frightened:    { abbr: 'FRT', color: '#e67e22' },
  prone:         { abbr: 'PRN', color: '#95a5a6' },
  paralyzed:     { abbr: 'PAR', color: '#9b59b6' },
  unconscious:   { abbr: 'UNC', color: '#c0392b' },
  charmed:       { abbr: 'CHM', color: '#e91e63' },
  exhaustion:    { abbr: 'EXH', color: '#d35400' },
  grappled:      { abbr: 'GRP', color: '#2980b9' },
  incapacitated: { abbr: 'INC', color: '#c0392b' },
  invisible:     { abbr: 'INV', color: '#bdc3c7' },
  petrified:     { abbr: 'PET', color: '#7f8c8d' },
  deafened:      { abbr: 'DEF', color: '#7f8c8d' },
  restrained:    { abbr: 'RST', color: '#e67e22' },
}

interface MapCanvasProps {
  onTileClick?: (gx: number, gy: number) => void
  onEntityClick?: (entityId: string) => void
  targetingMode?: boolean
}

function inferEnemySpriteIdByName(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('skeleton') || key.includes('zombie') || key.includes('ghoul') || key.includes('wraith')) return 'enemy_skeleton'
  if (key.includes('goblin')) return 'enemy_goblin'
  if (key.includes('orc')) return 'enemy_orc'
  if (key.includes('kobold')) return 'enemy_kobold'
  if (key.includes('bandit')) return 'enemy_bandit'
  if (key.includes('wolf') || key.includes('boar') || key.includes('bat')) return 'enemy_wolf'
  if (key.includes('spider')) return 'enemy_spider'
  return 'enemy_goblin'
}

function inferPropSpriteIdByName(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('tree') || key.includes('bush') || key.includes('log')) return 'prop_tree'
  if (key.includes('urn') || key.includes('tomb') || key.includes('bones') || key.includes('brazier')) return 'prop_urn'
  if (key.includes('stalagmite') || key.includes('crystal') || key.includes('mushroom')) return 'prop_stalagmite'
  if (key.includes('torch')) return 'prop_torch'
  if (key.includes('crate')) return 'prop_crate'
  if (key.includes('barrel')) return 'prop_barrel'
  if (key.includes('rubble')) return 'prop_rubble'
  return 'prop_stone'
}

function resolveEnvironmentLabel(spriteKey: string | undefined): string | null {
  if (!spriteKey) {
    return null
  }
  const normalized = spriteKey
    .replace(/^env(ironment)?:/i, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
  return normalized || null
}

export default function MapCanvas({ onTileClick, onEntityClick, targetingMode = false }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fittedMapKeyRef = useRef<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const imageUrlRef = useRef<string | null>(null)
  const characterSheetCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const environmentSheetCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const monsterSheetCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const spriteCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const enemyMonsterVariantByEntityIdRef = useRef<Map<string, string>>(new Map())

  const tokenAnimationsRef = useRef<Map<string, TokenAnim>>(new Map())
  const prevEntityPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const dmgPopupsRef = useRef<DamagePopup[]>([])
  const prevHpRef = useRef<Map<string, number>>(new Map())
  const map = useGameStore(s => s.map)
  const combat = useGameStore(s => s.combat)
  const characters = useGameStore(s => s.characters)
  const selectedEntityId = useGameStore(s => s.selectedEntityId)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)
  const interaction = useMapInteraction()
  const [showAtlasLabels, setShowAtlasLabels] = useState(false)
  const [showPaletteDebug, setShowPaletteDebug] = useState(false)

  const myCharacterId = players.find(p => p.id === playerId)?.character_id ?? null

  const resolveCharacterForEntity = useCallback((entityId: string, entityName: string) => {
    const direct = characters[entityId]
    if (direct) {
      return direct
    }

    const fromPlayerMembership = players
      .find((player) => player.id === entityId)
      ?.character_id
    if (fromPlayerMembership && characters[fromPlayerMembership]) {
      return characters[fromPlayerMembership]
    }

    const normalizedName = entityName.trim().toLowerCase()
    if (!normalizedName) {
      return null
    }

    for (const character of Object.values(characters)) {
      if (character.name.trim().toLowerCase() === normalizedName) {
        return character
      }
    }

    return null
  }, [characters, players])

  const mapMetadata = map?.metadata
  const imageUrl = mapMetadata?.image_url
  const imageOpacity = Math.min(1, Math.max(0, mapMetadata?.image_opacity ?? 0.85))

  useEffect(() => {
    if (!imageUrl) {
      imageRef.current = null
      imageUrlRef.current = null
      return
    }

    if (imageUrlRef.current === imageUrl && imageRef.current) {
      return
    }

    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      imageRef.current = img
      imageUrlRef.current = imageUrl
    }
    img.onerror = () => {
      imageRef.current = null
      imageUrlRef.current = null
    }
    img.src = imageUrl
  }, [imageUrl])

  useEffect(() => {
    void loadEnvironmentSpriteLookup().catch(() => {
      // Keep fallback token rendering if the optional environment atlas fails to load.
    })

    void loadMonsterSpriteLookup().catch(() => {
      // Keep fallback token rendering if the optional monster atlas fails to load.
    })
  }, [])

  useEffect(() => {
    if (!map) {
      enemyMonsterVariantByEntityIdRef.current.clear()
      return
    }

    const aliveEnemyIds = new Set(
      map.entities
        .filter((entity) => entity.type === 'enemy')
        .map((entity) => entity.id),
    )

    const cache = enemyMonsterVariantByEntityIdRef.current
    for (const existingId of Array.from(cache.keys())) {
      if (!aliveEnemyIds.has(existingId)) {
        cache.delete(existingId)
      }
    }
  }, [map])

  // Detect HP changes and spawn floating damage/heal popups
  useEffect(() => {
    const prev = prevHpRef.current
    const popups = dmgPopupsRef.current
    const now = performance.now()

    const spawnPopup = (entityId: string, hp: number) => {
      const prevHp = prev.get(entityId)
      if (prevHp !== undefined && hp !== prevHp) {
        const delta = hp - prevHp
        const entity = map?.entities.find(e => e.id === entityId)
        if (entity) {
          popups.push({
            id: ++dmgPopupCounter,
            worldX: entity.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 8,
            worldY: entity.y * TILE_SIZE + TILE_SIZE / 2,
            text: delta > 0 ? `+${delta}` : `${delta}`,
            color: delta > 0 ? '#2ecc71' : '#e74c3c',
            startTime: now,
            duration: 1400,
          })
        }
      }
      prev.set(entityId, hp)
    }

    for (const [id, char] of Object.entries(characters)) {
      spawnPopup(id, char.hp)
    }
    if (combat) {
      for (const entry of combat.initiative_order) {
        if (!characters[entry.id]) spawnPopup(entry.id, entry.hp)
      }
    }
  }, [characters, combat, map])

  useEffect(() => {
    if (!map) return
    const anims = tokenAnimationsRef.current
    const prev = prevEntityPositionsRef.current
    const now = performance.now()

    const liveIds = new Set<string>()
    for (const entity of map.entities) {
      liveIds.add(entity.id)
      const last = prev.get(entity.id)
      if (last && (last.x !== entity.x || last.y !== entity.y)) {
        anims.set(entity.id, {
          fromX: last.x, fromY: last.y,
          toX: entity.x, toY: entity.y,
          startTime: now,
          duration: 280,
        })
      }
      prev.set(entity.id, { x: entity.x, y: entity.y })
    }
    // Clean up stale entries
    for (const id of prev.keys()) {
      if (!liveIds.has(id)) { prev.delete(id); anims.delete(id) }
    }
  }, [map])

  const getMonsterFrameKeyForEnemy = useCallback((entityId: string, enemyName: string, explicitSpriteKey?: string): string | null => {
    const variantCache = enemyMonsterVariantByEntityIdRef.current

    const explicitKey = explicitSpriteKey?.trim()
    if (explicitKey && explicitKey.toLowerCase() !== 'default') {
      const explicitRect = resolveMonsterSpriteRect(explicitKey)
      if (explicitRect) {
        variantCache.set(entityId, explicitRect.frameKey)
        return explicitRect.frameKey
      }

      // If the override references a base label, pick the first variant deterministically.
      const explicitVariants = getMonsterFrameKeysForBaseLabel(explicitKey)
      if (explicitVariants.length > 0) {
        const selectedFrame = explicitVariants[0]
        variantCache.set(entityId, selectedFrame)
        return selectedFrame
      }
    }

    const existing = variantCache.get(entityId)
    if (existing && resolveMonsterSpriteRect(existing)) {
      return existing
    }

    const candidates = getMonsterSpriteCandidates(enemyName)
    for (const candidate of candidates) {
      const directRect = resolveMonsterSpriteRect(candidate)
      if (directRect) {
        variantCache.set(entityId, directRect.frameKey)
        return directRect.frameKey
      }

      const frameKeys = getMonsterFrameKeysForBaseLabel(candidate)
      if (frameKeys.length > 0) {
        const randomIndex = Math.floor(Math.random() * frameKeys.length)
        const selectedFrame = frameKeys[randomIndex]
        variantCache.set(entityId, selectedFrame)
        return selectedFrame
      }
    }

    return null
  }, [])

  useEffect(() => {
    if (!map) return
    const container = containerRef.current
    if (!container) return

    const mapKey = `${map.metadata?.map_id || 'map'}:${map.width}x${map.height}`
    if (fittedMapKeyRef.current === mapKey) return

    const rect = container.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    interaction.fitToView(map.width, map.height, rect.width, rect.height)
    fittedMapKeyRef.current = mapKey
  }, [map, interaction])

  useEffect(() => {
    if (!map) return
    const container = containerRef.current
    if (!container) return

    const fit = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      interaction.fitToView(map.width, map.height, rect.width, rect.height)
    }

    let frameId = 0
    const scheduleFit = () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(() => {
        fit()
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit()
    })
    resizeObserver.observe(container)

    window.addEventListener('resize', scheduleFit)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleFit)
      if (frameId) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [map?.width, map?.height, interaction])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.save()
    ctx.translate(interaction.offsetX, interaction.offsetY)
    ctx.scale(interaction.zoom, interaction.zoom)

    const loadedImage = imageRef.current
    if (loadedImage && imageUrlRef.current === imageUrl) {
      ctx.save()
      ctx.globalAlpha = imageOpacity
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(loadedImage, 0, 0, map.width * TILE_SIZE, map.height * TILE_SIZE)
      ctx.restore()
    }

    const visibleSet = new Set(
      (map.visible || []).map(v => `${v.x},${v.y}`)
    )
    const revealedSet = new Set(
      (map.revealed || []).map(v => `${v.x},${v.y}`)
    )
    const hasVisibility = visibleSet.size > 0

    const tileMap = new Map<string, TileData>()
    for (const t of map.tiles) {
      tileMap.set(`${t.x},${t.y}`, t)
    }

    const blockedTileSet = new Set(
      map.tiles
        .filter((t) => t.type === 'wall' || t.type === 'pit' || t.type === 'pillar' || t.type === 'rubble' || (t.type === 'door' && t.state === 'closed'))
        .map((t) => `${t.x},${t.y}`),
    )
    const blockingEntitySet = new Set(
      map.entities
        .filter((e) => e.blocks_movement !== false)
        .map((e) => `${e.x},${e.y}`),
    )

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const key = `${x},${y}`
        const tile = tileMap.get(key)
        const px = x * TILE_SIZE
        const py = y * TILE_SIZE

        if (hasVisibility && !visibleSet.has(key) && !revealedSet.has(key)) {
          ctx.fillStyle = '#0a0a0a'
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE)
          continue
        }

        const tileSpriteKey = (() => {
          if (!tile) {
            return null
          }
          
          if (typeof tile?.sprite === 'string' && tile.sprite.trim()) {
            // If tile has a variant, try the variant-suffixed label first
            if (tile.variant) {
              // Strip "env:" prefix if present to inject variant before suffix
              const baseSpriteLabel = tile.sprite.replace(/^env(ironment)?:\s*/i, '').trim()
              if (baseSpriteLabel) {
                // Try "{base}_{variant}" format first
                // e.g., if sprite is "stone floor" and variant is "cracked", try "stone floor_cracked"
                return `env:${baseSpriteLabel}_${tile.variant}`
              }
            }
            return tile.sprite
          }
          
          return TILE_TYPE_ATLAS_FALLBACK[tile.type] ?? null
        })()

        const tileRect = tileSpriteKey ? resolveEnvironmentSpriteRect(tileSpriteKey) : null
        const environmentSheetImageForTile = tileRect
          ? environmentSheetCacheRef.current.get(ENVIRONMENT_SPRITESHEET_URL)
          : null

        if (tileRect && environmentSheetImageForTile && environmentSheetImageForTile !== 'loading') {
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(
            environmentSheetImageForTile,
            tileRect.x,
            tileRect.y,
            tileRect.w,
            tileRect.h,
            px,
            py,
            TILE_SIZE,
            TILE_SIZE,
          )
        } else {
          const color = tile ? (TILE_COLORS[tile.type] || '#3a3a4a') : '#0a0a0a'
          const hasBackgroundImage = !!loadedImage
          const lowOpacityTile = tile?.type === 'floor' || tile?.type === 'water'
          ctx.globalAlpha = hasBackgroundImage && lowOpacityTile ? 0.35 : 1
          ctx.fillStyle = color
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE)
          ctx.globalAlpha = 1

          if (tileRect && environmentSheetImageForTile === undefined) {
            environmentSheetCacheRef.current.set(ENVIRONMENT_SPRITESHEET_URL, 'loading')
            const img = new Image()
            img.decoding = 'async'
            img.onload = () => {
              environmentSheetCacheRef.current.set(ENVIRONMENT_SPRITESHEET_URL, img)
            }
            img.onerror = () => {
              environmentSheetCacheRef.current.set(ENVIRONMENT_SPRITESHEET_URL, null)
            }
            img.src = ENVIRONMENT_SPRITESHEET_URL
          }
        }

        if (hasVisibility && revealedSet.has(key) && !visibleSet.has(key)) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE)
        }

        if (tile?.type === 'door') {
          ctx.fillStyle = tile.state === 'closed' ? '#6B5335' : '#A08860'
          ctx.fillRect(px + 8, py + 2, TILE_SIZE - 16, TILE_SIZE - 4)
        }

        if (tile?.type === 'chest') {
          ctx.fillStyle = '#DAA520'
          ctx.fillRect(px + 10, py + 12, TILE_SIZE - 20, TILE_SIZE - 20)
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE)

        const isBlockedForTraversal = blockedTileSet.has(key) || blockingEntitySet.has(key)
        if (showAtlasLabels && (tileSpriteKey || isBlockedForTraversal)) {
          const label = resolveEnvironmentLabel(tileSpriteKey ?? undefined)
          if (label || isBlockedForTraversal) {
            const baseText = label || 'tile'
            const fullText = isBlockedForTraversal ? `no ${baseText}` : baseText
            const short = fullText.length > 14 ? `${fullText.slice(0, 13)}.` : fullText
            ctx.fillStyle = 'rgba(0, 0, 0, 0.66)'
            ctx.fillRect(px + 1, py + TILE_SIZE - 11, TILE_SIZE - 2, 10)
            ctx.fillStyle = isBlockedForTraversal ? 'rgba(255, 136, 136, 0.98)' : 'rgba(255, 240, 184, 0.98)'
            ctx.font = '7px monospace'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'bottom'
            ctx.fillText(short, px + 2, py + TILE_SIZE - 2)
          }
        }
      }
    }

    for (const entity of map.entities) {
      if (hasVisibility && !visibleSet.has(`${entity.x},${entity.y}`)) continue

      const isDefeatedEnemy = entity.type === 'enemy' && (characters[entity.id]?.hp ?? 1) <= 0

      const anim = tokenAnimationsRef.current.get(entity.id)
      let drawGX = entity.x
      let drawGY = entity.y
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.startTime) / anim.duration)
        const ease = 1 - Math.pow(1 - t, 3) // ease-out cubic
        drawGX = anim.fromX + (anim.toX - anim.fromX) * ease
        drawGY = anim.fromY + (anim.toY - anim.fromY) * ease
        if (t >= 1) tokenAnimationsRef.current.delete(entity.id)
      }
      const px = drawGX * TILE_SIZE + TILE_SIZE / 2
      const py = drawGY * TILE_SIZE + TILE_SIZE / 2
      const radius = TILE_SIZE * 0.35
      const color = ENTITY_COLORS[entity.type] || '#fff'
      const spriteKey = entity.sprite?.trim()
      const inferredSpriteKey = (() => {
        if (entity.type === 'pc') {
          const character = resolveCharacterForEntity(entity.id, entity.name)
          const derivedCharacterSprite = character
            ? getCharacterSpriteId(character.class, character.race)
            : null
          if (derivedCharacterSprite) {
            return derivedCharacterSprite
          }

          const characterSprite = character?.sprite_id
          if (typeof characterSprite === 'string' && characterSprite.trim()) {
            return characterSprite
          }
          return 'pc_knight'
        }

        if (entity.type === 'enemy') {
          return inferEnemySpriteIdByName(entity.name)
        }

        if (entity.type === 'object') {
          return inferPropSpriteIdByName(entity.name)
        }

        return ''
      })()

      const resolvedSpriteUrl = [spriteKey, inferredSpriteKey]
        .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
        .map((candidate) => resolveSpriteUrl(candidate))
        .find((candidate) => typeof candidate === 'string' && candidate.length > 0) ?? null

      const environmentFrameKey = [
        spriteKey,
        entity.type === 'object' ? `env:${entity.name}` : null,
      ]
        .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
        .find((candidate) => Boolean(resolveEnvironmentSpriteRect(candidate)))
      const environmentRect = environmentFrameKey ? resolveEnvironmentSpriteRect(environmentFrameKey) : null
      const environmentSheetImage = environmentRect
        ? environmentSheetCacheRef.current.get(ENVIRONMENT_SPRITESHEET_URL)
        : null

      const monsterFrameKey = entity.type === 'enemy'
        ? getMonsterFrameKeyForEnemy(entity.id, entity.name, spriteKey)
        : null
      const monsterRect = monsterFrameKey ? resolveMonsterSpriteRect(monsterFrameKey) : null
      const monsterSheetImage = monsterRect
        ? monsterSheetCacheRef.current.get(MONSTER_SPRITESHEET_URL)
        : null

      const characterFrameKey = [spriteKey, inferredSpriteKey]
        .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
        .find((candidate) => Boolean(getCharacterSpriteCell(candidate)))
      const characterCell = characterFrameKey ? getCharacterSpriteCell(characterFrameKey) : null
      const characterSheetUrl = characterFrameKey ? getCharacterSpritesheetUrl(characterFrameKey) : null
      const characterSheetImage = characterSheetUrl ? characterSheetCacheRef.current.get(characterSheetUrl) : null
      const isCharacterSheetSprite = Boolean(characterCell && characterSheetImage && characterSheetImage !== 'loading')
      let spriteDrawWidth = BASE_TOKEN_SPRITE_SIZE
      let spriteDrawHeight = BASE_TOKEN_SPRITE_SIZE
      if (isCharacterSheetSprite) {
        const loadedSheet = characterSheetImage as HTMLImageElement
        const sourceW = loadedSheet.naturalWidth / CHARACTER_SPRITESHEET_COLUMNS
        const sourceH = loadedSheet.naturalHeight / CHARACTER_SPRITESHEET_ROWS
        const scaledHeight = BASE_TOKEN_SPRITE_SIZE * CHARACTER_SPRITE_SCALE
        spriteDrawHeight = scaledHeight
        spriteDrawWidth = scaledHeight * (sourceW / sourceH)
      } else if (environmentRect) {
        const scaledHeight = BASE_TOKEN_SPRITE_SIZE
        spriteDrawHeight = scaledHeight
        spriteDrawWidth = scaledHeight * (environmentRect.w / environmentRect.h)
      } else if (monsterRect) {
        const scaledHeight = BASE_TOKEN_SPRITE_SIZE
        spriteDrawHeight = scaledHeight
        spriteDrawWidth = scaledHeight * (monsterRect.w / monsterRect.h)
      }
      const spriteVisualRadius = Math.max(spriteDrawWidth, spriteDrawHeight) / 2
      const shouldRotateDefeated = isDefeatedEnemy

      const drawEntitySprite = (
        drawFn: () => void,
        fallbackOpacity = 1,
      ) => {
        ctx.save()
        ctx.translate(px, py)
        if (shouldRotateDefeated) {
          ctx.rotate(Math.PI / 2)
          ctx.globalAlpha = 0.72
        } else {
          ctx.globalAlpha = fallbackOpacity
        }
        drawFn()
        ctx.restore()
      }

      if (entity.id === selectedEntityId) {
        ctx.beginPath()
        ctx.arc(px, py, Math.max(radius + 4, spriteVisualRadius + 2), 0, Math.PI * 2)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Spell targeting ring
      if (targetingMode && (entity.type === 'enemy' || entity.type === 'npc')) {
        const pulse = Math.sin(performance.now() / 220) * 0.5 + 0.5
        const ringR = Math.max(radius + 6, spriteVisualRadius + 4)
        ctx.save()
        ctx.beginPath()
        ctx.arc(px, py, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(231, 76, 60, ${0.45 + pulse * 0.55})`
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      // Active turn: pulsing ring
      if (combat?.is_active && combat.current_turn === entity.id) {
        const isMyTurn = entity.id === myCharacterId
        const pulse = Math.sin(performance.now() / 300) * 0.5 + 0.5
        const ringR = Math.max(radius + 5, spriteVisualRadius + 3)
        ctx.save()
        // Outer glow
        ctx.beginPath()
        ctx.arc(px, py, ringR + 4, 0, Math.PI * 2)
        ctx.strokeStyle = isMyTurn
          ? `rgba(228, 168, 83, ${0.25 + pulse * 0.45})`
          : `rgba(231, 76, 60, ${0.2 + pulse * 0.35})`
        ctx.lineWidth = 7
        ctx.stroke()
        // Sharp inner ring
        ctx.beginPath()
        ctx.arc(px, py, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = isMyTurn ? '#e4a853' : '#e74c3c'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      let drewSprite = false
      if (characterCell && characterSheetUrl && characterSheetImage && characterSheetImage !== 'loading') {
        const sourceW = characterSheetImage.naturalWidth / CHARACTER_SPRITESHEET_COLUMNS
        const sourceH = characterSheetImage.naturalHeight / CHARACTER_SPRITESHEET_ROWS
        const sourceX = characterCell.col * sourceW
        const sourceY = characterCell.row * sourceH
        ctx.imageSmoothingEnabled = false
        drawEntitySprite(() => {
          ctx.drawImage(
            characterSheetImage,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            -spriteDrawWidth / 2,
            -spriteDrawHeight / 2,
            spriteDrawWidth,
            spriteDrawHeight,
          )
        })
        drewSprite = true
      } else if (characterCell && characterSheetUrl && !characterSheetImage) {
        characterSheetCacheRef.current.set(characterSheetUrl, 'loading')
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          characterSheetCacheRef.current.set(characterSheetUrl, img)
        }
        img.onerror = () => {
          characterSheetCacheRef.current.set(characterSheetUrl, null)
        }
        img.src = characterSheetUrl
      } else if (environmentRect && environmentSheetImage && environmentSheetImage !== 'loading') {
        ctx.imageSmoothingEnabled = false
        drawEntitySprite(() => {
          ctx.drawImage(
            environmentSheetImage,
            environmentRect.x,
            environmentRect.y,
            environmentRect.w,
            environmentRect.h,
            -spriteDrawWidth / 2,
            -spriteDrawHeight / 2,
            spriteDrawWidth,
            spriteDrawHeight,
          )
        })
        drewSprite = true
      } else if (environmentRect && environmentSheetImage === undefined) {
        environmentSheetCacheRef.current.set(ENVIRONMENT_SPRITESHEET_URL, 'loading')
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          environmentSheetCacheRef.current.set(ENVIRONMENT_SPRITESHEET_URL, img)
        }
        img.onerror = () => {
          environmentSheetCacheRef.current.set(ENVIRONMENT_SPRITESHEET_URL, null)
        }
        img.src = ENVIRONMENT_SPRITESHEET_URL
      } else if (monsterRect && monsterSheetImage && monsterSheetImage !== 'loading') {
        ctx.imageSmoothingEnabled = false
        drawEntitySprite(() => {
          ctx.drawImage(
            monsterSheetImage,
            monsterRect.x,
            monsterRect.y,
            monsterRect.w,
            monsterRect.h,
            -spriteDrawWidth / 2,
            -spriteDrawHeight / 2,
            spriteDrawWidth,
            spriteDrawHeight,
          )
        })
        drewSprite = true
      } else if (monsterRect && monsterSheetImage === undefined) {
        monsterSheetCacheRef.current.set(MONSTER_SPRITESHEET_URL, 'loading')
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          monsterSheetCacheRef.current.set(MONSTER_SPRITESHEET_URL, img)
        }
        img.onerror = () => {
          monsterSheetCacheRef.current.set(MONSTER_SPRITESHEET_URL, null)
        }
        img.src = MONSTER_SPRITESHEET_URL
      } else if (resolvedSpriteUrl) {
        const cached = spriteCacheRef.current.get(resolvedSpriteUrl)
        if (cached && cached !== 'loading') {
          ctx.imageSmoothingEnabled = false
          drawEntitySprite(() => {
            ctx.drawImage(cached, -spriteDrawWidth / 2, -spriteDrawHeight / 2, spriteDrawWidth, spriteDrawHeight)
          })
          drewSprite = true
        } else if (!cached) {
          spriteCacheRef.current.set(resolvedSpriteUrl, 'loading')
          const img = new Image()
          img.decoding = 'async'
          img.onload = () => {
            spriteCacheRef.current.set(resolvedSpriteUrl, img)
          }
          img.onerror = () => {
            spriteCacheRef.current.set(resolvedSpriteUrl, null)
          }
          img.src = resolvedSpriteUrl
        }
      }

      if (!drewSprite) {
        drawEntitySprite(() => {
          ctx.beginPath()
          ctx.arc(0, 0, radius, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'
          ctx.lineWidth = 1.5
          ctx.stroke()

          ctx.fillStyle = '#fff'
          ctx.font = `bold ${Math.max(9, 11 * interaction.zoom) / interaction.zoom}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(entity.name.charAt(0).toUpperCase(), 0, 0)
        })
      }

      // Floating HP bar + condition badges
      if (entity.type !== 'object') {
        const hpEntry = combat?.initiative_order.find(e => e.id === entity.id)
        const char = characters[entity.id]
        const hp = char?.hp ?? hpEntry?.hp ?? null
        const maxHp = char?.max_hp ?? hpEntry?.max_hp ?? null
        const topOfToken = py - (drewSprite ? spriteVisualRadius : radius)

        if (hp !== null && maxHp !== null && maxHp > 0) {
          const barW = 28
          const barH = 4
          const barX = px - barW / 2
          const barY = topOfToken - 8
          const pct = Math.max(0, Math.min(1, hp / maxHp))
          const barColor = pct > 0.6 ? '#2ecc71' : pct > 0.3 ? '#f39c12' : '#e74c3c'
          ctx.save()
          ctx.fillStyle = 'rgba(0,0,0,0.65)'
          ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2)
          ctx.fillStyle = '#111'
          ctx.fillRect(barX, barY, barW, barH)
          ctx.fillStyle = barColor
          ctx.fillRect(barX, barY, Math.max(0, barW * pct), barH)
          ctx.restore()
        }

        // Condition badges — row above the HP bar
        const conditions = char?.conditions ?? []
        if (conditions.length > 0) {
          const badgeW = 19
          const badgeH = 7
          const gap = 2
          const visibleConds = conditions.slice(0, 5)
          const rowW = visibleConds.length * badgeW + (visibleConds.length - 1) * gap
          const rowX = px - rowW / 2
          const rowY = topOfToken - 18
          ctx.save()
          ctx.font = 'bold 5px sans-serif'
          ctx.textBaseline = 'middle'
          visibleConds.forEach((cond, i) => {
            const info = CONDITION_INFO[cond.toLowerCase()] ?? { abbr: cond.slice(0, 3).toUpperCase(), color: '#95a5a6' }
            const bx = rowX + i * (badgeW + gap)
            ctx.fillStyle = info.color + 'cc'
            ctx.fillRect(bx, rowY, badgeW, badgeH)
            ctx.fillStyle = '#fff'
            ctx.textAlign = 'center'
            ctx.fillText(info.abbr, bx + badgeW / 2, rowY + badgeH / 2)
          })
          ctx.restore()
        }
      }

      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = `${Math.max(8, 10 * interaction.zoom) / interaction.zoom}px sans-serif`
      ctx.fillText(entity.name, px, py + (drewSprite ? spriteVisualRadius : radius) + 10)

      if (showAtlasLabels && entity.type === 'object') {
        const category = entity.prop_category?.trim() || 'uncategorized'
        const blocks = entity.blocks_movement === true ? 'block' : 'pass'
        const debugText = `${category} | ${blocks}`
        const debugY = py - (drewSprite ? spriteVisualRadius : radius) - 4

        ctx.save()
        ctx.font = `${Math.max(7, 8 * interaction.zoom) / interaction.zoom}px monospace`
        const textWidth = ctx.measureText(debugText).width
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(px - textWidth / 2 - 3, debugY - 8, textWidth + 6, 10)
        ctx.fillStyle = 'rgba(180, 232, 255, 0.96)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(debugText, px, debugY)
        ctx.restore()
      }
    }

    drawOverlays(ctx, map, combat, selectedEntityId, myCharacterId)

    // Floating damage / heal popups
    const nowMs = performance.now()
    dmgPopupsRef.current = dmgPopupsRef.current.filter(popup => {
      const t = (nowMs - popup.startTime) / popup.duration
      if (t >= 1) return false
      const floatY = popup.worldY - t * 30
      const alpha = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `bold 12px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.lineWidth = 3
      ctx.strokeText(popup.text, popup.worldX, floatY)
      ctx.fillStyle = popup.color
      ctx.fillText(popup.text, popup.worldX, floatY)
      ctx.restore()
      return true
    })

    ctx.restore()
  }, [map, combat, characters, interaction.offsetX, interaction.offsetY, interaction.zoom, selectedEntityId, myCharacterId, imageUrl, imageOpacity, resolveCharacterForEntity, showAtlasLabels, getMonsterFrameKeyForEnemy, targetingMode])

  useEffect(() => {
    let frameId: number
    const loop = () => {
      draw()
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [draw])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handler = (e: WheelEvent) => interaction.handleWheel(e)
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, [interaction.handleWheel])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (interaction.isPanning || !map) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { gx, gy } = interaction.screenToGrid(e.clientX, e.clientY, rect)

    const clickedEntity = map.entities.find(ent => ent.x === gx && ent.y === gy)
    if (clickedEntity) {
      onEntityClick?.(clickedEntity.id)
      return
    }

    onTileClick?.(gx, gy)
  }, [map, interaction, onTileClick, onEntityClick])

  const handleRecenter = useCallback(() => {
    if (!map) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    interaction.fitToView(map.width, map.height, rect.width, rect.height)
  }, [map, interaction])

  if (!map) {
    return (
      <div className="map-placeholder">
        <p>No map loaded. The DM will generate one when the adventure begins.</p>
      </div>
    )
  }

  const sourceLabel = (() => {
    const src = mapMetadata?.map_source
    if (src === 'library') return 'Library Map'
    if (src === 'generated') return 'AI Generated'
    if (src === 'manual') return 'Manual Map'
    if (src) return src
    return 'Map'
  })()

  const statusLabel = mapMetadata?.cache_hit ? 'Cached' : 'Fresh'
  const environmentLabel = mapMetadata?.environment || 'unknown'
  const attributionRequired = !!mapMetadata?.attribution_required
  const attributionLine = attributionRequired
    ? (mapMetadata?.attribution_text?.trim() || `Map art by ${mapMetadata?.author || 'Unknown source'}`)
    : ''
  const hasAttributionPanel = !!(mapMetadata?.author || mapMetadata?.license_spdx || mapMetadata?.source_url || attributionLine)

  const environmentTilePalette = (() => {
    const byType = new Map<string, Set<string>>()
    for (const tile of map.tiles) {
      const spriteKey = typeof tile.sprite === 'string' ? tile.sprite.trim() : ''
      if (!spriteKey) {
        continue
      }

      const normalizedLabel = resolveEnvironmentLabel(spriteKey)
      if (!normalizedLabel) {
        continue
      }

      const variant = typeof tile.variant === 'string' ? tile.variant.trim().toLowerCase() : ''
      const effectiveLabel = variant ? `${normalizedLabel}_${variant}` : normalizedLabel
      const bucket = byType.get(tile.type) ?? new Set<string>()
      bucket.add(effectiveLabel)
      byType.set(tile.type, bucket)
    }

    const entries = Array.from(byType.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tileType, labels]) => ({
        tileType,
        labels: Array.from(labels).sort((a, b) => a.localeCompare(b)),
      }))
    return entries
  })()

  return (
    <div
      ref={containerRef}
      className={`map-container${targetingMode ? ' targeting-mode' : ''}`}
      onPointerDown={interaction.handlePointerDown}
      onPointerMove={interaction.handlePointerMove}
      onPointerUp={interaction.handlePointerUp}
    >
      <div className="map-metadata-badge" aria-live="polite">
        <div className="map-badge-main">
          <span className="map-badge-source">{sourceLabel}</span>
          <span className="map-badge-sep">•</span>
          <span className="map-badge-status">{statusLabel}</span>
          <span className="map-badge-sep">•</span>
          <span className="map-badge-env">{environmentLabel}</span>
        </div>
        {attributionLine && (
          <div className="map-badge-attribution">{attributionLine}</div>
        )}
      </div>
      <button
        type="button"
        className="map-recenter-btn"
        onClick={handleRecenter}
        title="Recenter and fit map"
      >
        Recenter map
      </button>
      <button
        type="button"
        className={`map-debug-toggle-btn ${showAtlasLabels ? 'is-active' : ''}`}
        onClick={() => setShowAtlasLabels((v) => !v)}
        title="Toggle atlas tile labels for QA"
      >
        {showAtlasLabels ? 'Hide atlas labels' : 'Show atlas labels'}
      </button>
      <button
        type="button"
        className={`map-palette-toggle-btn ${showPaletteDebug ? 'is-active' : ''}`}
        onClick={() => setShowPaletteDebug((v) => !v)}
        title="Toggle active environment tile palette debug"
      >
        {showPaletteDebug ? 'Hide tile palette debug' : 'Show tile palette debug'}
      </button>
      {showPaletteDebug && (
        <div className="map-palette-debug-panel" aria-live="polite">
          <div className="map-palette-debug-title">Tile Palette Debug</div>
          <div className="map-palette-debug-meta">Environment: {environmentLabel}</div>
          <div className="map-palette-debug-meta">Source: {sourceLabel} ({statusLabel})</div>
          {environmentTilePalette.length === 0 ? (
            <div className="map-palette-debug-empty">No tile sprite labels detected on current map.</div>
          ) : (
            environmentTilePalette.map((entry) => (
              <div className="map-palette-debug-group" key={entry.tileType}>
                <div className="map-palette-debug-group-title">{entry.tileType} ({entry.labels.length})</div>
                <div className="map-palette-debug-list">{entry.labels.join(', ')}</div>
              </div>
            ))
          )}
        </div>
      )}
      {hasAttributionPanel && (
        <div className="map-attribution-panel">
          {mapMetadata?.author && <div>Art: {mapMetadata.author}</div>}
          {mapMetadata?.license_spdx && <div>License: {mapMetadata.license_spdx}</div>}
          {mapMetadata?.source_url && (
            <a
              className="map-attribution-link"
              href={mapMetadata.source_url}
              target="_blank"
              rel="noreferrer"
            >
              Source
            </a>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onClick={handleClick}
      />
    </div>
  )
}
