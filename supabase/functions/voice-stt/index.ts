const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const audioBase64 = typeof body.audio === 'string' ? body.audio.trim() : ''
    const filename = typeof body.filename === 'string' ? body.filename : 'voice-input.webm'
    const mockMode = body.mock_mode === true || body.mock_mode === 'true'

    if (!audioBase64) {
      return Response.json({ error: 'audio is required' }, { status: 400, headers: corsHeaders })
    }

    if (mockMode || !OPENAI_API_KEY) {
      return Response.json({ transcript: 'I look around carefully and proceed forward.' }, { headers: corsHeaders })
    }

    // Decode base64 audio
    const binaryStr = atob(audioBase64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    // Build multipart form for Whisper
    const formData = new FormData()
    formData.append('file', new Blob([bytes], { type: 'audio/webm' }), filename)
    formData.append('model', 'whisper-1')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const errText = await whisperRes.text()
      return Response.json({ error: `Whisper error (${whisperRes.status}): ${errText}` }, { status: 502, headers: corsHeaders })
    }

    const result = await whisperRes.json() as { text?: string }
    const transcript = (result.text ?? '').trim()

    return Response.json({ transcript }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
