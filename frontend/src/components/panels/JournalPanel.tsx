import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

const AUTOSAVE_DELAY_MS = 1200

export default function JournalPanel() {
  const roomCode = useSessionStore(s => s.roomCode)
  const campaignId = useSessionStore(s => s.campaignId)

  const storageKey = `otdnd_journal_${campaignId ?? roomCode ?? 'default'}`

  const [notes, setNotes] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? ''
    } catch {
      return ''
    }
  })
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If campaign changes (resume), reload from storage
  useEffect(() => {
    try {
      setNotes(localStorage.getItem(storageKey) ?? '')
    } catch { /* ignore */ }
  }, [storageKey])

  const persist = useCallback((text: string) => {
    try {
      localStorage.setItem(storageKey, text)
      setSavedAt(new Date())
    } catch { /* storage full — ignore */ }
  }, [storageKey])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNotes(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => persist(value), AUTOSAVE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const savedHint = savedAt
    ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Auto-saves as you type'

  return (
    <div className="journal-panel">
      <h3 className="panel-title">Journal</h3>
      <textarea
        className="journal-textarea"
        value={notes}
        onChange={handleChange}
        placeholder="Keep notes about your adventure — NPCs, clues, quests, secrets…"
        spellCheck={false}
        aria-label="Campaign journal notes"
      />
      <div className="journal-saved-hint">{savedHint}</div>
    </div>
  )
}
