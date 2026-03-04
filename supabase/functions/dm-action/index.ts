import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type SnapshotState = {
  characters: Record<string, Record<string, unknown>>
  map: Record<string, unknown> | null
  combat: Record<string, unknown> | null
  usage: { input_tokens: number; output_tokens: number; estimated_cost_usd: number }
}

const CLASS_HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
}

const CLASS_SPELLCASTING_MODE: Record<string, 'none' | 'known' | 'prepared'> = {
  barbarian: 'none',
  fighter: 'none',
  monk: 'none',
  rogue: 'none',
  bard: 'known',
  sorcerer: 'known',
  warlock: 'known',
  ranger: 'known',
  cleric: 'prepared',
  druid: 'prepared',
  paladin: 'prepared',
  wizard: 'prepared',
}

const CLASS_SPELL_CATALOG: Record<string, Array<{ name: string; level: number; school?: string }>> = {
  bard: [
    { name: 'Healing Word', level: 1, school: 'evocation' },
    { name: 'Dissonant Whispers', level: 1, school: 'enchantment' },
    { name: 'Faerie Fire', level: 1, school: 'evocation' },
    { name: 'Thunderwave', level: 1, school: 'evocation' },
  ],
  cleric: [
    { name: 'Bless', level: 1, school: 'enchantment' },
    { name: 'Cure Wounds', level: 1, school: 'evocation' },
    { name: 'Guiding Bolt', level: 1, school: 'evocation' },
    { name: 'Shield of Faith', level: 1, school: 'abjuration' },
  ],
  druid: [
    { name: 'Entangle', level: 1, school: 'conjuration' },
    { name: 'Faerie Fire', level: 1, school: 'evocation' },
    { name: 'Goodberry', level: 1, school: 'transmutation' },
    { name: 'Thunderwave', level: 1, school: 'evocation' },
  ],
  paladin: [
    { name: 'Bless', level: 1, school: 'enchantment' },
    { name: 'Cure Wounds', level: 1, school: 'evocation' },
    { name: 'Shield of Faith', level: 1, school: 'abjuration' },
  ],
  ranger: [
    { name: 'Ensnaring Strike', level: 1, school: 'conjuration' },
    { name: 'Hail of Thorns', level: 1, school: 'conjuration' },
    { name: 'Hunter\'s Mark', level: 1, school: 'divination' },
  ],
  sorcerer: [
    { name: 'Magic Missile', level: 1, school: 'evocation' },
    { name: 'Shield', level: 1, school: 'abjuration' },
    { name: 'Sleep', level: 1, school: 'enchantment' },
    { name: 'Thunderwave', level: 1, school: 'evocation' },
  ],
  warlock: [
    { name: 'Hex', level: 1, school: 'enchantment' },
    { name: 'Armor of Agathys', level: 1, school: 'abjuration' },
    { name: 'Arms of Hadar', level: 1, school: 'conjuration' },
  ],
  wizard: [
    { name: 'Magic Missile', level: 1, school: 'evocation' },
    { name: 'Shield', level: 1, school: 'abjuration' },
    { name: 'Sleep', level: 1, school: 'enchantment' },
    { name: 'Burning Hands', level: 1, school: 'evocation' },
  ],
}

function toClassKey(value: string): string {
  return value.trim().toLowerCase()
}

function abilityModifier(score: unknown): number {
  const asNumber = Number(score ?? 10)
  return Math.floor((asNumber - 10) / 2)
}

function defaultSnapshot(): SnapshotState {
  return {
    characters: {},
    map: null,
    combat: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
    },
  }
}

async function publishEvent(sessionId: string, eventType: string, payload: Record<string, unknown>, actorPlayerId: string | null = null) {
  const { error } = await supabase.from('game_events').insert({
    session_id: sessionId,
    event_type: eventType,
    actor_player_id: actorPlayerId,
    payload,
  })
  if (error) {
    throw new Error(`Failed to publish event: ${error.message}`)
  }
}

async function resolveSession(roomCodeRaw: string) {
  const roomCode = roomCodeRaw.trim().toUpperCase()
  const { data, error } = await supabase
    .from('game_sessions')
    .select('id, room_code')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!data?.id) {
    throw new Error('Session not found')
  }

  return { sessionId: data.id as string, roomCode: data.room_code as string }
}

