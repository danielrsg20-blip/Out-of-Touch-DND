import { useState, useCallback } from 'react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

interface ChatInputProps {
  onSend: (message: string) => void
  draftText?: string
  onDraftTextChange?: (nextText: string) => void
}

export default function ChatInput({ onSend, draftText, onDraftTextChange }: ChatInputProps) {
  const [internalText, setInternalText] = useState('')
  const isLoading = useGameStore(s => s.isLoading)
  const text = typeof draftText === 'string' ? draftText : internalText

  const setText = useCallback((nextText: string) => {
    if (onDraftTextChange) {
      onDraftTextChange(nextText)
      return
    }
    setInternalText(nextText)
  }, [onDraftTextChange])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setText('')
  }, [text, isLoading, onSend, setText])

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={isLoading ? 'The DM is thinking...' : 'What do you do?'}
        disabled={isLoading}
        className="chat-text-input"
      />
      <button type="submit" disabled={isLoading || !text.trim()} className="chat-send-btn">
        {isLoading ? '...' : 'Send'}
      </button>
    </form>
  )
}
