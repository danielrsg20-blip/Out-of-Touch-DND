export interface TileData {
  x: number
  y: number
  type: string
  state?: string
  sprite?: string
  variant?: string
}

export interface EntityData {
  id: string
  name: string
  x: number
  y: number
  type: 'pc' | 'npc' | 'enemy' | 'object'
  sprite: string
  visible?: boolean
  blocks_movement?: boolean
  prop_category?: string
}

export interface MapMetadata {
  map_id?: string
  map_source?: 'library' | 'generated' | 'manual' | string
  cache_hit?: boolean
  pack_id?: string
  environment?: string
  encounter_type?: string
  encounter_scale?: string
  difficulty?: string
  tactical_tags?: string[]
  license?: string
  license_spdx?: string
  author?: string
  source_url?: string
  attribution_required?: boolean
  attribution_text?: string
  grid_size?: number
  grid_units?: string
  image_url?: string
  image_opacity?: number
}

export interface MapData {
  width: number
  height: number
  tiles: TileData[]
  entities: EntityData[]
  revealed?: { x: number; y: number }[]
  visible?: { x: number; y: number }[]
  metadata?: MapMetadata
}

export interface ItemData {
  id: string
  name: string
  category: 'weapon' | 'armor' | 'shield' | 'tool' | 'gear' | 'ammunition'
  subcategory: string
  cost_gp: number
  weight_lb: number
  description: string
  // Weapon fields
  damage: string | null
  damage_type: string | null
  properties: string[]
  // Armor fields
  ac_base: number | null
  dex_mod: boolean
  max_dex: number | null
  str_req: number | null
  stealth_disadvantage: boolean
  // Inventory state
  equipped: boolean
  quantity: number
  notes: string
}

export interface CharacterData {
  id: string
  sprite_id?: string
  name: string
  race: string
  class: string
  level: number
  abilities: Record<string, number>
  modifiers: Record<string, number>
  hp: number
  max_hp: number
  temp_hp: number
  ac: number
  speed: number
  proficiency_bonus: number
  skill_proficiencies: string[]
  conditions: string[]
  inventory: ItemData[]
  gold_gp: number
  spell_slots: Record<number, number>
  spell_slots_used: Record<number, number>
  known_spells: string[]
  prepared_spells: string[]
  class_features: Array<{ id?: string; name: string; level?: number; description?: string }>
  traits: string[]
  xp: number
  is_alive: boolean
  rules_version?: string
  spellcasting_mode?: 'none' | 'known' | 'prepared'
}

export interface SpellOption {
  name: string
  level: number
  school?: string
}

export interface CastableSpellOption {
  name: string
  level: number
  castable: boolean
  reason?: string | null
  slot_options: number[]
}

export interface SpellSlotState {
  level: number
  total: number
  used: number
  remaining: number
  state: 'available' | 'unavailable' | 'restricted'
  restricted: boolean
}

export interface CombatData {
  is_active: boolean
  round: number
  turn_index: number
  current_turn: string | null
  current_movement_total?: number
  current_movement_remaining?: number
  initiative_order: Array<{
    id: string
    name: string
    initiative: number
    hp: number
    max_hp: number
    movement_remaining?: number
  }>
}

export interface PlayerData {
  id: string
  name: string
  character_id: string | null
}

export interface SessionData {
  room_code: string
  host_id: string
  players: PlayerData[]
  started: boolean
  characters: Record<string, CharacterData>
}

export interface GameState {
  characters: Record<string, CharacterData>
  map: MapData | null
  combat: CombatData | null
  usage: {
    input_tokens: number
    output_tokens: number
    estimated_cost_usd: number
  }
}

export interface UserData {
  user_id: string
  username: string
  token: string
}

export interface NarrativeEntry {
  id: string
  type: 'dm' | 'player' | 'system' | 'dice'
  speaker?: string
  content: string
  timestamp: number
}

export interface PendingRoll {
  characterId: string
  characterName: string
  label: string
  dice: string
  modifier: number
  context: string
}

export interface CampaignSlot {
  id: string
  name: string
  updated_at: string
  session_count: number
  my_character: { name: string; class: string; level: number; char_id: string } | null
}

export interface CampaignCharacter {
  char_id: string
  name: string
  class: string
  level: number
  is_mine: boolean
}

// ============================================================================
// VECTOR OVERLAY SYSTEM TYPES
// ============================================================================

export interface Point {
  x: number
  y: number
}

export interface GradientStop {
  offset: number // 0–1
  color: string // "#rrggbbaa"
}

export interface GradientDef {
  type: 'linear' | 'radial'
  start?: Point // linear only
  end?: Point // linear only
  center?: Point // radial
  radius?: number // radial
  stops: GradientStop[]
}

export interface FillStyle {
  color: string // "#rrggbbaa"
  gradient?: GradientDef
}

export interface StrokeStyle {
  color: string
  width: number
  line_cap?: 'butt' | 'round' | 'square'
  line_join?: 'miter' | 'round' | 'bevel'
  dash_array?: number[]
  width_profile?: number[] // for paths: taper effect
}

export interface NoiseMask {
  enabled: boolean
  intensity: number // 0–1
  scale: number // 0.1–50
  seed: number
  octaves: number // 1–4
}

export interface DecalStampDef {
  id: string
  name: string
  svg_data: string // simplified SVG path
  bounding_box: { w: number; h: number }
  color_key: string
  variations?: string[]
}

export interface StyleDefinition {
  id: string
  name: string
  palette: Record<string, string>
  noise_seed: number
  paper_texture?: {
    enabled: boolean
    intensity: number
    scale: number
  }
  edge_feathering?: number
  jitter?: number
  decal_library: Record<string, DecalStampDef>
}

export interface Region {
  type: 'polygon'
  id: string
  name: string
  points: Point[]
  fill: FillStyle
  fill_opacity?: number
  stroke?: StrokeStyle
  noise_mask?: NoiseMask
  feather?: number
  tags?: string[]
}

export interface Path {
  type: 'polyline'
  id: string
  name: string
  points: Point[]
  stroke: StrokeStyle
  stroke_opacity?: number
  style_jitter?: number
  noise_mask?: NoiseMask
  end_cap_style?: 'round' | 'square' | 'arrow' | 'none'
  tags?: string[]
}

export interface Decal {
  type: 'decal'
  id: string
  name: string
  position: Point
  decal_type: string
  scale?: number
  rotation?: number
  opacity?: number
  blend_mode?: string
  tags?: string[]
}

export interface TextLabel {
  type: 'text'
  id: string
  name: string
  parent_object_id?: string
  position: Point
  text: string
  offset?: Point
  color?: string
  font_family?: string
  font_size?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  outline_color?: string
  outline_width?: number
  chip_color?: string
  chip_padding?: number
  dm_only?: boolean
  visible?: boolean
  scale_with_zoom?: boolean
  min_screen_px?: number
  max_screen_px?: number
  tags?: string[]
}

export type OverlayElement = Region | Path | Decal | TextLabel

export interface OverlayLayer {
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

export interface OverlayMetadata {
  narrative_tags?: string[]
  seed?: number
  story_context?: string
  vectorized_from_map?: boolean
  label_mode?: {
    showLabels: boolean
    showDmOnlyLabels: boolean
  }
}

export interface Overlay {
  id: string
  name: string
  version: string
  created_at: string
  map_id?: string
  metadata?: OverlayMetadata
  styles: Record<string, StyleDefinition>
  layers: OverlayLayer[]
}

// Undo/redo command for overlay editing
export interface OverlayCommand {
  type: string
  execute: () => void
  undo: () => void
}
