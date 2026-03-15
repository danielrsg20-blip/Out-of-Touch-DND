/**
 * generators/outdoor.js
 * Outdoor map generators: Forest Campsite and Village Block.
 *
 * Both use the layered-painter approach from the forest guide:
 *   1. Grass base (mkOutdoorScene)
 *   2. Stone path (mkOutdoorPath — 3-stroke technique)
 *   3. Dense forest masses + inner bush ring (buildForestRing)
 *   4. Central clearing (mkClearing — layered ellipses)
 *   5. Interior details: ferns, logs, cave, features
 *   6. Labels
 *
 * Buildings in the village are placed on the cleared ground using
 * dungeon room entities so they render with the wall/floor technique.
 */

'use strict';

// ── Forest Campsite ──────────────────────────────────────────
function genCampsite(rng, cfg) {
  const mapW = cfg.mapW, mapH = cfg.mapH;
  const cx = mapW / 2, cy = mapH / 2;

  // Layer 1: grass base + grid
  add(mkOutdoorScene({ x: -60, y: -60, w: mapW + 120, h: mapH + 120 }));

  // Layer 2: stone path entering from the west edge
  // pts format: startX,startY, qcx,qcy,ex,ey, qcx,qcy,ex,ey, ...
  const pathPts = [
    0,       cy + rng.int(-20, 20),
    cx * 0.25, cy + rng.int(-30, 30),  cx * 0.5,  cy + rng.int(-20, 20),
    cx * 0.75, cy + rng.int(-15, 15),  cx,          cy,
  ];
  const looseStones = [];
  for (let i = 0; i < 14; i++) {
    const t  = rng.next();
    const px = t * cx, py = cy + rng.int(-40, 40);
    looseStones.push({
      x: px + rng.int(-18, 18), y: py + rng.int(-8, 8),
      rx: rng.int(3, 6), ry: rng.int(2, 4), a: rng.next() * 0.6,
      c: rng.next() > 0.5 ? F.stone : F.stone2,
    });
  }
  add({ ...mkOutdoorPath(pathPts, { width: 28, kind: 'stone' }), looseStones });

  // Layers 3–4: forest ring + inner bush ring
  const clearRx = rng.int(120, 150), clearRy = rng.int(100, 130);
  buildForestRing(cx, cy, clearRx, clearRy, 10, rng, mapW, mapH);

  // Layer 5: central clearing — layered ellipses
  const dirtDots = [];
  for (let i = 0; i < 30; i++) {
    dirtDots.push({
      x: cx + rng.int(-clearRx, clearRx) * 0.8,
      y: cy + rng.int(-clearRy, clearRy) * 0.8,
      r: rng.int(2, 8), a: rng.int(15, 45) / 100,
    });
  }
  const patches = [
    { cx: cx + rng.int(-40, 40), cy: cy + rng.int(-30, 30), rx: rng.int(30, 60), ry: rng.int(20, 45), rot: rng.next(), c: F.dirt2,    a: 0.4  },
    { cx: cx + rng.int(-50, 50), cy: cy + rng.int(-40, 40), rx: rng.int(20, 40), ry: rng.int(15, 35), rot: rng.next(), c: F.darkDirt, a: 0.35 },
    { cx: cx + rng.int(-30, 30), cy: cy + rng.int(-20, 20), rx: rng.int(15, 30), ry: rng.int(10, 25), rot: rng.next(), c: F.stain,    a: 0.28 },
  ];
  add({ ...mkClearing(cx, cy, clearRx, clearRy), dirtDots, patches });

  // Layer 6a: ferns around clearing interior edge
  const fernCount = rng.int(8, 12);
  const avgR = (clearRx + clearRy) / 2;
  for (let i = 0; i < fernCount; i++) {
    const a   = rng.next() * Math.PI * 2;
    const d   = avgR * rng.int(55, 88) / 100;
    add(mkFern(cx + Math.cos(a) * d * (clearRx / avgR),
               cy + Math.sin(a) * d * (clearRy / avgR)));
  }

  // Layer 6b: cave entrance at tree-line edge
  const caveAngle = rng.next() * Math.PI * 2;
  const caveDist  = avgR * 1.05;
  add(mkCave(cx + Math.cos(caveAngle) * caveDist * (clearRx / avgR),
             cy + Math.sin(caveAngle) * caveDist * (clearRy / avgR), 14, 11));

  // Layer 6c: two crossed fallen logs
  const la  = rng.next() * Math.PI * 0.5;
  const logLen = rng.int(50, 80);
  const lx = cx + rng.int(-40, 40), ly = cy + rng.int(-30, 30);
  add(mkLog(lx - Math.cos(la) * logLen / 2, ly - Math.sin(la) * logLen / 2,
            lx + Math.cos(la) * logLen / 2, ly + Math.sin(la) * logLen / 2));
  const lb = la + rng.int(30, 60) * Math.PI / 180;
  add(mkLog(lx + 8 - Math.cos(lb) * logLen * 0.6, ly + 8 - Math.sin(lb) * logLen * 0.6,
            lx + 8 + Math.cos(lb) * logLen * 0.6, ly + 8 + Math.sin(lb) * logLen * 0.6));

  // Campfire at center (pool + candle)
  add(mkFeature(cx, cy, 'pool'));
  add(mkFeature(cx, cy, 'candle'));
  add(mkLabel(cx, cy + 28, 'Campfire', 8, { color: P.gold }));

  // Tents as small room-r entities (use dungeon room renderer)
  for (const a of [0, 60, 120, 180, 240, 300]) {
    const tr = clearRx * 0.62;
    const tx = cx + tr * Math.cos(a * Math.PI / 180) * (clearRx / avgR);
    const ty = cy + tr * Math.sin(a * Math.PI / 180) * (clearRy / avgR);
    add(mkRoomRect(tx - 18, ty - 14, 36, 28, 'Tent', { wallT: 5, wallColor: '#9a7850', floorColor: '#b89060' }));
  }

  add(mkLabel(cx, cy - clearRy - 28, scene.title || 'Forest Campsite', 10, { color: P.dark }));
}

