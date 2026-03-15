/**
 * palette.js
 * All color constants for both dungeon (P) and outdoor/forest (F) palettes.
 *
 * Dungeon palette follows the cartographic guide:
 *   background = wall stone; floors are cut out on top.
 *
 * Outdoor palette uses a tight 6-stop green ramp per the forest guide,
 *   with warm dirt/stone support colors.
 */

'use strict';

// ── Dungeon / stone palette ──────────────────────────────────
const P = {
  wall:   '#6b6b7a',   // background stone (canvas fill = walls)
  wallW:  '#7a6a52',   // warm-brown wall ring
  floor:  '#c8d4b0',   // pale sage green floor
  grid:   '#aab898',   // grid lines over floor
  water:  '#6aabcc',   // water
  wood:   '#9a7a50',   // wood — doors, barrels
  gold:   '#d4b860',   // gold — flames, locks, candles
  dark:   '#2a1e10',   // title banner background
  darkW:  '#4a3a28',   // label ink / dark stroke
  stone2: '#8a8a9a',   // lighter stone variant (altars)
};

// ── Outdoor / forest palette (6-stop ramp) ───────────────────
const F = {
  shadow:   '#2a5a20',  // deep shadow canopy
  mid1:     '#3a6a28',  // mid canopy
  mid2:     '#4a7a30',  // light canopy
  hi1:      '#5a8a38',  // highlight canopy
  hi2:      '#6a9a40',  // bright highlight
  grass:    '#5a8a40',  // base grass (canvas fill for outdoor)
  dirt:     '#8a7050',  // clearing dirt
  dirt2:    '#7a6848',  // darker dirt variant
  darkDirt: '#6a5838',  // dark soil patches
  stain:    '#5a3828',  // blood/rot stain patches
  stone:    '#5a5248',  // stone path
  stone2:   '#6a6258',  // stone path lighter
  log:      '#5a3a20',  // log body
  logHi:    '#7a5a38',  // log highlight
  grid:     '#4a7a3a',  // grid lines (outdoor)
  trunk:    '#2a4018',  // trunk dots under canopy
};
