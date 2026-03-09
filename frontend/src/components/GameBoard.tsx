import { useCallback, useState } from 'react'
import MapCanvas from './map/MapCanvas'
import NarrativeLog from './panels/NarrativeLog'
import ChatInput from './panels/ChatInput'
import CombatTracker from './panels/CombatTracker'
import CharacterSheet from './panels/CharacterSheet'
import ActionBar from './panels/ActionBar'
import DiceRoller from './panels/DiceRoller'
import VoiceControl from './VoiceControl'
import { useWebSocket } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
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

  const handleTileClick = useCallback((gx: number, gy: number) => {
    const player = players.find(p => p.id === playerId)
    if (player?.character_id && selectedEntityId === player.character_id) {
      sendMoveToken(player.character_id, gx, gy)
      setSelectedEntity(null)
    }
  }, [playerId, players, selectedEntityId, sendMoveToken, setSelectedEntity])

  const handleEntityClick = useCallback((entityId: string) => {
    setSelectedEntity(selectedEntityId === entityId ? null : entityId)
  }, [selectedEntityId, setSelectedEntity])

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

    sendAction(transcript)
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
        <div className="adventure-rail">
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
          />
          <ChatInput onSend={sendAction} draftText={chatDraft} onDraftTextChange={setChatDraft} />
        </div>

        <div className="map-area">
          <MapCanvas onTileClick={handleTileClick} onEntityClick={handleEntityClick} />
        </div>

        <div className="sidebar">
          <div className="sidebar-top">
            <CombatTracker />
            <CharacterSheet />
          </div>
          <div className="sidebar-bottom">
            <ActionBar onSend={sendAction} onCastSpell={sendSpellCast} />
            <DiceRoller />
          </div>
        </div>
      </div>
    </div>
  )
}
