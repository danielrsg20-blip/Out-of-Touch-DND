import { canonicalHash } from './deterministic.js'
import { DEFAULT_VECTOR_MAP_PRESET_ID, getVectorMapPresetById } from './presetCatalog.js'
import type { GenerateVectorMapApiRequest } from './apiContract.js'
import type { GenerateVectorMapRequest } from './types.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function normalizeApiSeed(seed: unknown): number | null {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(Math.trunc(seed))
  }
  if (typeof seed === 'string') {
    const trimmed = seed.trim()
    if (trimmed.length === 0) {
      return null
    }
    if (/^-?\d+$/.test(trimmed)) {
      return Math.abs(Number.parseInt(trimmed, 10))
    }
    return Number.parseInt(canonicalHash({ seed: trimmed }).slice(0, 8), 16)
  }
  return null
}

export function parseGenerateVectorMapApiRequest(body: JsonRecord, gridResolutionV2Enabled: boolean): GenerateVectorMapRequest {
  const boundsRaw = asRecord(body.bounds_world) ?? {}
  const genRaw = asRecord(body.generation_params) ?? {}
  const gridRaw = asRecord(body.grid_config) ?? {}
  const styleRaw = asRecord(body.style_options) ?? {}

  const normalizedSeed = normalizeApiSeed(body.seed)
  if (normalizedSeed == null) {
    throw new Error('seed is required and must be a number or non-empty string')
  }

  const preset = getVectorMapPresetById(asOptionalString(body.preset_id) ?? DEFAULT_VECTOR_MAP_PRESET_ID)
  const requestedStylePreset = asOptionalString(body.style_preset)
  const stylePreset = asOptionalString(styleRaw.style_preset) ?? requestedStylePreset ?? preset.stylePreset
  const maxSaturation =
    typeof styleRaw.max_saturation === 'number'
      ? styleRaw.max_saturation
      : (() => {
          const sc = asRecord(body.saturation_constraint)
          return sc && typeof sc.max_saturation === 'number' ? sc.max_saturation : 0.65
        })()

  const request: GenerateVectorMapRequest = {
    request_id: asOptionalString(body.request_id),
    seed: normalizedSeed,
    preset_id: preset.id,
    map_id: asOptionalString(body.map_id),
    name: asString(body.name, preset.label),
    biome: (asOptionalString(body.biome) as GenerateVectorMapRequest['biome'] | undefined) ?? preset.biome,
    story_prompt: asOptionalString(body.story_prompt) ?? preset.storyPrompt,
    style_preset: stylePreset,
    style_options: {
      style_preset: stylePreset,
      max_saturation: maxSaturation,
      allow_magic_glow:
        typeof styleRaw.allow_magic_glow === 'boolean'
          ? styleRaw.allow_magic_glow
          : (() => {
              const sc = asRecord(body.saturation_constraint)
              return sc && typeof sc.allow_magic_glow === 'boolean' ? sc.allow_magic_glow : false
            })(),
    },
    bounds_world: {
      origin_x: asNumber(boundsRaw.origin_x, 0),
      origin_y: asNumber(boundsRaw.origin_y, 0),
      width_world: asNumber(boundsRaw.width_world, 100),
      height_world: asNumber(boundsRaw.height_world, 75),
    },
    generation_params: {
      room_count: asNumber(genRaw.room_count, preset.generationDefaults.room_count ?? 8),
      corridor_width_cells: asNumber(genRaw.corridor_width_cells, preset.generationDefaults.corridor_width_cells ?? 2),
      obstacle_density: asNumber(genRaw.obstacle_density, preset.generationDefaults.obstacle_density ?? 0.1),
      hazard_density: asNumber(genRaw.hazard_density, preset.generationDefaults.hazard_density ?? 0.1),
      ...(genRaw.layout_hints && typeof genRaw.layout_hints === 'object' ? { layout_hints: genRaw.layout_hints as NonNullable<GenerateVectorMapRequest['generation_params']>['layout_hints'] } : {}),
    },
    grid_config: {
      base_cell_size_world: asNumber(gridRaw.base_cell_size_world, 5),
      resolution_scale: gridResolutionV2Enabled ? Math.max(1, Math.floor(asNumber(gridRaw.resolution_scale, 2))) : 1,
      diagonal_policy: asString(gridRaw.diagonal_policy, 'allow') as 'allow' | 'forbid',
      movement_cost_mode: 'world_units',
    },
    validation_mode: asString(body.validation_mode, 'fixup') as 'strict' | 'fixup',
    saturation_constraint: {
      max_saturation: maxSaturation,
      allow_magic_glow:
        typeof styleRaw.allow_magic_glow === 'boolean'
          ? styleRaw.allow_magic_glow
          : (() => {
              const sc = asRecord(body.saturation_constraint)
              return sc && typeof sc.allow_magic_glow === 'boolean' ? sc.allow_magic_glow : false
            })(),
    },
  }

  return request
}