import { useEffect, useRef } from 'react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

export default function NarrativeLog() {
  const narrative = useGameStore(s => s.narrative)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [narrative.length])

  return (
    <div className="narrative-log">
      <h3 className="panel-title">Adventure Log</h3>
      <div className="narrative-entries">
        {narrative.length === 0 && (
          <p className="narrative-empty">The adventure has not yet begun...</p>
        )}
        {narrative.map(entry => (
          <div key={entry.id} className={`narrative-entry narrative-${entry.type}`}>
            {entry.speaker && <span className="narrative-speaker">{entry.speaker}: </span>}
            <span className="narrative-content">{entry.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
