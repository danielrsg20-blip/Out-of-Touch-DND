import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

const checks = [
  {
    file: path.join(root, 'frontend', 'src', 'config', 'endpoints.ts'),
    forbidden: [
      "http://localhost:8010",
    ],
    message: 'frontend API default must not point to Python port 8010',
  },
  {
    file: path.join(root, 'frontend', 'src', 'hooks', 'useWebSocket.ts'),
    forbidden: [
      '/api/stt',
      '/api/tts',
    ],
    message: 'useWebSocket must not include local Python STT/TTS fallback endpoints',
  },
  {
    file: path.join(root, 'frontend', 'src', 'lib', 'narrationOrchestrator.ts'),
    forbidden: [
      '/api/tts',
    ],
    message: 'narration orchestrator must not include local Python TTS fallback endpoint',
  },
  {
    file: path.join(root, 'frontend', 'src', 'components', 'CharacterCreator.tsx'),
    forbidden: [
      '/api/spells/options',
    ],
    message: 'CharacterCreator must not include local Python spell-options fallback endpoint',
  },
]

async function main() {
  const failures = []

  for (const check of checks) {
    const content = await fs.readFile(check.file, 'utf8')
    for (const needle of check.forbidden) {
      if (content.includes(needle)) {
        failures.push(`${check.message} [${needle}] in ${path.relative(root, check.file)}`)
      }
    }
  }

  if (failures.length > 0) {
    console.error('TS-only cutover validation failed.')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log('TS-only cutover validation passed.')
}

main().catch((error) => {
  console.error('TS-only cutover validation errored.')
  console.error(error)
  process.exit(1)
})