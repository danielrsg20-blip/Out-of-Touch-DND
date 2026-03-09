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

const PC_SPRITE_CATALOG: Array<{ id: string; races: string[]; classes: string[]; label: string }> = [
  { id: 'pc_knight', label: 'Knight', races: ['human', 'dragonborn', 'half-orc'], classes: ['fighter', 'paladin', 'barbarian'] },
  { id: 'pc_ranger', label: 'Ranger', races: ['elf', 'half-elf', 'human', 'halfling'], classes: ['ranger', 'druid', 'rogue'] },
  { id: 'pc_mage', label: 'Mage', races: ['human', 'elf', 'gnome', 'tiefling'], classes: ['wizard', 'sorcerer', 'warlock'] },
  { id: 'pc_cleric', label: 'Cleric', races: ['human', 'dwarf', 'half-elf'], classes: ['cleric', 'paladin'] },
  { id: 'pc_bard', label: 'Bard', races: ['human', 'elf', 'half-elf', 'tiefling'], classes: ['bard', 'rogue'] },
  { id: 'pc_monk', label: 'Monk', races: ['human', 'elf', 'gnome', 'half-orc'], classes: ['monk', 'rogue'] },
  { id: 'pc_druid', label: 'Druid', races: ['elf', 'gnome', 'halfling', 'half-elf'], classes: ['druid', 'ranger', 'cleric'] },
  { id: 'pc_rogue', label: 'Rogue', races: ['halfling', 'human', 'tiefling', 'half-elf'], classes: ['rogue', 'ranger', 'bard'] },
  { id: 'pc_human_barbarian', label: 'Human Barbarian', races: ['human'], classes: ['barbarian'] },
  { id: 'pc_human_bard', label: 'Human Bard', races: ['human'], classes: ['bard'] },
  { id: 'pc_human_cleric', label: 'Human Cleric', races: ['human'], classes: ['cleric'] },
  { id: 'pc_human_druid', label: 'Human Druid', races: ['human'], classes: ['druid'] },
  { id: 'pc_human_fighter', label: 'Human Fighter', races: ['human'], classes: ['fighter'] },
  { id: 'pc_human_monk', label: 'Human Monk', races: ['human'], classes: ['monk'] },
  { id: 'pc_human_paladin', label: 'Human Paladin', races: ['human'], classes: ['paladin'] },
  { id: 'pc_human_ranger', label: 'Human Ranger', races: ['human'], classes: ['ranger'] },
  { id: 'pc_human_rogue', label: 'Human Rogue', races: ['human'], classes: ['rogue'] },
  { id: 'pc_human_sorcerer', label: 'Human Sorcerer', races: ['human'], classes: ['sorcerer'] },
  { id: 'pc_human_warlock', label: 'Human Warlock', races: ['human'], classes: ['warlock'] },
  { id: 'pc_human_wizard', label: 'Human Wizard', races: ['human'], classes: ['wizard'] },
  { id: 'pc_elf_barbarian', label: 'Elf Barbarian', races: ['elf'], classes: ['barbarian'] },
  { id: 'pc_elf_bard', label: 'Elf Bard', races: ['elf'], classes: ['bard'] },
  { id: 'pc_elf_cleric', label: 'Elf Cleric', races: ['elf'], classes: ['cleric'] },
  { id: 'pc_elf_druid', label: 'Elf Druid', races: ['elf'], classes: ['druid'] },
  { id: 'pc_elf_fighter', label: 'Elf Fighter', races: ['elf'], classes: ['fighter'] },
  { id: 'pc_elf_monk', label: 'Elf Monk', races: ['elf'], classes: ['monk'] },
  { id: 'pc_elf_paladin', label: 'Elf Paladin', races: ['elf'], classes: ['paladin'] },
  { id: 'pc_elf_ranger', label: 'Elf Ranger', races: ['elf'], classes: ['ranger'] },
  { id: 'pc_elf_rogue', label: 'Elf Rogue', races: ['elf'], classes: ['rogue'] },
  { id: 'pc_elf_sorcerer', label: 'Elf Sorcerer', races: ['elf'], classes: ['sorcerer'] },
  { id: 'pc_elf_warlock', label: 'Elf Warlock', races: ['elf'], classes: ['warlock'] },
  { id: 'pc_elf_wizard', label: 'Elf Wizard', races: ['elf'], classes: ['wizard'] },
  { id: 'pc_dwarf_barbarian', label: 'Dwarf Barbarian', races: ['dwarf'], classes: ['barbarian'] },
  { id: 'pc_dwarf_bard', label: 'Dwarf Bard', races: ['dwarf'], classes: ['bard'] },
  { id: 'pc_dwarf_cleric', label: 'Dwarf Cleric', races: ['dwarf'], classes: ['cleric'] },
  { id: 'pc_dwarf_druid', label: 'Dwarf Druid', races: ['dwarf'], classes: ['druid'] },
  { id: 'pc_dwarf_fighter', label: 'Dwarf Fighter', races: ['dwarf'], classes: ['fighter'] },
  { id: 'pc_dwarf_monk', label: 'Dwarf Monk', races: ['dwarf'], classes: ['monk'] },
  { id: 'pc_dwarf_paladin', label: 'Dwarf Paladin', races: ['dwarf'], classes: ['paladin'] },
  { id: 'pc_dwarf_ranger', label: 'Dwarf Ranger', races: ['dwarf'], classes: ['ranger'] },
  { id: 'pc_dwarf_rogue', label: 'Dwarf Rogue', races: ['dwarf'], classes: ['rogue'] },
  { id: 'pc_dwarf_sorcerer', label: 'Dwarf Sorcerer', races: ['dwarf'], classes: ['sorcerer'] },
  { id: 'pc_dwarf_warlock', label: 'Dwarf Warlock', races: ['dwarf'], classes: ['warlock'] },
  { id: 'pc_dwarf_wizard', label: 'Dwarf Wizard', races: ['dwarf'], classes: ['wizard'] },
]

