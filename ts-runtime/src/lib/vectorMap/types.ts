export type JsonRecord = Record<string, unknown>

export type Point = {
  x: number
  y: number
}

export type FillStyle = {
  color: string
  gradient?: unknown
}

export type StrokeStyle = {
  color: string
  width: number
  line_cap?: 'round' | 'square' | 'butt'
  line_join?: 'round' | 'bevel' | 'miter'
  dash_array?: number[] | null
  width_profile?: number[] | null
}

export type RegionElement = {
  type: 'polygon'
  id: string
  name: string
  points: Point[]
  fill: FillStyle
  fill_opacity?: number
  stroke?: StrokeStyle | null
  feather?: number | null
  tags?: string[] | null
}

export type PathElement = {
  type: 'polyline'
  id: string
  name: string
  points: Point[]
  stroke: StrokeStyle
  stroke_opacity?: number
  style_jitter?: number
  end_cap_style?: 'round' | 'square' | 'arrow' | 'none'
  tags?: string[] | null
}

export type StampElement = {
  type: 'decal'
  id: string
  name: string
  position: Point
  decal_type: string
  scale?: number
  rotation?: number
  opacity?: number
  blend_mode?: string
  tags?: string[] | null
}

export type TextElement = {
  type: 'text'
  id: string
  name: string
  parent_object_id?: string
  position: Point
  text: string
  color?: string
  font_size?: number
  dm_only?: boolean
  visible?: boolean
  tags?: string[] | null
}

export type OverlayElement = RegionElement | PathElement | StampElement | TextElement

export type OverlayLayer = {
  id: string
  name: string
  z_index: number
  visible: boolean
  blend_mode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  opacity: number
  elements: OverlayElement[]
  clip_region?: Point[]
  clipped_to_bounds?: boolean
}

export type StyleDefinition = {
  id: string
  name: string
  palette: Record<string, string>
  noise_seed: number
  edge_feathering?: number
  jitter?: number
  decal_library: Record<string, unknown>
}

export type OverlayPayload = {
  id: string
  name: string
  version: string
  created_at: string
  map_id?: string
  metadata?: JsonRecord
  styles: Record<string, StyleDefinition>
  layers: OverlayLayer[]
}

export type MapBoundsWorld = {
  origin_x: number
  origin_y: number
  width_world: number
  height_world: number
}

export type GridConfig = {
  base_cell_size_world: number
  resolution_scale: number
  diagonal_policy?: 'allow' | 'forbid'
  movement_cost_mode?: 'world_units'
}

export type GenerateVectorMapRequest = {
  request_id?: string
  seed: number
  map_id?: string
  name?: string
  biome?: 'dungeon' | 'cavern' | 'forest' | 'village' | 'crypt' | 'mine' | 'custom'
  story_prompt?: string
  style_preset?: string
  bounds_world: MapBoundsWorld
  generation_params?: {
    room_count?: number
    corridor_width_cells?: number
    obstacle_density?: number
    hazard_density?: number
  }
  grid_config?: GridConfig
  validation_mode?: 'strict' | 'fixup'
}

export type GridCellData = {
  x: number
  y: number
  traversable: boolean
  movement_cost: number
  movement_blocking_tags: string[]
  tags: string[]
}

export type TraversalGrid = {
  width_cells: number
  height_cells: number
  cell_size_world: number
  world_bounds: MapBoundsWorld
  resolution_scale: number
  derivation_version: string
  cells: GridCellData[]
}

export type LegacyTile = {
  x: number
  y: number
  type: string
  blocks_movement: boolean
  blocks_sight: boolean
}

export type LegacyEntity = {
  id: string
  name: string
  x: number
  y: number
  type: string
  blocks_movement: boolean
  tags?: string[]
}

export type PayloadValidationReport = {
  fixed_geometries: number
  rejected_elements: number
  duplicate_ids: number
  out_of_bounds_clamped: number
  warnings: string[]
}

export type GridValidationReport = {
  unknown_blocking_tags: string[]
  blocked_percent: number
  tag_counts: Record<string, number>
  blocked_tag_mismatch_count: number
}

export type GenerateVectorMapResponse = {
  overlay: OverlayPayload
  traversal_grid: TraversalGrid
  compatibility: {
    legacy_tiles: { width: number; height: number; tiles: LegacyTile[] }
    legacy_entities: { entities: LegacyEntity[] }
  }
  reports: {
    payload_validation: PayloadValidationReport
    grid_validation: GridValidationReport
  }
  movement_model: {
    metric: 'world_units'
    cell_size_world: number
    speed_world_per_turn_default: number
    derived_cells_per_turn_default: number
  }
  hashes: {
    overlay_hash: string
    grid_hash: string
    compatibility_hash?: string
  }
}

export const BLOCKING_TAG_WHITELIST = ['wall', 'cliff', 'lava', 'deep_mud', 'blocked', 'water_deep'] as const
export type BlockingTag = (typeof BLOCKING_TAG_WHITELIST)[number]
