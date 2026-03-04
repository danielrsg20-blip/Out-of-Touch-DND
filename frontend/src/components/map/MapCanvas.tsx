import { useRef, useEffect, useCallback } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useMapInteraction } from '../../hooks/useMapInteraction'
import { drawOverlays } from './OverlayLayer'
import type { TileData } from '../../types'
import './MapCanvas.css'

const TILE_SIZE = 40

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

export default function MapCanvas({ onTileClick, onEntityClick }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fittedMapKeyRef = useRef<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const imageUrlRef = useRef<string | null>(null)
  const map = useGameStore(s => s.map)
  const combat = useGameStore(s => s.combat)
  const characters = useGameStore(s => s.characters)
  const selectedEntityId = useGameStore(s => s.selectedEntityId)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)
  const interaction = useMapInteraction()

  const myCharacterId = players.find(p => p.id === playerId)?.character_id ?? null

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

        const color = tile ? (TILE_COLORS[tile.type] || '#3a3a4a') : '#0a0a0a'
        const hasBackgroundImage = !!loadedImage
        const lowOpacityTile = tile?.type === 'floor' || tile?.type === 'water'
        ctx.globalAlpha = hasBackgroundImage && lowOpacityTile ? 0.35 : 1
        ctx.fillStyle = color
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE)
        ctx.globalAlpha = 1

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
      }
    }

    for (const entity of map.entities) {
      if (hasVisibility && !visibleSet.has(`${entity.x},${entity.y}`)) continue

      const px = entity.x * TILE_SIZE + TILE_SIZE / 2
      const py = entity.y * TILE_SIZE + TILE_SIZE / 2
      const radius = TILE_SIZE * 0.35
      const color = ENTITY_COLORS[entity.type] || '#fff'

      if (entity.id === selectedEntityId) {
        ctx.beginPath()
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.max(9, 11 * interaction.zoom) / interaction.zoom}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const isDeadEnemyInCombat = !!combat?.is_active && entity.type === 'enemy' && (characters[entity.id]?.hp ?? 1) <= 0
      const tokenGlyph = isDeadEnemyInCombat ? 'X' : entity.name.charAt(0).toUpperCase()
      ctx.fillText(tokenGlyph, px, py)

      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = `${Math.max(8, 10 * interaction.zoom) / interaction.zoom}px sans-serif`
      ctx.fillText(entity.name, px, py + radius + 10)
    }

    drawOverlays(ctx, map, combat, selectedEntityId, myCharacterId)

    ctx.restore()
  }, [map, combat, characters, interaction.offsetX, interaction.offsetY, interaction.zoom, selectedEntityId, myCharacterId, imageUrl, imageOpacity])

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
