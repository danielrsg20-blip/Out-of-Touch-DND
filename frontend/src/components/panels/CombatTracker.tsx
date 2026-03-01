import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

export default function CombatTracker() {
  const combat = useGameStore(s => s.combat)
  const playerId = useSessionStore(s => s.playerId)

  if (!combat || !combat.is_active) return null

  return (
    <div className="combat-tracker">
      <h3 className="panel-title">
        Combat - Round {combat.round}
      </h3>
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
