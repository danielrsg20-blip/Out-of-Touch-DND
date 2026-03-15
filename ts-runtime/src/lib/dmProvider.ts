/**
 * dmProvider — generates DM narrative using OpenAI or Anthropic.
 *
 * Provider priority: OpenAI (gpt-4o-mini) → Anthropic (claude-3-5-haiku) → mechanics fallback.
 * API keys are read from process.env (loaded via --env-file=../.env in the dev script).
 */

import type { SessionSnapshot } from './sessionStore.js'

type JsonRecord = Record<string, unknown>

export type DmGenerationMeta = {
  provider: string
  model: string
  fallback: boolean
  reason: string | null
}

export type DmProviderResult = {
  narratives: string[]
  dm_generation: DmGenerationMeta
}

export type MechanicsResult = {
  narratives: string[]
  dice_results: Array<{ tool: string; data: JsonRecord }>
  map?: JsonRecord | null
  overlay?: JsonRecord | null
  combat?: JsonRecord | null
  mergeCharacters?: Record<string, JsonRecord>
}

const SYSTEM_PROMPT = `You are an expert Dungeon Master running a Dungeons & Dragons 5th Edition campaign. \
You are creative, fair, and immersive. You describe scenes vividly, voice NPCs with distinct personalities, \
and keep the game exciting.

RULES:
- Keep narrative responses concise (2-4 sentences during combat, 3-6 during exploration and roleplay).
- Address players by their character names.
- End every narrative turn with a direct action prompt such as "What do you do?" or a specific open question.
- During combat: one tactical sentence + one sensory sentence per turn.
- Never invent dice results — the mechanical engine provides all numbers. Use them as ground truth in your narration.
- Always honour the player's stated intent.

BREVITY POLICY:
Default responses must be brief: 1-3 short paragraphs max. End with a direct prompt to the players.

SAFETY:
- No graphic sexual content. Dramatic violence is acceptable; fade to black for extreme gore.`

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildPartyContext(snapshot: SessionSnapshot): string {
  const lines: string[] = []
  for (const player of snapshot.players) {
    if (!player.character_id) continue
    const char = asRecord(snapshot.game_state.characters[player.character_id])
    if (!char) continue
    const name = asString(char.name) ?? player.name
    const race = asString(char.race) ?? 'Unknown'
    const cls = asString(char.class) ?? asString(char.char_class) ?? 'Unknown'
    const hp = asNumber(char.hp) ?? 10
    const maxHp = asNumber(char.max_hp) ?? 10
    lines.push(`- ${name} (${race} ${cls}) HP: ${hp}/${maxHp}`)
  }
  return lines.length > 0 ? `PARTY:\n${lines.join('\n')}` : ''
}

function buildCombatContext(combat: JsonRecord | null): string {
  if (!combat || combat.is_active !== true) return ''
  const round = asNumber(combat.round_number) ?? 1
  const order = Array.isArray(combat.initiative_order) ? combat.initiative_order : []
  const names = order.map((entry) => {
    const r = asRecord(entry)
    if (!r) return '?'
    const n = asString(r.name) ?? asString(r.id) ?? '?'
    const hp = asNumber(r.hp)
    return hp !== null ? `${n} (HP:${hp})` : n
  })
  return `COMBAT ACTIVE — Round ${round} | Initiative order: ${names.join(' → ')}`
}

