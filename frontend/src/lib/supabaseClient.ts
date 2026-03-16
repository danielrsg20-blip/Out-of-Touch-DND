import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

type EdgeAuthMode = 'auto' | 'anon' | 'user'

type InvokeEdgeFunctionOptions = {
  authMode?: EdgeAuthMode
  maxRetries?: number
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])
const RETRY_BACKOFF_MS = [250, 800]

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

function parseEdgePayload(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
  } catch {
    return { error: text.slice(0, 300) }
  }
}

function getRetryDelayMs(attempt: number): number {
  const base = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]
  const jitterFactor = 0.8 + Math.random() * 0.4
  return Math.round(base * jitterFactor)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network request failed')
}

export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
  options?: InvokeEdgeFunctionOptions,
): Promise<T> {
  const supabase = getSupabaseClient()
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const authMode = options?.authMode ?? 'auto'
  const maxRetries = Math.max(0, Math.min(options?.maxRetries ?? 2, 3))

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
    const payload = parseEdgePayload(text)
    return { response, payload }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      let result: { response: Response; payload: Record<string, unknown> }
      if (authMode === 'anon') {
        result = await invokeWithToken(anonKey)
      } else if (authMode === 'user') {
        result = await invokeWithToken(accessToken ?? anonKey)
      } else {
        result = await invokeWithToken(accessToken ?? anonKey)
        const message = typeof result.payload.message === 'string' ? result.payload.message : ''
        const code = typeof result.payload.code === 'number' ? result.payload.code : null
        const shouldRetryWithAnon = Boolean(
          accessToken
          && result.response.status === 401
          && (message.toLowerCase().includes('invalid jwt') || code === 401),
        )
        if (shouldRetryWithAnon) {
          result = await invokeWithToken(anonKey)
        }
      }

      if (!result.response.ok) {
        if (RETRYABLE_STATUSES.has(result.response.status) && attempt < maxRetries) {
          await sleep(getRetryDelayMs(attempt))
          continue
        }
        const detail = typeof result.payload.error === 'string'
          ? result.payload.error
          : `Edge Function ${functionName} failed (${result.response.status})`
        throw new Error(detail)
      }

      return result.payload as T
    } catch (error) {
      if (attempt < maxRetries && isNetworkError(error)) {
        await sleep(getRetryDelayMs(attempt))
        continue
      }
      throw error
    }
  }

  throw new Error(`Edge Function ${functionName} failed after retries`)
}

export async function invokeEdgeFunctionWithAnon<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  return invokeEdgeFunction<T>(functionName, body, { authMode: 'anon' })
}