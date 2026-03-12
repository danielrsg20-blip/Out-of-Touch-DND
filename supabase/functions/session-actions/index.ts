import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

const WORD_LIST = [
  'GOBLIN', 'DRAGON', 'WIZARD', 'SWORD', 'DUNGEON', 'CASTLE', 'TAVERN',
  'KNIGHT', 'ROGUE', 'DWARF', 'ELF', 'ORC', 'TROLL', 'MAGE', 'CLERIC',
  'RANGER', 'BARD', 'PALADIN', 'WARLOCK', 'SORCERER', 'KOBOLD', 'MIMIC',
  'LICH', 'GOLEM', 'WRAITH', 'HYDRA', 'WYVERN', 'BASILISK', 'MANTICORE'
]

const TILE_BASES_BY_ENV: Record<string, { floor: string[]; wall: string[]; water: string[] }> = {
  dungeon: {
    floor: ['stone corridor', 'stone ground', 'mossy stone', 'cracked brick', 'dark stone'],
    wall: ['dark stone', 'black stone', 'stone dark', 'stone darker'],
    water: ['deep water', 'dark water', 'shallow water'],
  },
  forest: {
    floor: ['grass', 'dirt path', 'moss', 'ancient dirt', 'dirt terrain'],
    wall: ['autumn tree', 'dark stone', 'stone ground'],
    water: ['water surface', 'shallow water', 'deep water'],
  },
  cave: {
    floor: ['stone ground', 'dirt ground', 'rough stone', 'mossy stone'],
    wall: ['black stone', 'stone dark', 'dark stone'],
    water: ['water surface', 'deep water', 'shallow water'],
  },
  crypt: {
    floor: ['stone tile', 'dark stone', 'cracked brick', 'mossy stone'],
    wall: ['black stone', 'dark stone', 'stone darker'],
    water: ['dark water', 'deep water', 'shallow water'],
  },
}

const CLUSTER_STRENGTH = 0.6

function sampleFrom<T>(items: T[], fallback: T): T {
  if (!items.length) return fallback
  return items[randomInt(0, items.length - 1)]
}

// Fast integer hash — deterministic per (seed, x, y), used for per-tile independent picks.
function seededHash(seed: number, x: number, y: number): number {
  let h = (((seed | 0) ^ ((x | 0) * 374761393) ^ ((y | 0) * 668265263))) >>> 0
  h ^= h >>> 13
  h = (Math.imul(h, 1274126177)) >>> 0
  h ^= h >>> 16
  return (h >>> 0) / 0x100000000
}

// Smooth bilinear value noise — produces organic spatial clusters ~3 tiles wide.
function seededNoise(seed: number, x: number, y: number): number {
  const GRID = 3
  const gx = Math.floor(x / GRID)
  const gy = Math.floor(y / GRID)
  const fx = (x / GRID) - gx
  const fy = (y / GRID) - gy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const v00 = seededHash(seed, gx,     gy)
  const v10 = seededHash(seed, gx + 1, gy)
  const v01 = seededHash(seed, gx,     gy + 1)
  const v11 = seededHash(seed, gx + 1, gy + 1)
  return v00 * (1 - ux) * (1 - uy) + v10 * ux * (1 - uy) + v01 * (1 - ux) * uy + v11 * ux * uy
}

// Pick one value from a weighted list using a deterministic per-tile hash.
function weightedPick<T>(seed: number, x: number, y: number, items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  const r = seededHash(seed, x, y) * total
  let cumulative = 0
  for (const item of items) {
    cumulative += item.weight
    if (r < cumulative) return item.value
  }
  return items[items.length - 1].value
}

