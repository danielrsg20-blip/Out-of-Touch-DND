import { create } from 'zustand'
import type { CampaignCharacter, CampaignSlot, PlayerData } from '../types'
import { API_BASE } from '../config/endpoints'
import { callBackendApi } from '../lib/backendApi'
import { getSupabaseClient, hasSupabaseConfig, invokeEdgeFunction } from '../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

const SUPABASE_SESSIONS_FLAG = import.meta.env.VITE_USE_SUPABASE_SESSIONS
const USE_SUPABASE_SESSIONS = SUPABASE_SESSIONS_FLAG
  ? SUPABASE_SESSIONS_FLAG === 'true'
  : true
const HAS_EXPLICIT_API_URL = Boolean(import.meta.env.VITE_API_URL?.trim())
let sessionEventsChannel: RealtimeChannel | null = null

function shouldUseSupabaseSessions(): boolean {
  // In local/dev runs with an explicit API URL, prefer the FastAPI backend
  // so session/map behavior matches the actively edited Python pipeline.
  if (import.meta.env.DEV && HAS_EXPLICIT_API_URL) {
    return false
  }
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

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
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

  setPhase: (phase: SessionState['phase']) => void
  createSession: (playerName: string, mockMode?: boolean) => Promise<void>
  joinSession: (roomCode: string, playerName: string) => Promise<void>
  getSession: (roomCode: string) => Promise<Record<string, unknown>>
  setPlayers: (players: PlayerData[]) => void
  setConnected: (connected: boolean) => void
  addPlayer: (player: PlayerData) => void
  removePlayer: (playerId: string) => void
  listCampaigns: () => Promise<void>
  fetchCampaignCharacters: (campaignId: string) => Promise<CampaignCharacter[]>
  resumeCampaign: (campaignId: string, playerName: string, characterId?: string) => Promise<void>
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

  setPhase: (phase) => set({ phase }),

  getSession: async (roomCode) => {
    const normalizedRoomCode = roomCode.toUpperCase()

    if (shouldUseSupabaseSessions()) {
      try {
        const supabase = getSupabaseClient()
        if (supabase) {
          const payload = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
            action: 'get_session',
            room_code: normalizedRoomCode,
          })
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

          return payload
        }
      } catch (error) {
        console.warn('Supabase get_session failed; falling back to FastAPI endpoint.', error)
      }
    }

    if (!HAS_EXPLICIT_API_URL) {
      throw new Error('Supabase get_session failed and no VITE_API_URL fallback is configured.')
    }

    const res = await fetch(`${API_BASE}/api/session/${normalizedRoomCode}`)
    const data = await parseJsonBody(res)
    if (!res.ok) {
      throw new Error('Unable to load session.')
    }

    const session = data.session as Record<string, unknown> | undefined
    const players = Array.isArray(session?.players) ? (session.players as PlayerData[]) : null
    if (players) {
      set({ players })
    }

    return data
  },

  createSession: async (playerName, mockMode = false) => {
    let data: Record<string, unknown> = {}
    let supabaseCreateError: string | null = null

    if (shouldUseSupabaseSessions()) {
      try {
        const supabase = getSupabaseClient()
        if (supabase) {
          data = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
            action: 'create_session',
            player_name: playerName,
            mock_mode: mockMode,
          })
        }
      } catch (error) {
        supabaseCreateError = error instanceof Error ? error.message : 'Supabase create_session failed.'
        console.warn('Supabase create_session failed; falling back to FastAPI endpoint.', error)
      }
    }

    if (!data.room_code || !data.player_id) {
      if (!HAS_EXPLICIT_API_URL) {
        throw new Error(supabaseCreateError ?? 'Supabase create_session failed and no VITE_API_URL fallback is configured.')
      }
      try {
        const { useAuthStore } = await import('./authStore')
        const authToken = useAuthStore.getState().token
        const createHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authToken) createHeaders['Authorization'] = `Bearer ${authToken}`
        const res = await fetch(`${API_BASE}/api/session/create`, {
          method: 'POST',
          headers: createHeaders,
          body: JSON.stringify({ player_name: playerName }),
        })
        data = await parseJsonBody(res)
        if (!res.ok) {
          const backendError = typeof data.error === 'string' ? data.error : `FastAPI create failed (${res.status}).`
          const fallbackDetail = supabaseCreateError ? ` Supabase error: ${supabaseCreateError}` : ''
          throw new Error(`${backendError}${fallbackDetail}`)
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        const fallbackDetail = supabaseCreateError ? ` Supabase error: ${supabaseCreateError}` : ''
        throw new Error(`Unable to create session.${fallbackDetail}`)
      }
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
    })

    if (sessionId) {
      startSessionEvents(sessionId, data.room_code)
    }

    try {
      const latestState = await useSessionStore.getState().getSession(data.room_code)
      const { useGameStore } = await import('./gameStore')
      useGameStore.getState().syncState(latestState as any)
    } catch (error) {
      console.warn('Failed to sync initial game state after session create.', error)
    }
  },

  joinSession: async (roomCode, playerName) => {
    let data: Record<string, unknown> = {}
    let supabaseJoinError: string | null = null

    if (shouldUseSupabaseSessions()) {
      try {
        const supabase = getSupabaseClient()
        if (supabase) {
          data = await invokeEdgeFunction<Record<string, unknown>>('session-actions', {
            action: 'join_session',
            room_code: roomCode,
            player_name: playerName,
          })
        }
      } catch (error) {
        supabaseJoinError = error instanceof Error ? error.message : 'Supabase join_session failed.'
        console.warn('Supabase join_session failed; falling back to FastAPI endpoint.', error)
      }
    }

    if (!data.player_id || !data.session) {
      if (!HAS_EXPLICIT_API_URL) {
        throw new Error(supabaseJoinError ?? 'Supabase join_session failed and no VITE_API_URL fallback is configured.')
      }
      try {
        const { useAuthStore: authStoreForJoin } = await import('./authStore')
        const joinAuthToken = authStoreForJoin.getState().token
        const joinHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (joinAuthToken) joinHeaders['Authorization'] = `Bearer ${joinAuthToken}`
        const res = await fetch(`${API_BASE}/api/session/join`, {
          method: 'POST',
          headers: joinHeaders,
          body: JSON.stringify({ room_code: roomCode, player_name: playerName }),
        })
        data = await parseJsonBody(res)
        if (!res.ok) {
          const backendError = typeof data.error === 'string' ? data.error : `FastAPI join failed (${res.status}).`
          const fallbackDetail = supabaseJoinError ? ` Supabase error: ${supabaseJoinError}` : ''
          throw new Error(`${backendError}${fallbackDetail}`)
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        const fallbackDetail = supabaseJoinError ? ` Supabase error: ${supabaseJoinError}` : ''
        throw new Error(`Unable to join session.${fallbackDetail}`)
      }
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
    })

    if (sessionId) {
      startSessionEvents(sessionId, roomCode.toUpperCase())
    }

    try {
      const normalizedRoomCode = roomCode.toUpperCase()
      const latestState = await useSessionStore.getState().getSession(normalizedRoomCode)
      const { useGameStore } = await import('./gameStore')
      useGameStore.getState().syncState(latestState as any)
    } catch (error) {
      console.warn('Failed to sync initial game state after session join.', error)
    }
  },

  setPlayers: (players) => set({ players }),
  setConnected: (connected) => set({ connected }),
  addPlayer: (player) => set((s) => ({ players: [...s.players.filter(p => p.id !== player.id), player] })),
  removePlayer: (playerId) => set((s) => ({ players: s.players.filter(p => p.id !== playerId) })),

  listCampaigns: async () => {
    const { useAuthStore } = await import('./authStore')
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

  fetchCampaignCharacters: async (campaignId) => {
    const { useAuthStore } = await import('./authStore')
    const token = useAuthStore.getState().token
    if (!token) return []
    try {
      const res = await callBackendApi(`/api/campaign/${campaignId}/characters`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const data = res.data
      return Array.isArray(data.characters) ? (data.characters as CampaignCharacter[]) : []
    } catch {
      return []
    }
  },

  resumeCampaign: async (campaignId, playerName, characterId?) => {
    const { useAuthStore } = await import('./authStore')
    const token = useAuthStore.getState().token
    if (!token) {
      throw new Error('Authentication required to resume a campaign.')
    }
    const res = await callBackendApi('/api/campaign/resume', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: { campaign_id: campaignId, player_name: playerName, character_id: characterId ?? null },
    })
    const data = res.data
    if (!res.ok || typeof data.error === 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : 'Failed to resume campaign.')
    }
    if (typeof data.room_code !== 'string' || typeof data.player_id !== 'string') {
      throw new TypeError('Invalid response from server.')
    }
    const roomCode = data.room_code
    const playerId = data.player_id
    const hasCharacter = data.has_character === true
    set({
      roomCode,
      playerId,
      playerName,
      isHost: true,
      players: [{ id: playerId, name: playerName, character_id: null }],
      phase: hasCharacter ? 'playing' : 'character_create',
    })
  },

  reset: () => {
    stopSessionEvents()
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
    })
  },
}))
