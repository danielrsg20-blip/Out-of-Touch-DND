/**
 * overlayTestData.ts
 *
 * Sample hardcoded overlays for testing Phase 1 implementation.
 * These can be loaded into the game to verify rendering, zooming, panning, and layer composition.
 */

import type { Overlay, Region, Path, Decal } from '../types'

/**
 * Create a simple test overlay with basic shapes
 * Useful for verifying: polygon rendering, polyline rendering, decal stamping, z-order
 */
export function createTestOverlay1_SimpleShapes(): Overlay {
  const baseRegion: Region = {
    type: 'polygon',
    id: 'region_grass_1',
    name: 'Grassy Area',
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 120 },
      { x: 220, y: 200 },
      { x: 150, y: 210 },
      { x: 100, y: 180 },
    ],
    fill: {
      color: '#90EE9088', // Light green with transparency
    },
    fill_opacity: 0.7,
    stroke: {
      color: '#2d5a2d',
      width: 2,
      line_cap: 'round',
      line_join: 'round',
    },
    feather: 3,
    tags: ['grass', 'passable'],
  }

  const pathRoad: Path = {
    type: 'polyline',
    id: 'path_road_1',
    name: 'Old Road',
    points: [
      { x: 50, y: 150 },
      { x: 150, y: 120 },
      { x: 300, y: 140 },
    ],
    stroke: {
      color: '#8b7355',
      width: 8,
      line_cap: 'round',
      line_join: 'round',
    },
    stroke_opacity: 0.6,
    style_jitter: 0.1,
    tags: ['road', 'reduces_terrain_cost'],
  }

  const decalStone: Decal = {
    type: 'decal',
    id: 'decal_stone_1',
    name: 'Stone',
    position: { x: 180, y: 150 },
    decal_type: 'rock_small',
    scale: 1.2,
    rotation: 45,
    opacity: 0.8,
    tags: ['blocking'],
  }

  return {
    id: 'overlay_test_1',
    name: 'Simple Test Shapes',
    version: '1.0',
    created_at: new Date().toISOString(),
    metadata: {
      narrative_tags: ['test', 'basic_shapes'],
      story_context: 'MVP test overlay for rendering verification',
    },
    styles: {
      default: {
        id: 'default',
        name: 'Default',
        palette: {
          primary: '#3a3a3a',
          secondary: '#8b8b8b',
          accent_1: '#ff6b35',
          accent_2: '#4ecdc4',
          accent_3: '#95e1d3',
        },
        noise_seed: 42,
        edge_feathering: 3,
        jitter: 0.1,
        decal_library: {
          rock_small: {
            id: 'rock_small',
            name: 'Small Rock',
            svg_data: 'M10,15 Q8,10 12,8 Q16,10 15,15 Q14,18 10,15',
            bounding_box: { w: 16, h: 16 },
            color_key: 'secondary',
            variations: [],
          },
        },
      },
    },
    layers: [
      {
        id: 'layer_base',
        name: 'BaseBiomeOverlay',
        z_index: 10,
        visible: true,
        blend_mode: 'normal',
        opacity: 1.0,
        elements: [baseRegion],
      },
      {
        id: 'layer_detail',
        name: 'DetailOverlay',
        z_index: 20,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.8,
        elements: [pathRoad, decalStone],
      },
      {
        id: 'layer_weather',
        name: 'WeatherOverlay',
        z_index: 30,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.5,
        elements: [],
      },
      {
        id: 'layer_magic',
        name: 'MagicOverlay',
        z_index: 40,
        visible: true,
        blend_mode: 'screen',
        opacity: 0.3,
        elements: [],
      },
    ],
  }
}

/**
 * Battle scorch marks example (demonstrates multiple regions with noise masks)
 */
