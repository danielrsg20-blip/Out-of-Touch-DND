import { useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import './SessionLobby.css'

export default function SessionLobby() {
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [error, setError] = useState('')

  const { createSession, joinSession } = useSessionStore()

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      await createSession(name.trim())
      useSessionStore.getState().setPhase('character_create')
    } catch {
      setError('Failed to create session.')
    }
  }

  const handleJoin = async () => {
    if (!name.trim() || !joinCode.trim()) return
    try {
      await joinSession(joinCode.trim(), name.trim())
      useSessionStore.getState().setPhase('character_create')
    } catch {
      setError('Failed to join session. Check the room code.')
    }
  }

  return (
    <div className="lobby-wrapper">
      <div className="lobby-card">
        <h1 className="lobby-title">Out of Touch DND</h1>
        <p className="lobby-subtitle">LLM-Powered Campaign Engine</p>

        {mode === 'menu' && (
          <div className="lobby-buttons">
            <button className="lobby-btn primary" onClick={() => setMode('create')}>
              Create Session
            </button>
            <button className="lobby-btn secondary" onClick={() => setMode('join')}>
              Join Session
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="lobby-form">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="lobby-input"
              maxLength={24}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button className="lobby-btn primary" onClick={handleCreate} disabled={!name.trim()}>
              Create
            </button>
            <button className="lobby-btn ghost" onClick={() => setMode('menu')}>
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="lobby-form">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="lobby-input"
              maxLength={24}
              autoFocus
            />
            <input
              type="text"
              placeholder="Room code (e.g. GOBLIN-42)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              className="lobby-input"
              maxLength={20}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            <button className="lobby-btn primary" onClick={handleJoin} disabled={!name.trim() || !joinCode.trim()}>
              Join
            </button>
            <button className="lobby-btn ghost" onClick={() => setMode('menu')}>
              Back
            </button>
          </div>
        )}

        {error && <p className="lobby-error">{error}</p>}
      </div>
    </div>
  )
}
