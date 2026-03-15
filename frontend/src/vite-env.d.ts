/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_WS_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_USE_SUPABASE_SESSIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __otdndSpritePipelineHits?: number
  __otdndSpritePipelineHarness?: {
    getSnapshot: () => {
      legacyEnabled: boolean
      hits: number
      lastReason: string | null
      assertions: number
      failures: number
    }
    assertNoLegacyHits: (context?: string) => boolean
    reset: () => void
  }
}
