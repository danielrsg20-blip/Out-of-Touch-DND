import { create } from 'zustand'
import { API_BASE } from '../config/endpoints'

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

function errorFromResponse(action: string, res: Response, payload: Record<string, unknown>): Error {
  const detail = typeof payload.detail === 'string' ? payload.detail : ''
  const generic = `${action} failed (${res.status}).`
  if (detail) {
    return new Error(detail)
  }

  if (!import.meta.env.DEV && API_BASE === window.location.origin) {
    return new Error(`${generic} Backend URL is not configured. Set VITE_API_URL and VITE_WS_URL in Vercel.`)
  }

  return new Error(generic)
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
    const data = await parseJsonBody(res)
    if (!res.ok) throw errorFromResponse('Registration', res, data)
    if (typeof data.token !== 'string' || typeof data.user_id !== 'string' || typeof data.username !== 'string') {
      throw new Error('Registration failed (invalid server response).')
    }
    localStorage.setItem(STORAGE_KEY, data.token)
    set({ token: data.token, userId: data.user_id, username: data.username, isAuthenticated: true })
  },

  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await parseJsonBody(res)
    if (!res.ok) throw errorFromResponse('Login', res, data)
    if (typeof data.token !== 'string' || typeof data.user_id !== 'string' || typeof data.username !== 'string') {
      throw new Error('Login failed (invalid server response).')
    }
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
      const data = await parseJsonBody(res)
      if (typeof data.user_id !== 'string' || typeof data.username !== 'string') {
        throw new Error('Token invalid')
      }
      set({ token, userId: data.user_id, username: data.username, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      set({ isLoading: false })
    }
  },
}))
