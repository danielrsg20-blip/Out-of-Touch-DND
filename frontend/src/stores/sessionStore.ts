import { create } from 'zustand'
import type { CampaignCharacter, CampaignSlot, PlayerData } from '../types'
import { callBackendApi } from '../lib/backendApi'
import { getSupabaseClient, hasSupabaseConfig, invokeEdgeFunction } from '../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

const SUPABASE_SESSIONS_FLAG = import.meta.env.VITE_USE_SUPABASE_SESSIONS
const USE_SUPABASE_SESSIONS = SUPABASE_SESSIONS_FLAG
  ? SUPABASE_SESSIONS_FLAG === 'true'
  : true
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

  setPhase: (phase: SessionState['phase']) => void
  createSession: (playerName: string, mockMode?: boolean, campaignPremise?: string, campaignTone?: string, campaignTitle?: string) => Promise<void>
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
  campaignPremise: null,
  campaignTone: null,
  campaignTitle: null,

  setPhase: (phase) => set({ phase }),

  getSession: async (roomCode) => {
    const normalizedRoomCode = roomCode.toUpperCase()

    if (!shouldUseSupabaseSessions()) {
      throw new Error('Supabase sessions are disabled or not configured.')
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

    return payload
  },

  createSession: async (playerName, mockMode = false, campaignPremise = '', campaignTone = '', campaignTitle = '') => {
    let data: Record<string, unknown> = {}
    let supabaseCreateError: string | null = null

    if (!shouldUseSupabaseSessions()) {
      throw new Error('Supabase sessions are disabled or not configured.')
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
    })

    if (sessionId) {
      startSessionEvents(sessionId, data.room_code)
    }

    try {
      const latestState = await useSessionStore.getState().getSession(data.room_code)
      const { useGameStore } = await import('./gameStore')
      const normalizedState = (latestState as Record<string, unknown>)?.game_state as Record<string, unknown> | undefined
      useGameStore.getState().syncState((normalizedState ?? latestState) as any)
    } catch (error) {
      console.warn('Failed to sync initial game state after session create.', error)
    }
  },

  joinSession: async (roomCode, playerName) => {
    let data: Record<string, unknown> = {}
    let supabaseJoinError: string | null = null

    if (!shouldUseSupabaseSessions()) {
      throw new Error('Supabase sessions are disabled or not configured.')
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
    })

    if (sessionId) {
      startSessionEvents(sessionId, roomCode.toUpperCase())
    }

    try {
      const normalizedRoomCode = roomCode.toUpperCase()
      const latestState = await useSessionStore.getState().getSession(normalizedRoomCode)
      const { useGameStore } = await import('./gameStore')
      const normalizedState = (latestState as Record<string, unknown>)?.game_state as Record<string, unknown> | undefined
      useGameStore.getState().syncState((normalizedState ?? latestState) as any)
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
      campaignPremise: null,
      campaignTone: null,
      campaignTitle: null,
    })
  },
}))
