function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function envValue(primary: string, secondary: string): string | undefined {
  return process.env[primary] ?? process.env[secondary]
}

export type VectorMapFeatureFlags = {
  vector_map_generation_ts_enabled: boolean
  vector_grid_derivation_enabled: boolean
  vector_grid_authoritative_enabled: boolean
  vector_compat_outputs_enabled: boolean
  grid_resolution_v2_enabled: boolean
}

export function getVectorMapFeatureFlags(): VectorMapFeatureFlags {
  return {
    vector_map_generation_ts_enabled: parseBool(envValue('vector_map_generation_ts_enabled', 'VECTOR_MAP_GENERATION_TS_ENABLED'), true),
    vector_grid_derivation_enabled: parseBool(envValue('vector_grid_derivation_enabled', 'VECTOR_GRID_DERIVATION_ENABLED'), true),
    vector_grid_authoritative_enabled: parseBool(envValue('vector_grid_authoritative_enabled', 'VECTOR_GRID_AUTHORITATIVE_ENABLED'), false),
    vector_compat_outputs_enabled: parseBool(envValue('vector_compat_outputs_enabled', 'VECTOR_COMPAT_OUTPUTS_ENABLED'), true),
    grid_resolution_v2_enabled: parseBool(envValue('grid_resolution_v2_enabled', 'GRID_RESOLUTION_V2_ENABLED'), true),
  }
}
