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

  return {
    session_id: sessionRow.id as string,
    characters: {},
    map: null,
    combat: null,
    usage: {
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