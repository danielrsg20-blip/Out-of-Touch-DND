/**
 * generators/dungeon.js
 * All underground/indoor map generators.
 *
 * Generation approach:
 *   - BSP-inspired room placement with overlap rejection
 *   - MST (minimum spanning tree) corridor routing for full connectivity
 *   - Extra loop corridors for dungeon "loopiness"
 *   - Doors placed at corridor mouths; features distributed per room
 *
 * Each generator shares the same cfg object:
 *   { minW, maxW, minH, maxH, cw (corridor width), cR (circle radius),
 *     mapW, mapH }
 */

'use strict';

const ROOM_NAMES = [
  'Guard Room', 'Storage', 'Barracks', 'Armory', 'Study', 'Shrine',
  'Prison Cell', 'Torture Chamber', 'Alchemy Lab', 'Vault',
  'Crypt', 'Mess Hall', 'Guardpost', 'Reliquary',
];

const MAP_CFGS = {
  sm: { minW: 48,  maxW: 96,  minH: 48,  maxH: 96,  cw: 24, cR: 28, mapW: 600,  mapH: 500  },
  md: { minW: 64,  maxW: 144, minH: 64,  maxH: 144, cw: 32, cR: 36, mapW: 900,  mapH: 700  },
  lg: { minW: 80,  maxW: 200, minH: 80,  maxH: 200, cw: 40, cR: 50, mapW: 1300, mapH: 1000 },
};

// ── Place dungeon rooms (mix of rects and circles) ───────────
function placeDungeonRooms(rng, cfg, count) {
  const placed = [];
  for (let a = 0; placed.length < count && a < count * 10; a++) {
    if (rng.next() > 0.5) {
      // Circular room
      const r  = rng.int(cfg.cR, Math.round(cfg.cR * 1.7));
      const cx = rng.int(r + 10, cfg.mapW - r - 10);
      const cy = rng.int(r + 10, cfg.mapH - r - 10);
      const fake = { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, cx, cy, r, circ: true };
      if (!overlaps(cx - r, cy - r, r * 2, r * 2, placed)) placed.push(fake);
    } else {
      // Rectangular room
      const w = rng.int(cfg.minW, cfg.maxW), h = rng.int(cfg.minH, cfg.maxH);
      const x = rng.int(10, cfg.mapW - w - 10), y = rng.int(10, cfg.mapH - h - 10);
      const fake = { x1: x, y1: y, x2: x + w, y2: y + h, x, y, w, h, circ: false };
      if (!overlaps(x, y, w, h, placed)) placed.push(fake);
    }
  }
  return placed;
}

// ── MST + loop corridor routing ──────────────────────────────
function routeCorridors(placed, ents, cfg, rng, corridorOpts = {}) {
  // MST: connect each room to its nearest already-connected neighbor
  const conn = [0];
  for (let i = 1; i < ents.length; i++) {
    let best = 0, bd = Infinity;
    for (const j of conn) {
      const dd = d2(ents[i], ents[j]);
      if (dd < bd) { bd = dd; best = j; }
    }
    conn.push(i);
    const [ax, ay] = rCenter(ents[i]);
    const [bx, by] = rCenter(ents[best]);
    connectC(ax, ay, bx, by, cfg.cw, rng, corridorOpts);
  }
  // Extra loop corridors (~30% of room count)
  for (let k = 0; k < Math.floor(ents.length * 0.3); k++) {
    const a = rng.int(0, ents.length - 1), b = rng.int(0, ents.length - 1);
    if (a !== b) {
      const [ax, ay] = rCenter(ents[a]);
      const [bx, by] = rCenter(ents[b]);
      connectC(ax, ay, bx, by, cfg.cw, rng, corridorOpts);
    }
  }
}

// ════════════════════════════════════════════════════════════
// GENERATORS
// ════════════════════════════════════════════════════════════

