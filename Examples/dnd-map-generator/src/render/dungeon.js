/**
 * render/dungeon.js
 * All draw functions for dungeon/indoor entity types.
 *
 * Core rendering principle (from cartographic guide):
 *   The BACKGROUND IS THE WALLS. Rooms are cut out of it by painting
 *   floor-colored shapes on top. Never draw explicit wall outlines —
 *   the gap between outer and inner shapes IS the wall.
 *
 * Two-shape room technique:
 *   Rect room  → outer filled rect (wall color) + inner filled rect (floor)
 *   Circle room → outer filled circle (wall color) + inner filled circle (floor)
 *   Wall thickness = difference in size between outer and inner shape.
 *
 * Corridor technique:
 *   Floor-colored polygon + thick wall-colored stroke on long edges only.
 *   Background handles the short-edge "walls" automatically.
 */

'use strict';

// ── Background ───────────────────────────────────────────────
function drawBg(e) {
  ctx.fillStyle = P.wall;
  ctx.fillRect(e.x, e.y, e.w, e.h);
}

// ── Two-rect room ────────────────────────────────────────────
function drawRoomRect(e) {
  const t = e.wallT || 8;

  // Outer rect = wall ring
  ctx.fillStyle = e.wallColor;
  ctx.fillRect(e.x, e.y, e.w, e.h);

  // Inner rect = floor
  ctx.fillStyle = e.floorColor;
  ctx.fillRect(e.x + t, e.y + t, e.w - t * 2, e.h - t * 2);

  // Grid clipped to floor area
  ctx.save();
  ctx.beginPath();
  ctx.rect(e.x + t, e.y + t, e.w - t * 2, e.h - t * 2);
  ctx.clip();
  drawGridLines(e.x + t, e.y + t, e.w - t * 2, e.h - t * 2);
  ctx.restore();

  // Special overlays
  if (e.special === 'boss') {
    ctx.fillStyle = 'rgba(200,60,30,0.12)';
    ctx.fillRect(e.x + t, e.y + t, e.w - t * 2, e.h - t * 2);
  }
  if (e.special === 'entrance') {
    ctx.fillStyle = 'rgba(80,200,80,0.1)';
    ctx.fillRect(e.x + t, e.y + t, e.w - t * 2, e.h - t * 2);
  }

  if (e.label) drawRoomLbl(e.x + e.w / 2, e.y + e.h + 11, e.label);
}

// ── Two-circle room ──────────────────────────────────────────
function drawRoomCircle(e) {
  const t = e.wallT || 8;

  ctx.beginPath();
  ctx.arc(e.cx, e.cy, e.r, 0, Math.PI * 2);
  ctx.fillStyle = e.wallColor;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(e.cx, e.cy, e.r - t, 0, Math.PI * 2);
  ctx.fillStyle = e.floorColor;
  ctx.fill();

  // Grid clipped to inner circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(e.cx, e.cy, e.r - t, 0, Math.PI * 2);
  ctx.clip();
  drawGridLines(e.cx - (e.r - t), e.cy - (e.r - t), (e.r - t) * 2, (e.r - t) * 2);
  ctx.restore();

  if (e.special === 'boss') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(e.cx, e.cy, e.r - t, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(200,60,30,0.12)';
    ctx.fillRect(e.cx - e.r, e.cy - e.r, e.r * 2, e.r * 2);
    ctx.restore();
  }

  if (e.label) drawRoomLbl(e.cx, e.cy + e.r + 11, e.label);
}

