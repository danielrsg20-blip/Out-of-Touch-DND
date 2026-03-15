/**
 * tools/input.js
 * Mouse and keyboard input handling.
 *
 * Pen state (shared across input and UI modules):
 *   pen.tool      — active tool id
 *   pen.drawing   — true while drag-drawing
 *   pen.sx/sy     — drag start (world coords, snapped)
 *   pen.cx/cy     — drag current (world coords, snapped)
 *   pen.selIds    — array of selected entity IDs
 *   pen.dragging  — true while dragging a selection
 *   pen.dragX/Y   — last drag position for delta calculation
 *   pen.stroke    — wall color for new shapes
 *   pen.fill      — floor color for new shapes
 *   pen.wallT     — wall thickness for new rooms
 */

'use strict';

const pen = {
  tool:     'select',
  drawing:  false,
  sx: 0, sy: 0, cx: 0, cy: 0,
  selIds:   [],
  dragging: false,
  dragX: 0, dragY: 0,
  stroke:   null,  // set in main.js after palette loads
  fill:     null,
  wallT:    8,
};

// ── Pan state ────────────────────────────────────────────────
let panning   = false;
let panStart  = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

// ── Mouse down ───────────────────────────────────────────────
function onMouseDown(e) {
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  const [sx, sy] = snapXY(wx, wy);

  // Pan: middle button or Alt + left button
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    panning   = true;
    panStart  = { x: e.offsetX, y: e.offsetY };
    panOrigin = { x: view.x,    y: view.y    };
    mc.style.cursor = 'grabbing';
    return;
  }

  switch (pen.tool) {
    case 'select': {
      const hit = hitTest(wx, wy);
      if (hit) {
        if (!pen.selIds.includes(hit.id)) pen.selIds = [hit.id];
        pen.dragging = true;
        pen.dragX = wx; pen.dragY = wy;
      } else {
        pen.selIds = [];
      }
      updateSelProps();
      render();
      return;
    }
    case 'erase': {
      const hit = hitTest(wx, wy);
      if (hit) { saveHist(); scene.entities = scene.entities.filter(e => e.id !== hit.id); render(); }
      return;
    }
    case 'label': {
      const t = prompt('Label text:');
      if (t) { saveHist(); add(mkLabel(sx, sy, t)); render(); }
      return;
    }
    case 'door':   saveHist(); add(mkDoor(sx, sy, true)); render(); return;
    case 'stairs': saveHist(); add(mkStairs(sx - 24, sy - 14, 48, 28)); render(); return;
  }

  // Drawing tools: start drag
  pen.drawing = true;
  pen.sx = sx; pen.sy = sy;
  pen.cx = sx; pen.cy = sy;
}

// ── Mouse move ───────────────────────────────────────────────
function onMouseMove(e) {
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  const [sx, sy] = snapXY(wx, wy);

  document.getElementById('st-pos').textContent = `${Math.round(wx)}, ${Math.round(wy)}`;

  if (panning) {
    view.x = panOrigin.x + (e.offsetX - panStart.x);
    view.y = panOrigin.y + (e.offsetY - panStart.y);
    render();
    return;
  }

  if (pen.dragging && pen.selIds.length) {
    const dx = wx - pen.dragX, dy = wy - pen.dragY;
    for (const id of pen.selIds) {
      const en = scene.entities.find(e => e.id === id);
      if (!en) continue;
      if (en.x  !== undefined) { en.x  += dx; en.y  += dy; }
      if (en.cx !== undefined) { en.cx += dx; en.cy += dy; }
      if (en.x1 !== undefined) { en.x1 += dx; en.y1 += dy; en.x2 += dx; en.y2 += dy; }
    }
    pen.dragX = wx; pen.dragY = wy;
    render();
    return;
  }

  if (pen.drawing) {
    pen.cx = sx; pen.cy = sy;
    drawPreview();
  }
}

