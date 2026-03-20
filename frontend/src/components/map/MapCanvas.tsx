import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useMapInteraction } from '../../hooks/useMapInteraction'
import { drawOverlays } from './OverlayLayer'
import type { FrontendTraversalGrid, GridOverlayMode, MapCorrectionTool, MapData } from '../../types'
import { renderOverlayLayers } from '../../lib/VectorOverlayRenderer'
import { renderGridOverlay } from '../../lib/GridOverlayRenderer'
import { useOverlayStore } from '../../stores/overlayStore'
import { useMapEditorStore } from '../../stores/mapEditorStore'
import { callBackendApi } from '../../lib/backendApi'
import { resolveSpriteUrl } from '../../data/spriteManifest'
import { MAP_MODE_AI, mergeBattlemapAssetIntoMap, resolveMapMode } from '../../lib/battlemapState'
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
import { buildVectorBaseOverlayFromMap } from '../../lib/mapToVectorOverlay'
import { createMapGridTransform } from '../../lib/mapGridTransform'
import './MapCanvas.css'

const CHARACTER_SPRITE_SCALE = 1.5
const ANIM_FRAME_MS = 350  // ms per frame (~3fps idle animation)

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

const CORRECTION_TOOL_LABELS: Record<MapCorrectionTool, string> = {
  inspect: 'Inspect',
  paint_blocked: 'Paint blocked',
  paint_walkable: 'Paint walkable',
  paint_cost: 'Paint cost',
  mark_door: 'Mark door',
}

const SCENE_LOCATIONS = new Set(['forest', 'swamp', 'dungeon', 'city_alley', 'tavern', 'ruins', 'mountain', 'coastal'])
const SCENE_BIOMES = new Set(['temperate', 'tropical', 'arctic', 'underground', 'urban', 'magical'])
const ENCOUNTER_TYPES = new Set(['ambush', 'siege', 'chase', 'investigation', 'diplomacy', 'exploration'])

function sanitizeLocation(value: unknown): string {
  const location = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return SCENE_LOCATIONS.has(location) ? location : 'forest'
}

function inferBiome(location: string): string {
  if (location === 'dungeon' || location === 'ruins') return 'underground'
  if (location === 'city_alley' || location === 'tavern') return 'urban'
  if (location === 'coastal') return 'temperate'
  if (location === 'mountain') return 'arctic'
  return 'temperate'
}

function sanitizeEncounterType(value: unknown): string {
  const encounterType = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ENCOUNTER_TYPES.has(encounterType) ? encounterType : 'exploration'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => typeof v === 'string' && v.trim().length > 0)))
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

