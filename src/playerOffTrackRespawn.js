import { Derby, placeOnRoad } from './derby.js';
import { Health, SPECS } from './damage.js';
import { SURF, Track } from './track.js';

// Player off-track recovery in single-player derby mode. If the player is genuinely
// lost off the circuit, explode, keep the real Vehicle physics running for a visible
// 3-2-1 countdown (so a flying/tumbling car keeps moving), then reset on road.
const oldStep = Derby.prototype.step;
const q = Track.newQuery();
const OFFTRACK_EXPLODE_DELAY = 2.5;
const LEGACY_GUARD_DELAY = 1.3;   // main.js legacy auto-reset fires at 1.4 s, so hold it off first

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

function clearLegacyGuard(derby, f) {
  if (!f._playerOffTrackGuard) return;
  derby.over = !!f._playerOffTrackGuard.oldOver;
  f._playerOffTrackGuard = null;
}

function beginPlayerReset(derby, f) {
  const c = f.car;
  let s = derby.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
  s = (s - 8 + derby.track.length) % derby.track.length;
  const oldOver = f._playerOffTrackGuard ? f._playerOffTrackGuard.oldOver : derby.over;
  f._playerOffTrackReset = { t: 3, s, shown: 3, oldOver };
  f._playerOffTrackGuard = null;
  f._playerOffT = 0;
  f.gone = false;
  f.wrecked = true;       // disables further damage/targeting, but main.js still steps the Vehicle normally

  // Keep the legacy main.js auto-respawn blocked throughout the cinematic reset.
  derby.over = true;

  // Deliberately keep velocity and angular velocity: the wreck should continue its fall/tumble.
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
      // main.js advances the local Vehicle before derby.step(). this.over also makes its input IDLE,
      // so momentum, gravity, drag, impacts and angular velocity continue naturally with no driver input.
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
        this.over = !!r.oldOver;
        placeOnRoad(f.car, this.track, r.s, 0, 0);
        this._pose(f, f.cur);
        this._pose(f, f.prev);
        this._refreshCars();
      }
    } else if (!f.wrecked) {
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

      // The old recovery in main.js would still snap the car back after 1.4 seconds. Block that
      // without exploding yet, so the new player-facing delay can be a full 2.5 seconds.
      if (off && f._playerOffT > LEGACY_GUARD_DELAY && !f._playerOffTrackGuard) {
        f._playerOffTrackGuard = { oldOver: this.over };
        this.over = true;
      }
      if (!off) clearLegacyGuard(this, f);

      if (c.pos.y < -8 || f._playerOffT > OFFTRACK_EXPLODE_DELAY) beginPlayerReset(this, f);
    }
  }

  return oldStep.call(this, dt, barrels);
};
