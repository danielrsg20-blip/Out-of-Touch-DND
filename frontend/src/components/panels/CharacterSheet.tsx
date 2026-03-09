import { useEffect, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useSessionStore } from '../../stores/sessionStore'
import { invokeEdgeFunction } from '../../lib/supabaseClient'
import { getItemSpriteKey, resolveSpriteUrl } from '../../data/spriteManifest'
import {
  CHARACTER_SPRITESHEET_COLUMNS,
  CHARACTER_SPRITESHEET_ROWS,
  getCharacterSpriteCell,
  getCharacterSpritesheetUrl,
} from '../../config/characterSprites'
import type { ItemData, SpellOption } from '../../types'
import './panels.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

// ── 5e class → hit die size ───────────────────────────────────────────────────
const CLASS_HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10, paladin: 10, ranger: 10,
  bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8,
  sorcerer: 6, wizard: 6,
}

// ── 5e class → saving throw proficiencies ─────────────────────────────────────
const CLASS_SAVE_PROFS: Record<string, string[]> = {
  barbarian: ['STR', 'CON'],
  bard: ['DEX', 'CHA'],
  cleric: ['WIS', 'CHA'],
  druid: ['INT', 'WIS'],
  fighter: ['STR', 'CON'],
  monk: ['STR', 'DEX'],
  paladin: ['WIS', 'CHA'],
  ranger: ['STR', 'DEX'],
  rogue: ['DEX', 'INT'],
  sorcerer: ['CON', 'CHA'],
  warlock: ['WIS', 'CHA'],
  wizard: ['INT', 'WIS'],
}

// ── 5e skill → ability mapping ────────────────────────────────────────────────
const SKILLS: Array<{ name: string; ability: string }> = [
  { name: 'Acrobatics',     ability: 'DEX' },
  { name: 'Animal Handling',ability: 'WIS' },
  { name: 'Arcana',         ability: 'INT' },
  { name: 'Athletics',      ability: 'STR' },
  { name: 'Deception',      ability: 'CHA' },
  { name: 'History',        ability: 'INT' },
  { name: 'Insight',        ability: 'WIS' },
  { name: 'Intimidation',   ability: 'CHA' },
  { name: 'Investigation',  ability: 'INT' },
  { name: 'Medicine',       ability: 'WIS' },
  { name: 'Nature',         ability: 'INT' },
  { name: 'Perception',     ability: 'WIS' },
  { name: 'Performance',    ability: 'CHA' },
  { name: 'Persuasion',     ability: 'CHA' },
  { name: 'Religion',       ability: 'INT' },
  { name: 'Sleight of Hand',ability: 'DEX' },
  { name: 'Stealth',        ability: 'DEX' },
  { name: 'Survival',       ability: 'WIS' },
]

// ── 5e XP thresholds per level (index = level - 1) ───────────────────────────
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000,
  48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
]

function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}` }

// 5e carry capacity: STR score × 15 lb
function carryCapacity(strScore: number): number {
  return strScore * 15
}

function totalWeight(inventory: ItemData[]): number {
  return inventory.reduce((sum, i) => sum + i.weight_lb * i.quantity, 0)
}

function ItemIcon({ item }: { readonly item: ItemData }) {
  const url = resolveSpriteUrl(getItemSpriteKey(item))
  if (!url) return null
  return <img className="inv-item-icon" src={url} alt={item.name} />
}

// ── Feature #5: group backpack items by category ─────────────────────────────
const CATEGORY_ORDER = ['weapon', 'armor', 'shield', 'ammunition', 'tool', 'gear']
const CATEGORY_LABELS: Record<string, string> = {
  weapon: 'Weapons',
  armor: 'Armor',
  shield: 'Shields',
  ammunition: 'Ammunition',
  tool: 'Tools',
  gear: 'Gear',
}

function groupByCategory(items: ItemData[]): Array<{ category: string; items: ItemData[] }> {
  const map: Record<string, ItemData[]> = {}
  for (const item of items) {
    const cat = item.category ?? 'gear'
    if (!map[cat]) map[cat] = []
    map[cat].push(item)
  }
  return CATEGORY_ORDER
    .filter(cat => map[cat]?.length)
    .map(cat => ({ category: cat, items: map[cat] }))
}

// ── Feature #8: player equip action ──────────────────────────────────────────
async function playerEquip(
  roomCode: string,
  playerId: string,
  itemId: string,
  equip: boolean,
): Promise<{ error?: string }> {
  const res = await fetch(`${BACKEND_URL}/api/player-equip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_code: roomCode, player_id: playerId, item_id: itemId, equip }),
  })
  return res.json()
}

