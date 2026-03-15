import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import { API_BASE } from '../config/endpoints'
import { getCharacterSpriteId } from '../config/characterSprites'
import type { CharacterData, SpellOption } from '../types'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const RACES   = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling']
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']
const ABILITIES     = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

type CharacterSpriteOption = { id: string; label: string; races: string[]; classes: string[] }

const CHARACTER_SPRITES: CharacterSpriteOption[] = [
  { id: 'pc_knight', label: 'Knight',  races: ['Human', 'Dragonborn', 'Half-Orc'],           classes: ['Fighter', 'Paladin', 'Barbarian'] },
  { id: 'pc_ranger', label: 'Ranger',  races: ['Elf', 'Half-Elf', 'Human', 'Halfling'],       classes: ['Ranger', 'Druid', 'Rogue'] },
  { id: 'pc_mage',   label: 'Mage',    races: ['Human', 'Elf', 'Gnome', 'Tiefling'],          classes: ['Wizard', 'Sorcerer', 'Warlock'] },
  { id: 'pc_cleric', label: 'Cleric',  races: ['Human', 'Dwarf', 'Half-Elf'],                 classes: ['Cleric', 'Paladin'] },
  { id: 'pc_bard',   label: 'Bard',    races: ['Human', 'Elf', 'Half-Elf', 'Tiefling'],       classes: ['Bard', 'Rogue'] },
  { id: 'pc_monk',   label: 'Monk',    races: ['Human', 'Elf', 'Gnome', 'Half-Orc'],          classes: ['Monk', 'Rogue'] },
  { id: 'pc_druid',  label: 'Druid',   races: ['Elf', 'Gnome', 'Halfling', 'Half-Elf'],       classes: ['Druid', 'Ranger', 'Cleric'] },
  { id: 'pc_rogue',  label: 'Rogue',   races: ['Halfling', 'Human', 'Tiefling', 'Half-Elf'],  classes: ['Rogue', 'Ranger', 'Bard'] },
]

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  key: i,
  left:     (Math.sin(i * 3.1) * 0.5 + 0.5) * 100,
  top:      (Math.cos(i * 1.9) * 0.5 + 0.5) * 100,
  size:     1.2 + Math.abs(Math.sin(i * 4.7)) * 2.0,
  duration: 8 + Math.abs(Math.cos(i * 1.3)) * 10,
  delay:    -(Math.abs(Math.sin(i * 1.2 + 0.7)) * 8),
  opacity:  0.08 + Math.abs(Math.sin(i * 2.5 + 1)) * 0.22,
  xDrift:   2 + Math.abs(Math.sin(i * 2.1)) * 5,
  yDrift:   15 + Math.abs(Math.cos(i * 1.8)) * 10,
}))

function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[0.72rem] text-[#e4a853] shrink-0">{icon}</span>
      <span className="text-[0.68rem] uppercase tracking-[0.1em] text-[#e4a853] font-bold whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(228,168,83,0.3), transparent)' }} />
    </div>
  )
}

// Native select styled to match the dark theme
function ThemedSelect({ id, value, onChange, children }: {
  id?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  children: React.ReactNode
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="w-full bg-[rgba(26,26,62,0.85)] border border-[#2a2a4a] text-[#e0e0e0] px-3 py-2.5 rounded-lg text-[0.92rem] outline-none transition-all cursor-pointer appearance-none focus:border-[#e4a853] focus:shadow-[0_0_0_3px_rgba(228,168,83,0.12)]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23a0a0b0' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
        paddingRight: '2.2rem',
      }}
    >
      {children}
    </select>
  )
}

function getSpriteOptionsFor(race: string, charClass: string): CharacterSpriteOption[] {
  const mappedSpriteId = getCharacterSpriteId(charClass, race)
  if (mappedSpriteId) {
    return [{ id: mappedSpriteId, label: `${race} ${charClass}`, races: [race], classes: [charClass] }]
  }
  const raceNorm  = race.trim().toLowerCase()
  const classNorm = charClass.trim().toLowerCase()
  const filtered  = CHARACTER_SPRITES.filter(opt =>
    opt.races.some(r => r.toLowerCase() === raceNorm) || opt.classes.some(c => c.toLowerCase() === classNorm),
  )
  return filtered.length > 0 ? filtered : CHARACTER_SPRITES
}

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try { return JSON.parse(text) as Record<string, unknown> } catch { return {} }
}

