/**
 * tools/ui.js
 * Panel management: tool switching, layer list, colour swatches,
 * selection properties panel, map stats, validation, and templates.
 */

'use strict';

// ── Tool switching ───────────────────────────────────────────
const TOOL_HINTS = {
  select:  'Click select · Drag move · Del delete · Dbl-click rename',
  'room-r':'Drag: outer rect = wall, inner rect = floor (two-rect technique)',
  'room-c':'Drag: outer circle = wall, inner circle = floor (two-circle technique)',
  corr:    'Drag corridor — floor rect with wall-colour edge strokes',
  wall:    'Drag explicit wall line',
  door:    'Click to place door',
  stairs:  'Click to place stairs',
  label:   'Click to place italic serif label',
  erase:   'Click to erase entity',
};

function setTool(t) {
  pen.tool = t;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tb-' + t);
  if (btn) btn.classList.add('active');
  document.getElementById('st-hint').textContent = TOOL_HINTS[t] || '';
  document.getElementById('st-tool').textContent =
    t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Layer list ───────────────────────────────────────────────
function buildLayers() {
  document.getElementById('layer-list').innerHTML = LAYERS.map(l => `
    <div class="layer-item">
      <input type="checkbox" ${l.visible ? 'checked' : ''} onclick="event.stopPropagation();toggleLayer('${l.id}',this.checked)">
      <div class="layer-dot" style="background:${l.color}"></div>
      <span class="layer-name">${l.name}</span>
    </div>`).join('');
}

function toggleLayer(id, v) {
  const l = LAYERS.find(l => l.id === id);
  if (l) { l.visible = v; render(); }
}

// ── Colour swatches ──────────────────────────────────────────
const STROKE_SWATCHES = [P.wallW, P.wall, '#6a608a', '#507050', '#7a6840', '#7a7050', '#6a5880', '#9a7850', '#3a6a30', '#8a4030'];
const FILL_SWATCHES   = [P.floor, P.water, '#c0b090', '#4a8a38', 'rgba(100,180,100,0.2)', 'rgba(120,100,180,0.15)', 'rgba(0,0,0,0)', 'rgba(200,180,80,0.15)', 'rgba(200,60,30,0.12)', 'rgba(80,80,100,0.2)'];

function buildSwatches() {
  document.getElementById('sw-stroke').innerHTML =
    STROKE_SWATCHES.map(c => `<div class="sw ${pen.stroke === c ? 'on' : ''}" style="background:${c}" onclick="pen.stroke='${c}';buildSwatches()"></div>`).join('');
  document.getElementById('sw-fill').innerHTML =
    FILL_SWATCHES.map(c => `<div class="sw" style="background:${c};border:1px solid #444" onclick="pen.fill='${c}';buildSwatches()"></div>`).join('');
}

// ── Selection properties ─────────────────────────────────────
function updateSelProps() {
  const p = document.getElementById('sel-props');
  if (!pen.selIds.length) {
    p.innerHTML = '<div style="color:var(--text2);font-size:11px;padding:4px 0">Nothing selected</div>';
    return;
  }
  const e = scene.entities.find(en => en.id === pen.selIds[0]);
  if (!e) return;

  const lbl = e.label !== undefined ? e.label : (e.text || '');

  p.innerHTML = `
    <div class="prop-row"><span class="prop-label">Type</span><span class="prop-val">${e.type}</span></div>
    <div class="field"><label>Label</label><input type="text" value="${lbl}" onchange="setProp('label',this.value);setProp('text',this.value)"></div>
    ${e.x !== undefined ? `
    <div class="row">
      <div class="field"><label>X</label><input type="number" value="${Math.round(e.x)}" onchange="setProp('x',+this.value)"></div>
      <div class="field"><label>Y</label><input type="number" value="${Math.round(e.y)}" onchange="setProp('y',+this.value)"></div>
    </div>
    <div class="row">
      <div class="field"><label>W</label><input type="number" value="${Math.round(e.w || 0)}" onchange="setProp('w',+this.value)"></div>
      <div class="field"><label>H</label><input type="number" value="${Math.round(e.h || 0)}" onchange="setProp('h',+this.value)"></div>
    </div>` : ''}
    ${e.cx !== undefined ? `
    <div class="row">
      <div class="field"><label>CX</label><input type="number" value="${Math.round(e.cx)}" onchange="setProp('cx',+this.value)"></div>
      <div class="field"><label>CY</label><input type="number" value="${Math.round(e.cy)}" onchange="setProp('cy',+this.value)"></div>
    </div>
    <div class="field"><label>Radius</label><input type="number" value="${Math.round(e.r || 0)}" onchange="setProp('r',+this.value)"></div>` : ''}
    ${e.wallColor ? `<div class="field"><label>Wall Color</label><input type="color" value="${toHex(e.wallColor)}" oninput="setProp('wallColor',this.value)" style="width:100%;height:26px;padding:1px"></div>` : ''}
    ${e.floorColor ? `<div class="field"><label>Floor Color</label><input type="color" value="${toHex(e.floorColor)}" oninput="setProp('floorColor',this.value)" style="width:100%;height:26px;padding:1px"></div>` : ''}
    ${e.wallT !== undefined ? `<div class="field"><label>Wall Thickness</label><input type="number" value="${e.wallT}" min="2" max="24" onchange="setProp('wallT',+this.value)"></div>` : ''}
  `;
}

function setProp(k, v) {
  const e = scene.entities.find(en => pen.selIds.includes(en.id));
  if (e) { saveHist(); e[k] = v; render(); }
}

function toHex(c) {
  if (!c || c.startsWith('rgba')) return '#7a6a52';
  return c.startsWith('#') ? c : '#7a6a52';
}

// ── Map stats ────────────────────────────────────────────────
function updateStats() {
  const rooms = scene.entities.filter(e => e.type === 'room-r' || e.type === 'room-c').length;
  const objs  = scene.entities.filter(e => ['door', 'stairs', 'feature', 'label'].includes(e.type)).length;

  document.getElementById('st-rooms').textContent = rooms;
  document.getElementById('st-objs').textContent  = objs;

  const ok = checkConn();
  const el = document.getElementById('st-conn');
  el.textContent  = ok ? '✓ Yes' : '⚠ No';
  el.style.color  = ok ? 'var(--green)' : 'var(--red)';
}

// ── Validation ───────────────────────────────────────────────
function validate() {
  const res   = [];
  const rooms = scene.entities.filter(e => e.type === 'room-r' || e.type === 'room-c');

  if (!rooms.length) {
    res.push('⚠ No rooms placed');
  } else {
    if (!checkConn()) res.push('⚠ Isolated rooms detected');
    if (rooms.filter(r => !r.label).length > rooms.length * 0.6) res.push('ℹ Many unlabeled rooms');
  }

  if (rooms.length > 2 && !scene.entities.some(e => e.type === 'door')) res.push('⚠ No doors placed');
  if (!scene.entities.some(e => e.type === 'stairs') && rooms.length > 3) res.push('ℹ No stairs (single floor)');
  if (!res.length) res.push('✓ Map looks good!');

  document.getElementById('val-out').innerHTML = res.map(r =>
    `<div style="padding:2px 0;color:${r.startsWith('✓') ? 'var(--green)' : r.startsWith('ℹ') ? 'var(--text2)' : 'var(--red)'}">${r}</div>`
  ).join('');
}

// ── Clear map ────────────────────────────────────────────────
function clearMap() {
  if (!confirm('Clear entire map?')) return;
  saveHist();
  scene.entities = [];
  pen.selIds     = [];
  render();
}

// ── Templates ────────────────────────────────────────────────
function placeTemplate(type) {
  const cx = (-view.x + mc.width  / 2) / view.scale;
  const cy = (-view.y + mc.height / 2) / view.scale;
  saveHist();

  const templates = {
    'room-r':  () => add(mkRoomRect(cx - 64, cy - 48, 128, 96, 'Room')),
    'room-c':  () => add(mkRoomCircle(cx, cy, 52, 'Room')),
    'boss':    () => add(mkRoomRect(cx - 80, cy - 64, 160, 128, 'Boss Chamber', { special: 'boss', wallColor: '#8a4030' })),
    'treasury':() => { add(mkRoomRect(cx - 48, cy - 48, 96, 96, 'Treasury', { wallColor: '#7a6820' })); add(mkFeature(cx, cy, 'chest')); },
    'entrance':() => { add(mkRoomRect(cx - 64, cy - 48, 128, 96, 'Entrance', { special: 'entrance' })); add(mkDoor(cx, cy + 48, true)); add(mkStairs(cx - 24, cy, 48, 28)); },
    'prison':  () => { add(mkRoomRect(cx - 80, cy - 48, 160, 96, 'Prison')); add(mkFeature(cx, cy, 'bars')); },
    'shrine':  () => { add(mkRoomCircle(cx, cy, 56, 'Shrine', { wallColor: '#7a7050' })); add(mkFeature(cx, cy, 'altar')); },
    'pool':    () => { add(mkRoomRect(cx - 60, cy - 50, 120, 100, 'Pool Room')); add(mkWater(cx - 30, cy - 24, 60, 48)); },
  };

  templates[type]?.();
  render();
}
