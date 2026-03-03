import { useEffect, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { ItemData, SpellOption } from '../../types'
import './panels.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8010'

function InventoryPanel({ inventory }: { readonly inventory: ItemData[] }) {
  const equipped = inventory.filter(i => i.equipped)
  const backpack = inventory.filter(i => !i.equipped)

  const equippedWeapon = equipped.find(i => i.category === 'weapon')
  const equippedArmor = equipped.find(i => i.category === 'armor')
  const equippedShield = equipped.find(i => i.category === 'shield')

  return (
    <div className="inventory-panel">
      {/* Equipped */}
      <div className="inv-section-title">Equipped</div>
      <div className="inv-equipped-slots">
        <EquipSlot label="Weapon" item={equippedWeapon} />
        <EquipSlot label="Armor" item={equippedArmor} />
        <EquipSlot label="Shield" item={equippedShield} />
      </div>

      {/* Backpack */}
      {backpack.length > 0 && (
        <>
          <div className="inv-section-title" style={{ marginTop: '0.6rem' }}>Backpack</div>
          <div className="inv-item-list">
            {backpack.map((item, idx) => (
              <ItemRow key={`${item.id}-${idx}`} item={item} />
            ))}
          </div>
        </>
      )}

      {inventory.length === 0 && (
        <p className="panel-empty">No items.</p>
      )}
    </div>
  )
}

function EquipSlot({ label, item }: { readonly label: string; readonly item: ItemData | undefined }) {
  return (
    <div className="inv-equip-slot">
      <span className="inv-slot-label">{label}</span>
      {item ? (
        <div className="inv-slot-item">
          <span className="inv-item-name">{item.name}</span>
          {item.damage && (
            <span className="inv-item-stat">{item.damage} {item.damage_type}</span>
          )}
          {item.ac_base !== null && item.category === 'armor' && (
            <span className="inv-item-stat">AC {item.ac_base}{item.dex_mod ? '+DEX' : ''}</span>
          )}
          {item.category === 'shield' && (
            <span className="inv-item-stat">+2 AC</span>
          )}
          {item.notes && <span className="inv-item-notes">{item.notes}</span>}
        </div>
      ) : (
        <span className="inv-slot-empty">—</span>
      )}
    </div>
  )
}

function ItemRow({ item }: { readonly item: ItemData }) {
  const qty = item.quantity > 1 ? ` ×${item.quantity}` : ''
  let stat = ''
  if (item.damage) {
    stat = `${item.damage} ${item.damage_type}`
  } else if (item.ac_base !== null) {
    stat = `AC ${item.ac_base}`
  } else if (item.category === 'shield') {
    stat = '+2 AC'
  }

  return (
    <div className="inv-item-row">
      <span className="inv-item-name">{item.name}{qty}</span>
      {stat && <span className="inv-item-stat">{stat}</span>}
      {item.notes && <span className="inv-item-notes">{item.notes}</span>}
    </div>
  )
}

export default function CharacterSheet() {
  const [tab, setTab] = useState<'stats' | 'inventory'>('stats')
  const characters = useGameStore(s => s.characters)
  const combat = useGameStore(s => s.combat)
  const players = useSessionStore(s => s.players)
  const playerId = useSessionStore(s => s.playerId)
  const roomCode = useSessionStore(s => s.roomCode)

  const [isManagingPrepared, setIsManagingPrepared] = useState(false)
  const [loadingPreparedOptions, setLoadingPreparedOptions] = useState(false)
  const [savingPreparedOptions, setSavingPreparedOptions] = useState(false)
  const [preparedError, setPreparedError] = useState<string | null>(null)
  const [preparedLimit, setPreparedLimit] = useState(0)
  const [availablePreparedSpells, setAvailablePreparedSpells] = useState<SpellOption[]>([])
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<string[]>([])

  const player = players.find(p => p.id === playerId)
  const charId = player?.character_id
  const char = charId ? characters[charId] : null

  const isInCombat = !!combat?.is_active
  const canManagePreparedSpells = !!char && char.spellcasting_mode === 'prepared' && !!roomCode && !!playerId

  useEffect(() => {
    if (isInCombat && isManagingPrepared) {
      setPreparedError('You cannot change prepared spells during combat.')
      setIsManagingPrepared(false)
    }
  }, [isInCombat, isManagingPrepared])

  useEffect(() => {
    if (!char || !isManagingPrepared) return
    setPreparedError(null)
    setLoadingPreparedOptions(true)

    const run = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/spells/options/${encodeURIComponent(char.class)}/${char.level}`)
        const data = await res.json()
        if (data.error) {
          setPreparedError(String(data.error))
          return
        }

        const spells = ((data.spells || []) as SpellOption[]).filter(s => Number(s.level) > 0)
        setAvailablePreparedSpells(spells)
        setPreparedLimit(Number(data.prepared_limit || 0))
        setSelectedPreparedSpells(Array.isArray(char.prepared_spells) ? [...char.prepared_spells] : [])
      } catch {
        setPreparedError('Unable to load spell options right now.')
      } finally {
        setLoadingPreparedOptions(false)
      }
    }

    run()
  }, [isManagingPrepared, char?.class, char?.level, char?.prepared_spells])

  const togglePreparedSpell = (spellName: string) => {
    setSelectedPreparedSpells(prev => {
      if (prev.includes(spellName)) return prev.filter(s => s !== spellName)
      if (prev.length >= preparedLimit) return prev
      return [...prev, spellName]
    })
  }

  const savePreparedSpells = async () => {
    if (!char || !roomCode || !playerId) return
    if (isInCombat) {
      setPreparedError('You cannot change prepared spells during combat.')
      return
    }
    setPreparedError(null)
    setSavingPreparedOptions(true)
    try {
      const res = await fetch(`${API_BASE}/api/character/level-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_code: roomCode,
          player_id: playerId,
          new_level: char.level,
          prepared_spells: selectedPreparedSpells,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setPreparedError(String(data.error))
        return
      }

      const state = useGameStore.getState()
      const updated = {
        ...state.characters,
        [char.id]: {
          ...state.characters[char.id],
          prepared_spells: selectedPreparedSpells,
        },
      }
      state.setCharacters(updated)
      setIsManagingPrepared(false)
    } catch {
      setPreparedError('Unable to save prepared spells right now.')
    } finally {
      setSavingPreparedOptions(false)
    }
  }

  if (!char) {
    return (
      <div className="character-sheet">
        <h3 className="panel-title">Character</h3>
        <p className="panel-empty">No character created yet.</p>
      </div>
    )
  }

  const hpPercent = char.max_hp > 0 ? (char.hp / char.max_hp) * 100 : 0
  const slotRows = Object.entries(char.spell_slots || {})
    .map(([level, total]) => {
      const used = char.spell_slots_used?.[Number(level)] ?? 0
      const remaining = Math.max(0, Number(total) - Number(used))
      const restricted = !isInCombat && Number(level) > 0
      const state = restricted ? 'restricted' : (remaining > 0 ? 'available' : 'unavailable')
      return { level, total, used, remaining, state }
    })
    .sort((a, b) => Number(a.level) - Number(b.level))

  return (
    <div className="character-sheet">
      <div className="char-header-row">
        <div>
          <h3 className="panel-title" style={{ marginBottom: 0 }}>{char.name}</h3>
          <div className="char-subtitle">{char.race} {char.class} {char.level}</div>
        </div>
        <div className="char-tabs">
          <button
            className={`char-tab${tab === 'stats' ? ' active' : ''}`}
            onClick={() => setTab('stats')}
          >Stats</button>
          <button
            className={`char-tab${tab === 'inventory' ? ' active' : ''}`}
            onClick={() => setTab('inventory')}
          >Inv</button>
        </div>
      </div>

      <div className="char-hp-section">
        <div className="char-hp-bar">
          <div className="char-hp-fill" style={{ width: `${hpPercent}%` }} />
        </div>
        <span className="char-hp-text">HP: {char.hp}/{char.max_hp}{char.temp_hp > 0 ? ` (+${char.temp_hp})` : ''}</span>
      </div>

      {tab === 'stats' ? (
        <>
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
        </>
      ) : (
        <InventoryPanel inventory={char.inventory} />
      )}

      {slotRows.length > 0 && (
        <div className="char-spell-slots">
          <h4>Spell Slots</h4>
          {slotRows.map(s => (
            <div key={s.level} className={`slot-row slot-row-${s.state}`}>
              <span>Level {s.level}</span>
              <span>{s.remaining}/{s.total}</span>
            </div>
          ))}
        </div>
      )}

      {char.prepared_spells?.length > 0 && (
        <div className="char-spells">
          <h4>Prepared Spells</h4>
          {char.prepared_spells.map(spell => (
            <span key={spell} className="spell-tag">{spell}</span>
          ))}
        </div>
      )}

      {canManagePreparedSpells && (
        <div className="prepared-manager">
          {!isManagingPrepared ? (
            <>
              <button
                className="prepared-manager-btn"
                onClick={() => setIsManagingPrepared(true)}
                disabled={isInCombat}
              >
              Manage Prepared Spells
              </button>
              {isInCombat && <div className="prepared-manager-note">Prepared spells cannot be changed during combat.</div>}
            </>
          ) : (
            <div className="prepared-manager-editor">
              <div className="prepared-manager-header">
                <h4>Manage Prepared Spells</h4>
                <span>{selectedPreparedSpells.length}/{preparedLimit}</span>
              </div>

              {loadingPreparedOptions ? (
                <p className="panel-empty">Loading spell options...</p>
              ) : (
                <div className="prepared-manager-list">
                  {availablePreparedSpells.map(spell => {
                    const selected = selectedPreparedSpells.includes(spell.name)
                    const disabled = !selected && selectedPreparedSpells.length >= preparedLimit
                    return (
                      <label key={spell.name} className={`prepared-manager-item ${disabled ? 'disabled' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => togglePreparedSpell(spell.name)}
                        />
                        <span>{spell.name}</span>
                        <span className="prepared-manager-level">L{spell.level}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              {preparedError && <div className="prepared-manager-error">{preparedError}</div>}

              <div className="prepared-manager-actions">
                <button
                  className="prepared-manager-btn"
                  onClick={savePreparedSpells}
                  disabled={savingPreparedOptions || loadingPreparedOptions || isInCombat}
                >
                  {savingPreparedOptions ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="prepared-manager-btn secondary"
                  onClick={() => {
                    setPreparedError(null)
                    setIsManagingPrepared(false)
                  }}
                  disabled={savingPreparedOptions}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {char.known_spells?.length > 0 && (
        <div className="char-spells">
          <h4>Known Spells</h4>
          {char.known_spells.map(spell => (
            <span key={spell} className="spell-tag">{spell}</span>
          ))}
        </div>
      )}

      {char.class_features?.length > 0 && (
        <div className="char-features">
          <h4>Class Features</h4>
          {char.class_features.map(feature => (
            <div key={feature.id || feature.name} className="feature-item" title={feature.description || feature.name}>
              <strong>{feature.name}</strong>{feature.level ? ` (L${feature.level})` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