const ENEMY_SPRITES_BY_THEME: Record<string, Array<{ id: string; name: string; hp: number }>> = {
  dungeon: [
    { id: 'enemy_skeleton', name: 'Skeleton', hp: 13 },
    { id: 'enemy_goblin', name: 'Goblin', hp: 7 },
    { id: 'enemy_orc', name: 'Orc Raider', hp: 15 },
    { id: 'enemy_bat', name: 'Cave Bat', hp: 5 },
  ],
  forest: [
    { id: 'enemy_wolf', name: 'Wolf', hp: 11 },
    { id: 'enemy_bandit', name: 'Bandit', hp: 11 },
    { id: 'enemy_spider', name: 'Giant Spider', hp: 14 },
    { id: 'enemy_boar', name: 'Boar', hp: 13 },
  ],
  crypt: [
    { id: 'enemy_ghoul', name: 'Ghoul', hp: 22 },
    { id: 'enemy_skeleton', name: 'Skeleton', hp: 13 },
    { id: 'enemy_wraith', name: 'Restless Spirit', hp: 21 },
    { id: 'enemy_zombie', name: 'Zombie', hp: 22 },
  ],
  cave: [
    { id: 'enemy_kobold', name: 'Kobold', hp: 5 },
    { id: 'enemy_bat', name: 'Cave Bat', hp: 5 },
    { id: 'enemy_spider', name: 'Giant Spider', hp: 14 },
    { id: 'enemy_orc', name: 'Orc Scout', hp: 15 },
  ],
}

const PROP_SPRITES_BY_THEME: Record<string, Array<{ id: string; name: string }>> = {
  dungeon: [
    { id: 'prop_torch', name: 'Torch' },
    { id: 'prop_crate', name: 'Crate' },
    { id: 'prop_barrel', name: 'Barrel' },
    { id: 'prop_rubble', name: 'Rubble' },
  ],
  forest: [
    { id: 'prop_tree', name: 'Tree' },
    { id: 'prop_bush', name: 'Bush' },
    { id: 'prop_log', name: 'Fallen Log' },
    { id: 'prop_stone', name: 'Stone' },
  ],
  crypt: [
    { id: 'prop_urn', name: 'Urn' },
    { id: 'prop_brazier', name: 'Brazier' },
    { id: 'prop_tomb', name: 'Tomb Marker' },
    { id: 'prop_bones', name: 'Bone Pile' },
  ],
  cave: [
    { id: 'prop_stalagmite', name: 'Stalagmite' },
    { id: 'prop_crystal', name: 'Crystal' },
    { id: 'prop_stone', name: 'Stone' },
    { id: 'prop_mushroom', name: 'Mushroom Patch' },
  ],
}

function randomInt(min: number, max: number): number {
  const floorMin = Math.ceil(min)
  const floorMax = Math.floor(max)
  return Math.floor(Math.random() * (floorMax - floorMin + 1)) + floorMin
}

function parseBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return null
}

function isMockModeEnabled(body: Record<string, unknown>): boolean {
  const bodyValue = parseBool(body.mock_mode)
  if (bodyValue !== null) {
    return bodyValue
  }

  const localMock = parseBool(Deno.env.get('LOCAL_MOCK_MODE'))
  if (localMock !== null) {
    return localMock
  }

  const edgeMock = parseBool(Deno.env.get('OTDND_MOCK_MODE'))
  return edgeMock === true
}

const SHEET_SPRITE_RACES = new Set(['human', 'elf', 'dwarf', 'dragonborn', 'gnome', 'halfling', 'half-elf', 'half-orc', 'tiefling'])
const SHEET_SPRITE_CLASSES = new Set(['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'])

function normalizeRaceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function isSheetSpriteId(spriteId: string): boolean {
  const normalized = spriteId.trim().toLowerCase()
  const match = /^pc_([a-z][a-z-_]*)_([a-z]+)$/.exec(normalized)
  if (!match) {
    return false
  }
  const raceKey = match[1].replace(/_/g, '-')
  const classKey = match[2]
  return SHEET_SPRITE_RACES.has(raceKey) && SHEET_SPRITE_CLASSES.has(classKey)
}

function getSheetSpriteIdFor(race: string, charClass: string): string | null {
  const raceKey = normalizeRaceKey(race)
  const classKey = charClass.trim().toLowerCase()
  if (!SHEET_SPRITE_RACES.has(raceKey) || !SHEET_SPRITE_CLASSES.has(classKey)) {
    return null
  }
  return `pc_${raceKey}_${classKey}`
}

function pickCharacterSpriteId(race: string, charClass: string, requestedSpriteId: string): string {
  if (requestedSpriteId && (PC_SPRITE_CATALOG.some((entry) => entry.id === requestedSpriteId) || isSheetSpriteId(requestedSpriteId))) {
    return requestedSpriteId
  }

  const generatedSheetSpriteId = getSheetSpriteIdFor(race, charClass)
  if (generatedSheetSpriteId) {
    return generatedSheetSpriteId
  }

  const raceKey = race.trim().toLowerCase()
  const classKey = charClass.trim().toLowerCase()
  const match = PC_SPRITE_CATALOG.find((entry) => entry.races.includes(raceKey) || entry.classes.includes(classKey))
  return match?.id ?? 'pc_knight'
}

function isEnemyEntityId(entityId: string): boolean {
  return entityId.startsWith('enemy_')
}

type InitiativeEntry = {
  id: string
  name: string
  initiative: number
  hp: number
  max_hp: number
  movement_remaining?: number
}

type CombatState = {
  is_active: boolean
  round: number
  turn_index: number
  current_turn: string | null
  current_movement_total?: number
  current_movement_remaining?: number
  initiative_order: InitiativeEntry[]
}