function dungeon(rng, cfg, count) {
  add(mkBg(-60, -60, cfg.mapW + 120, cfg.mapH + 120));

  const placed = placeDungeonRooms(rng, cfg, count);
  const ents   = [];

  for (let i = 0; i < placed.length; i++) {
    const p   = placed[i];
    const isE = i === 0, isB = i === placed.length - 1;
    const lbl = isE ? 'Entrance'
              : isB ? 'Boss Chamber'
              : rng.next() > 0.6 ? ROOM_NAMES[rng.int(0, ROOM_NAMES.length - 1)]
              : '';
    const special = isE ? 'entrance' : isB ? 'boss' : null;

    let re;
    if (p.circ) re = add(mkRoomCircle(p.cx, p.cy, p.r, lbl, { special }));
    else        re = add(mkRoomRect(p.x, p.y, p.w, p.h, lbl, { special }));
    ents.push(re);

    if (rng.next() > 0.45) rFeat(re, rng);
    if (isE || isB) {
      const [cx, cy] = rCenter(re);
      add(mkStairs(cx - 24, cy + 10, 48, 28));
    }
  }

  routeCorridors(placed, ents, cfg, rng);

  // Doors at corridor mouths
  for (const e of scene.entities.filter(e => e.type === 'corr')) {
    if (rng.next() > 0.5) {
      const horiz = Math.abs(e.x2 - e.x1) > Math.abs(e.y2 - e.y1);
      add(mkDoor(e.x1, e.y1, horiz, rng.next() > 0.85));
    }
  }
}

function cavern(rng, cfg, count) {
  add(mkBg(-60, -60, cfg.mapW + 120, cfg.mapH + 120));

  const placed = [], ents = [];
  for (let a = 0; placed.length < count && a < count * 10; a++) {
    const r  = rng.int(cfg.cR, Math.round(cfg.cR * 2.2));
    const cx = rng.int(r + 20, cfg.mapW - r - 20);
    const cy = rng.int(r + 20, cfg.mapH - r - 20);
    const fake = { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, cx, cy, r };
    if (!overlaps(cx - r, cy - r, r * 2, r * 2, placed, 8)) placed.push(fake);
  }

  for (const p of placed) {
    const e = add(mkRoomCircle(p.cx, p.cy, p.r, '', { wallColor: '#8a7a62', wallT: 10 }));
    if (rng.next() > 0.5) rFeat(e, rng);
    ents.push(e);
  }

  // Water pools
  for (let i = 0; i < 3; i++) {
    add(mkWater(rng.int(40, cfg.mapW - 120), rng.int(40, cfg.mapH - 80),
                rng.int(40, 90), rng.int(30, 60)));
  }

  // MST corridors
  const conn = [0];
  for (let i = 1; i < placed.length; i++) {
    let best = 0, bd = Infinity;
    for (const j of conn) { const dd = d2(placed[i], placed[j]); if (dd < bd) { bd = dd; best = j; } }
    conn.push(i);
    connectC(placed[i].cx, placed[i].cy, placed[best].cx, placed[best].cy,
             cfg.cw * rng.int(6, 9) / 8, rng, { wallColor: '#8a7a62' });
  }
}

function tavern(rng, cfg) {
  const bw = rng.int(260, 360), bh = rng.int(220, 300), bx = 80, by = 60;
  add(mkBg(bx - 40, by - 40, bw + 80, bh + 80));

  const nH = Math.floor(bh * 0.55);
  add(mkRoomRect(bx,      by,      bw,              bh,          'The Tavern',  { wallT: 10 }));
  add(mkRoomRect(bx + 14, by + 14, bw - 28,         nH,          'Common Room', { wallT: 6 }));
  add(mkRoomRect(bx + 14, by + 14 + nH + 6, Math.floor(bw * 0.4), bh - nH - 42, 'Kitchen', { wallT: 6 }));

  const barX = bx + 14 + Math.floor(bw * 0.4) + 6;
  const barW = bw - 28 - Math.floor(bw * 0.4) - 6;
  add(mkRoomRect(barX, by + 14 + nH + 6, barW, Math.floor(bh * 0.22), 'Bar',     { wallT: 6 }));
  add(mkRoomRect(barX, by + 14 + nH + 6 + Math.floor(bh * 0.22) + 6, barW,
                 bh - nH - Math.floor(bh * 0.22) - 54, 'Storage', { wallT: 6 }));

  add(mkDoor(bx + bw / 2, by + bh, true));
  add(mkStairs(bx + bw - 70, by + bh - 50, 48, 28));
  add(mkFeature(bx + bw * 0.3, by + nH * 0.5, 'barrel'));
  add(mkFeature(bx + bw * 0.65, by + nH * 0.5, 'candle'));
}

