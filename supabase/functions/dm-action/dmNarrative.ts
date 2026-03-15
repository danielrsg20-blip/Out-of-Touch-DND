export type SnapshotForNarrative = {
  characters: Record<string, Record<string, unknown>>
  map: Record<string, unknown> | null
  combat: Record<string, unknown> | null
}

export type DmGenerationResult = {
  narrative: string
  provider: string
  model: string
  usedFallback: boolean
  reason: string | null
  latencyMs: number
  inputTokens: number
  outputTokens: number
}

export type DmProviderConfig = {
  provider: string
  model: string
  maxTokens: number
  timeoutMs: number
  systemPrompt: string
  anthropicApiKey?: string
  openAiApiKey?: string
  groqApiKey?: string
}

type ResponseLike = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

type CallApi = (url: string, init: RequestInit) => Promise<ResponseLike>

function asFiniteNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function extractAnthropicText(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }
  const textBlocks: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const typed = block as Record<string, unknown>
    if (typed.type === 'text' && typeof typed.text === 'string' && typed.text.trim()) {
      textBlocks.push(typed.text.trim())
    }
  }
  return textBlocks.join('\n').trim()
}

function extractOpenAiText(payload: Record<string, unknown>): string {
  const choices = payload.choices
  if (!Array.isArray(choices)) {
    return ''
  }
  const first = choices[0]
  if (!first || typeof first !== 'object') {
    return ''
  }
  const message = (first as Record<string, unknown>).message
  if (!message || typeof message !== 'object') {
    return ''
  }
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' ? content.trim() : ''
}

function summarizeSnapshotForPrompt(snapshot: SnapshotForNarrative): string {
  const characters = Object.values(snapshot.characters ?? {})
    .slice(0, 4)
    .map((raw) => {
      const c = raw as Record<string, unknown>
      const name = typeof c.name === 'string' ? c.name : 'Unknown'
      const hp = asFiniteNumber(c.hp)
      const maxHp = asFiniteNumber(c.max_hp || c.hp)
      const cls = typeof c.class === 'string' ? c.class : 'Adventurer'
      return `${name} (${cls}) HP ${hp}/${maxHp}`
    })

  const combat = snapshot.combat as Record<string, unknown> | null
  const combatSummary = combat?.is_active
    ? `active round ${asFiniteNumber(combat.round) || 1}, current turn ${String(combat.current_turn ?? 'unknown')}`
    : 'inactive'

  const mapMeta = (snapshot.map?.metadata as Record<string, unknown> | undefined) ?? {}
  const environment = typeof mapMeta.environment === 'string' ? mapMeta.environment : 'unknown'

  return [
    `Party: ${characters.length > 0 ? characters.join('; ') : 'none registered'}`,
    `Combat: ${combatSummary}`,
    `Environment: ${environment}`,
  ].join('\n')
}

