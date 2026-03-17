import type { GenerateVectorMapRequest, GenerateVectorMapResponse } from './types.js'
import type { VectorMapPresetId } from './presetCatalog.js'

export type VectorMapStyleOptions = {
  style_preset?: string
  max_saturation?: number
  allow_magic_glow?: boolean
}

export type GenerateVectorMapApiRequest = {
  request_id?: string
  seed: number | string
  preset_id?: VectorMapPresetId
  map_id?: string
  name?: string
  biome?: GenerateVectorMapRequest['biome']
  story_prompt?: string
  style_preset?: string
  bounds_world?: Partial<GenerateVectorMapRequest['bounds_world']>
  generation_params?: Partial<NonNullable<GenerateVectorMapRequest['generation_params']>>
  grid_config?: Partial<NonNullable<GenerateVectorMapRequest['grid_config']>>
  validation_mode?: GenerateVectorMapRequest['validation_mode']
  saturation_constraint?: GenerateVectorMapRequest['saturation_constraint']
  style_options?: VectorMapStyleOptions
}

export type GenerateVectorMapApiResponse = GenerateVectorMapResponse