import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useWebSocket() {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const { roomCode, sessionId, playerId, setConnected, addPlayer, setPlayers, getSession } = useSessionStore()
  const { setMap, updateEntity, addEntity, removeEntity, setCombat, addNarrative, syncState, setLoading } = useGameStore()

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
        if (msg.combat) {
          setCombat(msg.combat as Parameters<typeof setCombat>[0])
        }
        if (msg.data) {
          const data = msg.data as Record<string, unknown>
          if (data.message) addNarrative('system', data.message as string)
          if (msg.action === 'end_combat') {
            setCombat(null)
          }
        }
        break

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
    const supabase = getSupabaseClient()
    if (!supabase || !roomCode || !playerId) {
      addNarrative('system', 'Not connected to Supabase session. Unable to send action.')
      setLoading(false)
      return
    }

    setLoading(true)
    supabase.functions.invoke('dm-action', {
      body: { action: 'player_action', room_code: roomCode, player_id: playerId, content },
    }).then(({ data, error }) => {
      if (error) {
        addNarrative('system', `Unable to send action: ${error.message}`)
        setLoading(false)
        return
      }
      const payload = (data ?? {}) as Record<string, unknown>
      if (typeof payload.error === 'string') {
        addNarrative('system', `Unable to send action: ${payload.error}`)
        setLoading(false)
      }
    }).catch((err: unknown) => {
      addNarrative('system', `Unable to send action: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    })
  }, [addNarrative, playerId, roomCode, setLoading])

  const sendMoveToken = useCallback((characterId: string, x: number, y: number) => {
    const supabase = getSupabaseClient()
    if (!supabase || !roomCode || !playerId) {
      return
    }

    supabase.functions.invoke('dm-action', {
      body: {
        action: 'move_token',
        room_code: roomCode,
        player_id: playerId,
        character_id: characterId,
        x,
        y,
      },
    })
  }, [playerId, roomCode])

  const sendSpellCast = useCallback((spellName: string, slotLevel: number, targetId?: string) => {
    const supabase = getSupabaseClient()
    if (!supabase || !roomCode || !playerId) {
      addNarrative('system', 'Not connected to Supabase session. Unable to cast spell.')
      setLoading(false)
      return
    }

    setLoading(true)
    supabase.functions.invoke('dm-action', {
      body: {
        action: 'cast_spell',
        room_code: roomCode,
        player_id: playerId,
        spell_name: spellName,
        slot_level: slotLevel,
        target_id: targetId,
      },
    }).then(({ data, error }) => {
      if (error) {
        addNarrative('system', `Unable to cast spell: ${error.message}`)
        setLoading(false)
        return
      }
      const payload = (data ?? {}) as Record<string, unknown>
      if (typeof payload.error === 'string') {
        addNarrative('system', `Unable to cast spell: ${payload.error}`)
        setLoading(false)
      }
    }).catch((err: unknown) => {
      addNarrative('system', `Unable to cast spell: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setLoading(false)
    })
  }, [addNarrative, playerId, roomCode, setLoading])

  return { sendAction, sendMoveToken, sendSpellCast }
}
