/**
 * main.js
 * Application entry point.
 *
 * Responsibilities:
 *   - Grab DOM references and assign module-level canvas vars
 *   - Wire up resize handler
 *   - Initialize pen defaults
 *   - Build UI (layers, swatches)
 *   - Attach input listeners
 *   - Seed history and generate initial map
 *
 * Load order (from index.html):
 *   palette.js → scene.js → history.js → grid.js → dungeon.js (render) →
 *   outdoor.js (render) → renderer.js → shared.js → dungeon.js (gen) →
 *   outdoor.js (gen) → input.js → ui.js → export.js → main.js
 */

'use strict';

// ── DOM references assigned to module-level vars in renderer.js ──
const wrap = document.getElementById('canvas-wrap');

window.addEventListener('DOMContentLoaded', () => {
  // Assign canvas references used by renderer.js
  mc    = document.getElementById('map-canvas');
  uc    = document.getElementById('ui-canvas');
  mmc   = document.getElementById('mm-canvas');
  ctx   = mc.getContext('2d');
  uctx  = uc.getContext('2d');
  mmctx = mmc.getContext('2d');

  // Default pen colors
  pen.stroke = P.wallW;
  pen.fill   = P.floor;

  // Initialise outdoor generator function aliases used in dungeon.js
  // (outdoor gens live in generators/outdoor.js, referenced by name)
  window.genVillage  = genVillage;
  window.genCampsite = genCampsite;

  // Build UI
  buildLayers();
  buildSwatches();

  // Input
  attachInputListeners();

  // History + initial map
  saveHist();
  generateMap();

  // Resize on window change
  window.addEventListener('resize', resize);
  resize();
});
