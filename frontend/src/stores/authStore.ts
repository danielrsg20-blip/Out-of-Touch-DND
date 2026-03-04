import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabaseClient'

const USERNAME_ALIAS_DOMAIN = 'example.com'

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

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  username: null,
  isAuthenticated: false,
  isLoading: true,

  register: async (username, password) => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      throw new Error('Supabase auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }

    const aliasEmail = usernameToAliasEmail(username)
    const { data, error } = await supabase.auth.signUp({
      email: aliasEmail,
      password,
      options: {
        data: {
          username: username.trim(),
        },
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    if (!data.user) {
      throw new Error('Registration failed. Please try again.')
    }

    if (!data.session) {
      throw new Error('Registration created. Please sign in to continue.')
    }

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
      throw new Error('Supabase auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }

    const aliasEmail = usernameToAliasEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: aliasEmail,
      password,
    })

    if (error) {
      throw new Error(error.message)
    }

    if (!data.session || !data.user) {
      throw new Error('Login failed. Please check your credentials.')
    }

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
    }
    set({ token: null, userId: null, username: null, isAuthenticated: false })
  },

  hydrateFromStorage: async () => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      set({ isLoading: false })
      return
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.user) {
        throw new Error('No active session')
      }

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