async function resolveMember(sessionId: string, playerId: string) {
  const { data, error } = await supabase
    .from('session_members')
    .select('player_id, player_name, character_id')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  if (!data?.player_id) {
    throw new Error('Player not found in session')
  }

  return {
    playerId: data.player_id as string,
    playerName: data.player_name as string,
    characterId: (data.character_id as string | null) ?? null,
  }
}

async function loadSnapshot(sessionId: string): Promise<{ version: number; snapshot: SnapshotState }> {
  const { data, error } = await supabase
    .from('session_snapshots')
    .select('version, snapshot')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.snapshot) {
    return { version: 0, snapshot: defaultSnapshot() }
  }

  return {
    version: Number(data.version ?? 0),
    snapshot: data.snapshot as SnapshotState,
  }
}

async function saveSnapshot(sessionId: string, currentVersion: number, snapshot: SnapshotState): Promise<number> {
  const nextVersion = currentVersion + 1
  const { error } = await supabase
    .from('session_snapshots')
    .insert({
      session_id: sessionId,
      version: nextVersion,
      snapshot,
    })

  if (error) {
    throw new Error(error.message)
  }

  return nextVersion
}

function getSpellCatalog(charClass: string) {
  const classKey = toClassKey(charClass)
  return CLASS_SPELL_CATALOG[classKey] ?? []
}

function getSpellcastingProfile(charClass: string) {
  const classKey = toClassKey(charClass)
  const mode = CLASS_SPELLCASTING_MODE[classKey] ?? 'none'
  if (mode === 'none') {
    return { mode, knownLimit: 0, preparedLimit: 0, slots: {} as Record<number, number> }
  }

  if (classKey === 'paladin' || classKey === 'ranger') {
    return { mode, knownLimit: mode === 'known' ? 2 : 0, preparedLimit: mode === 'prepared' ? 2 : 0, slots: {} as Record<number, number> }
  }

  return { mode, knownLimit: mode === 'known' ? 2 : 0, preparedLimit: mode === 'prepared' ? 3 : 0, slots: { 1: 2 } as Record<number, number> }
}

