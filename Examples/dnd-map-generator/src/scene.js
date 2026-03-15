/**
 * scene.js
 * Core data model: scene graph, layer definitions, and all entity factory
 * functions.
 *
 * Entity design principles:
 *  - Dungeon rooms use the "two-shape" technique: outer shape = wall color,
 *    inner shape (inset by wallT) = floor color. Background IS the walls.
 *  - Corridors are floor-colored rectangles with thick wall-colored strokes
 *    on their long edges only.
 *  - Outdoor entities carry all data needed for the layered-painter renderer.
 */

'use strict';

// ── Layer definitions ────────────────────────────────────────
const LAYERS = [
  { id: 'bg',       name: 'Background', color: '#6b6b7a', visible: true  },
  { id: 'floors',   name: 'Floors',     color: '#c8d4b0', visible: true  },
  { id: 'grid',     name: 'Grid Lines', color: '#aab898', visible: true  },
  { id: 'walls',    name: 'Wall Lines', color: '#7a6a52', visible: true  },
  { id: 'features', name: 'Features',   color: '#d4b860', visible: true  },
  { id: 'labels',   name: 'Labels',     color: '#cc88ff', visible: true  },
];

// ── Global scene state ───────────────────────────────────────
const scene = {
  entities: [],
  nextId:   1,
  seed:     null,
  title:    'Dungeon of Vaelthar',
};

// ── Scene helpers ────────────────────────────────────────────
function add(e)   { scene.entities.push(e); return e; }
function isOutdoor() {
  return scene.entities.some(e => e.type === 'outdoor');
}

// ════════════════════════════════════════════════════════════
// DUNGEON ENTITY FACTORIES
// ════════════════════════════════════════════════════════════

/** Rectangular room — two-rect wall technique */
function mkRoomRect(x, y, w, h, label = '', o = {}) {
  return {
    id: scene.nextId++, type: 'room-r', layer: 'floors',
    x, y, w, h, label,
    wallColor:  o.wallColor  || P.wallW,
    floorColor: o.floorColor || P.floor,
    wallT:      o.wallT      || 8,
    special:    o.special    || null,
  };
}

/** Circular room — two-circle wall technique */
function mkRoomCircle(cx, cy, r, label = '', o = {}) {
  return {
    id: scene.nextId++, type: 'room-c', layer: 'floors',
    cx, cy, r, label,
    wallColor:  o.wallColor  || P.wallW,
    floorColor: o.floorColor || P.floor,
    wallT:      o.wallT      || 8,
    special:    o.special    || null,
  };
}

/** Corridor — floor polygon + thick wall-color edge strokes */
function mkCorridor(x1, y1, x2, y2, width = 32, o = {}) {
  return {
    id: scene.nextId++, type: 'corr', layer: 'floors',
    x1, y1, x2, y2, width,
    floorColor: o.floorColor || P.floor,
    wallColor:  o.wallColor  || P.wallW,
  };
}

/** Explicit wall line (for manual drawing) */
function mkWall(x1, y1, x2, y2, o = {}) {
  return {
    id: scene.nextId++, type: 'wall', layer: 'walls',
    x1, y1, x2, y2,
    color:  o.color  || P.wallW,
    lw:     o.lw     || 3,
    dashed: o.dashed || false,
  };
}

/** Door symbol */
function mkDoor(x, y, horiz = true, secret = false) {
  return { id: scene.nextId++, type: 'door', layer: 'features', x, y, horiz, secret };
}

/** Staircase symbol */
function mkStairs(x, y, w = 48, h = 28, o = {}) {
  return {
    id: scene.nextId++, type: 'stairs', layer: 'features',
    x, y, w, h, color: o.color || P.wallW,
  };
}

/**
 * Feature symbol — kind is one of:
 *   chest | altar | well | bars | barrel | candle | pool | star | ritual
 */
function mkFeature(x, y, kind) {
  return { id: scene.nextId++, type: 'feature', layer: 'features', x, y, kind };
}

/** Serif-italic cartographic label */
function mkLabel(x, y, text, size = 9, o = {}) {
  return {
    id: scene.nextId++, type: 'label', layer: 'labels',
    x, y, text, size, color: o.color || P.darkW,
  };
}

/** Stone-colored background rectangle (fills area with wall color) */
function mkBg(x, y, w, h) {
  return { id: scene.nextId++, type: 'bg', layer: 'bg', x, y, w, h };
}

/** Water area */
function mkWater(x, y, w, h) {
  return { id: scene.nextId++, type: 'water', layer: 'floors', x, y, w, h };
}

// ════════════════════════════════════════════════════════════
// OUTDOOR ENTITY FACTORIES
// ════════════════════════════════════════════════════════════

/**
 * Outdoor scene background — stores the bounding rect for the grass fill,
 * grass-blade texture, and grid overlay. Must be the first entity for
 * outdoor maps.
 */
function mkOutdoorScene(data) {
  return { id: scene.nextId++, type: 'outdoor', layer: 'bg', data };
}

/**
 * Stone path — flat pts array [startX,startY, qcx,qcy,ex,ey, ...]
 * Rendered 3× at decreasing widths for shadow/base/texture depth.
 */
function mkOutdoorPath(pts, o = {}) {
  return {
    id: scene.nextId++, type: 'opath', layer: 'floors',
    pts, color: o.color || F.stone, width: o.width || 28, kind: o.kind || 'stone',
  };
}

/**
 * Tree cluster — array of circle descriptors {cx,cy,r,fill,a} plus
 * an optional jagged edge path and a trunk dot position.
 */
function mkTreeCluster(circles, trunkX, trunkY) {
  return { id: scene.nextId++, type: 'trees', layer: 'features', circles, trunkX, trunkY };
}

/** Central clearing — layered ellipses with soft grassy border */
function mkClearing(cx, cy, rx, ry) {
  return { id: scene.nextId++, type: 'clearing', layer: 'floors', cx, cy, rx, ry };
}

/** Fern — 5 radiating lines from a single base point */
function mkFern(x, y) {
  return { id: scene.nextId++, type: 'fern', layer: 'features', x, y };
}

/** Fallen log — drawn twice (body + highlight) with end circles */
function mkLog(x1, y1, x2, y2) {
  return { id: scene.nextId++, type: 'log', layer: 'features', x1, y1, x2, y2 };
}

/** Cave entrance — two ellipses (fill + stroke rim) */
function mkCave(x, y, rx, ry) {
  return { id: scene.nextId++, type: 'cave', layer: 'features', x, y, rx, ry };
}

/** Loose stone alongside a path */
function mkLooseStone(x, y, rx, ry) {
  return { id: scene.nextId++, type: 'looseStone', layer: 'features', x, y, rx, ry };
}
