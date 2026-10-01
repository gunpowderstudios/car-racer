import { Derby, placeOnRoad } from './derby.js';
import { Health, SPECS } from './damage.js';
import { IDLE } from './ai.js';
import { SURF, Track } from './track.js';

// Single-player derby off-track recovery, kept in one place so Derby.step is wrapped once.
// Rivals: once clearly lost, explode and tumble for 3-2-1, then return with fresh health.
// Player: 2.5 s genuinely off-track, then explode with a small lift, tumble for 3-2-1,
// then return to the road with fresh health. Real jump gaps are ignored by the detector.
const oldWatch = Derby.prototype._watch;
const oldStep = Derby.prototype.step;
const playerQ = Track.newQuery();

const PLAYER_EXPLODE_DELAY = 2.5;
const PLAYER_LEGACY_GUARD_DELAY = 1.3;
const PLAYER_EXPLOSION_LIFT = 3.2;
const RESET_DELAY = 3;

function showPlayerCountdown(n) {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = String(n);
  b.classList.add('show');
}

function clearPlayerCountdown() {
  if (typeof document === 'undefined') return;
  document.getElementById('banner')?.classList.remove('show');
}

function showRivalCountdown(f, n) {
  if (typeof document === 'undefined') return;
  const feed = document.getElementById('feed');
  if (!feed) return;
  const id = `offtrack-reset-${f.id}`;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'feed-item';
    feed.appendChild(el);
  }
  el.textContent = `Rival reset: ${n}`;
}

function clearRivalCountdown(f) {
  if (typeof document === 'undefined') return;
  document.getElementById(`offtrack-reset-${f.id}`)?.remove();
}

function isGapFlight(track, car) {
  const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
  const fr = track.frameAt(s);
  const lane = Math.abs((car.pos.x - fr.x) * fr.lx + (car.pos.z - fr.z) * fr.lz);
  const gi = Math.floor(((s % track.length) + track.length) % track.length / track.ds) % track.n;
  return !!track.gap[gi] && lane < fr.hw + 2.5;
}

// If the player falls at a bridge gap, respawn on the solid road on the OTHER side in
// the direction the car was travelling. The previous version searched -3..+3 and could
// grab a gap sample behind the car first, which sent the player back to the approach side.
function afterNearbyGap(track, car) {
  if (!track?.gap?.length || !track.n || !track.ds) return null;
  const L = track.length;
  const s = ((track.progressAt(car.pos.x, car.pos.y, car.pos.z) % L) + L) % L;
  const i0 = Math.floor(s / track.ds) % track.n;

  // Decide which way along the centreline the car was moving. If it is almost stationary,
  // use the direction its nose is pointing instead. Positive means increasing track progress.
  const tx = track.tx?.[i0] ?? 0, tz = track.tz?.[i0] ?? 0;
  let along = (car.vel?.x ?? 0) * tx + (car.vel?.z ?? 0) * tz;
  if (Math.abs(along) < 0.5) along = (car.az?.x ?? 0) * tx + (car.az?.z ?? 0) * tz;
  const dir = along < 0 ? -1 : 1;

  // Search current sample first, then samples AHEAD in the travel direction before looking behind.
  const offsets = [0, dir, dir * 2, dir * 3, -dir, -dir * 2, -dir * 3];
  let gapIndex = -1;
  for (const d of offsets) {
    const i = (i0 + d + track.n) % track.n;
    if (track.gap[i]) { gapIndex = i; break; }
  }
  if (gapIndex < 0) return null;

  // Walk through the gap in the direction of travel until we reach solid road, then add
  // an 8 m safety margin so the car cannot be placed on the lip/edge of the gap.
  let i = gapIndex, steps = 0;
  while (track.gap[i] && steps < track.n) {
    i = (i + dir + track.n) % track.n;
    steps++;
  }
  if (steps >= track.n) return null;
  return ((i * track.ds + dir * 8) % L + L) % L;
}

function beginRivalReset(derby, f) {
  const c = f.car;
  const s = derby.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
  f._offTrackReset = { t: RESET_DELAY, s: (s + 10) % derby.track.length, shown: 3 };
  f.inp = IDLE;
  f.wrecked = true;
  f.gone = false;
  derby.events.push({
    type: 'wreck', id: f.id, isPlayer: false, zone: 'front',
    x: c.pos.x, y: c.pos.y, z: c.pos.z,
    dist: derby._dist(c.pos.x, c.pos.y, c.pos.z), offTrack: true,
  });
  showRivalCountdown(f, 3);
}

function finishRivalReset(derby, f, r) {
  clearRivalCountdown(f);
  f._offTrackReset = null;
  f.gone = false;
  f.wrecked = false;
  f.wreckT = 0;
  f.expire = false;
  f.expireT = 0;
  f.flash = 0;
  f.age = 0;
  f.health = new Health(SPECS.rival.hp);
  f.lastHit = null;
  f.idleT = f.offT = f.flipT = 0;
  if (f.driver) {
    f.driver.stuck = 0;
    f.driver.reverse = 0;
    f.driver.grudgeT = 0;
  }
  placeOnRoad(f.car, derby.track, r.s, 0, (f.driver ? f.driver.cruise : 20) * 0.55);
  derby._pose(f, f.cur);
  derby._pose(f, f.prev);
  derby._refreshCars();
}

