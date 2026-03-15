import { createHash } from 'node:crypto'
import { generateVectorMap } from './vectorMap/generateVectorMap.js'
import { getVectorMapFeatureFlags } from './vectorMap/featureFlags.js'
import type { SessionSnapshot } from './sessionStore.js'

type JsonRecord = Record<string, unknown>

type ActionEngineResult = {
  narratives: string[]
  dice_results: Array<{ tool: string; data: JsonRecord }>
  map?: JsonRecord | null
  overlay?: JsonRecord | null
  combat?: JsonRecord | null
  mergeCharacters?: Record<string, JsonRecord>
}

const EXPLORATION_CUE = /(map|explore|enter|travel|north|south|east|west|look)/i
const COMBAT_CUE = /(attack|strike|shoot|cast|combat|fight|initiative)/i
const ATTACK_CUE = /(attack|strike|shoot)/i

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function stableSeed(roomCode: string, content: string): number {
  const digest = createHash('sha256').update(`${roomCode}|${content}`).digest('hex')
  const head = digest.slice(0, 8)
  return Number.parseInt(head, 16)
}

function d20For(seed: number, label: string): number {
  const digest = createHash('sha256').update(`${seed}|${label}`).digest('hex')
  const head = digest.slice(0, 8)
  return (Number.parseInt(head, 16) % 20) + 1
}

function abilityMod(score: number | null): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 0
  }
  return Math.floor((score - 10) / 2)
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function d8For(seed: number, label: string): number {
  const digest = createHash('sha256').update(`${seed}|${label}`).digest('hex')
  const head = digest.slice(0, 8)
  return (Number.parseInt(head, 16) % 8) + 1
}

function biomeForPrompt(content: string): 'dungeon' | 'cavern' | 'forest' | 'village' | 'crypt' | 'mine' | 'custom' {
  const lower = content.toLowerCase()
  if (lower.includes('forest') || lower.includes('woods')) return 'forest'
  if (lower.includes('village') || lower.includes('town')) return 'village'
  if (lower.includes('crypt') || lower.includes('tomb')) return 'crypt'
  if (lower.includes('mine')) return 'mine'
  if (lower.includes('cave') || lower.includes('cavern')) return 'cavern'
  return 'dungeon'
}

function buildPcPlacements(snapshot: SessionSnapshot, floorCells: Array<{ x: number; y: number }>): {
  entities: JsonRecord[]
  mergeCharacters: Record<string, JsonRecord>
} {
  const entities: JsonRecord[] = []
  const mergeCharacters: Record<string, JsonRecord> = {}
  let cursor = 0

  for (const player of snapshot.players) {
    if (!player.character_id) {
      continue
    }

    const character = asRecord(snapshot.game_state.characters[player.character_id])
    if (!character) {
      continue
    }

    const cell = floorCells[cursor] ?? floorCells[floorCells.length - 1] ?? { x: 0, y: 0 }
    cursor += 1

    entities.push({
      id: player.character_id,
      name: asString(character.name) ?? player.character_id,
      x: cell.x,
      y: cell.y,
      type: 'pc',
      sprite: 'default',
      blocks_movement: true,
    })

    mergeCharacters[player.character_id] = {
      ...character,
      x: cell.x,
      y: cell.y,
    }
  }

  return { entities, mergeCharacters }
}