function temple(rng, cfg) {
  const bw = rng.int(240, 320), bh = rng.int(320, 420), bx = 80, by = 40;
  add(mkBg(bx - 40, by - 40, bw + 80, bh + 80));

  const wc = '#7a7050', nH = Math.floor(bh * 0.5);
  add(mkRoomRect(bx, by, bw, bh, 'Temple', { wallT: 10, wallColor: wc }));
  add(mkRoomRect(bx + 20, by + 20, bw - 40, nH, 'Nave', { wallT: 6, wallColor: wc }));
  add(mkRoomCircle(bx + bw / 2, by + 20 + nH + Math.floor(bh * 0.12),
                   Math.floor(bh * 0.12), 'Apse', { wallT: 8, wallColor: wc }));
  add(mkRoomRect(bx + 20, by + 20 + nH + Math.floor(bh * 0.28),
                 bw - 40, bh - nH - Math.floor(bh * 0.28) - 40, 'Vestry', { wallT: 6, wallColor: wc }));
  // Side aisles
  add(mkRoomRect(bx + 10,      by + 20, 14, nH, '', { wallT: 4, wallColor: wc }));
  add(mkRoomRect(bx + bw - 24, by + 20, 14, nH, '', { wallT: 4, wallColor: wc }));

  add(mkDoor(bx + bw / 2, by, false));
  add(mkStairs(bx + bw / 2 - 24, by + bh - 50, 48, 28));
  add(mkFeature(bx + bw / 2,   by + 20 + nH + Math.floor(bh * 0.12), 'altar'));
  add(mkFeature(bx + bw * 0.3, by + 20 + nH * 0.5, 'candle'));
  add(mkFeature(bx + bw * 0.7, by + 20 + nH * 0.5, 'candle'));
  add(mkFeature(bx + bw * 0.5, by + 20 + nH * 0.5, 'star'));
}

function wizardTower(rng, cfg) {
  const floors = 4, baseR = rng.int(70, 100), shrink = 10, by = 40, bx = 80 + baseR;
  add(mkBg(bx - baseR - 40, by - 40, baseR * 2 + 80, (baseR * 2 + 20) * floors + 80));

  const lbls = ['Ground Floor', 'Library', 'Laboratory', 'Observatory'];
  const fts  = ['barrel', 'altar', 'star', 'ritual'];

  for (let f = 0; f < floors; f++) {
    const r = baseR - f * shrink, fy = by + f * (r * 2 + 20) + r;
    add(mkRoomCircle(bx, fy, r, lbls[f], { wallT: 8, wallColor: '#6a5880' }));
    add(mkFeature(bx, fy, fts[f]));
    if (f < floors - 1) add(mkStairs(bx - 24, fy + r - 30, 48, 28));
  }
  add(mkDoor(bx, by + baseR, false));
}

function crypt(rng, cfg, count) {
  add(mkBg(-60, -60, cfg.mapW + 120, cfg.mapH + 120));

  const mW = rng.int(180, 260), mH = rng.int(160, 220);
  const mx = cfg.mapW / 2 - mW / 2, my = cfg.mapH / 2 - mH / 2;
  add(mkRoomRect(mx, my, mW, mH, 'Burial Chamber', { wallT: 10, wallColor: '#6a608a' }));
  add(mkStairs(mx + mW / 2 - 24, my + 16, 48, 28));
  add(mkFeature(mx + mW / 2, my + mH / 2, 'ritual'));

  for (let i = 0; i < rng.int(4, 8); i++) {
    const side = rng.int(0, 3), aw = rng.int(28, 52), ah = rng.int(22, 36);
    let ax, ay;
    if      (side === 0) { ax = rng.int(mx + 10, mx + mW - aw - 10); ay = my - ah - 6; }
    else if (side === 1) { ax = rng.int(mx + 10, mx + mW - aw - 10); ay = my + mH + 6; }
    else if (side === 2) { ax = mx - aw - 6; ay = rng.int(my + 10, my + mH - ah - 10); }
    else                 { ax = mx + mW + 6;  ay = rng.int(my + 10, my + mH - ah - 10); }
    add(mkRoomRect(ax, ay, aw, ah, 'Crypt', { wallT: 6, wallColor: '#6a608a' }));
    add(mkDoor(ax + aw / 2, ay + ah / 2, side < 2, rng.next() > 0.65));
  }
}

