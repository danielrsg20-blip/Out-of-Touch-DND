import type { FastifyInstance } from 'fastify'
import { createCharacterInSession, createSessionSnapshot, getSessionSnapshot, joinSessionSnapshot, mutateSessionSnapshot } from '../lib/sessionStore.js'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumberRecord(value: unknown): Record<string, number> {
  const obj = asRecord(value)
  if (!obj) {
    return {}
  }
  const out: Record<string, number> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      out[key] = val
    }
  }
  return out
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string')
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

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/session/create', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const playerName = asString(body.player_name)

    if (!playerName || !playerName.trim()) {
      return reply.send({ error: 'player_name is required' })
    }

    const authorization = (request.headers as Record<string, unknown>).authorization
    const userId = decodeUserIdFromAuthorization(authorization)
    const created = createSessionSnapshot(playerName.trim(), userId)

    return reply.send({
      room_code: created.room_code,
      player_id: created.player_id,
      session_start: created.snapshot.session_start,
    })
  })

  app.post('/api/session/join', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const roomCode = asString(body.room_code)
    const playerName = asString(body.player_name)

    if (!roomCode || !playerName || !playerName.trim()) {
      return reply.send({ error: 'room_code and player_name are required' })
    }

    const authorization = (request.headers as Record<string, unknown>).authorization
    const userId = decodeUserIdFromAuthorization(authorization)
    const joined = joinSessionSnapshot(roomCode, playerName.trim(), userId)
    if (!joined) {
      return reply.send({ player_id: '', session: { error: 'Session not found' } })
    }

    return reply.send({
      player_id: joined.player_id,
      session: {
        room_code: joined.snapshot.room_code,
        host_id: joined.snapshot.host_id,
        players: joined.snapshot.players,
        started: joined.snapshot.started,
        characters: joined.snapshot.game_state.characters,
      },
    })
  })

  app.post('/api/character/create', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const roomCode = asString(body.room_code)
    const playerId = asString(body.player_id)
    const name = asString(body.name)
    const race = asString(body.race)
    const charClass = asString(body.char_class)

    if (!roomCode || !playerId || !name || !race || !charClass) {
      return reply.send({ error: 'room_code, player_id, name, race, and char_class are required' })
    }

    const abilities = asNumberRecord(body.abilities)
    const authorization = (request.headers as Record<string, unknown>).authorization
    const userId = decodeUserIdFromAuthorization(authorization)
    const character = createCharacterInSession({
      roomCode,
      playerId,
      userId,
      name,
      race,
      charClass,
      abilities,
      spriteId: asString(body.sprite_id),
      knownSpells: asStringArray(body.known_spells),
      preparedSpells: asStringArray(body.prepared_spells),
    })

    if (!character) {
      return reply.send({ error: 'Session or player not found' })
    }

    return reply.send({ character })
  })

  app.post('/api/session/mutate', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const roomCode = asString(body.room_code)
    if (!roomCode) {
      return reply.send({ error: 'room_code is required' })
    }

    const map = Object.prototype.hasOwnProperty.call(body, 'map') ? asRecord(body.map) : undefined
    const overlay = Object.prototype.hasOwnProperty.call(body, 'overlay') ? asRecord(body.overlay) : undefined
    const appendNarrative = Array.isArray(body.append_narrative) ? body.append_narrative : undefined
    const replaceNarrative = Array.isArray(body.replace_narrative) ? body.replace_narrative : undefined

    const mergeCharactersRaw = asRecord(body.merge_characters)
    const mergeCharacters: Record<string, JsonRecord> = {}
    if (mergeCharactersRaw) {
      for (const [key, value] of Object.entries(mergeCharactersRaw)) {
        const character = asRecord(value)
        if (character) {
          mergeCharacters[key] = character
        }
      }
    }

    const updated = mutateSessionSnapshot(roomCode, {
      map,
      overlay,
      appendNarrative,
      replaceNarrative,
      mergeCharacters,
    })
    if (!updated) {
      return reply.send({ error: 'Session not found' })
    }

    return reply.send({
      ok: true,
      room_code: updated.room_code,
      game_state: updated.game_state,
      overlay: updated.overlay,
      session_start: updated.session_start,
    })
  })

  app.get('/api/session/:roomCode', async (request, reply) => {
    const params = request.params as { roomCode?: string }
    const roomCode = params.roomCode ?? ''
    const snapshot = getSessionSnapshot(roomCode)
    if (!snapshot) {
      return reply.send({ error: 'Session not found' })
    }

    return reply.send({
      game_state: snapshot.game_state,
      overlay: snapshot.overlay,
      session: {
        room_code: snapshot.room_code,
        host_id: snapshot.host_id,
        players: snapshot.players,
        started: snapshot.started,
      },
      session_start: snapshot.session_start,
    })
  })
}