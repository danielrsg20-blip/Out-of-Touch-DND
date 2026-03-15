import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function parseDiceResult(content: string): { label: string; result: string } | null {
  const totalMatch = content.match(/=\s*(\d+)\s*$/)
  if (totalMatch) {
    const label = content.slice(0, content.lastIndexOf('=')).trim()
    return { label, result: totalMatch[1] }
  }
  const simpleMatch = content.match(/:\s*(\d+)\s*$/)
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

export default function NarrativeLog() {
  const narrative = useGameStore(s => s.narrative)
  const isLoading = useGameStore(s => s.isLoading)
  const dmGenerationStatus = useGameStore(s => s.dmGenerationStatus)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showTimestamps, setShowTimestamps] = useState(false)

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

      <div className="narrative-entries">
        {narrative.length === 0 && (
          <p className="narrative-empty">The adventure has not yet begun...</p>
        )}

        {/* Each entry animates in */}
        {narrative.map(entry => {
          const isDice    = entry.type === 'dice'
          const diceData  = isDice ? parseDiceResult(entry.content) : null
          const isRound   = isRoundStartEntry(entry.type, entry.content)

          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={`narrative-entry narrative-${entry.type}${isRound ? ' narrative-round-start' : ''}`}
            >
              {showTimestamps && (
                <span className="narrative-timestamp">{formatTime(entry.timestamp)}</span>
              )}
              {entry.speaker && <span className="narrative-speaker">{entry.speaker}: </span>}
              {isDice && diceData ? (
                <span className="narrative-dice-content">
                  <span className="narrative-dice-label">{diceData.label}</span>
                  <span className="narrative-dice-result">{diceData.result}</span>
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
