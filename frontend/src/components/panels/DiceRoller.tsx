import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

const DICE = [4, 6, 8, 10, 12, 20, 100] as const
type DieSize = (typeof DICE)[number]
type RollMode = 'normal' | 'advantage' | 'disadvantage'

interface RollEntry {
  key: number
  notation: string
  rolls: number[]
  keptIdx: number   // 0 = first die kept (adv/dis), -1 = all kept (normal)
  modifier: number
  total: number
  mode: RollMode
}

interface DiceRollerProps {
  readonly onSubmitRoll?: (message: string) => void
}

const PRESETS = [
  { label: 'Initiative', abilityKey: 'DEX' },
  { label: 'Death Save', abilityKey: null },
  { label: 'Perception', abilityKey: 'WIS' },
  { label: 'Stealth', abilityKey: 'DEX' },
  { label: 'Athletics', abilityKey: 'STR' },
  { label: 'Arcana', abilityKey: 'INT' },
] as const

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

function fmtMod(mod: number): string {
  return mod > 0 ? ` +${mod}` : ` ${mod}`
}

function getPresetMod(abilityKey: string | null, modifiers: Record<string, number> | undefined): number {
  if (abilityKey === null || modifiers === undefined) return 0
  return modifiers[abilityKey] ?? 0
}

