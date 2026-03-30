import { create } from 'zustand'
import type { CampaignSlot, PlayerData } from '../types'
import { callBackendApi } from '../lib/backendApi'
import { getSupabaseClient, hasSupabaseConfig, invokeEdgeFunction } from '../lib/supabaseClient'
import { extractTraversalGridFromPayload } from '../lib/battlemapState'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useOverlayStore } from './overlayStore'
import { useGameStore } from './gameStore'
import { useAuthStore } from './authStore'

const SUPABASE_SESSIONS_FLAG = import.meta.env.VITE_USE_SUPABASE_SESSIONS
const USE_SUPABASE_SESSIONS = SUPABASE_SESSIONS_FLAG
  ? SUPABASE_SESSIONS_FLAG === 'true'
  : true
let sessionEventsChannel: RealtimeChannel | null = null
type BattlemapQualityMode = 'fast' | 'final'

const BATTLEMAP_QUALITY_MODE_KEY_PREFIX = 'otdnd.battlemapQualityMode'
const SESSION_PERSIST_KEY = 'otdnd.activeSession'

type StoredSessionData = {
  roomCode: string
  playerId: string
  playerName: string
  sessionId: string | null
  phase: 'lobby' | 'character_create' | 'playing'
}

function writeActiveSession(data: StoredSessionData): void {
  try {
    window.localStorage.setItem(SESSION_PERSIST_KEY, JSON.stringify(data))
  } catch {
    // Ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
}

function readActiveSession(): StoredSessionData | null {
  try {
    const raw = window.localStorage.getItem(SESSION_PERSIST_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.roomCode !== 'string' || typeof parsed.playerId !== 'string') return null
    return {
      roomCode: parsed.roomCode,
      playerId: parsed.playerId,
      playerName: typeof parsed.playerName === 'string' ? parsed.playerName : '',
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      phase: resolveStoredPhase(parsed.phase),
    }
  } catch {
    return null
  }
}

function resolveStoredPhase(phase: unknown): StoredSessionData['phase'] {
  if (phase === 'character_create') return 'character_create'
  if (phase === 'lobby') return 'lobby'
  return 'playing'
}

function clearActiveSession(): void {
  try {
    window.localStorage.removeItem(SESSION_PERSIST_KEY)
  } catch {
    // Ignore
  }
}

function isBattlemapQualityMode(value: unknown): value is BattlemapQualityMode {
  return value === 'fast' || value === 'final'
}

function battlemapQualityModeStorageKey(roomCode: string): string {
  return `${BATTLEMAP_QUALITY_MODE_KEY_PREFIX}.${roomCode.toUpperCase()}`
}

function readBattlemapQualityMode(roomCode: string | null | undefined): BattlemapQualityMode {
  if (!roomCode) {
    return 'final'
  }
  try {
    const raw = window.localStorage.getItem(battlemapQualityModeStorageKey(roomCode))
    return isBattlemapQualityMode(raw) ? raw : 'final'
  } catch {
    return 'final'
  }
}

function writeBattlemapQualityMode(roomCode: string | null | undefined, mode: BattlemapQualityMode): void {
  if (!roomCode) {
    return
  }
  try {
    window.localStorage.setItem(battlemapQualityModeStorageKey(roomCode), mode)
  } catch {
    // Keep in-memory behavior even if localStorage is unavailable.
  }
}

function shouldUseSupabaseSessions(): boolean {
  return USE_SUPABASE_SESSIONS && hasSupabaseConfig()
}

function stopSessionEvents() {
  if (!sessionEventsChannel) {
    return
  }
  const supabase = getSupabaseClient()
  if (supabase) {
    supabase.removeChannel(sessionEventsChannel)
  }
  sessionEventsChannel = null
}

function startSessionEvents(sessionId: string, roomCode: string) {
  if (!shouldUseSupabaseSessions()) {
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return
  }

  stopSessionEvents()

  const channel = supabase
    .channel(`session-events:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_events',
        filter: `session_id=eq.${sessionId}`,
      },
      async (payload) => {
        const row = payload.new as Record<string, unknown>
        const eventType = typeof row.event_type === 'string' ? row.event_type : ''
        if (eventType !== 'player_joined' && eventType !== 'session_created') {
          return
        }

        const store = useSessionStore.getState()
        try {
          const latestState = await store.getSession(roomCode)
          const latestSession = latestState.session as Record<string, unknown> | undefined
          const latestPlayers = Array.isArray(latestSession?.players)
            ? (latestSession?.players as PlayerData[])
            : []
          store.setPlayers(latestPlayers)
        } catch (error) {
          console.warn('Failed to refresh session after realtime event.', error)
        }
      },
    )
    .subscribe()

  sessionEventsChannel = channel
}

function normalizeGameState(payload: Record<string, unknown>): Record<string, unknown> {
  const wrapped = payload.game_state as Record<string, unknown> | undefined
  return wrapped ?? payload
}

function isBattlemapPending(state: Record<string, unknown>): boolean {
  const map = state.map as Record<string, unknown> | undefined
  const metadata = map?.metadata as Record<string, unknown> | undefined
  const generationStatus = typeof metadata?.generation_status === 'string'
    ? metadata.generation_status
    : ''
  const imageUrl = typeof metadata?.image_url === 'string' ? metadata.image_url.trim() : ''
  return generationStatus === 'pending' && imageUrl.length === 0
}

async function syncStateWithPendingPolling(roomCode: string, source: 'create' | 'join'): Promise<void> {
  const maxAttempts = 30

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const latestState = await useSessionStore.getState().getSession(roomCode)

    if (!latestState || typeof latestState !== 'object') {
      throw new Error('Session state response is not an object')
    }

    const stateToSync = normalizeGameState(latestState)
    useGameStore.getState().syncState(stateToSync as any)

    if (!isBattlemapPending(stateToSync)) {
      if (attempt > 1) {
        console.info(`Battlemap became ready after ${attempt} ${source} sync attempts.`)
      }
      return
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  console.warn('Battlemap is still pending after polling window. It will update on the next session sync.')
}

interface SessionState {
  sessionId: string | null
  roomCode: string | null
  playerId: string | null
  playerName: string | null
  mockMode: boolean
  players: PlayerData[]
  isHost: boolean
  connected: boolean
  phase: 'lobby' | 'character_create' | 'playing'
  campaigns: CampaignSlot[]
  campaignsLoading: boolean
  campaignPremise: string | null
  campaignTone: string | null
  campaignTitle: string | null
  battlemapQualityMode: BattlemapQualityMode

  hydrateSession: () => void
  setPhase: (phase: SessionState['phase']) => void
  createSession: (playerName: string, mockMode?: boolean, campaignPremise?: string, campaignTone?: string, campaignTitle?: string) => Promise<void>
  joinSession: (roomCode: string, playerName: string) => Promise<void>
  getSession: (roomCode: string) => Promise<Record<string, unknown>>
  setPlayers: (players: PlayerData[]) => void
  setConnected: (connected: boolean) => void
  setBattlemapQualityMode: (mode: BattlemapQualityMode) => void
  addPlayer: (player: PlayerData) => void
  removePlayer: (playerId: string) => void
  listCampaigns: () => Promise<void>
  deleteCampaign: (campaignId: string) => Promise<void>
  resumeCampaign: (campaignId: string, playerName: string) => Promise<void>
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  roomCode: null,
  playerId: null,
  playerName: null,
  mockMode: false,
  players: [],
  isHost: false,
  connected: false,
  phase: 'lobby',
  campaigns: [],
  campaignsLoading: false,
  campaignPremise: null,
  campaignTone: null,
  campaignTitle: null,
  battlemapQualityMode: 'fast',

  hydrateSession: () => {
    const stored = readActiveSession()
    if (!stored) return
    set({
      roomCode: stored.roomCode,
      playerId: stored.playerId,
      playerName: stored.playerName,
      sessionId: stored.sessionId,
      phase: stored.phase,
      battlemapQualityMode: readBattlemapQualityMode(stored.roomCode),
    })
    if (stored.sessionId) {
      startSessionEvents(stored.sessionId, stored.roomCode)
    }
  },

  setPhase: (phase) => set((s) => {
    if (s.roomCode && s.playerId) {
      writeActiveSession({
        roomCode: s.roomCode,
        playerId: s.playerId,
        playerName: s.playerName ?? '',
        sessionId: s.sessionId,
        phase,
      })
    }
    return { phase }
  }),

  getSession: async (roomCode) => {
    const normalizedRoomCode = roomCode.toUpperCase()

    if (!shouldUseSupabaseSessions()) {
      const res = await callBackendApi(`/api/session/${normalizedRoomCode}`)
      if (!res.ok) {
        throw new Error('Failed to get session from local runtime.')
      }
      const payload = res.data
      const session = payload.session as Record<string, unknown> | undefined
      const players = Array.isArray(session?.players) ? (session?.players as PlayerData[]) : null
      if (players) {
        set({ players })
      }
      if (payload.overlay && typeof payload.overlay === 'object') {
        useOverlayStore.getState().setOverlay(payload.overlay as any)
      }
      const traversalGrid = extractTraversalGridFromPayload(payload)
      if (traversalGrid) {
        useOverlayStore.getState().setTraversalGrid(traversalGrid)
      }
      return payload
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    const payload = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
      action: 'get_session',
      room_code: normalizedRoomCode,
    }, { authMode: 'anon' })
    const session = payload.session as Record<string, unknown> | undefined
    const sessionId = typeof payload.session_id === 'string'
      ? payload.session_id
      : (typeof session?.id === 'string' ? session.id : null)
    const players = Array.isArray(session?.players) ? (session.players as PlayerData[]) : null

    if (sessionId) {
      set({ sessionId })
      startSessionEvents(sessionId, normalizedRoomCode)
    }
    if (players) {
      set({ players })
    }

    if (payload.overlay && typeof payload.overlay === 'object') {
      useOverlayStore.getState().setOverlay(payload.overlay as any)
    }

    const traversalGrid = extractTraversalGridFromPayload(payload)
    if (traversalGrid) {
      useOverlayStore.getState().setTraversalGrid(traversalGrid)
    }

    return payload
  },

  createSession: async (playerName, mockMode = false, campaignPremise = '', campaignTone = '', campaignTitle = '') => {
    let data: Record<string, unknown> = {}
    let supabaseCreateError: string | null = null

    if (!shouldUseSupabaseSessions()) {
      const res = await callBackendApi('/api/session/create', {
        method: 'POST',
        body: {
          player_name: playerName,
          mock_mode: mockMode,
          campaign_premise: campaignPremise,
          campaign_tone: campaignTone,
          campaign_title: campaignTitle,
        },
      })
      if (!res.ok) {
        throw new Error('Failed to create session on local runtime.')
      }
      data = res.data
      if (typeof data.room_code !== 'string' || typeof data.player_id !== 'string') {
        throw new TypeError('Unable to create session (invalid server response).')
      }
      set({
        sessionId: null,
        roomCode: data.room_code,
        playerId: data.player_id,
        playerName,
        mockMode,
        isHost: true,
        players: [{ id: data.player_id, name: playerName, character_id: null }],
        campaignPremise: campaignPremise || null,
        campaignTone: campaignTone || null,
        campaignTitle: campaignTitle || null,
        battlemapQualityMode: readBattlemapQualityMode(data.room_code),
      })
      writeActiveSession({ roomCode: data.room_code, playerId: data.player_id, playerName, sessionId: null, phase: 'lobby' })
      const createdRoomCode = data.room_code
      void (async () => {
        try {
          await syncStateWithPendingPolling(createdRoomCode, 'create')
        } catch (error) {
          console.error('Failed to sync initial game state after session create:', error instanceof Error ? error.message : error)
        }
      })()
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    try {
      data = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
        action: 'create_session',
        player_name: playerName,
        mock_mode: mockMode,
        campaign_premise: campaignPremise,
        campaign_tone: campaignTone,
        campaign_title: campaignTitle,
      }, { authMode: 'anon' })
    } catch (error) {
      supabaseCreateError = error instanceof Error ? error.message : 'Supabase create_session failed.'
      throw new Error(supabaseCreateError)
    }

    if (typeof data.room_code !== 'string' || typeof data.player_id !== 'string') {
      throw new Error('Unable to create session (invalid server response).')
    }
    const sessionId = typeof data.session_id === 'string' ? data.session_id : null
    set({
      sessionId,
      roomCode: data.room_code,
      playerId: data.player_id,
      playerName: playerName,
      mockMode,
      isHost: true,
      players: [{ id: data.player_id, name: playerName, character_id: null }],
      campaignPremise: campaignPremise || null,
      campaignTone: campaignTone || null,
      campaignTitle: campaignTitle || null,
      battlemapQualityMode: readBattlemapQualityMode(data.room_code),
    })

    writeActiveSession({ roomCode: data.room_code, playerId: data.player_id, playerName, sessionId, phase: 'lobby' })

    if (sessionId) {
      startSessionEvents(sessionId, data.room_code)
    }

    const createdRoomCode = data.room_code

    void (async () => {
      try {
        await syncStateWithPendingPolling(createdRoomCode, 'create')
      } catch (error) {
        console.error('Failed to sync initial game state after session create:', error instanceof Error ? error.message : error)
      }
    })()
  },

  joinSession: async (roomCode, playerName) => {
    let data: Record<string, unknown> = {}
    let supabaseJoinError: string | null = null

    if (!shouldUseSupabaseSessions()) {
      const res = await callBackendApi('/api/session/join', {
        method: 'POST',
        body: { room_code: roomCode, player_name: playerName },
      })
      if (!res.ok) {
        throw new Error('Failed to join session on local runtime.')
      }
      data = res.data
      const session = data.session as Record<string, unknown> | undefined
      if (session?.error && typeof session.error === 'string') {
        throw new Error(session.error)
      }
      if (typeof data.player_id !== 'string') {
        throw new TypeError('Unable to join session (invalid server response).')
      }
      const players = Array.isArray(session?.players) ? (session?.players as PlayerData[]) : []
      set({
        sessionId: null,
        roomCode: roomCode.toUpperCase(),
        playerId: data.player_id,
        playerName,
        mockMode: false,
        isHost: false,
        players,
        battlemapQualityMode: readBattlemapQualityMode(roomCode),
      })
      writeActiveSession({ roomCode: roomCode.toUpperCase(), playerId: data.player_id, playerName, sessionId: null, phase: 'lobby' })
      void (async () => {
        try {
          await syncStateWithPendingPolling(roomCode.toUpperCase(), 'join')
        } catch (error) {
          console.error('Failed to sync initial game state after session join:', error instanceof Error ? error.message : error)
        }
      })()
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }

    try {
      data = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
        action: 'join_session',
        room_code: roomCode,
        player_name: playerName,
      }, { authMode: 'anon' })
    } catch (error) {
      supabaseJoinError = error instanceof Error ? error.message : 'Supabase join_session failed.'
      throw new Error(supabaseJoinError)
    }

    const session = data.session as Record<string, unknown> | undefined
    if (session?.error && typeof session.error === 'string') {
      throw new Error(session.error)
    }
    if (typeof data.player_id !== 'string') {
      throw new Error('Unable to join session (invalid server response).')
    }

    const players = Array.isArray(session?.players) ? (session?.players as PlayerData[]) : []
    const sessionId = typeof data.session_id === 'string'
      ? data.session_id
      : (typeof session?.id === 'string' ? session.id : null)

    set({
      sessionId,
      roomCode: roomCode.toUpperCase(),
      playerId: data.player_id,
      playerName: playerName,
      mockMode: false,
      isHost: false,
      players,
      battlemapQualityMode: readBattlemapQualityMode(roomCode),
    })

    writeActiveSession({ roomCode: roomCode.toUpperCase(), playerId: data.player_id, playerName, sessionId, phase: 'lobby' })

    if (sessionId) {
      startSessionEvents(sessionId, roomCode.toUpperCase())
    }

    void (async () => {
      try {
        await syncStateWithPendingPolling(roomCode.toUpperCase(), 'join')
      } catch (error) {
        console.error('Failed to sync initial game state after session join:', error instanceof Error ? error.message : error)
      }
    })()
  },

  setBattlemapQualityMode: (mode) => set((state) => {
    writeBattlemapQualityMode(state.roomCode, mode)
    return { battlemapQualityMode: mode }
  }),

  setPlayers: (players) => set({ players }),
  setConnected: (connected) => set({ connected }),
  addPlayer: (player) => set((s) => ({ players: [...s.players.filter(p => p.id !== player.id), player] })),
  removePlayer: (playerId) => set((s) => ({ players: s.players.filter(p => p.id !== playerId) })),

  listCampaigns: async () => {
    const token = useAuthStore.getState().token
    if (!token) return
    set({ campaignsLoading: true })
    try {
      const res = await callBackendApi('/api/campaign/list', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = res.data
        const campaigns = Array.isArray(data.campaigns) ? (data.campaigns as CampaignSlot[]) : []
        set({ campaigns })
      }
    } catch {
      // Non-critical — silently ignore if campaigns can't be loaded
    } finally {
      set({ campaignsLoading: false })
    }
  },

  deleteCampaign: async (campaignId) => {
    const token = useAuthStore.getState().token
    if (!token) throw new Error('Authentication required')
    const res = await callBackendApi(`/api/campaign/${campaignId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(typeof res.data.error === 'string' ? res.data.error : 'Failed to delete campaign.')
    }
    set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== campaignId) }))
  },

  resumeCampaign: async (campaignId, playerName) => {
    const token = useAuthStore.getState().token
    if (!token) {
      throw new Error('Authentication required to resume a campaign.')
    }

    // 1. Fetch saved campaign data from ts-runtime (characters, map, conversation)
    const campaignRes = await callBackendApi(`/api/campaign/${campaignId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!campaignRes.ok || typeof campaignRes.data.error === 'string') {
      throw new Error(typeof campaignRes.data.error === 'string' ? campaignRes.data.error : 'Campaign not found.')
    }
    const campaign = campaignRes.data as {
      characters: Record<string, Record<string, unknown>>
      map: Record<string, unknown> | null
      conversation: unknown[]
      name: string
      player_characters: Record<string, { char_id: string; name: string; class: string; level: number }>
    }

    // 2. Create a fresh Supabase session
    const createData = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
      action: 'create_session',
      player_name: playerName,
      mock_mode: false,
    }, { authMode: 'anon' })

    if (typeof createData.room_code !== 'string' || typeof createData.player_id !== 'string') {
      throw new Error('Failed to create session for campaign resume.')
    }

    const roomCode = createData.room_code
    const playerId = createData.player_id
    const sessionId = typeof createData.session_id === 'string' ? createData.session_id : null

    // 3. Determine which character belongs to this user
    const userId = useAuthStore.getState().userId
    const myCharEntry = userId ? (campaign.player_characters?.[userId] ?? null) : null
    const characterId = myCharEntry?.char_id ?? null

    // 4. Initialize the snapshot with saved map + characters
    const initData = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
      action: 'initialize_from_campaign',
      room_code: roomCode,
      player_id: playerId,
      characters: campaign.characters ?? {},
      map: campaign.map ?? null,
      conversation: campaign.conversation ?? [],
      character_id: characterId,
    }, { authMode: 'anon' })

    const restoredState = initData.state as { characters?: Record<string, unknown>; map?: Record<string, unknown>; narrative_history?: unknown[] } | undefined

    // 5. Preload game store with restored state so it's ready before the board mounts
    if (restoredState) {
      const { setCharacters, setMap, addNarrative } = useGameStore.getState()
      if (restoredState.characters && Object.keys(restoredState.characters).length > 0) {
        setCharacters(restoredState.characters as Record<string, import('../types').CharacterData>)
      }
      if (restoredState.map) {
        setMap(restoredState.map as unknown as import('../types').MapData)
      }
      if (Array.isArray(restoredState.narrative_history)) {
        for (const entry of restoredState.narrative_history as Array<{ type?: string; content?: string; speaker?: string }>) {
          let entryType: 'dm' | 'system' | 'player' = 'player'
          if (entry.type === 'dm') entryType = 'dm'
          else if (entry.type === 'system') entryType = 'system'
          addNarrative(entryType, entry.content ?? '', entry.speaker)
        }
      }
    }

    const hasCharacter = characterId !== null
    set({
      sessionId,
      roomCode,
      playerId,
      playerName,
      isHost: true,
      players: [{ id: playerId, name: playerName, character_id: characterId }],
      campaignTitle: campaign.name ?? campaignId,
      phase: hasCharacter ? 'playing' : 'character_create',
    })
    writeActiveSession({ roomCode, playerId, playerName, sessionId, phase: hasCharacter ? 'playing' : 'character_create' })

    if (sessionId) {
      startSessionEvents(sessionId, roomCode)
    }
  },

  reset: () => {
    stopSessionEvents()
    clearActiveSession()
    set({
      sessionId: null,
      roomCode: null,
      playerId: null,
      playerName: null,
      mockMode: false,
      players: [],
      isHost: false,
      connected: false,
      phase: 'lobby',
      campaigns: [],
      campaignPremise: null,
      campaignTone: null,
      campaignTitle: null,
      battlemapQualityMode: 'fast',
    })
  },
}))