function buildUserMessage(content: string, mechanics: MechanicsResult): string {
  const parts: string[] = []

  if (content === '[SESSION_START]') {
    parts.push('The session has just begun. Describe the scene and setting to open the adventure, then invite the players to act.')
  } else {
    parts.push(`Player action: "${content}"`)
  }

  for (const dr of mechanics.dice_results) {
    const d = dr.data
    if (dr.tool === 'attack' || dr.tool === 'roll_dice') {
      const fragments: string[] = []
      const total = asNumber(d.total) ?? asNumber(d.roll)
      const hit = d.hit !== undefined ? (d.hit ? 'HIT' : 'MISS') : null
      const damage = asNumber(d.damage)
      const targetHp = asNumber(d.target_hp)
      const unconscious = d.target_unconscious === true
      if (total !== null) fragments.push(`roll: ${total}`)
      if (hit) fragments.push(hit)
      if (damage !== null) fragments.push(`damage dealt: ${damage}`)
      if (targetHp !== null) fragments.push(`target remaining HP: ${targetHp}`)
      if (unconscious) fragments.push('target falls unconscious')
      if (fragments.length > 0) {
        parts.push(`[Mechanics — ${dr.tool}: ${fragments.join(', ')}]`)
      }
    }
  }

  const newCombat = asRecord(mechanics.combat)
  if (newCombat?.is_active === true) {
    const order = Array.isArray(newCombat.initiative_order) ? (newCombat.initiative_order as unknown[]) : []
    if (order.length > 0) {
      const names = order.map((e) => {
        const r = asRecord(e)
        return r ? (asString(r.name) ?? asString(r.id) ?? '?') : '?'
      })
      parts.push(`[Mechanics — combat initiated, initiative: ${names.join(' → ')}]`)
    }
  }

  if (mechanics.map) {
    const mapName = asString(asRecord(mechanics.map)?.name) ?? 'the location'
    parts.push(`[Mechanics — battle map generated for ${mapName}]`)
  }

  parts.push('\nNarrate this for the players.')
  return parts.join('\n')
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function buildConversationMessages(snapshot: SessionSnapshot, userMessage: string): ChatMessage[] {
  const history = Array.isArray(snapshot.game_state.narrative_history)
    ? snapshot.game_state.narrative_history.slice(-10)
    : []

  const msgs: ChatMessage[] = []
  for (const entry of history) {
    const r = asRecord(entry)
    if (!r) continue
    const role = asString(r.role)
    const msgContent = asString(r.content)
    if (!msgContent) continue
    if (role === 'player') {
      msgs.push({ role: 'user', content: msgContent })
    } else if (role === 'dm') {
      msgs.push({ role: 'assistant', content: msgContent })
    }
  }

  // Ensure the final message is from the user
  msgs.push({ role: 'user', content: userMessage })
  return msgs
}

async function callOpenAI(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 220,
        temperature: 0.85,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`)
    }

    type OpenAIResponse = { choices: Array<{ message: { content: string } }> }
    const data = (await res.json()) as OpenAIResponse
    return data.choices[0]?.message?.content?.trim() ?? ''
  } finally {
    clearTimeout(timer)
  }
}

async function callAnthropic(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')

  // Anthropic requires strictly alternating user/assistant messages starting with user
  const anthMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    const last = anthMessages.at(-1)
    if (last && last.role === m.role) {
      last.content += '\n' + m.content
    } else {
      anthMessages.push({ role: m.role, content: m.content })
    }
  }
  if (anthMessages.length === 0 || anthMessages[0].role !== 'user') {
    anthMessages.unshift({ role: 'user', content: 'Begin.' })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        system: systemPrompt,
        messages: anthMessages,
        max_tokens: 220,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 300)}`)
    }

    type AnthropicResponse = { content: Array<{ type: string; text: string }> }
    const data = (await res.json()) as AnthropicResponse
    return data.content.find((c) => c.type === 'text')?.text?.trim() ?? ''
  } finally {
    clearTimeout(timer)
  }
}

export async function generateDmNarrative(
  snapshot: SessionSnapshot,
  playerContent: string,
  mechanics: MechanicsResult,
): Promise<DmProviderResult> {
  const partyCtx = buildPartyContext(snapshot)
  // Prefer the updated combat state from mechanics result over the pre-action snapshot state
  const combatForCtx = asRecord(mechanics.combat) ?? asRecord(snapshot.game_state.combat)
  const combatCtx = buildCombatContext(combatForCtx)

  const systemParts = [SYSTEM_PROMPT, '', 'CURRENT GAME STATE:']
  if (partyCtx) systemParts.push(partyCtx)
  if (combatCtx) systemParts.push(combatCtx)
  const systemPrompt = systemParts.join('\n')

  const userMessage = buildUserMessage(playerContent, mechanics)
  const messages = buildConversationMessages(snapshot, userMessage)

  if (process.env.OPENAI_API_KEY) {
    try {
      const text = await callOpenAI(systemPrompt, messages)
      if (text) {
        return {
          narratives: [text],
          dm_generation: { provider: 'openai', model: 'gpt-4o-mini', fallback: false, reason: null },
        }
      }
    } catch (err) {
      console.error('[dm-provider] OpenAI failed:', (err as Error).message)
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const text = await callAnthropic(systemPrompt, messages)
      if (text) {
        return {
          narratives: [text],
          dm_generation: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', fallback: false, reason: null },
        }
      }
    } catch (err) {
      console.error('[dm-provider] Anthropic failed:', (err as Error).message)
    }
  }

  const reason = !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY
    ? 'no_api_keys'
    : 'all_providers_failed'

  return {
    narratives: mechanics.narratives,
    dm_generation: { provider: 'fallback', model: 'none', fallback: true, reason },
  }
}
