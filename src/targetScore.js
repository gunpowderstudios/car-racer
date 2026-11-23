// A bullseye on an ordinary track: land on it and you score. No three.js in here (it runs, and is tested, in Node); main.js shows the result.
// You are "in the air" once the car has been off the ground for a moment; the touchdown is where the wheels come down again. The ring that
// touchdown is in gives the points (the same rings and points as Weeval Knievel), plus a bonus for coming down level.

import { WEEVAL } from './weeval.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Points for a touchdown at (x, z) with this bullseye, or null if it is outside the outer ring. */
export function targetRing(t, x, z) {
  const d = Math.hypot(x - t.x, z - t.z), r = WEEVAL.rings;
  for (let i = 0; i < r.length; i++) if (d <= r[i]) return { ring: i, d, points: WEEVAL.points[i] };
  return null;
}

export class TargetScore {
  /** `track` is the Track; its target props are the bullseyes. */
  constructor(track) { this.track = track; this.targets = (track.def.props || []).filter((p) => p.type === 'target'); this.total = 0; this.best = 0; this.events = []; this.air = 0; this.reset(); }
  get any() { return this.targets.length > 0; }
  reset() { this.air = 0; this.cool = 0; }
  /** One physics step: the car is `car` (pos, onGround, ay, speed). Pushes { type: 'land', ring, points, flat, tilt, d } when it comes down on a bullseye. */
  step(dt, car) {
    if (!this.targets.length) return;
    this.cool = Math.max(0, this.cool - dt);
    if (!car.onGround) { this.air += dt; return; }
    const was = this.air; this.air = 0;
    if (was < 0.4 || this.cool > 0) return;                                  // (a bump is not a jump)
    for (const t of this.targets) {
      const hit = targetRing(t, car.pos.x, car.pos.z);
      if (!hit || Math.abs(car.pos.y - (t.y + (t.up || 0))) > 6) continue;
      const q = this.track.query(car.pos.x, car.pos.y + 2, car.pos.z), dot = clamp(car.ay.x * q.nx + car.ay.y * q.ny + car.ay.z * q.nz, -1, 1), tilt = Math.acos(dot) * 180 / Math.PI;
      const flat = tilt <= WEEVAL.flatDeg && car.ay.y > 0.5, points = hit.points + (flat ? WEEVAL.flatBonus : 0);
      this.total += points; this.best = Math.max(this.best, points); this.cool = 2;
      this.events.push({ type: 'land', ring: hit.ring, d: hit.d, ringPoints: hit.points, points, flat, tilt, total: this.total, air: was });
      return;
    }
  }
}
