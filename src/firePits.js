// Fire pits for any track: a scorched pit in the road that, at random moments (a warning glow first), shoots a column of flame into the air and throws a car above it.
// They are the same pits as Apple Crumple's (see assault.js `fireAt`), placed from the track editor as props of type 'fire'. No three.js in here (firePitsView.js draws them).
import { COURSE, fireAt, nearestOnCar } from './assault.js';
import { zoneAt } from './damage.js';

export class FirePits {
  constructor() { this.pits = []; this.t = 0; this.events = []; this._cool = new Map(); this._seen = new Map(); }

  load(track) {
    this.pits = (track?.def?.props || []).filter((p) => p.type === 'fire').map((p, i) => {
      const g = track.groundAt(p.x, p.z, (p.y || 0) + 0.5, undefined, true);
      return { x: p.x, z: p.z, y: g && Number.isFinite(g.y) ? g.y : p.y || 0, seed: i + 1, phase: (i * 1.7) % 5.5, period: 5.5 };
    });
    this.reset();
  }
  reset() { this.t = 0; this.events.length = 0; this._cool.clear(); this._seen.clear(); }

  /** Run the pits one step; a car in the flames is thrown up and (where damage is on) wrecked. `derby` may be null. */
  step(dt, car, derby) {
    if (!this.pits.length) return;
    this.t += dt; const F = COURSE.fire; let fresh = false;
    for (let i = 0; i < this.pits.length; i++) {
      const p = this.pits[i], near = Math.abs(car.pos.x - p.x) + Math.abs(car.pos.z - p.z);
      if (near > 90) continue;
      const st = fireAt(p, this.t, F), key = 'f' + i, was = this._seen.get(key), burst = st.state === 'burst';
      this._seen.set(key, burst);
      if (burst && was !== true) this.events.push({ type: 'sfx', name: 'flame', dist: Math.hypot(car.pos.x - p.x, car.pos.z - p.z, (car.pos.y - p.y) * 0.5) });
      if (!burst || near > 30) continue;
      if (!fresh) { car.refreshFrame?.(); fresh = true; }
      const top = F.height * Math.min(1, st.k * 4), hit = { x: 0, y: 0, z: 0 }, dist = nearestOnCar(car, p.x, p.y + 0.5 + Math.min(top, 3) * 0.5, p.z, hit);
      if (dist >= F.r || (this._cool.get(key) ?? -9) > this.t - 1.2) continue;
      this._cool.set(key, this.t);
      const u = { x: 0, y: 1, z: 0 }, inv = car.invMassAt ? car.invMassAt(u, hit) : 0;
      if (inv > 0) car.impulseAt(u, F.launch / inv, hit);
      if (derby?.enabled && derby.damageEnabled && derby.player && derby._damage) derby._damage(derby.player, zoneAt(car, hit.x, hit.y, hit.z), F.hp, null, hit.x, hit.y, hit.z);
      this.events.push({ type: 'hit', kind: 'fire', x: hit.x, y: hit.y, z: hit.z });
    }
  }
}
