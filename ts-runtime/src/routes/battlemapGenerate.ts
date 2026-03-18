import type { FastifyInstance } from 'fastify'
import { generateBattlemap } from '../lib/battlemap/service.js'
import { parseGenerateQualityMode } from '../lib/battlemap/qualityPolicy.js'
import {
  ENCOUNTER_TYPES,
  MOOD_STYLES,
  SATURATION_PRESETS,
  SCENE_BIOMES,
  SCENE_LOCATIONS,
  type BattlemapGenerationRequest,
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

function parseRequest(body: JsonRecord): BattlemapGenerationRequest {
  const campaignId = asString(body.campaign_id)?.trim()
  if (!campaignId) {
    throw new Error('campaign_id is required')
  }

  const sceneSpecRaw = asRecord(body.scene_spec)
  if (!sceneSpecRaw) {
    throw new Error('scene_spec is required and must be an object')
  }

  const location = ensureEnum(asString(sceneSpecRaw.location), SCENE_LOCATIONS, 'scene_spec.location')
  const biome = ensureEnum(asString(sceneSpecRaw.biome), SCENE_BIOMES, 'scene_spec.biome')
  const encounterType = ensureEnum(asString(sceneSpecRaw.encounter_type), ENCOUNTER_TYPES, 'scene_spec.encounter_type')
  const moodStyle = ensureEnum(asString(sceneSpecRaw.mood_style), MOOD_STYLES, 'scene_spec.mood_style')

  const mapWidthFeet = asNumber(sceneSpecRaw.map_width_feet)
  const mapHeightFeet = asNumber(sceneSpecRaw.map_height_feet)
  if (!mapWidthFeet || !mapHeightFeet) {
    throw new Error('scene_spec.map_width_feet and scene_spec.map_height_feet are required numbers')
  }

  const styleConfigRaw = asRecord(body.style_config)
  const saturation = styleConfigRaw ? asString(styleConfigRaw.color_saturation) : null
  if (saturation && !SATURATION_PRESETS.includes(saturation as (typeof SATURATION_PRESETS)[number])) {
    throw new Error(`style_config.color_saturation must be one of: ${SATURATION_PRESETS.join(', ')}`)
  }

  const gridRaw = asRecord(body.grid_settings)

  return {
    campaign_id: campaignId,
    quality_mode: parseGenerateQualityMode(body.quality_mode),
    scene_spec: {
      location,
      biome,
      encounter_type: encounterType,
      notable_features: asStringArray(sceneSpecRaw.notable_features),
      mood_style: moodStyle,
      map_width_feet: mapWidthFeet,
      map_height_feet: mapHeightFeet,
      campaign_tone: asString(sceneSpecRaw.campaign_tone) ?? undefined,
    },
    seed: typeof body.seed === 'string' || typeof body.seed === 'number' ? body.seed : undefined,
    style_config: styleConfigRaw
      ? {
          color_saturation: saturation ? (saturation as (typeof SATURATION_PRESETS)[number]) : undefined,
          contrast_level: asString(styleConfigRaw.contrast_level) as 'low' | 'medium' | 'high' | undefined,
          orientation: asString(styleConfigRaw.orientation) as 'landscape' | 'portrait' | 'square' | undefined,
        }
      : undefined,
    grid_settings: gridRaw
      ? {
          cell_size_world: asNumber(gridRaw.cell_size_world) ?? undefined,
          line_thickness: asNumber(gridRaw.line_thickness) ?? undefined,
          line_opacity: asNumber(gridRaw.line_opacity) ?? undefined,
          line_color: asString(gridRaw.line_color) ?? undefined,
          show_coordinates: typeof gridRaw.show_coordinates === 'boolean' ? gridRaw.show_coordinates : undefined,
        }
      : undefined,
  }
}

export async function registerBattlemapGenerateRoute(app: FastifyInstance): Promise<void> {
  app.post('/api/tools/generate_battlemap', async (request, reply) => {
    try {
      const body = asRecord(request.body)
      if (!body) {
        reply.status(400)
        return { error: 'Request body must be a JSON object' }
      }

      const parsed = parseRequest(body)
      const result = await generateBattlemap(parsed)
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
      const status = /required|must be|missing|invalid|mismatch/i.test(message) ? 400 : 500
      reply.status(status)
      return { error: message }
    }
  })
}
