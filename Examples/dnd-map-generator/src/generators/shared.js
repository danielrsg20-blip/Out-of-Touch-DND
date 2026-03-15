/**
 * generators/shared.js
 * Utilities shared by all map generators: seeded RNG, room placement
 * helpers, connectivity checks, and the tree-cluster builder.
 */

'use strict';

// ── Seeded LCG pseudo-random number generator ────────────────
function mkRng(seed) {
  let s = (seed || Math.floor(Math.random() * 0xFFFFFF)) >>> 0;
  return {
    next()    { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; },
    int(a, b) { return Math.floor(this.next() * (b - a + 1)) + a; },
    seed:     s,
  };
}

function hashStr(str) {
  let h = 0;
  for (const c of str) { h = (h << 5) - h + c.charCodeAt(0); h |= 0; }
  return Math.abs(h);
}

// ── Room placement helpers ───────────────────────────────────
/**
 * Returns true if (x,y,w,h) overlaps any rectangle in `list`,
 * with an additional `margin` of separation required.
 * List entries must have { x1, y1, x2, y2 } bounding box fields.
 */
function overlaps(x, y, w, h, list, margin = 16) {
  for (const r of list) {
    if (x < r.x2 + margin && x + w + margin > r.x1 &&
        y < r.y2 + margin && y + h + margin > r.y1) return true;
  }
  return false;
}

