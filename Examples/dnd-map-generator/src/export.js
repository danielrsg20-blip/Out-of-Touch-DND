/**
 * export.js
 * SVG and JSON export pipeline.
 *
 * SVG export faithfully reproduces the cartographic rendering in pure SVG:
 *   - Background rect (wall stone or grass)
 *   - Grid lines over floor areas
 *   - All room/corridor entities as proper SVG primitives
 *   - Feature symbols as primitive shapes
 *   - Outdoor entities: grass pattern, 3-stroke paths, layered ellipses,
 *     tree clusters, ferns, logs, cave
 *   - Compass rose (polygon arrows)
 *   - Title banner (semi-transparent rect + serif italic text)
 *
 * JSON export captures the full scene graph for round-tripping.
 */

'use strict';

// ── SVG Export ───────────────────────────────────────────────
function exportSVG() {
  const b   = getBounds();
  const pad = 60;
  const W   = b.maxX - b.minX + pad * 2;
  const H   = b.maxY - b.minY + pad * 2;
  const gs  = +document.getElementById('grid-size').value;
  const outdoor = isOutdoor();

  const tx = x => x + pad - b.minX;
  const ty = y => y + pad - b.minY;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n`;

  // Background
  s += `<rect width="100%" height="100%" fill="${outdoor ? F.grass : P.wall}"/>\n`;

  // Dungeon: grid lines over all floor space
  if (!outdoor) {
    s += `<g stroke="${P.grid}" stroke-width="0.5" stroke-dasharray="4 4" opacity="0.8">\n`;
    for (let x = Math.floor(b.minX / gs) * gs; x <= b.maxX; x += gs)
      s += `<line x1="${tx(x)}" y1="${ty(b.minY)}" x2="${tx(x)}" y2="${ty(b.maxY)}"/>\n`;
    for (let y = Math.floor(b.minY / gs) * gs; y <= b.maxY; y += gs)
      s += `<line x1="${tx(b.minX)}" y1="${ty(y)}" x2="${tx(b.maxX)}" y2="${ty(y)}"/>\n`;
    s += `</g>\n`;
  }

  // Entities
  for (const e of scene.entities) {
    s += entityToSVG(e, tx, ty, gs, outdoor);
  }

  // Title banner
  const bannerBg   = outdoor ? 'rgba(200,190,160,0.88)' : P.dark;
  const bannerText = outdoor ? P.dark : '#d4c080';
  if (scene.title) {
    s += `<rect x="${tx(b.minX)}" y="${ty(b.minY - 32)}" width="${scene.title.length * 7.2 + 20}" height="22" rx="3" fill="${bannerBg}" opacity="0.9"/>\n`;
    s += `<text x="${tx(b.minX + 10)}" y="${ty(b.minY - 20)}" font-family="serif" font-style="italic" font-weight="bold" font-size="12" fill="${bannerText}">${scene.title}</text>\n`;
  }

  // Compass rose
  const compassPt = outdoor ? F.mid2 : P.floor;
  const rx = tx(b.maxX + 40), ry = ty(b.maxY - 60);
  s += `<circle cx="${rx}" cy="${ry}" r="16" fill="${P.dark}" opacity="0.75"/>\n`;
  s += `<polygon points="${rx},${ry-22} ${rx+4},${ry-12} ${rx},${ry-9} ${rx-4},${ry-12}" fill="${compassPt}" stroke="${P.darkW}" stroke-width="0.5"/>\n`;
  s += `<polygon points="${rx},${ry+22} ${rx+4},${ry+12} ${rx},${ry+9} ${rx-4},${ry+12}" fill="#8a8a7a" stroke="${P.darkW}" stroke-width="0.5"/>\n`;
  s += `<polygon points="${rx+22},${ry} ${rx+12},${ry-4} ${rx+9},${ry} ${rx+12},${ry+4}" fill="${compassPt}" stroke="${P.darkW}" stroke-width="0.5"/>\n`;
  s += `<polygon points="${rx-22},${ry} ${rx-12},${ry-4} ${rx-9},${ry} ${rx-12},${ry+4}" fill="#8a8a7a" stroke="${P.darkW}" stroke-width="0.5"/>\n`;
  s += `<circle cx="${rx}" cy="${ry}" r="4" fill="${P.darkW}"/>\n`;
  s += `<text x="${rx}" y="${ry - 30}" text-anchor="middle" font-family="serif" font-weight="bold" font-size="7" fill="${compassPt}">N</text>\n`;

  s += `</svg>`;
  dl(new Blob([s], { type: 'image/svg+xml' }),
     `${outdoor ? 'outdoor' : 'dungeon'}-${scene.seed || 'map'}.svg`);
}

function entityToSVG(e, tx, ty, gs, outdoor) {
  let s = '';

  if (e.type === 'room-r') {
    const t = e.wallT || 8;
    s += `<rect x="${tx(e.x)}" y="${ty(e.y)}" width="${e.w}" height="${e.h}" fill="${e.wallColor}"/>\n`;
    s += `<rect x="${tx(e.x+t)}" y="${ty(e.y+t)}" width="${e.w-t*2}" height="${e.h-t*2}" fill="${e.floorColor}"/>\n`;
    if (e.label) s += `<text x="${tx(e.x+e.w/2)}" y="${ty(e.y+e.h+11)}" text-anchor="middle" font-family="serif" font-style="italic" font-size="9" fill="${P.darkW}">${e.label}</text>\n`;

  } else if (e.type === 'room-c') {
    const t = e.wallT || 8;
    s += `<circle cx="${tx(e.cx)}" cy="${ty(e.cy)}" r="${e.r}" fill="${e.wallColor}"/>\n`;
    s += `<circle cx="${tx(e.cx)}" cy="${ty(e.cy)}" r="${e.r - t}" fill="${e.floorColor}"/>\n`;
    if (e.label) s += `<text x="${tx(e.cx)}" y="${ty(e.cy+e.r+11)}" text-anchor="middle" font-family="serif" font-style="italic" font-size="9" fill="${P.darkW}">${e.label}</text>\n`;

  } else if (e.type === 'corr') {
    const dx = e.x2-e.x1, dy = e.y2-e.y1, len = Math.sqrt(dx*dx+dy*dy);
    if (len < 1) return '';
    const nx = -dy/len*e.width/2, ny = dx/len*e.width/2;
    s += `<polygon points="${tx(e.x1+nx)},${ty(e.y1+ny)} ${tx(e.x2+nx)},${ty(e.y2+ny)} ${tx(e.x2-nx)},${ty(e.y2-ny)} ${tx(e.x1-nx)},${ty(e.y1-ny)}" fill="${e.floorColor}"/>\n`;
    s += `<line x1="${tx(e.x1+nx)}" y1="${ty(e.y1+ny)}" x2="${tx(e.x2+nx)}" y2="${ty(e.y2+ny)}" stroke="${e.wallColor}" stroke-width="5" stroke-linecap="round"/>\n`;
    s += `<line x1="${tx(e.x1-nx)}" y1="${ty(e.y1-ny)}" x2="${tx(e.x2-nx)}" y2="${ty(e.y2-ny)}" stroke="${e.wallColor}" stroke-width="5" stroke-linecap="round"/>\n`;

  } else if (e.type === 'wall') {
    s += `<line x1="${tx(e.x1)}" y1="${ty(e.y1)}" x2="${tx(e.x2)}" y2="${ty(e.y2)}" stroke="${e.color}" stroke-width="${e.lw}" stroke-linecap="round"${e.dashed ? ' stroke-dasharray="6,4"' : ''}/>\n`;

  } else if (e.type === 'stairs') {
    const sw = e.w / 5;
    s += `<rect x="${tx(e.x)}" y="${ty(e.y)}" width="${e.w}" height="${e.h}" fill="${P.floor}" stroke="${P.wallW}" stroke-width="1"/>\n`;
    for (let i = 1; i < 5; i++)
      s += `<line x1="${tx(e.x+sw*i)}" y1="${ty(e.y)}" x2="${tx(e.x+sw*i)}" y2="${ty(e.y+e.h)}" stroke="${P.wallW}" stroke-width="1"/>\n`;

  } else if (e.type === 'door') {
    s += `<rect x="${tx(e.x-14)}" y="${ty(e.y-3)}" width="28" height="6" fill="${P.wood}" stroke="${P.darkW}" stroke-width="1"${e.secret ? ' stroke-dasharray="3,3"' : ''}/>\n`;

  } else if (e.type === 'label') {
    s += `<text x="${tx(e.x)}" y="${ty(e.y)}" text-anchor="middle" font-family="serif" font-style="italic" font-size="${e.size || 9}" fill="${e.color || P.darkW}">${e.text}</text>\n`;

  } else if (e.type === 'water') {
    s += `<rect x="${tx(e.x)}" y="${ty(e.y)}" width="${e.w}" height="${e.h}" fill="${P.water}" stroke="#4a90b0" stroke-width="1" opacity="0.85"/>\n`;

  } else if (e.type === 'feature') {
    s += featureToSVG(e, tx, ty);

  } else if (e.type === 'outdoor') {
    // Grass base + blade pattern
    s += `<defs><pattern id="gp" width="40" height="40" patternUnits="userSpaceOnUse">`;
    s += `<rect width="40" height="40" fill="${F.grass}"/>`;
    s += `<line x1="8" y1="38" x2="10" y2="32" stroke="#4a7a32" stroke-width="0.6"/>`;
    s += `<line x1="18" y1="36" x2="20" y2="30" stroke="#4a7a32" stroke-width="0.6"/>`;
    s += `<line x1="28" y1="37" x2="30" y2="31" stroke="#4a7a32" stroke-width="0.6"/>`;
    s += `<line x1="4" y1="34" x2="6" y2="28" stroke="#4a7a32" stroke-width="0.6"/>`;
    s += `</pattern></defs>`;
    s += `<rect x="${tx(e.data.x)}" y="${ty(e.data.y)}" width="${e.data.w}" height="${e.data.h}" fill="${F.grass}"/>\n`;
    s += `<rect x="${tx(e.data.x)}" y="${ty(e.data.y)}" width="${e.data.w}" height="${e.data.h}" fill="url(#gp)" opacity="0.6"/>\n`;

  } else if (e.type === 'opath') {
    if (e.pts && e.pts.length >= 6) {
      let d = `M${tx(e.pts[0])},${ty(e.pts[1])}`;
      for (let i = 2; i + 3 < e.pts.length; i += 4)
        d += ` Q${tx(e.pts[i])},${ty(e.pts[i+1])} ${tx(e.pts[i+2])},${ty(e.pts[i+3])}`;
      s += `<path d="${d}" fill="none" stroke="#4a4238" stroke-width="${e.width+4}" stroke-linecap="round" opacity="0.4"/>\n`;
      s += `<path d="${d}" fill="none" stroke="${F.stone}" stroke-width="${e.width}" stroke-linecap="round" opacity="0.65"/>\n`;
      s += `<path d="${d}" fill="none" stroke="${F.stone2}" stroke-width="${e.width-4}" stroke-linecap="round" stroke-dasharray="18,6" opacity="0.55"/>\n`;
    }

  } else if (e.type === 'clearing') {
    s += `<ellipse cx="${tx(e.cx)}" cy="${ty(e.cy)}" rx="${e.rx}" ry="${e.ry}" fill="${F.dirt}"/>\n`;
    for (const p of (e.patches || []))
      s += `<ellipse cx="${tx(p.cx)}" cy="${ty(p.cy)}" rx="${p.rx}" ry="${p.ry}" fill="${p.c}" opacity="${p.a}"/>\n`;
    s += `<ellipse cx="${tx(e.cx)}" cy="${ty(e.cy)}" rx="${e.rx+2}" ry="${e.ry+2}" fill="none" stroke="#4a7030" stroke-width="14" opacity="0.55"/>\n`;
    s += `<ellipse cx="${tx(e.cx)}" cy="${ty(e.cy)}" rx="${e.rx+1}" ry="${e.ry+1}" fill="none" stroke="#5a8038" stroke-width="9" opacity="0.45"/>\n`;

  } else if (e.type === 'trees') {
    for (const c of (e.circles || []))
      s += `<circle cx="${tx(c.cx)}" cy="${ty(c.cy)}" r="${c.r}" fill="${c.fill}" opacity="${c.a || 0.88}"/>\n`;
    if (e.trunkX !== undefined)
      s += `<circle cx="${tx(e.trunkX)}" cy="${ty(e.trunkY)}" r="3.5" fill="${F.trunk}" opacity="0.58"/>\n`;

  } else if (e.type === 'fern') {
    const blades = [[-8,-10],[8,-10],[-4,-12],[4,-12],[0,-13]];
    blades.forEach(([dx, dy], i) => {
      s += `<line x1="${tx(e.x)}" y1="${ty(e.y)}" x2="${tx(e.x+dx)}" y2="${ty(e.y+dy)}" stroke="${i < 2 ? F.mid1 : F.mid2}" stroke-width="${i < 2 ? 1.2 : 1}" stroke-linecap="round" opacity="0.7"/>\n`;
    });

  } else if (e.type === 'log') {
    s += `<line x1="${tx(e.x1)}" y1="${ty(e.y1)}" x2="${tx(e.x2)}" y2="${ty(e.y2)}" stroke="${F.log}" stroke-width="7" stroke-linecap="round"/>\n`;
    s += `<line x1="${tx(e.x1)}" y1="${ty(e.y1)}" x2="${tx(e.x2)}" y2="${ty(e.y2)}" stroke="${F.logHi}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>\n`;
    s += `<circle cx="${tx(e.x1)}" cy="${ty(e.y1)}" r="4" fill="${F.log}"/>`;
    s += `<circle cx="${tx(e.x2)}" cy="${ty(e.y2)}" r="4" fill="${F.log}"/>\n`;

  } else if (e.type === 'cave') {
    s += `<ellipse cx="${tx(e.x)}" cy="${ty(e.y)}" rx="${e.rx}" ry="${e.ry}" fill="#0a0a08" opacity="0.95"/>\n`;
    s += `<ellipse cx="${tx(e.x)}" cy="${ty(e.y)}" rx="${e.rx}" ry="${e.ry}" fill="none" stroke="#2a2a20" stroke-width="3" opacity="0.6"/>\n`;

  } else if (e.type === 'looseStone') {
    s += `<ellipse cx="${tx(e.x)}" cy="${ty(e.y)}" rx="${e.rx}" ry="${e.ry}" fill="${e.fill || F.stone}" opacity="0.7"/>\n`;
  }

  return s;
}

