import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'
import { useOverlayStore } from '../stores/overlayStore'
import { getSupabaseClient, invokeEdgeFunction } from '../lib/supabaseClient'
import { API_BASE } from '../config/endpoints'
import { playTTSAudio } from '../components/VoiceControl'
import { narrationOrchestrator } from '../lib/narrationOrchestrator'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Overlay } from '../types'

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

function normalizeVoiceErrorMessage(rawError: unknown): string {
  const raw = rawError instanceof Error ? rawError.message : String(rawError ?? 'Unknown voice error')
  const message = raw.trim()
  const lower = message.toLowerCase()

  if (lower.includes('insufficient_quota') || lower.includes('exceeded your current quota') || lower.includes('429')) {
    return 'Voice provider quota reached. You can keep playing with text, or enable mock mode for local voice testing.'
  }
  if (lower.includes('api key') || lower.includes('not configured') || lower.includes('authentication')) {
    return 'Voice provider is not configured. You can keep playing with text, or enable mock mode for local voice testing.'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Voice services are temporarily unavailable (network issue). Please try again shortly.'
  }

  return `Voice services are currently unavailable: ${message}`
}

function canUseBrowserSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function useWebSocket() {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const coldOpenFiredRef = useRef(false)
  const narrativeLockRef = useRef(false)
  const lastVoiceNoticeRef = useRef<{ stt: string; tts: string; browserTtsShown: boolean }>({ stt: '', tts: '', browserTtsShown: false })
  const { roomCode, sessionId, playerId, setConnected, addPlayer, setPlayers, getSession, mockMode } = useSessionStore()
  const { setMap, updateEntity, addEntity, removeEntity, setCombat, addNarrative, syncState, setLoading, setPendingRoll } = useGameStore()
  const setOverlay = useOverlayStore((s) => s.setOverlay)



  const reportVoiceIssue = useCallback((kind: 'stt' | 'tts', error: unknown) => {
    const message = normalizeVoiceErrorMessage(error)
    if (lastVoiceNoticeRef.current[kind] === message) {
      return
    }
    lastVoiceNoticeRef.current[kind] = message
    addNarrative('system', message)
  }, [addNarrative])

  const tryBrowserSpeechFallback = useCallback(async (text: string): Promise<boolean> => {
    if (!(mockMode || import.meta.env.DEV) || !canUseBrowserSpeechSynthesis()) {
      return false
    }

    return new Promise<boolean>((resolve) => {
      try {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 1
        utterance.pitch = 0.95
        utterance.onend = () => resolve(true)
        utterance.onerror = () => resolve(false)
        window.speechSynthesis.speak(utterance)
      } catch {
        resolve(false)
      }
    })
  }, [mockMode])

  const speakNarration = useCallback((text: string) => {
    narrationOrchestrator.enqueue(text)
  }, [])

  const renderSessionStartProtocol = useCallback((payload: Record<string, unknown> | undefined) => {
    if (!payload || typeof payload !== 'object') {
      return
    }

    const protocol = payload.protocol as Record<string, unknown> | undefined
    if (!protocol) {
      return
    }

    const recap = typeof protocol.SESSION_RECAP === 'string' ? protocol.SESSION_RECAP.trim() : ''
    const scene = typeof protocol.CURRENT_SCENE === 'string' ? protocol.CURRENT_SCENE.trim() : ''
    const trigger = typeof protocol.EVENT_TRIGGER === 'string' ? protocol.EVENT_TRIGGER.trim() : ''
    const prompt = typeof protocol.ACTION_PROMPT === 'string' ? protocol.ACTION_PROMPT.trim() : ''

    const stateReady = protocol.SESSION_STATE_READY as Record<string, unknown> | undefined
    const ready = stateReady?.ready === true
    const issues = Array.isArray(stateReady?.issues)
      ? stateReady?.issues.filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
      : []

    addNarrative('system', ready ? 'SESSION_STATE_READY' : 'SESSION_STATE_BLOCKED')
    for (const issue of issues) {
      addNarrative('system', `Validation: ${issue}`)
    }

    if (recap) {
      addNarrative('dm', recap, 'DM')
      void speakNarration(recap)
    }

    const partyStatus = Array.isArray(protocol.PARTY_STATUS) ? protocol.PARTY_STATUS : []
    for (const row of partyStatus) {
      const typed = row as Record<string, unknown>
      const name = typeof typed.character_name === 'string' && typed.character_name.trim()
        ? typed.character_name
        : (typeof typed.player_name === 'string' ? typed.player_name : 'Unknown')
      const role = typeof typed.role === 'string' && typed.role.trim() ? typed.role : 'Unassigned'
      const hp = typed.hp as Record<string, unknown> | undefined
      const hpCurrent = typeof hp?.current === 'number' ? hp.current : null
      const hpMax = typeof hp?.max === 'number' ? hp.max : null
      const conditionList = Array.isArray(typed.conditions)
        ? typed.conditions.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        : []
      const hpText = hpCurrent !== null && hpMax !== null ? `${hpCurrent}/${hpMax}` : 'n/a'
      const conditionsText = conditionList.length > 0 ? conditionList.join(', ') : 'none'
      addNarrative('system', `${name} (${role}) HP ${hpText} | Conditions: ${conditionsText}`)
    }

    if (scene) {
      addNarrative('dm', scene, 'DM')
      void speakNarration(scene)
    }

    const npcPresent = protocol.NPC_PRESENT
    if (npcPresent === 'NONE') {
      addNarrative('system', 'NPC_PRESENT: NONE')
    } else if (Array.isArray(npcPresent)) {
      for (const npcRow of npcPresent) {
        const npc = npcRow as Record<string, unknown>
        const name = typeof npc.name === 'string' ? npc.name : 'Unknown NPC'
        const role = typeof npc.role === 'string' ? npc.role : 'unknown role'
        const behavior = typeof npc.behavior === 'string' ? npc.behavior : 'is present'
        addNarrative('system', `${name} (${role}) - ${behavior}`)
      }
    }

    if (trigger) {
      addNarrative('dm', trigger, 'DM')
      void speakNarration(trigger)
    }
    if (prompt) {
      addNarrative('system', prompt)
    }
  }, [addNarrative, speakNarration])

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
        if (!coldOpenFiredRef.current) {
          coldOpenFiredRef.current = true
          setTimeout(
            () => renderSessionStartProtocol(payload.session_start as Record<string, unknown> | undefined),
            Number(import.meta.env.VITE_COLD_OPEN_DELAY_MS) || 2000,
          )
        }

        // If the DM has not spoken yet (fresh session), fire a bootstrap narration
        const dmTurnCount = typeof payload.dm_turn_count === 'number' ? payload.dm_turn_count : 1
        if (dmTurnCount === 0 && roomCode && playerId) {
          try {
            const bootstrapRes = await fetch(`${API_BASE}/api/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room_code: roomCode, player_id: playerId, content: '[SESSION_START]' }),
            })
            const bootstrapPayload = await parseJsonBody(bootstrapRes)
            if (Array.isArray(bootstrapPayload.narratives)) {
              for (const line of bootstrapPayload.narratives) {
                if (typeof line === 'string' && line.trim()) {
                  addNarrative('dm', line, 'DM')
                  void speakNarration(line)
                }
              }
            }
          } catch {
            // non-critical: deterministic session-start text is already visible
          }
        }
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
            getSession(roomCode)
              .then((payload) => {
                syncState(payload as Parameters<typeof syncState>[0])
              })
              .catch(() => {})
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
        if (msg.overlay && typeof msg.overlay === 'object') {
          setOverlay(msg.overlay as Overlay)
        }
        if (!coldOpenFiredRef.current) {
          coldOpenFiredRef.current = true
          setTimeout(
            () => renderSessionStartProtocol(msg.session_start as Record<string, unknown> | undefined),
            Number(import.meta.env.VITE_COLD_OPEN_DELAY_MS) || 2000,
          )
        }
        break

      case 'session_start':
        if (!coldOpenFiredRef.current) {
          coldOpenFiredRef.current = true
          setTimeout(
            () => renderSessionStartProtocol(msg),
            Number(import.meta.env.VITE_COLD_OPEN_DELAY_MS) || 2000,
          )
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
        narrativeLockRef.current = false
        setLoading(false)
        if (typeof msg.content === 'string') {
          void speakNarration(msg.content)
        }
        break

      case 'tts_audio':
        if (typeof msg.audio === 'string' && msg.audio.trim()) {
          playTTSAudio(msg.audio)
        }
        break

      case 'map_update':
        setMap(msg.map as Parameters<typeof setMap>[0])
        break

      case 'overlay_update':
        if (msg.overlay && typeof msg.overlay === 'object') {
          setOverlay(msg.overlay as Overlay)
        }
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

      case 'roll_request': {
        setPendingRoll({
          characterId: msg.character_id as string,
          characterName: (msg.character_name as string) || '',
          label: (msg.label as string) || 'Roll',
          dice: (msg.dice as string) || 'd20',
          modifier: typeof msg.modifier === 'number' ? msg.modifier : 0,
          context: (msg.context as string) || '',
        })
        break
      }

      case 'state_sync':
        if (msg.state) {
          syncState(msg.state as Parameters<typeof syncState>[0])
          const state = msg.state as Record<string, unknown>
          if (state.overlay && typeof state.overlay === 'object') {
            setOverlay(state.overlay as Overlay)
          }
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
  }, [addNarrative, addEntity, addPlayer, removeEntity, renderSessionStartProtocol, setCombat, setLoading, setMap, setOverlay, setOverlay, setPlayers, setPendingRoll, speakNarration, syncState, updateEntity])

  const sendAction = useCallback((content: string) => {
    if (!roomCode || !playerId) {
      addNarrative('system', 'Missing room or player identity. Unable to send action.')
      setLoading(false)
      return
    }

    if (narrativeLockRef.current) {
      addNarrative('system', 'Please wait for the DM to respond before acting again.')
      return
    }

    narrativeLockRef.current = true
    setLoading(true)

    const sendViaLocal = async () => {
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
            void speakNarration(line)
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
      if (payload.overlay && typeof payload.overlay === 'object') {
        setOverlay(payload.overlay as Overlay)
      }
    }

    const sendViaEdge = async () => {
      const supabase = getSupabaseClient()
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      const playerName = useSessionStore.getState().players.find((p) => p.id === playerId)?.name ?? 'You'
      addNarrative('player', content, playerName)

      await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
        action: 'player_action',
        room_code: roomCode,
        player_id: playerId,
        content,
        mock_mode: mockMode,
      })
    }

    // Try local backend first, fall back to edge function if local session not found
    sendViaLocal()
      .catch((localErr: unknown) => {
        const localMessage = localErr instanceof Error ? localErr.message : 'Unknown error'
        console.log(`[sendAction] Local failed (${localMessage}), trying edge function...`)
        return sendViaEdge()
      })
      .catch((edgeErr: unknown) => {
        const edgeMessage = edgeErr instanceof Error ? edgeErr.message : 'Unknown error'
        addNarrative('system', `Unable to send action: ${edgeMessage}`)
      })
      .finally(() => {
        narrativeLockRef.current = false
        setLoading(false)
      })
  }, [addNarrative, handleMessage, mockMode, playerId, roomCode, setLoading, setOverlay, speakNarration, syncState])

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

  const transcribeVoiceInput = useCallback(async (audioBase64: string): Promise<string | null> => {
    const trimmed = audioBase64.trim()
    if (!trimmed) {
      return null
    }

    const supabase = getSupabaseClient()

    try {
      if (supabase) {
        try {
          const payload = await invokeEdgeFunction<Record<string, unknown>>('voice-stt', {
            audio: trimmed,
            filename: 'voice-input.webm',
            room_code: roomCode,
            player_id: playerId,
            mock_mode: mockMode,
          })
          const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : ''
          if (transcript) {
            return transcript
          }
        } catch {
          // Fall through to graceful null return when edge STT is unavailable.
        }
      }

      return null
    } catch (error) {
      reportVoiceIssue('stt', error)
      return null
    }
  }, [mockMode, playerId, reportVoiceIssue, roomCode])

  const runVoiceTest = useCallback(async () => {
    const testLine = 'Voice test check. If you can hear this, your speaker output is working.'

    try {
      const supabase = getSupabaseClient()
      if (!supabase) {
        throw new Error('Voice edge function is not configured')
      }

      const payload = await invokeEdgeFunction<Record<string, unknown>>('voice-tts', {
        text: testLine,
        voiceId: 'dm_default',
        room_code: roomCode,
        player_id: playerId,
        mock_mode: true,
      })

      if (typeof payload.audio === 'string' && payload.audio.trim()) {
        playTTSAudio(payload.audio)
        addNarrative('system', 'Voice test: success chirp played.')
        return
      }

      throw new Error('Voice test did not return playable audio')
    } catch (error) {
      reportVoiceIssue('tts', error)
      const usedBrowserFallback = await tryBrowserSpeechFallback(testLine)
      if (!usedBrowserFallback) {
        addNarrative('system', 'Voice test could not play audio. Check speaker output and browser audio permissions.')
      }
    }
  }, [addNarrative, playerId, reportVoiceIssue, roomCode, tryBrowserSpeechFallback])

  return { sendAction, sendMoveToken, sendSpellCast, transcribeVoiceInput, runVoiceTest }
}
