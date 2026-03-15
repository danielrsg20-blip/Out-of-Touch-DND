/**
 * render/renderer.js
 * Main render loop, canvas setup, view transforms, minimap, selection
 * highlight, and draw-preview overlay.
 *
 * Canvas architecture:
 *   #map-canvas  — all persistent map content
 *   #ui-canvas   — ephemeral draw preview (pointer-events: none)
 *   #mm-canvas   — minimap thumbnail
 */

'use strict';

// ── Canvas references (assigned in main.js after DOMContentLoaded) ──
let mc, uc, mmc, ctx, uctx, mmctx;

// ── View state ───────────────────────────────────────────────
const view = { x: 0, y: 0, scale: 1 };

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  mc.width  = w; mc.height  = h;
  uc.width  = w; uc.height  = h;
  mmc.width = 128; mmc.height = 128;
  render();
}

// ── Coordinate helpers ───────────────────────────────────────
function s2w(sx, sy) { return [(sx - view.x) / view.scale, (sy - view.y) / view.scale]; }

function snapXY(x, y) {
  if (!document.getElementById('snap').checked) return [x, y];
  const g = +document.getElementById('grid-size').value;
  return [Math.round(x / g) * g, Math.round(y / g) * g];
}

// ── Main render ──────────────────────────────────────────────
function render() {
  const W = mc.width, H = mc.height;
  ctx.clearRect(0, 0, W, H);

  // Canvas background: wall stone for dungeons, grass for outdoor
  ctx.fillStyle = isOutdoor() ? F.grass : P.wall;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);

  const vis = new Set(LAYERS.filter(l => l.visible).map(l => l.id));
  for (const lid of ['bg', 'floors', 'grid', 'walls', 'features', 'labels']) {
    if (!vis.has(lid)) continue;
    for (const e of scene.entities) {
      if (e.layer !== lid) continue;
      ctx.save();
      drawEntity(e);
      ctx.restore();
    }
  }

  // Compass rose + title banner always on top of map content
  if (scene.entities.length) {
    drawCompassRose();
    drawTitleBanner();
  }

  // Selection highlights
  for (const id of pen.selIds) drawSelHL(id);

  ctx.restore();

  // Draw tool preview on overlay canvas
  if (pen.drawing) drawPreview();

  drawMinimap();
  updateStats();
}

// ── Entity dispatch ──────────────────────────────────────────
function drawEntity(e) {
  switch (e.type) {
    // Dungeon types
    case 'bg':          drawBg(e);         break;
    case 'room-r':      drawRoomRect(e);   break;
    case 'room-c':      drawRoomCircle(e); break;
    case 'corr':        drawCorridor(e);   break;
    case 'wall':        drawWallLine(e);   break;
    case 'door':        drawDoor(e);       break;
    case 'stairs':      drawStairs(e);     break;
    case 'feature':     drawFeature(e);    break;
    case 'label':       drawLabel(e);      break;
    case 'water':       drawWater(e);      break;
    // Outdoor types
    case 'outdoor':     drawOutdoorBg(e);  break;
    case 'opath':       drawOutdoorPath(e);break;
    case 'clearing':    drawClearing(e);   break;
    case 'trees':       drawTreeCluster(e);break;
    case 'fern':        drawFern(e);       break;
    case 'log':         drawLog(e);        break;
    case 'cave':        drawCave(e);       break;
    case 'looseStone':  drawLooseStone(e); break;
  }
}