// ── ItemRow (features #1, #2, #6, #8) ────────────────────────────────────────
function ItemRow({
  item,
  canEquip,
  isInCombat,
  onEquip,
}: {
  readonly item: ItemData
  readonly canEquip: boolean
  readonly isInCombat: boolean
  readonly onEquip: (itemId: string, equip: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const qty = item.quantity > 1 ? ` ×${item.quantity}` : ''

  let stat = ''
  if (item.damage) {
    stat = `${item.damage} ${item.damage_type}`
  } else if (item.ac_base !== null && item.category === 'armor') {
    stat = `AC ${item.ac_base}${item.dex_mod ? '+DEX' : ''}`
  } else if (item.category === 'shield') {
    stat = '+2 AC'
  }

  const hasDetail = item.description || item.notes || item.properties?.length > 0

  return (
    <div className="inv-item-row">
      <div className="inv-item-row-main" onClick={() => hasDetail && setExpanded(e => !e)}>
        <ItemIcon item={item} />
        <span className="inv-item-name">{item.name}{qty}</span>
        {stat && <span className="inv-item-stat">{stat}</span>}
        {/* Feature #6: stealth disadvantage */}
        {item.stealth_disadvantage && (
          <span className="inv-stealth-warn" title="Stealth disadvantage">⚠</span>
        )}
        {hasDetail && (
          <span className="inv-expand-toggle">{expanded ? '▲' : '▼'}</span>
        )}
        {canEquip && !isInCombat && (
          <button
            className="inv-equip-btn"
            onClick={e => { e.stopPropagation(); onEquip(item.id, true) }}
            title="Equip"
          >
            Equip
          </button>
        )}
      </div>

      {/* Feature #1: properties */}
      {item.properties?.length > 0 && (
        <div className="inv-properties">
          {item.properties.map(p => <span key={p} className="inv-prop-tag">{p}</span>)}
        </div>
      )}

      {/* Feature #2: expanded description */}
      {expanded && (
        <div className="inv-expand">
          {item.description && <p>{item.description}</p>}
          {item.notes && <p className="inv-item-notes">{item.notes}</p>}
          {item.weight_lb > 0 && <p className="inv-detail-meta">{item.weight_lb} lb · {item.cost_gp} gp</p>}
        </div>
      )}
    </div>
  )
}

// ── Paper doll: character sprite ─────────────────────────────────────────────
function CharacterSprite({ spriteId }: { readonly spriteId: string | null | undefined }) {
  if (!spriteId) return <div className="paper-doll-sprite paper-doll-sprite-empty">?</div>
  const url = getCharacterSpritesheetUrl(spriteId)
  const cell = getCharacterSpriteCell(spriteId)
  if (!url || !cell) return <div className="paper-doll-sprite paper-doll-sprite-empty">?</div>
  const x = (cell.col / (CHARACTER_SPRITESHEET_COLUMNS - 1)) * 100
  const y = (cell.row / (CHARACTER_SPRITESHEET_ROWS - 1)) * 100
  return (
    <div
      className="paper-doll-sprite"
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: `${CHARACTER_SPRITESHEET_COLUMNS * 100}% ${CHARACTER_SPRITESHEET_ROWS * 100}%`,
        backgroundPosition: `${x}% ${y}%`,
      }}
    />
  )
}