// ── Corridor ─────────────────────────────────────────────────
function drawCorridor(e) {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const nx = -dy / len, ny = dx / len, hw = e.width / 2;

  // Floor polygon
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e.x1 + nx * hw, e.y1 + ny * hw);
  ctx.lineTo(e.x2 + nx * hw, e.y2 + ny * hw);
  ctx.lineTo(e.x2 - nx * hw, e.y2 - ny * hw);
  ctx.lineTo(e.x1 - nx * hw, e.y1 - ny * hw);
  ctx.closePath();
  ctx.fillStyle = e.floorColor;
  ctx.fill();

  // Grid inside corridor
  ctx.clip();
  const bx = Math.min(e.x1, e.x2) - hw;
  const by = Math.min(e.y1, e.y2) - hw;
  drawGridLines(bx, by, Math.abs(e.x2 - e.x1) + hw * 2, Math.abs(e.y2 - e.y1) + hw * 2);
  ctx.restore();

  // Wall-color edge strokes (thick = wall)
  ctx.strokeStyle = e.wallColor;
  ctx.lineWidth   = 5;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(e.x1 + nx * hw, e.y1 + ny * hw);
  ctx.lineTo(e.x2 + nx * hw, e.y2 + ny * hw);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.x1 - nx * hw, e.y1 - ny * hw);
  ctx.lineTo(e.x2 - nx * hw, e.y2 - ny * hw);
  ctx.stroke();
}