function featureToSVG(e, tx, ty) {
  const fx = tx(e.x), fy = ty(e.y);
  let s = '';
  switch (e.kind) {
    case 'chest':
      s += `<rect x="${fx-10}" y="${fy}" width="20" height="10" fill="${P.wood}" stroke="${P.darkW}" stroke-width="1"/>`;
      s += `<rect x="${fx-10}" y="${fy-7}" width="20" height="8" fill="${P.wood}" stroke="${P.darkW}" stroke-width="1"/>`;
      s += `<rect x="${fx-2}" y="${fy+3}" width="4" height="4" fill="${P.gold}"/>\n`;
      break;
    case 'altar':
      s += `<rect x="${fx-14}" y="${fy-4}" width="28" height="8" fill="${P.stone2}" stroke="${P.darkW}" stroke-width="1"/>`;
      s += `<rect x="${fx-12}" y="${fy-14}" width="6" height="14" fill="${P.stone2}" stroke="${P.darkW}" stroke-width="1"/>`;
      s += `<rect x="${fx+6}" y="${fy-14}" width="6" height="14" fill="${P.stone2}" stroke="${P.darkW}" stroke-width="1"/>\n`;
      break;
    case 'well':
      s += `<circle cx="${fx}" cy="${fy}" r="12" fill="${P.wallW}"/>`;
      s += `<circle cx="${fx}" cy="${fy}" r="8" fill="${P.water}"/>\n`;
      break;
    case 'barrel':
      s += `<circle cx="${fx}" cy="${fy}" r="9" fill="${P.wood}" stroke="${P.darkW}" stroke-width="1.5"/>`;
      s += `<line x1="${fx-9}" y1="${fy}" x2="${fx+9}" y2="${fy}" stroke="${P.darkW}" stroke-width="1.5"/>\n`;
      break;
    case 'candle':
      s += `<rect x="${fx-3}" y="${fy-8}" width="6" height="14" fill="${P.floor}" stroke="${P.darkW}" stroke-width="0.8"/>`;
      s += `<circle cx="${fx}" cy="${fy-10}" r="3" fill="${P.gold}"/>\n`;
      break;
    case 'ritual':
      s += `<circle cx="${fx}" cy="${fy}" r="16" fill="none" stroke="${P.darkW}" stroke-width="1" stroke-dasharray="4,3"/>`;
      s += `<circle cx="${fx}" cy="${fy}" r="8" fill="none" stroke="${P.darkW}" stroke-width="1"/>`;
      s += `<circle cx="${fx}" cy="${fy}" r="3" fill="${P.dark}"/>\n`;
      break;
    case 'bars': {
      let bs = '';
      for (let i = -2; i <= 2; i++) bs += `<rect x="${fx+i*5-1}" y="${fy-12}" width="2" height="24" fill="${P.darkW}"/>`;
      s += bs + `<rect x="${fx-13}" y="${fy-2}" width="26" height="2" fill="${P.darkW}"/>\n`;
      break;
    }
    default: s += `<circle cx="${fx}" cy="${fy}" r="6" fill="${P.gold}" opacity="0.6"/>\n`;
  }
  return s;
}

// ── JSON Export ──────────────────────────────────────────────
function exportJSON() {
  const data = {
    version:  '2.0',
    seed:     scene.seed,
    title:    scene.title,
    palette:  { dungeon: P, outdoor: F },
    grid: {
      type:  document.getElementById('grid-type').value,
      size:  +document.getElementById('grid-size').value,
    },
    entities: scene.entities,
  };
  dl(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
     `dungeon-${scene.seed || 'map'}.json`);
}

// ── Download helper ──────────────────────────────────────────
function dl(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
}
