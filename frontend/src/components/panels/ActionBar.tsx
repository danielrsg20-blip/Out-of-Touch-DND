import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

interface ActionBarProps {
  onSend: (message: string) => void
}

export default function ActionBar({ onSend }: ActionBarProps) {
  const combat = useGameStore(s => s.combat)
  const characters = useGameStore(s => s.characters)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)

  if (!combat?.is_active) return null

  const player = players.find(p => p.id === playerId)
  const isMyTurn = player?.character_id === combat.current_turn
  const myChar = player?.character_id ? characters[player.character_id] : null

  const actions = [
    { label: 'Attack', action: 'I attack the nearest enemy', icon: '⚔' },
    { label: 'Cast Spell', action: 'I want to cast a spell', icon: '✨' },
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
        </div>
      )}
    </div>
  )
}
