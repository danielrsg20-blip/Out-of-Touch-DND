import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { CastableSpellOption, SpellSlotState } from '../../types'
import './panels.css'

interface ActionBarProps {
  onSend: (message: string) => void
  onCastSpell: (spellName: string, slotLevel: number, targetId?: string) => void
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function ActionBar({ onSend, onCastSpell }: ActionBarProps) {
  const combat = useGameStore(s => s.combat)
  const characters = useGameStore(s => s.characters)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)
  const roomCode = useSessionStore(s => s.roomCode)
  const [castableSpells, setCastableSpells] = useState<CastableSpellOption[]>([])
  const [slotStates, setSlotStates] = useState<SpellSlotState[]>([])
  const [selectedSpell, setSelectedSpell] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(0)

  const combatActive = !!combat?.is_active

  const player = players.find(p => p.id === playerId)
  const isMyTurn = combatActive && player?.character_id === combat?.current_turn
  const myChar = player?.character_id ? characters[player.character_id] : null

  useEffect(() => {
    const fetchSpellOptions = async () => {
      if (!roomCode || !playerId || !combatActive) return
      try {
        const res = await fetch(`${API_BASE}/api/character/spell-options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_code: roomCode, player_id: playerId, in_combat: true }),
        })
        const data = await res.json()
        if (!data.error) {
          setCastableSpells(data.castable_spells || [])
          setSlotStates(data.slot_states || [])
        }
      } catch {
        setCastableSpells([])
        setSlotStates([])
      }
    }
    fetchSpellOptions()
  }, [roomCode, playerId, combatActive, myChar?.spell_slots_used, myChar?.prepared_spells, myChar?.known_spells])

  const quickSpells = useMemo(() => castableSpells.slice(0, 4), [castableSpells])
  const overflowSpells = useMemo(() => castableSpells.slice(4), [castableSpells])

  const selectedSpellOption = castableSpells.find(s => s.name === selectedSpell)
  const selectedSpellSlots = selectedSpellOption?.slot_options || []

  if (!combatActive || !combat) return null

  const castSpell = (spell: CastableSpellOption) => {
    const slotLevel = spell.level === 0 ? 0 : (spell.slot_options[0] ?? spell.level)
    onCastSpell(spell.name, slotLevel)
  }

  const actions = [
    { label: 'Attack', action: 'I attack the nearest enemy', icon: '⚔' },
    { label: 'Dash', action: 'I use my action to Dash, doubling my movement', icon: '💨' },
    { label: 'Dodge', action: 'I take the Dodge action', icon: '🛡' },
    { label: 'Disengage', action: 'I take the Disengage action', icon: '🏃' },
    { label: 'Help', action: 'I use the Help action', icon: '🤝' },
    { label: 'Hide', action: 'I attempt to Hide', icon: '👤' },
    { label: 'End Turn', action: 'I end my turn', icon: '⏭' },
  ]

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
      {isMyTurn && (
        <div className="action-buttons">
          {quickSpells.map(spell => (
            <button
              key={`spell-${spell.name}`}
              className={`action-btn spell-action-btn ${!spell.castable ? 'disabled-action' : ''}`}
              onClick={() => spell.castable && castSpell(spell)}
              disabled={!spell.castable}
              title={spell.castable ? `Cast ${spell.name}` : `${spell.name}: ${spell.reason || 'Unavailable'}`}
            >
              <span className="action-icon">✨</span>
              <span className="action-label">{spell.name}</span>
            </button>
          ))}

          {actions.map(a => (
            <button
              key={a.label}
              className="action-btn"
              onClick={() => onSend(a.action)}
              title={a.action}
            >
              <span className="action-icon">{a.icon}</span>
              <span className="action-label">{a.label}</span>
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
                disabled={!selectedSpellOption || !selectedSpellOption.castable}
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
      )}
    </div>
  )
}
