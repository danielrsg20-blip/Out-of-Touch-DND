import { useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

const DICE = [4, 6, 8, 10, 12, 20, 100] as const
type DieSize = typeof DICE[number]

export default function DiceRoller() {
  const combat = useGameStore(s => s.combat)
  const addNarrative = useGameStore(s => s.addNarrative)
  const players = useSessionStore(s => s.players)
  const playerId = useSessionStore(s => s.playerId)

  const [selectedDie, setSelectedDie] = useState<DieSize>(20)
  const [modifier, setModifier] = useState(0)
  const [lastResult, setLastResult] = useState<{ roll: number; total: number } | null>(null)

  if (combat?.is_active) return null

  const roll = () => {
    const rolled = Math.floor(Math.random() * selectedDie) + 1
    const total = rolled + modifier
    setLastResult({ roll: rolled, total })

    const playerName = players.find(p => p.id === playerId)?.name ?? 'You'
    const modText = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier} = ${total}` : ''
    addNarrative('dice', `${playerName} rolled d${selectedDie}: ${rolled}${modText}`)
  }

  return (
    <div className="dice-roller">
      <div className="dice-roller-header">
        <span className="panel-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>Dice Roller</span>
        {lastResult && (
          <span className="dice-last-result">
            {lastResult.roll}{modifier !== 0 ? ` = ${lastResult.total}` : ''}
          </span>
        )}
      </div>

      <div className="dice-options">
        {DICE.map(d => (
          <button
            key={d}
            className={`die-btn ${selectedDie === d ? 'die-btn-selected' : ''}`}
            onClick={() => setSelectedDie(d)}
          >
            d{d}
          </button>
        ))}
      </div>

      <div className="dice-controls">
        <label className="dice-mod-label">Mod</label>
        <input
          type="number"
          className="dice-mod-input"
          value={modifier}
          onChange={e => setModifier(Number(e.target.value))}
        />
        <button className="dice-roll-btn" onClick={roll}>
          Roll d{selectedDie}
        </button>
      </div>
    </div>
  )
}
