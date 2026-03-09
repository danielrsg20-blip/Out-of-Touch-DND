export interface TileData {
  x: number
  y: number
  type: string
  state?: string
  sprite?: string
}

export interface EntityData {
  id: string
  name: string
  x: number
  y: number
  type: 'pc' | 'npc' | 'enemy' | 'object'
  sprite: string
  visible?: boolean
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
