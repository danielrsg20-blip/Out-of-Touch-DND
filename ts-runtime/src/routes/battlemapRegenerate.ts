import type { FastifyInstance } from 'fastify'
import { regenerateBattlemap } from '../lib/battlemap/service.js'
import { parseRegenerateQualityMode } from '../lib/battlemap/qualityPolicy.js'
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
      const qualityMode = parseRegenerateQualityMode(body.quality_mode)
      const seed = typeof body.seed === 'string' || typeof body.seed === 'number' ? body.seed : undefined

      const result = await regenerateBattlemap({
        battlemap_id: battlemapId,
        mode,
        quality_mode: qualityMode,
        seed,
      })
      const traversal = result.asset.traversal_grid

      return reply.send({
        success: true,
        battlemap_asset: result.asset,
        traversal_grid: traversal,
        map_patch: {
          metadata: {
            image_url: result.asset.image_url,
            image_opacity: 1,
            map_source: 'generated',
            map_mode: 'ai_generated_image',
            generation_quality_mode: result.asset.generation_audit.quality_mode ?? 'final',
            image_width_px: result.asset.image_width_px,
            image_height_px: result.asset.image_height_px,
            grid_width_cells: Number(traversal?.width_cells ?? 0),
            grid_height_cells: Number(traversal?.height_cells ?? 0),
            grid_cell_size_px: Number(traversal?.cell_size_world ?? 0),
          },
          traversal_grid: traversal,
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
