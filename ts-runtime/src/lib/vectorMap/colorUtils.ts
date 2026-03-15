/**
 * colorUtils.ts
 *
 * Deterministic HSL-based saturation clamping for vector overlay colors.
 * Same input always produces same output (no randomness).
 */

import type { ColorValidationReport, OverlayPayload, OverlayLayer, OverlayElement } from './types.js'

export interface ClampColorResult {
  color: string
  wasClamped: boolean
  originalSat: number
}

// ---------------------------------------------------------------------------
// Core color math
// ---------------------------------------------------------------------------

/** Parse #rrggbb, #rrggbbaa, or #rgb → [R,G,B,A] (0-255 each). Returns null if unrecognised. */
function hexToRgba(hex: string): [number, number, number, number] | null {
  if (!hex.startsWith('#')) return null
  const c = hex.slice(1)
  if (c.length === 3) {
    return [
      parseInt(c[0] + c[0], 16),
      parseInt(c[1] + c[1], 16),
      parseInt(c[2] + c[2], 16),
      255,
    ]
  }
  if (c.length === 6) {
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
      255,
    ]
  }
  if (c.length === 8) {
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
      parseInt(c.slice(6, 8), 16),
    ]
  }
  return null
}

/** RGB (0-255) → HSL: hue [0,360), sat [0,1], lum [0,1] */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h * 360, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

/** HSL → RGB (0-255 each) */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = h / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ]
}

function toHex2(v: number): string {
  return Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clamp a hex color's saturation to maxSat [0,1].
 * Hue and lightness are preserved. Alpha is forwarded unchanged.
 * Non-hex strings (rgba(), named colors) are passed through unchanged.
 * Deterministic: identical inputs always produce identical outputs.
 */
export function clampColorSaturation(color: string, maxSat: number): ClampColorResult {
  const noClamp: ClampColorResult = { color, wasClamped: false, originalSat: 0 }
  if (!color || !color.startsWith('#')) return noClamp
  const rgba = hexToRgba(color)
  if (!rgba) return noClamp

  const [r, g, b, a] = rgba
  const [h, s, l] = rgbToHsl(r, g, b)
  if (s <= maxSat + 1e-6) return { ...noClamp, originalSat: s }

  const [nr, ng, nb] = hslToRgb(h, maxSat, l)
  const alphaHex = a < 255 ? toHex2(a) : ''
  return {
    color: `#${toHex2(nr)}${toHex2(ng)}${toHex2(nb)}${alphaHex}`,
    wasClamped: true,
    originalSat: s,
  }
}

// ---------------------------------------------------------------------------
// Overlay-level clamping
// ---------------------------------------------------------------------------

interface LayerStats {
  total: number
  clamped: number
  maxSat: number
}

function clampColor(
  color: string | undefined,
  maxSat: number,
  stats: LayerStats,
): string {
  if (!color) return color ?? ''
  stats.total++
  const result = clampColorSaturation(color, maxSat)
  stats.maxSat = Math.max(stats.maxSat, result.originalSat)
  if (result.wasClamped) stats.clamped++
  return result.color
}

function processElement(element: OverlayElement, maxSat: number, ls: LayerStats): OverlayElement {
  const prevClamped = ls.clamped
  let processed: OverlayElement

  switch (element.type) {
    case 'polygon': {
      processed = {
        ...element,
        fill: {
          ...element.fill,
          color: clampColor(element.fill.color, maxSat, ls),
        },
        stroke: element.stroke
          ? { ...element.stroke, color: clampColor(element.stroke.color, maxSat, ls) }
          : element.stroke,
      }
      break
    }
    case 'polyline': {
      processed = {
        ...element,
        stroke: {
          ...element.stroke,
          color: clampColor(element.stroke.color, maxSat, ls),
        },
      }
      break
    }
    case 'decal':
    case 'text':
    default:
      // Text color is intentionally not clamped (contrast legibility matters more).
      // Decal colors are defined in the decal library, not inline.
      processed = element
  }

  // Count per element (one clamp event even if multiple sub-colors were clamped)
  if (ls.clamped > prevClamped) {
    // already counted via ls.clamped increments; element-level count tracked by caller
  }
  return processed
}

/**
 * Apply saturation constraint to every fill and stroke color in an overlay.
 * Per-layer `max_saturation` overrides the global maxSat if set on the layer.
 * Returns the modified overlay (structurally new object) and a validation report.
 */
export function applySaturationConstraint(
  overlay: OverlayPayload,
  globalMaxSat: number,
): { result: OverlayPayload; report: ColorValidationReport } {
  let elementsTotal = 0
  let elementsClamped = 0
  const maxSatByLayer: Record<string, number> = {}

  const processedLayers: OverlayLayer[] = overlay.layers.map((layer) => {
    const effectiveMax = (layer as OverlayLayer & { max_saturation?: number }).max_saturation ?? globalMaxSat
    const ls: LayerStats = { total: 0, clamped: 0, maxSat: 0 }

    const processedElements: OverlayElement[] = layer.elements.map((element) => {
      elementsTotal++
      const prevLayerClamped = ls.clamped
      const out = processElement(element, effectiveMax, ls)
      if (ls.clamped > prevLayerClamped) elementsClamped++
      return out
    })

    maxSatByLayer[layer.name] = ls.maxSat
    return { ...layer, elements: processedElements }
  })

  return {
    result: { ...overlay, layers: processedLayers },
    report: {
      elements_total: elementsTotal,
      elements_with_colors_clamped: elementsClamped,
      clamp_ratio: elementsTotal > 0 ? elementsClamped / elementsTotal : 0,
      max_observed_saturation_by_layer: maxSatByLayer,
      out_of_bounds_rejected: 0,
    },
  }
}
