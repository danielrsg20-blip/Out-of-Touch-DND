import type { FastifyInstance } from 'fastify'
import { ITEM_CATALOG } from '../lib/itemCatalog.js'
import { buildRuntimeState, getSessionCount, getSessionSnapshot, mutateSessionSnapshot } from '../lib/sessionStore.js'
import { validateMoveRequest } from '../lib/movement.js'
import { advanceCombatTurn, runActionEngine } from '../lib/actionEngine.js'

type JsonRecord = Record<string, unknown>

type MapEntityRecord = {
  id?: string
  x?: number
  y?: number
  [key: string]: unknown
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

function updateEntityPositionInMap(map: JsonRecord | null, characterId: string, x: number, y: number): JsonRecord | null {
  const nextMap = map ? (JSON.parse(JSON.stringify(map)) as JsonRecord) : null
  if (!nextMap) {
    return null
  }

  const entities = nextMap.entities
  if (Array.isArray(entities)) {
    nextMap.entities = entities.map((entity) => {
      const record = asRecord(entity) as MapEntityRecord | null
      if (!record || record.id !== characterId) {
        return entity
      }
      return {
        ...record,
        x,
        y,
      }
    })
    return nextMap
  }

  const entityMap = asRecord(entities)
  if (entityMap && entityMap[characterId] && asRecord(entityMap[characterId])) {
    const target = asRecord(entityMap[characterId])!
    entityMap[characterId] = {
      ...target,
      x,
      y,
    }
    nextMap.entities = entityMap
  }

  return nextMap
}

function updateCharacterPositionInState(
  character: JsonRecord | null,
  pathDistanceFeet: number | null,
  x: number,
  y: number,
): JsonRecord | null {
  if (!character) {
    return null
  }

  const out: JsonRecord = {
    ...character,
    x,
    y,
  }

  if (typeof character.movement_remaining === 'number' && Number.isFinite(character.movement_remaining) && typeof pathDistanceFeet === 'number') {
    out.movement_remaining = Math.max(0, Math.trunc(character.movement_remaining - pathDistanceFeet))
  }

  return out
}

function currentTurnCharacterId(combat: JsonRecord | null): string | null {
  if (!combat) {
    return null
  }

  const currentParticipant = asRecord(combat.current_participant)
  const participantCharacter = currentParticipant ? asRecord(currentParticipant.character) : null
  const fromParticipant = participantCharacter ? asString(participantCharacter.id) : null
  if (fromParticipant) {
    return fromParticipant
  }

  const order = Array.isArray(combat.initiative_order) ? combat.initiative_order : null
  const turnIndex = typeof combat.turn_index === 'number' && Number.isFinite(combat.turn_index) ? Math.trunc(combat.turn_index) : null
  if (order && turnIndex !== null && turnIndex >= 0 && turnIndex < order.length) {
    const turnEntry = asRecord(order[turnIndex])
    if (!turnEntry) {
      return null
    }
    return asString(turnEntry.character_id)
      ?? asString(turnEntry.id)
      ?? asString(turnEntry.entity_id)
      ?? null
  }

  return null
}

function currentMovementRemaining(combat: JsonRecord | null, character: JsonRecord | null): number | null {
  if (combat) {
    const currentParticipant = asRecord(combat.current_participant)
    if (currentParticipant && typeof currentParticipant.movement_remaining === 'number' && Number.isFinite(currentParticipant.movement_remaining)) {
      return currentParticipant.movement_remaining
    }
  }

  if (character && typeof character.movement_remaining === 'number' && Number.isFinite(character.movement_remaining)) {
    return character.movement_remaining
  }

  return null
}

function applyMovementToCombat(combat: JsonRecord | null, spentFeet: number | null): JsonRecord | null {
  if (!combat || typeof spentFeet !== 'number') {
    return combat
  }

  const out = JSON.parse(JSON.stringify(combat)) as JsonRecord
  const participant = asRecord(out.current_participant)
  if (!participant) {
    return out
  }

  if (typeof participant.movement_remaining === 'number' && Number.isFinite(participant.movement_remaining)) {
    participant.movement_remaining = Math.max(0, Math.trunc(participant.movement_remaining - spentFeet))
    out.current_participant = participant
  }

  return out
}

export async function registerRuntimeCompatRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    status: 'ok',
    sessions: getSessionCount(),
    service: 'ts-runtime',
  }))

  app.get('/api/health/atlas', async () => ({
    ok: true,
    checks: {
      ts_runtime: 'ok',
      note: 'Atlas runtime verification is not yet ported; returning compatibility health for cutover phase.',
    },
  }))

  app.get('/api/items', async (request) => {
    const query = request.query as { category?: string }
    const category = typeof query.category === 'string' ? query.category : null

    const items = Object.values(ITEM_CATALOG)
      .filter((item) => !category || item.category === category)
      .map((item) => ({ ...item }))

    return { items }
  })

  app.post('/api/action', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const roomCode = asString(body.room_code)
    const playerId = asString(body.player_id)
    const content = (asString(body.content) ?? '').trim()

    if (!roomCode || !playerId || !content) {
      return reply.send({ error: 'room_code, player_id, and content are required' })
    }

    const snapshot = getSessionSnapshot(roomCode)
    if (!snapshot) {
      return reply.send({ error: 'Session not found' })
    }

    const player = snapshot.players.find((entry) => entry.id === playerId)
    if (!player) {
      return reply.send({ error: 'Player not found in session' })
    }

    const result = runActionEngine(snapshot, playerId, content)

    mutateSessionSnapshot(roomCode, {
      map: Object.prototype.hasOwnProperty.call(result, 'map') ? (result.map ?? null) : undefined,
      combat: Object.prototype.hasOwnProperty.call(result, 'combat') ? (result.combat ?? null) : undefined,
      overlay: Object.prototype.hasOwnProperty.call(result, 'overlay') ? (result.overlay ?? null) : undefined,
      mergeCharacters: result.mergeCharacters,
      appendNarrative: [
        { role: 'player', player_id: playerId, player_name: player.name, content },
        ...result.narratives.map((line) => ({ role: 'dm', content: line })),
      ],
    })

    const state = buildRuntimeState(roomCode)
    if (!state) {
      return reply.send({ error: 'Session not found' })
    }

    return reply.send({
      narratives: result.narratives,
      dice_results: result.dice_results,
      state,
      overlay: state.overlay,
    })
  })

  app.post('/api/combat/next-turn', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const roomCode = asString(body.room_code)
    const playerId = asString(body.player_id)

    if (!roomCode || !playerId) {
      return reply.send({ error: 'room_code and player_id are required' })
    }

    const snapshot = getSessionSnapshot(roomCode)
    if (!snapshot) {
      return reply.send({ error: 'Session not found' })
    }

    const player = snapshot.players.find((entry) => entry.id === playerId)
    if (!player) {
      return reply.send({ error: 'Player not found in session' })
    }

    const combat = asRecord(snapshot.game_state.combat)
    const advanced = advanceCombatTurn(combat, true)
    if ('error' in advanced) {
      return reply.send({ error: advanced.error })
    }

    mutateSessionSnapshot(roomCode, {
      combat: advanced.combat,
    })

    const state = buildRuntimeState(roomCode)
    if (!state) {
      return reply.send({ error: 'Session not found' })
    }

    return reply.send({
      ok: true,
      combat: state.combat,
      state,
      data: advanced.data,
    })
  })

  app.post('/api/move-token', async (request, reply) => {
    const body = asRecord(request.body) ?? {}
    const roomCode = asString(body.room_code)
    const playerId = asString(body.player_id)
    const characterId = asString(body.character_id)
    const x = asInt(body.x)
    const y = asInt(body.y)

    if (!roomCode || !playerId || !characterId || x === null || y === null) {
      return reply.send({ error: 'room_code, player_id, character_id, x, and y are required' })
    }

    const snapshot = getSessionSnapshot(roomCode)
    if (!snapshot) {
      return reply.send({ error: 'Session not found' })
    }

    const player = snapshot.players.find((entry) => entry.id === playerId)
    if (!player) {
      return reply.send({ error: 'Player not found in session' })
    }

    if (player.character_id && player.character_id !== characterId) {
      return reply.send({ error: 'You can only move your own character token' })
    }

    if (!snapshot.game_state.map) {
      return reply.send({ error: 'No map loaded' })
    }

    const map = asRecord(snapshot.game_state.map)
    if (!map) {
      return reply.send({ error: 'No map loaded' })
    }

    const validation = validateMoveRequest({
      map,
      entityId: characterId,
      targetX: x,
      targetY: y,
    })

    if (!validation.valid) {
      return reply.send({ error: validation.error ?? 'Invalid move' })
    }

    const character = asRecord(snapshot.game_state.characters[characterId])
    if (!character) {
      return reply.send({ error: `Character ${characterId} not found` })
    }

    const combat = asRecord(snapshot.game_state.combat)
    const inActiveCombat = combat ? combat.is_active === true : false
    if (inActiveCombat) {
      const turnCharacterId = currentTurnCharacterId(combat)
      if (turnCharacterId && turnCharacterId !== characterId) {
        return reply.send({ error: 'Not your turn' })
      }

      const movementRemaining = currentMovementRemaining(combat, character)
      if (typeof movementRemaining === 'number' && typeof validation.distance_feet === 'number' && movementRemaining < validation.distance_feet) {
        return reply.send({ error: `Insufficient movement pool (${movementRemaining} < ${validation.distance_feet})` })
      }
    }

    const nextCombat = applyMovementToCombat(combat, validation.distance_feet)

    mutateSessionSnapshot(roomCode, {
      map: updateEntityPositionInMap(map, characterId, x, y),
      combat: nextCombat,
      mergeCharacters: {
        [characterId]: updateCharacterPositionInState(character, validation.distance_feet, x, y) ?? character,
      },
      appendNarrative: [
        {
          role: 'system',
          content: `${characterId} moves to (${x}, ${y}) (${validation.distance_feet ?? 0} ft).`,
        },
      ],
    })

    const state = buildRuntimeState(roomCode)
    if (!state) {
      return reply.send({ error: 'Session not found' })
    }

    return reply.send({
      ok: true,
      data: {
        moved: characterId,
        to: { x, y },
        distance_feet: validation.distance_feet,
        path: validation.path,
      },
      state,
    })
  })
}
