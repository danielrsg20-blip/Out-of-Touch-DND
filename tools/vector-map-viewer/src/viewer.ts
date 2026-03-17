import {
  DEFAULT_GRID_OVERLAY_CONFIG,
  type FrontendTraversalGrid,
  type GridOverlayConfig,
  type GridOverlayMode,
  type Overlay,
  type Point,
} from '../../../frontend/src/types'
import { renderGridOverlay } from '../../../frontend/src/lib/GridOverlayRenderer'
import { renderOverlayLayers } from '../../../frontend/src/lib/VectorOverlayRenderer'

type WorldBounds = { origin_x: number; origin_y: number; width_world: number; height_world: number }

export type ViewerSummary = {
  overlayLoaded: boolean
  gridLoaded: boolean
  layers: number
  elements: number
  cells: number
  blockedPercent: number
  worldWidth: number
  worldHeight: number
  zoom: number
}

type ChangeListener = (summary: ViewerSummary) => void

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function collectPoints(overlay: Overlay): Point[] {
  const points: Point[] = []
  for (const layer of overlay.layers) {
    for (const element of layer.elements) {
      if (element.type === 'polygon' || element.type === 'polyline') {
        points.push(...element.points)
      } else if (element.type === 'decal' || element.type === 'text') {
        points.push(element.position)
      }
    }
  }
  return points
}

