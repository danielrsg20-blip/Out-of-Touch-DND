import { useState, useCallback } from 'react'
import { useGameStore } from '../../stores/gameStore'
import './panels.css'

interface ChatInputProps {
  onSend: (message: string) => void
}

export default function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState('')
  const isLoading = useGameStore(s => s.isLoading)

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setText('')
  }, [text, isLoading, onSend])

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
