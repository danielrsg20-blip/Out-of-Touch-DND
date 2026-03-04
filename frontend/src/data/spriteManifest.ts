export type SpriteManifestRecord = {
  url: string
  source_asset_id: string
}

const PC_PACK = 'lpc-universal-character-generator'
const ENEMY_PACK = 'lpc-monsters'
const PROP_PACK = 'lpc-terrain-extension'
const ITEM_PACK = 'custom-item-sprites'

const SPRITE_MANIFEST: Record<string, SpriteManifestRecord> = {
  pc_knight: { url: '/sprites/manifest/pc_knight.svg', source_asset_id: PC_PACK },
  pc_ranger: { url: '/sprites/manifest/pc_ranger.svg', source_asset_id: PC_PACK },
  pc_mage: { url: '/sprites/manifest/pc_mage.svg', source_asset_id: PC_PACK },
  pc_cleric: { url: '/sprites/manifest/pc_cleric.svg', source_asset_id: PC_PACK },
  pc_bard: { url: '/sprites/manifest/pc_bard.svg', source_asset_id: PC_PACK },
  pc_monk: { url: '/sprites/manifest/pc_monk.svg', source_asset_id: PC_PACK },
  pc_druid: { url: '/sprites/manifest/pc_druid.svg', source_asset_id: PC_PACK },
  pc_rogue: { url: '/sprites/manifest/pc_rogue.svg', source_asset_id: PC_PACK },

  enemy_skeleton: { url: '/sprites/manifest/enemy_undead.svg', source_asset_id: ENEMY_PACK },
  enemy_ghoul: { url: '/sprites/manifest/enemy_undead.svg', source_asset_id: ENEMY_PACK },
  enemy_wraith: { url: '/sprites/manifest/enemy_undead.svg', source_asset_id: ENEMY_PACK },
  enemy_zombie: { url: '/sprites/manifest/enemy_undead.svg', source_asset_id: ENEMY_PACK },
  enemy_goblin: { url: '/sprites/manifest/enemy_humanoid.svg', source_asset_id: ENEMY_PACK },
  enemy_orc: { url: '/sprites/manifest/enemy_humanoid.svg', source_asset_id: ENEMY_PACK },
  enemy_kobold: { url: '/sprites/manifest/enemy_humanoid.svg', source_asset_id: ENEMY_PACK },
  enemy_bandit: { url: '/sprites/manifest/enemy_humanoid.svg', source_asset_id: ENEMY_PACK },
  enemy_wolf: { url: '/sprites/manifest/enemy_beast.svg', source_asset_id: ENEMY_PACK },
  enemy_boar: { url: '/sprites/manifest/enemy_beast.svg', source_asset_id: ENEMY_PACK },
  enemy_bat: { url: '/sprites/manifest/enemy_beast.svg', source_asset_id: ENEMY_PACK },
  enemy_spider: { url: '/sprites/manifest/enemy_monstrous.svg', source_asset_id: ENEMY_PACK },

  prop_torch: { url: '/sprites/manifest/prop_dungeon.svg', source_asset_id: PROP_PACK },
  prop_crate: { url: '/sprites/manifest/prop_dungeon.svg', source_asset_id: PROP_PACK },
  prop_barrel: { url: '/sprites/manifest/prop_dungeon.svg', source_asset_id: PROP_PACK },
  prop_rubble: { url: '/sprites/manifest/prop_dungeon.svg', source_asset_id: PROP_PACK },
  prop_tree: { url: '/sprites/manifest/prop_forest.svg', source_asset_id: PROP_PACK },
  prop_bush: { url: '/sprites/manifest/prop_forest.svg', source_asset_id: PROP_PACK },
  prop_log: { url: '/sprites/manifest/prop_forest.svg', source_asset_id: PROP_PACK },
  prop_stone: { url: '/sprites/manifest/prop_cave.svg', source_asset_id: PROP_PACK },
  prop_urn: { url: '/sprites/manifest/prop_crypt.svg', source_asset_id: PROP_PACK },
  prop_brazier: { url: '/sprites/manifest/prop_crypt.svg', source_asset_id: PROP_PACK },
  prop_tomb: { url: '/sprites/manifest/prop_crypt.svg', source_asset_id: PROP_PACK },
  prop_bones: { url: '/sprites/manifest/prop_crypt.svg', source_asset_id: PROP_PACK },
  prop_stalagmite: { url: '/sprites/manifest/prop_cave.svg', source_asset_id: PROP_PACK },
  prop_crystal: { url: '/sprites/manifest/prop_cave.svg', source_asset_id: PROP_PACK },
  prop_mushroom: { url: '/sprites/manifest/prop_cave.svg', source_asset_id: PROP_PACK },

  // Item sprites
  item_sword:        { url: '/sprites/items/item_sword.svg',        source_asset_id: ITEM_PACK },
  item_axe:          { url: '/sprites/items/item_axe.svg',          source_asset_id: ITEM_PACK },
  item_dagger:       { url: '/sprites/items/item_dagger.svg',       source_asset_id: ITEM_PACK },
  item_mace:         { url: '/sprites/items/item_mace.svg',         source_asset_id: ITEM_PACK },
  item_spear:        { url: '/sprites/items/item_spear.svg',        source_asset_id: ITEM_PACK },
  item_staff:        { url: '/sprites/items/item_staff.svg',        source_asset_id: ITEM_PACK },
  item_bow:          { url: '/sprites/items/item_bow.svg',          source_asset_id: ITEM_PACK },
  item_crossbow:     { url: '/sprites/items/item_crossbow.svg',     source_asset_id: ITEM_PACK },
  item_polearm:      { url: '/sprites/items/item_polearm.svg',      source_asset_id: ITEM_PACK },
  item_armor_light:  { url: '/sprites/items/item_armor_light.svg',  source_asset_id: ITEM_PACK },
  item_armor_medium: { url: '/sprites/items/item_armor_medium.svg', source_asset_id: ITEM_PACK },
  item_armor_heavy:  { url: '/sprites/items/item_armor_heavy.svg',  source_asset_id: ITEM_PACK },
  item_shield:       { url: '/sprites/items/item_shield.svg',       source_asset_id: ITEM_PACK },
  item_potion:       { url: '/sprites/items/item_potion.svg',       source_asset_id: ITEM_PACK },
  item_tool:         { url: '/sprites/items/item_tool.svg',         source_asset_id: ITEM_PACK },
  item_gear:         { url: '/sprites/items/item_gear.svg',         source_asset_id: ITEM_PACK },
  item_ammunition:   { url: '/sprites/items/item_ammunition.svg',   source_asset_id: ITEM_PACK },
}

