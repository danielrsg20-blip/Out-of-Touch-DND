import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import MapCanvas from './map/MapCanvas'
import InitiativeReveal from './map/InitiativeReveal'
import NarrativeLog from './panels/NarrativeLog'
import ChatInput from './panels/ChatInput'
import CombatTracker from './panels/CombatTracker'
import CharacterSheet from './panels/CharacterSheet'
import ActionBar from './panels/ActionBar'
import BattlemapActions from './panels/BattlemapActions'
import DiceRoller from './panels/DiceRoller'
import CodexPanel from './panels/CodexPanel'
import VoiceControl from './VoiceControl'
import VectorOverlayTester from './VectorOverlayTester'
import CampaignBriefOverlay from './CampaignBriefOverlay'
import { useWebSocket } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import { callBackendApi } from '../lib/backendApi'
import { CollisionGrid } from '../lib/systems/movement/collisionGrid'
import { MovementController } from '../lib/systems/movement/movementController'
import { resolveMapMode } from '../lib/battlemapState'
import { narrationOrchestrator } from '../lib/narrationOrchestrator'
import './GameBoard.css'

const AVATAR_COLORS = ['#9b59b6', '#3498db', '#2ecc71', '#e67e22', '#e74c3c']

function showOverlayTester(): boolean {
  return new URLSearchParams(window.location.search).get('overlayDebug') === '1'
}