// ── Explicit wall line ───────────────────────────────────────
function drawWallLine(e) {
  ctx.strokeStyle = e.color;
  ctx.lineWidth   = e.lw;
  ctx.lineCap     = 'round';
  if (e.dashed) ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(e.x1, e.y1);
  ctx.lineTo(e.x2, e.y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Door symbol ──────────────────────────────────────────────
function drawDoor(e) {
  const c = e.secret ? '#cc4488' : P.wood;
  ctx.strokeStyle = c;
  ctx.fillStyle   = e.secret ? 'rgba(200,60,120,0.15)' : 'rgba(154,122,80,0.2)';
  ctx.lineWidth   = 2;
  if (e.secret) ctx.setLineDash([3, 3]);
  // Wall gap rectangle
  ctx.fillRect(e.x - 14, e.y - 3, 28, 6);
  ctx.strokeRect(e.x - 14, e.y - 3, 28, 6);
  // Swing arc
  ctx.beginPath();
  ctx.arc(e.x - 14, e.y, 14, 0, Math.PI / 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Stairs symbol ────────────────────────────────────────────
function drawStairs(e) {
  const sw = e.w / 5;
  ctx.fillStyle   = P.floor;
  ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.strokeStyle = e.color;
  ctx.lineWidth   = 1;
  ctx.strokeRect(e.x, e.y, e.w, e.h);
  for (let i = 1; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(e.x + sw * i, e.y);
    ctx.lineTo(e.x + sw * i, e.y + e.h);
    ctx.stroke();
  }
  // Direction arrow
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(e.x + e.w / 2,     e.y + 3);
  ctx.lineTo(e.x + e.w / 2 + 5, e.y + 11);
  ctx.lineTo(e.x + e.w / 2 - 5, e.y + 11);
  ctx.closePath();
  ctx.fill();
}

// ── Feature symbols — all built from basic primitives ────────
function drawFeature(e) {
  const { x, y, kind } = e;
  ctx.save();
  switch (kind) {
    case 'chest':  drawChest(x, y);  break;
    case 'altar':  drawAltar(x, y);  break;
    case 'well':   drawWell(x, y);   break;
    case 'bars':   drawBars(x, y);   break;
    case 'barrel': drawBarrel(x, y); break;
    case 'candle': drawCandle(x, y); break;
    case 'pool':   drawPool(x, y);   break;
    case 'star':   drawStar(x, y);   break;
    case 'ritual': drawRitual(x, y); break;
  }
  ctx.restore();
}

function drawChest(x, y) {
  ctx.fillStyle = P.wood; ctx.strokeStyle = P.darkW; ctx.lineWidth = 1;
  ctx.fillRect(x - 10, y, 20, 10);     ctx.strokeRect(x - 10, y, 20, 10);       // body
  ctx.fillRect(x - 10, y - 7, 20, 8);  ctx.strokeRect(x - 10, y - 7, 20, 8);    // lid
  ctx.fillStyle = P.gold;
  ctx.fillRect(x - 2, y + 3, 4, 4);    ctx.strokeRect(x - 2, y + 3, 4, 4);      // lock
}

function drawAltar(x, y) {
  ctx.fillStyle = P.stone2; ctx.strokeStyle = P.darkW; ctx.lineWidth = 1;
  ctx.fillRect(x - 12, y - 14, 6, 14);  ctx.strokeRect(x - 12, y - 14, 6, 14); // left pillar
  ctx.fillRect(x + 6,  y - 14, 6, 14);  ctx.strokeRect(x + 6,  y - 14, 6, 14); // right pillar
  ctx.fillRect(x - 14, y - 4, 28, 8);   ctx.strokeRect(x - 14, y - 4, 28, 8);  // table top
}

function drawWell(x, y) {
  ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = P.wallW; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fillStyle = P.water; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y, 5, 3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = P.water; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.7; ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBars(x, y) {
  ctx.fillStyle = P.darkW;
  for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 5 - 1, y - 12, 2, 24);
  ctx.fillRect(x - 13, y - 2, 26, 2); // crossbar
}

function drawBarrel(x, y) {
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = P.wood; ctx.fill();
  ctx.strokeStyle = P.darkW; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); // hoop
  ctx.stroke();
}

function drawCandle(x, y) {
  ctx.fillStyle = P.floor; ctx.strokeStyle = P.darkW; ctx.lineWidth = 0.8;
  ctx.fillRect(x - 3, y - 8, 6, 14);  ctx.strokeRect(x - 3, y - 8, 6, 14); // body
  ctx.beginPath(); ctx.arc(x, y - 10, 3, 0, Math.PI * 2);
  ctx.fillStyle = P.gold; ctx.fill(); // flame
}

function drawPool(x, y) {
  ctx.beginPath(); ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = P.water; ctx.globalAlpha = 0.85; ctx.fill();
  ctx.strokeStyle = '#4a90b0'; ctx.lineWidth = 1; ctx.globalAlpha = 1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2);
  ctx.strokeStyle = P.water; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.7; ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawStar(x, y) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a   = Math.PI * i / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? 10 : 4;
    pts.push([x + rad * Math.cos(a), y + rad * Math.sin(a)]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fillStyle = P.gold; ctx.fill();
  ctx.strokeStyle = P.darkW; ctx.lineWidth = 0.8; ctx.stroke();
}

function drawRitual(x, y) {
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.strokeStyle = P.darkW; ctx.lineWidth = 1; ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = P.dark; ctx.fill();
}

// ── Water area ───────────────────────────────────────────────
function drawWater(e) {
  ctx.globalAlpha = 0.85;
  ctx.fillStyle   = P.water;
  ctx.strokeStyle = '#4a90b0';
  ctx.lineWidth   = 1;
  ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.strokeRect(e.x, e.y, e.w, e.h);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = P.water;
  ctx.lineWidth   = 0.8;
  for (let ry = e.y + 8; ry < e.y + e.h; ry += 8) {
    ctx.beginPath();
    ctx.moveTo(e.x + 4, ry);
    ctx.bezierCurveTo(e.x + e.w * 0.3, ry - 3, e.x + e.w * 0.7, ry + 3, e.x + e.w - 4, ry);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Serif italic room label (cartographic style) ─────────────
function drawRoomLbl(x, y, text) {
  ctx.fillStyle      = P.darkW;
  ctx.font           = 'italic 8px serif';
  ctx.textAlign      = 'center';
  ctx.textBaseline   = 'top';
  ctx.fillText(text, x, y);
}

function drawLabel(e) {
  ctx.fillStyle    = e.color || P.darkW;
  ctx.font         = `italic ${e.size || 9}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.text, e.x, e.y);
}
