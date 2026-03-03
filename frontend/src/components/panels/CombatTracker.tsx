import { useGameStore } from '../../stores/gameStore'
import './panels.css'

export default function CombatTracker() {
  const combat = useGameStore(s => s.combat)

  if (!combat || !combat.is_active) return null

  const currentTotal = Number(combat.current_movement_total ?? 0)
  const currentRemaining = Number(combat.current_movement_remaining ?? 0)
  const currentUsed = Math.max(0, currentTotal - currentRemaining)

  return (
    <div className="combat-tracker">
      <h3 className="panel-title">
        Combat - Round {combat.round}
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
