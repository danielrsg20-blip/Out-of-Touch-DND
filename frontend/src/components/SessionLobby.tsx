import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useSessionStore } from '../stores/sessionStore'
import { useAuthStore } from '../stores/authStore'
import type { CampaignCharacter, CampaignSlot } from '../types'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MOCK_MODE_STORAGE_KEY = 'otdnd.mockMode'

// ── Adventure hooks & tone options ────────────────────────────────────────
interface AdventureHook {
  id: string
  title: string
  summary: string
  premise: string
  tone: string
}

const ADVENTURE_HOOKS: AdventureHook[] = [
  { id: 'hired_blade', title: 'The Hired Blade', summary: 'Escort a mysterious cargo through dangerous territory.', tone: 'High Fantasy', premise: 'Your party has been hired by a cloaked merchant to escort a sealed chest through the Thornwood. The coin is good, the questions are many, and the road ahead is anything but safe.' },
  { id: 'ruins_aldenvoss', title: 'Ruins of Aldenvoss', summary: 'Ancient ruins surface beneath a town. Nobody who investigates comes back.', tone: 'Mystery & Intrigue', premise: 'Ancient ruins have been discovered beneath the town of Aldenvoss. Strange lights and unearthly sounds emerge every night. The mayor has posted a reward — but the last group that went in never returned.' },
  { id: 'missing_village', title: 'The Missing Village', summary: 'An entire village vanished overnight. Tracks lead into dark forest.', tone: 'Dark & Gritty', premise: 'You arrive at the village of Millhaven to find it completely empty. No bodies, no sign of struggle — just abandoned meals, open doors, and a trail of strange footprints leading east into the forest.' },
  { id: 'dark_compact', title: 'The Dark Compact', summary: 'A local lord has made deals with something sinister. His reach is long.', tone: 'Mystery & Intrigue', premise: "Lord Varek of Stonebreach has grown obscenely wealthy over the past year. Rumours swirl of pacts with dark powers. Three investigators who looked into it have disappeared. You are next." },
  { id: 'cursed_caravan', title: 'The Cursed Caravan', summary: 'You awaken on a strange road with no memory of how you got here.', tone: 'High Fantasy', premise: 'You find yourself on an unfamiliar road at dusk with no memory of how you got there. Ahead, a merchant caravan lies in ruins — burning wagons, scattered goods, and survivors who desperately need help.' },
  { id: 'siege_of_redwall', title: 'Siege of Redwall', summary: 'Slip through enemy lines into a besieged fortress to retrieve something vital.', tone: 'High Fantasy', premise: 'The fortress town of Redwall has been under siege for three weeks. Inside its walls is something the enemy will kill to possess. Your party must breach the lines, reach the vault, and escape before the walls fall.' },
  { id: 'sunken_temple', title: 'The Sunken Temple', summary: 'Treasure hunters keep going into a submerged temple. None come back up.', tone: 'Dark & Gritty', premise: 'Beneath the harbour of Port Maren lies the entrance to an ancient submerged temple. Three parties of treasure hunters have descended into its dark waters. None came back up.' },
  { id: 'freeform', title: 'Freeform Adventure', summary: 'Let the AI DM build the world entirely from scratch.', tone: 'High Fantasy', premise: 'The adventure begins where all great stories do — in a tavern. The world is wide, the road is open, and your fate is unwritten. Where do you want to go?' },
]

const TONE_OPTIONS = [
  { id: 'High Fantasy', icon: '⚔️' },
  { id: 'Dark & Gritty', icon: '🕯️' },
  { id: 'Comedic', icon: '😄' },
  { id: 'Mystery & Intrigue', icon: '🔍' },
  { id: 'Exploration', icon: '🌊' },
]

const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  key: i,
  left:     (Math.sin(i * 2.9) * 0.5 + 0.5) * 100,
  top:      (Math.cos(i * 1.4) * 0.5 + 0.5) * 100,
  size:     1.2 + Math.abs(Math.sin(i * 4.1)) * 2.2,
  duration: 7 + Math.abs(Math.cos(i * 1.7)) * 11,
  delay:    -(Math.abs(Math.sin(i * 1.1 + 0.5)) * 9),
  opacity:  0.1 + Math.abs(Math.sin(i * 2.3 + 1)) * 0.25,
  xDrift:   2 + Math.abs(Math.sin(i * 2.5)) * 5,
  yDrift:   16 + Math.abs(Math.cos(i * 1.9)) * 12,
}))