export function buildFallbackNarrative(playerName: string, content: string): string {
  return `${playerName}, the world reacts to "${content}". Describe your immediate next move.`
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('request_timeout')), timeoutMs)
  })

  try {
    return await Promise.race([work, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function fallbackResult(input: {
  playerName: string
  content: string
  provider: string
  model: string
  reason: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
}): DmGenerationResult {
  return {
    narrative: buildFallbackNarrative(input.playerName, input.content),
    provider: input.provider,
    model: input.model,
    usedFallback: true,
    reason: input.reason,
    latencyMs: input.latencyMs ?? 0,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
  }
}

export async function generateDmNarrative(input: {
  playerName: string
  content: string
  snapshot: SnapshotForNarrative
  mockModeEnabled: boolean
  providerConfig: DmProviderConfig
  callApi?: CallApi
}): Promise<DmGenerationResult> {
  const { playerName, content, snapshot, mockModeEnabled, providerConfig } = input
  const callApi = input.callApi ?? fetch

  if (mockModeEnabled) {
    return fallbackResult({
      playerName,
      content,
      provider: 'mock',
      model: 'mock',
      reason: 'mock_mode_enabled',
    })
  }

  const provider = providerConfig.provider.trim().toLowerCase()
  const model = providerConfig.model
  const prompt = [
    `Player: ${playerName}`,
    `Player action: ${content}`,
    'State summary:',
    summarizeSnapshotForPrompt(snapshot),
  ].join('\n')

  const startedAt = Date.now()

  try {
    if (provider === 'anthropic') {
      if (!providerConfig.anthropicApiKey?.trim()) {
        return fallbackResult({ playerName, content, provider, model, reason: 'missing_anthropic_key' })
      }

      const response = await withTimeout(
        callApi('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': providerConfig.anthropicApiKey.trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: providerConfig.maxTokens,
            temperature: 0.7,
            system: providerConfig.systemPrompt,
            messages: [{ role: 'user', content: prompt }],
          }),
        }),
        providerConfig.timeoutMs,
      )

      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      const latencyMs = Date.now() - startedAt
      const usage = (payload.usage as Record<string, unknown> | undefined) ?? {}
      const inputTokens = asFiniteNumber(usage.input_tokens)
      const outputTokens = asFiniteNumber(usage.output_tokens)

      if (!response.ok) {
        const detail = typeof payload.error === 'object' && payload.error && typeof (payload.error as Record<string, unknown>).message === 'string'
          ? String((payload.error as Record<string, unknown>).message)
          : `anthropic_http_${response.status}`
        return fallbackResult({ playerName, content, provider, model, reason: detail, latencyMs, inputTokens, outputTokens })
      }

      const narrative = extractAnthropicText(payload.content)
      if (!narrative) {
        return fallbackResult({ playerName, content, provider, model, reason: 'empty_response', latencyMs, inputTokens, outputTokens })
      }

      return {
        narrative,
        provider,
        model,
        usedFallback: false,
        reason: null,
        latencyMs,
        inputTokens,
        outputTokens,
      }
    }

    if (provider === 'openai' || provider === 'groq') {
      const apiKey = provider === 'openai' ? providerConfig.openAiApiKey : providerConfig.groqApiKey
      if (!apiKey?.trim()) {
        return fallbackResult({ playerName, content, provider, model, reason: provider === 'openai' ? 'missing_openai_key' : 'missing_groq_key' })
      }

      const baseUrl = provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions'

      const response = await withTimeout(
        callApi(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: providerConfig.maxTokens,
            temperature: 0.7,
            messages: [
              { role: 'system', content: providerConfig.systemPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        }),
        providerConfig.timeoutMs,
      )

      const payload = await response.json().catch(() => ({})) as Record<string, unknown>
      const latencyMs = Date.now() - startedAt
      const usage = (payload.usage as Record<string, unknown> | undefined) ?? {}
      const inputTokens = asFiniteNumber(usage.prompt_tokens)
      const outputTokens = asFiniteNumber(usage.completion_tokens)

      if (!response.ok) {
        const detail = typeof payload.error === 'object' && payload.error && typeof (payload.error as Record<string, unknown>).message === 'string'
          ? String((payload.error as Record<string, unknown>).message)
          : `${provider}_http_${response.status}`
        return fallbackResult({ playerName, content, provider, model, reason: detail, latencyMs, inputTokens, outputTokens })
      }

      const narrative = extractOpenAiText(payload)
      if (!narrative) {
        return fallbackResult({ playerName, content, provider, model, reason: 'empty_response', latencyMs, inputTokens, outputTokens })
      }

      return {
        narrative,
        provider,
        model,
        usedFallback: false,
        reason: null,
        latencyMs,
        inputTokens,
        outputTokens,
      }
    }

    return fallbackResult({ playerName, content, provider, model, reason: `unsupported_provider:${provider}` })
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    const reason = error instanceof Error ? error.message : 'provider_request_failed'
    return fallbackResult({ playerName, content, provider, model, reason, latencyMs })
  }
}
