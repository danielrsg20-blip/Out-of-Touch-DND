/**
 * VectorOverlayRenderer.ts
 * 
 * Core Canvas 2D drawing utilities for the vector overlay system.
 * Provides functions to render regions (polygons), paths (polylines), decals (stamps),
 * with support for fill, stroke, noise masks, and blend modes.
 */

import type {
  Overlay,
  OverlayLayer,
  OverlayElement,
  Region,
  Path,
  Decal,
  TextLabel,
  Point,
  NoiseMask,
  GradientDef,
  GradientStop,
} from '../types'

interface RenderContext {
  ctx: CanvasRenderingContext2D
  mapBounds: { x: number; y: number; width: number; height: number }
  zoom: number
  panX: number
  panY: number
}

interface RenderOptions {
  labels?: {
    show: boolean
    showDmOnly: boolean
  }
}

function toCanvasBlendMode(mode: OverlayLayer['blend_mode'] | string | undefined): GlobalCompositeOperation {
  if (!mode || mode === 'normal') return 'source-over'
  return mode as GlobalCompositeOperation
}

/**
 * Main entry point: render all visible overlay layers
 */
export function renderOverlayLayers(
  overlay: Overlay,
  context: RenderContext,
  visibleLayers?: string[],
  options?: RenderOptions
): void {
  if (!overlay || !overlay.layers) return

  // Sort layers by z_index
  const sortedLayers = [...overlay.layers]
    .filter((layer) => layer.visible && (!visibleLayers || visibleLayers.includes(layer.id)))
    .sort((a, b) => a.z_index - b.z_index)

  sortedLayers.forEach((layer) => {
    renderLayer(layer, overlay, context, options)
  })
}

/**
 * Render a single overlay layer
 */
function renderLayer(
  layer: OverlayLayer,
  overlay: Overlay,
  context: RenderContext,
  options?: RenderOptions
): void {
  const { ctx } = context

  // Save canvas state
  ctx.save()

  // Apply layer-level blend mode and opacity
  ctx.globalCompositeOperation = toCanvasBlendMode(layer.blend_mode)
  ctx.globalAlpha = layer.opacity ?? 1.0

  // Optionally apply clipping to layer
  if (layer.clip_region && layer.clip_region.length > 0) {
    applyClip(ctx, layer.clip_region)
  }

  // Render each element in the layer
  layer.elements.forEach((element) => {
    renderElement(element, context, overlay, options)
  })

  // Restore canvas state
  ctx.restore()
}

/**
 * Render a single overlay element (region, path, or decal)
 */
function renderElement(
  element: OverlayElement,
  context: RenderContext,
  overlay?: Overlay,
  options?: RenderOptions
): void {
  const { ctx } = context

  ctx.save()

  switch (element.type) {
    case 'polygon':
      renderRegion(element as Region, context)
      break
    case 'polyline':
      renderPath(element as Path, context)
      break
    case 'decal':
      if (overlay) {
        renderDecal(element as Decal, overlay, context)
      }
      break
    case 'text':
      renderTextLabel(element as TextLabel, context, options)
      break
  }

  ctx.restore()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function renderTextLabel(
  label: TextLabel,
  context: RenderContext,
  options?: RenderOptions
): void {
  const { ctx, zoom } = context
  if (label.visible === false) {
    return
  }

  const showLabels = options?.labels?.show ?? true
  if (!showLabels) {
    return
  }

  if (label.dm_only && !(options?.labels?.showDmOnly ?? false)) {
    return
  }

  const baseSize = label.font_size ?? 11
  const minScreenPx = label.min_screen_px ?? 9
  const maxScreenPx = label.max_screen_px ?? 16
  const shouldScale = label.scale_with_zoom !== false
  const requestedScreenPx = shouldScale ? baseSize * zoom : baseSize
  const screenPx = clamp(requestedScreenPx, minScreenPx, maxScreenPx)
  const worldPx = screenPx / Math.max(zoom, 0.001)

  const offset = label.offset ?? { x: 0, y: 0 }
  const x = label.position.x + offset.x
  const y = label.position.y + offset.y

  const fontFamily = label.font_family ?? 'Segoe UI, sans-serif'
  ctx.font = `${worldPx}px ${fontFamily}`
  ctx.textAlign = label.align ?? 'center'
  ctx.textBaseline = label.baseline ?? 'middle'

  if (label.chip_color) {
    const pad = label.chip_padding ?? 3
    const metrics = ctx.measureText(label.text)
    const textWidth = metrics.width
    const textHeight = worldPx
    const chipX = x - textWidth / 2 - pad
    const chipY = y - textHeight / 2 - pad
    ctx.fillStyle = label.chip_color
    ctx.fillRect(chipX, chipY, textWidth + pad * 2, textHeight + pad * 2)
  }

  if (label.outline_color) {
    ctx.lineWidth = label.outline_width ?? 2
    ctx.strokeStyle = label.outline_color
    ctx.strokeText(label.text, x, y)
  }

  ctx.fillStyle = label.color ?? '#f6f7fb'
  ctx.fillText(label.text, x, y)
}

/**
 * Render a polygon region with fill, stroke, and optional noise mask
 */
function renderRegion(
  region: Region,
  context: RenderContext
): void {
  const { ctx } = context

  // Save state for feathering/masking
  ctx.save()

  // Draw the polygon path
  const path = new Path2D()
  const points = region.points
  if (points.length < 3) {
    ctx.restore()
    return
  }

  // Build path from points
  path.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i].x, points[i].y)
  }
  path.closePath()

  // Apply fill
  if (region.fill) {
    if (region.fill.gradient) {
      const gradient = buildGradient(ctx, region.fill.gradient)
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = region.fill.color || '#00000000'
    }
    ctx.globalAlpha = region.fill_opacity ?? ctx.globalAlpha
    ctx.fill(path)
  }

  // Apply stroke
  if (region.stroke) {
    ctx.globalAlpha = ctx.globalAlpha
    ctx.strokeStyle = region.stroke.color || '#000000'
    ctx.lineWidth = region.stroke.width ?? 1
    ctx.lineCap = region.stroke.line_cap ?? 'round'
    ctx.lineJoin = region.stroke.line_join ?? 'round'
    if (region.stroke.dash_array && region.stroke.dash_array.length > 0) {
      ctx.setLineDash(region.stroke.dash_array)
    }
    ctx.stroke(path)
  }

  // Apply noise mask (soft edge feathering)
  if (region.noise_mask && region.noise_mask.enabled) {
    applyNoiseMaskToRegion(ctx, region.noise_mask)
  }

  // Apply feathering (edge blur)
  if (region.feather && region.feather > 0) {
    ctx.filter = `blur(${region.feather}px)`
    ctx.fill(path)
  }

  ctx.restore()
}

