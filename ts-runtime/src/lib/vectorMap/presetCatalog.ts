import type { GenerateVectorMapRequest } from './types.js'

export type VectorMapPresetGroupId = 'classic_wilderness' | 'urban' | 'dungeon_interior'

export type VectorMapPresetId =
  | 'crossroads_tjunction'
  | 'river_bridge_ford'
  | 'dense_forest_clearing_camp'
  | 'mountain_pass_cliffside'
  | 'desolate_desert_canyon'
  | 'swamp_bog_fort'
  | 'tavern_inn_floorplan'
  | 'bustling_marketplace_bazaar'
  | 'city_alleyway_backstreet'
  | 'city_docks_harbor'
  | 'cathedral_temple_ruins'
  | 'city_sewers_tunnels'
  | 'warehouse_storage_room'
  | 'abandoned_ruined_village'
  | 'ancient_tomb_crypt'
  | 'magical_library_wizard_tower'
  | 'caves_caverns_lava_water'
  | 'castle_courtyard_fortress_gate'
  | 'bank_vault_room'
  | 'airship_sea_vessel_deck'

export type VectorMapPresetDefinition = {
  id: VectorMapPresetId
  label: string
  groupId: VectorMapPresetGroupId
  groupLabel: string
  description: string
  biome: NonNullable<GenerateVectorMapRequest['biome']>
  storyPrompt: string
  stylePreset: string
  generationDefaults: NonNullable<GenerateVectorMapRequest['generation_params']>
}

const CLASSIC_GROUP = 'Classic Encounter & Wilderness Maps'
const URBAN_GROUP = 'Town, City & Urban Maps'
const DUNGEON_GROUP = 'Dungeon, Ruin & Interior Maps'

export const DEFAULT_VECTOR_MAP_PRESET_ID: VectorMapPresetId = 'dense_forest_clearing_camp'

