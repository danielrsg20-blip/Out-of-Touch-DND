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
  floor: 'env:stone corridor',
  wall: 'env:dark stone',
  door: 'env:arched door',
  water: 'env:deep water',
  pit: 'env:fire pit',
  pillar: 'env:cracked pillar',
  stairs_up: 'env:stone corridor',
  stairs_down: 'env:stone corridor',
  chest: 'env:treasure chest',
  rubble: 'env:stone rubble',
}

const ENTITY_COLORS: Record<string, string> = {
  pc: '#3498db',
  npc: '#2ecc71',
  enemy: '#e74c3c',
  object: '#e4a853',
}

interface MapCanvasProps {
  onTileClick?: (gx: number, gy: number) => void
  onEntityClick?: (entityId: string) => void
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

export default function MapCanvas({ onTileClick, onEntityClick }: MapCanvasProps) {
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

      const px = entity.x * TILE_SIZE + TILE_SIZE / 2
      const py = entity.y * TILE_SIZE + TILE_SIZE / 2
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

    ctx.restore()
  }, [map, combat, characters, interaction.offsetX, interaction.offsetY, interaction.zoom, selectedEntityId, myCharacterId, imageUrl, imageOpacity, resolveCharacterForEntity, showAtlasLabels, getMonsterFrameKeyForEnemy])

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
      className="map-container"
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