/**
 * Render a polyline path with variable width and optional jitter
 */
function renderPath(
  path: Path,
  context: RenderContext
): void {
  const { ctx } = context

  const points = path.points
  if (points.length < 2) return

  ctx.save()

  const strokeColor = path.stroke?.color || '#000000'
  const baseWidth = path.stroke?.width ?? 1
  ctx.strokeStyle = strokeColor
  ctx.globalAlpha = path.stroke_opacity ?? ctx.globalAlpha
  ctx.lineCap = path.stroke?.line_cap ?? 'round'
  ctx.lineJoin = path.stroke?.line_join ?? 'round'

  // Handle width profile (taper effect)
  const widthProfile = path.stroke?.width_profile
  const jitter = path.style_jitter ?? 0

  // Draw segments with variable width
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]

    // Compute line width at this segment
    let lineWidth = baseWidth
    if (widthProfile && widthProfile.length > 0) {
      const ratio = i / (points.length - 1)
      const index = Math.floor(ratio * (widthProfile.length - 1))
      lineWidth = baseWidth * widthProfile[Math.min(index, widthProfile.length - 1)]
    }

    ctx.lineWidth = lineWidth

    // Apply jitter for hand-drawn effect
    let drawP1 = p1
    let drawP2 = p2
    if (jitter > 0) {
      drawP1 = applyJitter(p1, jitter * baseWidth)
      drawP2 = applyJitter(p2, jitter * baseWidth)
    }

    ctx.beginPath()
    ctx.moveTo(drawP1.x, drawP1.y)
    ctx.lineTo(drawP2.x, drawP2.y)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Render a decal (stamped symbol) at a position
 */
