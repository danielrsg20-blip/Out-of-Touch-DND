import { useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { ItemData } from '../../types'
import './panels.css'

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
    </div>
  )
}
