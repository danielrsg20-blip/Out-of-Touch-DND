/**
 * dungeonPalette.ts
 *
 * Color palettes for dungeon/interior/ruin map generation, following the
 * guide in Examples/svg_dungeon_map_general_guide.md.
 *
 * Base philosophy: near-black void is the wall; every navigable space is a
 * lighter floor shape drawn on top. Palette is intentionally near-monochrome
 * with zero saturation except for water, fire, and gem accents.
 */

export type DungeonPalette = {
  /** Full-canvas background = solid stone/wall. Near-black. */
  void: string
  /** Floor fill for all navigable rooms + corridors. Warm parchment. */
  floor: string
  /** Wall outline stroke. Near-black, 3px. */
  wall_stroke: string
  /** Column, pillar fill. Stone gray. */
  column_fill: string
  /** Feature fill (chests, sarcophagi outer surface). Mid-gray. */
  feature_mid: string
  /** Feature detail (lids, inner surfaces). Darker gray. */
  feature_dark: string
  /** Water body fill. Muted slate blue. */
  water: string
  /** Pit / chasm / lava area fill. Very dark gray. */
  pit_fill: string
  /** Room label text. Very dark warm brown — reads as ink. */
  label_ink: string
  /** UI elements: compass background, banner fill. Warm parchment. */
  ui_parchment: string
  /** Fire / hearth glow (hearth inner rect). */
  fire: string
  /** Lava fill (treated as blocking). */
  lava: string
}

/** Guide base palette — applies to most dungeon/interior presets. */
const BASE_DUNGEON_PALETTE: DungeonPalette = {
  void:         '#0a0a0a',
  floor:        '#f0eeea',
  wall_stroke:  '#0f0f0f',
  column_fill:  '#b8b4ac',
  feature_mid:  '#d0ccc4',
  feature_dark: '#b0aca4',
  water:        '#6a8898',
  pit_fill:     '#3a3a3a',
  label_ink:    '#2a2820',
  ui_parchment: '#e8e4dc',
  fire:         '#d04820',
  lava:         '#8b2200',
}

/**
 * Per-preset palette overrides. Each entry selectively replaces fields from
 * BASE_DUNGEON_PALETTE. Keys match the stylePreset strings in presetCatalog.ts.
 */
const PALETTE_OVERRIDES: Partial<Record<string, Partial<DungeonPalette>>> = {
  'ancient-crypt': {
    // Aged, yellowed parchment — centuries of dust.
    floor: '#ede8e0',
    feature_mid:  '#cdc8be',
    feature_dark: '#aba897',
  },
  'caverns-hazards': {
    // Cool stone with volcanic accents.
    wall_stroke: '#1a1a2a',
    pit_fill:    '#1c0a00',
    lava:        '#a03010',
  },
  'sewer-tunnels': {
    // Slightly green-tinted floor; brackish water.
    floor:       '#e8e6e0',
    water:       '#5a7e6a',
    feature_mid:  '#cccabc',
  },
  'temple-ruins': {
    // Slightly warm ivory with aged stone accents.
    floor:        '#f2efea',
    column_fill:  '#c0bcb2',
  },
  'wizard-library': {
    // Cleaner, more scholarly — cleaner parchment.
    floor:        '#f4f2ed',
    label_ink:    '#1e1c18',
  },
  'fortress-gate': {
    // Darker, more utilitarian military stone.
    floor:        '#ebe8e3',
    column_fill:  '#a8a49c',
    feature_dark: '#989490',
  },
  'ruined-village': {
    feature_mid:  '#d4cec6',
    pit_fill:     '#2e2e2e',
  },
  'vault-room': {
    floor:        '#eceae5',
    wall_stroke:  '#101012',
    column_fill:  '#acacac',
  },
  'vessel-deck': {
    floor:        '#ddd8cc',
    feature_mid:  '#c8c0b0',
    water:        '#4a6e88',
  },
  'harbor-docks': {
    floor:        '#e6e2da',
    water:        '#4a6e88',
  },
  'market-bazaar': {
    floor:        '#f0ecde',
    feature_mid:  '#d4cebb',
  },
  'warehouse-storage': {
    floor:        '#e8e4dc',
    feature_mid:  '#c8c4bc',
  },
}

/**
 * Returns the full DungeonPalette for the given stylePreset string.
 * Falls back to BASE_DUNGEON_PALETTE for any unknown style.
 */
export function getDungeonPalette(stylePreset: string | undefined): DungeonPalette {
  const overrides = (stylePreset && PALETTE_OVERRIDES[stylePreset]) ?? {}
  return { ...BASE_DUNGEON_PALETTE, ...overrides }
}
