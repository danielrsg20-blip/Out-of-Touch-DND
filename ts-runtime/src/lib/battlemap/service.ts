import { buildBattlemapPrompt } from './promptFactory.js'
import { createBattlemapProvider } from './providerFactory.js'
import type {
  BattlemapAsset,
  BattlemapGenerationRequest,
  BattlemapGenerationResult,
  BattlemapRegenerationRequest,
  GridOverlayConfig,
  SceneSpec,
} from './types.js'
import { DEFAULT_GRID_OVERLAY_CONFIG } from './types.js'
import {
  getBattlemapAssetById,
  insertBattlemapAsset,
  updateBattlemapAsset,
  uploadBattlemapImage,
} from './repository.js'

function ensureFinitePositiveInt(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`)
  }
  return Math.floor(value)
}

function mergeGridConfig(input: Partial<GridOverlayConfig> | undefined): GridOverlayConfig {
  const merged: GridOverlayConfig = {
    cell_size_world: input?.cell_size_world ?? DEFAULT_GRID_OVERLAY_CONFIG.cell_size_world,
    line_thickness: input?.line_thickness ?? DEFAULT_GRID_OVERLAY_CONFIG.line_thickness,
    line_opacity: input?.line_opacity ?? DEFAULT_GRID_OVERLAY_CONFIG.line_opacity,
    line_color: input?.line_color ?? DEFAULT_GRID_OVERLAY_CONFIG.line_color,
    show_coordinates: input?.show_coordinates ?? DEFAULT_GRID_OVERLAY_CONFIG.show_coordinates,
  }

  if (!Number.isFinite(merged.cell_size_world) || merged.cell_size_world <= 0) {
    throw new Error('grid_settings.cell_size_world must be a positive number')
  }
  if (!Number.isFinite(merged.line_opacity) || merged.line_opacity < 0 || merged.line_opacity > 1) {
    throw new Error('grid_settings.line_opacity must be between 0 and 1')
  }

  return merged
}

function validateSceneSpec(scene: SceneSpec): void {
  if (!scene.location || !scene.biome || !scene.encounter_type || !scene.mood_style) {
    throw new Error('scene_spec is missing required enum fields')
  }
  ensureFinitePositiveInt(scene.map_width_feet, 'scene_spec.map_width_feet')
  ensureFinitePositiveInt(scene.map_height_feet, 'scene_spec.map_height_feet')
}

export async function generateBattlemap(request: BattlemapGenerationRequest): Promise<BattlemapGenerationResult> {
  if (!request.campaign_id || !request.campaign_id.trim()) {
    throw new Error('campaign_id is required')
  }
  validateSceneSpec(request.scene_spec)

  const startedAt = Date.now()
  const grid = mergeGridConfig(request.grid_settings)
  const prompt = buildBattlemapPrompt(request.scene_spec, request.style_config)

  const provider = createBattlemapProvider('openai')

  const imageStarted = Date.now()
  const image = await provider.generateBattlemapImage({
    prompt,
    seed: request.seed,
    style: request.style_config,
  })
  const imageMs = Date.now() - imageStarted

  if (image.widthPx <= 0 || image.heightPx <= 0) {
    throw new Error('Generated image dimensions were invalid')
  }

  const assetId = crypto.randomUUID()
  const imageUrl = await uploadBattlemapImage(request.campaign_id, assetId, image.bytes, image.mimeType)

  const gridWidthCells = ensureFinitePositiveInt(request.scene_spec.map_width_feet / grid.cell_size_world, 'grid width')
  const gridHeightCells = ensureFinitePositiveInt(request.scene_spec.map_height_feet / grid.cell_size_world, 'grid height')

  const traversalStarted = Date.now()
  const traversal = await provider.generateTraversalData({
    imageUrl,
    sceneSpec: request.scene_spec,
    gridWidthCells,
    gridHeightCells,
    cellSizeWorld: grid.cell_size_world,
  })
  const traversalMs = Date.now() - traversalStarted

  if (traversal.grid.width_cells !== gridWidthCells || traversal.grid.height_cells !== gridHeightCells) {
    throw new Error('Traversal grid dimensions did not match expected grid settings')
  }

  const nowIso = new Date().toISOString()
  const asset: BattlemapAsset = {
    id: assetId,
    campaign_id: request.campaign_id,
    scene_spec: request.scene_spec,
    image_url: imageUrl,
    image_width_px: image.widthPx,
    image_height_px: image.heightPx,
    grid_overlay_config: grid,
    traversal_grid: traversal.grid,
    generation_audit: {
      provider: 'openai',
      model: image.model,
      model_version: image.modelVersion,
      prompt,
      prompt_revision: image.revisedPrompt,
      generated_at: nowIso,
      seed: request.seed,
      seed_supported: image.seedSupported,
      image_generation_ms: imageMs,
      traversal_generation_ms: traversalMs,
      no_text_or_watermark_best_effort: traversal.containsTextOrWatermark === false,
    },
    created_at: nowIso,
    updated_at: nowIso,
  }

  const persisted = await insertBattlemapAsset(asset)

  return {
    asset: persisted,
    generation_timing: {
      image_generation_ms: imageMs,
      traversal_generation_ms: traversalMs,
      total_ms: Date.now() - startedAt,
    },
  }
}

export async function regenerateBattlemap(request: BattlemapRegenerationRequest): Promise<BattlemapGenerationResult> {
  if (!request.battlemap_id || !request.battlemap_id.trim()) {
    throw new Error('battlemap_id is required')
  }

  const existing = await getBattlemapAssetById(request.battlemap_id)
  if (!existing) {
    throw new Error(`battlemap ${request.battlemap_id} not found`)
  }

  const startedAt = Date.now()
  const provider = createBattlemapProvider('openai')
  const nowIso = new Date().toISOString()

  const mapWidthFeet = ensureFinitePositiveInt(existing.scene_spec.map_width_feet, 'scene_spec.map_width_feet')
  const mapHeightFeet = ensureFinitePositiveInt(existing.scene_spec.map_height_feet, 'scene_spec.map_height_feet')
  const gridWidthCells = ensureFinitePositiveInt(mapWidthFeet / existing.grid_overlay_config.cell_size_world, 'grid width')
  const gridHeightCells = ensureFinitePositiveInt(mapHeightFeet / existing.grid_overlay_config.cell_size_world, 'grid height')

  let imageMs = 0
  let traversalMs = 0
  let imageUrl = existing.image_url
  let imageWidthPx = existing.image_width_px
  let imageHeightPx = existing.image_height_px

  const nextSeed = request.mode === 'new_seed'
    ? (request.seed ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`)
    : (request.seed ?? existing.generation_audit.seed)

  let revisedPrompt = existing.generation_audit.prompt_revision
  let model = existing.generation_audit.model
  let modelVersion = existing.generation_audit.model_version
  let watermarkBestEffort = existing.generation_audit.no_text_or_watermark_best_effort
  let traversalGrid = existing.traversal_grid

  if (request.mode !== 'traversal_only') {
    const imageStarted = Date.now()
    const image = await provider.generateBattlemapImage({
      prompt: existing.generation_audit.prompt,
      seed: nextSeed,
    })
    imageMs = Date.now() - imageStarted

    imageWidthPx = image.widthPx
    imageHeightPx = image.heightPx
    model = image.model
    modelVersion = image.modelVersion
    revisedPrompt = image.revisedPrompt

    imageUrl = await uploadBattlemapImage(existing.campaign_id, existing.id, image.bytes, image.mimeType)
  }

  const traversalStarted = Date.now()
  const traversal = await provider.generateTraversalData({
    imageUrl,
    sceneSpec: existing.scene_spec,
    gridWidthCells,
    gridHeightCells,
    cellSizeWorld: existing.grid_overlay_config.cell_size_world,
  })
  traversalMs = Date.now() - traversalStarted

  traversalGrid = traversal.grid
  watermarkBestEffort = traversal.containsTextOrWatermark === false

  const updated: BattlemapAsset = {
    ...existing,
    image_url: imageUrl,
    image_width_px: imageWidthPx,
    image_height_px: imageHeightPx,
    traversal_grid: traversalGrid,
    generation_audit: {
      ...existing.generation_audit,
      model,
      model_version: modelVersion,
      prompt_revision: revisedPrompt,
      generated_at: nowIso,
      seed: nextSeed,
      image_generation_ms: imageMs,
      traversal_generation_ms: traversalMs,
      no_text_or_watermark_best_effort: watermarkBestEffort,
      regenerated_from_id: existing.id,
      regeneration_mode: request.mode,
    },
    updated_at: nowIso,
  }

  const persisted = await updateBattlemapAsset(updated)
  return {
    asset: persisted,
    generation_timing: {
      image_generation_ms: imageMs,
      traversal_generation_ms: traversalMs,
      total_ms: Date.now() - startedAt,
    },
  }
}
