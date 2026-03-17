import type { FastifyInstance } from 'fastify'
import { generateVectorMap } from '../lib/vectorMap/generateVectorMap.js'
import { getVectorMapFeatureFlags } from '../lib/vectorMap/featureFlags.js'
import { parseGenerateVectorMapApiRequest, normalizeApiSeed } from '../lib/vectorMap/apiRequest.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

export async function registerVectorMapGenerateRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/tools/generate_vector_map', async (request, reply) => {
    const flags = getVectorMapFeatureFlags()
    if (!flags.vector_map_generation_ts_enabled) {
      reply.status(503)
      return { error: 'generate_vector_map is disabled by feature flag vector_map_generation_ts_enabled' }
    }
    if (!flags.vector_grid_derivation_enabled) {
      reply.status(503)
      return { error: 'generate_vector_map is disabled by feature flag vector_grid_derivation_enabled' }
    }

    const body = asRecord(request.body)
    if (!body) {
      reply.status(400)
      return { error: 'Request body must be a JSON object' }
    }
    if (normalizeApiSeed(body.seed) == null) {
      reply.status(400)
      return { error: 'seed is required and must be a number or non-empty string' }
    }

    const parsed = parseGenerateVectorMapApiRequest(body, flags.grid_resolution_v2_enabled)

    const response = generateVectorMap(parsed)

    response.overlay.metadata = {
      ...(response.overlay.metadata ?? {}),
      preset_id: parsed.preset_id,
      style_preset: parsed.style_options?.style_preset ?? parsed.style_preset,
      rollout_flags: {
        vector_map_generation_ts_enabled: flags.vector_map_generation_ts_enabled,
        vector_grid_derivation_enabled: flags.vector_grid_derivation_enabled,
        vector_grid_authoritative_enabled: flags.vector_grid_authoritative_enabled,
        vector_compat_outputs_enabled: flags.vector_compat_outputs_enabled,
        grid_resolution_v2_enabled: flags.grid_resolution_v2_enabled,
      },
    }

    if (!flags.vector_compat_outputs_enabled) {
      response.compatibility = {
        legacy_tiles: {
          width: response.traversal_grid.width_cells,
          height: response.traversal_grid.height_cells,
          tiles: [],
        },
        legacy_entities: { entities: [] },
      }
    }

    return reply.send(response)
  })
}