function normalizeCombat(raw: unknown): CombatState | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const combat = raw as Record<string, unknown>
  if (!Array.isArray(combat.initiative_order)) {
    return null
  }

  const initiativeOrder: InitiativeEntry[] = combat.initiative_order
    .map((entry): InitiativeEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const row = entry as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id : ''
      const name = typeof row.name === 'string' ? row.name : id
      if (!id) {
        return null
      }
      return {
        id,
        name,
        initiative: Number(row.initiative ?? 0),
        hp: Number(row.hp ?? 0),
        max_hp: Number(row.max_hp ?? 0),
        movement_remaining: Number(row.movement_remaining ?? 30),
      }
    })
    .filter((entry): entry is InitiativeEntry => entry !== null)

  if (!initiativeOrder.length) {
    return null
  }

  const turnIndexRaw = Number(combat.turn_index ?? 0)
  const turnIndex = Number.isFinite(turnIndexRaw)
    ? ((turnIndexRaw % initiativeOrder.length) + initiativeOrder.length) % initiativeOrder.length
    : 0
  const current = initiativeOrder[turnIndex]

  return {
    is_active: Boolean(combat.is_active),
    round: Math.max(1, Number(combat.round ?? 1) || 1),
    turn_index: turnIndex,
    current_turn: typeof combat.current_turn === 'string' ? combat.current_turn : current.id,
    current_movement_total: Number(combat.current_movement_total ?? current.movement_remaining ?? 30),
    current_movement_remaining: Number(combat.current_movement_remaining ?? current.movement_remaining ?? 30),
    initiative_order: initiativeOrder,
  }
}

function setCurrentTurnFields(combat: CombatState): CombatState {
  const index = ((combat.turn_index % combat.initiative_order.length) + combat.initiative_order.length) % combat.initiative_order.length
  const current = combat.initiative_order[index]
  const movement = Number(current?.movement_remaining ?? 30)
  return {
    ...combat,
    turn_index: index,
    current_turn: current?.id ?? null,
    current_movement_total: movement,
    current_movement_remaining: movement,
  }
}

function checkCombatOutcome(combat: CombatState): { winner: 'players' | 'enemies' | null; playersAlive: number; enemiesAlive: number } {
  let playersAlive = 0
  let enemiesAlive = 0

  for (const entry of combat.initiative_order) {
    if (entry.hp <= 0) {
      continue
    }
    if (isEnemyEntityId(entry.id)) {
      enemiesAlive += 1
    } else {
      playersAlive += 1
    }
  }

  if (playersAlive > 0 && enemiesAlive > 0) {
    return { winner: null, playersAlive, enemiesAlive }
  }
  if (playersAlive > 0 && enemiesAlive === 0) {
    return { winner: 'players', playersAlive, enemiesAlive }
  }
  if (playersAlive === 0 && enemiesAlive > 0) {
    return { winner: 'enemies', playersAlive, enemiesAlive }
  }
  return { winner: null, playersAlive, enemiesAlive }
}

function applyEnemyAutoTurn(combat: CombatState, snapshot: SnapshotState): { combat: CombatState; snapshot: SnapshotState; message: string } {
  const current = combat.initiative_order[combat.turn_index]
  if (!current || !isEnemyEntityId(current.id) || current.hp <= 0) {
    return { combat, snapshot, message: '' }
  }

  const target = combat.initiative_order.find((entry) => !isEnemyEntityId(entry.id) && entry.hp > 0)
  if (!target) {
    return { combat, snapshot, message: `${current.name} scans for targets.` }
  }

  const attackRoll = randomInt(1, 20)
  const damage = randomInt(2, 7)
  const hit = attackRoll >= 10

  if (!hit) {
    return {
      combat,
      snapshot,
      message: `${current.name} attacks ${target.name} but misses.`,
    }
  }

  const nextOrder = combat.initiative_order.map((entry) => {
    if (entry.id !== target.id) {
      return entry
    }
    const nextHp = Math.max(0, Number(entry.hp) - damage)
    return {
      ...entry,
      hp: nextHp,
    }
  })

  const nextCharacters: Record<string, Record<string, unknown>> = {
    ...(snapshot.characters ?? {}),
  }
  const targetCharacter = nextCharacters[target.id]
  if (targetCharacter) {
    nextCharacters[target.id] = {
      ...targetCharacter,
      hp: Math.max(0, Number(targetCharacter.hp ?? target.hp) - damage),
      is_alive: Math.max(0, Number(targetCharacter.hp ?? target.hp) - damage) > 0,
    }
  }

  const dropped = nextOrder.find((entry) => entry.id === target.id)?.hp === 0
  const message = dropped
    ? `${current.name} hits ${target.name} for ${damage} damage. ${target.name} falls unconscious.`
    : `${current.name} hits ${target.name} for ${damage} damage.`

  return {
    combat: {
      ...combat,
      initiative_order: nextOrder,
    },
    snapshot: {
      ...snapshot,
      characters: nextCharacters,
    },
    message,
  }
}

