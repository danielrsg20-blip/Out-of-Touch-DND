import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import type { CombatData } from '../../types'

export default function InitiativeReveal() {
  const combat = useGameStore(s => s.combat)
  const [snapshot, setSnapshot] = useState<CombatData | null>(null)
  const [revealedCount, setRevealedCount] = useState(0)
  const prevActiveRef = useRef(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      prevActiveRef.current = !!combat?.is_active
      return
    }

    const isActive = !!combat?.is_active
    const wasActive = prevActiveRef.current
    prevActiveRef.current = isActive

    if (!wasActive && isActive && combat) {
      setSnapshot({ ...combat })
      setRevealedCount(0)
      const total = combat.initiative_order.length
      combat.initiative_order.forEach((_, i) => {
        window.setTimeout(() => setRevealedCount(i + 1), 150 + i * 380)
      })
      window.setTimeout(() => setSnapshot(null), 150 + total * 380 + 1600)
    }

    if (wasActive && !isActive) {
      setSnapshot(null)
    }
  }, [combat?.is_active]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!snapshot) return null

  const visibleEntries = snapshot.initiative_order.slice(0, revealedCount)

  return (
    <div className="initiative-reveal">
      <div className="initiative-reveal-title">⚔ Initiative Order</div>
      <div className="initiative-reveal-list">
        {visibleEntries.map((entry, idx) => (
          <div key={entry.id} className={`initiative-reveal-entry${idx === 0 ? ' first' : ''}`}>
            <span className="initiative-roll-num">{entry.initiative}</span>
            <span className="initiative-roll-name">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
