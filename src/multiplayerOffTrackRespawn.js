import { Multiplayer } from './multiplayer.js';
import { getCurrentLife } from './mplife.js';
import { SURF } from './track.js';
import { Particles } from './effects.js';

// Multiplayer off-track recovery mirrors the single-player timing:
// 2.5 s genuinely off the road -> explosion + small lift -> keep real momentum/tumble
// through 3-2-1 -> respawn with full health.
//
// Cleanup note: this module no longer patches Life or Vehicle. main.js already sends IDLE input
// whenever derby.over is true, so the real Vehicle physics keep running without driver input.
const OFFTRACK_EXPLODE_DELAY = 2.5;
const LEGACY_GUARD_DELAY = 1.3;
const RESET_DELAY = 3;
const EXPLOSION_LIFT = 3.2;

const state = {
  heartbeat: 0,
  offT: 0,
  active: false,
  t: 0,
  shown: 0,
  oldOver: false,
  guardActive: false,
  lastNetState: null,
  particles: null,
  lastFrame: performance.now(),
};

// main.js calls sendState every multiplayer frame. Keep this one small networking hook so remote
// clients see an off-track cinematic as a wreck/explosion instead of a live car snapping home.
const oldSendState = Multiplayer.prototype.sendState;
Multiplayer.prototype.sendState = function patchedSendState(s, ...rest) {
  state.heartbeat = performance.now();
  state.lastNetState = s;
  if (state.active) s = { ...s, health: 0, alive: false };
  return oldSendState.call(this, s, ...rest);
};

function banner(n) {
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = String(n);
  b.classList.add('show');
}

function clearBanner() {
  document.getElementById('banner')?.classList.remove('show');
}

function multiplayerLive() {
  return document.body.classList.contains('mode-drive') && performance.now() - state.heartbeat < 500;
}

function isGapFlight(track, car) {
  const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
  const fr = track.frameAt(s);
  const lane = Math.abs((car.pos.x - fr.x) * fr.lx + (car.pos.z - fr.z) * fr.lz);
  const gi = Math.floor(((s % track.length) + track.length) % track.length / track.ds) % track.n;
  return !!track.gap[gi] && lane < fr.hw + 2.5;
}

function localBlast(game) {
  if (!state.particles) state.particles = new Particles(game.stage.scene);
  state.particles.blast(game.car.pos.x, game.car.pos.y, game.car.pos.z, 2);
}

function begin(game) {
  state.active = true;
  state.t = RESET_DELAY;
  state.shown = 3;
  // If the legacy-reset guard is already holding derby.over=true, keep the ORIGINAL value
  // from before the guard so the final respawn can restore it correctly.
  if (!state.guardActive) state.oldOver = !!game.derby.over;
  state.guardActive = false;
  game.derby.over = true;                 // blocks legacy respawn and makes main.js feed IDLE input
  game.car.vel.y += EXPLOSION_LIFT;       // same lift as single-player
  localBlast(game);
  banner(3);
}

function finish(game) {
  clearBanner();
  state.active = false;
  state.offT = 0;
  game.derby.over = state.oldOver;
  getCurrentLife()?.reset();              // off-track reset returns at full multiplayer health
  game.respawn();                         // same lap, last safe road position
}

function clearGuard(game) {
  if (!state.guardActive) return;
  game.derby.over = state.oldOver;
  state.guardActive = false;
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.particles) state.particles.update(dt);

  const game = window.__game;
  if (!game?.track || !game.car || !game.derby || !multiplayerLive()) {
    if (game?.derby && !state.active) clearGuard(game);
    state.offT = 0;
    return;
  }

  if (state.active) {
    state.t -= dt;
    const n = Math.max(1, Math.ceil(state.t));
    if (state.t > 0 && n !== state.shown) { state.shown = n; banner(n); }
    if (state.t <= 0) finish(game);
    return;
  }

  // Do not start a second off-track reset while normal multiplayer damage/death respawn is running.
  if (state.lastNetState && (state.lastNetState.alive === false || (state.lastNetState.health ?? 1) <= 0)) {
    clearGuard(game);
    state.offT = 0;
    return;
  }

  const q = game.track.query(game.car.pos.x, game.car.pos.y + 0.5, game.car.pos.z, undefined, 1.2);
  let off = q.idx < 0 || q.surface === SURF.BASE;
  if (off && isGapFlight(game.track, game.car)) off = false;

  state.offT = off ? state.offT + dt : 0;

  // main.js still has its old 1.4 s lost-car reset. Hold that system off after 1.3 s,
  // but wait the full 2.5 s before the explosion, matching single-player.
  if (off && state.offT > LEGACY_GUARD_DELAY && !state.guardActive) {
    state.oldOver = !!game.derby.over;
    state.guardActive = true;
    game.derby.over = true;
  }
  if (!off) clearGuard(game);

  if (game.car.pos.y < -8 || state.offT > OFFTRACK_EXPLODE_DELAY) begin(game);
}

requestAnimationFrame(tick);