// ── Village Block ────────────────────────────────────────────
function genVillage(rng, cfg) {
  const mapW = cfg.mapW, mapH = cfg.mapH;
  const cx = mapW / 2, cy = mapH / 2;

  // Layer 1: grass base
  add(mkOutdoorScene({ x: -60, y: -60, w: mapW + 120, h: mapH + 120 }));

  // Layer 2: two crossing stone roads
  const roadW = rng.int(26, 34);
  add(mkOutdoorPath([
    cx, 0,
    cx + rng.int(-8, 8), cy * 0.5,   cx + rng.int(-6, 6), cy,
    cx + rng.int(-8, 8), cy * 1.5,   cx,                   mapH,
  ], { width: roadW }));
  add(mkOutdoorPath([
    0, cy,
    cx * 0.5,  cy + rng.int(-6, 6),  cx,       cy + rng.int(-8, 8),
    cx * 1.5,  cy + rng.int(-6, 6),  mapW,      cy + rng.int(-8, 8),
  ], { width: roadW }));

  // Loose stones along roads
  for (let i = 0; i < 20; i++) {
    add(mkLooseStone(rng.int(cx - roadW * 3, cx + roadW * 3), rng.int(0, mapH),
                     rng.int(3, 5), rng.int(2, 4)));
  }

  // Layers 3–4: border forest ring
  buildForestRing(cx, cy, mapW * 0.52, mapH * 0.52, 8, rng, mapW, mapH);

  // Layer 5: central village green (cleared area)
  const clearRx = rng.int(160, 200), clearRy = rng.int(130, 170);
  const avgR = (clearRx + clearRy) / 2;
  const dirtDots = [];
  for (let i = 0; i < 20; i++) {
    dirtDots.push({
      x: cx + rng.int(-clearRx, clearRx) * 0.7,
      y: cy + rng.int(-clearRy, clearRy) * 0.7,
      r: rng.int(3, 10), a: rng.int(10, 35) / 100,
    });
  }
  const patches = [
    { cx, cy, rx: clearRx * 0.7, ry: clearRy * 0.7, rot: 0,         c: F.dirt2,    a: 0.25 },
    { cx: cx + rng.int(-30, 30), cy: cy + rng.int(-20, 20),
      rx: rng.int(20, 50), ry: rng.int(15, 40), rot: rng.next(),     c: F.darkDirt, a: 0.18 },
  ];
  add({ ...mkClearing(cx, cy, clearRx, clearRy), dirtDots, patches });

  // Layer 6: buildings on the cleared ground
  const bldgs = [
    { n: 'Blacksmith',    w: 110, h: 90  },
    { n: 'General Store', w: 130, h: 85  },
    { n: 'Inn',           w: 170, h: 120 },
    { n: 'Herbalist',     w: 85,  h: 75  },
    { n: 'Town Hall',     w: 150, h: 130 },
    { n: 'Stables',       w: 130, h: 75  },
    { n: 'Chapel',        w: 110, h: 140 },
    { n: 'Barracks',      w: 150, h: 100 },
  ];

  const placed = [];
  for (const b of bldgs) {
    for (let a = 0; a < 80; a++) {
      const px = cx + rng.int(-clearRx + b.w / 2, clearRx - b.w / 2) - b.w / 2;
      const py = cy + rng.int(-clearRy + b.h / 2, clearRy - b.h / 2) - b.h / 2;
      const fake = { x1: px, y1: py, x2: px + b.w, y2: py + b.h, x: px, y: py, w: b.w, h: b.h };
      if (!overlaps(px, py, b.w, b.h, placed, 20)) {
        placed.push({ ...fake, n: b.n });
        break;
      }
    }
  }

  for (const b of placed) {
    add(mkRoomRect(b.x, b.y, b.w, b.h, b.n, { wallT: 8, wallColor: '#9a7850', floorColor: '#c8b888' }));
    add(mkDoor(b.x + b.w / 2, b.y + b.h, true));
  }

  // Ferns at clearing border
  for (let i = 0; i < 8; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = avgR * rng.int(80, 95) / 100;
    add(mkFern(cx + Math.cos(a) * d * (clearRx / avgR),
               cy + Math.sin(a) * d * (clearRy / avgR)));
  }

  add(mkLabel(cx, cy - clearRy - 28, scene.title || 'Village', 10, { color: P.dark }));
}