function buildTileVisual(
  environment: string,
  tileType: string,
  mapSeed: number,
  tx: number,
  ty: number,
  dominantFloor: string,
  dominantWall: string,
  dominantWater: string,
): { sprite?: string; variant?: string } {
  const env = TILE_BASES_BY_ENV[environment] ? environment : 'dungeon'
  const bases = TILE_BASES_BY_ENV[env]

  if (tileType === 'floor') {
    // 85% dominant base, 15% secondary for occasional accents
    const baseNoise = seededHash(mapSeed + 10000, tx, ty)
    let base = dominantFloor
    if (baseNoise >= 0.85) {
      const secondaries = bases.floor.filter(b => b !== dominantFloor)
      if (secondaries.length > 0) {
        const idx = Math.floor(seededHash(mapSeed + 20000, tx, ty) * secondaries.length)
        base = secondaries[idx]
      }
    }
    const clusterNoise = seededNoise(mapSeed, tx, ty)
    const wornBias = clusterNoise * CLUSTER_STRENGTH
    const variant = weightedPick(mapSeed + 30000, tx, ty, [
      { value: 'clean',       weight: Math.max(1, 65 - wornBias * 60) },
      { value: 'cracked',     weight: 12 + wornBias * 15 },
      { value: 'mossy',       weight: 8  + wornBias * 10 },
      { value: 'patchy',      weight: 6  + wornBias * 8  },
      { value: 'rubble',      weight: 4  + wornBias * 6  },
      { value: 'grass_creep', weight: 3  + wornBias * 4  },
      { value: 'stone_patch', weight: 2  + wornBias * 3  },
    ])
    return { sprite: `env:${base}`, variant }
  }

  if (tileType === 'wall') {
    const baseNoise = seededHash(mapSeed + 40000, tx, ty)
    let base = dominantWall
    if (baseNoise >= 0.85) {
      const secondaries = bases.wall.filter(b => b !== dominantWall)
      if (secondaries.length > 0) {
        const idx = Math.floor(seededHash(mapSeed + 50000, tx, ty) * secondaries.length)
        base = secondaries[idx]
      }
    }
    const clusterNoise = seededNoise(mapSeed + 1, tx, ty)
    const wornBias = clusterNoise * CLUSTER_STRENGTH
    const variant = weightedPick(mapSeed + 60000, tx, ty, [
      { value: 'smooth',     weight: Math.max(1, 65 - wornBias * 60) },
      { value: 'cracked',    weight: 12 + wornBias * 15 },
      { value: 'worn',       weight: 10 + wornBias * 12 },
      { value: 'dark',       weight: 7  + wornBias * 8  },
      { value: 'weathered',  weight: 4  + wornBias * 6  },
      { value: 'stone_vein', weight: 2  + wornBias * 5  },
    ])
    return { sprite: `env:${base}`, variant }
  }

  if (tileType === 'water') {
    const variant = weightedPick(mapSeed + 70000, tx, ty, [
      { value: 'calm',  weight: 70 },
      { value: 'murky', weight: 15 },
      { value: 'waves', weight: 10 },
      { value: 'algae', weight: 5  },
    ])
    return { sprite: `env:${dominantWater}`, variant }
  }

  if (tileType === 'rubble') {
    return { sprite: 'env:stone rubble' }
  }
  if (tileType === 'pillar') {
    return { sprite: 'env:cracked pillar' }
  }
  return {}
}

// ---------------------------------------------------------------------------
// Layout algorithms — port of Python map_catalog._apply_layout
// ---------------------------------------------------------------------------

function selectLayout(environment: string, seed: number): string {
  const env = environment.toLowerCase()
  if (env === 'cave') return 'cave'
  if (env === 'forest') return 'forest'
  if (env === 'tavern') return 'tavern'
  if (env === 'dungeon' || env === 'crypt') {
    return seededHash(seed, 0, 1) < 0.6 ? 'room_cluster' : 'crossroads'
  }
  return 'crossroads'
}