function buildMapFromVector(snapshot: SessionSnapshot, content: string): {
  map: JsonRecord
  overlay: JsonRecord
  mergeCharacters: Record<string, JsonRecord>
} {
  const roomCode = snapshot.room_code
  const flags = getVectorMapFeatureFlags()
  if (!flags.vector_map_generation_ts_enabled) {
    throw new Error('generate_vector_map is disabled by feature flag vector_map_generation_ts_enabled')
  }
  if (!flags.vector_grid_derivation_enabled) {
    throw new Error('generate_vector_map is disabled by feature flag vector_grid_derivation_enabled')
  }

  const seed = stableSeed(roomCode, content)
  const generated = generateVectorMap({
    seed,
    map_id: roomCode,
    name: `Room ${roomCode}`,
    biome: biomeForPrompt(content),
    story_prompt: content,
    style_preset: 'default',
    bounds_world: {
      origin_x: 0,
      origin_y: 0,
      width_world: 100,
      height_world: 75,
    },
    generation_params: {
      room_count: 7,
      corridor_width_cells: 2,
      obstacle_density: 0.1,
      hazard_density: 0.08,
    },
    grid_config: {
      base_cell_size_world: 5,
      resolution_scale: flags.grid_resolution_v2_enabled ? 2 : 1,
      diagonal_policy: 'allow',
      movement_cost_mode: 'world_units',
    },
    validation_mode: 'fixup',
  })

  const floorCells = generated.compatibility.legacy_tiles.tiles
    .filter((tile) => tile.blocks_movement === false)
    .map((tile) => ({ x: tile.x, y: tile.y }))

  const pc = buildPcPlacements(snapshot, floorCells)

  const generatedEntities: JsonRecord[] = generated.compatibility.legacy_entities.entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    x: entity.x,
    y: entity.y,
    type: entity.type,
    blocks_movement: entity.blocks_movement,
    tags: entity.tags ?? [],
  }))

  const map: JsonRecord = {
    width: generated.compatibility.legacy_tiles.width,
    height: generated.compatibility.legacy_tiles.height,
    tiles: generated.compatibility.legacy_tiles.tiles,
    entities: [...pc.entities, ...generatedEntities],
    traversal_grid: generated.traversal_grid,
    metadata: {
      map_source: 'ts_vector_generated',
      map_id: roomCode,
      grid_size: 5,
      grid_units: 'ft',
      tile_size_px: 32,
      cache_hit: false,
      hashes: generated.hashes,
      movement_model: generated.movement_model,
      rollout_flags: generated.overlay.metadata?.rollout_flags ?? {},
      traversal_grid: generated.traversal_grid,
    },
  }

  return {
    map,
    overlay: generated.overlay as unknown as JsonRecord,
    mergeCharacters: pc.mergeCharacters,
  }
}

function shouldGenerateMap(snapshot: SessionSnapshot, content: string): boolean {
  if (content === '[SESSION_START]') {
    return snapshot.game_state.map == null
  }
  return snapshot.game_state.map == null || EXPLORATION_CUE.test(content)
}

function createCombatState(snapshot: SessionSnapshot, seed: number): {
  combat: JsonRecord
  diceResults: Array<{ tool: string; data: JsonRecord }>
} {
  const participants: JsonRecord[] = []
  const diceResults: Array<{ tool: string; data: JsonRecord }> = []

  for (const [characterId, rawCharacter] of Object.entries(snapshot.game_state.characters)) {
    const character = asRecord(rawCharacter)
    if (!character) {
      continue
    }

    const dexScore = asNumber(asRecord(character.abilities)?.DEX)
    const mod = abilityMod(dexScore)
    const d20 = d20For(seed, `initiative:${characterId}`)
    const initiative = d20 + mod
    const speed = asNumber(character.speed) ?? 30
    const hp = asNumber(character.hp) ?? 10
    const maxHp = asNumber(character.max_hp) ?? hp

    participants.push({
      id: characterId,
      name: asString(character.name) ?? characterId,
      initiative,
      hp,
      max_hp: maxHp,
      movement_remaining: speed,
      speed,
    })

    diceResults.push({
      tool: 'roll_dice',
      data: {
        notation: '1d20',
        rolls: [d20],
        modifier: mod,
        total: initiative,
      },
    })
  }

  // Ensure solo sessions still have an encounter target.
  if (participants.length === 1) {
    const enemyId = `enemy_${snapshot.room_code.toLowerCase()}_1`
    const d20 = d20For(seed, `initiative:${enemyId}`)
    const initiative = d20 + 1
    participants.push({
      id: enemyId,
      name: 'Bandit Scout',
      initiative,
      hp: 12,
      max_hp: 12,
      movement_remaining: 30,
      speed: 30,
      ac: 12,
      is_enemy: true,
    })
    diceResults.push({
      tool: 'roll_dice',
      data: {
        notation: '1d20',
        rolls: [d20],
        modifier: 1,
        total: initiative,
      },
    })
  }

  participants.sort((a, b) => {
    const ia = asNumber(a.initiative) ?? 0
    const ib = asNumber(b.initiative) ?? 0
    if (ib !== ia) {
      return ib - ia
    }
    const na = asString(a.name) ?? ''
    const nb = asString(b.name) ?? ''
    return na.localeCompare(nb)
  })

  const current = participants[0] ?? null
  const movementTotal = current ? (asNumber(current.speed) ?? 30) : 0
  const movementRemaining = current ? (asNumber(current.movement_remaining) ?? movementTotal) : 0

  return {
    combat: {
      is_active: participants.length > 0,
      round: 1,
      turn_index: 0,
      current_turn: current ? asString(current.id) : null,
      current_movement_total: movementTotal,
      current_movement_remaining: movementRemaining,
      initiative_order: participants,
      current_participant: current
        ? {
            character: {
              id: asString(current.id),
              name: asString(current.name),
            },
            initiative: asNumber(current.initiative) ?? 0,
            movement_remaining: movementRemaining,
          }
        : null,
    },
    diceResults,
  }
}

