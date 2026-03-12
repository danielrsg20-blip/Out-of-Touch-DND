const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''

const VOICE_MAP: Record<string, string> = {
  dm_default: 'onyx',
  dm_female: 'nova',
  npc_friendly: 'alloy',
  npc_mysterious: 'echo',
  npc_gruff: 'fable',
  npc_young: 'shimmer',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const voiceKey = typeof body.voiceId === 'string' ? body.voiceId : 'dm_default'
  const mockMode = body.mock_mode === true

  if (!text) {
    return Response.json({ error: 'text is required' }, { status: 400, headers: corsHeaders })
  }

  if (mockMode || !OPENAI_API_KEY) {
    const silenceB64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAD///////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAE'
    return Response.json(
      { audio: silenceB64, duration_ms: 1000, voice: voiceKey },
      { headers: corsHeaders },
    )
  }

  const voice = VOICE_MAP[voiceKey] ?? 'onyx'

  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'tts-1', voice, input: text, response_format: 'mp3' }),
  })

  if (!ttsRes.ok) {
    const errText = await ttsRes.text()
    return Response.json(
      { error: `TTS provider error (${ttsRes.status}): ${errText.slice(0, 200)}` },
      { status: 502, headers: corsHeaders },
    )
  }

  const audioBuffer = await ttsRes.arrayBuffer()
  const bytes = new Uint8Array(audioBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  const durationMs = Math.round((audioBuffer.byteLength / 32000) * 1000)

  return Response.json(
    { audio: base64, duration_ms: durationMs, voice },
    { headers: corsHeaders },
  )
})
