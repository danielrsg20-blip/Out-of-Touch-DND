import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient
  }

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  cachedClient = createClient(url, anonKey)
  return cachedClient
}

export function hasSupabaseConfig(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabaseClient()
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabase || !url || !anonKey) {
    throw new Error('Supabase is not configured.')
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
  }

  // Always send a Bearer token — use the user session JWT if available, otherwise
  // fall back to the anon key (which is itself a valid Supabase JWT for public calls).
  headers.Authorization = `Bearer ${accessToken ?? anonKey}`

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const payload = text.trim() ? JSON.parse(text) as Record<string, unknown> : {}

  if (!response.ok) {
    const detail = typeof payload.error === 'string'
      ? payload.error
      : `Edge Function ${functionName} failed (${response.status})`
    throw new Error(detail)
  }

  return payload as T
}