function refreshCurrentParticipant(combat: JsonRecord): JsonRecord {
  const order = Array.isArray(combat.initiative_order) ? combat.initiative_order : []
  const turnIndexRaw = asNumber(combat.turn_index)
  const turnIndex = turnIndexRaw === null ? 0 : Math.max(0, Math.min(order.length - 1, Math.trunc(turnIndexRaw)))
  const current = order[turnIndex] && asRecord(order[turnIndex])
  const speed = current ? (asNumber(current.speed) ?? 30) : 0
  const remaining = current ? (asNumber(current.movement_remaining) ?? speed) : 0

  return {
    ...combat,
    turn_index: turnIndex,
    current_turn: current ? asString(current.id) : null,
    current_movement_total: speed,
    current_movement_remaining: remaining,
    current_participant: current
      ? {
          character: {
            id: asString(current.id),
            name: asString(current.name),
          },
          initiative: asNumber(current.initiative) ?? 0,
          movement_remaining: remaining,
        }
      : null,
  }
}

function removeEntityFromMap(mapInput: JsonRecord | null, entityId: string): JsonRecord | null {
  if (!mapInput) {
    return mapInput
  }

  const out = JSON.parse(JSON.stringify(mapInput)) as JsonRecord
  if (Array.isArray(out.entities)) {
    out.entities = out.entities.filter((entry) => asString(asRecord(entry)?.id) !== entityId)
  }
  return out
}

function livingParticipants(order: JsonRecord[]): JsonRecord[] {
  return order.filter((entry) => (asNumber(entry.hp) ?? 0) > 0)
}

function livingEnemyCount(order: JsonRecord[]): number {
  return livingParticipants(order).filter((entry) => (asString(entry.id) ?? '').startsWith('enemy_')).length
}

function livingPlayerCount(order: JsonRecord[]): number {
  return livingParticipants(order).filter((entry) => !(asString(entry.id) ?? '').startsWith('enemy_')).length
}

function finalizeCombatState(combatInput: JsonRecord): JsonRecord | null {
  const order = Array.isArray(combatInput.initiative_order)
    ? combatInput.initiative_order.map((entry) => asRecord(entry)).filter(Boolean) as JsonRecord[]
    : []
  const alive = livingParticipants(order)

  if (alive.length === 0 || livingEnemyCount(alive) === 0 || livingPlayerCount(alive) === 0) {
    return null
  }

  const turnIndexRaw = Math.trunc(asNumber(combatInput.turn_index) ?? 0)
  const safeIndex = Math.max(0, Math.min(turnIndexRaw, alive.length - 1))

  return refreshCurrentParticipant({
    ...combatInput,
    is_active: true,
    initiative_order: alive,
    turn_index: safeIndex,
  })
}

function injectCombatEntitiesIntoMap(mapInput: JsonRecord | null, combat: JsonRecord | null): JsonRecord | null {
  if (!mapInput || !combat) {
    return mapInput
  }

  const out = JSON.parse(JSON.stringify(mapInput)) as JsonRecord
  const order = Array.isArray(combat.initiative_order) ? combat.initiative_order : []
  const entitiesRaw = Array.isArray(out.entities) ? out.entities : []
  const entities = entitiesRaw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is JsonRecord => entry !== null)
  const occupied = new Set(entities.map((entity) => `${asNumber(entity.x) ?? 0},${asNumber(entity.y) ?? 0}`))

  for (const participantRaw of order) {
    const participant = asRecord(participantRaw)
    if (!participant) {
      continue
    }

    const id = asString(participant.id)
    if (!id || !id.startsWith('enemy_')) {
      continue
    }

    if (entities.some((entity) => asString(entity.id) === id)) {
      continue
    }

    // Place enemy near map center, nudging right/down until free.
    let x = Math.max(0, Math.trunc((asNumber(out.width) ?? 10) / 2))
    let y = Math.max(0, Math.trunc((asNumber(out.height) ?? 10) / 2))
    while (occupied.has(`${x},${y}`)) {
      x += 1
      if (x >= (asNumber(out.width) ?? 10)) {
        x = 0
        y = (y + 1) % Math.max(1, Math.trunc(asNumber(out.height) ?? 10))
      }
    }
    occupied.add(`${x},${y}`)

    entities.push({
      id,
      name: asString(participant.name) ?? id,
      x,
      y,
      type: 'enemy',
      sprite: 'default',
      blocks_movement: true,
    })
  }

  out.entities = entities
  return out
}