export function createTestOverlay2_BattleScorch(): Overlay {
  const scorchArc1: Region = {
    type: 'polygon',
    id: 'scorch_arc_1',
    name: 'Weapon Impact 1',
    points: [
      { x: 120, y: 100 },
      { x: 180, y: 90 },
      { x: 170, y: 150 },
      { x: 130, y: 160 },
    ],
    fill: {
      color: '#3a2110aa',
    },
    fill_opacity: 0.6,
    stroke: {
      color: '#8b4513',
      width: 1.5,
      line_cap: 'round',
      line_join: 'round',
    },
    noise_mask: {
      enabled: true,
      intensity: 0.5,
      scale: 8,
      seed: 101,
      octaves: 3,
    },
    feather: 4,
    tags: ['fire_damage', 'scorch_mark'],
  }

  const scorchArc2: Region = {
    type: 'polygon',
    id: 'scorch_arc_2',
    name: 'Weapon Impact 2',
    points: [
      { x: 250, y: 120 },
      { x: 320, y: 110 },
      { x: 310, y: 180 },
      { x: 260, y: 190 },
    ],
    fill: {
      color: '#3a2110aa',
    },
    fill_opacity: 0.5,
    stroke: {
      color: '#8b4513',
      width: 1.5,
    },
    noise_mask: {
      enabled: true,
      intensity: 0.4,
      scale: 10,
      seed: 102,
      octaves: 2,
    },
    feather: 3,
    tags: ['fire_damage'],
  }

  return {
    id: 'overlay_test_2',
    name: 'Battle Scorch Marks',
    version: '1.0',
    created_at: new Date().toISOString(),
    metadata: {
      narrative_tags: ['battle', 'fire_damage'],
      story_context: 'Recent fierce battle with melee combat and spell impact',
    },
    styles: {
      default: {
        id: 'default',
        name: 'Dark Gritty',
        palette: {
          primary: '#3a3a3a',
          secondary: '#8b8b8b',
          accent_1: '#ff6b35',
          accent_2: '#4ecdc4',
          accent_3: '#95e1d3',
        },
        noise_seed: 42,
        edge_feathering: 3,
        jitter: 0.15,
        decal_library: {},
      },
    },
    layers: [
      {
        id: 'layer_scorch',
        name: 'ScorchOverlay',
        z_index: 10,
        visible: true,
        blend_mode: 'multiply',
        opacity: 0.7,
        elements: [scorchArc1, scorchArc2],
      },
      {
        id: 'layer_detail',
        name: 'DetailOverlay',
        z_index: 20,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.8,
        elements: [],
      },
      {
        id: 'layer_weather',
        name: 'WeatherOverlay',
        z_index: 30,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.5,
        elements: [],
      },
      {
        id: 'layer_magic',
        name: 'MagicOverlay',
        z_index: 40,
        visible: true,
        blend_mode: 'screen',
        opacity: 0.3,
        elements: [],
      },
    ],
  }
}

/**
 * Cursed forest example (demonstrates layering with blend modes)
 */
export function createTestOverlay3_CursedForest(): Overlay {
  const vineRegion: Region = {
    type: 'polygon',
    id: 'vines_creep_1',
    name: 'Cursed Vines',
    points: [
      { x: 80, y: 80 },
      { x: 280, y: 100 },
      { x: 270, y: 250 },
      { x: 70, y: 230 },
    ],
    fill: {
      color: '#2d5f2644',
    },
    fill_opacity: 0.5,
    stroke: {
      color: '#1a3a1a',
      width: 2,
    },
    noise_mask: {
      enabled: true,
      intensity: 0.6,
      scale: 12,
      seed: 200,
      octaves: 3,
    },
    feather: 5,
    tags: ['cursed', 'difficult_terrain', 'vision_obstructed'],
  }

  const glowPath: Path = {
    type: 'polyline',
    id: 'glow_line_1',
    name: 'Sickly Glow',
    points: [
      { x: 100, y: 120 },
      { x: 200, y: 130 },
      { x: 260, y: 180 },
    ],
    stroke: {
      color: '#6b2f99',
      width: 4,
      line_cap: 'round',
      line_join: 'round',
    },
    stroke_opacity: 0.4,
    style_jitter: 0.2,
    tags: ['magical_instability', 'glowing'],
  }

  return {
    id: 'overlay_test_3',
    name: 'Cursed Forest',
    version: '1.0',
    created_at: new Date().toISOString(),
    metadata: {
      narrative_tags: ['cursed', 'darkness', 'decay'],
      story_context: 'Ancient cursed forest with corrupted vines and sickly magical auras',
    },
    styles: {
      default: {
        id: 'default',
        name: 'Dark Fantasy',
        palette: {
          primary: '#3a3a3a',
          secondary: '#8b8b8b',
          accent_1: '#6b2f99',
          accent_2: '#1a3a1a',
          accent_3: '#2d5f26',
        },
        noise_seed: 200,
        edge_feathering: 5,
        jitter: 0.2,
        decal_library: {},
      },
    },
    layers: [
      {
        id: 'layer_curse',
        name: 'CurseRegion',
        z_index: 10,
        visible: true,
        blend_mode: 'multiply',
        opacity: 0.7,
        elements: [vineRegion],
      },
      {
        id: 'layer_glow',
        name: 'MagicGlow',
        z_index: 30,
        visible: true,
        blend_mode: 'color-dodge',
        opacity: 0.5,
        elements: [glowPath],
      },
      {
        id: 'layer_weather',
        name: 'WeatherOverlay',
        z_index: 20,
        visible: true,
        blend_mode: 'normal',
        opacity: 0.5,
        elements: [],
      },
      {
        id: 'layer_magic',
        name: 'MagicOverlay',
        z_index: 40,
        visible: true,
        blend_mode: 'screen',
        opacity: 0.3,
        elements: [],
      },
    ],
  }
}

/**
 * Get all test overlays
 */
export function getAllTestOverlays(): Overlay[] {
  return [
    createTestOverlay1_SimpleShapes(),
    createTestOverlay2_BattleScorch(),
    createTestOverlay3_CursedForest(),
  ]
}
