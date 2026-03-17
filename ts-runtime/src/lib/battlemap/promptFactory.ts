import type { BattlemapStyleConfig, EncounterType, MoodStyle, SceneLocation, SceneSpec } from './types.js'

const LOCATION_DESCRIPTIONS: Record<SceneLocation, string> = {
  forest: 'dense forest clearings, roots, trails, and tree clusters',
  swamp: 'bog pools, reeds, raised patches of land, and gnarled trees',
  dungeon: 'stone chambers, corridors, doors, and clear wall silhouettes',
  city_alley: 'tight urban lanes, courtyards, stacked buildings, and market debris',
  tavern: 'top-down tavern floor plan with rooms, tables, bar, and doors',
  ruins: 'collapsed stone walls, arches, broken plazas, and overgrowth',
  mountain: 'rock paths, cliff edges, scree, and narrow passes',
  coastal: 'shoreline, tide pools, rocks, docks, and wet sand bands',
}

const ENCOUNTER_GUIDANCE: Record<EncounterType, string> = {
  ambush: 'include partial cover, multiple approach lanes, and clear choke points',
  siege: 'include fortified barriers, defensible positions, and breach routes',
  chase: 'include long movement lanes, shortcuts, and terrain transitions',
  investigation: 'include readable landmarks, suspicious spots, and clue-centric areas',
  diplomacy: 'include neutral social space with open movement and limited hazards',
  exploration: 'include varied terrain pockets and several points of interest',
}

const STYLE_GUIDANCE: Record<MoodStyle, string> = {
  'hand-drawn': 'hand-drawn ink and wash tabletop style with restrained texture',
  painterly: 'painterly fantasy map with soft brush transitions and readable forms',
  parchment: 'aged parchment appearance with sepia bias and subtle weathering',
  gritty: 'grounded gritty fantasy with weathered materials and subdued highlights',
  'high-fantasy': 'high-fantasy atmosphere while preserving tactical readability',
  realistic: 'naturalistic materials and grounded lighting from an overhead perspective',
}

function colorGuidance(style: BattlemapStyleConfig | undefined): string {
  const saturation = style?.color_saturation ?? 'muted'
  if (saturation === 'vibrant') {
    return 'use controlled vibrancy, avoid neon saturation and keep terrain classes distinct'
  }
  if (saturation === 'balanced') {
    return 'use moderate saturation with clear readability for obstacle boundaries'
  }
  return 'use muted tabletop palette with desaturated earth tones and restrained contrast'
}

function orientationToSize(style: BattlemapStyleConfig | undefined): '1024x1024' | '1792x1024' | '1024x1792' {
  const orientation = style?.orientation ?? 'landscape'
  if (orientation === 'square') return '1024x1024'
  if (orientation === 'portrait') return '1024x1792'
  return '1792x1024'
}

export function buildBattlemapPrompt(scene: SceneSpec, style?: BattlemapStyleConfig): string {
  const features = scene.notable_features.length > 0 ? scene.notable_features.join(', ') : 'none specified'
  const tone = scene.campaign_tone?.trim() || 'neutral fantasy tension'

  return [
    'Create a top-down Dungeons & Dragons tactical battlemap image.',
    `Location: ${LOCATION_DESCRIPTIONS[scene.location]}.`,
    `Biome: ${scene.biome}.`,
    `Encounter intent: ${ENCOUNTER_GUIDANCE[scene.encounter_type]}.`,
    `Notable features to depict clearly: ${features}.`,
    `Mood/style: ${STYLE_GUIDANCE[scene.mood_style]}.`,
    `Tone: ${tone}.`,
    colorGuidance(style) + '.',
    `World footprint: ${scene.map_width_feet} feet by ${scene.map_height_feet} feet.`,
    'Must be overhead orthographic composition suitable for square-grid turn-based combat.',
    'Ensure high readability of obstacles: buildings, walls, cliffs, dense trees, and water edges must have strong silhouettes.',
    'Do not include text, lettering, numbers, labels, logos, UI, borders, or watermarks.',
    'Do not include character tokens, miniatures, or portraits.',
    'Keep traversal regions visually separable: walkable ground, blocked zones, difficult terrain, and doorways.',
  ].join(' ')
}

export function inferImageSize(style?: BattlemapStyleConfig): '1024x1024' | '1792x1024' | '1024x1792' {
  return orientationToSize(style)
}
