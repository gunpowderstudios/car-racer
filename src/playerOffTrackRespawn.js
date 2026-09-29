import { Derby, placeOnRoad } from './derby.js';
import { Health, SPECS } from './damage.js';
import { SURF, Track } from './track.js';

// Player off-track recovery in single-player derby mode. If the player is genuinely
// lost off the circuit, explode, hold for a visible 3-2-1 countdown, then reset on road.
const oldStep = Derby.prototype.step;
const q = Track.newQuery();

function showCountdown(n) {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = String(n);
  b.classList.add('show');
}

function clearCountdown() {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('banner');
  if (!b) return;
  b.classList.remove('show');
}

function beginPlayerReset(derby, f) {
  const c = f.car;
  let s = derby.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
  s = (s - 8 + derby.track.length) % derby.track.length;
  f._playerOffTrackReset = { t: 3, s, shown: 3 };
  f._playerOffT = 0;
  f.gone = true;
  f.wrecked = true;
  c.vel.set(0, 0, 0);
  c.angVel.set(0, 0, 0);
  derby.events.push({
    type: 'wreck', id: f.id, isPlayer: true, zone: 'front',
    x: c.pos.x, y: c.pos.y, z: c.pos.z,
    dist: 0, offTrack: true,
  });
  showCountdown(3);
}

Derby.prototype.step = function patchedPlayerOffTrackStep(dt, barrels = null) {
  const f = this.player;
  if (this.enabled && this.track && f) {
    const r = f._playerOffTrackReset;
    if (r) {
      // main.js still advances the local Vehicle before derby.step(), so pin it while the countdown runs.
      f.car.vel.set(0, 0, 0);
      f.car.angVel.set(0, 0, 0);
      r.t -= dt;
      const n = Math.max(1, Math.ceil(r.t));
      if (r.t > 0 && n !== r.shown) { r.shown = n; showCountdown(n); }
      if (r.t <= 0) {
        clearCountdown();
        f._playerOffTrackReset = null;
        f.gone = false;
        f.wrecked = false;
        f.wreckT = 0;
        f.flash = 0;
        f.lastHit = null;
        f.health = new Health(SPECS.player.hp);
        placeOnRoad(f.car, this.track, r.s, 0, 0);
        this._pose(f, f.cur);
        this._pose(f, f.prev);
        this._refreshCars();
      }
    } else if (!f.wrecked && !this.over) {
      const c = f.car;
      this.track.query(c.pos.x, c.pos.y + 0.5, c.pos.z, q, 1.2);
      let off = q.idx < 0 || q.surface === SURF.BASE;

      // A real jump gap is intentionally empty road. Do not count a car that is still
      // travelling through the centre of a gap as "off track" just because there is no deck below it.
      const s = this.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
      const fr = this.track.frameAt(s);
      const lane = Math.abs((c.pos.x - fr.x) * fr.lx + (c.pos.z - fr.z) * fr.lz);
      const gi = Math.floor(((s % this.track.length) + this.track.length) % this.track.length / this.track.ds) % this.track.n;
      if (this.track.gap[gi] && lane < fr.hw + 2.5) off = false;

      f._playerOffT = off ? (f._playerOffT || 0) + dt : 0;
      if (c.pos.y < -8 || f._playerOffT > 1.5) beginPlayerReset(this, f);
    }
  }

  return oldStep.call(this, dt, barrels);
};
