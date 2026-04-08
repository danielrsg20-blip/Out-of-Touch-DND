/**
 * Validate environment at startup and log warnings for missing optional config.
 * Call before React renders so issues are visible in the console immediately.
 */
export function validateEnv(): string[] {
  const warnings: string[] = []

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    warnings.push(
      'Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Auth, Edge Functions, and multiplayer will be unavailable.',
    )
  }

  if (!import.meta.env.VITE_API_URL && !import.meta.env.DEV) {
    warnings.push('VITE_API_URL not set — falling back to window.location.origin for API calls.')
  }

  for (const w of warnings) {
    console.warn(`[env] ${w}`)
  }

  return warnings
}
