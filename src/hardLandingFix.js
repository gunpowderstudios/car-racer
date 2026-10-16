// Prevent hard landings from briefly tunnelling the vehicle body through the road.
// We replace Vehicle._bodyGround with the same contact model plus a positional correction
// for deep penetration before the spring forces are applied.
import { V3 } from './math.js';
import { Vehicle } from './vehicle.js';

const HARD_PEN = 0.18;      // metres: deeper than this is treated as tunnelling, not suspension movement
const TARGET_PEN = 0.035;   // leave a tiny amount for the normal contact solver
const MAX_CORR = 0.55;      // never teleport farther than this in one physics step

Vehicle.prototype._bodyGround = function hardLandingBodyGround(track, dt) {
  const kB = 120000, cB = 7000;

  // First pass: find the deepest body point below the road. On a big jump the discrete
  // simulation can advance the car far enough that a bumper/belly/roof point is already
  // visibly inside the surface before the spring can react.
  let deepest = 0, nx = 0, ny = 1, nz = 0;
  for (let i = 0; i < this.spec.hull.length; i++) {
    const p = this.toWorld(this.spec.hull[i], this.hullWorld[i]);
    const q = track.query(p.x, p.y, p.z, this.q, 0.3);
    const pen = q.y - p.y;
    if (pen > deepest) {
      deepest = pen;
      nx = q.nx; ny = q.ny; nz = q.nz;
    }
  }

  if (deepest > HARD_PEN) {
    const corr = Math.min(MAX_CORR, deepest - TARGET_PEN);
    this.pos.x += nx * corr;
    this.pos.y += ny * corr;
    this.pos.z += nz * corr;

    // Remove the velocity component that is still driving the centre of mass into the road.
    // The suspension/body springs can then absorb the landing without catapulting the car back out.
    const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
    if (vn < 0) {
      this.vel.x -= nx * vn;
      this.vel.y -= ny * vn;
      this.vel.z -= nz * vn;
    }
  }

  // Normal body contact pass. Penetration used for force is capped so an unusually deep
  // frame cannot generate an enormous one-frame launch force.
  for (let i = 0; i < this.spec.hull.length; i++) {
    const p = this.toWorld(this.spec.hull[i], this.hullWorld[i]);
    const q = track.query(p.x, p.y, p.z, this.q, 0.3);
    const pen = q.y - p.y;
    if (pen <= 0) continue;

    const r = new V3(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z);
    const v = this.velocityAt(p, new V3());
    const n = new V3(q.nx, q.ny, q.nz);
    const vn = v.dot(n);
    const forcePen = Math.min(pen, HARD_PEN);
    const Fn = Math.max(0, kB * forcePen - (vn < 0 ? cB * vn : 0));
    const F = new V3(n.x * Fn, n.y * Fn, n.z * Fn);

    const vt = new V3(v.x - n.x * vn, v.y - n.y * vn, v.z - n.z * vn);
    const vtl = vt.length();
    if (vtl > 0.05) {
      const fr = Math.min(0.7 * Fn, 0.06 * this.mass * vtl / dt);
      F.addScaled(vt, -fr / vtl);
    }

    this._applyForce(F, p);
    if (Fn > 4000) {
      this.scraping = true;
      if (vn < -2.5) this.events.push({ type: 'ground', speed: -vn, x: p.x, y: p.y, z: p.z });
    }
  }
};
