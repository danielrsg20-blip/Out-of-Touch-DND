type JsonRecord = Record<string, unknown>

type SessionProtocolPartyStatus = {
  player_name: string
  character_name: string
  role: string
  hp: {
    current: number
    max: number
  }
  spell_slots: null
  conditions: string[]
  status: string
}

export type SessionPlayer = {
  id: string
  name: string
  character_id: string | null
  user_id: string | null
}

export type SessionSnapshot = {
  room_code: string
  host_id: string
  players: SessionPlayer[]
  started: boolean
  game_state: {
    characters: Record<string, JsonRecord>
    map: JsonRecord | null
    combat: JsonRecord | null
    narrative_history: unknown[]
  }
  overlay: JsonRecord | null
  session_start: JsonRecord
}

const ROOM_WORDS = ['goblin', 'dragon', 'wizard', 'dungeon', 'tavern', 'rogue', 'ranger', 'bard', 'cleric', 'wyvern']
const sessions = new Map<string, SessionSnapshot>()

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomId(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[randomInt(0, alphabet.length - 1)]
  }
  return out
}

function generateRoomCode(): string {
  const word = ROOM_WORDS[randomInt(0, ROOM_WORDS.length - 1)]?.toUpperCase() ?? 'DUNGEON'
  const suffix = randomInt(10, 99)
  return `${word}-${suffix}`
}

function buildPartyStatus(snapshot: SessionSnapshot): SessionProtocolPartyStatus[] {
  const out: SessionProtocolPartyStatus[] = []

  for (const player of snapshot.players) {
    if (!player.character_id) {
      continue
    }
    const character = asRecord(snapshot.game_state.characters[player.character_id])
    if (!character) {
      continue
    }

    out.push({
      player_name: player.name,
      character_name: asString(character.name) ?? 'Unknown',
      role: `${asString(character.race) ?? 'Unknown'} ${asString(character.class) ?? asString(character.char_class) ?? 'Unknown'}`,
      hp: {
        current: asNumber(character.hp) ?? 10,
        max: asNumber(character.max_hp) ?? 10,
      },
      spell_slots: null,
      conditions: [],
      status: 'ok',
    })
  }

  return out
}

function createSessionStartProtocol(snapshot: SessionSnapshot): JsonRecord {
  const partyStatus = buildPartyStatus(snapshot)
  const ready = partyStatus.length > 0
  const recap = ready
    ? `${partyStatus.length} party member(s) are ready to adventure.`
    : 'The party gathers at the start of a new session. No major events have been recorded yet, so the adventure begins from the current setup.'
  const issues = ready ? [] : ['No party characters assigned yet']

  return {
    type: 'session_start',
    protocol: {
      SESSION_START: 'SESSION_START',
      SESSION_STATE_READY: {
        status: 'SESSION_STATE_READY',
        ready,
        issues,
      },
      SESSION_RECAP: recap,
      PARTY_STATUS: partyStatus,
      CURRENT_SCENE: 'The party gathers and prepares for the next move.',
      NPC_PRESENT: 'NONE',
      EVENT_TRIGGER: 'Choose your first action.',
      ACTION_PROMPT: 'What would you like to do?',
    },
    generated_at: new Date().toISOString(),
  }
}

function refreshSessionStart(snapshot: SessionSnapshot): SessionSnapshot {
  snapshot.session_start = createSessionStartProtocol(snapshot)
  return snapshot
}

function uniqueRoomCode(): string {
  let roomCode = generateRoomCode()
  while (sessions.has(roomCode)) {
    roomCode = generateRoomCode()
  }
  return roomCode
}

export function createSessionSnapshot(playerName: string, userId: string | null): { room_code: string; player_id: string; snapshot: SessionSnapshot } {
  const roomCode = uniqueRoomCode()
  const playerId = randomId(8)

  const snapshot: SessionSnapshot = {
    room_code: roomCode,
    host_id: playerId,
    players: [
      {
        id: playerId,
        name: playerName,
        character_id: null,
        user_id: userId,
      },
    ],
    started: false,
    game_state: {
      characters: {},
      map: null,
      combat: null,
      narrative_history: [],
    },
    overlay: null,
    session_start: {},
  }

  refreshSessionStart(snapshot)

  sessions.set(roomCode, snapshot)
  return {
    room_code: roomCode,
    player_id: playerId,
    snapshot: clone(snapshot),
  }
}

export function joinSessionSnapshot(roomCode: string, playerName: string, userId: string | null): { player_id: string; snapshot: SessionSnapshot } | null {
  const key = roomCode.toUpperCase()
  const existing = sessions.get(key)
  if (!existing) {
    return null
  }

  const playerId = randomId(8)
  const updated = clone(existing)
  updated.players.push({
    id: playerId,
    name: playerName,
    character_id: null,
    user_id: userId,
  })
  refreshSessionStart(updated)

  sessions.set(key, clone(updated))
  return {
    player_id: playerId,
    snapshot: clone(updated),
  }
}

export function getSessionSnapshot(roomCode: string): SessionSnapshot | null {
  const key = roomCode.toUpperCase()
  const snapshot = sessions.get(key)
  return snapshot ? clone(snapshot) : null
}