function buildCharacter(input: {
  charId: string
  playerId: string
  name: string
  race: string
  charClass: string
  abilities: Record<string, number>
  knownSpells: string[]
  preparedSpells: string[]
}) {
  const classKey = toClassKey(input.charClass)
  const profile = getSpellcastingProfile(classKey)
  const conMod = abilityModifier(input.abilities.CON)
  const dexMod = abilityModifier(input.abilities.DEX)
  const hitDie = CLASS_HIT_DIE[classKey] ?? 8
  const maxHp = Math.max(1, hitDie + conMod)

  const modifiers: Record<string, number> = {}
  for (const [ability, score] of Object.entries(input.abilities)) {
    modifiers[ability] = abilityModifier(score)
  }

  return {
    id: input.charId,
    name: input.name,
    race: input.race,
    class: input.charClass,
    level: 1,
    abilities: input.abilities,
    modifiers,
    hp: maxHp,
    max_hp: maxHp,
    temp_hp: 0,
    ac: 10 + dexMod,
    speed: 30,
    proficiency_bonus: 2,
    skill_proficiencies: [],
    conditions: [],
    inventory: [],
    spell_slots: profile.slots,
    spell_slots_used: {},
    known_spells: input.knownSpells,
    prepared_spells: input.preparedSpells,
    class_features: [],
    traits: [],
    xp: 0,
    is_alive: true,
    rules_version: '2024',
    spellcasting_mode: profile.mode,
    player_id: input.playerId,
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

async function actionGetSpellOptions(body: Record<string, unknown>) {
  const charClass = typeof body.char_class === 'string' ? body.char_class : ''
  const level = Number(body.level ?? 1)
  if (!charClass) {
    throw new Error('char_class is required')
  }

  const profile = getSpellcastingProfile(charClass)
  const spells = getSpellCatalog(charClass)

  return {
    spellcasting_mode: profile.mode,
    known_limit: profile.knownLimit,
    prepared_limit: profile.preparedLimit,
    level: Number.isFinite(level) ? Math.max(1, level) : 1,
    spells,
  }
}

async function actionCreateCharacter(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const race = typeof body.race === 'string' ? body.race.trim() : ''
  const charClass = typeof body.char_class === 'string' ? body.char_class.trim() : ''
  const abilities = (body.abilities ?? {}) as Record<string, number>

  if (!roomCode || !playerId || !name || !race || !charClass) {
    throw new Error('room_code, player_id, name, race, and char_class are required')
  }

  const knownSpells = asStringArray(body.known_spells)
  const preparedSpells = asStringArray(body.prepared_spells)

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  const { version, snapshot } = await loadSnapshot(sessionId)

  const charId = `pc_${playerId}`
  const character = buildCharacter({
    charId,
    playerId,
    name,
    race,
    charClass,
    abilities,
    knownSpells,
    preparedSpells,
  })

  const nextSnapshot: SnapshotState = {
    ...snapshot,
    characters: {
      ...(snapshot.characters ?? {}),
      [charId]: character,
    },
  }

  await saveSnapshot(sessionId, version, nextSnapshot)

  const { error: updateMemberError } = await supabase
    .from('session_members')
    .update({ character_id: charId })
    .eq('session_id', sessionId)
    .eq('player_id', playerId)

  if (updateMemberError) {
    throw new Error(updateMemberError.message)
  }

  await publishEvent(sessionId, 'character_created', { character }, playerId)
  await publishEvent(sessionId, 'state_sync', { state: nextSnapshot }, playerId)
  await publishEvent(sessionId, 'dm_narrative', { content: `${member.playerName} enters the adventure as ${name}.` }, playerId)

  return { character, state: nextSnapshot }
}

async function actionLevelUpPreparedSpells(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  const preparedSpells = asStringArray(body.prepared_spells)

  if (!roomCode || !playerId) {
    throw new Error('room_code and player_id are required')
  }

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  if (!member.characterId) {
    throw new Error('No character selected for this player')
  }

  const { version, snapshot } = await loadSnapshot(sessionId)
  if (snapshot.combat?.is_active) {
    throw new Error('You cannot change prepared spells during combat.')
  }

  const currentChar = snapshot.characters?.[member.characterId]
  if (!currentChar) {
    throw new Error('Character not found in session state')
  }

  const nextSnapshot: SnapshotState = {
    ...snapshot,
    characters: {
      ...(snapshot.characters ?? {}),
      [member.characterId]: {
        ...currentChar,
        prepared_spells: preparedSpells,
      },
    },
  }

  await saveSnapshot(sessionId, version, nextSnapshot)
  await publishEvent(sessionId, 'state_sync', { state: nextSnapshot }, playerId)

  return {
    ok: true,
    prepared_spells: preparedSpells,
    state: nextSnapshot,
  }
}

async function actionGetCastableSpells(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  if (!roomCode || !playerId) {
    throw new Error('room_code and player_id are required')
  }

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  if (!member.characterId) {
    return { castable_spells: [], slot_states: [] }
  }

  const { snapshot } = await loadSnapshot(sessionId)
  const character = snapshot.characters?.[member.characterId]
  if (!character) {
    return { castable_spells: [], slot_states: [] }
  }

  const characterClass = String(character.class ?? '')
  const mode = String(character.spellcasting_mode ?? 'none')
  const catalog = getSpellCatalog(characterClass)
  const spellSlots = (character.spell_slots as Record<number, number> | undefined) ?? {}
  const spellSlotsUsed = (character.spell_slots_used as Record<number, number> | undefined) ?? {}

  const selectedSpells = mode === 'prepared'
    ? asStringArray(character.prepared_spells)
    : asStringArray(character.known_spells)

  const castableSpells = selectedSpells.map((name) => {
    const spell = catalog.find((item) => item.name === name) ?? { name, level: 1 }
    const spellLevel = Number(spell.level ?? 1)
    if (spellLevel <= 0) {
      return {
        name,
        level: 0,
        castable: true,
        reason: null,
        slot_options: [0],
      }
    }

    const slotOptions = Object.keys(spellSlots)
      .map(Number)
      .filter((level) => level >= spellLevel && (Number(spellSlots[level] ?? 0) - Number(spellSlotsUsed[level] ?? 0)) > 0)
      .sort((a, b) => a - b)

    return {
      name,
      level: spellLevel,
      castable: slotOptions.length > 0,
      reason: slotOptions.length > 0 ? null : 'No available spell slots',
      slot_options: slotOptions,
    }
  })

  const slotStates = Object.keys(spellSlots)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => {
      const total = Number(spellSlots[level] ?? 0)
      const used = Number(spellSlotsUsed[level] ?? 0)
      const remaining = Math.max(0, total - used)
      return {
        level,
        total,
        used,
        remaining,
        state: remaining > 0 ? 'available' : 'unavailable',
        restricted: false,
      }
    })

  return {
    castable_spells: castableSpells,
    slot_states: slotStates,
  }
}

async function actionCastSpell(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  const spellName = typeof body.spell_name === 'string' ? body.spell_name.trim() : ''
  const slotLevel = Number(body.slot_level ?? 0)
  if (!roomCode || !playerId || !spellName) {
    throw new Error('room_code, player_id, and spell_name are required')
  }

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  if (!member.characterId) {
    throw new Error('No character selected for this player')
  }

  const { version, snapshot } = await loadSnapshot(sessionId)
  const character = snapshot.characters?.[member.characterId]
  if (!character) {
    throw new Error('Character not found in session state')
  }

  const nextCharacter = { ...character }
  if (slotLevel > 0) {
    const slots = { ...((character.spell_slots as Record<number, number> | undefined) ?? {}) }
    const used = { ...((character.spell_slots_used as Record<number, number> | undefined) ?? {}) }
    const total = Number(slots[slotLevel] ?? 0)
    const currentUsed = Number(used[slotLevel] ?? 0)
    if (total <= currentUsed) {
      throw new Error(`No level ${slotLevel} spell slots remaining`)
    }
    used[slotLevel] = currentUsed + 1
    nextCharacter.spell_slots_used = used
  }

  const nextSnapshot: SnapshotState = {
    ...snapshot,
    characters: {
      ...(snapshot.characters ?? {}),
      [member.characterId]: nextCharacter,
    },
  }

  await saveSnapshot(sessionId, version, nextSnapshot)
  await publishEvent(sessionId, 'dice_result', {
    tool: 'cast_spell',
    data: {
      character: String(character.name ?? member.playerName),
      spell: spellName,
      slot_level: slotLevel,
    },
  }, playerId)
  await publishEvent(sessionId, 'state_sync', { state: nextSnapshot }, playerId)

  return { ok: true }
}

async function actionPlayerAction(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!roomCode || !playerId || !content) {
    throw new Error('room_code, player_id, and content are required')
  }

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)

  await publishEvent(sessionId, 'player_message', {
    player_id: playerId,
    player_name: member.playerName,
    content,
  }, playerId)

  await publishEvent(sessionId, 'dm_narrative', {
    content: `The DM considers your action: "${content}"`,
  }, null)

  return { ok: true }
}

