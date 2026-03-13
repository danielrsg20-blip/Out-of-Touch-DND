import { useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

const DICE = [4, 6, 8, 10, 12, 20, 100] as const
type DieSize = typeof DICE[number]

interface DiceRollerProps {
  onSubmitRoll?: (message: string) => void
}

export default function DiceRoller({ onSubmitRoll }: DiceRollerProps) {
  const combat = useGameStore(s => s.combat)
  const addNarrative = useGameStore(s => s.addNarrative)
  const pendingRoll = useGameStore(s => s.pendingRoll)
  const setPendingRoll = useGameStore(s => s.setPendingRoll)
  const players = useSessionStore(s => s.players)
  const playerId = useSessionStore(s => s.playerId)

  const [selectedDie, setSelectedDie] = useState<DieSize>(20)
  const [modifier, setModifier] = useState(0)
  const [lastResult, setLastResult] = useState<{ roll: number; total: number } | null>(null)

  // Show roll request panel when a roll is pending (even during combat)
  if (pendingRoll) {
    const dieSize = parseInt(pendingRoll.dice.replace('d', '')) || 20

    const rollAndSubmit = () => {
      const rolled = Math.floor(Math.random() * dieSize) + 1
      const total = rolled + pendingRoll.modifier
      const modStr = pendingRoll.modifier > 0
        ? ` + ${pendingRoll.modifier}`
        : pendingRoll.modifier < 0
          ? ` - ${Math.abs(pendingRoll.modifier)}`
          : ''
      const message = `[Roll Result] ${pendingRoll.label}: ${pendingRoll.dice} → ${rolled}${modStr} = ${total} (${pendingRoll.context})`
      addNarrative('dice', message)
      if (onSubmitRoll) onSubmitRoll(message)
      setPendingRoll(null)
    }

    return (
      <div className="dice-roller roll-request-panel">
        <div className="roll-request-header">
          <span className="roll-request-badge">🎲 Roll Required</span>
          <span className="roll-request-char">{pendingRoll.characterName}</span>
        </div>
        <div className="roll-request-label">{pendingRoll.label}</div>
        <div className="roll-request-context">{pendingRoll.context}</div>
        <div className="roll-request-dice">
          {pendingRoll.dice}
          {pendingRoll.modifier !== 0 && (
            <span className="roll-request-mod">
              {pendingRoll.modifier > 0 ? ' +' : ' '}{pendingRoll.modifier}
            </span>
          )}
        </div>
        <div className="roll-request-actions">
          <button className="dice-roll-btn roll-request-btn" onClick={rollAndSubmit}>
            Roll {pendingRoll.dice} & Submit
          </button>
          <button className="roll-request-dismiss" onClick={() => setPendingRoll(null)} title="Dismiss">
            ✕
          </button>
        </div>
      </div>
    )
  }

  // Hide normal roller during combat (no pending roll)
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
