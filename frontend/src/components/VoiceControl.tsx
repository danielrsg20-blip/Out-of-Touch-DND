import { useState, useRef, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
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
  voiceSpeed: number
  onVoiceSpeedChange: (speed: number) => void
  transcriptMode: TranscriptMode
  onTranscriptModeChange: (mode: TranscriptMode) => void
  onTranscript?: (audioBase64: string) => void | Promise<void>
  onTranscriptText?: (transcript: string) => void | Promise<void>
  onVoiceTest?: () => void | Promise<void>
  onPttStart?: () => void
  onPauseNarration?: () => void
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    [index: number]: { transcript: string }
  }>
}

interface BrowserSpeechRecognitionErrorEvent {
  error: string
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  const scopedWindow = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }
  return scopedWindow.SpeechRecognition ?? scopedWindow.webkitSpeechRecognition ?? null
}

export default function VoiceControl({
  enabled,
  onToggle,
  ttsEnabled,
  onToggleTts,
  voiceSpeed,
  onVoiceSpeedChange,
  transcriptMode,
  onTranscriptModeChange,
  onTranscript,
  onTranscriptText,
  onVoiceTest,
  onPttStart,
  onPauseNarration,
}: VoiceControlProps) {
  const [recording, setRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const captureModeRef = useRef<'recorder' | 'speech' | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const ttsPlaybackStatus = useGameStore((s) => s.ttsPlaybackStatus)
  const formattedVoiceSpeed = voiceSpeed.toFixed(voiceSpeed % 1 === 0 ? 0 : 2).replace(/\.00$/, '')

  const ttsLabel = ttsPlaybackStatus
    ? (ttsPlaybackStatus.source === 'edge-tts'
      ? `TTS: edge-tts @ ${formattedVoiceSpeed}x`
      : ttsPlaybackStatus.source === 'browser-fallback'
        ? `TTS: browser-fallback @ ${formattedVoiceSpeed}x`
        : `TTS: unavailable @ ${formattedVoiceSpeed}x`)
    : `TTS: unknown @ ${formattedVoiceSpeed}x`
  const speedPresets = [1, 1.25, 1.5] as const

  const startMediaRecorderCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      captureModeRef.current = 'recorder'
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
      return true
    } catch (err) {
      const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      setMicError(isDenied ? 'Mic access denied — check browser permissions.' : 'Mic unavailable.')
      console.error('Mic access denied:', err)
      return false
    }
  }, [onTranscript])

  const startBrowserSpeechCapture = useCallback(async () => {
    if (!onTranscriptText) {
      return false
    }

    const RecognitionCtor = getSpeechRecognitionCtor()
    if (!RecognitionCtor) {
      return false
    }

    let transcript = ''
    const recognition = new RecognitionCtor()
    speechRecognitionRef.current = recognition
    captureModeRef.current = 'speech'

    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.continuous = true
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result?.isFinal) {
          transcript += `${result[0]?.transcript ?? ''} `
        }
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        setMicError('No speech detected. Try speaking closer to your mic.')
      } else if (event.error === 'not-allowed') {
        setMicError('Mic access denied — check browser permissions.')
      } else {
        setMicError(`Speech recognition error: ${event.error}`)
      }
    }
    recognition.onend = async () => {
      speechRecognitionRef.current = null
      captureModeRef.current = null
      setRecording(false)

      const finalTranscript = transcript.trim()
      if (!finalTranscript) {
        return
      }

      setIsProcessing(true)
      try {
        await onTranscriptText(finalTranscript)
      } finally {
        setIsProcessing(false)
      }
    }

    try {
      recognition.start()
      setRecording(true)
      return true
    } catch {
      speechRecognitionRef.current = null
      captureModeRef.current = null
      return false
    }
  }, [onTranscriptText])

  const startRecording = useCallback(async () => {
    onPttStart?.()
    setMicError(null)

    const speechStarted = await startBrowserSpeechCapture()
    if (speechStarted) {
      return
    }

    void startMediaRecorderCapture()
  }, [onPttStart, startBrowserSpeechCapture, startMediaRecorderCapture])

  const stopRecording = useCallback(() => {
    if (captureModeRef.current === 'speech' && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop()
      return
    }

    if (captureModeRef.current === 'recorder' && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      captureModeRef.current = null
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
            className="voice-pause-btn"
            onClick={() => onPauseNarration?.()}
            title="Pause DM narration"
            type="button"
          >
            Pause DM
          </button>

          <div className="voice-speed-group" title="DM speech speed">
            {speedPresets.map((speed) => (
              <button
                key={speed}
                className={`voice-speed-btn ${Math.abs(voiceSpeed - speed) < 0.01 ? 'active' : ''}`}
                onClick={() => onVoiceSpeedChange(speed)}
                type="button"
              >
                {speed.toFixed(speed % 1 === 0 ? 0 : 2).replace(/\.00$/, '')}x
              </button>
            ))}
          </div>

          <button
            className="voice-test-btn"
            onClick={handleVoiceTest}
            title="Play local mock voice line"
            disabled={isProcessing}
          >
            {isProcessing ? 'Testing...' : 'Voice Test'}
          </button>

          <span
            className={`voice-tts-source ${ttsPlaybackStatus?.source ?? 'none'}`}
            title={ttsPlaybackStatus?.reason ?? 'Current TTS playback source'}
          >
            {ttsLabel}
          </span>
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
  const voiceSpeed = useGameStore.getState().voiceSpeed
  audio.playbackRate = voiceSpeed
  ;(audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
  audio.play().catch(console.error)
  audio.onended = () => URL.revokeObjectURL(url)
}
