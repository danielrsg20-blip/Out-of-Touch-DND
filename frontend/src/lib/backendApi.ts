import { API_BASE } from '../config/endpoints'
import { invokeEdgeFunction } from './supabaseClient'

const HAS_DIRECT_BACKEND = import.meta.env.DEV || Boolean(import.meta.env.VITE_API_URL?.trim())

type JsonMap = Record<string, unknown>

type BackendApiInit = {
  method?: string
  headers?: Record<string, string>
  body?: JsonMap | string | null
}

export type BackendApiResult = {
  ok: boolean
  status: number
  data: JsonMap
  text: string
}

function parseJsonOrEmpty(text: string): JsonMap {
  if (!text.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as JsonMap) : {}
  } catch {
    return {}
  }
}

function normalizeInit(init?: BackendApiInit): {
  method: string
  headers: Record<string, string>
  body: string | undefined
} {
  const method = init?.method ?? 'GET'
  const headers = { ...(init?.headers ?? {}) }
  let body: string | undefined

  if (typeof init?.body === 'string') {
    body = init.body
  } else if (init?.body && typeof init.body === 'object') {
    body = JSON.stringify(init.body)
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  return { method, headers, body }
}

export async function callBackendApi(path: string, init?: BackendApiInit): Promise<BackendApiResult> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const { method, headers, body } = normalizeInit(init)

  if (HAS_DIRECT_BACKEND) {
    const response = await fetch(`${API_BASE}${normalizedPath}`, {
      method,
      headers,
      body,
    })
    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      data: parseJsonOrEmpty(text),
      text,
    }
  }

  const payload = await invokeEdgeFunction<{
    status?: number
    body?: string
  }>('backend-proxy', {
    path: normalizedPath,
    method,
    headers,
    body: body ?? null,
  })

  const status = typeof payload.status === 'number' ? payload.status : 500
  const text = typeof payload.body === 'string' ? payload.body : ''

  return {
    ok: status >= 200 && status < 300,
    status,
    data: parseJsonOrEmpty(text),
    text,
  }
}