export const VECTOR_MAP_PRESETS: readonly VectorMapPresetDefinition[] = [
  {
    id: 'crossroads_tjunction',
    label: 'Crossroads/T-Junction Road',
    groupId: 'classic_wilderness',
    groupLabel: CLASSIC_GROUP,
    description: 'A travel-worn intersection with sightlines, ambush cover, and branching approach lanes. Good for moving skirmishes and roadblock encounters.',
    biome: 'village',
    storyPrompt: 'A crossroads and t-junction road with cart ruts, roadside stones, sparse scrub, and tactical cover near the verges.',
    stylePreset: 'roadside-classic',
    generationDefaults: { room_count: 5, corridor_width_cells: 2, obstacle_density: 0.08, hazard_density: 0.04 },
  },
  {
    id: 'river_bridge_ford',
    label: 'River with a Bridge/Ford',
    groupId: 'classic_wilderness',
    groupLabel: CLASSIC_GROUP,
    description: 'A crossing point with a narrow bridge or ford, split banks, and exposed choke points. Ideal for ranged pressure and retreat decisions.',
    biome: 'forest',
    storyPrompt: 'A shallow river crossing with a weathered bridge or ford, muddy banks, reeds, stones, and a few nearby tree clusters.',
    stylePreset: 'riverside-encounter',
    generationDefaults: { room_count: 6, corridor_width_cells: 2, obstacle_density: 0.12, hazard_density: 0.12 },
  },
  {
    id: 'dense_forest_clearing_camp',
    label: 'Dense Forest Clearing/Camp',
    groupId: 'classic_wilderness',
    groupLabel: CLASSIC_GROUP,
    description: 'A packed woodland perimeter opening onto a rough camp or ritual clearing. Strong for stealth, concealment, and shifting sightlines.',
    biome: 'forest',
    storyPrompt: 'A dense forest clearing with camp remnants, fallen logs, undergrowth, and broken lines of sight between tree clusters.',
    stylePreset: 'forest-clearing',
    generationDefaults: { room_count: 8, corridor_width_cells: 2, obstacle_density: 0.18, hazard_density: 0.08 },
  },
  {
    id: 'mountain_pass_cliffside',
    label: 'Mountain Pass/Cliffside',
    groupId: 'classic_wilderness',
    groupLabel: CLASSIC_GROUP,
    description: 'A narrow highland route with ledges, sheer drop-offs, and heavy path control. Suits hold-the-line or elevation-focused fights.',
    biome: 'mine',
    storyPrompt: 'A mountain pass on a cliffside with narrow ledges, broken rock, switchbacks, and precarious choke points.',
    stylePreset: 'cliff-pass',
    generationDefaults: { room_count: 6, corridor_width_cells: 1, obstacle_density: 0.2, hazard_density: 0.1 },
  },
  {
    id: 'desolate_desert_canyon',
    label: 'Desolate Desert/Canyon',
    groupId: 'classic_wilderness',
    groupLabel: CLASSIC_GROUP,
    description: 'Open heat-blasted ground cut by gullies and rock walls, with long lanes and sparse hard cover. Strong for pursuit and ranged attrition.',
    biome: 'custom',
    storyPrompt: 'A desolate desert canyon with sand-scoured rock, dry channels, harsh exposure, and pockets of cover near the canyon walls.',
    stylePreset: 'desert-canyon',
    generationDefaults: { room_count: 5, corridor_width_cells: 2, obstacle_density: 0.1, hazard_density: 0.06 },
  },
  {
    id: 'swamp_bog_fort',
    label: 'Swamp/Bog Fort',
    groupId: 'classic_wilderness',
    groupLabel: CLASSIC_GROUP,
    description: 'Wet ground, unstable footing, and a raised strongpoint create layered movement penalties and defensive angles.',
    biome: 'forest',
    storyPrompt: 'A swamp or bog fort with raised walkways, pools of standing water, deep mud, reeds, and rotting palisade sections.',
    stylePreset: 'bog-fort',
    generationDefaults: { room_count: 7, corridor_width_cells: 2, obstacle_density: 0.16, hazard_density: 0.18 },
  },
  {
    id: 'tavern_inn_floorplan',
    label: 'Tavern/Inn Floorplan',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'Compact interior spaces with tables, stairs, and service choke points. Good for close-quarters brawls and room-clearing beats.',
    biome: 'village',
    storyPrompt: 'A tavern or inn floorplan with a common room, hearth, bar, side chambers, and scattered furniture obstacles.',
    stylePreset: 'tavern-floorplan',
    generationDefaults: { room_count: 9, corridor_width_cells: 2, obstacle_density: 0.2, hazard_density: 0.04 },
  },
  {
    id: 'bustling_marketplace_bazaar',
    label: 'Bustling Marketplace/Bazaar',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'Stalls, awnings, and shifting lanes turn open space into a maze of soft cover and flanking routes.',
    biome: 'village',
    storyPrompt: 'A bustling marketplace or bazaar with packed stalls, fabric awnings, crate stacks, and narrow movement corridors.',
    stylePreset: 'market-bazaar',
    generationDefaults: { room_count: 8, corridor_width_cells: 2, obstacle_density: 0.22, hazard_density: 0.05 },
  },
  {
    id: 'city_alleyway_backstreet',
    label: 'City Alleyway/Backstreet',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'A tight urban skirmish space defined by corners, service yards, and ambush entries from side passages.',
    biome: 'village',
    storyPrompt: 'A city alleyway and backstreet network with refuse piles, service doors, stacked crates, and close urban sightlines.',
    stylePreset: 'city-backstreet',
    generationDefaults: { room_count: 7, corridor_width_cells: 1, obstacle_density: 0.18, hazard_density: 0.05 },
  },
  {
    id: 'city_docks_harbor',
    label: 'City Docks/Harbor',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'Piers, loading zones, and water edges create a mix of open lanes and hazardous flanks.',
    biome: 'village',
    storyPrompt: 'City docks and harbor approaches with piers, cargo cranes, crate piles, rope hazards, and slippery edges.',
    stylePreset: 'harbor-docks',
    generationDefaults: { room_count: 6, corridor_width_cells: 2, obstacle_density: 0.14, hazard_density: 0.14 },
  },
  {
    id: 'cathedral_temple_ruins',
    label: 'Cathedral/Temple Ruins',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'Broken sacred architecture with columns, collapsed walls, and dramatic central space. Effective for boss fights and layered cover.',
    biome: 'crypt',
    storyPrompt: 'Ruined cathedral or temple grounds with shattered columns, aisles, rubble, broken altars, and sacred icon debris.',
    stylePreset: 'temple-ruins',
    generationDefaults: { room_count: 8, corridor_width_cells: 2, obstacle_density: 0.19, hazard_density: 0.07 },
  },
  {
    id: 'city_sewers_tunnels',
    label: 'City Sewers/Tunnels',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'Claustrophobic channels and maintenance tunnels produce hard chokepoints, flanking loops, and movement hazards.',
    biome: 'cavern',
    storyPrompt: 'City sewers and tunnels with narrow walkways, runoff channels, slime, culverts, and low-visibility intersections.',
    stylePreset: 'sewer-tunnels',
    generationDefaults: { room_count: 7, corridor_width_cells: 1, obstacle_density: 0.15, hazard_density: 0.18 },
  },
  {
    id: 'warehouse_storage_room',
    label: 'Warehouse/Storage Room',
    groupId: 'urban',
    groupLabel: URBAN_GROUP,
    description: 'Dense obstacle play with stacked goods, lanes between shelves, and plenty of partial cover.',
    biome: 'village',
    storyPrompt: 'A warehouse or storage room packed with shelves, crate rows, loading space, and narrow aisle movement.',
    stylePreset: 'warehouse-storage',
    generationDefaults: { room_count: 8, corridor_width_cells: 2, obstacle_density: 0.24, hazard_density: 0.03 },
  },
  {
    id: 'abandoned_ruined_village',
    label: 'Abandoned/Ruined Village',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'Broken structures and street remnants create medium-range lanes with lots of irregular cover and exposed transitions.',
    biome: 'village',
    storyPrompt: 'An abandoned ruined village with collapsed cottages, broken fences, empty lanes, and scattered debris cover.',
    stylePreset: 'ruined-village',
    generationDefaults: { room_count: 9, corridor_width_cells: 2, obstacle_density: 0.18, hazard_density: 0.06 },
  },
  {
    id: 'ancient_tomb_crypt',
    label: 'Ancient Tomb/Crypt',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'A confined burial complex with chambers, sarcophagi, and ritual hazards. Good for trap pressure and room-to-room pacing.',
    biome: 'crypt',
    storyPrompt: 'An ancient tomb or crypt with burial chambers, stone corridors, sealed niches, and ominous ritual geometry.',
    stylePreset: 'ancient-crypt',
    generationDefaults: { room_count: 9, corridor_width_cells: 1, obstacle_density: 0.17, hazard_density: 0.14 },
  },
  {
    id: 'magical_library_wizard_tower',
    label: 'Magical Library/Wizard Tower',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'Vertical-feeling study spaces, stacks, and arcane clutter make for a dense tactical interior with magical focal points.',
    biome: 'custom',
    storyPrompt: 'A magical library or wizard tower interior with book stacks, ritual circles, study chambers, and unstable arcane zones.',
    stylePreset: 'wizard-library',
    generationDefaults: { room_count: 8, corridor_width_cells: 2, obstacle_density: 0.21, hazard_density: 0.1 },
  },
  {
    id: 'caves_caverns_lava_water',
    label: 'Caves/Caverns (with lava/water)',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'Natural chambers linked by narrow passages and environmental hazards. Strong for movement denial and line-of-sight breaks.',
    biome: 'cavern',
    storyPrompt: 'Caves and caverns with lava or water channels, uneven rock shelves, narrow passages, and volatile hazard pockets.',
    stylePreset: 'caverns-hazards',
    generationDefaults: { room_count: 7, corridor_width_cells: 1, obstacle_density: 0.2, hazard_density: 0.2 },
  },
  {
    id: 'castle_courtyard_fortress_gate',
    label: 'Castle Courtyard/Fortress Gate',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'A fortified approach with gatehouse pressure, lanes of advance, and hard-cover defensive geometry.',
    biome: 'dungeon',
    storyPrompt: 'A castle courtyard and fortress gate with walls, inner yard obstacles, defensive positions, and a strong central approach.',
    stylePreset: 'fortress-gate',
    generationDefaults: { room_count: 7, corridor_width_cells: 2, obstacle_density: 0.15, hazard_density: 0.08 },
  },
  {
    id: 'bank_vault_room',
    label: 'Bank/Vault Room',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'A compact high-security interior with chokepoints, secure rooms, and concentrated obstacle play.',
    biome: 'dungeon',
    storyPrompt: 'A bank or vault room with reinforced chambers, heavy doors, guard positions, and tightly controlled access lanes.',
    stylePreset: 'vault-room',
    generationDefaults: { room_count: 6, corridor_width_cells: 1, obstacle_density: 0.19, hazard_density: 0.05 },
  },
  {
    id: 'airship_sea_vessel_deck',
    label: 'Airship/Sea Vessel Deck',
    groupId: 'dungeon_interior',
    groupLabel: DUNGEON_GROUP,
    description: 'A constrained deck plan with rigging, cargo, and overboard danger. Ideal for mobile skirmishes and forced positioning.',
    biome: 'custom',
    storyPrompt: 'An airship or sea vessel deck with rigging, cargo stacks, masts, gangways, and dangerous open edges.',
    stylePreset: 'vessel-deck',
    generationDefaults: { room_count: 6, corridor_width_cells: 2, obstacle_density: 0.18, hazard_density: 0.11 },
  },
] as const

export function getVectorMapPresetById(id: string | undefined): VectorMapPresetDefinition {
  if (!id) {
    return VECTOR_MAP_PRESETS.find((preset) => preset.id === DEFAULT_VECTOR_MAP_PRESET_ID) ?? VECTOR_MAP_PRESETS[0]!
  }
  return VECTOR_MAP_PRESETS.find((preset) => preset.id === id) ?? VECTOR_MAP_PRESETS[0]!
}