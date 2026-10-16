// Shared race-length setting for solo and multiplayer.
// Default is one lap; the host's multiplayer choice is sent with the track definition.
import { Hud } from './hud.js';
import { Multiplayer } from './multiplayer.js';

const DEFAULT_LAPS = 1;
const clampLaps = (v) => Math.max(1, Math.min(3, Math.round(+v || DEFAULT_LAPS)));

function readOpts() {
  try { return JSON.parse(localStorage.getItem('cr.opts')) || {}; } catch { return {}; }
}

function getLaps() {
  const gameLaps = window.__game?.opts?.laps;
  if (Number.isFinite(+gameLaps)) return clampLaps(gameLaps);
  return clampLaps(readOpts().laps ?? DEFAULT_LAPS);
}

function setLaps(v) {
  const laps = clampLaps(v);
  const opts = readOpts();
  opts.laps = laps;
  try { localStorage.setItem('cr.opts', JSON.stringify(opts)); } catch { /* storage unavailable */ }
  if (window.__game?.opts) window.__game.opts.laps = laps;
  return laps;
}

window.__raceLaps = { get: getLaps, set: setLaps };

function installLapOption() {
  if (document.getElementById('opt-laps')) return;
  const grid = document.querySelector('.opt-grid');
  if (!grid) return;
  const label = document.createElement('label');
  label.className = 'sel';
  label.innerHTML = 'Race laps <select id="opt-laps" aria-label="Number of race laps"><option value="1">1 lap</option><option value="2">2 laps</option><option value="3">3 laps</option></select>';
  const rivals = document.getElementById('opt-rivals')?.closest('label');
  if (rivals?.nextSibling) grid.insertBefore(label, rivals.nextSibling); else grid.appendChild(label);
  const sel = label.querySelector('select');
  sel.value = String(getLaps());
  sel.addEventListener('change', () => { sel.value = String(setLaps(sel.value)); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLapOption, { once: true });
else installLapOption();

// Main's lap counter already has the right human-facing sequence (Lap 1, Lap 2, ...).
// Override only the target and finished state so solo and multiplayer use the selected length.
const originalHudUpdate = Hud.prototype.update;
Hud.prototype.update = function raceLengthHudUpdate(car, info) {
  if (info) {
    const target = getLaps();
    const race = window.__game?.race;
    info = { ...info, maxLap: target, finished: !!race && race.index >= target };
  }
  return originalHudUpdate.call(this, car, info);
};

// Multiplayer: the host's selection travels with the track so every player uses the same length.
const originalStartGame = Multiplayer.prototype.startGame;
Multiplayer.prototype.startGame = function raceLengthStartGame(trackDef) {
  const laps = getLaps();
  this._raceLaps = laps;
  const withLaps = trackDef ? { ...trackDef, raceLaps: laps } : trackDef;
  return originalStartGame.call(this, withLaps);
};
