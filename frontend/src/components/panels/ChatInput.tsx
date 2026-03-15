import { useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { useGameStore } from '../../stores/gameStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <form
      className="flex gap-2 pt-2 border-t border-[#2a2a4a]"
      onSubmit={handleSubmit}
    >
      <Input
        type="text"
        value={text}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
        placeholder={isLoading ? 'The DM is thinking...' : 'What do you do?'}
        disabled={isLoading}
        className="flex-1 bg-[#1a1a3e] border-[#2a2a4a] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50 text-[0.9rem] h-8 px-3 disabled:opacity-45 focus-visible:border-[rgba(228,168,83,0.6)] focus-visible:shadow-[0_0_0_3px_rgba(228,168,83,0.08)]"
      />
      <motion.div whileTap={{ scale: 0.95 }}>
        <Button
          type="submit"
          disabled={isLoading || !text.trim()}
          className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-bold text-[0.9rem] border-none hover:opacity-90 hover:-translate-y-px disabled:opacity-35 h-8 px-4 shrink-0"
          style={{ boxShadow: '0 2px 8px rgba(228,168,83,0.2)' }}
        >
          {isLoading ? '...' : 'Send'}
        </Button>
      </motion.div>
    </form>
  )
}
