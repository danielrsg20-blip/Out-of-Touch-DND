import { useState, useRef, useCallback } from 'react'
import './VoiceControl.css'

export type TranscriptMode = 'auto' | 'review'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

interface VoiceControlProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  ttsEnabled: boolean
  onToggleTts: (enabled: boolean) => void
  transcriptMode: TranscriptMode
  onTranscriptModeChange: (mode: TranscriptMode) => void
  onTranscript?: (audioBase64: string) => void | Promise<void>
  onVoiceTest?: () => void | Promise<void>
  onPttStart?: () => void
}

export default function VoiceControl({
  enabled,
  onToggle,
  ttsEnabled,
  onToggleTts,
  transcriptMode,
  onTranscriptModeChange,
  onTranscript,
  onVoiceTest,
  onPttStart,
}: VoiceControlProps) {
  const [recording, setRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    onPttStart?.()
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())

        const buffer = await blob.arrayBuffer()
        const base64 = arrayBufferToBase64(buffer)
        setIsProcessing(true)
        try {
          await onTranscript?.(base64)
        } finally {
          setIsProcessing(false)
        }
      }

      mediaRecorder.start()
      setRecording(true)
    } catch (err) {
      const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      setMicError(isDenied ? 'Mic access denied — check browser permissions.' : 'Mic unavailable.')
      console.error('Mic access denied:', err)
    }
  }, [onTranscript])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }, [])

  const handleVoiceTest = useCallback(async () => {
    if (!onVoiceTest) {
      return
    }

    setIsProcessing(true)
    try {
      await onVoiceTest()
    } finally {
      setIsProcessing(false)
    }
  }, [onVoiceTest])

  return (
    <div className="voice-control">
      <button
        className={`voice-toggle ${enabled ? 'active' : ''}`}
        onClick={() => onToggle(!enabled)}
        title="Toggle voice features"
      >
        {enabled ? '🎙' : '🔇'}
      </button>

      {enabled && (
        <>
          <button
            className={`voice-record-btn ${recording ? 'recording' : ''}`}
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            onPointerCancel={stopRecording}
            title="Hold to talk"
            disabled={isProcessing}
          >
            {recording ? '🔴 Recording...' : isProcessing ? '⏳ Processing...' : '🎤 Hold to Talk'}
          </button>
          {micError && <span className="voice-error" title={micError}>⚠ {micError}</span>}

          <button
            className={`voice-mode-toggle ${transcriptMode === 'review' ? 'review' : 'auto'}`}
            onClick={() => onTranscriptModeChange(transcriptMode === 'auto' ? 'review' : 'auto')}
            title={transcriptMode === 'auto' ? 'Transcript auto-send enabled' : 'Transcript review before send enabled'}
          >
            {transcriptMode === 'auto' ? 'Auto Send' : 'Review First'}
          </button>

          <button
            className={`voice-tts-toggle ${ttsEnabled ? 'active' : ''}`}
            onClick={() => onToggleTts(!ttsEnabled)}
            title="Toggle DM voice"
          >
            {ttsEnabled ? '🔊' : '🔈'}
          </button>

          <button
            className="voice-test-btn"
            onClick={handleVoiceTest}
            title="Play local mock voice line"
            disabled={isProcessing}
          >
            {isProcessing ? 'Testing...' : 'Voice Test'}
          </button>
        </>
      )}
    </div>
  )
}

export function playTTSAudio(base64Audio: string) {
  const binary = atob(base64Audio)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.play().catch(console.error)
  audio.onended = () => URL.revokeObjectURL(url)
}
