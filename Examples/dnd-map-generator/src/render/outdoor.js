/**
 * render/outdoor.js
 * Draw functions for all outdoor entity types.
 *
 * Rendering principles (from forest clearing guide):
 *
 *  1. Background IS the ground — fill canvas with grass first.
 *  2. Layer bottom-to-top: grass → grid → path → forest masses → clearing →
 *     interior details → labels.
 *  3. Tree clusters = 4–6 offset circles in 3 shades (dark/mid/highlight).
 *  4. Stone path drawn 3× at decreasing widths creates depth.
 *  5. Clearing edges are soft stroked ellipses, not hard outlines.
 *  6. Ferns are 5 radiating lines from a single point.
 *  7. Logs are lines drawn twice (dark thick body + lighter highlight).
 *  8. Trunk dots on every cluster transform realism significantly.
 *  9. Keep green palette to tight 6-stop ramp for organic blending.
 * 10. Opacity 0.5–0.92 on most elements — never fully opaque.
 */

'use strict';

// ── Grass base + grid ────────────────────────────────────────
/**
 * Layer 1: fills the scene with the grass color and draws the grass-blade
 * texture pattern. Also handles the outdoor grid overlay (top/left edges
 * per tile, giving a continuous grid when tiled).
 */
function drawOutdoorBg(e) {
  const { x, y, w, h } = e.data;

  // Base grass fill
  ctx.fillStyle = F.grass;
  ctx.fillRect(x, y, w, h);

  // Grass blade texture — short angled lines tiled at 40px intervals
  ctx.strokeStyle = '#4a7a32';
  ctx.lineWidth   = 0.6;
  ctx.globalAlpha = 0.45;
  const gs2 = 40;
  for (let gx = x; gx < x + w; gx += gs2) {
    for (let gy = y; gy < y + h; gy += gs2) {
      ctx.beginPath(); ctx.moveTo(gx + 8,  gy + 38); ctx.lineTo(gx + 10, gy + 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + 18, gy + 36); ctx.lineTo(gx + 20, gy + 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + 28, gy + 37); ctx.lineTo(gx + 30, gy + 31); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + 4,  gy + 34); ctx.lineTo(gx + 6,  gy + 28); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Grid overlay (continuous grid from top/left cell edges)
  const gridType    = document.getElementById('grid-type').value;
  const gridVisible = LAYERS.find(l => l.id === 'grid')?.visible;
  if (gridType !== 'none' && gridVisible) {
    const gs = +document.getElementById('grid-size').value;
    ctx.strokeStyle = F.grid;
    ctx.lineWidth   = 0.3;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let gx = Math.ceil(x / gs) * gs; gx <= x + w; gx += gs) {
      ctx.moveTo(gx, y); ctx.lineTo(gx, y + h);
    }
    for (let gy = Math.ceil(y / gs) * gs; gy <= y + h; gy += gs) {
      ctx.moveTo(x, gy); ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ── Stone path (3-stroke technique) ─────────────────────────
/**
 * pts format: [startX, startY, qcx, qcy, endX, endY,  qcx, qcy, endX, endY, ...]
 * Drawn three times at decreasing widths:
 *   1. Widest + darkest = shadow layer
 *   2. Mid = base stone color
 *   3. Narrowest + dashed = slab texture
 */
function drawOutdoorPath(e) {
  if (!e.pts || e.pts.length < 4) return;

  const buildPath = () => {
    ctx.beginPath();
    ctx.moveTo(e.pts[0], e.pts[1]);
    for (let i = 2; i + 3 < e.pts.length; i += 4) {
      ctx.quadraticCurveTo(e.pts[i], e.pts[i + 1], e.pts[i + 2], e.pts[i + 3]);
    }
  };

  ctx.lineCap = 'round';

  // Layer 1: shadow
  buildPath();
  ctx.strokeStyle = '#4a4238'; ctx.lineWidth = e.width + 4; ctx.globalAlpha = 0.4;
  ctx.stroke();

  // Layer 2: base stone color
  buildPath();
  ctx.strokeStyle = F.stone; ctx.lineWidth = e.width; ctx.globalAlpha = 0.65;
  ctx.stroke();

  // Layer 3: dashed slab texture
  buildPath();
  ctx.strokeStyle = F.stone2; ctx.lineWidth = e.width - 4;
  ctx.setLineDash([18, 6]); ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Loose stones alongside path
  if (e.looseStones) {
    for (const s of e.looseStones) {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.rx, s.ry, s.a || 0, 0, Math.PI * 2);
      ctx.fillStyle   = s.c || F.stone;
      ctx.globalAlpha = 0.65;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ── Central clearing (layered ellipses) ──────────────────────
/**
 * Layers:
 *   1. Base dirt fill
 *   2. Dirt texture dots
 *   3. Variation patches (different brown tones)
 *   4. Dark stain patches (blood/rot atmosphere)
 *   5. Soft grassy border — two thick stroked ellipses blur the edge
 */
function drawClearing(e) {
  const { cx, cy, rx, ry } = e;

  // Base dirt
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = F.dirt; ctx.fill();

  // Dirt texture dots
  if (e.dirtDots) {
    ctx.fillStyle = F.darkDirt;
    for (const d of e.dirtDots) {
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.globalAlpha = d.a; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Variation + stain patches
  for (const p of (e.patches || [])) {
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, p.rx, p.ry, p.rot || 0, 0, Math.PI * 2);
    ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Soft grassy border — two overlapping thick-stroked ellipses
  ctx.beginPath(); ctx.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#4a7030'; ctx.lineWidth = 14; ctx.globalAlpha = 0.55; ctx.stroke();

  ctx.beginPath(); ctx.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#5a8038'; ctx.lineWidth = 9; ctx.globalAlpha = 0.45; ctx.stroke();

  ctx.globalAlpha = 1;
}

// ── Tree cluster (3-shade circle stack) ──────────────────────
/**
 * Each cluster: 4–6 base/mid circles in shadow/mid shades, then
 * 2–3 smaller highlight circles on top. Trunk dot at cluster center.
 * Optional jagged canopy edge path on the outermost perimeter.
 */
function drawTreeCluster(e) {
  for (const c of e.circles) {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    ctx.fillStyle   = c.fill;
    ctx.globalAlpha = c.a || 0.88;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Subtle outline on outermost circle defines mass edge
  if (e.circles.length) {
    const outer = e.circles[0];
    ctx.beginPath();
    ctx.arc(outer.cx, outer.cy, outer.r, 0, Math.PI * 2);
    ctx.strokeStyle = F.shadow; ctx.lineWidth = 1; ctx.globalAlpha = 0.25;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Trunk dot — small dark circle implying trunk beneath canopy
  if (e.trunkX !== undefined) {
    ctx.beginPath();
    ctx.arc(e.trunkX, e.trunkY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = F.trunk; ctx.globalAlpha = 0.58; ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ── Fern (5 radiating lines) ─────────────────────────────────
/** Fan of 5 lines from a base point, alternating two green shades */
function drawFern(e) {
  const blades = [[-8, -10], [8, -10], [-4, -12], [4, -12], [0, -13]];
  const colors = [F.mid1, F.mid1, F.mid2, F.mid2, F.mid1];
  ctx.globalAlpha = 0.7;
  ctx.lineCap     = 'round';
  blades.forEach(([dx, dy], i) => {
    ctx.strokeStyle = colors[i];
    ctx.lineWidth   = i < 2 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + dx, e.y + dy);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// ── Fallen log (drawn twice) ─────────────────────────────────
/** Dark thick body + lighter thinner highlight + end cross-section circles */
function drawLog(e) {
  ctx.lineCap = 'round';

  ctx.strokeStyle = F.log; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();

  ctx.strokeStyle = F.logHi; ctx.lineWidth = 5; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
  ctx.globalAlpha = 1;

  // End cross-section circles
  for (const [x, y] of [[e.x1, e.y1], [e.x2, e.y2]]) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = F.log; ctx.fill();
  }
}

// ── Cave entrance (two ellipses) ─────────────────────────────
function drawCave(e) {
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a08'; ctx.globalAlpha = 0.95; ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#2a2a20'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6; ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Loose stone ──────────────────────────────────────────────
function drawLooseStone(e) {
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.rx, e.ry, e.angle || 0, 0, Math.PI * 2);
  ctx.fillStyle   = e.fill || F.stone;
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── Compass rose (outdoor-aware) ─────────────────────────────
/**
 * Four polygon arrow shapes around a dark circle.
 * N/E points use floor/canopy color; S/W use darker gray for shading.
 */
function drawCompassRose() {
  const b       = getBounds();
  const wx      = b.maxX + 40, wy = b.maxY - 60;
  const outdoor = isOutdoor();
  const ptColor = outdoor ? F.mid2 : P.floor;

  ctx.beginPath(); ctx.arc(wx, wy, 16, 0, Math.PI * 2);
  ctx.fillStyle = P.dark; ctx.globalAlpha = 0.75; ctx.fill(); ctx.globalAlpha = 1;

  const arrows = {
    N: [wx, wy - 22, wx + 4, wy - 12, wx, wy - 9, wx - 4, wy - 12],
    S: [wx, wy + 22, wx + 4, wy + 12, wx, wy + 9, wx - 4, wy + 12],
    E: [wx + 22, wy, wx + 12, wy - 4, wx + 9, wy, wx + 12, wy + 4],
    W: [wx - 22, wy, wx - 12, wy - 4, wx - 9, wy, wx - 12, wy + 4],
  };
  const clr = { N: ptColor, S: '#8a8a7a', E: ptColor, W: '#8a8a7a' };

  for (const [d, p] of Object.entries(arrows)) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.lineTo(p[6], p[7]);
    ctx.closePath();
    ctx.fillStyle = clr[d]; ctx.fill();
    ctx.strokeStyle = P.darkW; ctx.lineWidth = 0.5; ctx.stroke();
  }

  ctx.beginPath(); ctx.arc(wx, wy, 4, 0, Math.PI * 2);
  ctx.fillStyle = P.darkW; ctx.fill();

  ctx.font = 'bold 7px serif'; ctx.fillStyle = ptColor;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', wx, wy - 30);
}

// ── Title banner (outdoor-aware) ─────────────────────────────
function drawTitleBanner() {
  if (!scene.title) return;
  const b       = getBounds();
  const bx      = b.minX, by = b.minY - 32;
  const outdoor = isOutdoor();

  if (outdoor) {
    ctx.fillStyle   = 'rgba(200,190,150,0.88)';
    ctx.globalAlpha = 0.9;
    ctx.fillRect(bx, by - 4, scene.title.length * 7.2 + 20, 22);
    ctx.globalAlpha = 1;
    ctx.fillStyle   = P.dark;
  } else {
    ctx.fillStyle   = P.dark;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(bx, by - 4, scene.title.length * 7.2 + 20, 22);
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#d4c080';
  }

  ctx.font         = 'bold italic 12px serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(scene.title, bx + 10, by + 7);
}
