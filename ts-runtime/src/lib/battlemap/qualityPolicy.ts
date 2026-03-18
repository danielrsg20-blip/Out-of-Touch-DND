import { BATTLEMAP_QUALITY_MODES, type BattlemapQualityMode, type BattlemapStyleConfig } from './types.js'
import { inferImageSize } from './promptFactory.js'

export function resolveBattlemapQualityMode(value: unknown, fallback: BattlemapQualityMode = 'final'): BattlemapQualityMode {
  return value === 'fast' || value === 'final' ? value : fallback
}

export function parseGenerateQualityMode(value: unknown): BattlemapQualityMode {
  if (typeof value === 'undefined') {
    return 'final'
  }
  if (typeof value !== 'string' || !BATTLEMAP_QUALITY_MODES.includes(value as BattlemapQualityMode)) {
    throw new Error(`quality_mode must be one of: ${BATTLEMAP_QUALITY_MODES.join(', ')}`)
  }
  return value as BattlemapQualityMode
}

export function parseRegenerateQualityMode(value: unknown): BattlemapQualityMode | undefined {
  if (typeof value === 'undefined') {
    return undefined
  }
  if (typeof value !== 'string' || !BATTLEMAP_QUALITY_MODES.includes(value as BattlemapQualityMode)) {
    throw new Error(`quality_mode must be one of: ${BATTLEMAP_QUALITY_MODES.join(', ')}`)
  }
  return value as BattlemapQualityMode
}

export function defaultGridCellSizeWorldForQuality(mode: BattlemapQualityMode): number {
  return mode === 'fast' ? 10 : 5
}

export function resolveImageSizeForQuality(
  mode: BattlemapQualityMode,
  style?: BattlemapStyleConfig,
): '1024x1024' | '1792x1024' | '1024x1792' {
  if (mode === 'fast') {
    return '1024x1024'
  }
  return inferImageSize(style)
}

export function resolveImageQualityForMode(mode: BattlemapQualityMode, finalHdEnabled: boolean): 'standard' | 'hd' {
  if (mode === 'final' && finalHdEnabled) {
    return 'hd'
  }
  return 'standard'
}
