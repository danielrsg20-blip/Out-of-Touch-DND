import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import './panels.css'

export default function CharacterSheet() {
  const characters = useGameStore(s => s.characters)
  const players = useSessionStore(s => s.players)
  const playerId = useSessionStore(s => s.playerId)

  const player = players.find(p => p.id === playerId)
  const charId = player?.character_id
  const char = charId ? characters[charId] : null

  if (!char) {
    return (
      <div className="character-sheet">
        <h3 className="panel-title">Character</h3>
        <p className="panel-empty">No character created yet.</p>
      </div>
    )
  }

  const hpPercent = char.max_hp > 0 ? (char.hp / char.max_hp) * 100 : 0

  return (
    <div className="character-sheet">
      <h3 className="panel-title">{char.name}</h3>
      <div className="char-subtitle">{char.race} {char.class} {char.level}</div>

      <div className="char-hp-section">
        <div className="char-hp-bar">
          <div className="char-hp-fill" style={{ width: `${hpPercent}%` }} />
        </div>
        <span className="char-hp-text">HP: {char.hp}/{char.max_hp}</span>
      </div>

      <div className="char-stats-row">
        <div className="char-stat">
          <span className="stat-label">AC</span>
          <span className="stat-value">{char.ac}</span>
        </div>
        <div className="char-stat">
          <span className="stat-label">Speed</span>
          <span className="stat-value">{char.speed}ft</span>
        </div>
        <div className="char-stat">
          <span className="stat-label">Prof</span>
          <span className="stat-value">+{char.proficiency_bonus}</span>
        </div>
      </div>

      <div className="char-abilities">
        {Object.entries(char.abilities).map(([ab, score]) => (
          <div key={ab} className="ability-box">
            <span className="ability-name">{ab}</span>
            <span className="ability-score">{score}</span>
            <span className="ability-mod">
              {char.modifiers[ab] >= 0 ? '+' : ''}{char.modifiers[ab]}
            </span>
          </div>
        ))}
      </div>

      {char.conditions.length > 0 && (
        <div className="char-conditions">
          {char.conditions.map(c => (
            <span key={c} className="condition-tag">{c}</span>
          ))}
        </div>
      )}

      {char.traits.length > 0 && (
        <div className="char-traits">
          <h4>Traits</h4>
          {char.traits.map(t => (
            <span key={t} className="trait-tag">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}
