import { create } from 'zustand'
import type { MapData, CharacterData, CombatData, NarrativeEntry, EntityData } from '../types'

let entryCounter = 0

interface GameState {
  map: MapData | null
  characters: Record<string, CharacterData>
  combat: CombatData | null
  narrative: NarrativeEntry[]
  selectedEntityId: string | null
  usage: { input_tokens: number; output_tokens: number; estimated_cost_usd: number }
  isLoading: boolean

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
  syncState: (state: { characters: Record<string, CharacterData>; map: MapData | null; combat: CombatData | null; usage: GameState['usage'] }) => void
}

export const useGameStore = create<GameState>((set) => ({
  map: null,
  characters: {},
  combat: null,
  narrative: [],
  selectedEntityId: null,
  usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
  isLoading: false,

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

  setUsage: (usage) => set({ usage }),
  setLoading: (loading) => set({ isLoading: loading }),

  syncState: (state) => set({
    characters: state.characters,
    map: state.map ?? null,
    combat: state.combat,
    usage: state.usage,
  }),
}))
