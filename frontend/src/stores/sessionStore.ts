import { create } from 'zustand'
import type { PlayerData } from '../types'
import { API_BASE } from '../config/endpoints'
import { getSupabaseClient, hasSupabaseConfig } from '../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

const USE_SUPABASE_SESSIONS = import.meta.env.VITE_USE_SUPABASE_SESSIONS === 'true'
let sessionEventsChannel: RealtimeChannel | null = null

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
  players: PlayerData[]
  isHost: boolean
  connected: boolean
  phase: 'lobby' | 'character_create' | 'playing'

  setPhase: (phase: SessionState['phase']) => void
  createSession: (playerName: string) => Promise<void>
  joinSession: (roomCode: string, playerName: string) => Promise<void>
  getSession: (roomCode: string) => Promise<Record<string, unknown>>
  setPlayers: (players: PlayerData[]) => void
  setConnected: (connected: boolean) => void
  addPlayer: (player: PlayerData) => void
  removePlayer: (playerId: string) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  roomCode: null,
  playerId: null,
  playerName: null,
  players: [],
  isHost: false,
  connected: false,
  phase: 'lobby',

  setPhase: (phase) => set({ phase }),

  getSession: async (roomCode) => {
    const normalizedRoomCode = roomCode.toUpperCase()

    if (shouldUseSupabaseSessions()) {
      try {
        const supabase = getSupabaseClient()
        if (supabase) {
          const { data, error } = await supabase.functions.invoke('session-actions', {
            body: {
              action: 'get_session',
              room_code: normalizedRoomCode,
            },
          })
          if (error) {
            throw new Error(error.message)
          }
          const payload = (data ?? {}) as Record<string, unknown>
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

  createSession: async (playerName) => {
    let data: Record<string, unknown> = {}

    if (shouldUseSupabaseSessions()) {
      try {
        const supabase = getSupabaseClient()
        if (supabase) {
          const { data: supabaseData, error } = await supabase.functions.invoke('session-actions', {
            body: {
              action: 'create_session',
              player_name: playerName,
            },
          })
          if (error) {
            throw new Error(error.message)
          }
          data = (supabaseData ?? {}) as Record<string, unknown>
        }
      } catch (error) {
        console.warn('Supabase create_session failed; falling back to FastAPI endpoint.', error)
      }
    }

    if (!data.room_code || !data.player_id) {
      const res = await fetch(`${API_BASE}/api/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: playerName }),
      })
      data = await parseJsonBody(res)
      if (!res.ok) {
        throw new Error('Unable to create session.')
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
      isHost: true,
      players: [{ id: data.player_id, name: playerName, character_id: null }],
    })

    if (sessionId) {
      startSessionEvents(sessionId, data.room_code)
    }
  },

  joinSession: async (roomCode, playerName) => {
    let data: Record<string, unknown> = {}

    if (shouldUseSupabaseSessions()) {
      try {
        const supabase = getSupabaseClient()
        if (supabase) {
          const { data: supabaseData, error } = await supabase.functions.invoke('session-actions', {
            body: {
              action: 'join_session',
              room_code: roomCode,
              player_name: playerName,
            },
          })
          if (error) {
            throw new Error(error.message)
          }
          data = (supabaseData ?? {}) as Record<string, unknown>
        }
      } catch (error) {
        console.warn('Supabase join_session failed; falling back to FastAPI endpoint.', error)
      }
    }

    if (!data.player_id || !data.session) {
      const res = await fetch(`${API_BASE}/api/session/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_code: roomCode, player_name: playerName }),
      })
      data = await parseJsonBody(res)
      if (!res.ok) {
        throw new Error('Unable to join session.')
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
      isHost: false,
      players,
    })

    if (sessionId) {
      startSessionEvents(sessionId, roomCode.toUpperCase())
    }
  },

  setPlayers: (players) => set({ players }),
  setConnected: (connected) => set({ connected }),
  addPlayer: (player) => set((s) => ({ players: [...s.players.filter(p => p.id !== player.id), player] })),
  removePlayer: (playerId) => set((s) => ({ players: s.players.filter(p => p.id !== playerId) })),
  reset: () => {
    stopSessionEvents()
    set({
      sessionId: null,
      roomCode: null,
      playerId: null,
      playerName: null,
      players: [],
      isHost: false,
      connected: false,
      phase: 'lobby',
    })
  },
}))