// ── Mouse up ─────────────────────────────────────────────────
function onMouseUp(e) {
  if (panning) { panning = false; mc.style.cursor = 'crosshair'; return; }

  if (pen.dragging) { saveHist(); pen.dragging = false; return; }

  if (!pen.drawing) return;
  pen.drawing = false;
  uctx.clearRect(0, 0, uc.width, uc.height);

  const { sx, sy, cx, cy, tool: t } = pen;
  const x = Math.min(sx, cx), y = Math.min(sy, cy);
  const w = Math.abs(cx - sx),  h = Math.abs(cy - sy);
  if (w < 8 && h < 8) return;

  saveHist();
  const wt = +document.getElementById('wall-t').value;

  if      (t === 'room-r') add(mkRoomRect(x, y, w, h, '', { wallColor: pen.stroke, floorColor: pen.fill, wallT: wt }));
  else if (t === 'room-c') add(mkRoomCircle(x + w / 2, y + h / 2, Math.min(w, h) / 2, '', { wallColor: pen.stroke, floorColor: pen.fill, wallT: wt }));
  else if (t === 'corr')   add(mkCorridor(sx, sy, cx, cy, 32, { wallColor: pen.stroke, floorColor: pen.fill }));
  else if (t === 'wall')   add(mkWall(sx, sy, cx, cy, { color: pen.stroke }));

  render();
}

// ── Double click — edit label ────────────────────────────────
function onDblClick(e) {
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  const hit = hitTest(wx, wy);
  if (!hit) return;
  const nv = prompt('Edit label:', hit.label || hit.text || '');
  if (nv === null) return;
  saveHist();
  if (hit.label !== undefined) hit.label = nv;
  if (hit.text  !== undefined) hit.text  = nv;
  render();
}

// ── Scroll wheel — zoom ──────────────────────────────────────
function onWheel(e) {
  e.preventDefault();
  const f = e.deltaY > 0 ? 0.9 : 1.1;
  view.x = e.offsetX - (e.offsetX - view.x) * f;
  view.y = e.offsetY - (e.offsetY - view.y) * f;
  view.scale = Math.max(0.1, Math.min(8, view.scale * f));
  document.getElementById('st-zoom').textContent = Math.round(view.scale * 100) + '%';
  render();
}

// ── Keyboard shortcuts ───────────────────────────────────────
function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();

  if (e.ctrlKey || e.metaKey) {
    if (k === 'z') { undo(); return; }
    if (k === 'y') { redo(); return; }
    if (k === 'a') { pen.selIds = scene.entities.map(e => e.id); render(); return; }
  }

  const toolMap = { v: 'select', r: 'room-r', c: 'room-c', l: 'corr', w: 'wall', d: 'door', s: 'stairs', t: 'label', e: 'erase' };
  if (toolMap[k]) setTool(toolMap[k]);

  if ((k === 'delete' || k === 'backspace') && pen.selIds.length) {
    saveHist();
    scene.entities = scene.entities.filter(en => !pen.selIds.includes(en.id));
    pen.selIds = [];
    render();
  }

  if (k === 'f') fitView();
  if (k === '+') doZoom(1.2);
  if (k === '-') doZoom(0.8);
}

// ── Hit testing ──────────────────────────────────────────────
function hitTest(wx, wy) {
  for (let i = scene.entities.length - 1; i >= 0; i--) {
    const e = scene.entities[i];
    if (e.type === 'room-r') {
      if (wx >= e.x && wx <= e.x + e.w && wy >= e.y && wy <= e.y + e.h) return e;
    } else if (e.type === 'room-c') {
      if (Math.hypot(wx - e.cx, wy - e.cy) <= e.r) return e;
    } else if (e.type === 'corr') {
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1, l2 = dx * dx + dy * dy;
      if (l2 > 0) {
        const tt = Math.max(0, Math.min(1, ((wx - e.x1) * dx + (wy - e.y1) * dy) / l2));
        if (Math.hypot(wx - (e.x1 + tt * dx), wy - (e.y1 + tt * dy)) < e.width / 2 + 6) return e;
      }
    } else if (e.type === 'wall') {
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1, l2 = dx * dx + dy * dy;
      if (l2 > 0) {
        const tt = Math.max(0, Math.min(1, ((wx - e.x1) * dx + (wy - e.y1) * dy) / l2));
        if (Math.hypot(wx - (e.x1 + tt * dx), wy - (e.y1 + tt * dy)) < 10) return e;
      }
    } else if (e.type !== 'bg' && e.type !== 'outdoor') {
      const ex = e.cx || e.x || 0, ey = e.cy || e.y || 0;
      if (Math.hypot(wx - ex, wy - ey) < 22) return e;
    }
  }
  return null;
}

// ── Attach listeners (called from main.js) ───────────────────
function attachInputListeners() {
  mc.addEventListener('mousedown', onMouseDown);
  mc.addEventListener('mousemove', onMouseMove);
  mc.addEventListener('mouseup',   onMouseUp);
  mc.addEventListener('dblclick',  onDblClick);
  mc.addEventListener('wheel',     onWheel, { passive: false });
  document.addEventListener('keydown', onKeyDown);
}