export default function CharacterCreator() {
  const { roomCode, playerId, players, getSession, mockMode } = useSessionStore()
  const setCharacters = useGameStore(s => s.setCharacters)
  const authToken = useAuthStore(s => s.token)

  const [name, setName]           = useState('')
  const [race, setRace]           = useState('Human')
  const [charClass, setCharClass] = useState('Fighter')
  const [spriteId, setSpriteId]   = useState('pc_knight')
  const [abilities, setAbilities] = useState<Record<string, number>>(() => {
    const obj: Record<string, number> = {}
    ABILITIES.forEach((a, i) => { obj[a] = STANDARD_ARRAY[i] })
    return obj
  })
  const [creating, setCreating]   = useState(false)
  const [spellcastingMode, setSpellcastingMode]           = useState<'none' | 'known' | 'prepared'>('none')
  const [knownLimit, setKnownLimit]                       = useState(0)
  const [preparedLimit, setPreparedLimit]                 = useState(0)
  const [availableSpells, setAvailableSpells]             = useState<SpellOption[]>([])
  const [selectedKnownSpells, setSelectedKnownSpells]     = useState<string[]>([])
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<string[]>([])
  const [error, setError]         = useState('')

  const handleAbilityChange = (ability: string, value: number) => {
    setAbilities(prev => ({ ...prev, [ability]: Math.max(3, Math.min(20, value)) }))
  }

  const loadSpellOptions = async (nextClass: string) => {
    try {
      const payload = await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
        action: 'get_spell_options',
        char_class: nextClass,
        level: 1,
        mock_mode: mockMode,
      })

      if (typeof payload.error === 'string') {
        throw new Error(payload.error)
      }

      setSpellcastingMode((payload.spellcasting_mode as 'none' | 'known' | 'prepared') || 'none')
      setKnownLimit(Number(payload.known_limit || 0))
      setPreparedLimit(Number(payload.prepared_limit || 0))
      setAvailableSpells((payload.spells || []) as SpellOption[])
      setError('')
      if ((payload.spellcasting_mode || 'none') === 'known') {
        setSelectedKnownSpells(((payload.spells || []) as SpellOption[]).filter(s => s.level > 0).slice(0, Number(payload.known_limit || 0)).map(s => s.name))
        setSelectedPreparedSpells([])
      } else if ((payload.spellcasting_mode || 'none') === 'prepared') {
        setSelectedPreparedSpells(((payload.spells || []) as SpellOption[]).filter(s => s.level > 0).slice(0, Number(payload.prepared_limit || 0)).map(s => s.name))
        setSelectedKnownSpells([])
      } else {
        setSelectedKnownSpells([])
        setSelectedPreparedSpells([])
      }
    } catch (err: unknown) {
      setSpellcastingMode('none'); setKnownLimit(0); setPreparedLimit(0)
      setAvailableSpells([]); setSelectedKnownSpells([]); setSelectedPreparedSpells([])
      setError(err instanceof Error ? err.message : 'Unable to load spell options right now. Spell options require the dm-action edge function.')
    }
  }

  const toggleSpell = (spellName: string) => {
    if (spellcastingMode === 'known') {
      setSelectedKnownSpells(prev => prev.includes(spellName) ? prev.filter(s => s !== spellName) : prev.length >= knownLimit ? prev : [...prev, spellName])
      return
    }
    if (spellcastingMode === 'prepared') {
      setSelectedPreparedSpells(prev => prev.includes(spellName) ? prev.filter(s => s !== spellName) : prev.length >= preparedLimit ? prev : [...prev, spellName])
    }
  }

  const handleCreate = async () => {
    if (!name.trim() || !roomCode || !playerId) return
    setCreating(true)
    setError('')
    const resolvedSpriteId = getCharacterSpriteId(charClass, race) ?? spriteId
    const hasExplicitApiUrl = Boolean(import.meta.env.VITE_API_URL?.trim())

    const createViaLocalApi = async (): Promise<Record<string, unknown>> => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`
      const res = await fetch(`${API_BASE}/api/character/create`, {
        method: 'POST', headers,
        body: JSON.stringify({
          room_code: roomCode, player_id: playerId, name: name.trim(), race,
          char_class: charClass, sprite_id: resolvedSpriteId, abilities,
          known_spells: spellcastingMode === 'known' ? selectedKnownSpells : [],
          prepared_spells: spellcastingMode === 'prepared' ? selectedPreparedSpells : [],
        }),
      })
      const payload = await parseJsonBody(res)
      if (!res.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to create character right now.')
      return payload
    }

    const createViaEdge = async (): Promise<Record<string, unknown>> => {
      return await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
        action: 'create_character', room_code: roomCode, player_id: playerId,
        name: name.trim(), race, char_class: charClass, sprite_id: resolvedSpriteId, abilities,
        known_spells: spellcastingMode === 'known' ? selectedKnownSpells : undefined,
        prepared_spells: spellcastingMode === 'prepared' ? selectedPreparedSpells : undefined,
        mock_mode: mockMode,
      })
    }

    try {
      let payload: Record<string, unknown> = {}
      if (hasExplicitApiUrl) {
        try {
          payload = await createViaLocalApi()
        } catch {
          payload = await createViaEdge()
        }
      } else {
        try {
          payload = await createViaEdge()
        } catch {
          payload = await createViaLocalApi()
        }
      }

      if (typeof payload.error === 'string') throw new Error(payload.error)
      const created = payload.character as CharacterData | undefined
      if (created?.id && typeof created.id === 'string') {
        setCharacters({ ...useGameStore.getState().characters, [created.id]: created })
        const sessionState = useSessionStore.getState()
        sessionState.setPlayers(sessionState.players.map(p => p.id === playerId ? { ...p, character_id: created.id as string } : p))
      }
      useSessionStore.getState().setPhase('playing')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create character right now.')
      setCreating(false)
    }
  }

  useEffect(() => { loadSpellOptions(charClass) }, [])

  useEffect(() => {
    const options = getSpriteOptionsFor(race, charClass)
    if (!options.some(opt => opt.id === spriteId)) setSpriteId(options[0].id)
  }, [race, charClass, spriteId])

  useEffect(() => {
    if (!roomCode) return
    getSession(roomCode).catch(() => {})
  }, [roomCode, getSession])

  const spriteOptions   = getSpriteOptionsFor(race, charClass)
  const selectedSpells  = spellcastingMode === 'known' ? selectedKnownSpells : selectedPreparedSpells
  const spellLimit      = spellcastingMode === 'known' ? knownLimit : preparedLimit

  return (
    <div
      className="w-full h-full flex items-start justify-center overflow-y-auto p-6 relative"
      style={{ background: 'radial-gradient(ellipse at 40% 30%, #1a2860 0%, #090d1f 55%, #0d0812 100%)' }}
    >
      {/* Overlays */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)' }} aria-hidden="true" />
      <div className="fixed inset-0 pointer-events-none z-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)' }} aria-hidden="true" />

      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        {PARTICLES.map(p => (
          <motion.span
            key={p.key}
            className="absolute rounded-full"
            style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.size}px`, height: `${p.size}px`, opacity: p.opacity, background: '#e4a853', boxShadow: '0 0 5px 1px rgba(228,168,83,0.4)' }}
            animate={{ x: [0, p.xDrift, -p.xDrift / 2, 0], y: [0, -p.yDrift, -p.yDrift * 0.4, 0], scale: [1, 1.1, 0.88, 1] }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-[540px] mb-6"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card
          className="bg-[rgba(18,27,56,0.93)] border-[rgba(228,168,83,0.28)] rounded-2xl py-7 px-8"
          style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(228,168,83,0.06), inset 0 1px 0 rgba(228,168,83,0.1)' }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <motion.div
              className="text-[1.8rem] leading-none mb-1.5"
              animate={{ filter: ['drop-shadow(0 0 5px rgba(228,168,83,0.3))', 'drop-shadow(0 0 14px rgba(228,168,83,0.7))', 'drop-shadow(0 0 5px rgba(228,168,83,0.3))'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden="true"
            >
              ⚔
            </motion.div>
            <h2 className="text-[1.55rem] font-bold text-[#e4a853] tracking-[0.02em] mb-1">Forge Your Hero</h2>
            <p className="text-[0.82rem] text-[#a0a0b0] mb-3.5 flex items-center justify-center gap-1.5 flex-wrap">
              {roomCode
                ? <>
                    <span className="inline-block bg-[rgba(228,168,83,0.12)] text-[#e4a853] px-2 py-0.5 rounded font-mono text-[0.82rem] border border-[rgba(228,168,83,0.25)] tracking-[0.05em]">{roomCode}</span>
                    · {players.length} in lobby
                  </>
                : 'Create your character to begin the adventure'
              }
            </p>
            <div className="h-px mx-auto w-4/5" style={{ background: 'linear-gradient(90deg, transparent, rgba(228,168,83,0.4), transparent)' }} />
          </div>

          <div className="flex flex-col gap-4">

            {/* Identity */}
            <SectionHeading icon="✦" label="Identity" />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cc-name" className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">
                Character Name
              </label>
              <Input
                id="cc-name"
                type="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="Enter a name…"
                maxLength={32}
                autoFocus
                className="bg-[rgba(26,26,62,0.85)] text-[#e0e0e0] placeholder:text-[#a0a0b0]/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cc-race" className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">Race</label>
                <ThemedSelect id="cc-race" value={race} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRace(e.target.value)}>
                  {RACES.map(r => <option key={r} value={r} style={{ background: '#16213e' }}>{r}</option>)}
                </ThemedSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cc-class" className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">Class</label>
                <ThemedSelect
                  id="cc-class"
                  value={charClass}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const nextClass = e.target.value
                    setCharClass(nextClass)
                    loadSpellOptions(nextClass)
                  }}
                >
                  {CLASSES.map(c => <option key={c} value={c} style={{ background: '#16213e' }}>{c}</option>)}
                </ThemedSelect>
              </div>
            </div>

            {/* Appearance */}
            <SectionHeading icon="◈" label="Appearance" />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="cc-sprite" className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">Sprite</label>
              <ThemedSelect id="cc-sprite" value={spriteId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSpriteId(e.target.value)}>
                {spriteOptions.map(opt => <option key={opt.id} value={opt.id} style={{ background: '#16213e' }}>{opt.label}</option>)}
              </ThemedSelect>
              <p className="text-[0.72rem] text-[#a0a0b0] italic m-0">Filtered by your race &amp; class selection.</p>
            </div>

            {/* Starting Spells */}
            <AnimatePresence>
              {spellcastingMode !== 'none' && (
                <motion.div
                  key="spells"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-4 overflow-hidden"
                >
                  <SectionHeading icon="✦" label="Starting Spells" />
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.7rem] uppercase tracking-[0.07em] text-[#a0a0b0]">
                        {spellcastingMode === 'known' ? 'Known Spells' : 'Prepared Spells'}
                      </span>
                      <span className="text-[0.72rem] text-[#a0a0b0] bg-white/[0.06] px-2 py-0.5 rounded-lg border border-[#2a2a4a]">
                        {selectedSpells.length} / {spellLimit}
                      </span>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto border border-[#2a2a4a] rounded-lg bg-white/[0.02]">
                      {availableSpells.filter(s => s.level > 0).map((spell, idx, arr) => {
                        const selected = selectedSpells.includes(spell.name)
                        const disabled = !selected && selectedSpells.length >= spellLimit
                        return (
                          <label
                            key={spell.name}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-1.5 text-[0.85rem] cursor-pointer transition-colors',
                              idx < arr.length - 1 && 'border-b border-white/[0.04]',
                              selected  && 'bg-[rgba(228,168,83,0.07)] text-[#e4a853]',
                              !selected && !disabled && 'text-[#e0e0e0] hover:bg-[rgba(228,168,83,0.05)]',
                              disabled  && 'opacity-40 cursor-default text-[#e0e0e0]',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              onChange={() => toggleSpell(spell.name)}
                              className="accent-[#e4a853] w-3.5 h-3.5 shrink-0"
                            />
                            <span className="flex-1">{spell.name}</span>
                            <span className="text-[0.72rem] text-[#a0a0b0] bg-white/[0.06] px-1.5 py-0.5 rounded shrink-0">L{spell.level}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ability Scores */}
            <SectionHeading icon="◈" label="Ability Scores" />
            <p className="text-[0.72rem] text-[#a0a0b0] italic -mt-2 m-0">Standard Array: 15, 14, 13, 12, 10, 8</p>

            <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-2">
              {ABILITIES.map(ab => {
                const mod = Math.floor((abilities[ab] - 10) / 2)
                return (
                  <div
                    key={ab}
                    className="flex flex-col items-center gap-1 bg-white/[0.03] border border-[#2a2a4a] rounded-xl py-2.5 px-1.5 transition-all focus-within:border-[rgba(228,168,83,0.5)] focus-within:bg-[rgba(228,168,83,0.04)]"
                  >
                    <span className="text-[0.65rem] uppercase tracking-[0.08em] text-[#a0a0b0] font-semibold leading-none">{ab}</span>
                    <input
                      type="number"
                      min={3}
                      max={20}
                      value={abilities[ab]}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleAbilityChange(ab, parseInt(e.target.value) || 10)}
                      className="w-[52px] bg-[rgba(26,26,62,0.8)] border border-[#2a2a4a] text-[#e0e0e0] text-center py-1 rounded-md text-[1.15rem] font-bold outline-none transition-colors focus:border-[#e4a853] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className={cn('text-[0.82rem] font-bold leading-none', mod >= 0 ? 'text-[#2ecc71]' : 'text-[#e74c3c]')}>
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[#e74c3c] text-[0.85rem] m-0 px-2.5 py-1.5 bg-[rgba(231,76,60,0.1)] border-l-[3px] border-[#e74c3c] rounded-sm"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="mt-2 min-h-[48px] text-base font-bold bg-linear-to-br from-[#e4a853] to-[#c8882a] text-[#1a1a2e] border-none hover:opacity-90 hover:-translate-y-px active:translate-y-0 disabled:opacity-40 tracking-[0.01em]"
              style={{ boxShadow: '0 4px 16px rgba(228,168,83,0.25)' }}
            >
              {creating
                ? <><span className="inline-block w-4 h-4 border-2 border-[rgba(26,26,46,0.3)] border-t-[#1a1a2e] rounded-full animate-spin mr-2" />Creating…</>
                : '⚔ Begin the Adventure'
              }
            </Button>

          </div>
        </Card>
      </motion.div>
    </div>
  )
}