function mine(rng, cfg, count) {
  add(mkBg(-60, -60, cfg.mapW + 120, cfg.mapH + 120));
  const sx = cfg.mapW / 2;
  add(mkCorridor(sx, 40, sx, cfg.mapH - 40, cfg.cw, { wallColor: '#7a6840' }));

  const ores = ['Iron Vein', 'Gold Seam', 'Mithral Lode', 'Empty Cavern', 'Kobold Nest'];
  for (let i = 0; i < count; i++) {
    const y    = 40 + (cfg.mapH - 80) * (i + 1) / (count + 1);
    const side = i % 2 === 0 ? -1 : 1;
    const ex   = sx + side * rng.int(80, cfg.mapW * 0.35);
    add(mkCorridor(sx, y, ex, y, cfg.cw * 0.75, { wallColor: '#7a6840' }));
    const rw = rng.int(56, 110), rh = rng.int(44, 88);
    const re = add(mkRoomRect(ex + (side > 0 ? 4 : -rw - 4), y - rh / 2, rw, rh,
                              ores[rng.int(0, 4)], { wallT: 7, wallColor: '#7a6840' }));
    add(mkFeature(re.x + re.w / 2, re.y + re.h / 2, rng.next() > 0.5 ? 'barrel' : 'candle'));
  }
  add(mkStairs(sx - 16, 44, 32, 20));
}

function sewer(rng, cfg, count) {
  add(mkBg(-60, -60, cfg.mapW + 120, cfg.mapH + 120));
  const placed = [], ents = [];

  for (let a = 0; placed.length < count && a < count * 10; a++) {
    const w = rng.int(cfg.minW, Math.round(cfg.maxW * 0.7));
    const h = rng.int(cfg.minH, Math.round(cfg.maxH * 0.7));
    const x = rng.int(0, cfg.mapW - w), y = rng.int(0, cfg.mapH - h);
    const fake = { x1: x, y1: y, x2: x + w, y2: y + h, x, y, w, h };
    if (!overlaps(x, y, w, h, placed, 10)) placed.push(fake);
  }

  for (const p of placed) {
    ents.push(add(mkRoomRect(p.x, p.y, p.w, p.h, '', { wallT: 7, wallColor: '#507050' })));
  }

  // MST corridors
  for (let i = 1; i < ents.length; i++) {
    let best = 0, bd = Infinity;
    for (let j = 0; j < i; j++) { const dd = d2(ents[i], ents[j]); if (dd < bd) { bd = dd; best = j; } }
    const [ax, ay] = rCenter(ents[i]), [bx, by] = rCenter(ents[best]);
    connectC(ax, ay, bx, by, Math.round(cfg.cw * 0.65), rng, { wallColor: '#507050' });
  }

  // Water channels in some rooms
  for (let i = 0; i < Math.min(4, placed.length); i++) {
    add(mkWater(placed[i].x + placed[i].w * 0.2, placed[i].y + placed[i].h * 0.2,
                placed[i].w * 0.6, placed[i].h * 0.5));
  }
}

// ── Main generator dispatcher ────────────────────────────────
function generateMap() {
  const type  = document.getElementById('gen-type').value;
  const count = +document.getElementById('gen-rooms').value;
  const size  = document.getElementById('gen-size').value;
  const si    = document.getElementById('gen-seed').value.trim();
  const raw   = si ? (parseInt(si) || hashStr(si)) : undefined;
  const rng   = mkRng(raw);

  scene.seed  = rng.seed;
  scene.title = document.getElementById('map-title').value || 'Unnamed Dungeon';

  document.getElementById('seed-badge').textContent = scene.seed;
  document.getElementById('gen-seed').value         = scene.seed;

  saveHist();
  scene.entities = [];
  scene.nextId   = 1;

  const cfg = MAP_CFGS[size];
  const generators = { dungeon, cavern, tavern, temple, tower: wizardTower, crypt, mine, sewer };

  if (generators[type]) {
    generators[type](rng, cfg, count);
  } else {
    // Outdoor generators live in generators/outdoor.js
    const outdoorGens = { village: genVillage, campsite: genCampsite };
    if (outdoorGens[type]) outdoorGens[type](rng, cfg, count);
  }

  fitView();
  render();
}
