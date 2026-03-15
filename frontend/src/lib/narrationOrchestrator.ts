import { invokeEdgeFunction, invokeEdgeFunctionWithAnon, getSupabaseClient } from './supabaseClient'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'

const CHUNK_WORD_LIMIT = 40
const INTER_CHUNK_PAUSE_MS = 325

function canUseBrowserSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

function splitIntoChunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  let wordCount = 0

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    const words = trimmed.split(/\s+/).length
    if (wordCount + words > CHUNK_WORD_LIMIT && current) {
      chunks.push(current.trim())
      current = trimmed
      wordCount = words
    } else {
      current += (current ? ' ' : '') + trimmed
      wordCount += words
    }
  }
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks.filter((c) => c.length > 0)
}

class NarrationOrchestrator {
  private queue: string[] = []
  private activeAudio: HTMLAudioElement | null = null
  private isPlaying = false
  private interruptedAt: number | null = null
  private lastText: string | null = null
  private prefetchedChunk: string | null = null
  private prefetchedAudioPromise: Promise<HTMLAudioElement | null> | null = null
  private pauseTimer: number | null = null

  enqueue(text: string, _priority = 0): void {
    const state = useGameStore.getState()
    if (!state.voiceEnabled || !state.ttsEnabled) return

    const trimmed = text.trim()
    if (!trimmed) return

    this.lastText = trimmed
    const chunks = splitIntoChunks(trimmed)
    this.queue.push(...chunks)

    if (!this.isPlaying) {
      void this.playNext()
    }
  }

  interrupt(): void {
    this.queue = []
    this.prefetchedChunk = null
    this.prefetchedAudioPromise = null
    if (this.pauseTimer !== null) {
      window.clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }
    this.interruptedAt = Date.now()
    if (canUseBrowserSpeechSynthesis()) {
      window.speechSynthesis.cancel()
    }
    if (this.activeAudio) {
      this.activeAudio.pause()
      this.activeAudio.src = ''
      this.activeAudio = null
    }
    this.isPlaying = false
  }

  duck(volume = 0.15): void {
    if (this.activeAudio) {
      this.activeAudio.volume = volume
    }
  }

  unduck(): void {
    if (this.activeAudio) {
      this.activeAudio.volume = 1
    }
  }

  replayLast(): void {
    if (this.lastText) {
      this.interrupt()
      this.enqueue(this.lastText)
    }
  }

  getInterruptContext(): string | null {
    if (this.interruptedAt !== null && Date.now() - this.interruptedAt < 30000) {
      return `[player_interrupted_narration_at: ${new Date(this.interruptedAt).toISOString()}]`
    }
    return null
  }

  private async playNext(): Promise<void> {
    const chunk = this.queue.shift()
    if (!chunk) {
      this.isPlaying = false
      this.prefetchedChunk = null
      this.prefetchedAudioPromise = null
      this.pauseTimer = null
      return
    }

    this.isPlaying = true

    try {
      const audioPromise = this.resolveAudioForChunk(chunk)
      this.prefetchNextChunk()
      const audio = await audioPromise
      if (!audio) {
        const playedWithBrowser = await this.playWithBrowserSpeech(chunk)
        if (!playedWithBrowser) {
          useGameStore.getState().setTtsPlaybackStatus({
            source: 'none',
            reason: 'no_tts_available',
            updatedAt: Date.now(),
          })
          this.isPlaying = false
          this.queue = []
          return
        }
        useGameStore.getState().setTtsPlaybackStatus({
          source: 'browser-fallback',
          reason: 'edge_tts_unavailable',
          updatedAt: Date.now(),
        })
        this.scheduleNext()
        return
      }

      this.activeAudio = audio
      useGameStore.getState().setTtsPlaybackStatus({
        source: 'edge-tts',
        reason: null,
        updatedAt: Date.now(),
      })
      await audio.play()
      audio.onended = () => {
        this.activeAudio = null
        this.scheduleNext()
      }
      audio.onerror = () => {
        this.activeAudio = null
        this.scheduleNext()
      }
    } catch {
      this.activeAudio = null
      this.isPlaying = false
      this.queue = []
    }
  }

  private prefetchNextChunk(): void {
    const nextChunk = this.queue[0] ?? null
    if (!nextChunk) {
      this.prefetchedChunk = null
      this.prefetchedAudioPromise = null
      return
    }

    if (this.prefetchedChunk === nextChunk && this.prefetchedAudioPromise) {
      return
    }

    this.prefetchedChunk = nextChunk
    this.prefetchedAudioPromise = this.fetchTTSAudio(nextChunk).catch(() => null)
  }

  private scheduleNext(): void {
    if (this.pauseTimer !== null) {
      window.clearTimeout(this.pauseTimer)
    }

    this.pauseTimer = window.setTimeout(() => {
      this.pauseTimer = null
      void this.playNext()
    }, INTER_CHUNK_PAUSE_MS)
  }

  private async resolveAudioForChunk(chunk: string): Promise<HTMLAudioElement | null> {
    if (this.prefetchedChunk === chunk && this.prefetchedAudioPromise) {
      const prefetchedPromise = this.prefetchedAudioPromise
      this.prefetchedChunk = null
      this.prefetchedAudioPromise = null
      return await prefetchedPromise
    }

    return this.fetchTTSAudio(chunk)
  }

  private async fetchTTSAudio(text: string): Promise<HTMLAudioElement | null> {
    const { mockMode } = useSessionStore.getState()
    const payloadBody = {
      text,
      voiceId: 'dm_default',
      speed: useGameStore.getState().voiceSpeed,
      mock_mode: mockMode,
    }

    const supabase = getSupabaseClient()

    if (supabase) {
      try {
        const payload = await invokeEdgeFunction<Record<string, unknown>>('voice-tts', payloadBody)
        if (typeof payload.audio === 'string' && payload.audio.trim()) {
          return this.base64ToAudio(payload.audio)
        }
      } catch {
        // fall through to direct anon invocation when the client/session path fails
      }
    }

    try {
      const payload = await invokeEdgeFunctionWithAnon<Record<string, unknown>>('voice-tts', payloadBody)
      if (typeof payload.audio === 'string' && payload.audio.trim()) {
        return this.base64ToAudio(payload.audio)
      }
    } catch {
      // fall through to null when edge TTS is unavailable
    }

    return null
  }

  private async playWithBrowserSpeech(text: string): Promise<boolean> {
    if (!canUseBrowserSpeechSynthesis()) {
      return false
    }

    const voiceSpeed = useGameStore.getState().voiceSpeed

    return new Promise<boolean>((resolve) => {
      try {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = voiceSpeed
        utterance.pitch = 0.95
        utterance.onend = () => resolve(true)
        utterance.onerror = () => resolve(false)
        window.speechSynthesis.speak(utterance)
      } catch {
        resolve(false)
      }
    })
  }

  private base64ToAudio(base64: string): HTMLAudioElement {
    const binary = atob(base64)
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
    audio.onended = () => URL.revokeObjectURL(url)
    return audio
  }
}

export const narrationOrchestrator = new NarrationOrchestrator()