function applyLayout(layout: string, width: number, height: number, seed: number): string[][] {
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill('floor'))

  if (layout === 'room_cluster') {
    for (let roomIdx = 0; roomIdx < 2; roomIdx += 1) {
      const baseSeed = seed + roomIdx * 1000
      const minDim = 4
      const maxW = Math.max(minDim, Math.floor(width / 2) - 2)
      const maxH = Math.max(minDim, Math.floor(height / 2) - 2)
      const rw = minDim + Math.floor(seededHash(baseSeed, 0, 0) * (maxW - minDim + 1))
      const rh = minDim + Math.floor(seededHash(baseSeed, 1, 0) * (maxH - minDim + 1))
      const maxAnchorX = Math.max(1, width  - rw - 1)
      const maxAnchorY = Math.max(1, height - rh - 1)
      const anchorX = 1 + Math.floor(seededHash(baseSeed, 2, 0) * maxAnchorX)
      const anchorY = 1 + Math.floor(seededHash(baseSeed, 3, 0) * maxAnchorY)

      for (let ry = anchorY; ry < anchorY + rh; ry += 1) {
        for (let rx = anchorX; rx < anchorX + rw; rx += 1) {
          if (ry >= 0 && ry < height && rx >= 0 && rx < width) {
            const onBorder = rx === anchorX || rx === anchorX + rw - 1 || ry === anchorY || ry === anchorY + rh - 1
            grid[ry][rx] = onBorder ? 'wall' : 'floor'
          }
        }
      }

      const doorX = anchorX + Math.floor(rw / 2)
      const doorY = anchorY + rh - 1
      if (doorY >= 0 && doorY < height && doorX >= 0 && doorX < width) {
        grid[doorY][doorX] = 'door'
      }
    }

  } else if (layout === 'crossroads') {
    const midRow = Math.floor(height / 2)
    const midCol = Math.floor(width  / 2)
    for (let ly = 1; ly < height - 1; ly += 1) {
      for (let lx = 1; lx < width - 1; lx += 1) {
        const inCorridor = ly === midRow || ly === midRow + 1 || lx === midCol || lx === midCol + 1
        if (!inCorridor && seededHash(seed, lx, ly) < 0.15) {
          grid[ly][lx] = 'wall'
        }
      }
    }

  } else if (layout === 'cave') {
    for (let ly = 1; ly < height - 1; ly += 1) {
      for (let lx = 1; lx < width - 1; lx += 1) {
        const h1 = seededHash(seed, lx, ly)
        const h2 = seededHash(seed + 1, lx, ly)
        if (h1 < 0.18) grid[ly][lx] = 'wall'
        else if (h2 < 0.05) grid[ly][lx] = 'rubble'
      }
    }

  } else if (layout === 'forest') {
    for (let ly = 1; ly < height - 1; ly += 1) {
      for (let lx = 1; lx < width - 1; lx += 1) {
        const h1 = seededHash(seed, lx, ly)
        const h2 = seededHash(seed + 1, lx, ly)
        if (h2 < 0.05) grid[ly][lx] = 'water'
        else if (h1 < 0.12) grid[ly][lx] = 'pillar'
      }
    }

  } else if (layout === 'tavern') {
    for (let ly = 2; ly < height - 2; ly += 1) {
      for (let lx = 3; lx < width - 2; lx += 1) {
        if ((lx - 3) % 4 === 0 && (ly - 2) % 3 === 0) {
          grid[ly][lx] = 'pillar'
        }
      }
    }
    const doorX = Math.floor(width / 2)
    if (doorX >= 0 && doorX < width) {
      grid[0][doorX] = 'door'
    }
  }

  return grid
}

// ---------------------------------------------------------------------------
// FOV — port of Python map_engine.compute_fov (360-ray raycasting)
// ---------------------------------------------------------------------------

const BLOCKS_SIGHT = new Set(['wall', 'pillar', 'rubble'])

function buildTileTypeMap(tiles: Array<Record<string, unknown>>): Map<string, string> {
  const map = new Map<string, string>()
  for (const tile of tiles) {
    map.set(`${tile.x},${tile.y}`, String(tile.type ?? 'floor'))
  }
  return map
}

function computeFov(
  originX: number,
  originY: number,
  tileTypeMap: Map<string, string>,
  width: number,
  height: number,
  radius = 12,
): Set<string> {
  const visible = new Set<string>()
  visible.add(`${originX},${originY}`)
  const steps = radius * 10
  for (let deg = 0; deg < 360; deg += 1) {
    const rad = (deg * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)
    for (let i = 1; i <= steps; i += 1) {
      const cx = Math.round(originX + dx * i / 10)
      const cy = Math.round(originY + dy * i / 10)
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) break
      const key = `${cx},${cy}`
      visible.add(key)
      if (BLOCKS_SIGHT.has(tileTypeMap.get(key) ?? 'floor')) break
    }
  }
  return visible
}

function computePartyFov(
  entities: Array<Record<string, unknown>>,
  tileTypeMap: Map<string, string>,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const allVisible = new Set<string>()
  for (const entity of entities) {
    if (entity.type !== 'pc') continue
    const ex = Number(entity.x)
    const ey = Number(entity.y)
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue
    const fov = computeFov(ex, ey, tileTypeMap, width, height)
    for (const key of fov) allVisible.add(key)
  }
  return [...allVisible].map((key) => {
    const [x, y] = key.split(',').map(Number)
    return { x, y }
  })
}

// ---------------------------------------------------------------------------

function buildProceduralTiles(environment: string, width: number, height: number): Array<Record<string, unknown>> {
  const tiles: Array<Record<string, unknown>> = []
  const mapSeed = randomInt(0, 999999)
  const envKey = TILE_BASES_BY_ENV[environment] ? environment : 'dungeon'
  const bases = TILE_BASES_BY_ENV[envKey]
  const dominantFloor = sampleFrom(bases.floor, bases.floor[0])
  const dominantWall  = sampleFrom(bases.wall,  bases.wall[0])
  const dominantWater = sampleFrom(bases.water, bases.water[0])

  const layout = selectLayout(environment, mapSeed)
  const typeGrid = applyLayout(layout, width, height, mapSeed)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      const type = edge ? 'wall' : typeGrid[y][x]
      const visual = buildTileVisual(environment, type, mapSeed, x, y, dominantFloor, dominantWall, dominantWater)
      tiles.push({ x, y, type, ...visual })
    }
  }
  return tiles
}

