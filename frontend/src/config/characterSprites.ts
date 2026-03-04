export type SpriteCell = { col: number; row: number }

export const CHARACTER_SPRITESHEET_URLS = {
  human: '/sprites/Characters/human_classes.png',
  elf: '/sprites/Characters/elf_classes.png',
  dwarf: '/sprites/Characters/dwarf_classes.png',
} as const

export const CHARACTER_SPRITESHEET_COLUMNS = 4
export const CHARACTER_SPRITESHEET_ROWS = 3

export const CHARACTER_CELLS: Record<string, SpriteCell> = {
  pc_human_barbarian: { col: 0, row: 0 },
  pc_human_ranger: { col: 1, row: 0 },
  pc_human_cleric: { col: 2, row: 0 },
  pc_human_druid: { col: 3, row: 0 },
  pc_human_fighter: { col: 0, row: 1 },
  pc_human_monk: { col: 1, row: 1 },
  pc_human_paladin: { col: 2, row: 1 },
  pc_human_bard: { col: 3, row: 1 },
  pc_human_rogue: { col: 0, row: 2 },
  pc_human_sorcerer: { col: 1, row: 2 },
  pc_human_warlock: { col: 2, row: 2 },
  pc_human_wizard: { col: 3, row: 2 },

  pc_elf_barbarian: { col: 0, row: 0 },
  pc_elf_ranger: { col: 1, row: 0 },
  pc_elf_cleric: { col: 2, row: 0 },
  pc_elf_druid: { col: 3, row: 0 },
  pc_elf_fighter: { col: 0, row: 1 },
  pc_elf_monk: { col: 1, row: 1 },
  pc_elf_paladin: { col: 2, row: 1 },
  pc_elf_bard: { col: 3, row: 1 },
  pc_elf_rogue: { col: 0, row: 2 },
  pc_elf_sorcerer: { col: 1, row: 2 },
  pc_elf_warlock: { col: 2, row: 2 },
  pc_elf_wizard: { col: 3, row: 2 },

  pc_dwarf_barbarian: { col: 0, row: 0 },
  pc_dwarf_ranger: { col: 1, row: 0 },
  pc_dwarf_cleric: { col: 2, row: 0 },
  pc_dwarf_druid: { col: 3, row: 0 },
  pc_dwarf_fighter: { col: 0, row: 1 },
  pc_dwarf_monk: { col: 1, row: 1 },
  pc_dwarf_paladin: { col: 2, row: 1 },
  pc_dwarf_bard: { col: 3, row: 1 },
  pc_dwarf_rogue: { col: 0, row: 2 },
  pc_dwarf_sorcerer: { col: 1, row: 2 },
  pc_dwarf_warlock: { col: 2, row: 2 },
  pc_dwarf_wizard: { col: 3, row: 2 },
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
  if (!['human', 'elf', 'dwarf'].includes(raceKey)) {
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
  if (normalized.startsWith('pc_human_')) {
    return CHARACTER_SPRITESHEET_URLS.human
  }
  if (normalized.startsWith('pc_elf_')) {
    return CHARACTER_SPRITESHEET_URLS.elf
  }
  if (normalized.startsWith('pc_dwarf_')) {
    return CHARACTER_SPRITESHEET_URLS.dwarf
  }
  return null
}
