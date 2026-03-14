/**
 * overlaySchemas.ts
 *
 * Schema validation for overlay data structures.
 * Phase 1 MVP: simple type checking without external validation libs.
 * Phase 2+: can upgrade to Zod or similar for stricter validation.
 */

import type {
  Overlay,
} from '../types'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * Validate a complete Overlay object
 */
export function validateOverlay(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  const obj = asRecord(data)

  if (!obj) {
    return { valid: false, errors: ['Overlay must be an object'] }
  }

  // Required fields
  if (!asString(obj.id)) {
    errors.push('Overlay.id must be a non-empty string')
  }
  if (!asString(obj.name)) {
    errors.push('Overlay.name must be a non-empty string')
  }
  if (!asString(obj.version)) {
    errors.push('Overlay.version must be a string')
  }

  // Layers
  if (!Array.isArray(obj.layers)) {
    errors.push('Overlay.layers must be an array')
  } else {
    obj.layers.forEach((layer: unknown, idx: number) => {
      const layerErrors = validateOverlayLayer(layer)
      layerErrors.forEach((err) => errors.push(`Layer[${idx}]: ${err}`))
    })
  }

  // Styles (optional)
  const styles = asRecord(obj.styles)
  if (styles) {
    for (const [styleName, styleValue] of Object.entries(styles)) {
      const styleErrors = validateStyle(styleValue)
      styleErrors.forEach((err) => errors.push(`Style[${styleName}]: ${err}`))
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate an OverlayLayer
 */
function validateOverlayLayer(data: unknown): string[] {
  const errors: string[] = []
  const obj = asRecord(data)

  if (!obj) {
    return ['Layer must be an object']
  }

  if (!asString(obj.id)) {
    errors.push('Layer.id must be a non-empty string')
  }
  if (!asString(obj.name)) {
    errors.push('Layer.name must be a non-empty string')
  }
  if (asNumber(obj.z_index) === null) {
    errors.push('Layer.z_index must be a number')
  }
  if (asBoolean(obj.visible) === null) {
    errors.push('Layer.visible must be a boolean')
  }

  const validBlendModes = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
  ]
  if (!validBlendModes.includes(asString(obj.blend_mode) ?? '')) {
    errors.push(`Layer.blend_mode must be one of: ${validBlendModes.join(', ')}`)
  }

  const opacity = asNumber(obj.opacity)
  if (opacity === null || opacity < 0 || opacity > 1) {
    errors.push('Layer.opacity must be a number between 0 and 1')
  }

  if (!Array.isArray(obj.elements)) {
    errors.push('Layer.elements must be an array')
  } else {
    obj.elements.forEach((elem: unknown, idx: number) => {
      const elemErrors = validateElement(elem)
      elemErrors.forEach((err) => errors.push(`Element[${idx}]: ${err}`))
    })
  }

  return errors
}

/**
 * Validate an OverlayElement (polymorphic: Region, Path, or Decal)
 */
function validateElement(data: unknown): string[] {
  const errors: string[] = []
  const obj = asRecord(data)

  if (!obj) {
    return ['Element must be an object']
  }

  const validTypes = ['polygon', 'polyline', 'decal']
  const elementType = asString(obj.type) ?? ''
  if (!validTypes.includes(elementType)) {
    errors.push(`Element.type must be one of: ${validTypes.join(', ')}`)
    return errors
  }

  // Common fields
  if (!asString(obj.id)) {
    errors.push('Element.id must be a non-empty string')
  }
  if (!asString(obj.name)) {
    errors.push('Element.name must be a non-empty string')
  }

  // Type-specific validation
  if (elementType === 'polygon') {
    return errors.concat(validateRegion(obj))
  } else if (elementType === 'polyline') {
    return errors.concat(validatePath(obj))
  } else if (elementType === 'decal') {
    return errors.concat(validateDecal(obj))
  }

  return errors
}

/**
 * Validate a Region (polygon)
 */
function validateRegion(data: UnknownRecord): string[] {
  const errors: string[] = []

  if (!Array.isArray(data.points) || data.points.length < 3) {
    errors.push('Region.points must be an array with at least 3 points')
  } else {
    data.points.forEach((p: unknown, idx: number) => {
      const point = asRecord(p)
      if (!point || asNumber(point.x) === null || asNumber(point.y) === null) {
        errors.push(`Point[${idx}]: must have x and y as numbers`)
      }
    })
  }

  const fill = asRecord(data.fill)
  if (!fill) {
    errors.push('Region.fill must be an object')
  } else {
    if (!asString(fill.color)) {
      errors.push('Region.fill.color must be a string')
    }
  }

  const stroke = asRecord(data.stroke)
  if (stroke) {
    const width = asNumber(stroke.width)
    if (width === null || width < 0) {
      errors.push('Region.stroke.width must be a non-negative number')
    }
  }

  return errors
}

/**
 * Validate a Path (polyline)
 */
function validatePath(data: UnknownRecord): string[] {
  const errors: string[] = []

  if (!Array.isArray(data.points) || data.points.length < 2) {
    errors.push('Path.points must be an array with at least 2 points')
  } else {
    data.points.forEach((p: unknown, idx: number) => {
      const point = asRecord(p)
      if (!point || asNumber(point.x) === null || asNumber(point.y) === null) {
        errors.push(`Point[${idx}]: must have x and y as numbers`)
      }
    })
  }

  const stroke = asRecord(data.stroke)
  if (!stroke) {
    errors.push('Path.stroke must be an object')
  } else {
    if (!asString(stroke.color)) {
      errors.push('Path.stroke.color must be a string')
    }
    const width = asNumber(stroke.width)
    if (width === null || width < 0) {
      errors.push('Path.stroke.width must be a non-negative number')
    }
  }

  return errors
}

/**
 * Validate a Decal (stamped symbol)
 */
function validateDecal(data: UnknownRecord): string[] {
  const errors: string[] = []

  const position = asRecord(data.position)
  if (!position || asNumber(position.x) === null || asNumber(position.y) === null) {
    errors.push('Decal.position must have x and y as numbers')
  }

  if (!asString(data.decal_type)) {
    errors.push('Decal.decal_type must be a non-empty string')
  }

  return errors
}

/**
 * Validate a StyleDefinition
 */
function validateStyle(data: unknown): string[] {
  const errors: string[] = []
  const obj = asRecord(data)

  if (!obj) {
    return ['Style must be an object']
  }

  if (!asString(obj.id)) {
    errors.push('Style.id must be a non-empty string')
  }
  if (!asString(obj.name)) {
    errors.push('Style.name must be a non-empty string')
  }

  if (!asRecord(obj.palette)) {
    errors.push('Style.palette must be an object')
  }

  return errors
}

/**
 * Safe parse: try to validate overlay, return null if invalid
 */
export function parseOverlay(data: unknown): Overlay | null {
  const { valid } = validateOverlay(data)
  if (!valid) return null

  try {
    return data as Overlay
  } catch (err) {
    console.error('Failed to parse overlay:', err)
    return null
  }
}

/**
 * Create a minimal valid overlay with default layers
 */
export function createDefaultOverlay(id: string, name: string): Overlay {
  const now = new Date().toISOString()

  return {
    id,
    name,
    version: '1.0',
    created_at: now,
    metadata: {},
    styles: {
      default: {
        id: 'default',
        name: 'Default Style',
        palette: {
          primary: '#3a3a3a',
          secondary: '#8b8b8b',
          accent_1: '#ff6b35',
          accent_2: '#4ecdc4',
          accent_3: '#95e1d3',
        },
        noise_seed: Math.floor(Math.random() * 100000),
        edge_feathering: 3,
        jitter: 0.1,
        decal_library: {},
      },
    },
    layers: [
      {
        id: 'layer_base_biome',
        name: 'BaseBiomeOverlay',
        z_index: 10,
        visible: true,
        blend_mode: 'normal',
        opacity: 1.0,
        elements: [],
      },
      {
        id: 'layer_detail',
        name: 'DetailOverlay',
        z_index: 20,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.8,
        elements: [],
      },
      {
        id: 'layer_weather',
        name: 'WeatherOverlay',
        z_index: 30,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.6,
        elements: [],
      },
      {
        id: 'layer_magic',
        name: 'MagicOverlay',
        z_index: 40,
        visible: true,
        blend_mode: 'screen',
        opacity: 0.5,
        elements: [],
      },
    ],
  }
}
