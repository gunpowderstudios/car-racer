import { Derby, placeOnRoad } from './derby.js';
import { Health, SPECS } from './damage.js';
import { IDLE } from './ai.js';
import { SURF } from './track.js';

// Rival off-track recovery: if an AI car is genuinely lost off the circuit, explode it,
// let the physical car keep tumbling/coasting for a 3-2-1 countdown, then put the same rival
// back on the road with fresh health. Momentum is deliberately NOT zeroed at the explosion.
const oldWatch = Derby.prototype._watch;
const oldStep = Derby.prototype.step;

function feedCountdown(f, n) {
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

function clearCountdown(f) {
  if (typeof document === 'undefined') return;
  document.getElementById(`offtrack-reset-${f.id}`)?.remove();
}

function beginReset(derby, f) {
  const c = f.car;
  const s = derby.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
  f._offTrackReset = { t: 3, s: (s + 10) % derby.track.length, shown: 3 };
  f.inp = IDLE;
  f.wrecked = true;          // no AI throttle / further damage, but the Vehicle still runs physics
  f.gone = false;            // keep the tumbling car visible for the full countdown

  // Reuse the normal wreck visual/audio event without removing the physical car.
  derby.events.push({
    type: 'wreck', id: f.id, isPlayer: false, zone: 'front',
    x: c.pos.x, y: c.pos.y, z: c.pos.z,
    dist: derby._dist(c.pos.x, c.pos.y, c.pos.z), offTrack: true,
  });
  feedCountdown(f, 3);
}

Derby.prototype._watch = function patchedWatch(f, dt) {
  if (f._offTrackReset) return;

  const c = f.car;
  this.track.query(c.pos.x, c.pos.y + 0.5, c.pos.z, this._q, 1.2);
  const off = this._q.idx < 0 || this._q.surface === SURF.BASE;
  const nextOffT = off ? (f.offT || 0) + dt : 0;
  const far = this._dist(c.pos.x, c.pos.y, c.pos.z) > 45;

  // Give a rival a little chance to recover naturally, but once it is clearly gone,
  // use the cinematic reset instead of silently teleporting it back.
  if (c.pos.y < -8 || (nextOffT > 1.5 && far)) {
    beginReset(this, f);
    return;
  }

  oldWatch.call(this, f, dt);
};

Derby.prototype.step = function patchedStep(dt, barrels = null) {
  if (this.track) {
    for (const f of this.fighters) {
      const r = f._offTrackReset;
      if (!r) continue;

      r.t -= dt;
      const n = Math.max(1, Math.ceil(r.t));
      if (r.t > 0 && n !== r.shown) {
        r.shown = n;
        feedCountdown(f, n);
      }

      if (r.t <= 0) {
        clearCountdown(f);
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
        placeOnRoad(f.car, this.track, r.s, 0, (f.driver ? f.driver.cruise : 20) * 0.55);
        this._pose(f, f.cur);
        this._pose(f, f.prev);
        this._refreshCars();
      }
    }
  }

  return oldStep.call(this, dt, barrels);
};

// Resetting rivals are temporarily marked wrecked so normal AI/damage ignores them. Count them as
// active for population purposes so the derby does not spawn an unnecessary replacement during 3-2-1.
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
