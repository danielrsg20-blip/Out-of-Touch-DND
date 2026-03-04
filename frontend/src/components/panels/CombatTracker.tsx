import { useEffect, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

export default function CombatTracker() {
  const combat = useGameStore(s => s.combat)
  const [roundPulse, setRoundPulse] = useState(false)

  useEffect(() => {
    if (!combat?.is_active) {
      return
    }
    setRoundPulse(true)
    const timeout = window.setTimeout(() => setRoundPulse(false), 900)
    return () => window.clearTimeout(timeout)
  }, [combat?.is_active, combat?.round])

  if (!combat || !combat.is_active) return null

  const currentTotal = Number(combat.current_movement_total ?? 0)
  const currentRemaining = Number(combat.current_movement_remaining ?? 0)
  const currentUsed = Math.max(0, currentTotal - currentRemaining)

  return (
    <div className="combat-tracker">
      <h3 className="panel-title combat-title-row">
        <span>Combat</span>
        <span className={`combat-round-badge ${roundPulse ? 'round-transition' : ''}`}>
          Round {combat.round}
        </span>
      </h3>
      <div className="movement-status">
        Movement: {currentUsed}/{currentTotal} ft
      </div>
      <div className="initiative-list">
        {combat.initiative_order.map((entry, idx) => {
          const isCurrent = idx === combat.turn_index
          const hpPercent = entry.max_hp > 0 ? (entry.hp / entry.max_hp) * 100 : 0
          return (
            <div
              key={entry.id}
              className={`initiative-entry ${isCurrent ? 'current-turn' : ''}`}
            >
              <span className="init-order">{entry.initiative}</span>
              <span className="init-name">{entry.name}</span>
              <div className="init-hp-bar">
                <div className="init-hp-fill" style={{ width: `${hpPercent}%` }} />
              </div>
              <span className="init-hp-text">{entry.hp}/{entry.max_hp}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
