const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void
  env: {
    get(name: string): string | undefined
  }
}

type ProxyRequest = {
  path?: unknown
  method?: unknown
  headers?: unknown
  body?: unknown
}

const ALLOWED_PREFIXES = ['/api/campaign/', '/api/overlays/']
const ALLOWED_EXACT_PATHS = new Set(['/api/campaign/list', '/api/campaign/resume'])

function isAllowedPath(path: string): boolean {
  if (ALLOWED_EXACT_PATHS.has(path)) {
    return true
  }
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

function pickHeaders(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') {
    return {}
  }
  const candidate = input as Record<string, unknown>
  const picked: Record<string, string> = {}

  const auth = candidate.Authorization ?? candidate.authorization
  const contentType = candidate['Content-Type'] ?? candidate['content-type']
  const accept = candidate.Accept ?? candidate.accept

  if (typeof auth === 'string' && auth.trim()) {
    picked.Authorization = auth
  }
  if (typeof contentType === 'string' && contentType.trim()) {
    picked['Content-Type'] = contentType
  }
  if (typeof accept === 'string' && accept.trim()) {
    picked.Accept = accept
  }

  return picked
}

function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let parsedBody: ProxyRequest
  try {
    parsedBody = await req.json() as ProxyRequest
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body' }, 400)
  }

  const path = typeof parsedBody.path === 'string' ? parsedBody.path : ''
  if (!path.startsWith('/') || !isAllowedPath(path)) {
    return jsonResponse({
      status: 400,
      body: JSON.stringify({ error: 'Path is not allowed for proxying.' }),
    })
  }

  const backendBase = (Deno.env.get('BACKEND_API_URL') ?? '').trim()
  if (!backendBase) {
    return jsonResponse({
      status: 503,
      body: JSON.stringify({ error: 'BACKEND_API_URL is not configured.' }),
    })
  }

  const method = typeof parsedBody.method === 'string' ? parsedBody.method.toUpperCase() : 'GET'
  const upstreamHeaders = pickHeaders(parsedBody.headers)
  const upstreamBody = typeof parsedBody.body === 'string'
    ? parsedBody.body
    : parsedBody.body == null
      ? undefined
      : JSON.stringify(parsedBody.body)

  try {
    const targetUrl = new URL(path, backendBase.endsWith('/') ? backendBase : `${backendBase}/`)
    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers: upstreamHeaders,
      body: upstreamBody,
    })
    const text = await upstream.text()

    return jsonResponse({
      status: upstream.status,
      body: text,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error'
    return jsonResponse({
      status: 502,
      body: JSON.stringify({ error: `Failed to reach backend API: ${message}` }),
    })
  }
})
