import { buildBattlemapPrompt, buildRetryPrompt } from './promptFactory.js'
import { createBattlemapProvider } from './providerFactory.js'
import { defaultGridCellSizeWorldForQuality, resolveBattlemapQualityMode } from './qualityPolicy.js'
import { extractTraversalGridFromImageUrl } from './cvExtractor.js'
import { validateNoText, type TextValidationResult } from './textValidator.js'
import type {
  BattlemapAsset,
  BattlemapGenerationRequest,
  BattlemapGenerationResult,
  BattlemapRegenerationRequest,
  GridOverlayConfig,
  SceneSpec,
  TextValidationEntry,
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

function mergeGridConfig(input: Partial<GridOverlayConfig> | undefined, qualityMode: 'fast' | 'final'): GridOverlayConfig {
  const merged: GridOverlayConfig = {
    cell_size_world: input?.cell_size_world ?? defaultGridCellSizeWorldForQuality(qualityMode),
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

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase()
  if (!raw) return defaultValue
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return defaultValue
}

async function generateTraversalWithStrategy(input: {
  qualityMode: 'fast' | 'final'
  imageUrl: string
  sceneSpec: SceneSpec
  gridWidthCells: number
  gridHeightCells: number
  cellSizeWorld: number
  provider: ReturnType<typeof createBattlemapProvider>
}): Promise<{ grid: BattlemapAsset['traversal_grid']; containsTextOrWatermark: boolean }> {
  const useCvForFast = parseBooleanEnv('BATTLEMAP_FAST_TRAVERSAL_CV_ENABLED', true)
  const fallbackToOpenAi = parseBooleanEnv('BATTLEMAP_FAST_TRAVERSAL_CV_FALLBACK_OPENAI', true)

  if (input.qualityMode === 'fast' && useCvForFast) {
    try {
      const cv = await extractTraversalGridFromImageUrl({
        imageUrl: input.imageUrl,
        gridWidthCells: input.gridWidthCells,
        gridHeightCells: input.gridHeightCells,
        cellSizeWorld: input.cellSizeWorld,
        preferAutoGrid: false,
        includePreviewArtifacts: false,
      })

      if (cv.grid.width_cells !== input.gridWidthCells || cv.grid.height_cells !== input.gridHeightCells) {
        throw new Error('CV traversal grid dimensions did not match expected grid settings')
      }

      return {
        grid: cv.grid,
        containsTextOrWatermark: false,
      }
    } catch (error) {
      if (!fallbackToOpenAi) {
        throw error
      }
      console.warn('[battlemap] CV traversal failed in fast mode, falling back to OpenAI traversal', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return input.provider.generateTraversalData({
    imageUrl: input.imageUrl,
    sceneSpec: input.sceneSpec,
    gridWidthCells: input.gridWidthCells,
    gridHeightCells: input.gridHeightCells,
    cellSizeWorld: input.cellSizeWorld,
  })
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? '').trim()
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export async function generateBattlemap(request: BattlemapGenerationRequest): Promise<BattlemapGenerationResult> {
  if (!request.campaign_id || !request.campaign_id.trim()) {
    throw new Error('campaign_id is required')
  }
  validateSceneSpec(request.scene_spec)

  const qualityMode = resolveBattlemapQualityMode(request.quality_mode)
  const startedAt = Date.now()
  const prepStarted = Date.now()
  const grid = mergeGridConfig(request.grid_settings, qualityMode)
  const basePrompt = buildBattlemapPrompt(request.scene_spec, request.style_config)
  const prepMs = Date.now() - prepStarted

  const provider = createBattlemapProvider('openai')
  const apiKey = String(process.env.OPENAI_API_KEY ?? '').trim()
  const maxRetries = parseIntEnv('BATTLEMAP_TEXT_VALIDATION_MAX_RETRIES', 3)
  const validationEnabled = parseBooleanEnv('BATTLEMAP_TEXT_VALIDATION_ENABLED', true)

  const validationLog: TextValidationEntry[] = []
  let totalImageMs = 0
  let totalValidationMs = 0
  let bestImage: Awaited<ReturnType<typeof provider.generateBattlemapImage>> | null = null
  let bestPrompt = basePrompt
  let validationPassed = false

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0 ? basePrompt : buildRetryPrompt(basePrompt, attempt)

    const imageStarted = Date.now()
    const image = await provider.generateBattlemapImage({
      prompt,
      seed: attempt === 0 ? request.seed : `${Date.now()}-retry-${attempt}`,
      qualityMode,
      style: request.style_config,
    })
    const imageMs = Date.now() - imageStarted
    totalImageMs += imageMs

    if (image.widthPx <= 0 || image.heightPx <= 0) {
      throw new Error('Generated image dimensions were invalid')
    }

    bestImage = image
    bestPrompt = prompt

    // Skip text validation when disabled or no API key for vision calls
    if (!validationEnabled || !apiKey) {
      validationPassed = true
      break
    }

    // Upload to a temporary location for vision-based text check
    const tempId = `${crypto.randomUUID()}-check`
    const tempUrl = await uploadBattlemapImage(request.campaign_id, tempId, image.bytes, image.mimeType)

    const validation = await validateNoText(tempUrl, { apiKey })
    totalValidationMs += validation.validationMs

    const entry: TextValidationEntry = {
      attempt,
      contains_text: validation.containsText,
      explanation: validation.explanation,
      confidence: validation.confidence,
      validation_ms: validation.validationMs,
      ...(validation.validationError ? { validation_error: true } : {}),
    }
    validationLog.push(entry)

    // Treat validator/system errors separately from genuine "no text" passes.
    const isValidationSystemError = validation.validationError === true

    if (!validation.containsText && !isValidationSystemError) {
      validationPassed = true
      console.log(`[battlemap] Text validation passed on attempt ${attempt}`)
      break
    }

    if (isValidationSystemError) {
      console.warn(
        `[battlemap] Text validation failed due to validator error on attempt ${attempt}/${maxRetries}: ${validation.explanation}`,
      )
    } else {
      console.warn(
        `[battlemap] Text detected on attempt ${attempt}/${maxRetries}: ${validation.explanation} (confidence=${validation.confidence})`,
      )
    }

    if (attempt === maxRetries) {
      console.warn('[battlemap] Max retries reached — returning best attempt with text_validation_passed=false')
    }
  }

  if (!bestImage) {
    throw new Error('No image was generated')
  }

  const assetId = crypto.randomUUID()
  const uploadStarted = Date.now()
  const imageUrl = await uploadBattlemapImage(request.campaign_id, assetId, bestImage.bytes, bestImage.mimeType)
  const imageUploadMs = Date.now() - uploadStarted

  const gridWidthCells = ensureFinitePositiveInt(request.scene_spec.map_width_feet / grid.cell_size_world, 'grid width')
  const gridHeightCells = ensureFinitePositiveInt(request.scene_spec.map_height_feet / grid.cell_size_world, 'grid height')

  const traversalStarted = Date.now()
  const traversal = await generateTraversalWithStrategy({
    qualityMode,
    imageUrl,
    sceneSpec: request.scene_spec,
    gridWidthCells,
    gridHeightCells,
    cellSizeWorld: grid.cell_size_world,
    provider,
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
    image_width_px: bestImage.widthPx,
    image_height_px: bestImage.heightPx,
    grid_overlay_config: grid,
    traversal_grid: traversal.grid,
    generation_audit: {
      provider: 'openai',
      model: bestImage.model,
      model_version: bestImage.modelVersion,
      quality_mode: qualityMode,
      prompt: bestPrompt,
      prompt_revision: bestImage.revisedPrompt,
      generated_at: nowIso,
      seed: request.seed,
      seed_supported: bestImage.seedSupported,
      image_generation_ms: totalImageMs,
      traversal_generation_ms: traversalMs,
      no_text_or_watermark_best_effort: validationPassed && traversal.containsTextOrWatermark === false,
      text_validation_retries: validationLog.length > 0 ? validationLog.length - 1 : 0,
      text_validation_log: validationLog.length > 0 ? validationLog : undefined,
      text_validation_passed: validationLog.length > 0 ? validationPassed : undefined,
    },
    created_at: nowIso,
    updated_at: nowIso,
  }

  const persistStarted = Date.now()
  const persisted = await insertBattlemapAsset(asset)
  const assetPersistMs = Date.now() - persistStarted

  return {
    asset: persisted,
    generation_timing: {
      image_generation_ms: totalImageMs,
      traversal_generation_ms: traversalMs,
      total_ms: Date.now() - startedAt,
      text_validation_ms: totalValidationMs > 0 ? totalValidationMs : undefined,
      stage_breakdown_ms: {
        request_prep_ms: prepMs,
        image_upload_ms: imageUploadMs,
        asset_persist_ms: assetPersistMs,
      },
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
  const prepStarted = Date.now()

  const existingQualityMode = resolveBattlemapQualityMode(existing.generation_audit.quality_mode)
  const qualityMode = resolveBattlemapQualityMode(request.quality_mode, existingQualityMode)
  const baseGridConfig: Partial<GridOverlayConfig> = {
    ...existing.grid_overlay_config,
    cell_size_world: request.quality_mode ? undefined : existing.grid_overlay_config.cell_size_world,
  }
  const gridConfig = mergeGridConfig(baseGridConfig, qualityMode)
  const prepMs = Date.now() - prepStarted

  const mapWidthFeet = ensureFinitePositiveInt(existing.scene_spec.map_width_feet, 'scene_spec.map_width_feet')
  const mapHeightFeet = ensureFinitePositiveInt(existing.scene_spec.map_height_feet, 'scene_spec.map_height_feet')
  const gridWidthCells = ensureFinitePositiveInt(mapWidthFeet / gridConfig.cell_size_world, 'grid width')
  const gridHeightCells = ensureFinitePositiveInt(mapHeightFeet / gridConfig.cell_size_world, 'grid height')

  let imageMs = 0
  let traversalMs = 0
  let imageUploadMs = 0
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
      qualityMode,
    })
    imageMs = Date.now() - imageStarted

    imageWidthPx = image.widthPx
    imageHeightPx = image.heightPx
    model = image.model
    modelVersion = image.modelVersion
    revisedPrompt = image.revisedPrompt

    const uploadStarted = Date.now()
    imageUrl = await uploadBattlemapImage(existing.campaign_id, existing.id, image.bytes, image.mimeType)
    imageUploadMs = Date.now() - uploadStarted
  }

  const traversalStarted = Date.now()
  const traversal = await generateTraversalWithStrategy({
    qualityMode,
    imageUrl,
    sceneSpec: existing.scene_spec,
    gridWidthCells,
    gridHeightCells,
    cellSizeWorld: gridConfig.cell_size_world,
    provider,
  })
  traversalMs = Date.now() - traversalStarted

  traversalGrid = traversal.grid
  watermarkBestEffort = traversal.containsTextOrWatermark === false

  const updated: BattlemapAsset = {
    ...existing,
    image_url: imageUrl,
    image_width_px: imageWidthPx,
    image_height_px: imageHeightPx,
    grid_overlay_config: gridConfig,
    traversal_grid: traversalGrid,
    generation_audit: {
      ...existing.generation_audit,
      model,
      model_version: modelVersion,
      quality_mode: qualityMode,
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

  const persistStarted = Date.now()
  const persisted = await updateBattlemapAsset(updated)
  const assetPersistMs = Date.now() - persistStarted
  return {
    asset: persisted,
    generation_timing: {
      image_generation_ms: imageMs,
      traversal_generation_ms: traversalMs,
      total_ms: Date.now() - startedAt,
      stage_breakdown_ms: {
        request_prep_ms: prepMs,
        image_upload_ms: imageUploadMs,
        asset_persist_ms: assetPersistMs,
      },
    },
  }
}