function advanceCombatState(
  snapshot: SnapshotState,
  actorCharacterId: string | null,
  autoResolveEnemyTurn: boolean,
): { nextSnapshot: SnapshotState; combat: CombatState | null; messages: string[]; ended: boolean; endReason?: string } {
  const combat = normalizeCombat(snapshot.combat)
  if (!combat || !combat.is_active) {
    throw new Error('Combat is not currently active.')
  }

  const current = combat.initiative_order[combat.turn_index]
  if (!current) {
    throw new Error('Combat turn state is invalid.')
  }

  if (!isEnemyEntityId(current.id) && current.id !== actorCharacterId) {
    throw new Error('It is not your turn.')
  }

  const messages: string[] = []
  let workingCombat: CombatState = { ...combat, initiative_order: combat.initiative_order.map((entry) => ({ ...entry })) }
  let workingSnapshot: SnapshotState = { ...snapshot, characters: { ...(snapshot.characters ?? {}) } }

  const stepTurn = () => {
    const previousIndex = workingCombat.turn_index
    const nextIndex = (previousIndex + 1) % workingCombat.initiative_order.length
    const wrapped = nextIndex === 0
    workingCombat = {
      ...workingCombat,
      turn_index: nextIndex,
      round: wrapped ? workingCombat.round + 1 : workingCombat.round,
    }
    workingCombat = setCurrentTurnFields(workingCombat)
  }

  stepTurn()

  if (autoResolveEnemyTurn) {
    let guard = 0
    while (guard < workingCombat.initiative_order.length) {
      guard += 1
      const outcome = checkCombatOutcome(workingCombat)
      if (outcome.winner === 'players') {
        return {
          nextSnapshot: {
            ...workingSnapshot,
            combat: null,
          },
          combat: null,
          messages,
          ended: true,
          endReason: 'The enemies are defeated. Combat ends.',
        }
      }
      if (outcome.winner === 'enemies') {
        return {
          nextSnapshot: {
            ...workingSnapshot,
            combat: null,
          },
          combat: null,
          messages,
          ended: true,
          endReason: 'The party has fallen. Combat ends.',
        }
      }

      const acting = workingCombat.initiative_order[workingCombat.turn_index]
      if (!acting || !isEnemyEntityId(acting.id) || acting.hp <= 0) {
        break
      }

      const enemyResult = applyEnemyAutoTurn(workingCombat, workingSnapshot)
      workingCombat = enemyResult.combat
      workingSnapshot = enemyResult.snapshot
      if (enemyResult.message) {
        messages.push(enemyResult.message)
      }
      stepTurn()
    }
  }

  const postOutcome = checkCombatOutcome(workingCombat)
  if (postOutcome.winner === 'players') {
    return {
      nextSnapshot: {
        ...workingSnapshot,
        combat: null,
      },
      combat: null,
      messages,
      ended: true,
      endReason: 'The enemies are defeated. Combat ends.',
    }
  }
  if (postOutcome.winner === 'enemies') {
    return {
      nextSnapshot: {
        ...workingSnapshot,
        combat: null,
      },
      combat: null,
      messages,
      ended: true,
      endReason: 'The party has fallen. Combat ends.',
    }
  }

  return {
    nextSnapshot: {
      ...workingSnapshot,
      combat: workingCombat,
    },
    combat: workingCombat,
    messages,
    ended: false,
  }
}

function inferEnvironment(content: string, existingEnvironment: string): string {
  const source = `${existingEnvironment} ${content}`.toLowerCase()
  if (source.includes('forest') || source.includes('woods') || source.includes('grove')) {
    return 'forest'
  }
  if (source.includes('crypt') || source.includes('grave') || source.includes('tomb') || source.includes('undead')) {
    return 'crypt'
  }
  if (source.includes('cave') || source.includes('mine') || source.includes('tunnel')) {
    return 'cave'
  }
  return 'dungeon'
}

function buildProceduralTiles(environment: string, width: number, height: number): Array<Record<string, unknown>> {
  const tiles: Array<Record<string, unknown>> = []

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (edge) {
        tiles.push({ x, y, type: 'wall' })
        continue
      }

      let type = 'floor'
      const roll = randomInt(1, 100)

      if (environment === 'forest') {
        if (roll <= 12) type = 'rubble'
        else if (roll <= 20) type = 'water'
      } else if (environment === 'crypt') {
        if (roll <= 15) type = 'pillar'
        else if (roll <= 22) type = 'pit'
      } else if (environment === 'cave') {
        if (roll <= 18) type = 'rubble'
        else if (roll <= 28) type = 'water'
      } else {
        if (roll <= 14) type = 'rubble'
        else if (roll <= 20) type = 'pillar'
      }

      tiles.push({ x, y, type })
    }
  }

  return tiles
}

function shouldStartCombat(content: string, snapshot: SnapshotState): boolean {
  const active = Boolean((snapshot.combat as { is_active?: boolean } | null)?.is_active)
  if (active) {
    return false
  }
  const trigger = /(attack|strike|fight|combat|initiative|battle|ambush|draw my|swing|shoot|charge)/i
  return trigger.test(content)
}

function getMapEntities(map: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!map || !Array.isArray(map.entities)) {
    return []
  }
  return map.entities.filter((entity): entity is Record<string, unknown> => typeof entity === 'object' && entity !== null)
}

function tileBlocksMovement(tile: Record<string, unknown> | null | undefined): boolean {
  if (!tile) {
    return false
  }
  const type = String(tile.type ?? '')
  if (type === 'wall' || type === 'pit' || type === 'pillar' || type === 'rubble') {
    return true
  }
  if (type === 'door') {
    return String(tile.state ?? '').toLowerCase() === 'closed'
  }
  return false
}

function mapDestinationBlocked(
  map: Record<string, unknown>,
  x: number,
  y: number,
  movingEntityId: string,
): { blocked: boolean; reason?: string } {
  const tiles = Array.isArray(map.tiles) ? (map.tiles as Array<Record<string, unknown>>) : []
  const entities = getMapEntities(map)

  const tile = tiles.find((row) => Number(row.x) === x && Number(row.y) === y)
  if (tileBlocksMovement(tile)) {
    return { blocked: true, reason: 'That destination is blocked.' }
  }

  const occupant = entities.find((entity) => {
    if (String(entity.id ?? '') === movingEntityId) {
      return false
    }
    if (Number(entity.x) !== x || Number(entity.y) !== y) {
      return false
    }
    return entity.blocks_movement !== false
  })

  if (occupant) {
    return { blocked: true, reason: 'That space is occupied.' }
  }

  return { blocked: false }
}

