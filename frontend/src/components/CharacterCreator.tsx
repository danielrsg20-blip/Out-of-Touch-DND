import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import { API_BASE } from '../config/endpoints'
import { getCharacterSpriteId } from '../config/characterSprites'
import type { CharacterData, SpellOption } from '../types'
import './CharacterCreator.css'

const RACES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling']
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']
const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

type CharacterSpriteOption = {
  id: string
  label: string
  races: string[]
  classes: string[]
}

const CHARACTER_SPRITES: CharacterSpriteOption[] = [
  { id: 'pc_knight', label: 'Knight', races: ['Human', 'Dragonborn', 'Half-Orc'], classes: ['Fighter', 'Paladin', 'Barbarian'] },
  { id: 'pc_ranger', label: 'Ranger', races: ['Elf', 'Half-Elf', 'Human', 'Halfling'], classes: ['Ranger', 'Druid', 'Rogue'] },
  { id: 'pc_mage', label: 'Mage', races: ['Human', 'Elf', 'Gnome', 'Tiefling'], classes: ['Wizard', 'Sorcerer', 'Warlock'] },
  { id: 'pc_cleric', label: 'Cleric', races: ['Human', 'Dwarf', 'Half-Elf'], classes: ['Cleric', 'Paladin'] },
  { id: 'pc_bard', label: 'Bard', races: ['Human', 'Elf', 'Half-Elf', 'Tiefling'], classes: ['Bard', 'Rogue'] },
  { id: 'pc_monk', label: 'Monk', races: ['Human', 'Elf', 'Gnome', 'Half-Orc'], classes: ['Monk', 'Rogue'] },
  { id: 'pc_druid', label: 'Druid', races: ['Elf', 'Gnome', 'Halfling', 'Half-Elf'], classes: ['Druid', 'Ranger', 'Cleric'] },
  { id: 'pc_rogue', label: 'Rogue', races: ['Halfling', 'Human', 'Tiefling', 'Half-Elf'], classes: ['Rogue', 'Ranger', 'Bard'] },
]

function getSpriteOptionsFor(race: string, charClass: string): CharacterSpriteOption[] {
  const mappedSpriteId = getCharacterSpriteId(charClass, race)
  if (mappedSpriteId) {
    return [
      {
        id: mappedSpriteId,
        label: `${race} ${charClass}`,
        races: [race],
        classes: [charClass],
      },
    ]
  }

  const raceNorm = race.trim().toLowerCase()
  const classNorm = charClass.trim().toLowerCase()
  const filtered = CHARACTER_SPRITES.filter((option) =>
    option.races.some((item) => item.toLowerCase() === raceNorm)
    || option.classes.some((item) => item.toLowerCase() === classNorm),
  )
  return filtered.length > 0 ? filtered : CHARACTER_SPRITES
}