export default function MapCanvas({ onTileClick, onEntityClick, targetingMode = false }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fittedMapKeyRef = useRef<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const imageUrlRef = useRef<string | null>(null)
  const characterSheetCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const monsterSheetCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const spriteCacheRef = useRef<Map<string, HTMLImageElement | 'loading' | null>>(new Map())
  const enemyMonsterVariantByEntityIdRef = useRef<Map<string, string>>(new Map())
  const enemyFrameKeysRef = useRef<Map<string, string[]>>(new Map())
  const artifactImageRef = useRef<{ collisionMask: HTMLImageElement | null; costMap: HTMLImageElement | null }>({
    collisionMask: null,
    costMap: null,
  })
  const hoverCellRef = useRef<{ tx: number; ty: number } | null>(null)
  const lastPaintCellKeyRef = useRef<string | null>(null)
  const isPaintingRef = useRef(false)

  const tokenAnimationsRef = useRef<Map<string, TokenAnim>>(new Map())
  const prevEntityPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const dmgPopupsRef = useRef<DamagePopup[]>([])
  const prevHpRef = useRef<Map<string, number>>(new Map())
  const map = useGameStore(s => s.map)
  const setMap = useGameStore(s => s.setMap)
  const addNarrative = useGameStore(s => s.addNarrative)
  const combat = useGameStore(s => s.combat)
  const characters = useGameStore(s => s.characters)
  const selectedEntityId = useGameStore(s => s.selectedEntityId)
  const syncState = useGameStore(s => s.syncState)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)
  const roomCode = useSessionStore(s => s.roomCode)
  const getSession = useSessionStore(s => s.getSession)
  const interaction = useMapInteraction()
  const [showVectorLabels, setShowVectorLabels] = useState(true)
  const [showDmOnlyLabels, setShowDmOnlyLabels] = useState(false)
  const [scaleLabelsWithZoom, setScaleLabelsWithZoom] = useState(true)
  const [transformCopyStatus, setTransformCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [editorGridCellSizeWorld, setEditorGridCellSizeWorld] = useState(5)
  const [editorGridWidthCells, setEditorGridWidthCells] = useState(0)
  const [editorGridHeightCells, setEditorGridHeightCells] = useState(0)
  const overlay = useOverlayStore((s) => s.overlay)
  const traversalGrid = useOverlayStore((s) => s.traversalGrid)
  const gridOverlayConfig = useOverlayStore((s) => s.gridOverlayConfig)
  const setGridOverlayConfig = useOverlayStore((s) => s.setGridOverlayConfig)
  const correctionModeEnabled = useMapEditorStore((s) => s.correctionModeEnabled)
  const setCorrectionModeEnabled = useMapEditorStore((s) => s.setCorrectionModeEnabled)
  const activeTool = useMapEditorStore((s) => s.activeTool)
  const cycleTool = useMapEditorStore((s) => s.cycleTool)
  const brushSizeCells = useMapEditorStore((s) => s.brushSizeCells)
  const cycleBrushSize = useMapEditorStore((s) => s.cycleBrushSize)
  const brushMovementCost = useMapEditorStore((s) => s.brushMovementCost)
  const setBrushMovementCost = useMapEditorStore((s) => s.setBrushMovementCost)
  const hasUnsavedChanges = useMapEditorStore((s) => s.hasUnsavedChanges)
  const markDirty = useMapEditorStore((s) => s.markDirty)
  const clearDirty = useMapEditorStore((s) => s.clearDirty)
  const previewBusy = useMapEditorStore((s) => s.previewBusy)
  const setPreviewBusy = useMapEditorStore((s) => s.setPreviewBusy)
  const applyBusy = useMapEditorStore((s) => s.applyBusy)
  const setApplyBusy = useMapEditorStore((s) => s.setApplyBusy)
  const showCollisionMaskLayer = useMapEditorStore((s) => s.showCollisionMaskLayer)
  const showCostMapLayer = useMapEditorStore((s) => s.showCostMapLayer)
  const toggleCollisionMaskLayer = useMapEditorStore((s) => s.toggleCollisionMaskLayer)
  const toggleCostMapLayer = useMapEditorStore((s) => s.toggleCostMapLayer)
  const artifactLayerOpacity = useMapEditorStore((s) => s.artifactLayerOpacity)
  const setArtifactLayerOpacity = useMapEditorStore((s) => s.setArtifactLayerOpacity)
  const setPreviewArtifacts = useMapEditorStore((s) => s.setPreviewArtifacts)
  const previewArtifacts = useMapEditorStore((s) => s.previewArtifacts)

  const runtimeOverlay = useMemo(() => {
    if (!map) {
      return overlay
    }
    return buildVectorBaseOverlayFromMap(
      map,
      {
        showLabels: showVectorLabels,
        showDmOnlyLabels,
        scaleLabelsWithZoom,
      },
      overlay,
    )
  }, [map, overlay, showVectorLabels, showDmOnlyLabels, scaleLabelsWithZoom])

  useEffect(() => {
    if (!correctionModeEnabled || !map) {
      return
    }

    const inferredWidth = Math.max(1, Math.round(Number(traversalGrid?.width_cells ?? map.width ?? 1)))
    const inferredHeight = Math.max(1, Math.round(Number(traversalGrid?.height_cells ?? map.height ?? 1)))
    const inferredCellSize = Math.max(0.25, Number(traversalGrid?.cell_size_world ?? map.traversal_grid?.cell_size_world ?? 5))

    setEditorGridWidthCells(inferredWidth)
    setEditorGridHeightCells(inferredHeight)
    setEditorGridCellSizeWorld(Number(inferredCellSize.toFixed(3)))
  }, [correctionModeEnabled, map, traversalGrid])

  const myCharacterId = useMemo(() => {
    const fromPlayer = players.find((p) => p.id === playerId)?.character_id
    if (fromPlayer) {
      return fromPlayer
    }
    const fallback = playerId ? `pc_${playerId}` : null
    return fallback && characters[fallback] ? fallback : null
  }, [players, playerId, characters])

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
  const mapMode = resolveMapMode(map)
  const mapGridTransform = useMemo(() => createMapGridTransform(map), [map])
  const imageUrl = mapMetadata?.image_url
  const imageOpacity = Math.min(1, Math.max(0, mapMetadata?.image_opacity ?? 1))
  const renderCellWidth = mapGridTransform.cellWidthPx
  const renderCellHeight = mapGridTransform.cellHeightPx
  const tokenBaseSizePx = Math.max(12, Math.min(renderCellWidth, renderCellHeight) * 0.86)

  const applyTraversalGridToState = useCallback((nextGrid: FrontendTraversalGrid) => {
    useOverlayStore.getState().setTraversalGrid(nextGrid)
    if (!map) {
      return
    }
    const nextMap = {
      ...map,
      traversal_grid: nextGrid,
    } as MapData
    setMap(nextMap)
  }, [map, setMap])

  const applyCorrectionBrushAtCell = useCallback((centerX: number, centerY: number) => {
    if (!correctionModeEnabled || activeTool === 'inspect' || !map || !traversalGrid) {
      return
    }

    const width = Math.max(1, Number(traversalGrid.width_cells))
    const height = Math.max(1, Number(traversalGrid.height_cells))
    const tx = clamp(Math.floor(centerX), 0, width - 1)
    const ty = clamp(Math.floor(centerY), 0, height - 1)
    const paintKey = `${tx},${ty},${activeTool},${brushSizeCells},${brushMovementCost}`
    if (lastPaintCellKeyRef.current === paintKey) {
      return
    }
    lastPaintCellKeyRef.current = paintKey

    const nextCells = traversalGrid.cells.map((cell) => ({
      ...cell,
      movement_blocking_tags: Array.isArray(cell.movement_blocking_tags) ? [...cell.movement_blocking_tags] : [],
      tags: Array.isArray(cell.tags) ? [...cell.tags] : [],
    }))
    const cellIndexByCoord = new Map<string, number>()
    nextCells.forEach((cell, index) => {
      cellIndexByCoord.set(`${cell.x},${cell.y}`, index)
    })

    const brushSpan = Math.max(1, Math.round(brushSizeCells))
    const startX = tx - Math.floor(brushSpan / 2)
    const startY = ty - Math.floor(brushSpan / 2)

    for (let oy = 0; oy < brushSpan; oy += 1) {
      for (let ox = 0; ox < brushSpan; ox += 1) {
        const cx = startX + ox
        const cy = startY + oy
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) {
          continue
        }
        const idx = cellIndexByCoord.get(`${cx},${cy}`)
        if (idx === undefined) {
          continue
        }
        const cell = nextCells[idx]

        if (activeTool === 'paint_blocked') {
          cell.traversable = false
          cell.movement_cost = Math.max(2, Number(cell.movement_cost) || 2)
          cell.movement_blocking_tags = uniqueStrings(['blocked', 'wall', ...cell.movement_blocking_tags])
          cell.tags = uniqueStrings(['blocked', 'wall', ...cell.tags])
        } else if (activeTool === 'paint_walkable') {
          cell.traversable = true
          cell.movement_cost = 1
          cell.movement_blocking_tags = []
          cell.tags = uniqueStrings(cell.tags.filter((tag) => tag !== 'blocked' && tag !== 'wall').concat(['open_ground']))
        } else if (activeTool === 'paint_cost') {
          const nextCost = clamp(Number(brushMovementCost) || 1, 0.5, 6)
          cell.traversable = true
          cell.movement_cost = nextCost
          cell.movement_blocking_tags = []
          const filteredTags = cell.tags.filter((tag) => tag !== 'blocked' && tag !== 'wall' && tag !== 'open_ground' && tag !== 'difficult')
          const terrainTag = nextCost > 1.25 ? 'difficult' : 'open_ground'
          cell.tags = uniqueStrings([terrainTag, ...filteredTags])
        } else if (activeTool === 'mark_door') {
          cell.traversable = true
          cell.movement_cost = Math.max(1, Number(cell.movement_cost) || 1)
          cell.movement_blocking_tags = []
          const filteredTags = cell.tags.filter((tag) => tag !== 'blocked' && tag !== 'wall')
          cell.tags = uniqueStrings(['door', ...filteredTags])
        }
      }
    }

    applyTraversalGridToState({
      ...traversalGrid,
      cells: nextCells,
    })
    markDirty()
  }, [activeTool, applyTraversalGridToState, brushMovementCost, brushSizeCells, correctionModeEnabled, map, markDirty, traversalGrid])

  const getBrushTraversalCellsAtTraversalCell = useCallback((centerX: number, centerY: number): Array<{ tx: number; ty: number }> => {
    if (!traversalGrid) {
      return []
    }

    const width = Math.max(1, Number(traversalGrid.width_cells))
    const height = Math.max(1, Number(traversalGrid.height_cells))
    const tx = clamp(Math.floor(centerX), 0, width - 1)
    const ty = clamp(Math.floor(centerY), 0, height - 1)

    const brushSpan = Math.max(1, Math.round(brushSizeCells))
    const startX = tx - Math.floor(brushSpan / 2)
    const startY = ty - Math.floor(brushSpan / 2)

    const out: Array<{ tx: number; ty: number }> = []
    for (let oy = 0; oy < brushSpan; oy += 1) {
      for (let ox = 0; ox < brushSpan; ox += 1) {
        const cx = startX + ox
        const cy = startY + oy
        if (cx < 0 || cy < 0 || cx >= width || cy >= height) {
          continue
        }
        out.push({ tx: cx, ty: cy })
      }
    }
    return out
  }, [brushSizeCells, traversalGrid])

  const traversalCellAtPointer = useCallback((clientX: number, clientY: number): { tx: number; ty: number } | null => {
    if (!canvasRef.current || !map || !traversalGrid) {
      return null
    }

    const width = Math.max(1, Number(traversalGrid.width_cells))
    const height = Math.max(1, Number(traversalGrid.height_cells))
    const rect = canvasRef.current.getBoundingClientRect()
    const { gx, gy } = interaction.screenToGrid(
      clientX,
      clientY,
      rect,
      {
        cellWidthPx: mapGridTransform.mapWidthPx / width,
        cellHeightPx: mapGridTransform.mapHeightPx / height,
      },
    )

    if (gx < 0 || gy < 0 || gx >= width || gy >= height) {
      return null
    }

    return { tx: gx, ty: gy }
  }, [interaction, map, mapGridTransform.mapHeightPx, mapGridTransform.mapWidthPx, traversalGrid])

  const paintAtPointerPosition = useCallback((clientX: number, clientY: number) => {
    const cell = traversalCellAtPointer(clientX, clientY)
    if (!cell) {
      return
    }
    applyCorrectionBrushAtCell(cell.tx, cell.ty)
  }, [applyCorrectionBrushAtCell, traversalCellAtPointer])

  const updateHoverCellFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!correctionModeEnabled) {
      hoverCellRef.current = null
      return null
    }
    const cell = traversalCellAtPointer(clientX, clientY)
    if (!cell) {
      hoverCellRef.current = null
      return null
    }
    hoverCellRef.current = cell
    return hoverCellRef.current
  }, [correctionModeEnabled, traversalCellAtPointer])

  const handleFetchPreviewArtifacts = useCallback(async () => {
    if (!map || !map.metadata?.image_url || !roomCode) {
      addNarrative('system', 'Cannot preview traversal artifacts without a map image and active room.')
      return
    }

    const location = sanitizeLocation(map.metadata.environment)
    const inferredBiome = inferBiome(location)
    const mapBiome = typeof map.metadata.environment === 'string' ? map.metadata.environment.trim().toLowerCase() : ''
    const biome = SCENE_BIOMES.has(mapBiome) ? mapBiome : inferredBiome
    const previewCellSizeWorld = Number.isFinite(editorGridCellSizeWorld)
      ? Math.max(0.25, Number(editorGridCellSizeWorld.toFixed(3)))
      : Math.max(0.25, Number(traversalGrid?.cell_size_world ?? map.traversal_grid?.cell_size_world ?? 5))
    const preferredGridWidthCells = Number.isFinite(editorGridWidthCells)
      ? Math.max(1, Math.round(editorGridWidthCells))
      : Math.max(1, Math.round(Number(traversalGrid?.width_cells ?? map.width ?? 1)))
    const preferredGridHeightCells = Number.isFinite(editorGridHeightCells)
      ? Math.max(1, Math.round(editorGridHeightCells))
      : Math.max(1, Math.round(Number(traversalGrid?.height_cells ?? map.height ?? 1)))
    const widthFeet = Math.max(20, Math.round(preferredGridWidthCells * previewCellSizeWorld))
    const heightFeet = Math.max(20, Math.round(preferredGridHeightCells * previewCellSizeWorld))

    setPreviewBusy(true)
    try {
      const response = await callBackendApi('/api/tools/import_battlemap_preview', {
        method: 'POST',
        body: {
          image_url: map.metadata.image_url,
          quality_mode: 'final',
          include_preview_artifacts: true,
          scene_spec: {
            location,
            biome,
            encounter_type: sanitizeEncounterType(map.metadata.encounter_type),
            notable_features: Array.isArray(map.metadata.tactical_tags) ? map.metadata.tactical_tags.slice(0, 6) : [],
            mood_style: 'high-fantasy',
            map_width_feet: widthFeet,
            map_height_feet: heightFeet,
          },
          grid_settings: {
            cell_size_world: previewCellSizeWorld,
          },
          grid_width_cells: preferredGridWidthCells,
          grid_height_cells: preferredGridHeightCells,
        },
      })

      if (!response.ok) {
        const message = typeof response.data?.error === 'string'
          ? response.data.error
          : `Import preview failed (${response.status})`
        throw new Error(message)
      }

      const returnedGrid = response.data?.traversal_grid as FrontendTraversalGrid | undefined
      if (returnedGrid && Array.isArray(returnedGrid.cells) && returnedGrid.cells.length > 0) {
        applyTraversalGridToState(returnedGrid)
      }

      const diagnostics = response.data?.diagnostics as Record<string, unknown> | undefined
      const artifacts = diagnostics?.preview_artifacts as Record<string, unknown> | undefined
      setPreviewArtifacts({
        collision_mask_png_base64: typeof artifacts?.collision_mask_png_base64 === 'string' ? artifacts.collision_mask_png_base64 : undefined,
        cost_map_png_base64: typeof artifacts?.cost_map_png_base64 === 'string' ? artifacts.cost_map_png_base64 : undefined,
      })

      addNarrative('system', 'Loaded traversal preview artifacts for correction mode.')
      clearDirty()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh preview artifacts.'
      addNarrative('system', `Traversal preview failed: ${message}`)
    } finally {
      setPreviewBusy(false)
    }
  }, [addNarrative, applyTraversalGridToState, clearDirty, editorGridCellSizeWorld, editorGridHeightCells, editorGridWidthCells, map, roomCode, setPreviewArtifacts, setPreviewBusy, traversalGrid])

  const handleApplyCorrections = useCallback(async () => {
    if (!map || !traversalGrid || !roomCode) {
      addNarrative('system', 'Cannot apply corrections without an active room, map, and traversal grid.')
      return
    }

    const mapPatch = {
      ...map,
      traversal_grid: traversalGrid,
      metadata: {
        ...map.metadata,
        traversal_edited_locally: true,
        traversal_edited_at: new Date().toISOString(),
      },
    }

    setApplyBusy(true)
    try {
      const response = await callBackendApi('/api/session/mutate', {
        method: 'POST',
        body: {
          room_code: roomCode,
          map: mapPatch,
        },
      })

      if (!response.ok || response.data?.error) {
        const message = typeof response.data?.error === 'string'
          ? response.data.error
          : `Apply corrections failed (${response.status})`
        throw new Error(message)
      }

      const gameState = response.data?.game_state as Record<string, unknown> | undefined
      const updatedMap = (gameState?.map ?? mapPatch) as MapData
      setMap(updatedMap)

      const updatedTraversal = (updatedMap?.traversal_grid ?? traversalGrid) as FrontendTraversalGrid
      if (updatedTraversal?.cells?.length) {
        useOverlayStore.getState().setTraversalGrid(updatedTraversal)
      }

      clearDirty()
      addNarrative('system', 'Applied traversal corrections to runtime session state.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply traversal corrections.'
      addNarrative('system', `Apply corrections failed: ${message}`)
    } finally {
      setApplyBusy(false)
    }
  }, [addNarrative, clearDirty, map, roomCode, setApplyBusy, setMap, traversalGrid])

  useEffect(() => {
    const nextCollision = previewArtifacts.collisionMaskPngBase64?.trim()
    if (!nextCollision) {
      artifactImageRef.current.collisionMask = null
    } else {
      const img = new Image()
      img.decoding = 'async'
      img.src = `data:image/png;base64,${nextCollision}`
      img.onload = () => {
        artifactImageRef.current.collisionMask = img
      }
      img.onerror = () => {
        artifactImageRef.current.collisionMask = null
      }
    }

    const nextCost = previewArtifacts.costMapPngBase64?.trim()
    if (!nextCost) {
      artifactImageRef.current.costMap = null
    } else {
      const img = new Image()
      img.decoding = 'async'
      img.src = `data:image/png;base64,${nextCost}`
      img.onload = () => {
        artifactImageRef.current.costMap = img
      }
      img.onerror = () => {
        artifactImageRef.current.costMap = null
      }
    }
  }, [previewArtifacts.collisionMaskPngBase64, previewArtifacts.costMapPngBase64])

  useEffect(() => {
    if (!map) {
      return
    }
    const traversal = map.traversal_grid as any
    const widthCells = Number(traversal?.width_cells ?? 0)
    const heightCells = Number(traversal?.height_cells ?? 0)
    const cellSizeWorld = Number(traversal?.cell_size_world ?? 0)
    const fallbackPlayerTokenId = playerId ? `pc_${playerId}` : null
    const localTokenId = myCharacterId ?? fallbackPlayerTokenId
    const localTokenEntity = localTokenId
      ? map.entities.find((entity) => entity.id === localTokenId)
      : null
    console.info('[MapCanvas] map diagnostics', {
      mapMode,
      active_renderer: 'ai_battlemap_image',
      active_traversal_provider: 'ai_traversal_grid',
      image_url: mapMetadata?.image_url ?? null,
      image_width_px: mapMetadata?.image_width_px ?? null,
      image_height_px: mapMetadata?.image_height_px ?? null,
      map_width_tiles: map.width,
      map_height_tiles: map.height,
      traversal_width_cells: Number.isFinite(widthCells) ? widthCells : null,
      traversal_height_cells: Number.isFinite(heightCells) ? heightCells : null,
      traversal_cell_size_world: Number.isFinite(cellSizeWorld) ? cellSizeWorld : null,
      render_cell_width_px: renderCellWidth,
      render_cell_height_px: renderCellHeight,
      token_base_size_px: tokenBaseSizePx,
      local_token_id: localTokenId,
      local_token_present: Boolean(localTokenEntity),
      local_token_position: localTokenEntity ? { x: localTokenEntity.x, y: localTokenEntity.y } : null,
      local_token_visible: localTokenEntity
        ? (Array.isArray(map.visible) ? map.visible.some((v) => v.x === localTokenEntity.x && v.y === localTokenEntity.y) : null)
        : null,
    })
  }, [map, mapMetadata?.image_url, mapMetadata?.image_width_px, mapMetadata?.image_height_px, mapMode, renderCellWidth, renderCellHeight, tokenBaseSizePx, myCharacterId, playerId])

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
    if (map || !roomCode) {
      return
    }

    let cancelled = false

    const recoverMissingMap = async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (cancelled || useGameStore.getState().map) {
          return
        }

        try {
          const payload = await getSession(roomCode)
          const stateToSync = (payload?.game_state as Record<string, unknown> | undefined) ?? payload
          if (stateToSync && typeof stateToSync === 'object') {
            syncState(stateToSync as any)
          }

          const currentMap = useGameStore.getState().map
          if (!currentMap && payload?.battlemap_asset) {
            const merged = mergeBattlemapAssetIntoMap(currentMap, payload.battlemap_asset)
            if (merged) {
              useGameStore.getState().setMap(merged)
            }
          }
        } catch {
          // Keep retrying briefly while session state catches up.
        }

        if (useGameStore.getState().map) {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 1500))
      }
    }

    void recoverMissingMap()

    return () => {
      cancelled = true
    }
  }, [map, roomCode, getSession, syncState])

  useEffect(() => {
    void loadMonsterSpriteLookup().catch(() => {
      // Keep fallback token rendering if the optional monster atlas fails to load.
    })
  }, [])

  useEffect(() => {
    if (!map) {
      enemyMonsterVariantByEntityIdRef.current.clear()
      enemyFrameKeysRef.current.clear()
      return
    }

    const aliveEnemyIds = new Set(
      map.entities
        .filter((entity) => entity.type === 'enemy')
        .map((entity) => entity.id),
    )

    const cache = enemyMonsterVariantByEntityIdRef.current
    const frameCache = enemyFrameKeysRef.current
    for (const existingId of Array.from(cache.keys())) {
      if (!aliveEnemyIds.has(existingId)) {
        cache.delete(existingId)
        frameCache.delete(existingId)
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
          const center = mapGridTransform.cellToPixelCenter(entity.x, entity.y)
          popups.push({
            id: ++dmgPopupCounter,
            worldX: center.x + (Math.random() - 0.5) * 8,
            worldY: center.y,
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
  }, [characters, combat, map, mapGridTransform])

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
    const frameCache = enemyFrameKeysRef.current

    const explicitKey = explicitSpriteKey?.trim()
    if (explicitKey && explicitKey.toLowerCase() !== 'default') {
      const explicitRect = resolveMonsterSpriteRect(explicitKey)
      if (explicitRect) {
        variantCache.set(entityId, explicitRect.frameKey)
        const allFrames = getMonsterFrameKeysForBaseLabel(explicitRect.baseLabel)
        frameCache.set(entityId, allFrames.length > 0 ? allFrames : [explicitRect.frameKey])
        return explicitRect.frameKey
      }

      // If the override references a base label, pick the first variant deterministically.
      const explicitVariants = getMonsterFrameKeysForBaseLabel(explicitKey)
      if (explicitVariants.length > 0) {
        const selectedFrame = explicitVariants[0]
        variantCache.set(entityId, selectedFrame)
        frameCache.set(entityId, explicitVariants)
        return selectedFrame
      }
    }

    const existing = variantCache.get(entityId)
    if (existing && resolveMonsterSpriteRect(existing)) {
      if (!frameCache.has(entityId)) {
        const existingRect = resolveMonsterSpriteRect(existing)!
        const allFrames = getMonsterFrameKeysForBaseLabel(existingRect.baseLabel)
        frameCache.set(entityId, allFrames.length > 0 ? allFrames : [existing])
      }
      return existing
    }

    const candidates = getMonsterSpriteCandidates(enemyName)
    for (const candidate of candidates) {
      const directRect = resolveMonsterSpriteRect(candidate)
      if (directRect) {
        variantCache.set(entityId, directRect.frameKey)
        const allFrames = getMonsterFrameKeysForBaseLabel(directRect.baseLabel)
        frameCache.set(entityId, allFrames.length > 0 ? allFrames : [directRect.frameKey])
        return directRect.frameKey
      }

      const frameKeys = getMonsterFrameKeysForBaseLabel(candidate)
      if (frameKeys.length > 0) {
        const randomIndex = Math.floor(Math.random() * frameKeys.length)
        const selectedFrame = frameKeys[randomIndex]
        variantCache.set(entityId, selectedFrame)
        frameCache.set(entityId, frameKeys)
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

    interaction.fitToView(
      map.width,
      map.height,
      rect.width,
      rect.height,
      { cellWidthPx: mapGridTransform.cellWidthPx, cellHeightPx: mapGridTransform.cellHeightPx },
    )
    fittedMapKeyRef.current = mapKey
  }, [map, interaction, mapGridTransform.cellWidthPx, mapGridTransform.cellHeightPx])

  useEffect(() => {
    if (!map) return
    const container = containerRef.current
    if (!container) return

    const fit = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      interaction.fitToView(
        map.width,
        map.height,
        rect.width,
        rect.height,
        { cellWidthPx: mapGridTransform.cellWidthPx, cellHeightPx: mapGridTransform.cellHeightPx },
      )
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
  }, [map?.width, map?.height, interaction, mapGridTransform.cellWidthPx, mapGridTransform.cellHeightPx])

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
    if (mapMode === MAP_MODE_AI && loadedImage && imageUrlRef.current === imageUrl) {
      ctx.save()
      ctx.globalAlpha = imageOpacity
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(loadedImage, 0, 0, mapGridTransform.mapWidthPx, mapGridTransform.mapHeightPx)
      ctx.restore()
    }

    if (correctionModeEnabled) {
      const collisionMaskImage = artifactImageRef.current.collisionMask
      if (showCollisionMaskLayer && collisionMaskImage) {
        ctx.save()
        ctx.globalAlpha = clamp(artifactLayerOpacity, 0, 1)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(collisionMaskImage, 0, 0, mapGridTransform.mapWidthPx, mapGridTransform.mapHeightPx)
        ctx.restore()
      }

      const costMapImage = artifactImageRef.current.costMap
      if (showCostMapLayer && costMapImage) {
        ctx.save()
        ctx.globalAlpha = clamp(artifactLayerOpacity, 0, 1)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(costMapImage, 0, 0, mapGridTransform.mapWidthPx, mapGridTransform.mapHeightPx)
        ctx.restore()
      }

      const hoverCell = hoverCellRef.current
      if (hoverCell) {
        const previewColor = activeTool === 'paint_blocked'
          ? 'rgba(231, 76, 60, 0.95)'
          : activeTool === 'paint_walkable'
            ? 'rgba(46, 204, 113, 0.95)'
            : activeTool === 'paint_cost'
              ? 'rgba(230, 126, 34, 0.95)'
              : activeTool === 'mark_door'
                ? 'rgba(52, 152, 219, 0.95)'
                : 'rgba(241, 196, 15, 0.95)'
        const fillAlpha = isPaintingRef.current ? 0.3 : 0.16

        if (traversalGrid) {
          const traversalCellWidthPx = mapGridTransform.mapWidthPx / Math.max(1, traversalGrid.width_cells)
          const traversalCellHeightPx = mapGridTransform.mapHeightPx / Math.max(1, traversalGrid.height_cells)
          const footprint = getBrushTraversalCellsAtTraversalCell(hoverCell.tx, hoverCell.ty)

          ctx.save()
          for (const cell of footprint) {
            const x = cell.tx * traversalCellWidthPx
            const y = cell.ty * traversalCellHeightPx
            ctx.fillStyle = previewColor.replace('0.95', String(fillAlpha))
            ctx.fillRect(x, y, traversalCellWidthPx, traversalCellHeightPx)

            ctx.strokeStyle = previewColor
            ctx.lineWidth = 1
            ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, traversalCellWidthPx - 1), Math.max(1, traversalCellHeightPx - 1))
          }
          ctx.restore()
        } else {
          const rect = mapGridTransform.cellToPixelRect(hoverCell.tx, hoverCell.ty)
          ctx.save()
          ctx.fillStyle = previewColor.replace('0.95', String(fillAlpha))
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
          ctx.strokeStyle = previewColor
          ctx.lineWidth = 1
          ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(1, rect.width - 1), Math.max(1, rect.height - 1))
          ctx.restore()
        }
      }
    }

    const visibleSet = new Set(
      (map.visible || []).map(v => `${v.x},${v.y}`)
    )
    const hasVisibility = visibleSet.size > 0

    if (mapMode !== MAP_MODE_AI) {
      console.error('[MapCanvas] Non-AI map mode reached gameplay renderer', { mapMode })
      ctx.restore()
      return
    }

    // Layer 1: optional traversal-grid debug overlay.
    renderGridOverlay(ctx, gridOverlayConfig, map, traversalGrid, mapGridTransform)

    // Layer 2: vector props/objects overlay.
    if (runtimeOverlay) {
      renderOverlayLayers(runtimeOverlay, {
        ctx,
        mapBounds: { x: 0, y: 0, width: mapGridTransform.mapWidthPx, height: mapGridTransform.mapHeightPx },
        zoom: interaction.zoom,
        panX: interaction.offsetX,
        panY: interaction.offsetY,
      }, undefined, {
        labels: {
          show: showVectorLabels,
          showDmOnly: showDmOnlyLabels,
        },
      })
    }

    // Layer 2 then Layer 3: props/objects first, then units/characters.
    const layer2Props = map.entities.filter((entity) => entity.type === 'object')
    const layer3Units = map.entities.filter((entity) => entity.type !== 'object')
    const renderEntities = [...layer2Props, ...layer3Units]

    let entityIndex = -1
    for (const entity of renderEntities) {
      entityIndex++
      const entityKey = `${entity.x},${entity.y}`
      const isLocalPlayerToken = entity.id === myCharacterId || (playerId ? entity.id === `pc_${playerId}` : false)
      if (hasVisibility && !visibleSet.has(entityKey) && !isLocalPlayerToken) continue

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
      const px = drawGX * renderCellWidth + renderCellWidth / 2
      const py = drawGY * renderCellHeight + renderCellHeight / 2
      const radius = Math.min(renderCellWidth, renderCellHeight) * 0.35
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

      const monsterFrameKey = entity.type === 'enemy'
        ? getMonsterFrameKeyForEnemy(entity.id, entity.name, spriteKey)
        : null
      // Animate monsters by cycling through all available frames for their base label
      const monsterAllFrameKeys = monsterFrameKey ? (enemyFrameKeysRef.current.get(entity.id) ?? []) : []
      const activeMonsterFrameKey = monsterAllFrameKeys.length > 1
        ? monsterAllFrameKeys[Math.floor(performance.now() / ANIM_FRAME_MS + entityIndex * 3) % monsterAllFrameKeys.length]
        : monsterFrameKey
      const monsterRect = activeMonsterFrameKey ? resolveMonsterSpriteRect(activeMonsterFrameKey) : null
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
      let spriteDrawWidth = tokenBaseSizePx
      let spriteDrawHeight = tokenBaseSizePx
      if (isCharacterSheetSprite) {
        const loadedSheet = characterSheetImage as HTMLImageElement
        const sourceW = loadedSheet.naturalWidth / CHARACTER_SPRITESHEET_COLUMNS
        const sourceH = loadedSheet.naturalHeight / CHARACTER_SPRITESHEET_ROWS
        const scaledHeight = tokenBaseSizePx * CHARACTER_SPRITE_SCALE
        spriteDrawHeight = scaledHeight
        spriteDrawWidth = scaledHeight * (sourceW / sourceH)
      } else if (monsterRect) {
        const scaledHeight = tokenBaseSizePx
        spriteDrawHeight = scaledHeight
        spriteDrawWidth = scaledHeight * (monsterRect.w / monsterRect.h)
      }
      const spriteVisualRadius = Math.max(spriteDrawWidth, spriteDrawHeight) / 2
      const shouldRotateDefeated = isDefeatedEnemy

      // Idle bob for player characters: gentle 2px vertical oscillation
      const bobY = entity.type === 'pc' && !isDefeatedEnemy
        ? Math.sin(performance.now() / 700 + entityIndex * 1.7) * 2
        : 0

      const drawEntitySprite = (
        drawFn: () => void,
        yOffset = 0,
        fallbackOpacity = 1,
      ) => {
        ctx.save()
        ctx.translate(px, py + yOffset)
        ctx.globalCompositeOperation = 'source-over'
        if (shouldRotateDefeated) {
          ctx.rotate(Math.PI / 2)
          ctx.globalAlpha = 0.72
        } else {
          ctx.globalAlpha = fallbackOpacity
        }
        drawFn()
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
        }, bobY)
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
        const topOfToken = py + bobY - (drewSprite ? spriteVisualRadius : radius)

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
      ctx.fillText(entity.name, px, py + bobY + (drewSprite ? spriteVisualRadius : radius) + 10)
    }

    // Layer 4: selection / targeting / active-turn indicators above sprites.
    for (const entity of renderEntities) {
      const entityKey = `${entity.x},${entity.y}`
      const isLocalPlayerToken = entity.id === myCharacterId || (playerId ? entity.id === `pc_${playerId}` : false)
      if (hasVisibility && !visibleSet.has(entityKey) && !isLocalPlayerToken) continue
      const anim = tokenAnimationsRef.current.get(entity.id)
      let drawGX = entity.x
      let drawGY = entity.y
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.startTime) / anim.duration)
        const ease = 1 - Math.pow(1 - t, 3)
        drawGX = anim.fromX + (anim.toX - anim.fromX) * ease
        drawGY = anim.fromY + (anim.toY - anim.fromY) * ease
      }

      const px = drawGX * renderCellWidth + renderCellWidth / 2
      const py = drawGY * renderCellHeight + renderCellHeight / 2
      const radius = Math.min(renderCellWidth, renderCellHeight) * 0.35
      const ringR = Math.max(radius + 5, tokenBaseSizePx * 0.58)

      if (entity.id === selectedEntityId) {
        ctx.save()
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.beginPath()
        ctx.arc(px, py, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = '#4da3ff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      if (targetingMode && (entity.type === 'enemy' || entity.type === 'npc')) {
        const pulse = Math.sin(performance.now() / 220) * 0.5 + 0.5
        ctx.save()
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.beginPath()
        ctx.arc(px, py, ringR + 1, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(231, 76, 60, ${0.45 + pulse * 0.55})`
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

      if (combat?.is_active && combat.current_turn === entity.id) {
        const isMyTurn = entity.id === myCharacterId
        const pulse = Math.sin(performance.now() / 300) * 0.5 + 0.5
        ctx.save()
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.beginPath()
        ctx.arc(px, py, ringR + 4, 0, Math.PI * 2)
        ctx.strokeStyle = isMyTurn
          ? `rgba(228, 168, 83, ${0.25 + pulse * 0.45})`
          : `rgba(231, 76, 60, ${0.2 + pulse * 0.35})`
        ctx.lineWidth = 7
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(px, py, ringR, 0, Math.PI * 2)
        ctx.strokeStyle = isMyTurn ? '#e4a853' : '#e74c3c'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }
    }

    drawOverlays(ctx, map, combat, selectedEntityId, myCharacterId, mapGridTransform)

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
  }, [map, combat, characters, interaction.offsetX, interaction.offsetY, interaction.zoom, selectedEntityId, myCharacterId, imageUrl, imageOpacity, resolveCharacterForEntity, getMonsterFrameKeyForEnemy, targetingMode, runtimeOverlay, showVectorLabels, showDmOnlyLabels, gridOverlayConfig, traversalGrid, mapGridTransform, correctionModeEnabled, showCollisionMaskLayer, showCostMapLayer, artifactLayerOpacity, activeTool, getBrushTraversalCellsAtTraversalCell])

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

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    updateHoverCellFromPointer(e.clientX, e.clientY)
    if (!correctionModeEnabled || activeTool === 'inspect' || e.button !== 0 || e.shiftKey) {
      return
    }
    isPaintingRef.current = true
    lastPaintCellKeyRef.current = null
    paintAtPointerPosition(e.clientX, e.clientY)
  }, [activeTool, correctionModeEnabled, paintAtPointerPosition, updateHoverCellFromPointer])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    updateHoverCellFromPointer(e.clientX, e.clientY)
    if (!isPaintingRef.current || !correctionModeEnabled || activeTool === 'inspect') {
      return
    }
    paintAtPointerPosition(e.clientX, e.clientY)
  }, [activeTool, correctionModeEnabled, paintAtPointerPosition, updateHoverCellFromPointer])

  const stopPainting = useCallback(() => {
    isPaintingRef.current = false
    lastPaintCellKeyRef.current = null
  }, [])

  const clearHoverCell = useCallback(() => {
    hoverCellRef.current = null
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (interaction.isPanning || !map) return
    if (correctionModeEnabled) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { gx, gy } = interaction.screenToGrid(
      e.clientX,
      e.clientY,
      rect,
      { cellWidthPx: mapGridTransform.cellWidthPx, cellHeightPx: mapGridTransform.cellHeightPx },
    )

    const clickedEntity = map.entities.find(ent => ent.x === gx && ent.y === gy)
    if (clickedEntity) {
      onEntityClick?.(clickedEntity.id)
      return
    }

    onTileClick?.(gx, gy)
  }, [map, interaction, onTileClick, onEntityClick, mapGridTransform.cellWidthPx, mapGridTransform.cellHeightPx, correctionModeEnabled])

  const handleRecenter = useCallback(() => {
    if (!map) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    interaction.fitToView(
      map.width,
      map.height,
      rect.width,
      rect.height,
      { cellWidthPx: mapGridTransform.cellWidthPx, cellHeightPx: mapGridTransform.cellHeightPx },
    )
  }, [map, interaction, mapGridTransform.cellWidthPx, mapGridTransform.cellHeightPx])

  const handleCopyTransformJson = useCallback(async () => {
    const snapshot = {
      mode: mapMode,
      mapWidthPx: Number(mapGridTransform.mapWidthPx.toFixed(3)),
      mapHeightPx: Number(mapGridTransform.mapHeightPx.toFixed(3)),
      cellWidthPx: Number(mapGridTransform.cellWidthPx.toFixed(3)),
      cellHeightPx: Number(mapGridTransform.cellHeightPx.toFixed(3)),
    }
    const payload = JSON.stringify(snapshot, null, 2)

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = payload
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        textarea.style.pointerEvents = 'none'
        document.body.appendChild(textarea)
        textarea.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!ok) {
          throw new Error('copy command failed')
        }
      }
      setTransformCopyStatus('copied')
    } catch {
      setTransformCopyStatus('failed')
    }

    window.setTimeout(() => {
      setTransformCopyStatus('idle')
    }, 1400)
  }, [mapMode, mapGridTransform.cellHeightPx, mapGridTransform.cellWidthPx, mapGridTransform.mapHeightPx, mapGridTransform.mapWidthPx])

  const generationStatus = typeof mapMetadata?.generation_status === 'string'
    ? mapMetadata.generation_status
    : null

  if (!map) {
    if (roomCode) {
      return (
        <div className="map-placeholder">
          <div className="map-placeholder-content">
            <div className="map-placeholder-spinner"></div>
            <p className="map-placeholder-text">Syncing map state...</p>
          </div>
        </div>
      )
    }

    return (
      <div className="map-placeholder">
        <p>No map loaded. The DM will generate one when the adventure begins.</p>
      </div>
    )
  }

  const hasBattlemapImage = typeof mapMetadata?.image_url === 'string' && mapMetadata.image_url.trim().length > 0
  const isBattlemapPending = generationStatus === 'pending' && !hasBattlemapImage

  if (isBattlemapPending) {
    return (
      <div className="map-placeholder">
        <div className="map-placeholder-content">
          <div className="map-placeholder-spinner"></div>
          <p className="map-placeholder-text">Generating AI battlemap...</p>
          <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.7 }}>Requesting from OpenAI API</p>
        </div>
      </div>
    )
  }

  if (mapMode !== MAP_MODE_AI) {
    return (
      <div className="map-placeholder">
        <div className="map-placeholder-content">
          <p className="map-placeholder-text">Waiting for AI battlemap scene initialization...</p>
          <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.7 }}>Legacy terrain mode is disabled in gameplay scenes.</p>
        </div>
      </div>
    )
  }

  const sourceLabel = (() => {
    const src = mapMetadata?.map_source
    if (src === 'generated') return 'AI Generated'
    if (src === 'library') return 'Library Map'
    if (src === 'manual') return 'Manual Map'
    if (src) return src
    return 'AI Map'
  })()

  const statusLabel = mapMetadata?.cache_hit ? 'Cached' : 'Fresh'
  const environmentLabel = mapMetadata?.environment || 'unknown'
  const attributionRequired = !!mapMetadata?.attribution_required
  const attributionLine = attributionRequired
    ? (mapMetadata?.attribution_text?.trim() || `Map art by ${mapMetadata?.author || 'Unknown source'}`)
    : ''
  const hasAttributionPanel = !!(mapMetadata?.author || mapMetadata?.license_spdx || mapMetadata?.source_url || attributionLine)

  return (
    <div
      ref={containerRef}
      className={`map-container${targetingMode ? ' targeting-mode' : ''}`}
      onPointerDown={interaction.handlePointerDown}
      onPointerMove={interaction.handlePointerMove}
      onPointerUp={() => {
        interaction.handlePointerUp()
        stopPainting()
      }}
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
      <div className="map-transform-debug-panel" aria-live="polite">
        <div className="map-transform-debug-title">Transform</div>
        <div className="map-transform-debug-row">
          <span className="map-transform-debug-key">mode</span>
          <span className="map-transform-debug-value">{mapMode}</span>
        </div>
        <div className="map-transform-debug-row">
          <span className="map-transform-debug-key">mapWidthPx</span>
          <span className="map-transform-debug-value">{Math.round(mapGridTransform.mapWidthPx)}</span>
        </div>
        <div className="map-transform-debug-row">
          <span className="map-transform-debug-key">mapHeightPx</span>
          <span className="map-transform-debug-value">{Math.round(mapGridTransform.mapHeightPx)}</span>
        </div>
        <div className="map-transform-debug-row">
          <span className="map-transform-debug-key">cellWidthPx</span>
          <span className="map-transform-debug-value">{Number(mapGridTransform.cellWidthPx.toFixed(3))}</span>
        </div>
        <div className="map-transform-debug-row">
          <span className="map-transform-debug-key">cellHeightPx</span>
          <span className="map-transform-debug-value">{Number(mapGridTransform.cellHeightPx.toFixed(3))}</span>
        </div>
        <div className="map-transform-debug-actions">
          <button
            type="button"
            className="map-transform-debug-copy-btn"
            onClick={handleCopyTransformJson}
            title="Copy transform snapshot JSON"
          >
            Copy JSON
          </button>
          <span className={`map-transform-debug-copy-status ${transformCopyStatus !== 'idle' ? 'is-visible' : ''}`}>
            {transformCopyStatus === 'copied' ? 'Copied' : transformCopyStatus === 'failed' ? 'Copy failed' : ''}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`map-label-toggle-btn ${showVectorLabels ? 'is-active' : ''}`}
        onClick={() => setShowVectorLabels((v) => !v)}
        title="Show/hide generated vector labels"
      >
        {showVectorLabels ? 'Hide labels' : 'Show labels'}
      </button>
      <button
        type="button"
        className={`map-dm-label-toggle-btn ${showDmOnlyLabels ? 'is-active' : ''}`}
        onClick={() => setShowDmOnlyLabels((v) => !v)}
        title="Show/hide DM-only labels"
      >
        {showDmOnlyLabels ? 'Hide DM labels' : 'Show DM labels'}
      </button>
      <button
        type="button"
        className={`map-label-scale-toggle-btn ${scaleLabelsWithZoom ? 'is-active' : ''}`}
        onClick={() => setScaleLabelsWithZoom((v) => !v)}
        title="Toggle zoom-based label scaling"
      >
        {scaleLabelsWithZoom ? 'Label zoom: on' : 'Label zoom: off'}
      </button>
      <button
        type="button"
        className={`map-grid-overlay-btn ${gridOverlayConfig.visible ? 'is-active' : ''}`}
        onClick={() => {
          const modes: GridOverlayMode[] = ['outlines', 'blocked', 'movement_cost', 'tags']
          if (!gridOverlayConfig.visible) {
            setGridOverlayConfig({ visible: true, mode: 'outlines' })
          } else {
            const idx = modes.indexOf(gridOverlayConfig.mode)
            if (idx < 0 || idx === modes.length - 1) {
              setGridOverlayConfig({ visible: false })
            } else {
              setGridOverlayConfig({ mode: modes[idx + 1] })
            }
          }
        }}
        title="Cycle traversal-grid overlay: off → outlines → blocked → heat → tags → off"
      >
        {!gridOverlayConfig.visible
          ? 'Grid: off'
          : gridOverlayConfig.mode === 'outlines'
            ? 'Grid: lines'
            : gridOverlayConfig.mode === 'blocked'
              ? 'Grid: blocked'
              : gridOverlayConfig.mode === 'movement_cost'
                ? 'Grid: heat'
                : 'Grid: tags'}
      </button>
      <button
        type="button"
        className={`map-correction-toggle-btn ${correctionModeEnabled ? 'is-active' : ''}`}
        onClick={() => setCorrectionModeEnabled(!correctionModeEnabled)}
        title="Toggle battlemap correction mode"
      >
        {correctionModeEnabled ? 'Correction: on' : 'Correction: off'}
      </button>
      {correctionModeEnabled && (
        <div className="map-correction-panel" aria-live="polite">
          <button
            type="button"
            className="map-correction-tool-btn"
            onClick={cycleTool}
            title="Cycle correction tool"
          >
            Tool: {CORRECTION_TOOL_LABELS[activeTool]}
          </button>
          <button
            type="button"
            className="map-correction-brush-btn"
            onClick={cycleBrushSize}
            title="Cycle correction brush size"
          >
            Brush: {brushSizeCells} cell{brushSizeCells > 1 ? 's' : ''}
          </button>
          <label className="map-correction-cost-field" title="Set movement-cost paint value">
            Movement value
            <input
              type="number"
              min={0.5}
              max={6}
              step={0.5}
              value={brushMovementCost}
              onChange={(event) => setBrushMovementCost(Number(event.target.value))}
            />
          </label>
          <label className="map-correction-cost-field" title="Traversal cell size in world units (feet)">
            Grid cell ft
            <input
              type="number"
              min={0.25}
              max={20}
              step={0.25}
              value={editorGridCellSizeWorld}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isFinite(next)) {
                  setEditorGridCellSizeWorld(next)
                }
              }}
            />
          </label>
          <div className="map-correction-grid-count-row">
            <label className="map-correction-cost-field" title="Traversal grid width (cells)">
              Grid W
              <input
                type="number"
                min={1}
                max={1024}
                step={1}
                value={editorGridWidthCells}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next)) {
                    setEditorGridWidthCells(next)
                  }
                }}
              />
            </label>
            <label className="map-correction-cost-field" title="Traversal grid height (cells)">
              Grid H
              <input
                type="number"
                min={1}
                max={1024}
                step={1}
                value={editorGridHeightCells}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next)) {
                    setEditorGridHeightCells(next)
                  }
                }}
              />
            </label>
          </div>
          {activeTool !== 'paint_cost' && (
            <div className="map-correction-tool-hint">Movement value applies to Paint cost.</div>
          )}
          <div className={`map-correction-dirty ${hasUnsavedChanges ? 'is-dirty' : ''}`}>
            {hasUnsavedChanges ? 'Unsaved changes' : 'No edits yet'}
          </div>
          <div className="map-correction-artifact-row">
            <button
              type="button"
              className={`map-correction-artifact-btn ${showCollisionMaskLayer ? 'is-active' : ''}`}
              onClick={toggleCollisionMaskLayer}
              disabled={!previewArtifacts.collisionMaskPngBase64}
              title="Toggle collision mask preview layer"
            >
              Collision mask
            </button>
            <button
              type="button"
              className={`map-correction-artifact-btn ${showCostMapLayer ? 'is-active' : ''}`}
              onClick={toggleCostMapLayer}
              disabled={!previewArtifacts.costMapPngBase64}
              title="Toggle movement-cost preview layer"
            >
              Cost map
            </button>
          </div>
          <label className="map-correction-opacity-field" title="Adjust preview artifact opacity">
            Artifact opacity
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={artifactLayerOpacity}
              onChange={(event) => setArtifactLayerOpacity(Number(event.target.value))}
            />
          </label>
          <div className="map-correction-actions-row">
            <button
              type="button"
              className="map-correction-refresh-btn"
              onClick={() => void handleFetchPreviewArtifacts()}
              disabled={previewBusy}
              title="Fetch fresh CV preview and artifact layers"
            >
              {previewBusy ? 'Refreshing...' : 'Refresh preview'}
            </button>
            <button
              type="button"
              className="map-correction-apply-btn"
              onClick={() => void handleApplyCorrections()}
              disabled={applyBusy || !hasUnsavedChanges}
              title="Persist corrected traversal grid into runtime session state"
            >
              {applyBusy ? 'Applying...' : 'Save/Apply'}
            </button>
          </div>
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
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={stopPainting}
        onPointerLeave={() => {
          stopPainting()
          clearHoverCell()
        }}
        onClick={handleClick}
      />
    </div>
  )
}