// ── Paper doll: individual slot ───────────────────────────────────────────────
function PaperDollSlot({
  label,
  emptyIcon,
  item,
  canEquip,
  isInCombat,
  onUnequip,
}: {
  readonly label: string
  readonly emptyIcon: string
  readonly item: ItemData | undefined
  readonly canEquip: boolean
  readonly isInCombat: boolean
  readonly onUnequip: (itemId: string) => void
}) {
  let stat = ''
  if (item?.damage) {
    stat = `${item.damage} ${item.damage_type}`
  } else if (item?.ac_base != null && item.category === 'armor') {
    stat = `AC ${item.ac_base}${item.dex_mod ? '+DEX' : ''}`
  } else if (item?.category === 'shield') {
    stat = '+2 AC'
  }

  return (
    <div className={`paper-doll-slot${item ? ' filled' : ''}`}>
      {item ? (
        <>
          <div className="paper-doll-slot-icon-wrap">
            <ItemIcon item={item} />
          </div>
          <div className="paper-doll-slot-name">{item.name}</div>
          {stat && <div className="paper-doll-slot-stat">{stat}</div>}
          {item.stealth_disadvantage && (
            <span className="inv-stealth-warn" title="Stealth disadvantage">⚠</span>
          )}
          {canEquip && !isInCombat && (
            <button
              className="paper-doll-unequip-btn"
              onClick={() => onUnequip(item.id)}
              title="Unequip"
            >✕</button>
          )}
        </>
      ) : (
        <>
          <span className="paper-doll-slot-empty-icon">{emptyIcon}</span>
          <span className="paper-doll-slot-label">{label}</span>
        </>
      )}
    </div>
  )
}

// ── XP progress bar ───────────────────────────────────────────────────────────
function XPBar({ xp, level }: { readonly xp: number; readonly level: number }) {
  if (level >= 20) return null
  const current = XP_THRESHOLDS[level - 1] ?? 0
  const next = XP_THRESHOLDS[level] ?? current
  const pct = next > current ? Math.min(100, ((xp - current) / (next - current)) * 100) : 100
  return (
    <div className="char-xp-section">
      <div className="char-xp-bar-track">
        <div className="char-xp-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="char-xp-label">{xp.toLocaleString()} / {next.toLocaleString()} XP</span>
    </div>
  )
}

