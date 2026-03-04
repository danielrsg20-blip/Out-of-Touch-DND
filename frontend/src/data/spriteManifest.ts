export type SpriteManifestRecord = {
  url: string
  source_asset_id: string
}

const PC_PACK = 'lpc-universal-character-generator'
const ENEMY_PACK = 'lpc-monsters'
const PROP_PACK = 'lpc-terrain-extension'

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
