/**
 * render/grid.js
 * Grid line drawing utilities.
 *
 * For dungeon maps: grid is drawn clipped inside each floor shape.
 * For outdoor maps: grid is drawn by drawOutdoorBg() — this function
 *   returns early when an outdoor scene entity is present.
 *
 * Grid types: square (dashed lines) | hex (dashed cell edges) | none
 */

'use strict';

/**
 * Draw dashed grid lines clipped to a floor rectangle.
 * Called by drawRoomRect, drawRoomCircle, and drawCorridor after
 * establishing a clip path.
 *
 * @param {number} fx  Floor origin X (world coords)
 * @param {number} fy  Floor origin Y
 * @param {number} fw  Floor width
 * @param {number} fh  Floor height
 */
function drawGridLines(fx, fy, fw, fh) {
  // Outdoor maps handle their own grid inside drawOutdoorBg
  if (isOutdoor()) return;

  const type    = document.getElementById('grid-type').value;
  const visible = LAYERS.find(l => l.id === 'grid')?.visible;
  if (type === 'none' || !visible) return;

  const gs = +document.getElementById('grid-size').value;
  ctx.strokeStyle = P.grid;
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([4, 4]);

  if (type === 'square') {
    ctx.beginPath();
    for (let x = Math.ceil(fx / gs) * gs; x <= fx + fw; x += gs) {
      ctx.moveTo(x, fy); ctx.lineTo(x, fy + fh);
    }
    for (let y = Math.ceil(fy / gs) * gs; y <= fy + fh; y += gs) {
      ctx.moveTo(fx, y); ctx.lineTo(fx + fw, y);
    }
    ctx.stroke();

  } else if (type === 'hex') {
    const hr = gs / 2;
    const hs = gs * Math.sqrt(3) / 2;
    ctx.beginPath();
    const colStart = Math.floor(fx / (gs * 1.5)) - 1;
    const colEnd   = Math.ceil((fx + fw) / (gs * 1.5)) + 1;
    const rowStart = Math.floor(fy / hs) - 1;
    const rowEnd   = Math.ceil((fy + fh) / hs) + 1;
    for (let col = colStart; col < colEnd; col++) {
      for (let row = rowStart; row < rowEnd; row++) {
        const hx = col * gs * 1.5;
        const hy = row * hs + (col % 2 ? hs / 2 : 0);
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i - Math.PI / 6;
          const px = hx + hr * Math.cos(a);
          const py = hy + hr * Math.sin(a);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    }
    ctx.stroke();
  }

  ctx.setLineDash([]);
}
