import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : null

  return Response.json({
    ok: true,
    phase: 'scaffold',
    function: 'voice-stt',
    sessionId,
    storagePath,
    note: 'Speech-to-text pipeline will be implemented here and emit realtime transcript events.'
  })
})