function resolveAttackAction(snapshot: SessionSnapshot, player: SessionSnapshot['players'][number], content: string, combatInput: JsonRecord): ActionEngineResult {
  const combat = JSON.parse(JSON.stringify(combatInput)) as JsonRecord
  const order = Array.isArray(combat.initiative_order)
    ? combat.initiative_order.map((entry) => asRecord(entry)).filter(Boolean) as JsonRecord[]
    : []
  if (order.length === 0) {
    return {
      narratives: ['Combat has no participants to resolve an attack.'],
      dice_results: [],
    }
  }

  const currentTurnId = asString(combat.current_turn)
  const actorId = currentTurnId ?? asString(order[Math.max(0, Math.trunc(asNumber(combat.turn_index) ?? 0))]?.id)
  if (!actorId) {
    return {
      narratives: ['Combat turn state is invalid.'],
      dice_results: [],
    }
  }

  if (player.character_id && actorId !== player.character_id) {
    const actor = order.find((entry) => asString(entry.id) === actorId)
    return {
      narratives: [`It is not your turn. Current turn: ${asString(actor?.name) ?? actorId}.`],
      dice_results: [],
      combat,
    }
  }

  const livingTargets = order.filter((entry) => asString(entry.id) !== actorId && (asNumber(entry.hp) ?? 0) > 0)
  const target = livingTargets[0]
  if (!target) {
    return {
      narratives: ['No valid target remains in combat.'],
      dice_results: [],
      combat,
    }
  }

  const actorCharacter = asRecord(snapshot.game_state.characters[actorId])
  const actorName = asString(actorCharacter?.name) ?? asString(order.find((entry) => asString(entry.id) === actorId)?.name) ?? actorId
  const targetId = asString(target.id) ?? 'target'
  const targetName = asString(target.name) ?? targetId
  const targetAc = asNumber(target.ac) ?? asNumber(asRecord(snapshot.game_state.characters[targetId])?.ac) ?? 12

  const attackSeed = stableSeed(snapshot.room_code, `${content}|${combat.round ?? 1}|${combat.turn_index ?? 0}|${actorId}|${targetId}`)
  const strMod = abilityMod(asNumber(asRecord(actorCharacter?.abilities)?.STR))
  const profBonus = 2
  const attackMod = strMod + profBonus
  const d20 = d20For(attackSeed, 'attack-roll')
  const totalAttack = d20 + attackMod
  const critical = d20 === 20
  const fumble = d20 === 1
  const hits = critical || (!fumble && totalAttack >= targetAc)

  let damage = 0
  if (hits) {
    damage = Math.max(1, d8For(attackSeed, 'damage-roll') + strMod)
    if (critical) {
      damage += d8For(attackSeed, 'damage-crit')
    }
  }

  const newTargetHp = Math.max(0, (asNumber(target.hp) ?? 1) - damage)
  target.hp = newTargetHp
  const targetUnconscious = newTargetHp <= 0

  combat.initiative_order = order
  const refreshedCombat = finalizeCombatState(combat)

  const mergeCharacters: Record<string, JsonRecord> = {}
  const targetCharacter = asRecord(snapshot.game_state.characters[targetId])
  if (targetCharacter) {
    mergeCharacters[targetId] = {
      ...targetCharacter,
      hp: newTargetHp,
      is_alive: newTargetHp > 0,
    }
  }

  const diceResultData: JsonRecord = {
    attacker: actorName,
    target: targetName,
    attack_roll: totalAttack,
    d20,
    roll_detail: String(d20),
    modifier: attackMod,
    target_ac: targetAc,
    hits,
    critical,
    fumble,
    damage,
    target_hp: newTargetHp,
    target_unconscious: targetUnconscious,
  }

  const narratives = hits
    ? [`${actorName} strikes ${targetName} for ${damage} damage.`, targetUnconscious ? `${targetName} drops!` : 'The fight continues.']
    : [`${actorName} attacks ${targetName} but misses.`, 'What is your next move?']

  const updatedMap = targetUnconscious ? removeEntityFromMap(asRecord(snapshot.game_state.map), targetId) : undefined

  if (targetUnconscious && refreshedCombat == null) {
    narratives.push('Combat ends.')
  }

  return {
    narratives,
    dice_results: [{ tool: 'attack', data: diceResultData }],
    combat: refreshedCombat,
    map: updatedMap,
    mergeCharacters: Object.keys(mergeCharacters).length > 0 ? mergeCharacters : undefined,
  }
}

