/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dev-only legacy backend URLs. Do not set in production.
  readonly VITE_API_URL?: string
  readonly VITE_WS_URL?: string
  // Optional compatibility flag; Supabase edge is the default runtime.
  readonly VITE_DM_ACTION_TARGET?: string
  // Required for Supabase Auth and Edge Function invocation.
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_USE_SUPABASE_SESSIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
