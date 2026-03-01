import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { roomCode, playerId, setConnected, addPlayer, removePlayer, setPlayers } = useSessionStore()
  const { setMap, updateEntity, addEntity, removeEntity, setCombat, addNarrative, syncState, setLoading } = useGameStore()

  useEffect(() => {
    if (!roomCode || !playerId) return

    const ws = new WebSocket(`${WS_BASE}/ws/${roomCode}/${playerId}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      handleMessage(msg)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [roomCode, playerId])

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

      case 'player_disconnected':
        removePlayer(msg.player_id as string)
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
        const data = msg.data as Record<string, unknown>
        if (action === 'move_entity') {
          const to = data.to as { x: number; y: number }
          updateEntity(data.moved as string, to.x, to.y)
        } else if (action === 'place_entity') {
          const placed = data.placed as Parameters<typeof addEntity>[0]
          addEntity(placed)
        } else if (action === 'remove_entity') {
          removeEntity(data.entity_id as string)
        }
        break
      }

      case 'combat_start':
        setCombat(msg.combat as Parameters<typeof setCombat>[0])
        addNarrative('system', 'Combat has begun! Roll for initiative!')
        break

      case 'combat_update':
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
  }, [])

  const sendAction = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setLoading(true)
      wsRef.current.send(JSON.stringify({ type: 'player_action', content }))
    }
  }, [])

  const sendMoveToken = useCallback((characterId: string, x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'move_token', character_id: characterId, x, y }))
    }
  }, [])

  return { sendAction, sendMoveToken }
}
