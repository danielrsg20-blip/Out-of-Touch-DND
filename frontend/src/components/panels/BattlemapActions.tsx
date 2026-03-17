import { useMemo, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useOverlayStore } from '../../stores/overlayStore'
import { callBackendApi } from '../../lib/backendApi'
import {
  applyBattlemapResponseToMap,
  extractTraversalGridFromPayload,
  resolveBattlemapId,
} from '../../lib/battlemapState'
import './panels.css'

type BusyMode = 'generate' | 'same_settings' | 'new_seed' | 'traversal_only' | null

type BattlemapRegenerationMode = 'same_settings' | 'new_seed' | 'traversal_only'

const SCENE_LOCATIONS = new Set([
  'forest',
  'swamp',
  'dungeon',
  'city_alley',
  'tavern',
  'ruins',
  'mountain',
  'coastal',
])

const SCENE_BIOMES = new Set(['temperate', 'tropical', 'arctic', 'underground', 'urban', 'magical'])
const ENCOUNTER_TYPES = new Set(['ambush', 'siege', 'chase', 'investigation', 'diplomacy', 'exploration'])

function sanitizeLocation(value: unknown): string {
  const location = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return SCENE_LOCATIONS.has(location) ? location : 'forest'
}

function inferBiome(location: string): string {
  if (location === 'dungeon' || location === 'ruins') return 'underground'
  if (location === 'city_alley' || location === 'tavern') return 'urban'
  if (location === 'coastal') return 'temperate'
  if (location === 'mountain') return 'arctic'
  return 'temperate'
}

function sanitizeEncounterType(value: unknown): string {
  const encounterType = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ENCOUNTER_TYPES.has(encounterType) ? encounterType : 'exploration'
}

export default function BattlemapActions() {
  const map = useGameStore((s) => s.map)
  const setMap = useGameStore((s) => s.setMap)
  const addNarrative = useGameStore((s) => s.addNarrative)
  const setTraversalGrid = useOverlayStore((s) => s.setTraversalGrid)
  const roomCode = useSessionStore((s) => s.roomCode)
  const campaignTone = useSessionStore((s) => s.campaignTone)

  const [busyMode, setBusyMode] = useState<BusyMode>(null)

  const battlemapId = useMemo(() => resolveBattlemapId(map), [map])

  const sceneSpec = useMemo(() => {
    const location = sanitizeLocation(map?.metadata?.environment)
    const inferredBiome = inferBiome(location)
    const mapBiome = typeof map?.metadata?.environment === 'string' ? map.metadata.environment.trim().toLowerCase() : ''
    const biome = SCENE_BIOMES.has(mapBiome) ? mapBiome : inferredBiome

    const widthFeet = Math.max(20, (map?.width ?? 20) * 5)
    const heightFeet = Math.max(20, (map?.height ?? 20) * 5)

    return {
      location,
      biome,
      encounter_type: sanitizeEncounterType(map?.metadata?.encounter_type),
      mood_style: 'high-fantasy',
      map_width_feet: widthFeet,
      map_height_feet: heightFeet,
      notable_features: (map?.metadata?.tactical_tags ?? []).slice(0, 6),
      campaign_tone: campaignTone ?? undefined,
    }
  }, [campaignTone, map])

  async function applyPayload(payload: Record<string, unknown>, verb: string): Promise<void> {
    const nextMap = applyBattlemapResponseToMap(map, payload)
    if (nextMap) {
      setMap(nextMap)
    }

    const traversal = extractTraversalGridFromPayload(payload)
    if (traversal) {
      setTraversalGrid(traversal)
    }

    const timing = payload.generation_timing as Record<string, unknown> | undefined
    const totalMs = typeof timing?.total_ms === 'number' ? timing.total_ms : null
    const timingText = totalMs !== null ? ` (${Math.round(totalMs)}ms)` : ''
    addNarrative('system', `${verb} and applied immediately.${timingText}`)
  }

  async function handleGenerate(): Promise<void> {
    if (!roomCode || !map || busyMode) return

    setBusyMode('generate')
    try {
      const response = await callBackendApi('/api/tools/generate_battlemap', {
        method: 'POST',
        body: {
          campaign_id: roomCode,
          scene_spec: sceneSpec,
          grid_settings: {
            cell_size_world: 5,
          },
        },
      })

      if (!response.ok) {
        const message = typeof response.data?.error === 'string'
          ? response.data.error
          : `Generate battlemap failed (${response.status})`
        throw new Error(message)
      }

      await applyPayload(response.data, 'Generated battlemap')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate battlemap.'
      addNarrative('system', `Battlemap generation failed: ${message}`)
    } finally {
      setBusyMode(null)
    }
  }

  async function handleRegenerate(mode: BattlemapRegenerationMode): Promise<void> {
    if (!battlemapId || busyMode) return

    setBusyMode(mode)
    try {
      const response = await callBackendApi('/api/tools/regenerate_battlemap', {
        method: 'POST',
        body: {
          battlemap_id: battlemapId,
          mode,
        },
      })

      if (!response.ok) {
        const message = typeof response.data?.error === 'string'
          ? response.data.error
          : `Regenerate battlemap failed (${response.status})`
        throw new Error(message)
      }

      const label = mode === 'traversal_only' ? 'Regenerated traversal grid' : 'Regenerated battlemap'
      await applyPayload(response.data, label)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to regenerate battlemap.'
      addNarrative('system', `Battlemap regeneration failed: ${message}`)
    } finally {
      setBusyMode(null)
    }
  }

  return (
    <div className="battlemap-actions-panel">
      <div className="battlemap-actions-header">
        <span>Battlemap Tools</span>
        <small>{battlemapId ? 'linked' : 'not generated'}</small>
      </div>
      <div className="battlemap-actions-row">
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleGenerate()}
          disabled={!roomCode || !map || !!busyMode}
          title="Generate a new image battlemap and apply map_patch immediately"
        >
          {busyMode === 'generate' ? 'Generating...' : 'Generate Battlemap'}
        </button>
      </div>
      <div className="battlemap-actions-row battlemap-actions-row--split">
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleRegenerate('same_settings')}
          disabled={!battlemapId || !!busyMode}
          title="Regenerate image + traversal with same settings"
        >
          {busyMode === 'same_settings' ? 'Working...' : 'Regenerate'}
        </button>
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleRegenerate('new_seed')}
          disabled={!battlemapId || !!busyMode}
          title="Regenerate image + traversal with a new seed"
        >
          {busyMode === 'new_seed' ? 'Working...' : 'New Seed'}
        </button>
        <button
          type="button"
          className="battlemap-action-btn"
          onClick={() => void handleRegenerate('traversal_only')}
          disabled={!battlemapId || !!busyMode}
          title="Recompute only traversal grid from existing image"
        >
          {busyMode === 'traversal_only' ? 'Working...' : 'Traversal Only'}
        </button>
      </div>
    </div>
  )
}
