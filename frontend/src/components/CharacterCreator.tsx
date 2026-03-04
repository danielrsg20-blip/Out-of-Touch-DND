import { useEffect, useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { API_BASE } from '../config/endpoints'
import type { SpellOption } from '../types'
import './CharacterCreator.css'

const RACES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling']
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']
const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

export default function CharacterCreator() {
  const { roomCode, playerId, players } = useSessionStore()
  const [name, setName] = useState('')
  const [race, setRace] = useState('Human')
  const [charClass, setCharClass] = useState('Fighter')
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

  const handleAbilityChange = (ability: string, value: number) => {
    setAbilities(prev => ({ ...prev, [ability]: Math.max(3, Math.min(20, value)) }))
  }

  const loadSpellOptions = async (nextClass: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/spells/options/${encodeURIComponent(nextClass)}/1`)
      const data = await res.json()
      setSpellcastingMode(data.spellcasting_mode || 'none')
      setKnownLimit(Number(data.known_limit || 0))
      setPreparedLimit(Number(data.prepared_limit || 0))
      setAvailableSpells((data.spells || []) as SpellOption[])

      if ((data.spellcasting_mode || 'none') === 'known') {
        const picks = ((data.spells || []) as SpellOption[])
          .filter(s => s.level > 0)
          .slice(0, Number(data.known_limit || 0))
          .map(s => s.name)
        setSelectedKnownSpells(picks)
        setSelectedPreparedSpells([])
      } else if ((data.spellcasting_mode || 'none') === 'prepared') {
        const picks = ((data.spells || []) as SpellOption[])
          .filter(s => s.level > 0)
          .slice(0, Number(data.prepared_limit || 0))
          .map(s => s.name)
        setSelectedPreparedSpells(picks)
        setSelectedKnownSpells([])
      } else {
        setSelectedKnownSpells([])
        setSelectedPreparedSpells([])
      }
    } catch {
      setSpellcastingMode('none')
      setKnownLimit(0)
      setPreparedLimit(0)
      setAvailableSpells([])
      setSelectedKnownSpells([])
      setSelectedPreparedSpells([])
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
    try {
      await fetch(`${API_BASE}/api/character/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: roomCode,
          player_id: playerId,
          name: name.trim(),
          race,
          char_class: charClass,
          abilities,
          known_spells: spellcastingMode === 'known' ? selectedKnownSpells : undefined,
          prepared_spells: spellcastingMode === 'prepared' ? selectedPreparedSpells : undefined,
        }),
      })
      useSessionStore.getState().setPhase('playing')
    } catch {
      setCreating(false)
    }
  }

  useEffect(() => {
    loadSpellOptions(charClass)
  }, [])

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
        </div>
      </div>
    </div>
  )
}
