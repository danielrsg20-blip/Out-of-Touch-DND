import { create } from 'zustand'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const STORAGE_KEY = 'dnd_auth_token'

interface AuthState {
  token: string | null
  userId: string | null
  username: string | null
  isAuthenticated: boolean
  isLoading: boolean

  register: (username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  hydrateFromStorage: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  username: null,
  isAuthenticated: false,
  isLoading: true,

  register: async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Registration failed')
    localStorage.setItem(STORAGE_KEY, data.token)
    set({ token: data.token, userId: data.user_id, username: data.username, isAuthenticated: true })
  },

  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Login failed')
    localStorage.setItem(STORAGE_KEY, data.token)
    set({ token: data.token, userId: data.user_id, username: data.username, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ token: null, userId: null, username: null, isAuthenticated: false })
  },

  hydrateFromStorage: async () => {
    const token = localStorage.getItem(STORAGE_KEY)
    if (!token) {
      set({ isLoading: false })
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Token invalid')
      const data = await res.json()
      set({ token, userId: data.user_id, username: data.username, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      set({ isLoading: false })
    }
  },
}))