function ensureMapForSnapshot(snapshot: SnapshotState): Record<string, unknown> {
  const existingMap = snapshot.map && typeof snapshot.map === 'object' ? { ...snapshot.map } : {
    width: 20,
    height: 14,
    tiles: [],
    entities: [],
    metadata: {
      environment: 'dungeon',
      grid_size: 5,
      grid_units: 'ft',
    },
  }

  const mapWidth = Number(existingMap.width ?? 20)
  const mapHeight = Number(existingMap.height ?? 14)
  const metadata = typeof existingMap.metadata === 'object' && existingMap.metadata !== null
    ? existingMap.metadata as Record<string, unknown>
    : { environment: 'dungeon', grid_size: 5, grid_units: 'ft' }
  const environment = typeof metadata.environment === 'string' ? metadata.environment : 'dungeon'
  const existingEntities = getMapEntities(existingMap)
  const nextEntities = [...existingEntities]

  const characters = snapshot.characters ?? {}
  const existingPcEntityIds = new Set(
    nextEntities
      .filter((entity) => entity.type === 'pc')
      .map((entity) => String(entity.id ?? '')),
  )

  const characterEntries = Object.entries(characters)
  let pcOffset = 0
  for (const [characterKey, rawCharacter] of characterEntries) {
    const character = (rawCharacter ?? {}) as Record<string, unknown>
    const charId = typeof character.id === 'string' && character.id ? character.id : characterKey
    const charName = typeof character.name === 'string' && character.name ? character.name : 'Adventurer'
    const race = typeof character.race === 'string' ? character.race : 'Human'
    const charClass = typeof character.class === 'string' ? character.class : 'Fighter'
    const chosenSprite = typeof character.sprite_id === 'string' ? character.sprite_id : ''
    const spriteId = pickCharacterSpriteId(race, charClass, chosenSprite)

    if (existingPcEntityIds.has(charId)) {
      const entityIndex = nextEntities.findIndex((entity) => String(entity.id ?? '') === charId)
      if (entityIndex >= 0) {
        nextEntities[entityIndex] = {
          ...nextEntities[entityIndex],
          name: charName,
          type: 'pc',
          sprite: spriteId,
          visible: true,
        }
      }
      pcOffset += 1
      continue
    }

    const x = Math.min(Math.max(1, 2 + (pcOffset % 3)), Math.max(1, mapWidth - 2))
    const y = Math.min(Math.max(1, 2 + Math.floor(pcOffset / 3)), Math.max(1, mapHeight - 2))
    pcOffset += 1

    nextEntities.push({
      id: charId,
      name: charName,
      x,
      y,
      type: 'pc',
      sprite: spriteId,
      visible: true,
    })
  }

  return {
    ...existingMap,
    width: mapWidth,
    height: mapHeight,
    tiles: Array.isArray(existingMap.tiles) && existingMap.tiles.length > 0
      ? existingMap.tiles
      : buildProceduralTiles(environment, mapWidth, mapHeight),
    entities: nextEntities,
    metadata,
  }
}

function buildMockEncounter(snapshot: SnapshotState, content: string): { nextSnapshot: SnapshotState; combat: Record<string, unknown>; intro: string } {
  const map = ensureMapForSnapshot(snapshot)
  const metadata = (map.metadata as Record<string, unknown> | undefined) ?? {}
  const environment = inferEnvironment(content, String(metadata.environment ?? 'dungeon'))
  const width = Number(map.width ?? 20)
  const height = Number(map.height ?? 14)

  const enemyPool = ENEMY_SPRITES_BY_THEME[environment] ?? ENEMY_SPRITES_BY_THEME.dungeon
  const propPool = PROP_SPRITES_BY_THEME[environment] ?? PROP_SPRITES_BY_THEME.dungeon
  const enemyCount = randomInt(1, 5)
  const propCount = randomInt(2, 4)

  const baseEntities = getMapEntities(map).filter((entity) => entity.type === 'pc')
  const enemyEntities: Array<Record<string, unknown>> = []
  const propEntities: Array<Record<string, unknown>> = []

  for (let i = 0; i < enemyCount; i += 1) {
    const enemy = enemyPool[randomInt(0, enemyPool.length - 1)]
    const enemyId = `enemy_${Date.now()}_${i}`
    const x = Math.max(1, Math.min(width - 2, width - 3 - (i % 3)))
    const y = Math.max(1, Math.min(height - 2, 2 + Math.floor(i / 3) * 2))
    enemyEntities.push({
      id: enemyId,
      name: enemy.name,
      x,
      y,
      type: 'enemy',
      sprite: enemy.id,
      visible: true,
      hp: enemy.hp,
      max_hp: enemy.hp,
    })
  }

  for (let i = 0; i < propCount; i += 1) {
    const prop = propPool[randomInt(0, propPool.length - 1)]
    const propId = `prop_${Date.now()}_${i}`
    const x = randomInt(2, Math.max(2, width - 3))
    const y = randomInt(2, Math.max(2, height - 3))
    propEntities.push({
      id: propId,
      name: prop.name,
      x,
      y,
      type: 'object',
      sprite: prop.id,
      visible: true,
    })
  }

  const characters = snapshot.characters ?? {}
  const initiativeOrder: Array<Record<string, unknown>> = []
  for (const entity of baseEntities) {
    const entityId = String(entity.id ?? '')
    const character = (characters[entityId] ?? {}) as Record<string, unknown>
    const hp = Number(character.hp ?? character.max_hp ?? 10)
    const maxHp = Number(character.max_hp ?? hp)
    initiativeOrder.push({
      id: entityId,
      name: String(entity.name ?? character.name ?? 'Adventurer'),
      initiative: randomInt(8, 20),
      hp,
      max_hp: maxHp,
      movement_remaining: Number(character.speed ?? 30),
    })
  }

  for (const enemyEntity of enemyEntities) {
    initiativeOrder.push({
      id: String(enemyEntity.id),
      name: String(enemyEntity.name),
      initiative: randomInt(6, 18),
      hp: Number(enemyEntity.hp ?? 10),
      max_hp: Number(enemyEntity.max_hp ?? 10),
      movement_remaining: 30,
    })
  }

  initiativeOrder.sort((a, b) => Number(b.initiative ?? 0) - Number(a.initiative ?? 0))
  const firstTurn = initiativeOrder[0]
  const movementTotal = Number(firstTurn?.movement_remaining ?? 30)

  const combat = {
    is_active: true,
    round: 1,
    turn_index: 0,
    current_turn: String(firstTurn?.id ?? ''),
    current_movement_total: movementTotal,
    current_movement_remaining: movementTotal,
    initiative_order: initiativeOrder,
  }

  const nextSnapshot: SnapshotState = {
    ...snapshot,
    map: {
      ...map,
      tiles: buildProceduralTiles(environment, width, height),
      entities: [...baseEntities, ...propEntities, ...enemyEntities],
      metadata: {
        ...metadata,
        environment,
        encounter_type: 'ambush',
      },
    },
    combat,
  }

  const intro = `Combat erupts in the ${environment}. ${enemyCount} foe${enemyCount === 1 ? '' : 's'} close in from the shadows.`
  return { nextSnapshot, combat, intro }
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

type InventoryItem = {
  id: string
  name: string
  category: 'weapon' | 'armor' | 'shield' | 'tool' | 'gear' | 'ammunition'
  subcategory: string
  cost_gp: number
  weight_lb: number
  description: string
  damage: string | null
  damage_type: string | null
  properties: string[]
  ac_base: number | null
  dex_mod: boolean
  max_dex: number | null
  str_req: number | null
  stealth_disadvantage: boolean
  equipped: boolean
  quantity: number
  notes: string
}

function makeItem(
  id: string,
  name: string,
  category: InventoryItem['category'],
  subcategory: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id,
    name,
    category,
    subcategory,
    cost_gp: 0,
    weight_lb: 0,
    description: '',
    damage: null,
    damage_type: null,
    properties: [],
    ac_base: null,
    dex_mod: false,
    max_dex: null,
    str_req: null,
    stealth_disadvantage: false,
    equipped: false,
    quantity: 1,
    notes: '',
    ...overrides,
  }
}