export default function DiceRoller({ onSubmitRoll }: DiceRollerProps) {
  const combat = useGameStore(s => s.combat)
  const addNarrative = useGameStore(s => s.addNarrative)
  const pendingRoll = useGameStore(s => s.pendingRoll)
  const setPendingRoll = useGameStore(s => s.setPendingRoll)
  const characters = useGameStore(s => s.characters)
  const players = useSessionStore(s => s.players)
  const playerId = useSessionStore(s => s.playerId)

  const [selectedDie, setSelectedDie] = useState<DieSize>(20)
  const [dieCount, setDieCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rollMode, setRollMode] = useState<RollMode>('normal')
  const [lastResult, setLastResult] = useState<RollEntry | null>(null)
  const [history, setHistory] = useState<RollEntry[]>([])
  const [isRolling, setIsRolling] = useState(false)

  const myPlayer = players.find(p => p.id === playerId)
  const myCharacter = myPlayer?.character_id ? characters[myPlayer.character_id] : null
  const playerName = myPlayer?.name ?? 'You'

  // ── Pending roll panel ───────────────────────────────────────────────
  if (pendingRoll) {
    const dieSize = Number.parseInt(pendingRoll.dice.replace('d', '')) || 20

    const rollAndSubmit = () => {
      const rolled = rollDie(dieSize)
      const total = rolled + pendingRoll.modifier
      const modStr = pendingRoll.modifier === 0
        ? ''
        : `${fmtMod(pendingRoll.modifier)} = ${total}`
      const message = `[Roll Result] ${pendingRoll.label}: ${pendingRoll.dice} → ${rolled}${modStr ? ' ' + modStr : ''} (${pendingRoll.context})`
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
            Roll {pendingRoll.dice} &amp; Submit
          </motion.button>
          <button className="roll-request-dismiss" onClick={() => setPendingRoll(null)} title="Dismiss">
            ✕
          </button>
        </div>
      </motion.div>
    )
  }

  if (combat?.is_active) return null

  const isD20Single = selectedDie === 20 && dieCount === 1

  // ── Core roll logic ──────────────────────────────────────────────────
  const doRoll = (
    die: DieSize = selectedDie,
    count: number = dieCount,
    mod: number = modifier,
    mode: RollMode = rollMode,
    label?: string,
  ) => {
    if (isRolling) return

    let rolls: number[]
    let keptIdx: number
    let notation: string

    if (mode === 'advantage') {
      const r1 = rollDie(die)
      const r2 = rollDie(die)
      rolls = r1 >= r2 ? [r1, r2] : [r2, r1]   // kept die first
      keptIdx = 0
      notation = label ? `${label} (adv)` : `d${die} adv`
    } else if (mode === 'disadvantage') {
      const r1 = rollDie(die)
      const r2 = rollDie(die)
      rolls = r1 <= r2 ? [r1, r2] : [r2, r1]   // kept die first
      keptIdx = 0
      notation = label ? `${label} (dis)` : `d${die} dis`
    } else {
      rolls = Array.from({ length: count }, () => rollDie(die))
      keptIdx = -1
      notation = label ?? (count > 1 ? `${count}d${die}` : `d${die}`)
    }

    const rollSum = mode === 'normal' ? rolls.reduce((a, b) => a + b, 0) : rolls[0]
    const total = rollSum + mod
    const entry: RollEntry = { key: Date.now(), notation, rolls, keptIdx, modifier: mod, total, mode }

    setIsRolling(true)
    setTimeout(() => {
      setLastResult(entry)
      setHistory(h => [entry, ...h].slice(0, 8))
      setIsRolling(false)

      let rollsStr: string
      if (mode === 'normal') {
        rollsStr = rolls.length > 1
          ? `[${rolls.join(', ')}] = ${rollSum}`
          : String(rolls[0])
      } else {
        rollsStr = `[${rolls[0]}, ${rolls[1]}] → kept ${rolls[0]}`
      }
      const modText = mod === 0 ? '' : `${fmtMod(mod)} = ${total}`
      addNarrative('dice', `${playerName} rolled ${notation}: ${rollsStr}${modText ? ' ' + modText : ''}`)
    }, 560)
  }

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    const mod = getPresetMod(preset.abilityKey, myCharacter?.modifiers)
    setSelectedDie(20)
    setDieCount(1)
    setModifier(mod)
    setRollMode('normal')
    doRoll(20, 1, mod, 'normal', preset.label)
  }

  const rollBtnLabel = () => {
    let modeStr = ''
    if (rollMode === 'advantage') modeStr = ' adv'
    else if (rollMode === 'disadvantage') modeStr = ' dis'
    const diceStr = dieCount > 1 ? `${dieCount}d${selectedDie}` : `d${selectedDie}`
    return `Roll ${diceStr}${modeStr}`
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="dice-roller">
      {/* Header + latest result badge / rolling indicator */}
      <div className="dice-roller-header">
        <span className="panel-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
          Dice Roller
        </span>
        <AnimatePresence mode="wait">
          {isRolling ? (
            <motion.span
              key="rolling"
              className="dice-rolling-indicator"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              aria-label="Rolling…"
            >
              d{selectedDie}
            </motion.span>
          ) : lastResult ? (
            <motion.span
              key={lastResult.key}
              className="dice-last-result"
              initial={{ opacity: 0, scale: 1.4, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              {lastResult.total}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Die type buttons */}
      <div className="dice-options">
        {DICE.map(d => (
          <motion.button
            key={d}
            className={[
              'die-btn',
              selectedDie === d ? 'die-btn-selected' : '',
              isRolling && selectedDie === d ? 'die-btn-rolling' : '',
            ].join(' ').trim()}
            onClick={() => { setSelectedDie(d); if (d !== 20) setRollMode('normal') }}
            whileTap={{ scale: 0.88 }}
          >
            d{d}
          </motion.button>
        ))}
      </div>

      {/* Count + modifier + roll button */}
      <div className="dice-controls">
        <label className="dice-mod-label" htmlFor="dice-count">#</label>
        <input
          id="dice-count"
          type="number"
          className="dice-mod-input dice-count-input"
          value={dieCount}
          min={1}
          max={20}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const v = Math.max(1, Math.min(20, Number(e.target.value)))
            setDieCount(v)
            if (v > 1) setRollMode('normal')
          }}
        />
        <label className="dice-mod-label" htmlFor="dice-mod">Mod</label>
        <input
          id="dice-mod"
          type="number"
          className="dice-mod-input"
          value={modifier}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModifier(Number(e.target.value))}
        />
        <motion.button
          className="dice-roll-btn"
          onClick={() => doRoll()}
          whileTap={{ scale: 0.94 }}
          disabled={isRolling}
        >
          {isRolling ? '...' : rollBtnLabel()}
        </motion.button>
      </div>

      {/* Advantage / Disadvantage — d20 single only */}
      {isD20Single && (
        <div className="dice-adv-row">
          <button
            className={`dice-adv-btn ${rollMode === 'advantage' ? 'dice-adv-active' : ''}`}
            onClick={() => setRollMode(m => m === 'advantage' ? 'normal' : 'advantage')}
          >
            Advantage
          </button>
          <button
            className={`dice-adv-btn dice-dis-btn ${rollMode === 'disadvantage' ? 'dice-dis-active' : ''}`}
            onClick={() => setRollMode(m => m === 'disadvantage' ? 'normal' : 'disadvantage')}
          >
            Disadvantage
          </button>
        </div>
      )}

      {/* Quick presets */}
      <div className="dice-presets">
        {PRESETS.map(preset => {
          const mod = getPresetMod(preset.abilityKey, myCharacter?.modifiers)
          const sign = mod > 0 ? '+' : ''
          const modStr = mod === 0 ? '' : ` ${sign}${mod}`
          return (
            <button
              key={preset.label}
              className="dice-preset-btn"
              onClick={() => handlePreset(preset)}
              disabled={isRolling}
            >
              {preset.label}{modStr}
            </button>
          )
        })}
      </div>

      {/* Roll breakdown — shows when there's math to display */}
      <AnimatePresence mode="wait">
        {lastResult && (lastResult.rolls.length > 1 || lastResult.modifier !== 0) && (
          <motion.div
            key={lastResult.key}
            className="dice-breakdown"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {lastResult.mode === 'normal' ? (
              <>
                {lastResult.rolls.length > 1 && (
                  <span className="dice-bd-brackets">[{lastResult.rolls.join(', ')}]</span>
                )}
                {lastResult.rolls.length === 1 && (
                  <span className="dice-bd-brackets">{lastResult.rolls[0]}</span>
                )}
                {lastResult.modifier !== 0 && (
                  <span className="dice-bd-mod">{fmtMod(lastResult.modifier)} = </span>
                )}
                {lastResult.modifier !== 0 && (
                  <strong className="dice-bd-total">{lastResult.total}</strong>
                )}
              </>
            ) : (
              <>
                <span className="dice-bd-die dice-bd-kept">{lastResult.rolls[0]}</span>
                <span className="dice-bd-sep">, </span>
                <span className="dice-bd-die dice-bd-dropped">{lastResult.rolls[1]}</span>
                <span className="dice-bd-arrow"> → {lastResult.rolls[0]}</span>
                {lastResult.modifier !== 0 && (
                  <span className="dice-bd-mod">{fmtMod(lastResult.modifier)} = </span>
                )}
                {lastResult.modifier !== 0 && (
                  <strong className="dice-bd-total">{lastResult.total}</strong>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roll history */}
      {history.length > 0 && (
        <div className="dice-history">
          <div className="dice-history-label">Recent Rolls</div>
          <div className="dice-history-list">
            {history.map((entry, i) => (
              <div
                key={entry.key}
                className={`dice-history-entry${i === 0 ? ' dice-history-latest' : ''}`}
              >
                <span className="dice-history-notation">{entry.notation}</span>
                <span className="dice-history-total">{entry.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
