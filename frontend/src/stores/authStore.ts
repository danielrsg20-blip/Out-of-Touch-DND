import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabaseClient'
import { API_BASE } from '../config/endpoints'

const USERNAME_ALIAS_DOMAIN = 'example.com'
const LOCAL_TOKEN_KEY = 'auth_token'

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

function normalizeUsername(username: string): string {
  return username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
  }

function usernameToAliasEmail(username: string): string {
  const normalized = normalizeUsername(username)
  if (!normalized || normalized.length < 3) {
    throw new Error('Username must be at least 3 valid characters.')
  }
  return `${normalized}@${USERNAME_ALIAS_DOMAIN}`
}

function usernameFromUser(user: User): string {
  const metadataUsername = user.user_metadata?.username
  if (typeof metadataUsername === 'string' && metadataUsername.trim()) {
    return metadataUsername
  }

  if (user.email && user.email.endsWith(`@${USERNAME_ALIAS_DOMAIN}`)) {
    return user.email.replace(new RegExp(`@${USERNAME_ALIAS_DOMAIN.replace('.', '\\.')}$`, 'i'), '')
  }

  return user.email ?? user.id
}

// --- Local FastAPI auth fallback ---

async function localRegister(username: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json() as { token?: string; user_id?: string; username?: string; detail?: string }
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Registration failed.')
  return data as { token: string; user_id: string; username: string }
}

async function localLogin(username: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json() as { token?: string; user_id?: string; username?: string; detail?: string }
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Login failed.')
  return data as { token: string; user_id: string; username: string }
}

async function localHydrate(token: string) {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Session expired.')
  const data = await res.json() as { user_id: string; username: string }
  return data
}

// ---

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  username: null,
  isAuthenticated: false,
  isLoading: true,

  register: async (username, password) => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      const data = await localRegister(username, password)
      localStorage.setItem(LOCAL_TOKEN_KEY, data.token)
      set({ token: data.token, userId: data.user_id, username: data.username, isAuthenticated: true })
      return
    }

    const aliasEmail = usernameToAliasEmail(username)
    const { data, error } = await supabase.auth.signUp({
      email: aliasEmail,
      password,
      options: { data: { username: username.trim() } },
    })

    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('Registration failed. Please try again.')
    if (!data.session) throw new Error('Registration created. Please sign in to continue.')

    set({
      token: data.session.access_token,
      userId: data.user.id,
      username: usernameFromUser(data.user),
      isAuthenticated: true,
    })
  },

  login: async (username, password) => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      const data = await localLogin(username, password)
      localStorage.setItem(LOCAL_TOKEN_KEY, data.token)
      set({ token: data.token, userId: data.user_id, username: data.username, isAuthenticated: true })
      return
    }

    const aliasEmail = usernameToAliasEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email: aliasEmail, password })

    if (error) throw new Error(error.message)
    if (!data.session || !data.user) throw new Error('Login failed. Please check your credentials.')

    set({
      token: data.session.access_token,
      userId: data.user.id,
      username: usernameFromUser(data.user),
      isAuthenticated: true,
    })
  },

  logout: () => {
    const supabase = getSupabaseClient()
    if (supabase) {
      supabase.auth.signOut()
    } else {
      localStorage.removeItem(LOCAL_TOKEN_KEY)
    }
    set({ token: null, userId: null, username: null, isAuthenticated: false })
  },

  hydrateFromStorage: async () => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      const token = localStorage.getItem(LOCAL_TOKEN_KEY)
      if (!token) {
        set({ isLoading: false })
        return
      }
      try {
        const data = await localHydrate(token)
        set({ token, userId: data.user_id, username: data.username, isAuthenticated: true, isLoading: false })
      } catch {
        localStorage.removeItem(LOCAL_TOKEN_KEY)
        set({ token: null, userId: null, username: null, isAuthenticated: false, isLoading: false })
      }
      return
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.user) throw new Error('No active session')

      set({
        token: data.session.access_token,
        userId: data.session.user.id,
        username: usernameFromUser(data.session.user),
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      set({ token: null, userId: null, username: null, isAuthenticated: false, isLoading: false })
    }
  },
}))