export function advanceCombatTurn(combatInput: JsonRecord | null, skipEnemyTurns: boolean): { combat: JsonRecord | null; data: JsonRecord } | { error: string } {
  if (!combatInput || combatInput.is_active !== true) {
    return { error: 'No active combat' }
  }

  const combat = JSON.parse(JSON.stringify(combatInput)) as JsonRecord
  const order = Array.isArray(combat.initiative_order)
    ? combat.initiative_order
        .map((entry) => asRecord(entry))
        .filter((entry): entry is JsonRecord => entry !== null)
        .filter((entry) => (asNumber(entry.hp) ?? 0) > 0)
    : []
  if (order.length === 0) {
    return { error: 'No active combat' }
  }

  if (livingEnemyCount(order) === 0 || livingPlayerCount(order) === 0) {
    return {
      combat: null,
      data: {
        message: 'Combat ends.',
      },
    }
  }

  let turnIndex = Math.trunc(asNumber(combat.turn_index) ?? 0) + 1
  let round = Math.trunc(asNumber(combat.round) ?? 1)
  const advance = () => {
    if (turnIndex >= order.length) {
      turnIndex = 0
      round += 1
    }
  }
  advance()

  let safety = 0
  while (skipEnemyTurns && safety < 12) {
    safety += 1
    const participant = order[turnIndex]
    const id = participant ? asString(participant.id) : null
    if (!id || !id.startsWith('enemy_')) {
      break
    }
    turnIndex += 1
    advance()
  }

  safety = 0
  while (safety < 12) {
    safety += 1
    const participant = order[turnIndex]
    if ((asNumber(participant?.hp) ?? 0) > 0) {
      break
    }
    turnIndex += 1
    advance()
  }

  const current = order[turnIndex] ?? null
  const speed = current ? (asNumber(current.speed) ?? 30) : 0
  if (current) {
    current.movement_remaining = speed
  }

  const nextCombatCandidate = refreshCurrentParticipant({
    ...combat,
    round,
    turn_index: turnIndex,
    initiative_order: order,
  })
  const nextCombat = finalizeCombatState(nextCombatCandidate)

  if (!nextCombat) {
    return {
      combat: null,
      data: {
        message: 'Combat ends.',
      },
    }
  }

  const currentName = current ? asString(current.name) ?? asString(current.id) ?? 'Unknown' : 'Unknown'

  return {
    combat: nextCombat,
    data: {
      round,
      current_turn: asString(current?.id),
      current_name: currentName,
      message: `Round ${round}: ${currentName}'s turn.`,
    },
  }
}

export function runActionEngine(snapshot: SessionSnapshot, playerId: string, content: string): ActionEngineResult {
  const player = snapshot.players.find((entry) => entry.id === playerId)
  if (!player) {
    return {
      narratives: ['I cannot find that player in this session.'],
      dice_results: [],
    }
  }

  if (shouldGenerateMap(snapshot, content)) {
    try {
      const generated = buildMapFromVector(snapshot, content)
      return {
        narratives: [
          'You step into a newly revealed area as the scene unfolds around the party.',
          'I have prepared the battle map for this location. What do you do?',
        ],
        dice_results: [],
        map: generated.map,
        overlay: generated.overlay,
        mergeCharacters: generated.mergeCharacters,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Map generation failed'
      return {
        narratives: [`I could not generate a map right now: ${message}. Describe your next move and I will continue.`],
        dice_results: [],
      }
    }
  }

  if (COMBAT_CUE.test(content)) {
    const existingCombat = asRecord(snapshot.game_state.combat)
    if (existingCombat && existingCombat.is_active === true) {
      if (ATTACK_CUE.test(content)) {
        return resolveAttackAction(snapshot, player, content, existingCombat)
      }
      const currentTurn = asString(existingCombat.current_turn)
      const currentName = asRecord((Array.isArray(existingCombat.initiative_order) ? existingCombat.initiative_order.find((entry) => asRecord(entry)?.id === currentTurn) : null))
      return {
        narratives: [
          `Combat is already active. Current turn: ${asString(currentName?.name) ?? currentTurn ?? 'unknown'}.`,
          'Declare your action target and intent, or use End Turn.',
        ],
        dice_results: [],
      }
    }

    const seed = stableSeed(snapshot.room_code, `${content}|combat`)
    const created = createCombatState(snapshot, seed)
    const mapWithEnemies = injectCombatEntitiesIntoMap(asRecord(snapshot.game_state.map), created.combat)
    return {
      narratives: [
        `${player.name}, initiative is rolled and combat begins.`,
        'Declare your first tactical action.',
      ],
      dice_results: created.diceResults,
      combat: created.combat,
      map: mapWithEnemies,
    }
  }

  return {
    narratives: [`${player.name}, I acknowledge: "${content}". What is your immediate next action?`],
    dice_results: [],
  }
}
