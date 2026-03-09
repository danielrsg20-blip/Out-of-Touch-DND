import { useCallback } from 'react'
import MapCanvas from './map/MapCanvas'
import CombatTracker from './panels/CombatTracker'
import VoiceControl from './VoiceControl'
import { useWebSocket } from '../hooks/useWebSocket'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'
import './TableModeView.css'

export default function TableModeView() {
  const { sendAction, transcribeVoiceInput, runVoiceTest } = useWebSocket()
  const { roomCode, players } = useSessionStore()
  const combat = useGameStore(s => s.combat)
  const narrative = useGameStore(s => s.narrative)
  const voiceEnabled = useGameStore(s => s.voiceEnabled)
  const ttsEnabled = useGameStore(s => s.ttsEnabled)
  const transcriptMode = useGameStore(s => s.transcriptMode)
  const setVoiceEnabled = useGameStore(s => s.setVoiceEnabled)
  const setTtsEnabled = useGameStore(s => s.setTtsEnabled)
  const setTranscriptMode = useGameStore(s => s.setTranscriptMode)
  const addNarrative = useGameStore(s => s.addNarrative)
  const recentNarrative = narrative.slice(-5)

  const handleVoiceTranscript = useCallback(async (audioBase64: string) => {
    const transcript = await transcribeVoiceInput(audioBase64)
    if (!transcript) {
      return
    }

    if (transcriptMode === 'review') {
      addNarrative('system', `Voice transcript: ${transcript}`)
      addNarrative('system', 'Table mode review: switch to player view to edit and send.')
      return
    }

    sendAction(transcript)
  }, [addNarrative, sendAction, transcriptMode, transcribeVoiceInput])

  return (
    <div className="table-mode">
      <div className="table-map-area">
        <MapCanvas />
      </div>

      <div className="table-overlay-top">
        <span className="table-room-code">{roomCode}</span>
        <span className="table-players">
          {players.map(p => p.name).join(' • ')}
        </span>
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
      </div>

      {combat?.is_active && (
        <div className="table-overlay-combat">
          <CombatTracker />
        </div>
      )}

      <div className="table-overlay-narrative">
        {recentNarrative.map(entry => (
          <div key={entry.id} className={`table-narrative-entry narrative-${entry.type}`}>
            {entry.speaker && <strong>{entry.speaker}: </strong>}
            {entry.content}
          </div>
        ))}
      </div>
    </div>
  )
}
