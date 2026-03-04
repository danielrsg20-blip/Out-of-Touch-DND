export type SpriteCell = { col: number; row: number }

export const CHARACTER_SPRITESHEET_URL = '/sprites/Characters/human_classes.png'
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
}

const CLASS_TO_HUMAN_SPRITE_ID: Record<string, string> = {
  Barbarian: 'pc_human_barbarian',
  Bard: 'pc_human_bard',
  Cleric: 'pc_human_cleric',
  Druid: 'pc_human_druid',
  Fighter: 'pc_human_fighter',
  Monk: 'pc_human_monk',
  Paladin: 'pc_human_paladin',
  Ranger: 'pc_human_ranger',
  Rogue: 'pc_human_rogue',
  Sorcerer: 'pc_human_sorcerer',
  Warlock: 'pc_human_warlock',
  Wizard: 'pc_human_wizard',
}

export function getCharacterSpriteId(charClass: string, race: string): string | null {
  if (race.trim().toLowerCase() !== 'human') {
    return null
  }
  return CLASS_TO_HUMAN_SPRITE_ID[charClass] ?? null
}
