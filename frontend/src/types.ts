export interface TileData {
  x: number
  y: number
  type: string
  state?: string
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

export interface MapData {
  width: number
  height: number
  tiles: TileData[]
  entities: EntityData[]
  revealed?: { x: number; y: number }[]
  visible?: { x: number; y: number }[]
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
  spell_slots: Record<number, number>
  spell_slots_used: Record<number, number>
  traits: string[]
  xp: number
  is_alive: boolean
}

export interface CombatData {
  is_active: boolean
  round: number
  turn_index: number
  current_turn: string | null
  initiative_order: Array<{
    id: string
    name: string
    initiative: number
    hp: number
    max_hp: number
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

export interface NarrativeEntry {
  id: string
  type: 'dm' | 'player' | 'system' | 'dice'
  speaker?: string
  content: string
  timestamp: number
}
