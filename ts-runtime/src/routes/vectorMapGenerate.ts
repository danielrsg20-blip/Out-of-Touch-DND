import type { FastifyInstance } from 'fastify'
import { generateVectorMap } from '../lib/vectorMap/generateVectorMap.js'
import type { GenerateVectorMapRequest } from '../lib/vectorMap/types.js'
import { getVectorMapFeatureFlags } from '../lib/vectorMap/featureFlags.js'

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
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function parseRequest(body: JsonRecord): GenerateVectorMapRequest {
  const boundsRaw = asRecord(body.bounds_world) ?? {}
  const genRaw = asRecord(body.generation_params) ?? {}
  const gridRaw = asRecord(body.grid_config) ?? {}

  return {
    request_id: asOptionalString(body.request_id),
    seed: asNumber(body.seed, 1),
    map_id: asOptionalString(body.map_id),
    name: asString(body.name, 'Generated Vector Map'),
    biome: asString(body.biome, 'dungeon') as GenerateVectorMapRequest['biome'],
    story_prompt: asString(body.story_prompt, ''),
    style_preset: asString(body.style_preset, 'default'),
    bounds_world: {
      origin_x: asNumber(boundsRaw.origin_x, 0),
      origin_y: asNumber(boundsRaw.origin_y, 0),
      width_world: asNumber(boundsRaw.width_world, 640),
      height_world: asNumber(boundsRaw.height_world, 480),
    },
    generation_params: {
      room_count: asNumber(genRaw.room_count, 8),
      corridor_width_cells: asNumber(genRaw.corridor_width_cells, 2),
      obstacle_density: asNumber(genRaw.obstacle_density, 0.1),
      hazard_density: asNumber(genRaw.hazard_density, 0.1),
    },
    grid_config: {
      base_cell_size_world: asNumber(gridRaw.base_cell_size_world, 5),
      resolution_scale: Math.max(1, Math.floor(asNumber(gridRaw.resolution_scale, 2))),
      diagonal_policy: asString(gridRaw.diagonal_policy, 'allow') as 'allow' | 'forbid',
      movement_cost_mode: 'world_units',
    },
    validation_mode: asString(body.validation_mode, 'fixup') as 'strict' | 'fixup',
  }
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
    if (typeof body.seed !== 'number' || !Number.isFinite(body.seed)) {
      reply.status(400)
      return { error: 'seed is required and must be numeric' }
    }

    const parsed = parseRequest(body)
    if (!flags.grid_resolution_v2_enabled) {
      parsed.grid_config = {
        ...(parsed.grid_config ?? { base_cell_size_world: 5, resolution_scale: 1 }),
        resolution_scale: 1,
      }
    }

    const response = generateVectorMap(parsed)

    response.overlay.metadata = {
      ...(response.overlay.metadata ?? {}),
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