// ── Selection highlight ──────────────────────────────────────
function drawSelHL(id) {
  const e = scene.entities.find(en => en.id === id);
  if (!e) return;

  ctx.strokeStyle = 'rgba(232,184,75,0.9)';
  ctx.lineWidth   = 2 / view.scale;
  ctx.setLineDash([4 / view.scale, 3 / view.scale]);

  if (e.type === 'room-r') {
    ctx.strokeRect(e.x - 2, e.y - 2, e.w + 4, e.h + 4);
  } else if (e.type === 'room-c') {
    ctx.beginPath(); ctx.arc(e.cx, e.cy, e.r + 3, 0, Math.PI * 2); ctx.stroke();
  } else {
    const ex = e.cx || e.x || 0, ey = e.cy || e.y || 0;
    ctx.beginPath(); ctx.arc(ex, ey, 22, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ── Draw preview (overlay canvas) ───────────────────────────
function drawPreview() {
  const { sx, sy, cx, cy, tool: t } = pen;
  const x = Math.min(sx, cx), y = Math.min(sy, cy);
  const w = Math.abs(cx - sx), h = Math.abs(cy - sy);

  uctx.clearRect(0, 0, uc.width, uc.height);
  uctx.save();
  uctx.translate(view.x, view.y);
  uctx.scale(view.scale, view.scale);

  uctx.strokeStyle = 'rgba(232,184,75,0.8)';
  uctx.fillStyle   = 'rgba(232,184,75,0.05)';
  uctx.lineWidth   = 1.5 / view.scale;
  uctx.setLineDash([5 / view.scale, 4 / view.scale]);

  if (t === 'room-r') {
    uctx.strokeRect(x, y, w, h); uctx.fillRect(x, y, w, h);
  } else if (t === 'room-c') {
    uctx.beginPath(); uctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    uctx.fill(); uctx.stroke();
  } else if (t === 'corr' || t === 'wall') {
    uctx.beginPath(); uctx.moveTo(sx, sy); uctx.lineTo(cx, cy); uctx.stroke();
  }
  uctx.restore();
}

// ── Minimap ──────────────────────────────────────────────────
function drawMinimap() {
  mmctx.clearRect(0, 0, 128, 128);
  mmctx.fillStyle = isOutdoor() ? F.grass : P.wall;
  mmctx.fillRect(0, 0, 128, 128);

  if (!scene.entities.length) return;

  const b  = getBounds();
  const bw = b.maxX - b.minX || 100, bh = b.maxY - b.minY || 100;
  const sc = Math.min(120 / bw, 120 / bh);
  const ox = 4 + (120 - bw * sc) / 2 - b.minX * sc;
  const oy = 4 + (120 - bh * sc) / 2 - b.minY * sc;

  for (const e of scene.entities) {
    if (e.type === 'room-r') {
      const t = e.wallT || 8;
      mmctx.fillStyle = e.floorColor || P.floor;
      mmctx.fillRect((e.x + t) * sc + ox, (e.y + t) * sc + oy, (e.w - t * 2) * sc, (e.h - t * 2) * sc);
    } else if (e.type === 'room-c') {
      mmctx.beginPath();
      mmctx.arc(e.cx * sc + ox, e.cy * sc + oy, (e.r - (e.wallT || 8)) * sc, 0, Math.PI * 2);
      mmctx.fillStyle = e.floorColor || P.floor;
      mmctx.fill();
    } else if (e.type === 'corr') {
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const nx = -dy / len * e.width / 2 * sc, ny = dx / len * e.width / 2 * sc;
        mmctx.beginPath();
        mmctx.moveTo(e.x1 * sc + ox + nx, e.y1 * sc + oy + ny);
        mmctx.lineTo(e.x2 * sc + ox + nx, e.y2 * sc + oy + ny);
        mmctx.lineTo(e.x2 * sc + ox - nx, e.y2 * sc + oy - ny);
        mmctx.lineTo(e.x1 * sc + ox - nx, e.y1 * sc + oy - ny);
        mmctx.fillStyle = e.floorColor || P.floor;
        mmctx.fill();
      }
    } else if (e.type === 'clearing') {
      mmctx.beginPath();
      mmctx.ellipse(e.cx * sc + ox, e.cy * sc + oy, e.rx * sc, e.ry * sc, 0, 0, Math.PI * 2);
      mmctx.fillStyle = F.dirt; mmctx.fill();
    } else if (e.type === 'trees' && e.circles?.length) {
      const c = e.circles[0];
      mmctx.beginPath();
      mmctx.arc(c.cx * sc + ox, c.cy * sc + oy, c.r * sc, 0, Math.PI * 2);
      mmctx.fillStyle = F.shadow; mmctx.globalAlpha = 0.7; mmctx.fill();
      mmctx.globalAlpha = 1;
    }
  }

  // Viewport indicator
  const vx = -view.x / view.scale, vy = -view.y / view.scale;
  const vw = mc.width / view.scale, vh = mc.height / view.scale;
  mmctx.strokeStyle = 'rgba(232,184,75,0.7)';
  mmctx.lineWidth   = 1;
  mmctx.strokeRect(vx * sc + ox, vy * sc + oy, vw * sc, vh * sc);
}

// ── Scene bounds ─────────────────────────────────────────────
function getBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of scene.entities) {
    if (e.type === 'outdoor') {
      minX = Math.min(minX, e.data.x); maxX = Math.max(maxX, e.data.x + e.data.w);
      minY = Math.min(minY, e.data.y); maxY = Math.max(maxY, e.data.y + e.data.h);
    } else if (e.x !== undefined && e.type !== 'outdoor') {
      minX = Math.min(minX, e.x);        maxX = Math.max(maxX, e.x + (e.w || 0));
      minY = Math.min(minY, e.y);        maxY = Math.max(maxY, e.y + (e.h || 0));
    }
    if (e.cx !== undefined) {
      const r = e.r || e.rx || 0;
      minX = Math.min(minX, e.cx - r);   maxX = Math.max(maxX, e.cx + r);
      minY = Math.min(minY, e.cy - r);   maxY = Math.max(maxY, e.cy + r);
    }
    if (e.x1 !== undefined) {
      minX = Math.min(minX, e.x1, e.x2); maxX = Math.max(maxX, e.x1, e.x2);
      minY = Math.min(minY, e.y1, e.y2); maxY = Math.max(maxY, e.y1, e.y2);
    }
  }
  return isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 800, maxY: 600 };
}

// ── View controls ────────────────────────────────────────────
function doZoom(f) {
  const cx = mc.width / 2, cy = mc.height / 2;
  view.x = cx - (cx - view.x) * f;
  view.y = cy - (cy - view.y) * f;
  view.scale = Math.max(0.1, Math.min(8, view.scale * f));
  document.getElementById('st-zoom').textContent = Math.round(view.scale * 100) + '%';
  render();
}

function fitView() {
  if (!scene.entities.length) { view.x = 80; view.y = 60; view.scale = 1; render(); return; }
  const b  = getBounds();
  const pw = mc.width - 80, ph = mc.height - 80;
  view.scale = Math.min(pw / (b.maxX - b.minX || 1), ph / (b.maxY - b.minY || 1), 4);
  view.x = 40 - b.minX * view.scale + (pw - (b.maxX - b.minX) * view.scale) / 2;
  view.y = 40 - b.minY * view.scale + (ph - (b.maxY - b.minY) * view.scale) / 2;
  document.getElementById('st-zoom').textContent = Math.round(view.scale * 100) + '%';
  render();
}
