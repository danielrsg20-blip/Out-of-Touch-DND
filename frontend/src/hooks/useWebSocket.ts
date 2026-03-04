import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'
import { getSupabaseClient, invokeEdgeFunction } from '../lib/supabaseClient'
import { API_BASE } from '../config/endpoints'
import type { RealtimeChannel } from '@supabase/supabase-js'

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) {
    return {}
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function useWebSocket() {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const { roomCode, sessionId, playerId, setConnected, addPlayer, setPlayers, getSession, mockMode } = useSessionStore()
  const { setMap, updateEntity, addEntity, removeEntity, setCombat, addNarrative, syncState, setLoading } = useGameStore()

  // Local FastAPI mode: fetch initial game state on mount (no Supabase Realtime)
  useEffect(() => {
    if (!roomCode || !playerId) return
    if (getSupabaseClient()) return

    const fetchInitialState = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/session/${roomCode}`)
        if (!res.ok) return
        const payload = await parseJsonBody(res)
        const session = payload.session as { players: Array<{ id: string; name: string; character_id: string | null }> } | undefined
        if (session?.players) {
          setPlayers(session.players)
        }
        syncState(payload as Parameters<typeof syncState>[0])
      } catch {
        // non-critical
      }
    }

    fetchInitialState().catch(() => {})
  }, [roomCode, playerId, setPlayers, syncState])

  useEffect(() => {
    if (!roomCode || !playerId) return

    const supabase = getSupabaseClient()
    if (!supabase) {
      setConnected(false)
      addNarrative('system', 'Supabase is not configured. Realtime disabled.')
      return
    }

    let cancelled = false

    const connect = async () => {
      let effectiveSessionId = sessionId
      if (!effectiveSessionId) {
        try {
          await getSession(roomCode)
          effectiveSessionId = useSessionStore.getState().sessionId
        } catch {
          setConnected(false)
          addNarrative('system', 'Unable to initialize realtime session state.')
          return
        }
      }

      if (!effectiveSessionId || cancelled) {
        return
      }

      const channel = supabase
        .channel(`game-events:${effectiveSessionId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'game_events',
            filter: `session_id=eq.${effectiveSessionId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>
            handleMessage({
              type: row.event_type as string,
              ...(row.payload as Record<string, unknown>),
            })
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnected(true)
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnected(false)
            setLoading(false)
          }
        })

      channelRef.current = channel
    }

    connect()

    return () => {
      cancelled = true
      setConnected(false)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      channelRef.current = null
    }
  }, [roomCode, sessionId, playerId, setConnected, addNarrative, setLoading, getSession])

  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string

    switch (type) {
      case 'connected':
        if (msg.session) {
          const session = msg.session as { players: Array<{ id: string; name: string; character_id: string | null }> }
          setPlayers(session.players)
        }
        if (msg.game_state) {
          syncState(msg.game_state as Parameters<typeof syncState>[0])
        }
        break

      case 'player_connected':
        addPlayer(msg.player as { id: string; name: string; character_id: string | null })
        addNarrative('system', `${(msg.player as { name: string }).name} connected.`)
        break

      case 'player_joined':
        if (msg.player_id && msg.player_name) {
          addPlayer({ id: msg.player_id as string, name: msg.player_name as string, character_id: null })
          addNarrative('system', `${msg.player_name} joined the session.`)
        }
        break

      case 'player_disconnected':
        addNarrative('system', `${msg.player_name} disconnected.`)
        break

      case 'player_message':
        addNarrative('player', msg.content as string, msg.player_name as string)
        break

      case 'dm_narrative':
        addNarrative('dm', msg.content as string, 'DM')
        setLoading(false)
        break

      case 'map_update':
        setMap(msg.map as Parameters<typeof setMap>[0])
        break

      case 'map_change': {
        const action = msg.action as string
        const data = (msg.data as Record<string, unknown>) || {}
        if (action === 'move_entity') {
          const to = data.to as { x: number; y: number } | undefined
          const moved = data.moved as string | undefined
          if (to && moved) {
            updateEntity(moved, to.x, to.y)
          }
        } else if (action === 'place_entity') {
          const placed = data.placed as Parameters<typeof addEntity>[0] | undefined
          if (placed) {
            addEntity(placed)
          }
        } else if (action === 'remove_entity') {
          const entityId = data.entity_id as string | undefined
          if (entityId) {
            removeEntity(entityId)
          }
        } else if (action === 'update_tile') {
          addNarrative('system', 'The environment shifts on the map.')
        }
        break
      }

      case 'combat_start':
        setCombat(msg.combat as Parameters<typeof setCombat>[0])
        addNarrative('system', 'Combat has begun! Roll for initiative!')
        break

      case 'combat_update':
        {
        const action = typeof msg.action === 'string' ? msg.action : ''
        const previousCombat = useGameStore.getState().combat
        const nextCombat = msg.combat as Parameters<typeof setCombat>[0] | undefined

        if (msg.combat) {
          setCombat(nextCombat ?? null)
        }

        const data = (msg.data as Record<string, unknown> | undefined) ?? {}
        const message = typeof data.message === 'string' ? data.message : ''

        if (action === 'next_turn') {
          const prevRound = Number(previousCombat?.round ?? 0)
          const nextRound = Number(nextCombat?.round ?? prevRound)
          if (nextRound > prevRound) {
            addNarrative('system', `Round ${nextRound} begins.`)
          }

          if (message) {
            addNarrative('system', message)
          } else {
            const turnName = nextCombat?.initiative_order?.[nextCombat.turn_index]?.name
            if (turnName) {
              addNarrative('system', `${turnName}'s turn.`)
            }
          }
        } else if (action === 'end_combat') {
          setCombat(null)
          addNarrative('system', message || 'Combat ends.')
        } else if (message) {
          addNarrative('system', message)
        }
        break
        }

      case 'dice_result': {
        const data = msg.data as Record<string, unknown>
        const tool = msg.tool as string
        let text = ''
        if (tool === 'roll_dice') {
          text = `Rolled ${data.notation}: [${(data.rolls as number[]).join(', ')}] ${data.modifier ? (data.modifier as number > 0 ? '+' : '') + data.modifier : ''} = ${data.total}`
        } else if (tool === 'check_ability') {
          text = data.message as string
        } else if (tool === 'attack') {
          const hits = data.hits ? 'Hit!' : 'Miss!'
          text = `${data.attacker} attacks ${data.target}: ${data.attack_roll} vs AC ${data.target_ac} - ${hits}`
          if (data.hits && data.damage) text += ` (${data.damage} damage)`
          if (data.critical) text += ' CRITICAL HIT!'
        } else if (tool === 'apply_damage') {
          text = `${data.target} takes ${data.damage_taken} ${data.damage_type || ''} damage. HP: ${data.current_hp}`
        } else if (tool === 'heal_character') {
          text = `${data.target} heals for ${data.healed}. HP: ${data.current_hp}`
        } else if (tool === 'cast_spell') {
          const slotLevel = Number(data.slot_level || 0)
          const slotText = slotLevel > 0 ? `using level ${slotLevel} slot` : 'as a cantrip'
          text = `${data.character} casts ${data.spell} ${slotText}.`
        }
        if (text) addNarrative('dice', text)
        break
      }

      case 'state_sync':
        if (msg.state) {
          syncState(msg.state as Parameters<typeof syncState>[0])
        }
        break

      case 'character_created':
        addNarrative('system', `Character created: ${(msg.character as { name: string }).name}`)
        break

      case 'error':
        addNarrative('system', `Error: ${msg.content}`)
        setLoading(false)
        break
    }
  }, [addNarrative, addEntity, addPlayer, removeEntity, setCombat, setLoading, setMap, setPlayers, syncState, updateEntity])

  const sendAction = useCallback((content: string) => {
    if (!roomCode || !playerId) {
      addNarrative('system', 'Missing room or player identity. Unable to send action.')
      setLoading(false)
      return
    }

    const supabase = getSupabaseClient()
    setLoading(true)

    const fallbackToLocal = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_code: roomCode,
            player_id: playerId,
            content,
          }),
        })
        const payload = await parseJsonBody(res)
        if (!res.ok || typeof payload.error === 'string') {
          throw new Error(typeof payload.error === 'string' ? payload.error : `Local action failed (${res.status})`)
        }

        const playerName = useSessionStore.getState().players.find((p) => p.id === playerId)?.name ?? 'You'
        addNarrative('player', content, playerName)

        if (Array.isArray(payload.narratives)) {
          for (const line of payload.narratives) {
            if (typeof line === 'string' && line.trim()) {
              addNarrative('dm', line, 'DM')
            }
          }
        }

        if (Array.isArray(payload.dice_results)) {
          for (const row of payload.dice_results) {
            const typed = row as Record<string, unknown>
            handleMessage({
              type: 'dice_result',
              tool: typed.tool,
              data: typed.data,
            })
          }
        }

        if (payload.state) {
          syncState(payload.state as Parameters<typeof syncState>[0])
        }
      } catch (localErr: unknown) {
        addNarrative('system', `Unable to send action: ${localErr instanceof Error ? localErr.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    if (!supabase) {
      fallbackToLocal().catch(() => {})
      return
    }

    invokeEdgeFunction<Record<string, unknown>>('dm-action', {
      action: 'player_action',
      room_code: roomCode,
      player_id: playerId,
      content,
      mock_mode: mockMode,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message.includes('(401)')) {
        fallbackToLocal().catch(() => {})
        return
      }
      addNarrative('system', `Unable to send action: ${message}`)
      setLoading(false)
    })
  }, [addNarrative, handleMessage, mockMode, playerId, roomCode, setLoading, syncState])

  const sendMoveToken = useCallback((characterId: string, x: number, y: number) => {
    const supabase = getSupabaseClient()
    if (!roomCode || !playerId) {
      return
    }

    const fallbackMoveToken = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/move-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_code: roomCode,
            player_id: playerId,
            character_id: characterId,
            x,
            y,
          }),
        })
        const payload = await parseJsonBody(res)
        if (!res.ok || typeof payload.error === 'string') {
          throw new Error(typeof payload.error === 'string' ? payload.error : `Move failed (${res.status})`)
        }
        if (payload.state) {
          syncState(payload.state as Parameters<typeof syncState>[0])
        }
      } catch (localErr: unknown) {
        addNarrative('system', `Unable to move token: ${localErr instanceof Error ? localErr.message : 'Unknown error'}`)
      }
    }

    if (!supabase) {
      fallbackMoveToken().catch(() => {})
      return
    }

    invokeEdgeFunction<Record<string, unknown>>('dm-action', {
      action: 'move_token',
      room_code: roomCode,
      player_id: playerId,
      character_id: characterId,
      x,
      y,
      mock_mode: mockMode,
    }).catch(() => {
      fallbackMoveToken().catch(() => {})
    })
  }, [addNarrative, mockMode, playerId, roomCode, syncState])

  const sendSpellCast = useCallback((spellName: string, slotLevel: number, targetId?: string) => {
    const supabase = getSupabaseClient()
    if (!supabase || !roomCode || !playerId) {
      addNarrative('system', 'Not connected to Supabase session. Unable to cast spell.')
      setLoading(false)
      return
    }

    setLoading(true)
    invokeEdgeFunction<Record<string, unknown>>('dm-action', {
      action: 'cast_spell',
      room_code: roomCode,
      player_id: playerId,
      spell_name: spellName,
      slot_level: slotLevel,
      target_id: targetId,
      mock_mode: mockMode,
    }).catch((err: unknown) => {
      addNarrative('system', `Unable to cast spell: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    })
  }, [addNarrative, mockMode, playerId, roomCode, setLoading])

  return { sendAction, sendMoveToken, sendSpellCast }
}
