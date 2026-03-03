import MapCanvas from './map/MapCanvas'
import CombatTracker from './panels/CombatTracker'
import { useWebSocket } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import './TableModeView.css'

export default function TableModeView() {
  useWebSocket()
  const { roomCode, players } = useSessionStore()
  const combat = useGameStore(s => s.combat)
  const narrative = useGameStore(s => s.narrative)
  const recentNarrative = narrative.slice(-5)

  return (
    <div className="table-mode">
      <div className="table-map-area">
        <MapCanvas />
      </div>

      <div className="table-overlay-top">
        <span className="table-room-code">{roomCode}</span>
        <span className="table-players">
          {players.map(p => p.name).join(' • ')}
        </span>
      </div>

      {combat?.is_active && (
        <div className="table-overlay-combat">
          <CombatTracker />
        </div>
      )}

      <div className="table-overlay-narrative">
        {recentNarrative.map(entry => (
          <div key={entry.id} className={`table-narrative-entry narrative-${entry.type}`}>
            {entry.speaker && <strong>{entry.speaker}: </strong>}
            {entry.content}
          </div>
        ))}
      </div>
    </div>
  )
}