function hydrateTilesWithSprites(environment: string, tilesRaw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(tilesRaw)) {
    return []
  }
  const hydrateBases = TILE_BASES_BY_ENV[environment] ?? TILE_BASES_BY_ENV.dungeon
  return tilesRaw
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((tile) => {
      const tileType = String(tile.type ?? 'floor')
      const hasSprite = typeof tile.sprite === 'string' && tile.sprite.trim().length > 0
      if (hasSprite) {
        return tile
      }
      const visual = buildTileVisual(environment, tileType, 0, Number(tile.x ?? 0), Number(tile.y ?? 0), hydrateBases.floor[0], hydrateBases.wall[0], hydrateBases.water[0])
      return { ...tile, ...visual }
    })
}

function buildInitialSnapshot(): Record<string, unknown> {
  const width = 20
  const height = 14
  const environment = 'dungeon'
  const tiles = buildProceduralTiles(environment, width, height)
  return {
    characters: {},
    map: {
      width,
      height,
      tiles,
      entities: [],
      metadata: {
        map_source: 'generated',
        map_id: 'supabase_mock_init',
        cache_hit: false,
        environment,
        grid_size: 5,
        grid_units: 'ft',
      },
      visible: [],
      revealed: [],
    },
    combat: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
    },
  }
}

function randomId(length = 8): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length)
}

function randomInt(min: number, max: number): number {
  const range = max - min + 1
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return min + (random[0] % range)
}

