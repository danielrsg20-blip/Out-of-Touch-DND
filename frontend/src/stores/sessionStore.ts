import { create } from 'zustand'
import type { PlayerData } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8010'

interface SessionState {
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
  setPlayers: (players: PlayerData[]) => void
  setConnected: (connected: boolean) => void
  addPlayer: (player: PlayerData) => void
  removePlayer: (playerId: string) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  roomCode: null,
  playerId: null,
  playerName: null,
  players: [],
  isHost: false,
  connected: false,
  phase: 'lobby',

  setPhase: (phase) => set({ phase }),

  createSession: async (playerName) => {
    const res = await fetch(`${API_BASE}/api/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: playerName }),
    })
    const data = await res.json()
    set({
      roomCode: data.room_code,
      playerId: data.player_id,
      playerName: playerName,
      isHost: true,
      players: [{ id: data.player_id, name: playerName, character_id: null }],
    })
  },

  joinSession: async (roomCode, playerName) => {
    const res = await fetch(`${API_BASE}/api/session/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_code: roomCode, player_name: playerName }),
    })
    const data = await res.json()
    if (data.session?.error) {
      throw new Error(data.session.error)
    }
    set({
      roomCode: roomCode.toUpperCase(),
      playerId: data.player_id,
      playerName: playerName,
      isHost: false,
      players: data.session.players || [],
    })
  },

  setPlayers: (players) => set({ players }),
  setConnected: (connected) => set({ connected }),
  addPlayer: (player) => set((s) => ({ players: [...s.players.filter(p => p.id !== player.id), player] })),
  removePlayer: (playerId) => set((s) => ({ players: s.players.filter(p => p.id !== playerId) })),
  reset: () => set({
    roomCode: null, playerId: null, playerName: null, players: [],
    isHost: false, connected: false, phase: 'lobby',
  }),
}))