function clearPlayerGuard(derby, f) {
  if (!f._playerOffTrackGuard) return;
  derby.over = !!f._playerOffTrackGuard.oldOver;
  f._playerOffTrackGuard = null;
}

function beginPlayerReset(derby, f) {
  const c = f.car;
  const L = derby.track.length;
  const gapRespawn = afterNearbyGap(derby.track, c);
  let s = gapRespawn;
  if (!Number.isFinite(s)) {
    s = derby.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
    s = (s - 8 + L) % L;
  }
  const oldOver = f._playerOffTrackGuard ? f._playerOffTrackGuard.oldOver : derby.over;
  f._playerOffTrackReset = { t: RESET_DELAY, s, shown: 3, oldOver };
  f._playerOffTrackGuard = null;
  f._playerOffT = 0;
  f.gone = false;
  f.wrecked = true;

  // The legacy main.js recovery refuses to run while derby.over is true. Keep that guard
  // only for the cinematic reset; the core cleanup can remove this dependency later.
  derby.over = true;
  c.vel.y += PLAYER_EXPLOSION_LIFT;

  derby.events.push({
    type: 'wreck', id: f.id, isPlayer: true, zone: 'front',
    x: c.pos.x, y: c.pos.y, z: c.pos.z,
    dist: 0, offTrack: true,
  });
  showPlayerCountdown(3);
}

function finishPlayerReset(derby, f, r) {
  clearPlayerCountdown();
  f._playerOffTrackReset = null;
  f.gone = false;
  f.wrecked = false;
  f.wreckT = 0;
  f.flash = 0;
  f.lastHit = null;
  f.health = new Health(SPECS.player.hp);
  derby.over = !!r.oldOver;
  placeOnRoad(f.car, derby.track, r.s, 0, 0);
  derby._pose(f, f.cur);
  derby._pose(f, f.prev);
  derby._refreshCars();
}

function stepPlayerRecovery(derby, dt) {
  const f = derby.player;
  if (!derby.enabled || !derby.track || !f) return;

  const r = f._playerOffTrackReset;
  if (r) {
    r.t -= dt;
    const n = Math.max(1, Math.ceil(r.t));
    if (r.t > 0 && n !== r.shown) { r.shown = n; showPlayerCountdown(n); }
    if (r.t <= 0) finishPlayerReset(derby, f, r);
    return;
  }
  if (f.wrecked) return;

  const c = f.car;
  derby.track.query(c.pos.x, c.pos.y + 0.5, c.pos.z, playerQ, 1.2);
  let off = playerQ.idx < 0 || playerQ.surface === SURF.BASE;
  if (off && isGapFlight(derby.track, c)) off = false;

  f._playerOffT = off ? (f._playerOffT || 0) + dt : 0;

  if (off && f._playerOffT > PLAYER_LEGACY_GUARD_DELAY && !f._playerOffTrackGuard) {
    f._playerOffTrackGuard = { oldOver: derby.over };
    derby.over = true;
  }
  if (!off) clearPlayerGuard(derby, f);

  if (c.pos.y < -8 || f._playerOffT > PLAYER_EXPLODE_DELAY) beginPlayerReset(derby, f);
}

function stepRivalResets(derby, dt) {
  if (!derby.track) return;
  for (const f of derby.fighters) {
    const r = f._offTrackReset;
    if (!r) continue;
    r.t -= dt;
    const n = Math.max(1, Math.ceil(r.t));
    if (r.t > 0 && n !== r.shown) { r.shown = n; showRivalCountdown(f, n); }
    if (r.t <= 0) finishRivalReset(derby, f, r);
  }
}

// Replace only the rival lost-car decision; everything else in Derby._watch remains core behaviour.
Derby.prototype._watch = function cleanedOffTrackWatch(f, dt) {
  if (f._offTrackReset) return;

  const c = f.car;
  this.track.query(c.pos.x, c.pos.y + 0.5, c.pos.z, this._q, 1.2);
  const off = this._q.idx < 0 || this._q.surface === SURF.BASE;
  const nextOffT = off ? (f.offT || 0) + dt : 0;
  const far = this._dist(c.pos.x, c.pos.y, c.pos.z) > 45;

  if (c.pos.y < -8 || (nextOffT > 1.5 && far)) {
    beginRivalReset(this, f);
    return;
  }

  oldWatch.call(this, f, dt);
};

// One Derby.step wrapper now handles both player and rival recovery before the normal derby step.
Derby.prototype.step = function cleanedOffTrackStep(dt, barrels = null) {
  stepPlayerRecovery(this, dt);
  stepRivalResets(this, dt);
  return oldStep.call(this, dt, barrels);
};

// Resetting rivals are intentionally marked wrecked so normal AI/damage ignores them. Count them
// as active so the derby does not spawn a replacement during their 3-2-1 reset.
const aliveDesc = Object.getOwnPropertyDescriptor(Derby.prototype, 'alive');
if (aliveDesc?.get && !Derby.prototype.__offTrackAlivePatched) {
  Object.defineProperty(Derby.prototype, 'alive', {
    configurable: true,
    get() {
      let n = 0;
      for (const f of this.fighters) {
        if (f.isPlayer || f.gone) continue;
        if (!f.wrecked || f._offTrackReset) n++;
      }
      return n;
    },
  });
  Derby.prototype.__offTrackAlivePatched = true;
}