async function generateUniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const word = WORD_LIST[randomInt(0, WORD_LIST.length - 1)]
    const num = randomInt(10, 99)
    const roomCode = `${word}-${num}`

    const { data, error } = await supabase
      .from('game_sessions')
      .select('id')
      .eq('room_code', roomCode)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to validate room code uniqueness: ${error.message}`)
    }

    if (!data) {
      return roomCode
    }
  }

  throw new Error('Unable to generate unique room code')
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

async function buildSessionPayload(sessionId: string) {
  const { data: sessionRow, error: sessionError } = await supabase
    .from('game_sessions')
    .select('room_code, host_player_id, started')
    .eq('id', sessionId)
    .single()

  if (sessionError || !sessionRow) {
    throw new Error(sessionError?.message ?? 'Session not found')
  }

  const { data: members, error: membersError } = await supabase
    .from('session_members')
    .select('player_id, player_name, character_id')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  if (membersError) {
    throw new Error(membersError.message)
  }

  return {
    id: sessionId,
    room_code: sessionRow.room_code as string,
    host_id: sessionRow.host_player_id as string,
    started: Boolean(sessionRow.started),
    players: (members ?? []).map((m) => ({
      id: m.player_id as string,
      name: m.player_name as string,
      character_id: (m.character_id as string | null) ?? null,
    })),
    characters: {},
  }
}

async function getLatestSnapshot(sessionId: string): Promise<Record<string, unknown> | null> {
  const { data: snapshotRow, error: snapshotError } = await supabase
    .from('session_snapshots')
    .select('snapshot')
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapshotError) {
    throw new Error(snapshotError.message)
  }

  return (snapshotRow?.snapshot as Record<string, unknown> | undefined) ?? null
}

async function ensureSessionSnapshot(sessionId: string): Promise<Record<string, unknown>> {
  const existing = await getLatestSnapshot(sessionId)
  if (existing) {
    return existing
  }

  const starter = buildInitialSnapshot()
  const { error: snapshotError } = await supabase
    .from('session_snapshots')
    .insert({
      session_id: sessionId,
      version: 1,
      snapshot: starter,
    })

  if (snapshotError) {
    throw new Error(`Unable to initialize session map: ${snapshotError.message}`)
  }

  return starter
}

async function createSession(playerName: string) {
  const roomCode = await generateUniqueRoomCode()
  const playerId = randomId(8)

  const { data: sessionInsert, error: sessionInsertError } = await supabase
    .from('game_sessions')
    .insert({
      room_code: roomCode,
      host_player_id: playerId,
      started: false,
    })
    .select('id')
    .single()

  if (sessionInsertError || !sessionInsert) {
    throw new Error(sessionInsertError?.message ?? 'Unable to create session')
  }

  const sessionId = sessionInsert.id as string

  const { error: memberInsertError } = await supabase
    .from('session_members')
    .insert({
      session_id: sessionId,
      player_id: playerId,
      player_name: playerName,
      character_id: null,
    })

  if (memberInsertError) {
    throw new Error(memberInsertError.message)
  }

  const { error: snapshotError } = await supabase
    .from('session_snapshots')
    .insert({
      session_id: sessionId,
      version: 1,
      snapshot: buildInitialSnapshot(),
    })

  if (snapshotError) {
    throw new Error(`Unable to initialize session map: ${snapshotError.message}`)
  }

  await publishEvent(sessionId, 'session_created', {
    room_code: roomCode,
    player_id: playerId,
    player_name: playerName,
  }, playerId)

  return {
    session_id: sessionId,
    room_code: roomCode,
    player_id: playerId,
  }
}

async function joinSession(roomCodeRaw: string, playerName: string) {
  const roomCode = roomCodeRaw.toUpperCase()
  const { data: sessionRow, error: sessionError } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (sessionError) {
    throw new Error(sessionError.message)
  }

  if (!sessionRow) {
    return {
      player_id: '',
      session: { error: 'Session not found' },
    }
  }

  const playerId = randomId(8)
  const sessionId = sessionRow.id as string

  const { error: memberInsertError } = await supabase
    .from('session_members')
    .insert({
      session_id: sessionId,
      player_id: playerId,
      player_name: playerName,
      character_id: null,
    })

  if (memberInsertError) {
    throw new Error(memberInsertError.message)
  }

  const session = await buildSessionPayload(sessionId)
  await ensureSessionSnapshot(sessionId)

  await publishEvent(sessionId, 'player_joined', {
    room_code: roomCode,
    player_id: playerId,
    player_name: playerName,
  }, playerId)

  return {
    session_id: sessionId,
    player_id: playerId,
    session,
  }
}

async function getSession(roomCodeRaw: string) {
  const roomCode = roomCodeRaw.toUpperCase()
  const { data: sessionRow, error: sessionError } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (sessionError) {
    throw new Error(sessionError.message)
  }

  if (!sessionRow) {
    return { error: 'Session not found' }
  }

  const session = await buildSessionPayload(sessionRow.id as string)

  const sessionId = sessionRow.id as string
  const snapshot = await ensureSessionSnapshot(sessionId)
  const map = (snapshot.map as Record<string, unknown> | null) ?? null
  const metadata = map && typeof map.metadata === 'object' && map.metadata !== null
    ? (map.metadata as Record<string, unknown>)
    : {}
  const environment = typeof metadata.environment === 'string' ? metadata.environment : 'dungeon'
  const hydratedMap = map
    ? {
        ...map,
        tiles: hydrateTilesWithSprites(environment, map.tiles),
        metadata: {
          map_source: 'generated',
          cache_hit: false,
          ...metadata,
          environment,
        },
      }
    : null

  return {
    session_id: sessionId,
    characters: (snapshot.characters as Record<string, unknown>) ?? {},
    map: hydratedMap,
    combat: (snapshot.combat as Record<string, unknown> | null) ?? null,
    usage: (snapshot.usage as Record<string, unknown>) ?? {
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
    },
    session,
  }
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

    if (action === 'create_session') {
      const playerName = typeof body.player_name === 'string' ? body.player_name.trim() : ''
      if (!playerName) {
        return Response.json({ error: 'player_name is required' }, { status: 400, headers: corsHeaders })
      }
      return Response.json(await createSession(playerName), { headers: corsHeaders })
    }

    if (action === 'join_session') {
      const playerName = typeof body.player_name === 'string' ? body.player_name.trim() : ''
      const roomCode = typeof body.room_code === 'string' ? body.room_code.trim() : ''
      if (!playerName || !roomCode) {
        return Response.json({ error: 'room_code and player_name are required' }, { status: 400, headers: corsHeaders })
      }
      return Response.json(await joinSession(roomCode, playerName), { headers: corsHeaders })
    }

    if (action === 'get_session') {
      const roomCode = typeof body.room_code === 'string' ? body.room_code.trim() : ''
      if (!roomCode) {
        return Response.json({ error: 'room_code is required' }, { status: 400, headers: corsHeaders })
      }
      return Response.json(await getSession(roomCode), { headers: corsHeaders })
    }

    return Response.json({ error: `Unsupported action: ${action}` }, { status: 400, headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})