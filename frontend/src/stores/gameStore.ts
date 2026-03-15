import { create } from 'zustand'
import type { MapData, CharacterData, CombatData, NarrativeEntry, EntityData, PendingRoll, ItemData, DmGenerationStatus, TtsPlaybackStatus } from '../types'
import type { TranscriptMode } from '../components/VoiceControl'

let entryCounter = 0

const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const

interface GameState {
  map: MapData | null
  characters: Record<string, CharacterData>
  combat: CombatData | null
  narrative: NarrativeEntry[]
  selectedEntityId: string | null
  usage: { input_tokens: number; output_tokens: number; estimated_cost_usd: number }
  isLoading: boolean
  voiceEnabled: boolean
  ttsEnabled: boolean
  voiceSpeed: number
  transcriptMode: TranscriptMode
  pendingRoll: PendingRoll | null
  dmGenerationStatus: DmGenerationStatus | null
  ttsPlaybackStatus: TtsPlaybackStatus | null

  setMap: (map: MapData) => void
  updateEntity: (entityId: string, x: number, y: number) => void
  addEntity: (entity: EntityData) => void
  removeEntity: (entityId: string) => void
  setCharacters: (characters: Record<string, CharacterData>) => void
  setCombat: (combat: CombatData | null) => void
  addNarrative: (type: NarrativeEntry['type'], content: string, speaker?: string) => void
  setSelectedEntity: (id: string | null) => void
  setUsage: (usage: GameState['usage']) => void
  setLoading: (loading: boolean) => void
  setVoiceEnabled: (enabled: boolean) => void
  setTtsEnabled: (enabled: boolean) => void
  setVoiceSpeed: (speed: number) => void
  setTranscriptMode: (mode: TranscriptMode) => void
  setPendingRoll: (roll: PendingRoll | null) => void
  setDmGenerationStatus: (status: DmGenerationStatus | null) => void
  setTtsPlaybackStatus: (status: TtsPlaybackStatus | null) => void
  syncState: (state: {
    characters?: Record<string, CharacterData>
    map?: MapData | null
    combat?: CombatData | null
    usage?: GameState['usage']
  }) => void
}

const DEFAULT_USAGE = { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 }

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function toItemArray(value: unknown): ItemData[] {
  return Array.isArray(value) ? (value as ItemData[]) : []
}

function normalizeAbilities(value: unknown): Record<string, number> {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const normalized: Record<string, number> = {}
  for (const ability of ABILITY_KEYS) {
    normalized[ability] = toFiniteNumber(raw[ability], 10)
  }
  return normalized
}

function normalizeModifiers(value: unknown, abilities: Record<string, number>): Record<string, number> {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const normalized: Record<string, number> = {}
  for (const ability of ABILITY_KEYS) {
    const fallback = Math.floor((abilities[ability] - 10) / 2)
    normalized[ability] = toFiniteNumber(raw[ability], fallback)
  }
  return normalized
}

function normalizeSpellSlots(value: unknown): Record<number, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const raw = value as Record<string, unknown>
  const normalized: Record<number, number> = {}
  for (const [slotLevel, amount] of Object.entries(raw)) {
    const parsedLevel = Number(slotLevel)
    if (Number.isFinite(parsedLevel)) {
      normalized[parsedLevel] = toFiniteNumber(amount, 0)
    }
  }
  return normalized
}

function normalizeClassFeatures(value: unknown): CharacterData['class_features'] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((feature) => ({
      id: typeof feature.id === 'string' ? feature.id : undefined,
      name: typeof feature.name === 'string' ? feature.name : 'Feature',
      level: typeof feature.level === 'number' ? feature.level : undefined,
      description: typeof feature.description === 'string' ? feature.description : undefined,
    }))
}

function normalizeCharacter(character: CharacterData): CharacterData {
  const raw = character as CharacterData & Record<string, unknown>
  const abilities = normalizeAbilities(raw.abilities)
  const level = Math.max(1, toFiniteNumber(raw.level, 1))
  const hp = toFiniteNumber(raw.hp, toFiniteNumber(raw.max_hp, 1))
  const maxHp = Math.max(1, toFiniteNumber(raw.max_hp, hp || 1))

  return {
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : '',
    sprite_id: typeof raw.sprite_id === 'string' ? raw.sprite_id : undefined,
    name: typeof raw.name === 'string' ? raw.name : 'Adventurer',
    race: typeof raw.race === 'string' ? raw.race : 'Unknown',
    class: typeof raw.class === 'string'
      ? raw.class
      : (typeof raw.char_class === 'string' ? raw.char_class : 'Adventurer'),
    level,
    abilities,
    modifiers: normalizeModifiers(raw.modifiers, abilities),
    hp,
    max_hp: maxHp,
    temp_hp: toFiniteNumber(raw.temp_hp, 0),
    ac: toFiniteNumber(raw.ac, 10),
    speed: toFiniteNumber(raw.speed, 30),
    proficiency_bonus: toFiniteNumber(raw.proficiency_bonus, 2 + Math.floor((level - 1) / 4)),
    skill_proficiencies: toStringArray(raw.skill_proficiencies),
    conditions: toStringArray(raw.conditions),
    inventory: toItemArray(raw.inventory),
    gold_gp: toFiniteNumber(raw.gold_gp, 0),
    spell_slots: normalizeSpellSlots(raw.spell_slots),
    spell_slots_used: normalizeSpellSlots(raw.spell_slots_used),
    known_spells: toStringArray(raw.known_spells),
    prepared_spells: toStringArray(raw.prepared_spells),
    class_features: normalizeClassFeatures(raw.class_features),
    traits: toStringArray(raw.traits),
    xp: toFiniteNumber(raw.xp, 0),
    is_alive: typeof raw.is_alive === 'boolean' ? raw.is_alive : hp > 0,
    spellcasting_mode: raw.spellcasting_mode === 'known' || raw.spellcasting_mode === 'prepared' || raw.spellcasting_mode === 'none'
      ? raw.spellcasting_mode
      : 'none',
  }
}

