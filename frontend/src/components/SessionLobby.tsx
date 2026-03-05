import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import type { CampaignCharacter, CampaignSlot } from '../types'
import './SessionLobby.css'

const MOCK_MODE_STORAGE_KEY = 'otdnd.mockMode'

export default function SessionLobby() {
  const { username, logout } = useAuthStore()
  const [name, setName] = useState(username ?? '')
  const [joinCode, setJoinCode] = useState('')
  const [mockMode, setMockMode] = useState(false)
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [error, setError] = useState('')
  const [confirmSlot, setConfirmSlot] = useState<CampaignSlot | null>(null)
  const [resuming, setResuming] = useState(false)
  const [charPickSlot, setCharPickSlot] = useState<CampaignSlot | null>(null)
  const [charList, setCharList] = useState<CampaignCharacter[]>([])
  const [charListLoading, setCharListLoading] = useState(false)

  const {
    roomCode, players, createSession, joinSession, getSession,
    campaigns, campaignsLoading, listCampaigns, fetchCampaignCharacters, resumeCampaign,
  } = useSessionStore()

  useEffect(() => {
    try {
      const saved = globalThis.localStorage.getItem(MOCK_MODE_STORAGE_KEY)
      if (saved === 'true') {
        setMockMode(true)
      }
      if (saved === 'false') {
        setMockMode(false)
      }
    } catch {
      // Ignore storage access errors.
    }
  }, [])

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(MOCK_MODE_STORAGE_KEY, String(mockMode))
    } catch {
      // Ignore storage access errors.
    }
  }, [mockMode])

  useEffect(() => {
    if (!roomCode) {
      return
    }
    getSession(roomCode).catch(() => {})
  }, [roomCode, getSession])

  useEffect(() => {
    listCampaigns().catch(() => {})
  }, [listCampaigns])

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      await createSession(name.trim(), mockMode)
      useSessionStore.getState().setPhase('character_create')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session.')
    }
  }

  const handleJoin = async () => {
    if (!name.trim() || !joinCode.trim()) return
    try {
      await joinSession(joinCode.trim(), name.trim())
      useSessionStore.getState().setPhase('character_create')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join session. Check the room code.')
    }
  }

  const handleConfirmResume = async (slot: CampaignSlot) => {
    if (!name.trim()) {
      setError('Enter your name before resuming.')
      return
    }
    setError('')
    setCharListLoading(true)
    try {
      const chars = await fetchCampaignCharacters(slot.id)
      setCharList(chars)
      setCharPickSlot(slot)
      setConfirmSlot(null)
    } catch {
      setError('Failed to load characters.')
    } finally {
      setCharListLoading(false)
    }
  }

  const handleResume = async (slot: CampaignSlot, characterId?: string) => {
    setResuming(true)
    setError('')
    try {
      await resumeCampaign(slot.id, name.trim(), characterId)
      // Phase is set inside resumeCampaign based on has_character
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resume campaign.')
      setCharPickSlot(null)
      setCharList([])
    } finally {
      setResuming(false)
    }
  }

  return (
    <div className="lobby-wrapper">
      <div className="lobby-card">
        <div className="lobby-user-bar">
          <span className="lobby-user-name">Signed in as <strong>{username}</strong></span>
          <button className="lobby-logout-btn" type="button" onClick={logout}>Sign out</button>
        </div>

        <h1 className="lobby-title">Out of Touch DND</h1>
        <p className="lobby-subtitle">LLM-Powered Campaign Engine</p>

        {mode === 'menu' && (
          <>
            <div className="lobby-name-row">
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="lobby-input"
                maxLength={24}
              />
            </div>

            <div className="lobby-slots">
              <h3 className="lobby-slots-title">Your Campaigns</h3>
              {campaignsLoading && <p className="lobby-slots-loading">Loading...</p>}
              {!campaignsLoading && Array.from({ length: 5 }, (_, i) => i).map((i) => {
                const slot = campaigns[i]

                if (!slot) {
                  return (
                    <div key={`empty-${i}`} className="lobby-slot empty">
                      <span className="lobby-slot-empty-label">Empty Slot</span>
                    </div>
                  )
                }

                const isConfirming = confirmSlot?.id === slot.id
                const dateStr = new Date(slot.updated_at).toLocaleDateString()

                return (
                  <div key={slot.id} className={`lobby-slot${isConfirming ? ' confirming' : ''}`}>
                    <div className="lobby-slot-info">
                      <span className="lobby-slot-name">{slot.name}</span>
                      <span className="lobby-slot-meta">
                        {slot.my_character
                          ? `${slot.my_character.name} · ${slot.my_character.class} Lv${slot.my_character.level}`
                          : 'No character'}
                      </span>
                      <span className="lobby-slot-date">
                        Last played {dateStr} · {slot.session_count} session(s)
                      </span>
                    </div>
                    {!isConfirming && (
                      <button
                        className="lobby-btn secondary slot-join-btn"
                        type="button"
                        onClick={() => { setConfirmSlot(slot); setError('') }}
                      >
                        Resume
                      </button>
                    )}
                    {isConfirming && (
                      <div className="lobby-slot-confirm">
                        <span>Resume &ldquo;{slot.name}&rdquo;?</span>
                        <button
                          className="lobby-btn primary"
                          type="button"
                          onClick={() => handleConfirmResume(slot)}
                          disabled={charListLoading}
                        >
                          {charListLoading ? 'Loading...' : 'Yes'}
                        </button>
                        <button
                          className="lobby-btn ghost"
                          type="button"
                          onClick={() => setConfirmSlot(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="lobby-buttons">
              <button className="lobby-btn primary" type="button" onClick={() => setMode('create')}>
                Create Session
              </button>
              <button className="lobby-btn secondary" type="button" onClick={() => setMode('join')}>
                Join Session
              </button>
            </div>
          </>
        )}

        {charPickSlot && (
          <div className="lobby-char-pick">
            <p className="lobby-char-pick-title">
              Choose a character for &ldquo;{charPickSlot.name}&rdquo;
            </p>
            <div className="lobby-char-list">
              {charList.map((char) => (
                <div key={char.char_id} className={`lobby-char-item${char.is_mine ? ' mine' : ''}`}>
                  <div className="lobby-char-info">
                    <span className="lobby-char-name">{char.name}</span>
                    <span className="lobby-char-meta">{char.class} Lv{char.level}{char.is_mine ? ' · Yours' : ''}</span>
                  </div>
                  <button
                    className="lobby-btn primary slot-join-btn"
                    type="button"
                    onClick={() => handleResume(charPickSlot, char.char_id)}
                    disabled={resuming}
                  >
                    {resuming ? '...' : 'Play'}
                  </button>
                </div>
              ))}
              {charList.length === 0 && (
                <p className="lobby-slots-loading">No characters found — create one below.</p>
              )}
            </div>
            <div className="lobby-char-pick-actions">
              <button
                className="lobby-btn secondary"
                type="button"
                onClick={() => handleResume(charPickSlot)}
                disabled={resuming}
              >
                Create New Character
              </button>
              <button
                className="lobby-btn ghost"
                type="button"
                onClick={() => { setCharPickSlot(null); setCharList([]) }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!charPickSlot && mode === 'create' && (
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
            <label className="lobby-toggle-row">
              <input
                type="checkbox"
                checked={mockMode}
                onChange={(e) => setMockMode(e.target.checked)}
              />
              <span>Enable mock mode</span>
            </label>
            <button className="lobby-btn primary" type="button" onClick={handleCreate} disabled={!name.trim()}>
              Create
            </button>
            <button className="lobby-btn ghost" type="button" onClick={() => setMode('menu')}>
              Back
            </button>
          </div>
        )}

        {!charPickSlot && mode === 'join' && (
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
            <button className="lobby-btn primary" type="button" onClick={handleJoin} disabled={!name.trim() || !joinCode.trim()}>
              Join
            </button>
            <button className="lobby-btn ghost" type="button" onClick={() => setMode('menu')}>
              Back
            </button>
          </div>
        )}

        {error && <p className="lobby-error">{error}</p>}

        {roomCode && (
          <div className="lobby-roster">
            <div className="lobby-roster-head">
              <span className="lobby-roster-room">Room: {roomCode}</span>
              <span className="lobby-roster-count">{players.length} player(s)</span>
            </div>
            <ul className="lobby-roster-list">
              {players.map((player) => (
                <li key={player.id} className="lobby-roster-item">
                  <span>{player.name}</span>
                  <span className="lobby-roster-meta">{player.character_id ? 'Character ready' : 'No character yet'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