async function parseJsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) {
    return {}
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

export default function CharacterCreator() {
  const { roomCode, playerId, players, getSession, mockMode } = useSessionStore()
  const setCharacters = useGameStore(s => s.setCharacters)
  const authToken = useAuthStore(s => s.token)
  const [name, setName] = useState('')
  const [race, setRace] = useState('Human')
  const [charClass, setCharClass] = useState('Fighter')
  const [spriteId, setSpriteId] = useState('pc_knight')
  const [abilities, setAbilities] = useState<Record<string, number>>(() => {
    const obj: Record<string, number> = {}
    ABILITIES.forEach((a, i) => { obj[a] = STANDARD_ARRAY[i] })
    return obj
  })
  const [creating, setCreating] = useState(false)
  const [spellcastingMode, setSpellcastingMode] = useState<'none' | 'known' | 'prepared'>('none')
  const [knownLimit, setKnownLimit] = useState(0)
  const [preparedLimit, setPreparedLimit] = useState(0)
  const [availableSpells, setAvailableSpells] = useState<SpellOption[]>([])
  const [selectedKnownSpells, setSelectedKnownSpells] = useState<string[]>([])
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<string[]>([])
  const [error, setError] = useState('')

  const handleAbilityChange = (ability: string, value: number) => {
    setAbilities(prev => ({ ...prev, [ability]: Math.max(3, Math.min(20, value)) }))
  }

  const loadSpellOptions = async (nextClass: string) => {
    try {
      let payload: Record<string, unknown> = {}
      try {
        payload = await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
          action: 'get_spell_options',
          char_class: nextClass,
          level: 1,
          mock_mode: mockMode,
        })
      } catch {
        const res = await fetch(`${API_BASE}/api/spells/options/${encodeURIComponent(nextClass)}/1`)
        payload = await parseJsonBody(res)
        if (!res.ok) {
          throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load spell options.')
        }
      }

      if (typeof payload.error === 'string') {
        throw new Error(payload.error)
      }

      setSpellcastingMode((payload.spellcasting_mode as 'none' | 'known' | 'prepared') || 'none')
      setKnownLimit(Number(payload.known_limit || 0))
      setPreparedLimit(Number(payload.prepared_limit || 0))
      setAvailableSpells((payload.spells || []) as SpellOption[])
      setError('')

      if ((payload.spellcasting_mode || 'none') === 'known') {
        const picks = ((payload.spells || []) as SpellOption[])
          .filter(s => s.level > 0)
          .slice(0, Number(payload.known_limit || 0))
          .map(s => s.name)
        setSelectedKnownSpells(picks)
        setSelectedPreparedSpells([])
      } else if ((payload.spellcasting_mode || 'none') === 'prepared') {
        const picks = ((payload.spells || []) as SpellOption[])
          .filter(s => s.level > 0)
          .slice(0, Number(payload.prepared_limit || 0))
          .map(s => s.name)
        setSelectedPreparedSpells(picks)
        setSelectedKnownSpells([])
      } else {
        setSelectedKnownSpells([])
        setSelectedPreparedSpells([])
      }
    } catch (err: unknown) {
      setSpellcastingMode('none')
      setKnownLimit(0)
      setPreparedLimit(0)
      setAvailableSpells([])
      setSelectedKnownSpells([])
      setSelectedPreparedSpells([])
      setError(err instanceof Error ? err.message : 'Unable to load spell options right now.')
    }
  }

  const toggleSpell = (spellName: string) => {
    if (spellcastingMode === 'known') {
      setSelectedKnownSpells(prev => {
        if (prev.includes(spellName)) return prev.filter(s => s !== spellName)
        if (prev.length >= knownLimit) return prev
        return [...prev, spellName]
      })
      return
    }

    if (spellcastingMode === 'prepared') {
      setSelectedPreparedSpells(prev => {
        if (prev.includes(spellName)) return prev.filter(s => s !== spellName)
        if (prev.length >= preparedLimit) return prev
        return [...prev, spellName]
      })
    }
  }

  const handleCreate = async () => {
    if (!name.trim() || !roomCode || !playerId) return
    setCreating(true)
    setError('')
    const resolvedSpriteId = getCharacterSpriteId(charClass, race) ?? spriteId
    try {
      let payload: Record<string, unknown> = {}
      try {
        payload = await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
          action: 'create_character',
          room_code: roomCode,
          player_id: playerId,
          name: name.trim(),
          race,
          char_class: charClass,
          sprite_id: resolvedSpriteId,
          abilities,
          known_spells: spellcastingMode === 'known' ? selectedKnownSpells : undefined,
          prepared_spells: spellcastingMode === 'prepared' ? selectedPreparedSpells : undefined,
          mock_mode: mockMode,
        })
      } catch {
        const charCreateHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authToken) charCreateHeaders['Authorization'] = `Bearer ${authToken}`
        const res = await fetch(`${API_BASE}/api/character/create`, {
          method: 'POST',
          headers: charCreateHeaders,
          body: JSON.stringify({
            room_code: roomCode,
            player_id: playerId,
            name: name.trim(),
            race,
            char_class: charClass,
            abilities,
            known_spells: spellcastingMode === 'known' ? selectedKnownSpells : [],
            prepared_spells: spellcastingMode === 'prepared' ? selectedPreparedSpells : [],
          }),
        })
        payload = await parseJsonBody(res)
        if (!res.ok) {
          throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to create character right now.')
        }
      }

      if (typeof payload.error === 'string') {
        throw new Error(payload.error)
      }

      const created = payload.character as CharacterData | undefined
      if (created?.id && typeof created.id === 'string') {
        const current = useGameStore.getState().characters
        setCharacters({
          ...current,
          [created.id]: created,
        })

        const sessionState = useSessionStore.getState()
        sessionState.setPlayers(
          sessionState.players.map((player) =>
            player.id === playerId
              ? { ...player, character_id: created.id as string }
              : player,
          ),
        )
      }

      useSessionStore.getState().setPhase('playing')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create character right now.')
      setCreating(false)
    }
  }

  useEffect(() => {
    loadSpellOptions(charClass)
  }, [])

  useEffect(() => {
    const options = getSpriteOptionsFor(race, charClass)
    if (!options.some((option) => option.id === spriteId)) {
      setSpriteId(options[0].id)
    }
  }, [race, charClass, spriteId])

  const spriteOptions = getSpriteOptionsFor(race, charClass)

  useEffect(() => {
    if (!roomCode) {
      return
    }
    getSession(roomCode).catch(() => {})
  }, [roomCode, getSession])

  return (
    <div className="creator-wrapper">
      <div className="creator-card">
        <div className="creator-header">
          <h2>Create Your Character</h2>
          {roomCode && <p className="room-badge">Room: {roomCode}</p>}
          <p className="player-count">{players.length} player(s) in lobby</p>
        </div>

        <div className="creator-form">
          <div className="form-group">
            <label>Character Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter a name..."
              className="creator-input"
              maxLength={32}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Race</label>
              <select value={race} onChange={e => setRace(e.target.value)} className="creator-select">
                {RACES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Class</label>
              <select
                value={charClass}
                onChange={e => {
                  const nextClass = e.target.value
                  setCharClass(nextClass)
                  loadSpellOptions(nextClass)
                }}
                className="creator-select"
              >
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Sprite</label>
            <select
              value={spriteId}
              onChange={e => setSpriteId(e.target.value)}
              className="creator-select"
            >
              {spriteOptions.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <p className="sprite-hint">Options are filtered by your current race/class.</p>
          </div>

          {spellcastingMode !== 'none' && (
            <div className="form-group spell-picker-group">
              <label>
                Level 1 Spell Selection
                {spellcastingMode === 'known'
                  ? ` (choose up to ${knownLimit} known spells)`
                  : ` (choose up to ${preparedLimit} prepared spells)`}
              </label>
              <div className="spell-picker-list">
                {availableSpells.filter(s => s.level > 0).map(spell => {
                  const selected = spellcastingMode === 'known'
                    ? selectedKnownSpells.includes(spell.name)
                    : selectedPreparedSpells.includes(spell.name)
                  const disabled = spellcastingMode === 'known'
                    ? !selected && selectedKnownSpells.length >= knownLimit
                    : !selected && selectedPreparedSpells.length >= preparedLimit

                  return (
                    <label key={spell.name} className={`spell-option ${disabled ? 'disabled' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleSpell(spell.name)}
                      />
                      <span>{spell.name}</span>
                      <span className="spell-option-level">L{spell.level}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Ability Scores (Standard Array: 15, 14, 13, 12, 10, 8)</label>
            <div className="abilities-grid">
              {ABILITIES.map(ab => (
                <div key={ab} className="ability-input-box">
                  <span className="ability-label">{ab}</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={abilities[ab]}
                    onChange={e => handleAbilityChange(ab, parseInt(e.target.value) || 10)}
                    className="ability-number-input"
                  />
                  <span className="ability-modifier">
                    {Math.floor((abilities[ab] - 10) / 2) >= 0 ? '+' : ''}
                    {Math.floor((abilities[ab] - 10) / 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            className="creator-submit"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create Character & Start Adventure'}
          </button>
          {error && <p className="creator-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
