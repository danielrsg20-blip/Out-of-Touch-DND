import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabaseServiceClient(): SupabaseClient {
  if (client) return client

  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required for battlemap generation')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for battlemap generation')
  }

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return client
}

export function getBattlemapBucketName(): string {
  return (process.env.SUPABASE_BATTLEMAP_BUCKET ?? 'battlemap-images').trim()
}