const SLOT_COLORS = ['#9b59b6', '#3498db', '#2ecc71', '#e67e22', '#e4a853']

function slotFreshness(updatedAt: string): 'fresh' | 'recent' | 'old' {
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000
  if (days < 7) return 'fresh'
  if (days < 30) return 'recent'
  return 'old'
}

const FRESHNESS_COLORS = {
  fresh:  { bg: '#2ecc71', shadow: '0 0 4px #2ecc71' },
  recent: { bg: '#f39c12', shadow: 'none' },
  old:    { bg: '#444',    shadow: 'none' },
}

const slotVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

function SlotSkeleton({ index }: { index: number }) {
  const color = SLOT_COLORS[index]
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 border border-[#2a2a4a] rounded-lg min-h-[60px] bg-white/[0.02]"
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      <div
        className="w-[22px] h-[22px] rounded-full bg-white/[0.06] flex items-center justify-center text-[0.68rem] font-bold shrink-0 border"
        style={{ borderColor: color, color }}
      >
        {index + 1}
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="h-2.5 rounded w-[60%] animate-pulse bg-white/[0.07]" />
        <div className="h-2.5 rounded w-[35%] animate-pulse bg-white/[0.07]" />
        <div className="h-2.5 rounded w-[48%] animate-pulse bg-white/[0.07]" />
      </div>
    </div>
  )
}

const modeVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18 } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.13 } },
}

