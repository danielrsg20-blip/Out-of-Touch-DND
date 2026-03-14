import type { FastifyInstance } from 'fastify'
import { getCampaign, listCampaigns, saveCampaign, type PlayerCharacterSummary } from '../lib/campaignStore.js'
import { applyCampaignToSession, createSessionSnapshot, getSessionSnapshot, setHostCharacter } from '../lib/sessionStore.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function nowIsoUtc(): string {
  return new Date().toISOString()
}

function decodeUserIdFromAuthorization(authorization: unknown): string | null {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.slice('Bearer '.length).trim()
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as JsonRecord
    return asString(payload.sub)
  } catch {
    return null
  }
}

function extractCharactersFromSnapshot(sessionPayload: JsonRecord): Record<string, JsonRecord> {
  const state = asRecord(sessionPayload.game_state)
  const rawCharacters = state ? state.characters ?? state.character_map : null

  if (Array.isArray(rawCharacters)) {
    const out: Record<string, JsonRecord> = {}
    for (const entry of rawCharacters) {
      const character = asRecord(entry)
      const id = character ? asString(character.id) : null
      if (character && id) {
        out[id] = character
      }
    }
    return out
  }

  const recordCharacters = asRecord(rawCharacters)
  if (recordCharacters) {
    const out: Record<string, JsonRecord> = {}
    for (const [key, value] of Object.entries(recordCharacters)) {
      const character = asRecord(value)
      if (character) {
        out[key] = character
      }
    }
    return out
  }

  return {}
}

function extractMapFromSnapshot(sessionPayload: JsonRecord): JsonRecord | null {
  const state = asRecord(sessionPayload.game_state)
  const map = state ? asRecord(state.map) : null
  return map ?? null
}

function extractConversationFromSnapshot(sessionPayload: JsonRecord): unknown[] {
  const state = asRecord(sessionPayload.game_state)
  return state ? asArray(state.narrative_history ?? state.conversation ?? []) : []
}

function extractPlayerCharacterMap(sessionPayload: JsonRecord, characters: Record<string, JsonRecord>): Record<string, PlayerCharacterSummary> {
  const session = asRecord(sessionPayload.session)
  const players = session ? asArray(session.players) : []
  const out: Record<string, PlayerCharacterSummary> = {}

  for (const entry of players) {
    const player = asRecord(entry)
    const userId = player ? asString(player.user_id) : null
    const characterId = player ? asString(player.character_id) : null
    if (!userId || !characterId) {
      continue
    }
    const character = characters[characterId]
    if (!character) {
      continue
    }

    out[userId] = {
      name: asString(character.name) ?? 'Unknown',
      class: asString(character.class) ?? asString(character.char_class) ?? 'Unknown',
      level: typeof character.level === 'number' ? character.level : 1,
      char_id: characterId,
    }
  }

  return out
}

