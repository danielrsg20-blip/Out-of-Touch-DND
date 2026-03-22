export const SCENE_LOCATIONS = [
  'forest',
  'swamp',
  'dungeon',
  'city_alley',
  'tavern',
  'ruins',
  'mountain',
  'coastal',
] as const

export const SCENE_BIOMES = ['temperate', 'tropical', 'arctic', 'underground', 'urban', 'magical'] as const

export const ENCOUNTER_TYPES = ['ambush', 'siege', 'chase', 'investigation', 'diplomacy', 'exploration'] as const

export const MOOD_STYLES = ['hand-drawn', 'painterly', 'parchment', 'gritty', 'high-fantasy', 'realistic'] as const

export const SATURATION_PRESETS = ['muted', 'balanced', 'vibrant'] as const
export const BATTLEMAP_QUALITY_MODES = ['fast', 'final'] as const

export const TRAVERSAL_TAG_WHITELIST = [
  'open_ground',
  'path',
  'floor',
  'wall',
  'building',
  'water',
  'water_deep',
  'difficult',
  'mud',
  'rubble',
  'undergrowth',
  'door',
  'hazard',
  'bridge',
  'stairs',
  'cliff',
  'blocked',
] as const

export type SceneLocation = (typeof SCENE_LOCATIONS)[number]
export type SceneBiome = (typeof SCENE_BIOMES)[number]
export type EncounterType = (typeof ENCOUNTER_TYPES)[number]
export type MoodStyle = (typeof MOOD_STYLES)[number]
export type SaturationPreset = (typeof SATURATION_PRESETS)[number]
export type BattlemapQualityMode = (typeof BATTLEMAP_QUALITY_MODES)[number]
export type TraversalTag = (typeof TRAVERSAL_TAG_WHITELIST)[number]

export type SceneSpec = {
  location: SceneLocation
  biome: SceneBiome
  encounter_type: EncounterType
  notable_features: string[]
  mood_style: MoodStyle
  map_width_feet: number
  map_height_feet: number
  campaign_tone?: string
  /** Vivid scene narrative from the AI DM, injected into the image generation prompt. */
  description?: string
}

export type BattlemapStyleConfig = {
  color_saturation?: SaturationPreset
  contrast_level?: 'low' | 'medium' | 'high'
  orientation?: 'landscape' | 'portrait' | 'square'
}

export type BattlemapGenerationRequest = {
  campaign_id: string
  scene_spec: SceneSpec
  quality_mode?: BattlemapQualityMode
  seed?: string | number
  style_config?: BattlemapStyleConfig
  grid_settings?: Partial<GridOverlayConfig>
}

export type GridOverlayConfig = {
  cell_size_world: number
  line_thickness: number
  line_opacity: number
  line_color: string
  show_coordinates: boolean
}

export type BattlemapImportPreviewRequest = {
  image_url: string
  scene_spec: SceneSpec
  quality_mode?: BattlemapQualityMode
  include_preview_artifacts?: boolean
  grid_settings?: Partial<GridOverlayConfig>
  grid_width_cells?: number
  grid_height_cells?: number
}

export type TraversalQualitySummary = {
  total_cells: number
  blocked_cells: number
  blocked_ratio: number
  avg_movement_cost: number
  high_cost_cells: number
  high_cost_ratio: number
}

export type ExtractionStageStatus = 'implemented' | 'placeholder'

export type ExtractionStageReport = {
  name: string
  status: ExtractionStageStatus
  detail: string
}

export type BattlemapImportPreviewResult = {
  traversal_grid: TraversalGrid
  diagnostics: {
    source: 'cv' | 'vision_fallback'
    quality_summary: TraversalQualitySummary
    grid_width_cells: number
    grid_height_cells: number
    cell_size_world: number
    grid_detection_confidence?: number
    image_width_px?: number
    image_height_px?: number
    cell_size_px_x?: number
    cell_size_px_y?: number
    detected_cell_size_px_x?: number
    detected_cell_size_px_y?: number
    preview_artifacts?: {
      collision_mask_png_base64: string
      cost_map_png_base64: string
    }
  }
  extraction_pipeline: {
    mode: 'cv_baseline' | 'vision_baseline'
    version: string
    stages: ExtractionStageReport[]
  }
}

export type TraversalCell = {
  x: number
  y: number
  traversable: boolean
  movement_cost: number
  movement_blocking_tags: string[]
  tags: TraversalTag[]
  confidence?: number
}

export type TraversalGrid = {
  width_cells: number
  height_cells: number
  cell_size_world: number
  derivation_version: string
  cells: TraversalCell[]
}

export type TextValidationEntry = {
  attempt: number
  contains_text: boolean
  explanation: string
  confidence: number
  validation_ms: number
}

export type BattlemapGenerationAudit = {
  provider: 'openai'
  model: string
  model_version: string
  quality_mode?: BattlemapQualityMode
  prompt: string
  prompt_revision?: string
  generated_at: string
  seed?: string | number
  seed_supported: boolean
  image_generation_ms: number
  traversal_generation_ms: number
  no_text_or_watermark_best_effort: boolean
  regenerated_from_id?: string
  regeneration_mode?: 'same_settings' | 'new_seed' | 'traversal_only'
  /** Number of text-validation retries (0 = first attempt passed). */
  text_validation_retries?: number
  /** Detailed text validation log for each attempt. */
  text_validation_log?: TextValidationEntry[]
  /** Final text validation verdict after all attempts. */
  text_validation_passed?: boolean
}

export type BattlemapAsset = {
  id: string
  campaign_id: string
  scene_spec: SceneSpec
  image_url: string
  image_width_px: number
  image_height_px: number
  grid_overlay_config: GridOverlayConfig
  traversal_grid: TraversalGrid
  generation_audit: BattlemapGenerationAudit
  created_at: string
  updated_at: string
}

export type BattlemapGenerationResult = {
  asset: BattlemapAsset
  generation_timing: {
    image_generation_ms: number
    traversal_generation_ms: number
    total_ms: number
    text_validation_ms?: number
    stage_breakdown_ms?: {
      request_prep_ms: number
      image_upload_ms: number
      asset_persist_ms: number
    }
  }
}

export type BattlemapRegenerationMode = 'same_settings' | 'new_seed' | 'traversal_only'

export type BattlemapRegenerationRequest = {
  battlemap_id: string
  mode: BattlemapRegenerationMode
  quality_mode?: BattlemapQualityMode
  seed?: string | number
}

export const DEFAULT_GRID_OVERLAY_CONFIG: GridOverlayConfig = {
  cell_size_world: 5,
  line_thickness: 1,
  line_opacity: 0.45,
  line_color: '#D8E1E8',
  show_coordinates: false,
}
