import { useCallback, useEffect, useState } from 'react'
import MapCanvas from './map/MapCanvas'
import InitiativeReveal from './map/InitiativeReveal'
import NarrativeLog from './panels/NarrativeLog'
import ChatInput from './panels/ChatInput'
import CombatTracker from './panels/CombatTracker'
import CharacterSheet from './panels/CharacterSheet'
import ActionBar from './panels/ActionBar'
import DiceRoller from './panels/DiceRoller'
import VoiceControl from './VoiceControl'
import CampaignBriefOverlay from './CampaignBriefOverlay'
import { useWebSocket } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import { CollisionGrid } from '../lib/systems/movement/collisionGrid'
import { MovementController } from '../lib/systems/movement/movementController'
import { narrationOrchestrator } from '../lib/narrationOrchestrator'
import './GameBoard.css'

const AVATAR_COLORS = ['#9b59b6', '#3498db', '#2ecc71', '#e67e22', '#e74c3c']

export default function GameBoard() {
  const { sendAction, sendMoveToken, sendSpellCast, transcribeVoiceInput, runVoiceTest } = useWebSocket()
  const { roomCode, playerId, players } = useSessionStore()
  const {
    selectedEntityId,
    setSelectedEntity,
    usage,
    voiceEnabled,
    ttsEnabled,
    transcriptMode,
    setVoiceEnabled,
    setTtsEnabled,
    setTranscriptMode,
    addNarrative,
  } = useGameStore()
  const [chatDraft, setChatDraft] = useState('')
  const [targetingSpell, setTargetingSpell] = useState<{ name: string; slotLevel: number } | null>(null)
  const [briefDismissed, setBriefDismissed] = useState(false)

  const narrative = useGameStore(state => state.narrative)
  // Show brief when no DM has spoken yet and user hasn't dismissed it
  const showBrief = !briefDismissed && narrative.filter(e => e.type === 'dm').length === 0

  const handleBeginAdventure = useCallback(() => {
    setBriefDismissed(true)
    sendAction('[SESSION_START]')
  }, [sendAction])
  const [railWidth, setRailWidth] = useState(300)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
    grid.buildFromMap(map.tiles, map.width, map.height)
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

  return (
    <div className="game-board">
      <header className="game-header">
        <span className="game-title">Out of Touch DND</span>
        <span className="room-code">{roomCode}</span>
        <div className="header-sep" aria-hidden="true" />
        <div className="player-list">
          {players.map((p, i) => (
            <span
              key={p.id}
              className={`player-avatar${p.id === playerId ? ' me' : ''}`}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              title={p.name}
            >
              {(p.name[0] ?? '?').toUpperCase()}
            </span>
          ))}
        </div>
        {usage.estimated_cost_usd > 0 && (
          <span className="cost-badge">${usage.estimated_cost_usd.toFixed(3)}</span>
        )}
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
            transcriptMode={transcriptMode}
            onTranscriptModeChange={setTranscriptMode}
            onTranscript={handleVoiceTranscript}
            onVoiceTest={runVoiceTest}
            onPttStart={() => narrationOrchestrator.interrupt()}
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
          <div className="sidebar-top">
            <CombatTracker />
            <CharacterSheet />
          </div>
          <div className="sidebar-bottom">
            <ActionBar
              onSend={sendAction}
              onCastSpell={sendSpellCast}
              onInitiateTarget={(name, slotLevel) => setTargetingSpell({ name, slotLevel })}
            />
            <DiceRoller onSubmitRoll={sendAction} />
          </div>
        </div>
      </div>
    </div>
  )
}
