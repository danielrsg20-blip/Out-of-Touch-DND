import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readEnvKey(key) {
  const envPath = join(process.cwd(), '.env')
  const contents = readFileSync(envPath, 'utf8')
  const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

async function fetchAudioLength(apiKey, speed) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'onyx',
      input: 'The Dungeon Master pauses, watching the party carefully before continuing the tale.',
      response_format: 'mp3',
      speed,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`OpenAI audio speech failed (${response.status}): ${errorText.slice(0, 300)}`)
  }

  const audioBuffer = await response.arrayBuffer()
  return audioBuffer.byteLength
}

const apiKey = readEnvKey('OPENAI_API_KEY')
if (!apiKey) {
  throw new Error('OPENAI_API_KEY missing from .env')
}

const normalBytes = await fetchAudioLength(apiKey, 1)
const fasterBytes = await fetchAudioLength(apiKey, 1.5)

console.log(JSON.stringify({
  speed_1_bytes: normalBytes,
  speed_1_5_bytes: fasterBytes,
  faster_is_shorter: fasterBytes < normalBytes,
  ratio: Number((fasterBytes / normalBytes).toFixed(3)),
}, null, 2))