async function actionMoveToken(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  const characterId = typeof body.character_id === 'string' ? body.character_id : ''
  const x = Number(body.x)
  const y = Number(body.y)
  if (!roomCode || !playerId || !characterId || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('room_code, player_id, character_id, x, and y are required')
  }

  const { sessionId } = await resolveSession(roomCode)
  await publishEvent(sessionId, 'map_change', {
    action: 'move_entity',
    data: {
      moved: characterId,
      to: { x, y },
    },
  }, playerId)

  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''

    if (!action) {
      return Response.json({ error: 'Missing action' }, { status: 400, headers: corsHeaders })
    }

    if (action === 'get_spell_options') {
      return Response.json(await actionGetSpellOptions(body), { headers: corsHeaders })
    }

    if (action === 'create_character') {
      return Response.json(await actionCreateCharacter(body), { headers: corsHeaders })
    }

    if (action === 'level_up_prepared_spells') {
      return Response.json(await actionLevelUpPreparedSpells(body), { headers: corsHeaders })
    }

    if (action === 'get_castable_spells') {
      return Response.json(await actionGetCastableSpells(body), { headers: corsHeaders })
    }

    if (action === 'cast_spell') {
      return Response.json(await actionCastSpell(body), { headers: corsHeaders })
    }

    if (action === 'player_action') {
      return Response.json(await actionPlayerAction(body), { headers: corsHeaders })
    }

    if (action === 'move_token') {
      return Response.json(await actionMoveToken(body), { headers: corsHeaders })
    }

    return Response.json({ error: `Unsupported action: ${action}` }, { status: 400, headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})