function rebindOverlayToRoom(overlay: JsonRecord | null, roomCode: string): JsonRecord | null {
  if (!overlay) {
    return null
  }

  return {
    ...overlay,
    id: `overlay_room_${roomCode}`,
    map_id: roomCode,
  }
}

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/campaign/list', async (request, reply) => {
    const authorization = (request.headers as Record<string, unknown>).authorization
    const userId = decodeUserIdFromAuthorization(authorization)
    let campaigns = listCampaigns()

    if (userId) {
      campaigns = campaigns.filter((campaign) => campaign.owner_id === userId).slice(0, 5)
    }

    return reply.send({
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        updated_at: campaign.updated_at,
        session_count: campaign.session_count,
        my_character: userId ? campaign.player_characters[userId] ?? null : null,
      })),
    })
  })

  app.post('/api/campaign/save', async (request, reply) => {
    const body = (request.body ?? {}) as JsonRecord
    const roomCode = asString(body.room_code)
    const campaignName = asString(body.campaign_name)

    if (!roomCode || !campaignName) {
      return reply.send({ error: 'room_code and campaign_name are required' })
    }

    const sessionSnapshot = getSessionSnapshot(roomCode)
    if (!sessionSnapshot) {
      return reply.send({ error: 'Session not found' })
    }

    const sessionPayload: JsonRecord = {
      game_state: sessionSnapshot.game_state,
      overlay: sessionSnapshot.overlay,
      session: {
        players: sessionSnapshot.players,
      },
    }

    const authorization = (request.headers as Record<string, unknown>).authorization
    const userId = decodeUserIdFromAuthorization(authorization)
    const existing = getCampaign(roomCode)
    const characters = extractCharactersFromSnapshot(sessionPayload)
    const saved = saveCampaign({
      id: roomCode,
      name: campaignName,
      updated_at: nowIsoUtc(),
      session_count: (existing?.session_count ?? 0) + 1,
      owner_id: existing?.owner_id ?? userId,
      player_characters: extractPlayerCharacterMap(sessionPayload, characters),
      characters,
      map: extractMapFromSnapshot(sessionPayload),
      conversation: extractConversationFromSnapshot(sessionPayload),
      overlay: asRecord(sessionPayload.overlay),
    })

    return reply.send({ saved: true, campaign_id: saved.id, name: saved.name })
  })

  app.post('/api/campaign/load', async (request, reply) => {
    const body = (request.body ?? {}) as JsonRecord
    const campaignId = asString(body.campaign_id)
    const roomCode = asString(body.room_code)

    if (!campaignId || !roomCode) {
      return reply.send({ error: 'campaign_id and room_code are required' })
    }

    const liveSession = getSessionSnapshot(roomCode)
    if (!liveSession) {
      return reply.send({ error: 'Session not found' })
    }

    const campaign = getCampaign(campaignId)
    if (!campaign) {
      return reply.send({ error: 'Campaign not found' })
    }

    applyCampaignToSession(roomCode, {
      characters: campaign.characters,
      map: campaign.map,
      conversation: campaign.conversation,
      overlay: rebindOverlayToRoom(campaign.overlay, roomCode),
    })

    return reply.send({
      loaded: true,
      name: campaign.name,
      characters: Object.keys(campaign.characters).length,
      overlay: rebindOverlayToRoom(campaign.overlay, roomCode),
    })
  })

  app.post('/api/campaign/resume', async (request, reply) => {
    const body = (request.body ?? {}) as JsonRecord
    const campaignId = asString(body.campaign_id)
    const playerName = asString(body.player_name)
    const authorization = (request.headers as Record<string, unknown>).authorization
    const userId = decodeUserIdFromAuthorization(authorization)

    if (!userId) {
      return reply.send({ error: 'Authentication required' })
    }
    if (!campaignId || !playerName) {
      return reply.send({ error: 'campaign_id and player_name are required' })
    }

    const campaign = getCampaign(campaignId)
    if (!campaign) {
      return reply.send({ error: 'Campaign not found' })
    }
    if (campaign.owner_id && campaign.owner_id !== userId) {
      return reply.send({ error: 'Not your campaign' })
    }

    const created = createSessionSnapshot(playerName, userId)
    const reboundOverlay = rebindOverlayToRoom(campaign.overlay, created.room_code)
    applyCampaignToSession(created.room_code, {
      characters: campaign.characters,
      map: campaign.map,
      conversation: campaign.conversation,
      overlay: reboundOverlay,
    })

    const myCharacter = campaign.player_characters[userId] ?? null
    if (myCharacter?.char_id) {
      setHostCharacter(created.room_code, created.player_id, myCharacter.char_id)
    }
    const resumedSnapshot = getSessionSnapshot(created.room_code)

    return reply.send({
      room_code: created.room_code,
      player_id: created.player_id,
      campaign_name: campaign.name,
      characters_count: Object.keys(campaign.characters).length,
      has_character: myCharacter !== null,
      overlay: reboundOverlay,
      session_start: resumedSnapshot?.session_start ?? created.snapshot.session_start,
    })
  })
}