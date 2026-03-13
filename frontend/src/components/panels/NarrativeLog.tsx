import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Extract a numeric result from dice entry content, e.g. "Roll d20: 17 (mod +3 = 20)" → "20"
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

export default function NarrativeLog() {
  const narrative = useGameStore(s => s.narrative)
  const isLoading = useGameStore(s => s.isLoading)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showTimestamps, setShowTimestamps] = useState(false)

  const isRoundStartEntry = (entryType: string, content: string) => {
    return entryType === 'system' && /^Round\s+\d+\s+begins\.?$/i.test(content.trim())
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [narrative.length, isLoading])

  return (
    <div className="narrative-log">
      <div className="narrative-log-header">
        <h3 className="panel-title" style={{ marginBottom: 0 }}>Adventure Log</h3>
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
        {narrative.map(entry => {
          const isDice = entry.type === 'dice'
          const diceData = isDice ? parseDiceResult(entry.content) : null
          return (
            <div
              key={entry.id}
              className={`narrative-entry narrative-${entry.type}${isRoundStartEntry(entry.type, entry.content) ? ' narrative-round-start' : ''}`}
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
            </div>
          )
        })}
        {isLoading && (
          <div className="dm-typing">
            <div className="dm-typing-dots">
              <span /><span /><span />
            </div>
            <span>DM is composing…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
