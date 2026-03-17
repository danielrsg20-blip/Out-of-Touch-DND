import type { FastifyInstance } from 'fastify'
import { regenerateBattlemap } from '../lib/battlemap/service.js'
import type { BattlemapRegenerationMode } from '../lib/battlemap/types.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseMode(value: unknown): BattlemapRegenerationMode {
  if (value === 'same_settings' || value === 'new_seed' || value === 'traversal_only') {
    return value
  }
  return 'same_settings'
}

export async function registerBattlemapRegenerateRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/tools/regenerate_battlemap', async (request, reply) => {
    try {
      const body = asRecord(request.body)
      if (!body) {
        reply.status(400)
        return { error: 'Request body must be a JSON object' }
      }

      const battlemapId = asString(body.battlemap_id)?.trim()
      if (!battlemapId) {
        reply.status(400)
        return { error: 'battlemap_id is required' }
      }

      const mode = parseMode(body.mode)
      const seed = typeof body.seed === 'string' || typeof body.seed === 'number' ? body.seed : undefined

      const result = await regenerateBattlemap({
        battlemap_id: battlemapId,
        mode,
        seed,
      })

      return reply.send({
        success: true,
        battlemap_asset: result.asset,
        traversal_grid: result.asset.traversal_grid,
        map_patch: {
          metadata: {
            image_url: result.asset.image_url,
            image_opacity: 1,
            map_source: 'generated',
          },
          traversal_grid: result.asset.traversal_grid,
        },
        generation_timing: result.generation_timing,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error'
      const status = /required|must be|missing|invalid|mismatch|not found/i.test(message) ? 400 : 500
      reply.status(status)
      return { error: message }
    }
  })
}
