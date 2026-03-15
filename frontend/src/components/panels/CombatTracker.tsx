import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

export default function CombatTracker() {
  const combat = useGameStore(s => s.combat)
  const playerId = useSessionStore(s => s.playerId)
  const players = useSessionStore(s => s.players)
  const myCharacterId = players.find(p => p.id === playerId)?.character_id ?? null
  const isMyTurn = !!(combat?.is_active && combat.current_turn === myCharacterId)
  const [roundKey, setRoundKey] = useState(0)

  useEffect(() => {
    if (!combat?.is_active) return
    setRoundKey(k => k + 1)
  }, [combat?.is_active, combat?.round])

  if (!combat || !combat.is_active) return null

  const currentTotal = Number(combat.current_movement_total ?? 0)
  const currentRemaining = Number(combat.current_movement_remaining ?? 0)
  const currentUsed = Math.max(0, currentTotal - currentRemaining)

  return (
    <div className="combat-tracker">
      <h3 className="panel-title combat-title-row">
        <span>Combat</span>
        <motion.span
          key={roundKey}
          className="combat-round-badge"
          initial={{ scale: 1.25, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 340, damping: 20 }}
        >
          Round {combat.round}
        </motion.span>
      </h3>

      <AnimatePresence>
        {isMyTurn && (
          <motion.div
            className="your-turn-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{
              opacity: [1, 0.7, 1],
              y: 0,
              boxShadow: [
                '0 0 8px rgba(228,168,83,0.4)',
                '0 0 18px rgba(228,168,83,0.75)',
                '0 0 8px rgba(228,168,83,0.4)',
              ],
            }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              y: { duration: 0.18 },
              opacity: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
              boxShadow: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            ⚔ Your Turn
          </motion.div>
        )}
      </AnimatePresence>

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
                <motion.div
                  className="init-hp-fill"
                  initial={false}
                  animate={{ width: `${hpPercent}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <span className="init-hp-text">{entry.hp}/{entry.max_hp}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
