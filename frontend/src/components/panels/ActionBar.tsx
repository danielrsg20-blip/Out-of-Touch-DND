import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { API_BASE } from '../../config/endpoints'
import type { CastableSpellOption, SpellSlotState } from '../../types'
import './panels.css'

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

interface ActionBarProps {
  onSend: (message: string) => void
  onCastSpell: (spellName: string, slotLevel: number, targetId?: string) => void
  onInitiateTarget: (spellName: string, slotLevel: number) => void
}

export default function ActionBar({ onSend, onCastSpell, onInitiateTarget }: ActionBarProps) {
  const combat = useGameStore(s => s.combat)
  const characters = useGameStore(s => s.characters)
  const addNarrative = useGameStore(s => s.addNarrative)
  const syncState = useGameStore(s => s.syncState)
  const setCombat = useGameStore(s => s.setCombat)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)
  const roomCode = useSessionStore(s => s.roomCode)
  const mockMode = useSessionStore(s => s.mockMode)
  const [castableSpells, setCastableSpells] = useState<CastableSpellOption[]>([])
  const [slotStates, setSlotStates] = useState<SpellSlotState[]>([])
  const [selectedSpell, setSelectedSpell] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(0)
  const [advancingTurn, setAdvancingTurn] = useState(false)

  const combatActive = !!combat?.is_active

  const player = players.find(p => p.id === playerId)
  const isMyTurn = combatActive && player?.character_id === combat?.current_turn
  const myChar = player?.character_id ? characters[player.character_id] : null

  useEffect(() => {
    const fetchSpellOptions = async () => {
      if (!roomCode || !playerId || !combatActive) return
      try {
        const payload = await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
          action: 'get_castable_spells',
          room_code: roomCode,
          player_id: playerId,
          in_combat: true,
          mock_mode: mockMode,
        })
        if (!payload.error) {
          setCastableSpells((payload.castable_spells as CastableSpellOption[]) || [])
          setSlotStates((payload.slot_states as SpellSlotState[]) || [])
        }
      } catch {
        setCastableSpells([])
        setSlotStates([])
      }
    }
    fetchSpellOptions()
  }, [roomCode, playerId, combatActive, myChar?.spell_slots_used, myChar?.prepared_spells, myChar?.known_spells, mockMode])

  const quickSpells = useMemo(() => castableSpells.slice(0, 4), [castableSpells])
  const overflowSpells = useMemo(() => castableSpells.slice(4), [castableSpells])

  const selectedSpellOption = castableSpells.find(s => s.name === selectedSpell)
  const selectedSpellSlots = selectedSpellOption?.slot_options || []

  const castSpell = (spell: CastableSpellOption) => {
    const slotLevel = spell.level === 0 ? 0 : (spell.slot_options[0] ?? spell.level)
    if (spell.level > 0) {
      onInitiateTarget(spell.name, slotLevel)
    } else {
      onCastSpell(spell.name, slotLevel)
    }
  }

  const handleEndTurn = async () => {
    if (!roomCode || !playerId || advancingTurn) {
      return
    }
    setAdvancingTurn(true)
    const fallbackAdvanceTurn = async () => {
      const res = await fetch(`${API_BASE}/api/combat/next-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: roomCode,
          player_id: playerId,
        }),
      })
      const payload = await parseJsonBody(res)
      if (!res.ok || typeof payload.error === 'string') {
        throw new Error(typeof payload.error === 'string' ? payload.error : `Unable to advance turn (${res.status})`)
      }

      if (payload.state) {
        syncState(payload.state as Parameters<typeof syncState>[0])
      }
      if (payload.combat) {
        setCombat(payload.combat as Parameters<typeof setCombat>[0])
      }
      const msg = (payload.data as Record<string, unknown> | undefined)?.message
      if (typeof msg === 'string' && msg.trim()) {
        addNarrative('system', msg)
      }
    }

    try {
      await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
        action: 'next_combat_turn',
        room_code: roomCode,
        player_id: playerId,
        mock_mode: mockMode,
      })
    } catch (error) {
      try {
        await fallbackAdvanceTurn()
        return
      } catch (fallbackError: unknown) {
        const edgeMessage = error instanceof Error ? error.message : 'Unknown error'
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        addNarrative('system', `Unable to advance turn: ${fallbackMessage} (edge fallback: ${edgeMessage})`)
      }
    } finally {
      setAdvancingTurn(false)
    }
  }

  const actions = [
    { label: 'Attack',     action: 'I attack the nearest enemy',              icon: '⚔',  key: 'A' },
    { label: 'Dash',       action: 'I use my action to Dash, doubling my movement', icon: '💨', key: 'D' },
    { label: 'Dodge',      action: 'I take the Dodge action',                 icon: '🛡',  key: 'O' },
    { label: 'Disengage',  action: 'I take the Disengage action',             icon: '🏃',  key: 'G' },
    { label: 'Help',       action: 'I use the Help action',                   icon: '🤝',  key: 'H' },
    { label: 'Hide',       action: 'I attempt to Hide',                       icon: '👤',  key: 'I' },
    { label: 'End Turn',   action: 'I end my turn',                           icon: '⏭',  key: 'E' },
  ]

  useEffect(() => {
    if (!combatActive || !isMyTurn) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key.toLowerCase()) {
        case 'a': onSend('I attack the nearest enemy'); break
        case 'd': onSend('I use my action to Dash, doubling my movement'); break
        case 'o': onSend('I take the Dodge action'); break
        case 'g': onSend('I take the Disengage action'); break
        case 'h': onSend('I use the Help action'); break
        case 'i': onSend('I attempt to Hide'); break
        case 'e': handleEndTurn().catch(() => {}); break
        default: {
          const num = parseInt(e.key)
          if (num >= 1 && num <= 4) {
            const spell = quickSpells[num - 1]
            if (spell?.castable) castSpell(spell)
          }
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [combatActive, isMyTurn, onSend, handleEndTurn, quickSpells, castSpell])

  if (!combatActive || !combat) return null

  return (
    <div className="action-bar">
      <div className="action-bar-header">
        {isMyTurn ? (
          <span className="your-turn">Your Turn!</span>
        ) : (
          <span className="waiting-turn">
            Waiting for {combat.initiative_order[combat.turn_index]?.name || '...'}
          </span>
        )}
      </div>
      <div className="action-buttons">
          {quickSpells.map((spell, idx) => (
            <button
              key={`spell-${spell.name}`}
              className={`action-btn spell-action-btn ${!spell.castable ? 'disabled-action' : ''}`}
              onClick={() => spell.castable && isMyTurn && castSpell(spell)}
              disabled={!spell.castable || !isMyTurn}
              title={spell.castable ? `Cast ${spell.name}` : `${spell.name}: ${spell.reason || 'Unavailable'}`}
            >
              <span className="action-icon">✨</span>
              <span className="action-label">{spell.name}</span>
              {isMyTurn && <kbd className="action-shortcut">{idx + 1}</kbd>}
            </button>
          ))}

          {actions.map(a => (
            <button
              key={a.label}
              className="action-btn"
              onClick={() => {
                if (a.label === 'End Turn') {
                  handleEndTurn().catch(() => {})
                  return
                }
                onSend(a.action)
              }}
              title={a.action}
              disabled={a.label === 'End Turn' ? (!isMyTurn || advancingTurn) : !isMyTurn}
            >
              <span className="action-icon">{a.icon}</span>
              <span className="action-label">{a.label === 'End Turn' && advancingTurn ? 'Advancing...' : a.label}</span>
              {isMyTurn && <kbd className="action-shortcut">{a.key}</kbd>}
            </button>
          ))}

          {overflowSpells.length > 0 && (
            <div className="spell-cast-menu">
              <label>More Spells</label>
              <select
                className="spell-select"
                value={selectedSpell}
                onChange={e => {
                  const nextSpell = e.target.value
                  setSelectedSpell(nextSpell)
                  const spell = castableSpells.find(s => s.name === nextSpell)
                  setSelectedSlot(spell?.level === 0 ? 0 : (spell?.slot_options?.[0] ?? 0))
                }}
              >
                <option value="">Select spell...</option>
                {overflowSpells.map(spell => (
                  <option key={spell.name} value={spell.name}>
                    {spell.name} (L{spell.level}){spell.castable ? '' : ' - unavailable'}
                  </option>
                ))}
              </select>

              {selectedSpellOption && selectedSpellOption.level > 0 && (
                <select
                  className="spell-select"
                  value={selectedSlot}
                  onChange={e => setSelectedSlot(Number(e.target.value))}
                >
                  {selectedSpellSlots.map(sl => (
                    <option key={sl} value={sl}>Slot {sl}</option>
                  ))}
                </select>
              )}

              <button
                className="action-btn cast-selected-btn"
                disabled={!selectedSpellOption || !selectedSpellOption.castable || !isMyTurn}
                onClick={() => {
                  if (!selectedSpellOption) return
                  const slot = selectedSpellOption.level === 0 ? 0 : selectedSlot
                  onCastSpell(selectedSpellOption.name, slot)
                }}
              >
                <span className="action-icon">✨</span>
                <span className="action-label">Cast Selected</span>
              </button>
            </div>
          )}

          {slotStates.length > 0 && (
            <div className="slot-state-row">
              {slotStates.map(slot => (
                <span key={slot.level} className={`slot-pill ${slot.state}`} title={`Level ${slot.level}: ${slot.remaining}/${slot.total}`}>
                  L{slot.level} {slot.remaining}/{slot.total}
                </span>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
