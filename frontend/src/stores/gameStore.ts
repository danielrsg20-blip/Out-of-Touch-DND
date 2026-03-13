import { create } from 'zustand'
import type { MapData, CharacterData, CombatData, NarrativeEntry, EntityData, PendingRoll } from '../types'
import type { TranscriptMode } from '../components/VoiceControl'

let entryCounter = 0

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
  transcriptMode: TranscriptMode
  pendingRoll: PendingRoll | null

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
  setTranscriptMode: (mode: TranscriptMode) => void
  setPendingRoll: (roll: PendingRoll | null) => void
  syncState: (state: { characters: Record<string, CharacterData>; map: MapData | null; combat: CombatData | null; usage: GameState['usage'] }) => void
}

const VOICE_ENABLED_KEY = 'otdnd.voiceEnabled'
const TTS_ENABLED_KEY = 'otdnd.ttsEnabled'
const TRANSCRIPT_MODE_KEY = 'otdnd.transcriptMode'

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
  usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  isLoading: false,
  voiceEnabled: readBoolSetting(VOICE_ENABLED_KEY, true),
  ttsEnabled: readBoolSetting(TTS_ENABLED_KEY, true),
  transcriptMode: readTranscriptModeSetting(),
  pendingRoll: null,

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

  setCharacters: (characters) => set({ characters }),
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
  setTranscriptMode: (mode) => {
    writeSetting(TRANSCRIPT_MODE_KEY, mode)
    set({ transcriptMode: mode })
  },

  syncState: (state) => set({
    characters: state.characters,
    map: state.map ?? null,
    combat: state.combat,
    usage: state.usage,
  }),
}))
