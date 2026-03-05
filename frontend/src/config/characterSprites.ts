export type SpriteCell = { col: number; row: number }

export const CHARACTER_SPRITESHEET_URLS = {
  human: '/sprites/Characters/human_classes.png',
  elf: '/sprites/Characters/elf_classes.png',
  dwarf: '/sprites/Characters/dwarf_classes.png',
  dragonborn: '/sprites/Characters/dragonborn_classes.png',
  gnome: '/sprites/Characters/gnome_classes.png',
  halfling: '/sprites/Characters/halfling_classes.png',
} as const

export const CHARACTER_SPRITESHEET_COLUMNS = 4
export const CHARACTER_SPRITESHEET_ROWS = 3

const CLASS_TO_CELL: Record<string, SpriteCell> = {
  barbarian: { col: 0, row: 0 },
  ranger: { col: 1, row: 0 },
  cleric: { col: 2, row: 0 },
  druid: { col: 3, row: 0 },
  fighter: { col: 0, row: 1 },
  monk: { col: 1, row: 1 },
  paladin: { col: 2, row: 1 },
  bard: { col: 3, row: 1 },
  rogue: { col: 0, row: 2 },
  sorcerer: { col: 1, row: 2 },
  warlock: { col: 2, row: 2 },
  wizard: { col: 3, row: 2 },
}

const CLASS_TO_SPRITE_SUFFIX: Record<string, string> = {
  Barbarian: 'barbarian',
  Bard: 'bard',
  Cleric: 'cleric',
  Druid: 'druid',
  Fighter: 'fighter',
  Monk: 'monk',
  Paladin: 'paladin',
  Ranger: 'ranger',
  Rogue: 'rogue',
  Sorcerer: 'sorcerer',
  Warlock: 'warlock',
  Wizard: 'wizard',
}

export function getCharacterSpriteId(charClass: string, race: string): string | null {
  const raceKey = race.trim().toLowerCase()
  if (!(raceKey in CHARACTER_SPRITESHEET_URLS)) {
    return null
  }
  const classSuffix = CLASS_TO_SPRITE_SUFFIX[charClass]
  if (!classSuffix) {
    return null
  }
  return `pc_${raceKey}_${classSuffix}`
}

export function getCharacterSpritesheetUrl(spriteId: string): string | null {
  const normalized = spriteId.trim().toLowerCase()
  if (!normalized.startsWith('pc_')) {
    return null
  }
  const parts = normalized.split('_')
  if (parts.length < 3) {
    return null
  }
  const raceKey = parts[1] as keyof typeof CHARACTER_SPRITESHEET_URLS
  return CHARACTER_SPRITESHEET_URLS[raceKey] ?? null
}

export function getCharacterSpriteCell(spriteId: string): SpriteCell | null {
  const normalized = spriteId.trim().toLowerCase()
  if (!normalized.startsWith('pc_')) {
    return null
  }
  const parts = normalized.split('_')
  if (parts.length < 3) {
    return null
  }
  const classKey = parts.slice(2).join('_')
  return CLASS_TO_CELL[classKey] ?? null
}
