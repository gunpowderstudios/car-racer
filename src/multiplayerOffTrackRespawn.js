import { Multiplayer } from './multiplayer.js';
import { Vehicle } from './vehicle.js';
import { Life } from './mplife.js';
import { SURF } from './track.js';
import { Particles } from './effects.js';

// Keep multiplayer off-track recovery in step with the single-player derby version:
// 2.5 s genuinely off the road -> explosion + small lift -> keep real momentum/tumble
// through 3-2-1 -> respawn with full health.
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
  lastNetState: null,
  particles: null,
  life: null,
  lastFrame: performance.now(),
};

// main.js owns the multiplayer Life object. Capture it when multiplayer starts (it calls reset()).
const oldLifeReset = Life.prototype.reset;
Life.prototype.reset = function patchedLifeReset(...args) {
  const out = oldLifeReset.apply(this, args);
  state.life = this;
  return out;
};

// main.js calls sendState every multiplayer frame. Use that as a clean multiplayer heartbeat,
// and make remote clients see an off-track wreck as dead/zero-health so they show the same explosion.
const oldSendState = Multiplayer.prototype.sendState;
Multiplayer.prototype.sendState = function patchedSendState(s, ...rest) {
  state.heartbeat = performance.now();
  state.lastNetState = s;
  if (state.active) s = { ...s, health: 0, alive: false };
  return oldSendState.call(this, s, ...rest);
};

// While the cinematic reset is active, nobody is driving the local car. The normal Vehicle physics
// still run, so its existing speed, fall and angular velocity continue naturally after the blast.
const oldVehicleStep = Vehicle.prototype.step;
Vehicle.prototype.step = function patchedVehicleStep(dt, inp, track, ...rest) {
  if (state.active && this === window.__game?.car) {
    inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  }
  return oldVehicleStep.call(this, dt, inp, track, ...rest);
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
  state.oldOver = !!game.derby.over;
  game.derby.over = true;                 // also blocks the old main.js auto-respawn
  game.car.vel.y += EXPLOSION_LIFT;       // exactly the same lift as single-player
  localBlast(game);
  banner(3);
}

function finish(game) {
  clearBanner();
  state.active = false;
  state.offT = 0;
  game.derby.over = state.oldOver;
  state.life?.reset();                    // off-track reset returns at full multiplayer health
  game.respawn();                         // same lap, last safe road position
}

function clearGuard(game) {
  if (!state.active && game.derby.over && !state.oldOver) game.derby.over = false;
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
  state.lastFrame = now;
  if (state.particles) state.particles.update(dt);

  const game = window.__game;
  if (!game?.track || !game.car || !game.derby || !multiplayerLive()) {
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

  // Do not start a second off-track reset while the normal multiplayer damage/death respawn is running.
  if (state.lastNetState && (state.lastNetState.alive === false || (state.lastNetState.health ?? 1) <= 0)) {
    state.offT = 0;
    return;
  }

  const q = game.track.query(game.car.pos.x, game.car.pos.y + 0.5, game.car.pos.z, undefined, 1.2);
  let off = q.idx < 0 || q.surface === SURF.BASE;
  if (off && isGapFlight(game.track, game.car)) off = false;

  state.offT = off ? state.offT + dt : 0;

  // main.js still has its old 1.4 s lost-car reset. Hold that system off after 1.3 s,
  // but wait the full 2.5 s before the explosion, exactly like single-player.
  if (off && state.offT > LEGACY_GUARD_DELAY && !game.derby.over) {
    state.oldOver = !!game.derby.over;
    game.derby.over = true;
  }
  if (!off) clearGuard(game);

  if (game.car.pos.y < -8 || state.offT > OFFTRACK_EXPLODE_DELAY) begin(game);
}

requestAnimationFrame(tick);
