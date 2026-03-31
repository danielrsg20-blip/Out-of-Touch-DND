import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function detectCritType(content: string): 'crit' | 'fumble' | null {
  if (!/d20/i.test(content)) return null
  // Advantage / disadvantage: "kept <N>"
  const keptMatch = /kept\s+(\d+)/.exec(content)
  if (keptMatch) {
    const n = Number.parseInt(keptMatch[1], 10)
    if (n === 20) return 'crit'
    if (n === 1) return 'fumble'
    return null
  }
  // Simple d20: "d20[^:]*: <N>" — raw die value before any modifier
  const rawMatch = /d20[^:]*:\s*(\d+)/.exec(content)
  if (rawMatch) {
    const n = Number.parseInt(rawMatch[1], 10)
    if (n === 20) return 'crit'
    if (n === 1) return 'fumble'
  }
  return null
}

function parseDiceResult(content: string): { label: string; result: string } | null {
  const totalMatch = /=\s*(\d+)\s*$/.exec(content)
  if (totalMatch) {
    const label = content.slice(0, content.lastIndexOf('=')).trim()
    return { label, result: totalMatch[1] }
  }
  const simpleMatch = /:\s*(\d+)\s*$/.exec(content)
  if (simpleMatch) {
    const label = content.slice(0, content.lastIndexOf(':')).trim()
    return { label, result: simpleMatch[1] }
  }
  return null
}

function friendlyFallbackReason(reason: string | null | undefined): string {
  const normalized = (reason ?? '').trim().toLowerCase()
  if (!normalized) {
    return 'Provider fallback used.'
  }

  if (normalized === 'missing_openai_key') {
    return 'OpenAI API key is missing.'
  }
  if (normalized === 'missing_groq_key') {
    return 'Groq API key is missing.'
  }
  if (normalized === 'missing_anthropic_key') {
    return 'Anthropic API key is missing.'
  }
  if (normalized === 'request_timeout') {
    return 'Provider request timed out.'
  }
  if (normalized === 'empty_response') {
    return 'Provider returned an empty response.'
  }
  if (normalized.startsWith('unsupported_provider:')) {
    const provider = normalized.split(':')[1] || 'unknown'
    return `Unsupported DM provider: ${provider}.`
  }

  return `Provider fallback reason: ${reason}`
}

type NarrativeFilter = 'all' | 'dm' | 'player' | 'dice' | 'system'

const FILTER_LABELS: Record<NarrativeFilter, string> = {
  all: 'All',
  dm: 'DM',
  player: 'Player',
  dice: 'Dice',
  system: 'System',
}

export default function NarrativeLog() {
  const narrative = useGameStore(s => s.narrative)
  const isLoading = useGameStore(s => s.isLoading)
  const dmGenerationStatus = useGameStore(s => s.dmGenerationStatus)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [activeFilter, setActiveFilter] = useState<NarrativeFilter>('all')

  const isRoundStartEntry = (entryType: string, content: string) =>
    entryType === 'system' && /^Round\s+\d+\s+begins\.?$/i.test(content.trim())

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [narrative.length, isLoading])

  return (
    <div className="narrative-log">
      {/* Header */}
      <div className="narrative-log-header">
        <h3 className="panel-title" style={{ marginBottom: 0 }}>Adventure Log</h3>
        {dmGenerationStatus && (
          <span
            className={`dm-provider-indicator ${dmGenerationStatus.fallback ? 'is-fallback' : 'is-provider'}`}
            title={dmGenerationStatus.fallback
              ? friendlyFallbackReason(dmGenerationStatus.reason)
              : `Provider response via ${dmGenerationStatus.provider}/${dmGenerationStatus.model}`}
          >
            {dmGenerationStatus.fallback
              ? `Fallback · ${dmGenerationStatus.provider}`
              : `AI · ${dmGenerationStatus.provider}`}
          </span>
        )}
        <button
          className={`narrative-ts-toggle${showTimestamps ? ' active' : ''}`}
          onClick={() => setShowTimestamps(t => !t)}
          title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
        >
          🕐
        </button>
      </div>

      {/* Filter row */}
      <div className="narrative-filter-row">
        {(Object.keys(FILTER_LABELS) as NarrativeFilter[]).map(f => (
          <button
            key={f}
            className={`narrative-filter-btn${activeFilter === f ? ' narrative-filter-active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="narrative-entries">
        {narrative.length === 0 && (
          <p className="narrative-empty">The adventure has not yet begun...</p>
        )}

        {/* Each entry animates in */}
        {narrative.filter(e => activeFilter === 'all' || e.type === activeFilter).map(entry => {
          const isDice    = entry.type === 'dice'
          const diceData  = isDice ? parseDiceResult(entry.content) : null
          const isRound   = isRoundStartEntry(entry.type, entry.content)
          const critType  = isDice ? detectCritType(entry.content) : null

          const entryClass = [
            'narrative-entry',
            `narrative-${entry.type}`,
            isRound ? 'narrative-round-start' : '',
            critType === 'crit'   ? 'narrative-crit'   : '',
            critType === 'fumble' ? 'narrative-fumble'  : '',
          ].filter(Boolean).join(' ')

          let entryAnim: { initial: object; animate: object; transition: object }
          if (critType === 'crit') {
            entryAnim = { initial: { opacity: 0, scale: 0.85, y: 6 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { type: 'spring' as const, stiffness: 420, damping: 18 } }
          } else if (critType === 'fumble') {
            entryAnim = { initial: { opacity: 0, x: -8, y: 4 }, animate: { opacity: 1, x: 0, y: 0 }, transition: { type: 'spring' as const, stiffness: 500, damping: 20 } }
          } else {
            entryAnim = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22 } }
          }

          return (
            <motion.div
              key={entry.id}
              {...entryAnim}
              className={entryClass}
            >
              {showTimestamps && (
                <span className="narrative-timestamp">{formatTime(entry.timestamp)}</span>
              )}
              {entry.speaker && <span className="narrative-speaker">{entry.speaker}: </span>}
              {isDice && diceData ? (
                <span className="narrative-dice-content">
                  <span className="narrative-dice-label">{diceData.label}</span>
                  <span className={`narrative-dice-result${critType === 'crit' ? ' dice-nat20' : ''}${critType === 'fumble' ? ' dice-nat1' : ''}`}>
                    {diceData.result}
                  </span>
                </span>
              ) : (
                <span className="narrative-content">{entry.content}</span>
              )}
            </motion.div>
          )
        })}

        {/* DM typing indicator */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="dm-typing"
            >
              <div className="dm-typing-dots">
                <motion.span
                  animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                />
                <motion.span
                  animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0.18 }}
                />
                <motion.span
                  animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0.36 }}
                />
              </div>
              <span>DM is composing…</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
