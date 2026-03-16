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

  const baseHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
  }

  async function invokeWithToken(bearerToken: string): Promise<{ response: Response; payload: Record<string, unknown> }> {
    const headers: HeadersInit = {
      ...baseHeaders,
      Authorization: `Bearer ${bearerToken}`,
    }

    const response = await fetch(`${url}/functions/v1/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const text = await response.text()
    const payload = text.trim() ? JSON.parse(text) as Record<string, unknown> : {}
    return { response, payload }
  }

  let { response, payload } = await invokeWithToken(accessToken ?? anonKey)

  const message = typeof payload.message === 'string' ? payload.message : ''
  const code = typeof payload.code === 'number' ? payload.code : null
  const shouldRetryWithAnon = Boolean(
    accessToken
    && response.status === 401
    && (message.toLowerCase().includes('invalid jwt') || code === 401),
  )

  if (shouldRetryWithAnon) {
    ({ response, payload } = await invokeWithToken(anonKey))
  }

  if (!response.ok) {
    const detail = typeof payload.error === 'string'
      ? payload.error
      : `Edge Function ${functionName} failed (${response.status})`
    throw new Error(detail)
  }

  return payload as T
}

export async function invokeEdgeFunctionWithAnon<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase is not configured.')
  }

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
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