export default function SessionLobby() {
  const { username, logout } = useAuthStore()
  const [name, setName]               = useState(username ?? '')
  const [joinCode, setJoinCode]       = useState('')
  const [mockMode, setMockMode]       = useState(false)
  const [mode, setMode]               = useState<'menu' | 'create' | 'campaign_setup' | 'join'>('menu')
  const [selectedHook, setSelectedHook]       = useState<AdventureHook | null>(null)
  const [customPremise, setCustomPremise]     = useState('')
  const [selectedTone, setSelectedTone]       = useState('High Fantasy')
  const [error, setError]                     = useState('')
  const [confirmSlot, setConfirmSlot]         = useState<CampaignSlot | null>(null)
  const [resuming, setResuming]               = useState(false)
  const [charPickSlot, setCharPickSlot]       = useState<CampaignSlot | null>(null)
  const [charList, setCharList]               = useState<CampaignCharacter[]>([])
  const [charListLoading, setCharListLoading] = useState(false)

  const {
    roomCode, players, createSession, joinSession, getSession,
    campaigns, campaignsLoading, listCampaigns, fetchCampaignCharacters, resumeCampaign,
  } = useSessionStore()

  useEffect(() => {
    try {
      const saved = globalThis.localStorage.getItem(MOCK_MODE_STORAGE_KEY)
      if (saved === 'true') setMockMode(true)
      if (saved === 'false') setMockMode(false)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(MOCK_MODE_STORAGE_KEY, String(mockMode))
    } catch { /* ignore */ }
  }, [mockMode])

  useEffect(() => {
    if (!roomCode) return
    getSession(roomCode).catch(() => {})
  }, [roomCode, getSession])

  useEffect(() => {
    listCampaigns().catch(() => {})
  }, [listCampaigns])

  const handleCampaignSetupNext = () => {
    if (!name.trim()) return
    setMode('campaign_setup')
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const premise = selectedHook ? selectedHook.premise : customPremise.trim()
    const tone    = selectedHook ? selectedHook.tone    : selectedTone
    const title   = selectedHook ? selectedHook.title   : (customPremise.trim() ? 'Custom Adventure' : 'Freeform Adventure')
    try {
      await createSession(name.trim(), mockMode, premise, tone, title)
      useSessionStore.getState().setPhase('character_create')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session.')
    }
  }

  const handleJoin = async () => {
    if (!name.trim() || !joinCode.trim()) return
    try {
      await joinSession(joinCode.trim(), name.trim())
      useSessionStore.getState().setPhase('character_create')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join session. Check the room code.')
    }
  }

  const handleConfirmResume = async (slot: CampaignSlot) => {
    if (!name.trim()) { setError('Enter your name before resuming.'); return }
    setError('')
    setCharListLoading(true)
    try {
      const chars = await fetchCampaignCharacters(slot.id)
      setCharList(chars)
      setCharPickSlot(slot)
      setConfirmSlot(null)
    } catch {
      setError('Failed to load characters.')
    } finally {
      setCharListLoading(false)
    }
  }

  const handleResume = async (slot: CampaignSlot, characterId?: string) => {
    setResuming(true)
    setError('')
    try {
      await resumeCampaign(slot.id, name.trim(), characterId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resume campaign.')
      setCharPickSlot(null)
      setCharList([])
    } finally {
      setResuming(false)
    }
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center p-4 overflow-hidden relative"
      style={{ background: 'radial-gradient(ellipse at 30% 40%, #1a2860 0%, #090d1f 55%, #0d0812 100%)' }}
    >
      {/* Scanline + vignette overlays */}
      <div className="absolute inset-0 pointer-events-none z-0" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} aria-hidden="true" />
      <div className="absolute inset-0 pointer-events-none z-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)' }} aria-hidden="true" />

      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden="true">
        {PARTICLES.map(p => (
          <motion.span
            key={p.key}
            className="absolute rounded-full"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.size}px`, height: `${p.size}px`, opacity: p.opacity, background: '#e4a853', boxShadow: '0 0 5px 1px rgba(228,168,83,0.45)' }}
            animate={{ x: [0, p.xDrift, -p.xDrift / 2, 0], y: [0, -p.yDrift, -p.yDrift * 0.4, 0], scale: [1, 1.1, 0.88, 1] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Card */}
      <motion.div
        className="relative z-10 w-full min-w-[360px] max-w-[560px]"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className="bg-[rgba(18,27,56,0.93)] border-[rgba(228,168,83,0.28)] rounded-2xl py-7 px-8 max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden"
          style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(228,168,83,0.06), inset 0 1px 0 rgba(228,168,83,0.1)' }}
        >
          {/* User bar */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-[rgba(228,168,83,0.15)]">
            <div className="flex items-center gap-2.5">
              <div
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[0.85rem] font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #9b59b6, #3498db)', boxShadow: '0 0 0 2px rgba(228,168,83,0.3)' }}
                aria-hidden="true"
              >
                {(username ?? '?')[0].toUpperCase()}
              </div>
              <div className="flex flex-col gap-0">
                <span className="text-[0.68rem] text-[#a0a0b0] leading-none">Welcome back</span>
                <strong className="text-[0.88rem] text-[#e0e0e0] font-semibold leading-none mt-0.5">{username}</strong>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={logout}
              className="text-[0.72rem] text-[#a0a0b0] border-[rgba(228,168,83,0.2)] bg-transparent hover:text-[#e74c3c] hover:border-[rgba(231,76,60,0.4)] h-auto py-1.5 px-2.5"
            >
              Sign out
            </Button>
          </div>

          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-[1.7rem] font-bold text-[#e4a853] mb-1 tracking-[0.02em]">Out of Touch DND</h1>
            <p className="text-[#a0a0b0] text-[0.85rem] mb-4">LLM-Powered Campaign Engine</p>
            <div className="h-px mx-auto w-4/5" style={{ background: 'linear-gradient(90deg, transparent, rgba(228,168,83,0.4), transparent)' }} />
          </div>

          {/* Mode content with transitions */}
          <AnimatePresence mode="wait">

            {/* ── MENU MODE ── */}
            {mode === 'menu' && !charPickSlot && (
              <motion.div key="menu" variants={modeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-5">
                {/* Name input */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="lobby-name-input" className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">
                    Session Name
                  </label>
                  <Input
                    id="lobby-name-input"
                    type="text"
                    placeholder="Your name in session"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    maxLength={24}
                    className="bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50"
                  />
                </div>

                {/* Campaign slots */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-[0.7rem] uppercase tracking-[0.08em] text-[#a0a0b0] font-semibold">Your Campaigns</h3>
                    {!campaignsLoading && (
                      <span className="text-[0.68rem] text-[#a0a0b0] bg-white/[0.05] px-2 py-0.5 rounded-full border border-[#2a2a4a]">
                        {campaigns.length} / 5
                      </span>
                    )}
                  </div>
                  <motion.div
                    key={campaignsLoading ? 'loading' : 'loaded'}
                    className="flex flex-col gap-1.5"
                    initial="initial"
                    animate="animate"
                    variants={{ animate: { transition: { staggerChildren: 0.05 } } }}
                  >
                    {campaignsLoading
                      ? Array.from({ length: 5 }, (_, i) => <SlotSkeleton key={i} index={i} />)
                      : Array.from({ length: 5 }, (_, i) => {
                          const slot = campaigns[i]
                          const color = SLOT_COLORS[i]
                          if (!slot) {
                            return (
                              <motion.div
                                key={`empty-${i}`}
                                variants={slotVariants}
                                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg min-h-[60px] cursor-pointer opacity-50 border border-dashed bg-white/[0.02] transition-all hover:opacity-85"
                                style={{ borderColor: color }}
                                onClick={() => setMode('create')}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && setMode('create')}
                                aria-label="Start a new campaign"
                              >
                                <div className="w-[22px] h-[22px] rounded-full bg-white/[0.06] border flex items-center justify-center text-[0.68rem] font-bold shrink-0" style={{ borderColor: color, color }}>{i + 1}</div>
                                <span className="text-[1.1rem] leading-none ml-1" style={{ color }}>+</span>
                                <span className="text-[0.78rem] text-[#a0a0b0]">New Campaign</span>
                              </motion.div>
                            )
                          }

                          const isConfirming = confirmSlot?.id === slot.id
                          const dateStr = new Date(slot.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          const freshness = slotFreshness(slot.updated_at)
                          const freshnessColor = FRESHNESS_COLORS[freshness]

                          return (
                            <motion.div
                              key={slot.id}
                              variants={slotVariants}
                              className={cn(
                                'flex items-center gap-2.5 px-3 py-2.5 border border-[#2a2a4a] rounded-lg min-h-[60px] bg-white/[0.02] transition-all',
                                isConfirming
                                  ? 'flex-col items-start gap-2 bg-[rgba(228,168,83,0.04)] border-[rgba(228,168,83,0.6)]'
                                  : 'hover:bg-[rgba(228,168,83,0.04)] hover:border-[rgba(228,168,83,0.35)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.3)]',
                              )}
                              style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                            >
                              <div className="w-[22px] h-[22px] rounded-full bg-white/[0.06] border flex items-center justify-center text-[0.68rem] font-bold shrink-0" style={{ borderColor: color, color }}>{i + 1}</div>

                              {!isConfirming && (
                                <>
                                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                    <span className="text-[0.88rem] font-semibold text-[#e0e0e0] truncate">{slot.name}</span>
                                    <span className="text-[0.76rem] text-[#e4a853]">
                                      {slot.my_character
                                        ? <>{slot.my_character.name}<span className="text-[#a0a0b0]"> · {slot.my_character.class}</span><span className="text-[#e4a853] font-semibold"> Lv{slot.my_character.level}</span></>
                                        : <span className="text-[#a0a0b0] italic">No character yet</span>
                                      }
                                    </span>
                                    <div className="flex items-center gap-2.5 mt-0.5">
                                      <span className="flex items-center gap-1.5 text-[0.69rem] text-[#a0a0b0]">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: freshnessColor.bg, boxShadow: freshnessColor.shadow }} />
                                        {dateStr}
                                      </span>
                                      <span className="text-[0.68rem] text-[#a0a0b0] bg-white/[0.05] px-1.5 py-0.5 rounded-lg border border-[#2a2a4a]">
                                        {slot.session_count} session{slot.session_count !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => { setConfirmSlot(slot); setError('') }}
                                    className="text-[0.82rem] shrink-0 h-auto py-1.5 px-3 border-[#2a2a4a] bg-transparent text-[#e0e0e0] hover:border-[rgba(228,168,83,0.5)] hover:text-[#e4a853]"
                                  >
                                    Resume
                                  </Button>
                                </>
                              )}

                              {isConfirming && (
                                <div className="flex flex-col gap-2 w-full">
                                  <span className="text-[0.82rem] text-[#e0e0e0]">Continue this campaign?</span>
                                  <div className="flex gap-2 flex-wrap">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleConfirmResume(slot)}
                                      disabled={charListLoading}
                                      className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 disabled:opacity-40"
                                    >
                                      {charListLoading ? '…' : 'Yes, Resume'}
                                    </Button>
                                    <Button variant="ghost" size="sm" type="button" onClick={() => setConfirmSlot(null)} className="text-[#a0a0b0] hover:text-[#e0e0e0]">
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )
                        })
                    }
                  </motion.div>
                </div>

                {/* Primary actions */}
                <div className="flex flex-col gap-2.5">
                  <Button
                    type="button"
                    onClick={() => setMode('create')}
                    className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 hover:-translate-y-px min-h-[40px]"
                    style={{ boxShadow: '0 4px 14px rgba(228,168,83,0.2)' }}
                  >
                    Create Session
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setMode('join')}
                    className="bg-transparent text-[#e0e0e0] border-[#2a2a4a] hover:border-[#e4a853] hover:text-[#e4a853] min-h-[40px]"
                  >
                    Join Session
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── CHARACTER PICKER ── */}
            {charPickSlot && (
              <motion.div key="char-pick" variants={modeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-3">
                <p className="text-[0.82rem] text-[#a0a0b0] text-center m-0">
                  Choose a character for &ldquo;{charPickSlot.name}&rdquo;
                </p>
                <div className="flex flex-col gap-1.5">
                  {charList.map((char) => (
                    <div
                      key={char.char_id}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 border rounded-lg min-h-[52px] bg-white/[0.02] transition-colors',
                        char.is_mine ? 'border-[rgba(228,168,83,0.5)] bg-[rgba(228,168,83,0.04)]' : 'border-[#2a2a4a]',
                      )}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[0.88rem] font-semibold text-[#e0e0e0]">{char.name}</span>
                        <span className="text-[0.76rem] text-[#e4a853]">
                          {char.class} Lv{char.level}
                          {char.is_mine && <span className="text-[#2ecc71] font-semibold"> · Yours</span>}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => handleResume(charPickSlot, char.char_id)}
                        disabled={resuming}
                        className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 disabled:opacity-40"
                      >
                        {resuming ? '…' : 'Play'}
                      </Button>
                    </div>
                  ))}
                  {charList.length === 0 && (
                    <p className="text-[0.8rem] text-[#a0a0b0] text-center py-1.5">No characters found — create one below.</p>
                  )}
                </div>
                <div className="flex gap-2 justify-center flex-wrap pt-2 border-t border-[#2a2a4a]">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => handleResume(charPickSlot)}
                    disabled={resuming}
                    className="bg-transparent text-[#e0e0e0] border-[#2a2a4a] hover:border-[#e4a853] hover:text-[#e4a853] disabled:opacity-40"
                  >
                    Create New Character
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => { setCharPickSlot(null); setCharList([]) }}
                    className="text-[#a0a0b0] hover:text-[#e0e0e0]"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── CREATE MODE ── */}
            {!charPickSlot && mode === 'create' && (
              <motion.div key="create" variants={modeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-3">
                <h3 className="text-[0.85rem] font-semibold text-[#e4a853] uppercase tracking-[0.05em] pb-2 border-b border-[rgba(228,168,83,0.15)]">
                  New Campaign
                </h3>
                <Input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  maxLength={24}
                  autoFocus
                  onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleCampaignSetupNext()}
                  className="bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50"
                />
                <label className="flex items-center gap-2 text-[#a0a0b0] text-[0.85rem] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mockMode}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMockMode(e.target.checked)}
                    className="accent-[#e4a853]"
                  />
                  <span>Enable mock mode</span>
                </label>
                <Button
                  type="button"
                  onClick={handleCampaignSetupNext}
                  disabled={!name.trim()}
                  className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 disabled:opacity-40 min-h-[40px]"
                >
                  Choose Adventure →
                </Button>
                <Button variant="ghost" type="button" onClick={() => setMode('menu')} className="text-[#a0a0b0] hover:text-[#e0e0e0]">
                  ← Back
                </Button>
              </motion.div>
            )}

            {/* ── CAMPAIGN SETUP MODE ── */}
            {!charPickSlot && mode === 'campaign_setup' && (
              <motion.div key="campaign_setup" variants={modeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-4">
                <h3 className="text-[0.85rem] font-semibold text-[#e4a853] uppercase tracking-[0.05em] pb-2 border-b border-[rgba(228,168,83,0.15)]">
                  Choose Your Adventure
                </h3>
                <div className="grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-0.5">
                  {ADVENTURE_HOOKS.map(hook => (
                    <button
                      key={hook.id}
                      type="button"
                      onClick={() => { setSelectedHook(hook); setSelectedTone(hook.tone); setCustomPremise('') }}
                      className={cn(
                        'bg-white/[0.04] border rounded-lg p-2.5 text-left flex flex-col gap-1 transition-all cursor-pointer',
                        selectedHook?.id === hook.id
                          ? 'bg-[rgba(228,168,83,0.12)] border-[rgba(228,168,83,0.65)] shadow-[0_0_12px_rgba(228,168,83,0.1)]'
                          : 'border-white/10 hover:bg-[rgba(228,168,83,0.07)] hover:border-[rgba(228,168,83,0.35)]',
                      )}
                    >
                      <span className="text-[0.82rem] font-semibold text-white/90">{hook.title}</span>
                      <span className="text-[0.72rem] text-[#a0a0b0] leading-[1.35]">{hook.summary}</span>
                      <span className="text-[0.65rem] uppercase tracking-[0.08em] text-[#e4a853] opacity-75 mt-0.5">{hook.tone}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] text-[#a0a0b0]">Or write your own premise:</span>
                  <textarea
                    placeholder="Describe the adventure hook…"
                    value={customPremise}
                    rows={3}
                    maxLength={400}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setCustomPremise(e.target.value); if (e.target.value.trim()) setSelectedHook(null) }}
                    className="bg-white/[0.05] border border-white/[0.12] rounded-md px-3 py-2 text-[0.82rem] text-[#e0e0e0] leading-relaxed resize-y font-[inherit] outline-none transition-colors focus:border-[rgba(228,168,83,0.5)] placeholder:text-[#a0a0b0]/50"
                  />
                </div>
                {!selectedHook && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[0.75rem] text-[#a0a0b0]">Tone:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {TONE_OPTIONS.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTone(t.id)}
                          className={cn(
                            'bg-white/[0.04] border rounded-full px-3 py-1 text-[0.75rem] text-white/75 cursor-pointer transition-all',
                            selectedTone === t.id
                              ? 'bg-[rgba(228,168,83,0.15)] border-[rgba(228,168,83,0.6)] text-[#e4a853]'
                              : 'border-white/[0.12] hover:border-[rgba(228,168,83,0.4)] hover:text-white/90',
                          )}
                        >
                          {t.icon} {t.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2.5 mt-1">
                  <Button
                    type="button"
                    onClick={handleCreate}
                    disabled={!selectedHook && !customPremise.trim()}
                    className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 disabled:opacity-40 min-h-[40px]"
                  >
                    Create Campaign
                  </Button>
                  <Button variant="ghost" type="button" onClick={() => setMode('create')} className="text-[#a0a0b0] hover:text-[#e0e0e0]">
                    ← Back
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── JOIN MODE ── */}
            {!charPickSlot && mode === 'join' && (
              <motion.div key="join" variants={modeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-3">
                <h3 className="text-[0.85rem] font-semibold text-[#e4a853] uppercase tracking-[0.05em] pb-2 border-b border-[rgba(228,168,83,0.15)]">
                  Join a Campaign
                </h3>
                <Input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  maxLength={24}
                  autoFocus
                  className="bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50"
                />
                <Input
                  type="text"
                  placeholder="Room code (e.g. GOBLIN-42)"
                  value={joinCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={20}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleJoin()}
                  className="bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50"
                />
                <Button
                  type="button"
                  onClick={handleJoin}
                  disabled={!name.trim() || !joinCode.trim()}
                  className="bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] font-semibold border-none hover:opacity-90 disabled:opacity-40 min-h-[40px]"
                >
                  Join
                </Button>
                <Button variant="ghost" type="button" onClick={() => setMode('menu')} className="text-[#a0a0b0] hover:text-[#e0e0e0]">
                  ← Back
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                key="error"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-[#e74c3c] text-[0.85rem] mt-2 px-2.5 py-1.5 bg-[rgba(231,76,60,0.1)] border-l-[3px] border-[#e74c3c] rounded-sm m-0"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Roster (after joining) */}
          {roomCode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-5 pt-4 border-t border-[rgba(228,168,83,0.15)]"
            >
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-[0.82rem] text-[#e0e0e0]">Room: <strong className="text-[#e4a853]">{roomCode}</strong></span>
                <span className="text-[0.75rem] text-[#a0a0b0]">{players.length} player{players.length !== 1 ? 's' : ''}</span>
              </div>
              <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                {players.map((player) => (
                  <li key={player.id} className="flex items-center gap-2 text-[#e0e0e0] text-[0.83rem]">
                    <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[0.72rem] font-bold text-[#a0a0b0] shrink-0 border border-[#2a2a4a]" style={{ background: 'linear-gradient(135deg, #2a3a6e, #0f3460)' }}>
                      {(player.name[0] ?? '?').toUpperCase()}
                    </div>
                    <span className="flex-1">{player.name}</span>
                    <span className={cn('text-[0.72rem]', player.character_id ? 'text-[#2ecc71]' : 'text-[#a0a0b0]')}>
                      {player.character_id ? '✓ Ready' : 'No character'}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}