/** Squared distance between the centers of two room-like objects */
function d2(a, b) {
  const [ax, ay] = rCenter(a);
  const [bx, by] = rCenter(b);
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

/** Center point of an entity (supports room-r, room-c, and bounding-box objects) */
function rCenter(e) {
  if (e.cx != null) return [e.cx, e.cy];
  return [e.x + (e.w || 0) / 2, e.y + (e.h || 0) / 2];
}

// ── Corridor routing ─────────────────────────────────────────
/**
 * Connect two centers with an L-shaped corridor pair (horizontal then
 * vertical, or vertical then horizontal — chosen randomly).
 */
function connectC(ax, ay, bx, by, cw, rng, o = {}) {
  if (rng.next() > 0.5) {
    add(mkCorridor(ax, ay, bx, ay, cw, o));
    add(mkCorridor(bx, ay, bx, by, cw, o));
  } else {
    add(mkCorridor(ax, ay, ax, by, cw, o));
    add(mkCorridor(ax, by, bx, by, cw, o));
  }
}

// ── Connectivity validation ──────────────────────────────────
/**
 * BFS connectivity check: returns true if all rooms are reachable from
 * the first room via corridors. Used by the validation panel.
 */
function checkConn() {
  const rooms = scene.entities.filter(e => e.type === 'room-r' || e.type === 'room-c');
  if (rooms.length < 2) return true;

  const corrs = scene.entities.filter(e => e.type === 'corr');
  const adj   = new Map(rooms.map(r => [r.id, []]));

  for (const c of corrs) {
    for (const r1 of rooms) {
      for (const r2 of rooms) {
        if (r1.id === r2.id) continue;
        const [cx1, cy1] = rCenter(r1), [cx2, cy2] = rCenter(r2);
        const dx = c.x2 - c.x1, dy = c.y2 - c.y1, l2 = dx * dx + dy * dy;
        if (l2 === 0) continue;
        const t1 = Math.max(0, Math.min(1, ((cx1 - c.x1) * dx + (cy1 - c.y1) * dy) / l2));
        const t2 = Math.max(0, Math.min(1, ((cx2 - c.x1) * dx + (cy2 - c.y1) * dy) / l2));
        const d1 = Math.hypot(cx1 - (c.x1 + t1 * dx), cy1 - (c.y1 + t1 * dy));
        const d2c= Math.hypot(cx2 - (c.x1 + t2 * dx), cy2 - (c.y1 + t2 * dy));
        const thr1 = r1.r ? r1.r + 8 : Math.max(r1.w || 0, r1.h || 0) / 2 + 8;
        const thr2 = r2.r ? r2.r + 8 : Math.max(r2.w || 0, r2.h || 0) / 2 + 8;
        if (d1 < thr1 && d2c < thr2) {
          adj.get(r1.id)?.push(r2.id);
          adj.get(r2.id)?.push(r1.id);
        }
      }
    }
  }

  const vis = new Set([rooms[0].id]), q = [rooms[0].id];
  while (q.length) {
    const n = q.shift();
    for (const nb of (adj.get(n) || [])) {
      if (!vis.has(nb)) { vis.add(nb); q.push(nb); }
    }
  }
  return vis.size === rooms.length;
}

// ── Feature placement ────────────────────────────────────────
const FEATURE_KINDS = ['chest', 'altar', 'well', 'bars', 'barrel', 'candle', 'pool', 'star', 'ritual'];

function rFeat(r, rng) {
  const [cx, cy] = rCenter(r);
  add(mkFeature(cx, cy, FEATURE_KINDS[rng.int(0, FEATURE_KINDS.length - 1)]));
}

// ── Tree cluster builder ─────────────────────────────────────
/**
 * Build a mkTreeCluster entity from a center position and RNG.
 * Uses the 3-shade circle stack from the forest guide:
 *   - 4–5 base/mid circles with dark/mid shades, offset irregularly
 *   - 2–3 smaller highlight circles on top
 *   - Trunk dot at cluster center
 */
function buildTreeCluster(cx, cy, baseR, rng) {
  const shades = [F.shadow, F.shadow, F.mid1, F.mid2, F.hi1, F.hi2];
  const circles = [];

  // Base and mid circles
  const n = rng.int(4, 5);
  for (let i = 0; i < n; i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist  = rng.int(0, Math.round(baseR * 0.45));
    const r     = baseR * rng.int(70, 100) / 100;
    const shade = shades[rng.int(0, 3)];
    circles.push({ cx: cx + Math.cos(angle) * dist, cy: cy + Math.sin(angle) * dist,
                   r, fill: shade, a: rng.int(80, 92) / 100 });
  }

  // Highlight circles (smaller, brighter, placed offset)
  for (let i = 0; i < rng.int(2, 3); i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist  = rng.int(Math.round(baseR * 0.1), Math.round(baseR * 0.4));
    circles.push({ cx: cx + Math.cos(angle) * dist, cy: cy + Math.sin(angle) * dist,
                   r: baseR * rng.int(30, 55) / 100,
                   fill: shades[rng.int(4, 5)], a: rng.int(50, 65) / 100 });
  }

  return mkTreeCluster(circles, cx, cy);
}

/**
 * Place a ring of tree clusters around a clearing plus border masses.
 * Creates: outer forest wall, edge masses near map boundary, inner
 * bush ring following the clearing ellipse shape.
 */
function buildForestRing(cx, cy, clearRx, clearRy, density, rng, mapW, mapH) {
  const avgR = (clearRx + clearRy) / 2;

  // Outer forest wall
  for (let i = 0; i < density * 3; i++) {
    const angle = rng.next() * Math.PI * 2;
    const dist  = avgR * rng.int(120, 220) / 100;
    add(buildTreeCluster(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist,
                         rng.int(38, 70), rng));
  }

  // Edge forest masses (near map boundary)
  for (let i = 0; i < density * 2; i++) {
    const side = rng.int(0, 3);
    let tcx, tcy;
    if      (side === 0) { tcx = rng.int(0, mapW); tcy = rng.int(-20, 40); }
    else if (side === 1) { tcx = rng.int(0, mapW); tcy = rng.int(mapH - 40, mapH + 20); }
    else if (side === 2) { tcx = rng.int(-20, 40); tcy = rng.int(0, mapH); }
    else                 { tcx = rng.int(mapW - 40, mapW + 20); tcy = rng.int(0, mapH); }
    add(buildTreeCluster(tcx, tcy, rng.int(42, 72), rng));
  }

  // Inner bush ring — tighter clusters just outside the clearing edge
  for (let i = 0; i < density * 2; i++) {
    const angle = (i / (density * 2)) * Math.PI * 2 + rng.next() * 0.4;
    const dist  = avgR * rng.int(108, 130) / 100;
    const tcx   = cx + Math.cos(angle) * dist * (clearRx / avgR);
    const tcy   = cy + Math.sin(angle) * dist * (clearRy / avgR);
    add(buildTreeCluster(tcx, tcy, rng.int(28, 46), rng));
  }
}
