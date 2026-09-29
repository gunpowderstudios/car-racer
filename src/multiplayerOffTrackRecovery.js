import { getCurrentLife } from './mplife.js';
import { SURF } from './track.js';

// Multiplayer off-track recovery, called explicitly from Multiplayer.sendState() each frame.
// No prototype patches and no separate requestAnimationFrame loop: this is now part of the
// normal multiplayer update path.
const OFFTRACK_EXPLODE_DELAY = 2.5;
const LEGACY_GUARD_DELAY = 1.3;
const RESET_DELAY = 3;
const EXPLOSION_LIFT = 3.2;

const state = {
  offT: 0,
  active: false,
  t: 0,
  shown: 0,
  oldOver: false,
  guardActive: false,
  particles: null,
  lastFrame: 0,
};

function banner(n) {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = String(n);
  b.classList.add('show');
}

function clearBanner() {
  if (typeof document === 'undefined') return;
  document.getElementById('banner')?.classList.remove('show');
}

function isGapFlight(track, car) {
  const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
  const fr = track.frameAt(s);
  const lane = Math.abs((car.pos.x - fr.x) * fr.lx + (car.pos.z - fr.z) * fr.lz);
  const gi = Math.floor(((s % track.length) + track.length) % track.length / track.ds) % track.n;
  return !!track.gap[gi] && lane < fr.hw + 2.5;
}

async function localBlast(game) {
  try {
    if (!state.particles) {
      const { Particles } = await import('./effects.js');
      state.particles = new Particles(game.stage.scene);
    }
    state.particles.blast(game.car.pos.x, game.car.pos.y, game.car.pos.z, 2);
  } catch {
    // Explosion visuals are cosmetic; recovery must still complete if effects fail to load.
  }
}

function clearGuard(game) {
  if (!state.guardActive) return;
  game.derby.over = state.oldOver;
  state.guardActive = false;
}

function begin(game) {
  state.active = true;
  state.t = RESET_DELAY;
  state.shown = 3;
  if (!state.guardActive) state.oldOver = !!game.derby.over;
  state.guardActive = false;
  game.derby.over = true;                 // IDLE input + blocks the old main.js auto-respawn
  game.car.vel.y += EXPLOSION_LIFT;
  void localBlast(game);
  banner(3);
}

function finish(game) {
  clearBanner();
  state.active = false;
  state.offT = 0;
  game.derby.over = state.oldOver;
  getCurrentLife()?.reset();              // back at full multiplayer health
  game.respawn();                         // same lap, last safe road position
}

/**
 * Run one multiplayer off-track recovery update and return the state that should be
 * broadcast to peers. While the cinematic reset is active, peers receive zero health
 * / not-alive so they render the same wreck/explosion state.
 */
export function updateMultiplayerOffTrack(outgoingState) {
  if (typeof window === 'undefined') return outgoingState;
  const game = window.__game;
  if (!game?.track || !game.car || !game.derby) return outgoingState;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = state.lastFrame ? Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000)) : 0;
  state.lastFrame = now;
  state.particles?.update(dt);

  const driving = typeof document !== 'undefined' && document.body.classList.contains('mode-drive');
  if (!driving) {
    if (!state.active) clearGuard(game);
    state.offT = 0;
    return outgoingState;
  }

  if (state.active) {
    state.t -= dt;
    const n = Math.max(1, Math.ceil(state.t));
    if (state.t > 0 && n !== state.shown) { state.shown = n; banner(n); }
    if (state.t <= 0) finish(game);
    if (state.active) return { ...outgoingState, health: 0, alive: false };
    return outgoingState;
  }

  // Normal multiplayer damage/death owns its own respawn; do not start an off-track reset too.
  if (outgoingState && (outgoingState.alive === false || (outgoingState.health ?? 1) <= 0)) {
    clearGuard(game);
    state.offT = 0;
    return outgoingState;
  }

  const q = game.track.query(game.car.pos.x, game.car.pos.y + 0.5, game.car.pos.z, undefined, 1.2);
  let off = q.idx < 0 || q.surface === SURF.BASE;
  if (off && isGapFlight(game.track, game.car)) off = false;

  state.offT = off ? state.offT + dt : 0;

  // main.js still has its old 1.4 s lost-car reset. Hold that off after 1.3 s,
  // then trigger the cinematic explosion at the intended 2.5 s threshold.
  if (off && state.offT > LEGACY_GUARD_DELAY && !state.guardActive) {
    state.oldOver = !!game.derby.over;
    state.guardActive = true;
    game.derby.over = true;
  }
  if (!off) clearGuard(game);

  if (game.car.pos.y < -8 || state.offT > OFFTRACK_EXPLODE_DELAY) begin(game);
  return state.active ? { ...outgoingState, health: 0, alive: false } : outgoingState;
}

export function resetMultiplayerOffTrack() {
  if (typeof window !== 'undefined' && window.__game?.derby && !state.active) clearGuard(window.__game);
  clearBanner();
  state.offT = 0;
  state.active = false;
  state.t = 0;
  state.shown = 0;
  state.guardActive = false;
  state.lastFrame = 0;
}
