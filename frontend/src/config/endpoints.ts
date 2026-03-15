const rawApiUrl = import.meta.env.VITE_API_URL?.trim()
const rawWsUrl = import.meta.env.VITE_WS_URL?.trim()

export const API_BASE = rawApiUrl || (import.meta.env.DEV ? 'http://localhost:9010' : window.location.origin)

const wsFromApi = API_BASE.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
export const WS_BASE = rawWsUrl || wsFromApi
