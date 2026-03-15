/**
 * tools/history.js
 * Undo / redo history stack using JSON scene snapshots.
 * Max 60 snapshots retained; older entries are discarded.
 */

'use strict';

let hist    = [];
let histIdx = -1;

function saveHist() {
  const snap = JSON.stringify({ entities: scene.entities, nextId: scene.nextId });
  hist = hist.slice(0, histIdx + 1);
  hist.push(snap);
  if (hist.length > 60) hist.shift();
  histIdx = hist.length - 1;
}

function undo() {
  if (histIdx > 0) { histIdx--; _restoreHist(); }
}

function redo() {
  if (histIdx < hist.length - 1) { histIdx++; _restoreHist(); }
}

function _restoreHist() {
  const s = JSON.parse(hist[histIdx]);
  scene.entities = s.entities;
  scene.nextId   = s.nextId;
  pen.selIds     = [];
  render();
}