// ── Skills list ───────────────────────────────────────────────────────────────
function SkillsList({
  modifiers,
  proficiencyBonus,
  skillProficiencies,
}: {
  readonly modifiers: Record<string, number>
  readonly proficiencyBonus: number
  readonly skillProficiencies: string[]
}) {
  const [open, setOpen] = useState(false)
  const profSet = new Set(skillProficiencies.map(s => s.toLowerCase()))
  return (
    <div className="skills-section">
      <button className="skills-toggle" onClick={() => setOpen(o => !o)}>
        <span>Skills</span>
        <span className="skills-toggle-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="skills-list">
          {SKILLS.map(({ name, ability }) => {
            const proficient = profSet.has(name.toLowerCase())
            const bonus = (modifiers[ability] ?? 0) + (proficient ? proficiencyBonus : 0)
            return (
              <div key={name} className="skill-row">
                <span className={`skill-prof-dot${proficient ? ' proficient' : ''}`} title={proficient ? 'Proficient' : ''} />
                <span className="skill-ability">{ability}</span>
                <span className="skill-name">{name}</span>
                <span className="skill-bonus">{fmtMod(bonus)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Saving throws ─────────────────────────────────────────────────────────────
const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

function SavingThrows({
  charClass,
  modifiers,
  proficiencyBonus,
}: {
  readonly charClass: string
  readonly modifiers: Record<string, number>
  readonly proficiencyBonus: number
}) {
  const [open, setOpen] = useState(false)
  const saveProfs = new Set(CLASS_SAVE_PROFS[charClass.toLowerCase()] ?? [])
  return (
    <div className="skills-section">
      <button className="skills-toggle" onClick={() => setOpen(o => !o)}>
        <span>Saving Throws</span>
        <span className="skills-toggle-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="skills-list">
          {SAVE_ABILITIES.map(ab => {
            const proficient = saveProfs.has(ab)
            const bonus = (modifiers[ab] ?? 0) + (proficient ? proficiencyBonus : 0)
            return (
              <div key={ab} className="skill-row">
                <span className={`skill-prof-dot${proficient ? ' proficient' : ''}`} title={proficient ? 'Proficient' : ''} />
                <span className="skill-ability">{ab}</span>
                <span className="skill-name">{ab === 'STR' ? 'Strength' : ab === 'DEX' ? 'Dexterity' : ab === 'CON' ? 'Constitution' : ab === 'INT' ? 'Intelligence' : ab === 'WIS' ? 'Wisdom' : 'Charisma'}</span>
                <span className="skill-bonus">{fmtMod(bonus)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── InventoryPanel (features #3, #4, #5, #7 via parent) ──────────────────────
function InventoryPanel({
  inventory,
  gold,
  strScore,
  spriteId,
  canEquip,
  isInCombat,
  onEquip,
  onUnequip,
  equipError,
}: {
  readonly inventory: ItemData[]
  readonly gold: number
  readonly strScore: number
  readonly spriteId: string | null | undefined
  readonly canEquip: boolean
  readonly isInCombat: boolean
  readonly onEquip: (itemId: string, equip: boolean) => void
  readonly onUnequip: (itemId: string) => void
  readonly equipError: string | null
}) {
  const equipped = inventory.filter(i => i.equipped)
  const backpack = inventory.filter(i => !i.equipped)

  const equippedWeapon = equipped.find(i => i.category === 'weapon')
  const equippedArmor = equipped.find(i => i.category === 'armor')
  const equippedShield = equipped.find(i => i.category === 'shield')

  // Feature #3: carry weight
  const weight = totalWeight(inventory)
  const capacity = carryCapacity(strScore)
  const weightPct = Math.min(100, (weight / capacity) * 100)
  const weightState = weight > capacity ? 'encumbered' : weight > capacity * 0.5 ? 'warning' : ''

  // Feature #5: grouped backpack
  const groups = groupByCategory(backpack)

  return (
    <div className="inventory-panel">
      {/* Feature #4: gold */}
      <div className="inv-gold">
        <span className="inv-gold-icon">◈</span>
        <span className="inv-gold-value">{gold} gp</span>
      </div>

      {/* Paper doll */}
      <div className="paper-doll">
        <div className="paper-doll-top">
          <PaperDollSlot
            label="Armor" emptyIcon="🧥"
            item={equippedArmor} canEquip={canEquip} isInCombat={isInCombat} onUnequip={onUnequip}
          />
        </div>
        <div className="paper-doll-middle">
          <PaperDollSlot
            label="Weapon" emptyIcon="⚔"
            item={equippedWeapon} canEquip={canEquip} isInCombat={isInCombat} onUnequip={onUnequip}
          />
          <CharacterSprite spriteId={spriteId} />
          <PaperDollSlot
            label="Shield" emptyIcon="🛡"
            item={equippedShield} canEquip={canEquip} isInCombat={isInCombat} onUnequip={onUnequip}
          />
        </div>
      </div>

      {/* Feature #8: equip error */}
      {equipError && <div className="inv-equip-error">{equipError}</div>}
      {isInCombat && canEquip && (
        <div className="inv-combat-note">Equipment locked during combat.</div>
      )}

      {/* Backpack — grouped by category */}
      {backpack.length > 0 && (
        <>
          <div className="inv-section-title" style={{ marginTop: '0.6rem' }}>Backpack</div>
          {groups.map(({ category, items }) => (
            <div key={category} className="inv-category-group">
              <div className="inv-category-header">{CATEGORY_LABELS[category] ?? category}</div>
              <div className="inv-item-list">
                {items.map((item, idx) => (
                  <ItemRow
                    key={`${item.id}-${idx}`}
                    item={item}
                    canEquip={canEquip && ['weapon', 'armor', 'shield'].includes(item.category)}
                    isInCombat={isInCombat}
                    onEquip={onEquip}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {inventory.length === 0 && (
        <p className="panel-empty">No items.</p>
      )}

      {/* Feature #3: carry weight bar */}
      <div className="inv-weight-section">
        <div className="inv-weight-bar-track">
          <div
            className={`inv-weight-bar-fill${weightState ? ` ${weightState}` : ''}`}
            style={{ width: `${weightPct}%` }}
          />
        </div>
        <span className="inv-weight-label">{weight.toFixed(1)} / {capacity} lb</span>
      </div>
    </div>
  )
}

// ── CharacterSheet ────────────────────────────────────────────────────────────
export default function CharacterSheet() {
  const [tab, setTab] = useState<'stats' | 'inventory'>('stats')
  const characters = useGameStore(s => s.characters)
  const combat = useGameStore(s => s.combat)
  const players = useSessionStore(s => s.players)
  const playerId = useSessionStore(s => s.playerId)
  const roomCode = useSessionStore(s => s.roomCode)
  const mockMode = useSessionStore(s => s.mockMode)

  const [isManagingPrepared, setIsManagingPrepared] = useState(false)
  const [loadingPreparedOptions, setLoadingPreparedOptions] = useState(false)
  const [savingPreparedOptions, setSavingPreparedOptions] = useState(false)
  const [preparedError, setPreparedError] = useState<string | null>(null)
  const [preparedLimit, setPreparedLimit] = useState(0)
  const [availablePreparedSpells, setAvailablePreparedSpells] = useState<SpellOption[]>([])
  const [selectedPreparedSpells, setSelectedPreparedSpells] = useState<string[]>([])

  // Feature #8: player equip state
  const [equipError, setEquipError] = useState<string | null>(null)
  const [equipPending, setEquipPending] = useState(false)

  const player = players.find(p => p.id === playerId)
  const charId = player?.character_id
  const char = charId ? characters[charId] : null

  const isInCombat = !!combat?.is_active
  const canManagePreparedSpells = !!char && char.spellcasting_mode === 'prepared' && !!roomCode && !!playerId
  // Player can self-equip when they have a character and a live room
  const canSelfEquip = !!char && !!roomCode && !!playerId

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
        const payload = await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
          action: 'get_spell_options',
          char_class: char.class,
          level: char.level,
          mock_mode: mockMode,
        })
        if (typeof payload.error === 'string') {
          setPreparedError(String(payload.error))
          return
        }

        const spells = ((payload.spells || []) as SpellOption[]).filter(s => Number(s.level) > 0)
        setAvailablePreparedSpells(spells)
        setPreparedLimit(Number(payload.prepared_limit || 0))
        setSelectedPreparedSpells(Array.isArray(char.prepared_spells) ? [...char.prepared_spells] : [])
      } catch (err: unknown) {
        setPreparedError(err instanceof Error ? err.message : 'Unable to load spell options right now.')
      } finally {
        setLoadingPreparedOptions(false)
      }
    }

    run()
  }, [isManagingPrepared, char?.class, char?.level, char?.prepared_spells, mockMode])

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
      const payload = await invokeEdgeFunction<Record<string, unknown>>('dm-action', {
        action: 'level_up_prepared_spells',
        room_code: roomCode,
        player_id: playerId,
        new_level: char.level,
        prepared_spells: selectedPreparedSpells,
        mock_mode: mockMode,
      })
      if (typeof payload.error === 'string') {
        setPreparedError(String(payload.error))
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
    } catch (err: unknown) {
      setPreparedError(err instanceof Error ? err.message : 'Unable to save prepared spells right now.')
    } finally {
      setSavingPreparedOptions(false)
    }
  }

  // Feature #8: equip/unequip handler
  const handleEquip = async (itemId: string, equip: boolean) => {
    if (!roomCode || !playerId || equipPending) return
    setEquipError(null)
    setEquipPending(true)
    try {
      const res = await playerEquip(roomCode, playerId, itemId, equip)
      if (res.error) setEquipError(res.error)
    } catch {
      setEquipError('Failed to update equipment.')
    } finally {
      setEquipPending(false)
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

  // Feature #7: item count badge
  const itemCount = char.inventory.length

  // Derived stats
  const dexMod = char.modifiers['DEX'] ?? 0
  const wisMod = char.modifiers['WIS'] ?? 0
  const isPerceptionProf = char.skill_proficiencies?.some(s => s.toLowerCase() === 'perception')
  const passivePerception = 10 + wisMod + (isPerceptionProf ? char.proficiency_bonus : 0)
  const hitDie = CLASS_HIT_DIE[char.class.toLowerCase()] ?? 8

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
          {/* Feature #7: badge */}
          <button
            className={`char-tab${tab === 'inventory' ? ' active' : ''}`}
            onClick={() => setTab('inventory')}
          >
            Inv
            {itemCount > 0 && <span className="inv-tab-badge">{itemCount}</span>}
          </button>
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
          {/* Death banner */}
          {!char.is_alive && (
            <div className="char-dead-banner">✝ Fallen</div>
          )}

          {/* Quick stats */}
          <div className="char-stats-row">
            <div className="char-stat">
              <span className="stat-label">AC</span>
              <span className="stat-value">{char.ac}</span>
            </div>
            <div className="char-stat">
              <span className="stat-label">Init</span>
              <span className="stat-value">{fmtMod(dexMod)}</span>
            </div>
            <div className="char-stat">
              <span className="stat-label">Speed</span>
              <span className="stat-value">{char.speed}ft</span>
            </div>
            <div className="char-stat">
              <span className="stat-label">Prof</span>
              <span className="stat-value">+{char.proficiency_bonus}</span>
            </div>
            <div className="char-stat">
              <span className="stat-label">Pass. Perc</span>
              <span className="stat-value">{passivePerception}</span>
            </div>
            <div className="char-stat">
              <span className="stat-label">Hit Die</span>
              <span className="stat-value">{char.level}d{hitDie}</span>
            </div>
          </div>

          {/* XP bar */}
          <XPBar xp={char.xp} level={char.level} />

          {/* Ability scores */}
          <div className="char-abilities">
            {Object.entries(char.abilities).map(([ab, score]) => (
              <div key={ab} className="ability-box">
                <span className="ability-name">{ab}</span>
                <span className="ability-score">{score}</span>
                <span className="ability-mod">{fmtMod(char.modifiers[ab] ?? 0)}</span>
              </div>
            ))}
          </div>

          {/* Saving Throws */}
          <SavingThrows
            charClass={char.class}
            modifiers={char.modifiers}
            proficiencyBonus={char.proficiency_bonus}
          />

          {/* Skills */}
          <SkillsList
            modifiers={char.modifiers}
            proficiencyBonus={char.proficiency_bonus}
            skillProficiencies={char.skill_proficiencies ?? []}
          />

          {/* Conditions */}
          {char.conditions.length > 0 && (
            <div className="char-conditions">
              {char.conditions.map(c => (
                <span key={c} className="condition-tag">{c}</span>
              ))}
            </div>
          )}

          {/* Traits */}
          {char.traits.length > 0 && (
            <div className="char-traits">
              <h4>Traits</h4>
              {char.traits.map(t => (
                <span key={t} className="trait-tag">{t}</span>
              ))}
            </div>
          )}

          {/* Spell slots */}
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

          {/* Prepared spells */}
          {char.prepared_spells?.length > 0 && (
            <div className="char-spells">
              <h4>Prepared Spells</h4>
              {char.prepared_spells.map(spell => (
                <span key={spell} className="spell-tag">{spell}</span>
              ))}
            </div>
          )}

          {/* Manage prepared spells */}
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
                      onClick={() => { setPreparedError(null); setIsManagingPrepared(false) }}
                      disabled={savingPreparedOptions}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Known spells */}
          {char.known_spells?.length > 0 && (
            <div className="char-spells">
              <h4>Known Spells</h4>
              {char.known_spells.map(spell => (
                <span key={spell} className="spell-tag">{spell}</span>
              ))}
            </div>
          )}

          {/* Class features */}
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
        </>
      ) : (
        <InventoryPanel
          inventory={char.inventory}
          gold={char.gold_gp ?? 0}
          strScore={char.abilities['STR'] ?? 10}
          spriteId={char.sprite_id}
          canEquip={canSelfEquip}
          isInCombat={isInCombat}
          onEquip={handleEquip}
          onUnequip={(id) => handleEquip(id, false)}
          equipError={equipError}
        />
      )}
    </div>
  )
}