function buildStarterInventory(charId: string, classKey: string): InventoryItem[] {
  const item = (
    slot: string,
    name: string,
    category: InventoryItem['category'],
    subcategory: string,
    overrides: Partial<InventoryItem> = {},
  ) => makeItem(`${charId}_${slot}`, name, category, subcategory, overrides)

  if (classKey === 'barbarian') {
    return [
      item('weapon_main', 'Greataxe', 'weapon', 'martial_melee', { damage: '1d12', damage_type: 'slashing', properties: ['heavy', 'two-handed'], equipped: true, weight_lb: 7, cost_gp: 30 }),
      item('ammo_javelin', 'Javelin', 'weapon', 'simple_melee', { damage: '1d6', damage_type: 'piercing', properties: ['thrown(30/120)'], quantity: 4, weight_lb: 2, cost_gp: 1 }),
      item('armor_hide', 'Hide Armor', 'armor', 'medium', { ac_base: 12, dex_mod: true, max_dex: 2, weight_lb: 12, cost_gp: 10 }),
    ]
  }

  if (classKey === 'fighter') {
    return [
      item('weapon_main', 'Longsword', 'weapon', 'martial_melee', { damage: '1d8', damage_type: 'slashing', properties: ['versatile(1d10)'], equipped: true, weight_lb: 3, cost_gp: 15 }),
      item('armor_main', 'Chain Mail', 'armor', 'heavy', { ac_base: 16, dex_mod: false, str_req: 13, stealth_disadvantage: true, equipped: true, weight_lb: 55, cost_gp: 75 }),
      item('shield_main', 'Shield', 'shield', 'shield', { equipped: true, weight_lb: 6, cost_gp: 10, notes: '+2 AC while equipped' }),
    ]
  }

  if (classKey === 'paladin') {
    return [
      item('weapon_main', 'Longsword', 'weapon', 'martial_melee', { damage: '1d8', damage_type: 'slashing', properties: ['versatile(1d10)'], equipped: true, weight_lb: 3, cost_gp: 15 }),
      item('armor_main', 'Chain Mail', 'armor', 'heavy', { ac_base: 16, dex_mod: false, str_req: 13, stealth_disadvantage: true, equipped: true, weight_lb: 55, cost_gp: 75 }),
      item('shield_main', 'Shield', 'shield', 'shield', { equipped: true, weight_lb: 6, cost_gp: 10, notes: '+2 AC while equipped' }),
      item('ammo_javelin', 'Javelin', 'weapon', 'simple_melee', { damage: '1d6', damage_type: 'piercing', properties: ['thrown(30/120)'], quantity: 3, weight_lb: 2, cost_gp: 1 }),
    ]
  }

  if (classKey === 'ranger') {
    return [
      item('weapon_main', 'Longbow', 'weapon', 'martial_ranged', { damage: '1d8', damage_type: 'piercing', properties: ['ammunition', 'heavy', 'range(150/600)', 'two-handed'], equipped: true, weight_lb: 2, cost_gp: 50 }),
      item('ammo_arrows', 'Arrows', 'ammunition', 'arrows', { quantity: 20, weight_lb: 1, cost_gp: 1 }),
      item('weapon_backup', 'Shortsword', 'weapon', 'martial_melee', { damage: '1d6', damage_type: 'piercing', properties: ['finesse', 'light'], weight_lb: 2, cost_gp: 10 }),
      item('armor_main', 'Leather Armor', 'armor', 'light', { ac_base: 11, dex_mod: true, equipped: true, weight_lb: 10, cost_gp: 10 }),
    ]
  }

  if (classKey === 'rogue') {
    return [
      item('weapon_main', 'Shortsword', 'weapon', 'martial_melee', { damage: '1d6', damage_type: 'piercing', properties: ['finesse', 'light'], equipped: true, weight_lb: 2, cost_gp: 10 }),
      item('weapon_ranged', 'Shortbow', 'weapon', 'martial_ranged', { damage: '1d6', damage_type: 'piercing', properties: ['ammunition', 'range(80/320)', 'two-handed'], weight_lb: 2, cost_gp: 25 }),
      item('ammo_arrows', 'Arrows', 'ammunition', 'arrows', { quantity: 20, weight_lb: 1, cost_gp: 1 }),
      item('armor_main', 'Leather Armor', 'armor', 'light', { ac_base: 11, dex_mod: true, equipped: true, weight_lb: 10, cost_gp: 10 }),
      item('tool_thieves', 'Thieves\' Tools', 'tool', 'thieves_tools', { weight_lb: 1, cost_gp: 25 }),
    ]
  }

  if (classKey === 'monk') {
    return [
      item('weapon_main', 'Quarterstaff', 'weapon', 'simple_melee', { damage: '1d6', damage_type: 'bludgeoning', properties: ['versatile(1d8)'], equipped: true, weight_lb: 4, cost_gp: 0.2 }),
      item('ammo_darts', 'Dart', 'weapon', 'simple_ranged', { damage: '1d4', damage_type: 'piercing', properties: ['finesse', 'thrown(20/60)'], quantity: 10, weight_lb: 0.25, cost_gp: 0.05 }),
      item('gear_pack', 'Explorer\'s Pack', 'gear', 'pack', { weight_lb: 59, cost_gp: 10 }),
    ]
  }

  if (classKey === 'cleric') {
    return [
      item('weapon_main', 'Mace', 'weapon', 'simple_melee', { damage: '1d6', damage_type: 'bludgeoning', equipped: true, weight_lb: 4, cost_gp: 5 }),
      item('armor_main', 'Scale Mail', 'armor', 'medium', { ac_base: 14, dex_mod: true, max_dex: 2, stealth_disadvantage: true, equipped: true, weight_lb: 45, cost_gp: 50 }),
      item('shield_main', 'Shield', 'shield', 'shield', { equipped: true, weight_lb: 6, cost_gp: 10, notes: '+2 AC while equipped' }),
      item('focus_holy', 'Holy Symbol', 'tool', 'holy_symbol', { weight_lb: 1, cost_gp: 5 }),
    ]
  }

  if (classKey === 'druid') {
    return [
      item('weapon_main', 'Scimitar', 'weapon', 'martial_melee', { damage: '1d6', damage_type: 'slashing', properties: ['finesse', 'light'], equipped: true, weight_lb: 3, cost_gp: 25 }),
      item('armor_main', 'Leather Armor', 'armor', 'light', { ac_base: 11, dex_mod: true, equipped: true, weight_lb: 10, cost_gp: 10 }),
      item('focus_druid', 'Druidic Focus', 'tool', 'focus', { weight_lb: 1, cost_gp: 1 }),
    ]
  }

  if (classKey === 'bard') {
    return [
      item('weapon_main', 'Rapier', 'weapon', 'martial_melee', { damage: '1d8', damage_type: 'piercing', properties: ['finesse'], equipped: true, weight_lb: 2, cost_gp: 25 }),
      item('armor_main', 'Leather Armor', 'armor', 'light', { ac_base: 11, dex_mod: true, equipped: true, weight_lb: 10, cost_gp: 10 }),
      item('tool_lute', 'Lute', 'tool', 'musical_instrument', { weight_lb: 2, cost_gp: 35 }),
    ]
  }

  if (classKey === 'sorcerer') {
    return [
      item('weapon_main', 'Light Crossbow', 'weapon', 'simple_ranged', { damage: '1d8', damage_type: 'piercing', properties: ['ammunition', 'loading', 'range(80/320)', 'two-handed'], equipped: true, weight_lb: 5, cost_gp: 25 }),
      item('ammo_bolts', 'Bolts', 'ammunition', 'bolts', { quantity: 20, weight_lb: 1.5, cost_gp: 1 }),
      item('weapon_backup', 'Dagger', 'weapon', 'simple_melee', { damage: '1d4', damage_type: 'piercing', properties: ['finesse', 'light', 'thrown(20/60)'], weight_lb: 1, cost_gp: 2 }),
      item('focus_arcane', 'Arcane Focus', 'tool', 'focus', { weight_lb: 1, cost_gp: 10 }),
    ]
  }

  if (classKey === 'warlock') {
    return [
      item('weapon_main', 'Light Crossbow', 'weapon', 'simple_ranged', { damage: '1d8', damage_type: 'piercing', properties: ['ammunition', 'loading', 'range(80/320)', 'two-handed'], equipped: true, weight_lb: 5, cost_gp: 25 }),
      item('ammo_bolts', 'Bolts', 'ammunition', 'bolts', { quantity: 20, weight_lb: 1.5, cost_gp: 1 }),
      item('weapon_backup', 'Dagger', 'weapon', 'simple_melee', { damage: '1d4', damage_type: 'piercing', properties: ['finesse', 'light', 'thrown(20/60)'], weight_lb: 1, cost_gp: 2 }),
      item('focus_arcane', 'Arcane Focus', 'tool', 'focus', { weight_lb: 1, cost_gp: 10 }),
    ]
  }

  if (classKey === 'wizard') {
    return [
      item('weapon_main', 'Quarterstaff', 'weapon', 'simple_melee', { damage: '1d6', damage_type: 'bludgeoning', properties: ['versatile(1d8)'], equipped: true, weight_lb: 4, cost_gp: 0.2 }),
      item('tool_spellbook', 'Spellbook', 'tool', 'spellbook', { weight_lb: 3, cost_gp: 50 }),
      item('focus_arcane', 'Arcane Focus', 'tool', 'focus', { weight_lb: 1, cost_gp: 10 }),
    ]
  }

  return [
    item('weapon_main', 'Dagger', 'weapon', 'simple_melee', { damage: '1d4', damage_type: 'piercing', properties: ['finesse', 'light', 'thrown(20/60)'], equipped: true, weight_lb: 1, cost_gp: 2 }),
    item('armor_main', 'Leather Armor', 'armor', 'light', { ac_base: 11, dex_mod: true, equipped: true, weight_lb: 10, cost_gp: 10 }),
  ]
}

