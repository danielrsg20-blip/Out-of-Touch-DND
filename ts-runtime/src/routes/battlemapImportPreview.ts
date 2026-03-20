import type { FastifyInstance } from 'fastify'
import { generateBattlemapImportPreview } from '../lib/battlemap/importPreview.js'
import { parseGenerateQualityMode } from '../lib/battlemap/qualityPolicy.js'
import {
  ENCOUNTER_TYPES,
  MOOD_STYLES,
  SCENE_BIOMES,
  SCENE_LOCATIONS,
  type BattlemapImportPreviewRequest,
} from '../lib/battlemap/types.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function ensureEnum<T extends readonly string[]>(value: string | null, allowed: T, fieldName: string): T[number] {
  if (!value || !allowed.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(', ')}`)
  }
  return value as T[number]
}

function parseRequest(body: JsonRecord): BattlemapImportPreviewRequest {
  const imageUrl = asString(body.image_url)?.trim()
  if (!imageUrl) {
    throw new Error('image_url is required')
  }

  const sceneSpecRaw = asRecord(body.scene_spec)
  if (!sceneSpecRaw) {
    throw new Error('scene_spec is required and must be an object')
  }

  const mapWidthFeet = asNumber(sceneSpecRaw.map_width_feet)
  const mapHeightFeet = asNumber(sceneSpecRaw.map_height_feet)
  if (!mapWidthFeet || !mapHeightFeet) {
    throw new Error('scene_spec.map_width_feet and scene_spec.map_height_feet are required numbers')
  }

  const gridRaw = asRecord(body.grid_settings)

  return {
    image_url: imageUrl,
    quality_mode: parseGenerateQualityMode(body.quality_mode),
    include_preview_artifacts: typeof body.include_preview_artifacts === 'boolean'
      ? body.include_preview_artifacts
      : undefined,
    scene_spec: {
      location: ensureEnum(asString(sceneSpecRaw.location), SCENE_LOCATIONS, 'scene_spec.location'),
      biome: ensureEnum(asString(sceneSpecRaw.biome), SCENE_BIOMES, 'scene_spec.biome'),
      encounter_type: ensureEnum(asString(sceneSpecRaw.encounter_type), ENCOUNTER_TYPES, 'scene_spec.encounter_type'),
      notable_features: asStringArray(sceneSpecRaw.notable_features),
      mood_style: ensureEnum(asString(sceneSpecRaw.mood_style), MOOD_STYLES, 'scene_spec.mood_style'),
      map_width_feet: mapWidthFeet,
      map_height_feet: mapHeightFeet,
      campaign_tone: asString(sceneSpecRaw.campaign_tone) ?? undefined,
    },
    grid_settings: gridRaw
      ? {
          cell_size_world: asNumber(gridRaw.cell_size_world) ?? undefined,
          line_thickness: asNumber(gridRaw.line_thickness) ?? undefined,
          line_opacity: asNumber(gridRaw.line_opacity) ?? undefined,
          line_color: asString(gridRaw.line_color) ?? undefined,
          show_coordinates: typeof gridRaw.show_coordinates === 'boolean' ? gridRaw.show_coordinates : undefined,
        }
      : undefined,
    grid_width_cells: asNumber(body.grid_width_cells) ?? undefined,
    grid_height_cells: asNumber(body.grid_height_cells) ?? undefined,
  }
}

export async function registerBattlemapImportPreviewRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/tools/import_battlemap_preview', async (request, reply) => {
    try {
      const body = asRecord(request.body)
      if (!body) {
        reply.status(400)
        return { error: 'Request body must be a JSON object' }
      }

      const parsed = parseRequest(body)
      const result = await generateBattlemapImportPreview(parsed)

      return reply.send({
        success: true,
        traversal_grid: result.traversal_grid,
        diagnostics: result.diagnostics,
        extraction_pipeline: result.extraction_pipeline,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error'
      const status = /required|must be|missing|invalid|mismatch/i.test(message) ? 400 : 500
      reply.status(status)
      return { error: message }
    }
  })
}