function isDirectUrl(value: string): boolean {
  return value.startsWith('http://')
    || value.startsWith('https://')
    || value.startsWith('data:image/')
    || value.startsWith('/')
}

export function resolveSpriteUrl(spriteKey: string): string | null {
  const normalized = spriteKey.trim()
  if (!normalized) {
    return null
  }
  if (isDirectUrl(normalized)) {
    return normalized
  }
  const entry = SPRITE_MANIFEST[normalized]
  return entry?.url ?? null
}

export function getSpriteSourceAssetId(spriteKey: string): string | null {
  const normalized = spriteKey.trim()
  if (!normalized) {
    return null
  }
  return SPRITE_MANIFEST[normalized]?.source_asset_id ?? null
}

const ARMOR_SPRITE: Record<string, string> = {
  light: 'item_armor_light',
  medium: 'item_armor_medium',
  heavy: 'item_armor_heavy',
}

const WEAPON_ID_FRAGMENTS: Array<[string, string]> = [
  ['crossbow', 'item_crossbow'],
  ['glaive',   'item_polearm'],
  ['halberd',  'item_polearm'],
  ['axe',      'item_axe'],
  ['dagger',   'item_dagger'],
  ['staff',    'item_staff'],
  ['spear',    'item_spear'],
  ['javelin',  'item_spear'],
  ['pike',     'item_spear'],
  ['lance',    'item_spear'],
  ['trident',  'item_spear'],
  ['club',     'item_mace'],
  ['mace',     'item_mace'],
  ['flail',    'item_mace'],
  ['hammer',   'item_mace'],
  ['morningstar', 'item_mace'],
  ['maul',     'item_mace'],
]

function resolveWeaponSprite(id: string, properties: string[]): string {
  const isRanged = properties.some(p => p.startsWith('Ammunition'))
  if (isRanged) return 'item_bow'
  const match = WEAPON_ID_FRAGMENTS.find(([fragment]) => id.includes(fragment))
  return match?.[1] ?? 'item_sword'
}

export function getItemSpriteKey(item: {
  id: string
  category: string
  subcategory?: string | null
  properties?: string[] | null
  name?: string | null
}): string {
  const id = (item.id ?? '').toLowerCase()
  const name = (item.name ?? '').toLowerCase()

  if (item.category === 'shield') return 'item_shield'
  if (item.category === 'armor') return ARMOR_SPRITE[item.subcategory ?? ''] ?? 'item_armor_heavy'
  if (item.category === 'ammunition') return 'item_ammunition'
  if (item.category === 'weapon') return resolveWeaponSprite(id, item.properties ?? [])
  if (item.category === 'tool') return 'item_tool'
  if (name.includes('potion') || id.includes('potion')) return 'item_potion'
  return 'item_gear'
}