function buildCharacter(input: {
  charId: string
  playerId: string
  spriteId?: string
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
    sprite_id: input.spriteId ?? '',
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
    inventory: buildStarterInventory(input.charId, classKey),
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
  const requestedSpriteId = typeof body.sprite_id === 'string' ? body.sprite_id.trim() : ''
  const spriteId = pickCharacterSpriteId(race, charClass, requestedSpriteId)

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  const { version, snapshot } = await loadSnapshot(sessionId)

  const charId = `pc_${playerId}`
  const character = buildCharacter({
    charId,
    playerId,
    spriteId,
    name,
    race,
    charClass,
    abilities,
    knownSpells,
    preparedSpells,
  })

  const nextSnapshotBase: SnapshotState = {
    ...snapshot,
    characters: {
      ...(snapshot.characters ?? {}),
      [charId]: character,
    },
  }

  const nextSnapshot: SnapshotState = {
    ...nextSnapshotBase,
    map: ensureMapForSnapshot(nextSnapshotBase),
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
  const { version, snapshot } = await loadSnapshot(sessionId)

  const mockModeEnabled = isMockModeEnabled(body)
  const startCombat = mockModeEnabled && shouldStartCombat(content, snapshot)

  let nextSnapshot = snapshot
  let combatPayload: Record<string, unknown> | null = null
  let narrative = `The DM considers your action: "${content}"`
  let combatAdvanceMessage: string | null = null

  if (startCombat) {
    const encounter = buildMockEncounter(snapshot, content)
    nextSnapshot = encounter.nextSnapshot
    combatPayload = encounter.combat
    narrative = encounter.intro
    await saveSnapshot(sessionId, version, nextSnapshot)
  } else if (/\bend\s*(my\s*)?turn\b/i.test(content) && snapshot.combat) {
    const advanced = advanceCombatState(snapshot, member.characterId, true)
    nextSnapshot = advanced.nextSnapshot
    combatPayload = advanced.combat
    combatAdvanceMessage = advanced.ended
      ? (advanced.endReason ?? 'Combat ends.')
      : (advanced.messages.join(' ') || `${advanced.combat?.initiative_order[advanced.combat?.turn_index ?? 0]?.name ?? 'Next combatant'} takes the next turn.`)
    await saveSnapshot(sessionId, version, nextSnapshot)
  }

  await publishEvent(sessionId, 'player_message', {
    player_id: playerId,
    player_name: member.playerName,
    content,
  }, playerId)

  if (startCombat && combatPayload) {
    await publishEvent(sessionId, 'combat_start', {
      combat: combatPayload,
    }, playerId)
    await publishEvent(sessionId, 'state_sync', {
      state: nextSnapshot,
    }, playerId)
  }

  if (combatAdvanceMessage !== null) {
    if (nextSnapshot.combat) {
      await publishEvent(sessionId, 'combat_update', {
        action: 'next_turn',
        combat: nextSnapshot.combat as Record<string, unknown>,
        data: { message: combatAdvanceMessage },
      }, playerId)
    } else {
      await publishEvent(sessionId, 'combat_update', {
        action: 'end_combat',
        data: { message: combatAdvanceMessage },
      }, playerId)
    }
    await publishEvent(sessionId, 'state_sync', {
      state: nextSnapshot,
    }, playerId)
  }

  await publishEvent(sessionId, 'dm_narrative', {
    content: narrative,
  }, null)

  return { ok: true, combat_started: startCombat, combat_advanced: combatAdvanceMessage !== null }
}

async function actionNextCombatTurn(body: Record<string, unknown>) {
  const roomCode = typeof body.room_code === 'string' ? body.room_code : ''
  const playerId = typeof body.player_id === 'string' ? body.player_id : ''
  if (!roomCode || !playerId) {
    throw new Error('room_code and player_id are required')
  }

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  const { version, snapshot } = await loadSnapshot(sessionId)

  const advanced = advanceCombatState(snapshot, member.characterId, true)
  await saveSnapshot(sessionId, version, advanced.nextSnapshot)

  if (advanced.ended || !advanced.combat) {
    await publishEvent(sessionId, 'combat_update', {
      action: 'end_combat',
      data: {
        message: advanced.endReason ?? 'Combat ends.',
      },
    }, playerId)
  } else {
    const turnName = advanced.combat.initiative_order[advanced.combat.turn_index]?.name ?? 'Next combatant'
    const message = advanced.messages.join(' ') || `${turnName} takes the next turn.`
    await publishEvent(sessionId, 'combat_update', {
      action: 'next_turn',
      combat: advanced.combat as Record<string, unknown>,
      data: {
        message,
      },
    }, playerId)
  }

  await publishEvent(sessionId, 'state_sync', { state: advanced.nextSnapshot }, playerId)

  return {
    ok: true,
    combat_active: Boolean(advanced.nextSnapshot.combat),
    round: advanced.combat?.round ?? null,
    turn_index: advanced.combat?.turn_index ?? null,
  }
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

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error('Destination coordinates must be whole numbers')
  }

  const { sessionId } = await resolveSession(roomCode)
  const member = await resolveMember(sessionId, playerId)
  if (!member.characterId || member.characterId !== characterId) {
    throw new Error('You can only move your own character token.')
  }

  const { version, snapshot } = await loadSnapshot(sessionId)
  const map = ensureMapForSnapshot(snapshot)
  const width = Number(map.width ?? 0)
  const height = Number(map.height ?? 0)

  if (x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error('Destination is out of bounds.')
  }

  const entities = getMapEntities(map)
  const mover = entities.find((entity) => String(entity.id ?? '') === characterId)
  if (!mover) {
    throw new Error('Your token is not currently on the map.')
  }

  const combat = normalizeCombat(snapshot.combat)
  if (combat?.is_active && combat.current_turn && combat.current_turn !== characterId) {
    throw new Error('It is not your turn.')
  }

  const blocked = mapDestinationBlocked(map, x, y, characterId)
  if (blocked.blocked) {
    throw new Error(blocked.reason ?? 'That destination is blocked.')
  }

  const nextEntities = entities.map((entity) => {
    if (String(entity.id ?? '') !== characterId) {
      return entity
    }
    return {
      ...entity,
      x,
      y,
    }
  })

  const nextMap: Record<string, unknown> = {
    ...map,
    entities: nextEntities,
  }
  const nextSnapshot: SnapshotState = {
    ...snapshot,
    map: nextMap,
  }

  await saveSnapshot(sessionId, version, nextSnapshot)

  await publishEvent(sessionId, 'map_change', {
    action: 'move_entity',
    data: {
      moved: characterId,
      to: { x, y },
    },
  }, playerId)

  await publishEvent(sessionId, 'state_sync', { state: nextSnapshot }, playerId)

  return { ok: true, state: nextSnapshot }
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

    if (action === 'next_combat_turn') {
      return Response.json(await actionNextCombatTurn(body), { headers: corsHeaders })
    }

    return Response.json({ error: `Unsupported action: ${action}` }, { status: 400, headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})