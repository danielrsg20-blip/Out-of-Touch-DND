import { useState } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import './CharacterCreator.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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

  const handleAbilityChange = (ability: string, value: number) => {
    setAbilities(prev => ({ ...prev, [ability]: Math.max(3, Math.min(20, value)) }))
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
        }),
      })
      useSessionStore.getState().setPhase('playing')
    } catch {
      setCreating(false)
    }
  }

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
              <select value={charClass} onChange={e => setCharClass(e.target.value)} className="creator-select">
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

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