export function updateSessionSnapshot(roomCode: string, updater: (snapshot: SessionSnapshot) => SessionSnapshot): SessionSnapshot | null {
  const key = roomCode.toUpperCase()
  const existing = sessions.get(key)
  if (!existing) {
    return null
  }

  const updated = updater(clone(existing))
  sessions.set(key, clone(updated))
  return clone(updated)
}

export function setHostCharacter(roomCode: string, playerId: string, characterId: string | null): SessionSnapshot | null {
  return updateSessionSnapshot(roomCode, (snapshot) => {
    snapshot.players = snapshot.players.map((player) => {
      if (player.id !== playerId) {
        return player
      }
      return {
        ...player,
        character_id: characterId,
      }
    })
    return refreshSessionStart(snapshot)
  })
}

export function createCharacterInSession(params: {
  roomCode: string
  playerId: string
  userId: string | null
  name: string
  race: string
  charClass: string
  abilities: Record<string, number>
  spriteId?: string | null
  knownSpells?: string[] | null
  preparedSpells?: string[] | null
}): JsonRecord | null {
  const key = params.roomCode.toUpperCase()
  const existing = sessions.get(key)
  if (!existing) {
    return null
  }

  const updated = clone(existing)
  const player = updated.players.find((entry) => entry.id === params.playerId)
  if (!player) {
    return null
  }

  const characterId = `pc_${params.playerId}`
  const character: JsonRecord = {
    id: characterId,
    name: params.name,
    race: params.race,
    class: params.charClass,
    char_class: params.charClass,
    level: 1,
    abilities: { ...params.abilities },
    hp: 10,
    max_hp: 10,
    temp_hp: 0,
    ac: 10,
    speed: 30,
    movement_remaining: 30,
    known_spells: params.knownSpells ?? [],
    prepared_spells: params.preparedSpells ?? [],
    sprite_id: params.spriteId ?? null,
  }

  updated.game_state.characters[characterId] = character
  player.character_id = characterId
  if (params.userId) {
    player.user_id = params.userId
  }

  refreshSessionStart(updated)
  sessions.set(key, clone(updated))
  return clone(character)
}

export function mutateSessionSnapshot(
  roomCode: string,
  mutation: {
    map?: JsonRecord | null
    combat?: JsonRecord | null
    overlay?: JsonRecord | null
    appendNarrative?: unknown[]
    replaceNarrative?: unknown[]
    mergeCharacters?: Record<string, JsonRecord>
  },
): SessionSnapshot | null {
  return updateSessionSnapshot(roomCode, (snapshot) => {
    if (Object.prototype.hasOwnProperty.call(mutation, 'map')) {
      snapshot.game_state.map = mutation.map ?? null
    }
    if (Object.prototype.hasOwnProperty.call(mutation, 'combat')) {
      snapshot.game_state.combat = mutation.combat ?? null
    }
    if (Object.prototype.hasOwnProperty.call(mutation, 'overlay')) {
      snapshot.overlay = mutation.overlay ?? null
    }
    if (Array.isArray(mutation.replaceNarrative)) {
      snapshot.game_state.narrative_history = clone(mutation.replaceNarrative)
    }
    if (Array.isArray(mutation.appendNarrative) && mutation.appendNarrative.length > 0) {
      snapshot.game_state.narrative_history = [
        ...snapshot.game_state.narrative_history,
        ...clone(mutation.appendNarrative),
      ]
    }
    if (mutation.mergeCharacters && typeof mutation.mergeCharacters === 'object') {
      for (const [characterId, character] of Object.entries(mutation.mergeCharacters)) {
        snapshot.game_state.characters[characterId] = clone(character)
      }
    }

    return refreshSessionStart(snapshot)
  })
}

export function applyCampaignToSession(
  roomCode: string,
  campaignState: {
    characters: Record<string, JsonRecord>
    map: JsonRecord | null
    combat?: JsonRecord | null
    conversation: unknown[]
    overlay: JsonRecord | null
  },
): SessionSnapshot | null {
  return updateSessionSnapshot(roomCode, (snapshot) => {
    snapshot.game_state = {
      characters: clone(campaignState.characters),
      map: clone(campaignState.map),
      combat: clone(campaignState.combat ?? null),
      narrative_history: clone(campaignState.conversation),
    }
    snapshot.overlay = clone(campaignState.overlay)
    return refreshSessionStart(snapshot)
  })
}

export function getSessionCount(): number {
  return sessions.size
}

export function buildRuntimeState(roomCode: string): {
  characters: Record<string, JsonRecord>
  map: JsonRecord | null
  combat: JsonRecord | null
  usage: {
    input_tokens: number
    output_tokens: number
    estimated_cost_usd: number
  }
  overlay: JsonRecord | null
} | null {
  const snapshot = getSessionSnapshot(roomCode)
  if (!snapshot) {
    return null
  }

  return {
    characters: clone(snapshot.game_state.characters),
    map: clone(snapshot.game_state.map),
    combat: clone(snapshot.game_state.combat),
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
    },
    overlay: clone(snapshot.overlay),
  }
}
