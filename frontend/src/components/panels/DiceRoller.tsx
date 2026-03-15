import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
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
  const [lastResult, setLastResult] = useState<{ roll: number; total: number; key: number } | null>(null)

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
      <motion.div
        className="dice-roller roll-request-panel"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
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
          <motion.button
            className="dice-roll-btn roll-request-btn"
            onClick={rollAndSubmit}
            whileTap={{ scale: 0.94 }}
          >
            Roll {pendingRoll.dice} & Submit
          </motion.button>
          <button className="roll-request-dismiss" onClick={() => setPendingRoll(null)} title="Dismiss">
            ✕
          </button>
        </div>
      </motion.div>
    )
  }

  // Hide normal roller during combat (no pending roll)
  if (combat?.is_active) return null

  const roll = () => {
    const rolled = Math.floor(Math.random() * selectedDie) + 1
    const total = rolled + modifier
    setLastResult({ roll: rolled, total, key: Date.now() })

    const playerName = players.find(p => p.id === playerId)?.name ?? 'You'
    const modText = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier} = ${total}` : ''
    addNarrative('dice', `${playerName} rolled d${selectedDie}: ${rolled}${modText}`)
  }

  return (
    <div className="dice-roller">
      <div className="dice-roller-header">
        <span className="panel-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>Dice Roller</span>
        <AnimatePresence mode="wait">
          {lastResult && (
            <motion.span
              key={lastResult.key}
              className="dice-last-result"
              initial={{ opacity: 0, scale: 1.4, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              {lastResult.roll}{modifier !== 0 ? ` = ${lastResult.total}` : ''}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="dice-options">
        {DICE.map(d => (
          <motion.button
            key={d}
            className={`die-btn ${selectedDie === d ? 'die-btn-selected' : ''}`}
            onClick={() => setSelectedDie(d)}
            whileTap={{ scale: 0.88 }}
          >
            d{d}
          </motion.button>
        ))}
      </div>

      <div className="dice-controls">
        <label className="dice-mod-label">Mod</label>
        <input
          type="number"
          className="dice-mod-input"
          value={modifier}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModifier(Number(e.target.value))}
        />
        <motion.button
          className="dice-roll-btn"
          onClick={roll}
          whileTap={{ scale: 0.94 }}
        >
          Roll d{selectedDie}
        </motion.button>
      </div>
    </div>
  )
}