function renderDecal(
  decal: Decal,
  overlay: Overlay,
  context: RenderContext
): void {
  const { ctx } = context

  // Find the decal stamp definition from overlay styles
  let stampDef = null
  for (const styleName in overlay.styles) {
    const style = overlay.styles[styleName]
    if (style.decal_library && style.decal_library[decal.decal_type]) {
      stampDef = style.decal_library[decal.decal_type]
      break
    }
  }

  if (!stampDef) {
    // Fallback: draw a simple circle as placeholder
    ctx.save()
    ctx.fillStyle = '#cccccc88'
    ctx.beginPath()
    ctx.arc(decal.position.x, decal.position.y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  ctx.save()

  // Apply decal properties
  ctx.globalAlpha = decal.opacity ?? ctx.globalAlpha
  if (decal.blend_mode) {
    ctx.globalCompositeOperation = toCanvasBlendMode(decal.blend_mode)
  }

  // Transform: translate to position, rotate, scale
  ctx.translate(decal.position.x, decal.position.y)
  if (decal.rotation) {
    ctx.rotate((decal.rotation * Math.PI) / 180)
  }
  const scale = decal.scale ?? 1.0
  ctx.scale(scale, scale)

  // Draw SVG path (simplified: just draw bounding box + color for now)
  // Full SVG path parsing deferred to Phase 2+
  const bb = stampDef.bounding_box
  const palettes = Object.values(overlay.styles)
  let decalColor = '#999999'
  if (palettes.length > 0 && palettes[0].palette[stampDef.color_key]) {
    decalColor = palettes[0].palette[stampDef.color_key]
  }

  ctx.fillStyle = decalColor
  ctx.beginPath()
  ctx.rect(-bb.w / 2, -bb.h / 2, bb.w, bb.h)
  ctx.fill()

  ctx.restore()
}

/**
 * Apply clipping to a region defined by a polygon
 */
function applyClip(
  ctx: CanvasRenderingContext2D,
  clipPoints: Point[]
): void {
  if (clipPoints.length < 3) return

  const path = new Path2D()
  path.moveTo(clipPoints[0].x, clipPoints[0].y)
  for (let i = 1; i < clipPoints.length; i++) {
    path.lineTo(clipPoints[i].x, clipPoints[i].y)
  }
  path.closePath()

  ctx.clip(path)
}

/**
 * Build a canvas gradient from a GradientDef
 */
function buildGradient(
  ctx: CanvasRenderingContext2D,
  gradientDef: GradientDef
): CanvasGradient {
  let gradient: CanvasGradient

  if (gradientDef.type === 'linear') {
    const start = gradientDef.start || { x: 0, y: 0 }
    const end = gradientDef.end || { x: 100, y: 100 }
    gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y)
  } else {
    // radial
    const center = gradientDef.center || { x: 50, y: 50 }
    const radius = gradientDef.radius || 100
    gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius)
  }

  if (gradientDef.stops && Array.isArray(gradientDef.stops)) {
    gradientDef.stops.forEach((stop: GradientStop) => {
      gradient.addColorStop(stop.offset, stop.color)
    })
  }

  return gradient
}

/**
 * Apply Perlin/Simplex noise mask to soften region edges
 * Phase 1: simplified version using canvas filter blur
 * Phase 2: implement proper Perlin noise
 */
function applyNoiseMaskToRegion(
  ctx: CanvasRenderingContext2D,
  noiseMask: NoiseMask
): void {
  // Simplified: apply blur based on intensity
  if (noiseMask.intensity > 0) {
    const blurAmount = noiseMask.intensity * 10 // scale to px
    ctx.filter = `blur(${blurAmount}px)`
  }
}

/**
 * Apply jitter to a point for hand-drawn wobble effect
 */
function applyJitter(point: Point, amount: number): Point {
  // Simple pseudo-random jitter using deterministic seed
  // Phase 2: integrate with seeded_random.py for true determinism
  return {
    x: point.x + (Math.random() - 0.5) * amount,
    y: point.y + (Math.random() - 0.5) * amount,
  }
}

/**
 * Helper: check if a point is inside a polygon (for hit testing, gameplay queries)
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y
    const xj = polygon[j].x,
      yj = polygon[j].y

    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Helper: get all tags at a position in the overlay
 * Used for gameplay queries (mud, ice, cursed, etc.)
 */
export function getTagsAtPoint(overlay: Overlay, point: Point): Set<string> {
  const tags = new Set<string>()

  for (const layer of overlay.layers) {
    if (!layer.visible) continue

    for (const element of layer.elements) {
      if (element.type === 'polygon') {
        const region = element as Region
        if (pointInPolygon(point, region.points)) {
          if (element.tags) {
            element.tags.forEach((tag) => tags.add(tag))
          }
        }
      }
      // TODO: decal bounding box hittest, path width hittest
    }
  }

  return tags
}

/**
 * Helper: export overlay to SVG string (Phase 1 basic export)
 */
export function exportOverlayAsSVG(overlay: Overlay, width: number, height: number): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`

  for (const layer of overlay.layers) {
    if (!layer.visible) continue

    svg += `  <!-- Layer: ${layer.name} (z-index: ${layer.z_index}) -->\n`

    for (const element of layer.elements) {
      if (element.type === 'polygon') {
        const region = element as Region
        const pointsStr = region.points.map((p) => `${p.x},${p.y}`).join(' ')
        svg += `  <polygon points="${pointsStr}" fill="${region.fill?.color || '#000000'}" opacity="${region.fill_opacity ?? 1}"/>\n`
      } else if (element.type === 'polyline') {
        const path = element as Path
        const pointsStr = path.points.map((p) => `${p.x},${p.y}`).join(' ')
        svg += `  <polyline points="${pointsStr}" stroke="${path.stroke?.color || '#000000'}" stroke-width="${path.stroke?.width || 1}" fill="none"/>\n`
      }
    }
  }

  svg += `</svg>\n`
  return svg
}