export default function GameBoard() {
  const { sendAction, sendMoveToken, sendSpellCast, transcribeVoiceInput, runVoiceTest } = useWebSocket()
  const { roomCode, playerId, players, campaignTitle, reset } = useSessionStore()
  const { token, logout } = useAuthStore()
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [sessionMenuSaving, setSessionMenuSaving] = useState(false)
  const {
    selectedEntityId,
    setSelectedEntity,
    usage,
    voiceEnabled,
    ttsEnabled,
    voiceSpeed,
    transcriptMode,
    setVoiceEnabled,
    setTtsEnabled,
    setVoiceSpeed,
    setTranscriptMode,
    addNarrative,
  } = useGameStore()
  const [chatDraft, setChatDraft] = useState('')
  const [targetingSpell, setTargetingSpell] = useState<{ name: string; slotLevel: number } | null>(null)
  const [briefDismissed, setBriefDismissed] = useState(true)
  const autoBootstrapRef = useRef(false)

  const narrative = useGameStore(state => state.narrative)
  // Show brief when no DM has spoken yet and user hasn't dismissed it
  const showBrief = !briefDismissed && narrative.filter(e => e.type === 'dm').length === 0

  // Automatically bootstrap the opening narration once after entering the board.
  useEffect(() => {
    if (autoBootstrapRef.current) {
      return
    }
    if (!roomCode || !playerId) {
      return
    }
    const hasDmNarrative = narrative.some((entry) => entry.type === 'dm')
    if (hasDmNarrative) {
      return
    }

    autoBootstrapRef.current = true
    sendAction('[SESSION_START]')
  }, [narrative, playerId, roomCode, sendAction])

  const handleBeginAdventure = useCallback(() => {
    setBriefDismissed(true)
    sendAction('[SESSION_START]')
  }, [sendAction])

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sessionMenuOpen])

  const doSaveCampaign = useCallback(async (): Promise<void> => {
    if (!roomCode || !token) return
    const { characters, map, narrative } = useGameStore.getState()
    const myPlayer = useSessionStore.getState().players.find(p => p.id === playerId)
    await callBackendApi('/api/campaign/direct-save', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        room_code: roomCode,
        campaign_name: campaignTitle ?? roomCode,
        characters,
        map,
        conversation: narrative,
        my_character_id: myPlayer?.character_id ?? null,
      },
    })
  }, [roomCode, token, campaignTitle, playerId])

  const handleSaveCampaign = useCallback(async () => {
    setSessionMenuSaving(true)
    try {
      await doSaveCampaign()
    } catch {
      // Non-critical
    } finally {
      setSessionMenuSaving(false)
    }
  }, [doSaveCampaign])

  const handleReturnToLobby = useCallback(async () => {
    setSessionMenuSaving(true)
    try {
      await doSaveCampaign()
    } catch {
      // Non-critical — return to lobby even if save fails
    }
    setSessionMenuSaving(false)
    setSessionMenuOpen(false)
    reset()
  }, [doSaveCampaign, reset])

  const handleLogout = useCallback(() => {
    setSessionMenuOpen(false)
    reset()
    logout()
  }, [reset, logout])

  const [railWidth, setRailWidth] = useState(300)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'stats' | 'codex'>('stats')

  const map = useGameStore(state => state.map)

  const handleTileClick = useCallback((gx: number, gy: number) => {
    const player = players.find(p => p.id === playerId)
    if (!player?.character_id || selectedEntityId !== player.character_id) {
      return
    }

    console.log(`[GameBoard.handleTileClick] Moving ${player.character_id} to (${gx},${gy})`)

    // Validate movement locally before sending
    if (!map) {
      console.log(`[GameBoard.handleTileClick] No map available`)
      addNarrative('system', 'Map not loaded')
      return
    }

    const grid = new CollisionGrid(map.width, map.height)
    grid.buildFromMap(
      map.tiles,
      map.width,
      map.height,
      map.traversal_grid,
      { mapMode: resolveMapMode(map) },
    )
    grid.updateEntityBlocking(map.entities.filter(e => e.id !== player.character_id))

    // Create a state object with entities for validation
    const validationState = { entities: map.entities }
    const validation = MovementController.validateLocalMove(
      player.character_id,
      gx,
      gy,
      grid,
      validationState,
      map
    )

    if (!validation.valid) {
      console.log(`[GameBoard.handleTileClick] Validation failed: ${validation.error}`)
      addNarrative('system', validation.error || 'Invalid move')
      return
    }

    console.log(`[GameBoard.handleTileClick] Validation passed, sending move`)
    sendMoveToken(player.character_id, gx, gy)
    setSelectedEntity(null)
  }, [playerId, players, selectedEntityId, map, sendMoveToken, setSelectedEntity, addNarrative])

  const handleEntityClick = useCallback((entityId: string) => {
    if (targetingSpell) {
      sendSpellCast(targetingSpell.name, targetingSpell.slotLevel, entityId)
      setTargetingSpell(null)
      return
    }
    setSelectedEntity(selectedEntityId === entityId ? null : entityId)
  }, [selectedEntityId, setSelectedEntity, targetingSpell, sendSpellCast])

  useEffect(() => {
    if (!targetingSpell) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setTargetingSpell(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [targetingSpell])

  const handleRailDragStart = (e: React.MouseEvent) => {
    if (railCollapsed) return
    const startX = e.clientX, startW = railWidth
    const onMove = (ev: MouseEvent) => setRailWidth(Math.max(180, Math.min(520, startW + ev.clientX - startX)))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  const handleSidebarDragStart = (e: React.MouseEvent) => {
    if (sidebarCollapsed) return
    const startX = e.clientX, startW = sidebarWidth
    const onMove = (ev: MouseEvent) => setSidebarWidth(Math.max(220, Math.min(560, startW - (ev.clientX - startX))))
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  const handleVoiceTranscript = useCallback(async (audioBase64: string) => {
    const transcript = await transcribeVoiceInput(audioBase64)
    if (!transcript) {
      addNarrative('system', 'Voice input captured, but no transcript was returned.')
      return
    }

    if (transcriptMode === 'review') {
      setChatDraft(transcript)
      addNarrative('system', 'Voice transcript ready. Review and press Send when ready.')
      return
    }

    const ctx = narrationOrchestrator.getInterruptContext()
    sendAction(ctx ? `${ctx} ${transcript}` : transcript)
  }, [addNarrative, sendAction, transcriptMode, transcribeVoiceInput])

  const handleVoiceTranscriptText = useCallback(async (transcript: string) => {
    const normalized = transcript.trim()
    if (!normalized) {
      addNarrative('system', 'Voice input captured, but no speech was detected.')
      return
    }

    if (transcriptMode === 'review') {
      setChatDraft(normalized)
      addNarrative('system', 'Voice transcript ready. Review and press Send when ready.')
      return
    }

    const ctx = narrationOrchestrator.getInterruptContext()
    sendAction(ctx ? `${ctx} ${normalized}` : normalized)
  }, [addNarrative, sendAction, transcriptMode])

  return (
    <div className="game-board">
      <header className="flex items-center gap-3 px-4 py-[0.45rem] bg-[var(--bg-secondary)] border-b border-[var(--border-color)] shrink-0 relative">
        {/* Gold gradient line replacing ::after pseudo-element */}
        <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(228,168,83,0.4) 0%, transparent 60%)' }}
        />
        <span className="font-bold text-[var(--accent-gold)] text-[0.9rem] tracking-[0.02em] whitespace-nowrap">
          Out of Touch DND
        </span>
        <Badge
          variant="outline"
          className="font-mono bg-[rgba(228,168,83,0.12)] text-[var(--accent-gold)] border-[rgba(228,168,83,0.2)] text-[0.78rem] px-2 py-0 rounded-[3px]"
        >
          {roomCode}
        </Badge>
        <div className="w-px h-4 bg-[var(--border-color)] shrink-0" aria-hidden="true" />
        <div className="flex items-center gap-[0.3rem] flex-1">
          {players.map((p, i) => (
            <motion.span
              key={p.id}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold text-white shrink-0 cursor-default${p.id === playerId ? ' ring-2 ring-[var(--accent-gold)]' : ' ring-2 ring-[var(--bg-secondary)]'}`}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              title={p.name}
              whileHover={{ scale: 1.15, zIndex: 1 }}
              transition={{ duration: 0.15 }}
            >
              {(p.name[0] ?? '?').toUpperCase()}
            </motion.span>
          ))}
        </div>
        {(usage?.estimated_cost_usd ?? 0) > 0 && (
          <Badge
            variant="outline"
            className="font-mono text-[var(--text-secondary)] text-[0.72rem] bg-[rgba(255,255,255,0.04)] border-[var(--border-color)] px-[0.4rem] py-[0.15rem] rounded-[3px]"
          >
            ${(usage?.estimated_cost_usd ?? 0).toFixed(3)}
          </Badge>
        )}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setSessionMenuOpen(o => !o)}
            className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-accent-gold hover:bg-[rgba(228,168,83,0.1)] transition-colors text-lg leading-none"
            title="Session menu"
            aria-label="Session menu"
          >
            ⋮
          </button>
          {sessionMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-47.5 rounded-md border border-border bg-bg-secondary shadow-lg py-1 text-sm">
              <button
                onClick={handleSaveCampaign}
                disabled={sessionMenuSaving}
                className="w-full text-left px-4 py-2 text-text-primary hover:bg-[rgba(228,168,83,0.1)] hover:text-accent-gold disabled:opacity-50 transition-colors"
              >
                {sessionMenuSaving ? 'Saving…' : 'Save campaign'}
              </button>
              <button
                onClick={handleReturnToLobby}
                disabled={sessionMenuSaving}
                className="w-full text-left px-4 py-2 text-text-primary hover:bg-[rgba(228,168,83,0.1)] hover:text-accent-gold disabled:opacity-50 transition-colors"
              >
                Return to lobby
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-text-secondary hover:bg-[rgba(255,80,80,0.08)] hover:text-[#ff6b6b] transition-colors"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="game-content">
        <div
          className={`adventure-rail${railCollapsed ? ' panel-collapsed' : ''}`}
          style={{ width: railCollapsed ? 0 : railWidth }}
        >
          <NarrativeLog />
          <VoiceControl
            enabled={voiceEnabled}
            onToggle={setVoiceEnabled}
            ttsEnabled={ttsEnabled}
            onToggleTts={setTtsEnabled}
            voiceSpeed={voiceSpeed}
            onVoiceSpeedChange={setVoiceSpeed}
            transcriptMode={transcriptMode}
            onTranscriptModeChange={setTranscriptMode}
            onTranscript={handleVoiceTranscript}
            onTranscriptText={handleVoiceTranscriptText}
            onVoiceTest={runVoiceTest}
            onPttStart={() => narrationOrchestrator.interrupt()}
            onPauseNarration={() => narrationOrchestrator.interrupt()}
          />
          <ChatInput onSend={sendAction} draftText={chatDraft} onDraftTextChange={setChatDraft} />
        </div>

        <div className="panel-resize-handle" onMouseDown={handleRailDragStart}>
          <button
            type="button"
            className="panel-collapse-btn"
            onClick={() => setRailCollapsed(v => !v)}
            title={railCollapsed ? 'Expand narrative' : 'Collapse narrative'}
          >
            {railCollapsed ? '›' : '‹'}
          </button>
        </div>

        <div className="map-area" style={{ position: 'relative' }}>
          {showOverlayTester() && <VectorOverlayTester />}
          <MapCanvas
            onTileClick={handleTileClick}
            onEntityClick={handleEntityClick}
            targetingMode={!!targetingSpell}
          />
          <InitiativeReveal />
          {showBrief && (
            <CampaignBriefOverlay onBegin={handleBeginAdventure} />
          )}
          {targetingSpell && (
            <div className="targeting-hint">
              <span className="targeting-hint-spell">✨ {targetingSpell.name}</span>
              <span>Click target · <kbd>ESC</kbd> to cancel</span>
            </div>
          )}
        </div>

        <div className="panel-resize-handle panel-resize-handle--right" onMouseDown={handleSidebarDragStart}>
          <button
            type="button"
            className="panel-collapse-btn"
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? '‹' : '›'}
          </button>
        </div>

        <div
          className={`sidebar${sidebarCollapsed ? ' panel-collapsed' : ''}`}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <div className="sidebar-tab-bar">
            <button
              type="button"
              className={`sidebar-tab-btn${sidebarTab === 'stats' ? ' sidebar-tab-btn--active' : ''}`}
              onClick={() => setSidebarTab('stats')}
            >
              Stats
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn${sidebarTab === 'codex' ? ' sidebar-tab-btn--active' : ''}`}
              onClick={() => setSidebarTab('codex')}
            >
              Codex
            </button>
          </div>

          {sidebarTab === 'stats' ? (
            <>
              <div className="sidebar-top">
                <CombatTracker />
                <CharacterSheet />
              </div>
              <div className="sidebar-bottom">
                <BattlemapActions />
                <ActionBar
                  onSend={sendAction}
                  onCastSpell={sendSpellCast}
                  onInitiateTarget={(name, slotLevel) => setTargetingSpell({ name, slotLevel })}
                />
                <DiceRoller onSubmitRoll={sendAction} />
              </div>
            </>
          ) : (
            <CodexPanel />
          )}
        </div>
      </div>
    </div>
  )
}
