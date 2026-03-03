import { useState, useRef, useCallback } from 'react'
import './VoiceControl.css'

interface VoiceControlProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onTranscript?: (text: string) => void
}

export default function VoiceControl({ enabled, onToggle, onTranscript }: VoiceControlProps) {
  const [recording, setRecording] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
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
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
        onTranscript?.(base64)
      }

      mediaRecorder.start()
      setRecording(true)
    } catch (err) {
      console.error('Mic access denied:', err)
    }
  }, [onTranscript])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }, [])

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
            title="Hold to talk"
          >
            {recording ? '🔴 Recording...' : '🎤 Hold to Talk'}
          </button>

          <button
            className={`voice-tts-toggle ${ttsEnabled ? 'active' : ''}`}
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title="Toggle DM voice"
          >
            {ttsEnabled ? '🔊' : '🔈'}
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
