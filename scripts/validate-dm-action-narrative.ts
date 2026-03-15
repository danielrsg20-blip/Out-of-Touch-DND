import { generateDmNarrative, type DmProviderConfig } from '../supabase/functions/dm-action/dmNarrative.ts'

declare const process: { exit: (code: number) => void }

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const baseSnapshot = {
  characters: {
    pc_1: { name: 'Arin', class: 'Fighter', hp: 12, max_hp: 12 },
  },
  map: { metadata: { environment: 'dungeon' } },
  combat: null,
}

const baseConfig: DmProviderConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 220,
  timeoutMs: 200,
  systemPrompt: 'You are a DM.',
}

async function validateAnthropicSuccess(): Promise<void> {
  const result = await generateDmNarrative({
    playerName: 'Arin',
    content: 'I inspect the altar',
    snapshot: baseSnapshot,
    mockModeEnabled: false,
    providerConfig: {
      ...baseConfig,
      anthropicApiKey: 'test-key',
    },
    callApi: async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Dust curls around the altar as hidden runes glimmer. What do you do?' }],
      usage: { input_tokens: 120, output_tokens: 26 },
    }), { status: 200 }),
  })

  assertCondition(result.usedFallback === false, 'anthropic success should not fallback')
  assertCondition(result.provider === 'anthropic', 'anthropic success should report anthropic provider')
  assertCondition(result.reason === null, 'anthropic success should have null reason')
  assertCondition(result.inputTokens === 120 && result.outputTokens === 26, 'anthropic success should parse token usage')
  assertCondition(/altar|runes/i.test(result.narrative), 'anthropic success should include generated narrative text')
}

async function validateOpenAiMissingKeyFallback(): Promise<void> {
  const result = await generateDmNarrative({
    playerName: 'Arin',
    content: 'I light a torch',
    snapshot: baseSnapshot,
    mockModeEnabled: false,
    providerConfig: {
      ...baseConfig,
      provider: 'openai',
      model: 'gpt-4o-mini',
      openAiApiKey: '',
    },
  })

  assertCondition(result.usedFallback === true, 'openai missing key should fallback')
  assertCondition(result.reason === 'missing_openai_key', 'openai missing key should report missing_openai_key')
  assertCondition(/world reacts/i.test(result.narrative), 'openai fallback should use deterministic fallback narrative')
}

async function validateGroqTimeoutFallback(): Promise<void> {
  const result = await generateDmNarrative({
    playerName: 'Arin',
    content: 'I listen at the door',
    snapshot: baseSnapshot,
    mockModeEnabled: false,
    providerConfig: {
      ...baseConfig,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      timeoutMs: 25,
      groqApiKey: 'test-groq-key',
    },
    callApi: async () => new Promise<Response>(() => {
      // Intentionally unresolved to force timeout path.
    }),
  })

  assertCondition(result.usedFallback === true, 'groq timeout should fallback')
  assertCondition(result.provider === 'groq', 'groq timeout should report groq provider')
  assertCondition(result.reason === 'request_timeout', 'groq timeout should report request_timeout')
  assertCondition(/immediate next move/i.test(result.narrative), 'groq timeout fallback should return deterministic narrative')
}

async function run(): Promise<void> {
  await validateAnthropicSuccess()
  await validateOpenAiMissingKeyFallback()
  await validateGroqTimeoutFallback()
  console.log('dm-action narrative validation passed (success/fallback/timeout).')
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`dm-action narrative validation failed: ${message}`)
  process.exit(1)
})
