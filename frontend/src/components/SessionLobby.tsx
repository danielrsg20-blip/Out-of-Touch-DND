import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import type { CampaignCharacter, CampaignSlot } from '../types'
import './SessionLobby.css'

const MOCK_MODE_STORAGE_KEY = 'otdnd.mockMode'

// Deterministic floating particles
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  key: i,
  left: (Math.sin(i * 2.9) * 0.5 + 0.5) * 100,
  top:  (Math.cos(i * 1.4) * 0.5 + 0.5) * 100,
  size: 1.2 + Math.abs(Math.sin(i * 4.1)) * 2.2,
  duration: 7 + Math.abs(Math.cos(i * 1.7)) * 11,
  delay: -(Math.abs(Math.sin(i * 1.1 + 0.5)) * 9),
  opacity: 0.1 + Math.abs(Math.sin(i * 2.3 + 1)) * 0.25,
}))

// Accent color per slot index
const SLOT_COLORS = ['#9b59b6', '#3498db', '#2ecc71', '#e67e22', '#e4a853']

// Date freshness
function slotFreshness(updatedAt: string): 'fresh' | 'recent' | 'old' {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000
  if (days < 7) return 'fresh'
  if (days < 30) return 'recent'
  return 'old'
}

// Skeleton row for loading state
function SlotSkeleton({ index }: { index: number }) {
  return (
    <div className="lobby-slot skeleton" style={{ '--slot-color': SLOT_COLORS[index] } as React.CSSProperties}>
      <div className="lobby-slot-index">{index + 1}</div>
      <div className="lobby-skeleton-content">
        <div className="lobby-skeleton-line wide" />
        <div className="lobby-skeleton-line narrow" />
        <div className="lobby-skeleton-line mid" />
      </div>
    </div>
  )
}

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

      {/* Floating particles */}
      <div className="lobby-particles" aria-hidden="true">
        {PARTICLES.map(p => (
          <span
            key={p.key}
            className="lobby-particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      <div className="lobby-card">

        {/* ── User bar ── */}
        <div className="lobby-user-bar">
          <div className="lobby-user-info">
            <div className="lobby-avatar" aria-hidden="true">
              {(username ?? '?')[0].toUpperCase()}
            </div>
            <div className="lobby-user-text">
              <span className="lobby-user-greeting">Welcome back</span>
              <strong className="lobby-user-display">{username}</strong>
            </div>
          </div>
          <button className="lobby-logout-btn" type="button" onClick={logout}>Sign out</button>
        </div>

        {/* ── Header ── */}
        <div className="lobby-header">
          <h1 className="lobby-title">Out of Touch DND</h1>
          <p className="lobby-subtitle">LLM-Powered Campaign Engine</p>
          <div className="lobby-divider" />
        </div>

        {/* ── MENU MODE ── */}
        {mode === 'menu' && !charPickSlot && (
          <>
            {/* Display-name input */}
            <div className="lobby-name-row">
              <label className="lobby-name-label" htmlFor="lobby-name-input">Session Name</label>
              <input
                id="lobby-name-input"
                type="text"
                placeholder="Your name in session"
                value={name}
                onChange={e => setName(e.target.value)}
                className="lobby-input"
                maxLength={24}
              />
            </div>

            {/* Campaign slots */}
            <div className="lobby-slots">
              <div className="lobby-slots-header">
                <h3 className="lobby-slots-title">Your Campaigns</h3>
                {!campaignsLoading && (
                  <span className="lobby-slots-count">{campaigns.length} / 5</span>
                )}
              </div>

              {campaignsLoading
                ? Array.from({ length: 5 }, (_, i) => <SlotSkeleton key={i} index={i} />)
                : Array.from({ length: 5 }, (_, i) => {
                    const slot = campaigns[i]
                    const color = SLOT_COLORS[i]

                    if (!slot) {
                      return (
                        <div
                          key={`empty-${i}`}
                          className="lobby-slot empty"
                          style={{ '--slot-color': color } as React.CSSProperties}
                          onClick={() => setMode('create')}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === 'Enter' && setMode('create')}
                          aria-label="Start a new campaign"
                        >
                          <div className="lobby-slot-index">{i + 1}</div>
                          <span className="lobby-slot-empty-icon">+</span>
                          <span className="lobby-slot-empty-label">New Campaign</span>
                        </div>
                      )
                    }

                    const isConfirming = confirmSlot?.id === slot.id
                    const dateStr = new Date(slot.updated_at).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                    const freshness = slotFreshness(slot.updated_at)

                    return (
                      <div
                        key={slot.id}
                        className={`lobby-slot${isConfirming ? ' confirming' : ''}`}
                        style={{ '--slot-color': color } as React.CSSProperties}
                      >
                        <div className="lobby-slot-index">{i + 1}</div>
                        <div className="lobby-slot-info">
                          <span className="lobby-slot-name">{slot.name}</span>
                          <span className="lobby-slot-meta">
                            {slot.my_character
                              ? (
                                <>
                                  {slot.my_character.name}
                                  <span className="lobby-slot-class"> · {slot.my_character.class}</span>
                                  <span className="lobby-slot-level"> Lv{slot.my_character.level}</span>
                                </>
                              )
                              : <span className="lobby-slot-nochar">No character yet</span>
                            }
                          </span>
                          <div className="lobby-slot-footer">
                            <span className={`lobby-slot-date ${freshness}`}>{dateStr}</span>
                            <span className="lobby-slot-sessions">
                              {slot.session_count} session{slot.session_count !== 1 ? 's' : ''}
                            </span>
                          </div>
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
                            <span className="lobby-slot-confirm-label">Continue this campaign?</span>
                            <div className="lobby-slot-confirm-actions">
                              <button
                                className="lobby-btn primary"
                                type="button"
                                onClick={() => handleConfirmResume(slot)}
                                disabled={charListLoading}
                              >
                                {charListLoading ? '…' : 'Yes, Resume'}
                              </button>
                              <button
                                className="lobby-btn ghost"
                                type="button"
                                onClick={() => setConfirmSlot(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>

            {/* Primary actions */}
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

        {/* ── CHARACTER PICKER ── */}
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
                    <span className="lobby-char-meta">
                      {char.class} Lv{char.level}
                      {char.is_mine && <span className="lobby-char-yours"> · Yours</span>}
                    </span>
                  </div>
                  <button
                    className="lobby-btn primary slot-join-btn"
                    type="button"
                    onClick={() => handleResume(charPickSlot, char.char_id)}
                    disabled={resuming}
                  >
                    {resuming ? '…' : 'Play'}
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

        {/* ── CREATE MODE ── */}
        {!charPickSlot && mode === 'create' && (
          <div className="lobby-form">
            <h3 className="lobby-form-title">New Campaign</h3>
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
              ← Back
            </button>
          </div>
        )}

        {/* ── JOIN MODE ── */}
        {!charPickSlot && mode === 'join' && (
          <div className="lobby-form">
            <h3 className="lobby-form-title">Join a Campaign</h3>
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
            <button
              className="lobby-btn primary"
              type="button"
              onClick={handleJoin}
              disabled={!name.trim() || !joinCode.trim()}
            >
              Join
            </button>
            <button className="lobby-btn ghost" type="button" onClick={() => setMode('menu')}>
              ← Back
            </button>
          </div>
        )}

        {/* ── ERROR ── */}
        {error && <p className="lobby-error">{error}</p>}

        {/* ── ROSTER (after joining a room) ── */}
        {roomCode && (
          <div className="lobby-roster">
            <div className="lobby-roster-head">
              <span className="lobby-roster-room">Room: <strong>{roomCode}</strong></span>
              <span className="lobby-roster-count">
                {players.length} player{players.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="lobby-roster-list">
              {players.map((player) => (
                <li key={player.id} className="lobby-roster-item">
                  <div className="lobby-roster-avatar">{(player.name[0] ?? '?').toUpperCase()}</div>
                  <span className="lobby-roster-name">{player.name}</span>
                  <span className={`lobby-roster-meta${player.character_id ? ' ready' : ''}`}>
                    {player.character_id ? '✓ Ready' : 'No character'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  )
}