function worldBoundsFromOverlay(overlay: Overlay | null): WorldBounds | null {
  const metadataBounds = overlay?.metadata?.world_bounds as WorldBounds | undefined
  if (metadataBounds) {
    return metadataBounds
  }
  if (!overlay) {
    return null
  }
  const points = collectPoints(overlay)
  if (points.length === 0) {
    return null
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return {
    origin_x: minX,
    origin_y: minY,
    width_world: Math.max(1, maxX - minX),
    height_world: Math.max(1, maxY - minY),
  }
}

function worldBoundsForData(overlay: Overlay | null, grid: FrontendTraversalGrid | null): WorldBounds {
  return grid?.world_bounds ?? worldBoundsFromOverlay(overlay) ?? {
    origin_x: 0,
    origin_y: 0,
    width_world: 640,
    height_world: 480,
  }
}

function syntheticMapSize(bounds: WorldBounds, grid: FrontendTraversalGrid | null): { width: number; height: number } {
  const baseTileWorld = grid
    ? grid.cell_size_world * Math.max(1, grid.resolution_scale)
    : 5
  return {
    width: Math.max(1, Math.round(bounds.width_world / baseTileWorld)),
    height: Math.max(1, Math.round(bounds.height_world / baseTileWorld)),
  }
}

function countElements(overlay: Overlay | null): number {
  if (!overlay) {
    return 0
  }
  return overlay.layers.reduce((sum, layer) => sum + layer.elements.length, 0)
}

function blockedPercent(grid: FrontendTraversalGrid | null): number {
  if (!grid || grid.cells.length === 0) {
    return 0
  }
  const blocked = grid.cells.filter((cell) => !cell.traversable).length
  return (blocked / grid.cells.length) * 100
}

export class VectorMapViewer {
  private readonly root: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly emptyState: HTMLDivElement
  private overlay: Overlay | null = null
  private grid: FrontendTraversalGrid | null = null
  private gridConfig: GridOverlayConfig = { ...DEFAULT_GRID_OVERLAY_CONFIG }
  private showLabels = true
  private showDmOnlyLabels = false
  private zoom = 1
  private panX = 0
  private panY = 0
  private changeListener: ChangeListener | null = null
  private dragOrigin: { x: number; y: number; panX: number; panY: number } | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.canvas = document.createElement('canvas')
    this.emptyState = document.createElement('div')

    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.display = 'block'
    this.canvas.style.cursor = 'grab'
    this.canvas.style.touchAction = 'none'

    this.emptyState.textContent = 'Load overlay.json and traversal_grid.json to render a map.'
    this.emptyState.style.position = 'absolute'
    this.emptyState.style.inset = '0'
    this.emptyState.style.display = 'grid'
    this.emptyState.style.placeItems = 'center'
    this.emptyState.style.color = '#9aa4b2'
    this.emptyState.style.font = '14px monospace'
    this.emptyState.style.pointerEvents = 'none'

    this.root.style.position = 'relative'
    this.root.append(this.canvas, this.emptyState)

    window.addEventListener('resize', this.render)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerUp)

    this.render()
  }

  setOnChange(listener: ChangeListener): void {
    this.changeListener = listener
    this.emitChange()
  }

  setOverlay(overlay: Overlay | null): void {
    this.overlay = overlay
    this.fitToView()
  }

  setGrid(grid: FrontendTraversalGrid | null): void {
    this.grid = grid
    this.fitToView()
  }

  setData(overlay: Overlay | null, grid: FrontendTraversalGrid | null): void {
    this.overlay = overlay
    this.grid = grid
    this.fitToView()
  }

  setGridVisible(visible: boolean): void {
    this.gridConfig = { ...this.gridConfig, visible }
    this.render()
  }

  setGridMode(mode: GridOverlayMode): void {
    this.gridConfig = { ...this.gridConfig, mode }
    this.render()
  }

  setGridOpacity(opacity: number): void {
    this.gridConfig = { ...this.gridConfig, opacity: clamp(opacity, 0, 1) }
    this.render()
  }

  setShowLabels(showLabels: boolean): void {
    this.showLabels = showLabels
    this.render()
  }

  setShowDmOnlyLabels(showDmOnlyLabels: boolean): void {
    this.showDmOnlyLabels = showDmOnlyLabels
    this.render()
  }

  async loadFromUrls(overlayUrl: string, gridUrl?: string): Promise<void> {
    const overlay = await this.fetchJson<Overlay>(overlayUrl)
    const grid = gridUrl ? await this.fetchJson<FrontendTraversalGrid>(gridUrl) : null
    this.overlay = overlay
    this.grid = grid
    this.fitToView()
  }

  async loadFromFiles(overlayFile: File, gridFile?: File | null): Promise<void> {
    const overlay = JSON.parse(await overlayFile.text()) as Overlay
    const grid = gridFile ? (JSON.parse(await gridFile.text()) as FrontendTraversalGrid) : null
    this.overlay = overlay
    this.grid = grid
    this.fitToView()
  }

  fitToView = (): void => {
    const bounds = worldBoundsForData(this.overlay, this.grid)
    const viewportWidth = Math.max(1, this.root.clientWidth)
    const viewportHeight = Math.max(1, this.root.clientHeight)
    const mapSize = syntheticMapSize(bounds, this.grid)
    const worldToPixelsX = (mapSize.width * 32) / bounds.width_world
    const worldToPixelsY = (mapSize.height * 32) / bounds.height_world
    const contentWidth = bounds.width_world * worldToPixelsX
    const contentHeight = bounds.height_world * worldToPixelsY
    const paddedWidth = Math.max(1, contentWidth + 48)
    const paddedHeight = Math.max(1, contentHeight + 48)
    this.zoom = clamp(Math.min(viewportWidth / paddedWidth, viewportHeight / paddedHeight), 0.1, 8)
    this.panX = (viewportWidth - contentWidth * this.zoom) * 0.5
    this.panY = (viewportHeight - contentHeight * this.zoom) * 0.5
    this.render()
  }

  getSummary(): ViewerSummary {
    const bounds = worldBoundsForData(this.overlay, this.grid)
    return {
      overlayLoaded: this.overlay !== null,
      gridLoaded: this.grid !== null,
      layers: this.overlay?.layers.length ?? 0,
      elements: countElements(this.overlay),
      cells: this.grid?.cells.length ?? 0,
      blockedPercent: blockedPercent(this.grid),
      worldWidth: bounds.width_world,
      worldHeight: bounds.height_world,
      zoom: this.zoom,
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }

  private emitChange(): void {
    this.changeListener?.(this.getSummary())
  }

  private render = (): void => {
    const width = Math.max(1, this.root.clientWidth)
    const height = Math.max(1, this.root.clientHeight)
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#10151f'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#162031'
    for (let x = 0; x < width; x += 48) {
      for (let y = (x / 48) % 2 === 0 ? 0 : 24; y < height; y += 48) {
        ctx.fillRect(x, y, 1, 1)
      }
    }

    this.emptyState.style.display = this.overlay || this.grid ? 'none' : 'grid'
    if (!this.overlay && !this.grid) {
      this.emitChange()
      return
    }

    const bounds = worldBoundsForData(this.overlay, this.grid)
    const mapSize = syntheticMapSize(bounds, this.grid)
    const mapWidthPx = mapSize.width * 32
    const mapHeightPx = mapSize.height * 32
    const worldToPixelsX = mapWidthPx / bounds.width_world
    const worldToPixelsY = mapHeightPx / bounds.height_world
    const effectiveZoom = this.zoom * Math.max(worldToPixelsX, worldToPixelsY)

    ctx.save()
    ctx.translate(this.panX, this.panY)
    ctx.scale(this.zoom, this.zoom)

    ctx.fillStyle = '#d7ccb2'
    ctx.fillRect(0, 0, mapWidthPx, mapHeightPx)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, mapWidthPx, mapHeightPx)

    if (this.overlay) {
      ctx.save()
      ctx.scale(worldToPixelsX, worldToPixelsY)
      renderOverlayLayers(
        this.overlay,
        {
          ctx,
          mapBounds: {
            x: bounds.origin_x,
            y: bounds.origin_y,
            width: bounds.width_world,
            height: bounds.height_world,
          },
          zoom: effectiveZoom,
          panX: this.panX,
          panY: this.panY,
        },
        undefined,
        { labels: { show: this.showLabels, showDmOnly: this.showDmOnlyLabels } },
      )
      ctx.restore()
    }

    if (this.grid) {
      renderGridOverlay(ctx, this.gridConfig, mapSize, this.grid)
    }

    ctx.restore()
    this.emitChange()
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    const prevZoom = this.zoom
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    this.zoom = clamp(this.zoom * factor, 0.05, 20)
    this.panX = mouseX - ((mouseX - this.panX) / prevZoom) * this.zoom
    this.panY = mouseY - ((mouseY - this.panY) / prevZoom) * this.zoom
    this.render()
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.dragOrigin = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY }
    this.canvas.style.cursor = 'grabbing'
    this.canvas.setPointerCapture(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragOrigin) {
      return
    }
    this.panX = this.dragOrigin.panX + (event.clientX - this.dragOrigin.x)
    this.panY = this.dragOrigin.panY + (event.clientY - this.dragOrigin.y)
    this.render()
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }
    this.dragOrigin = null
    this.canvas.style.cursor = 'grab'
  }
}