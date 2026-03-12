import { invokeEdgeFunction, getSupabaseClient } from './supabaseClient'
import { API_BASE } from '../config/endpoints'
import { useGameStore } from '../stores/gameStore'
import { useSessionStore } from '../stores/sessionStore'

const HAS_LOCAL_BACKEND = import.meta.env.DEV || Boolean(import.meta.env.VITE_API_URL?.trim())
const CHUNK_WORD_LIMIT = 25

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
    this.interruptedAt = Date.now()
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
      return
    }

    this.isPlaying = true

    try {
      const audio = await this.fetchTTSAudio(chunk)
      if (!audio) {
        void this.playNext()
        return
      }

      this.activeAudio = audio
      await audio.play()
      audio.onended = () => {
        this.activeAudio = null
        void this.playNext()
      }
      audio.onerror = () => {
        this.activeAudio = null
        void this.playNext()
      }
    } catch {
      this.activeAudio = null
      this.isPlaying = false
      this.queue = []
    }
  }

  private async fetchTTSAudio(text: string): Promise<HTMLAudioElement | null> {
    const { mockMode } = useSessionStore.getState()
    const supabase = getSupabaseClient()

    if (supabase) {
      try {
        const payload = await invokeEdgeFunction<Record<string, unknown>>('voice-tts', {
          text,
          voiceId: 'dm_default',
          mock_mode: mockMode,
        })
        if (typeof payload.audio === 'string' && payload.audio.trim()) {
          return this.base64ToAudio(payload.audio)
        }
      } catch {
        // fall through to local
      }
    }

    if (HAS_LOCAL_BACKEND) {
      const res = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'dm_default', mock_mode: mockMode }),
      })
      if (res.ok) {
        const contentType = res.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.onended = () => URL.revokeObjectURL(url)
          return audio
        }
      }
    }

    return null
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
    audio.onended = () => URL.revokeObjectURL(url)
    return audio
  }
}

export const narrationOrchestrator = new NarrationOrchestrator()
