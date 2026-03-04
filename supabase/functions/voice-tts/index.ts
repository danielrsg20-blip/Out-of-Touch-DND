import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const text = typeof body.text === 'string' ? body.text : null
  const voiceId = typeof body.voiceId === 'string' ? body.voiceId : 'alloy'

  return Response.json({
    ok: true,
    phase: 'scaffold',
    function: 'voice-tts',
    voiceId,
    hasText: Boolean(text && text.length > 0),
    note: 'Text-to-speech generation and storage publish flow will be implemented here.'
  })
})