function normalizeCharacters(characters: Record<string, CharacterData>): Record<string, CharacterData> {
  return Object.fromEntries(
    Object.entries(characters).map(([characterId, character]) => [characterId, normalizeCharacter(character)]),
  )
}

const VOICE_ENABLED_KEY = 'otdnd.voiceEnabled'
const TTS_ENABLED_KEY = 'otdnd.ttsEnabled'
const VOICE_SPEED_KEY = 'otdnd.voiceSpeed'
const TRANSCRIPT_MODE_KEY = 'otdnd.transcriptMode'
const DEFAULT_VOICE_SPEED = 1

function clampVoiceSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOICE_SPEED
  }
  return Math.min(1.75, Math.max(1, Number(value.toFixed(2))))
}

function readBoolSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) {
      return fallback
    }
    return raw === 'true'
  } catch {
    return fallback
  }
}

function readTranscriptModeSetting(): TranscriptMode {
  try {
    const raw = window.localStorage.getItem(TRANSCRIPT_MODE_KEY)
    return raw === 'review' ? 'review' : 'auto'
  } catch {
    return 'auto'
  }
}

function readVoiceSpeedSetting(): number {
  try {
    const raw = window.localStorage.getItem(VOICE_SPEED_KEY)
    if (raw === null) {
      return DEFAULT_VOICE_SPEED
    }
    const parsed = Number(raw)
    return clampVoiceSpeed(parsed)
  } catch {
    return DEFAULT_VOICE_SPEED
  }
}

function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Non-fatal: keep in-memory behavior even if storage is unavailable.
  }
}

export const useGameStore = create<GameState>((set) => ({
  map: null,
  characters: {},
  combat: null,
  narrative: [],
  selectedEntityId: null,
  usage: DEFAULT_USAGE,
  isLoading: false,
  voiceEnabled: readBoolSetting(VOICE_ENABLED_KEY, true),
  ttsEnabled: readBoolSetting(TTS_ENABLED_KEY, true),
  voiceSpeed: readVoiceSpeedSetting(),
  transcriptMode: readTranscriptModeSetting(),
  pendingRoll: null,
  dmGenerationStatus: null,
  ttsPlaybackStatus: null,

  setMap: (map) => set({ map }),

  updateEntity: (entityId, x, y) => set((s) => {
    if (!s.map) return s
    const entities = s.map.entities.map(e =>
      e.id === entityId ? { ...e, x, y } : e
    )
    return { map: { ...s.map, entities } }
  }),

  addEntity: (entity) => set((s) => {
    if (!s.map) return s
    const entities = [...s.map.entities.filter(e => e.id !== entity.id), entity]
    return { map: { ...s.map, entities } }
  }),

  removeEntity: (entityId) => set((s) => {
    if (!s.map) return s
    const entities = s.map.entities.filter(e => e.id !== entityId)
    return { map: { ...s.map, entities } }
  }),

  setCharacters: (characters) => set({ characters: normalizeCharacters(characters) }),
  setCombat: (combat) => set({ combat }),

  addNarrative: (type, content, speaker) => set((s) => ({
    narrative: [...s.narrative, {
      id: `entry-${++entryCounter}`,
      type,
      speaker,
      content,
      timestamp: Date.now(),
    }],
  })),

  setSelectedEntity: (id) => set({ selectedEntityId: id }),
  setPendingRoll: (roll) => set({ pendingRoll: roll }),
  setDmGenerationStatus: (status) => set({ dmGenerationStatus: status }),
  setTtsPlaybackStatus: (status) => set({ ttsPlaybackStatus: status }),

  setUsage: (usage) => set({ usage }),
  setLoading: (loading) => set({ isLoading: loading }),
  setVoiceEnabled: (enabled) => {
    writeSetting(VOICE_ENABLED_KEY, String(enabled))
    set({ voiceEnabled: enabled })
  },
  setTtsEnabled: (enabled) => {
    writeSetting(TTS_ENABLED_KEY, String(enabled))
    set({ ttsEnabled: enabled })
  },
  setVoiceSpeed: (speed) => {
    const nextSpeed = clampVoiceSpeed(speed)
    writeSetting(VOICE_SPEED_KEY, String(nextSpeed))
    set({ voiceSpeed: nextSpeed })
  },
  setTranscriptMode: (mode) => {
    writeSetting(TRANSCRIPT_MODE_KEY, mode)
    set({ transcriptMode: mode })
  },

  syncState: (state) => set((current) => ({
    characters: state.characters ? normalizeCharacters(state.characters) : current.characters,
    map: state.map ?? current.map ?? null,
    combat: state.combat ?? current.combat,
    usage: state.usage ?? current.usage ?? DEFAULT_USAGE,
  })),
}))
