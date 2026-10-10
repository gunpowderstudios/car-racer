// The Oval's open arena: geometry helpers and the free-for-all driver. No three.js in here, so it runs (and is tested) in Node.
//
// An arena is an ordinary track definition (mode 'lastStanding') whose "road" is a very wide strip round a short oval
// centreline - so wide that the strip covers a whole dirt floor, and the existing ground, wall and collision code just works.
// Every point within `hw` metres of the centreline is floor; the wall stands just outside that. All the helpers below
// work from the numbers in the track, so editing the template is enough to change the arena.

import { clamp } from './math.js';
import { Track } from './track.js';

/** The arena's measurements: centre, the centreline ellipse (a, b), floor half-width hw, overall half-sizes ax / az, floor height y. */
export function arenaInfo(track) {
  if (track._arena) return track._arena;
  const H = track.def.handles;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const h of H) { minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x); minZ = Math.min(minZ, h.z); maxZ = Math.max(maxZ, h.z); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, a = (maxX - minX) / 2, b = (maxZ - minZ) / 2, hw = track.def.width / 2;
  return (track._arena = { cx, cz, a, b, hw, ax: a + hw, az: b + hw, y: track.py[0] });
}

/** Points all round the outline of the floor pushed out `r` metres from the centreline (r = hw is the edge of the floor). */
export function arenaOutline(A, r, n = 96) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const th = (k % n) / n * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const t = Math.atan2(A.b * s, A.a * c);                 // the point of the centre ellipse whose outward normal points along th
    out.push({ x: A.cx + A.a * Math.cos(t) + r * c, z: A.cz + A.b * Math.sin(t) + r * s });
  }
  return out;
}

/** Where rival k of `of` starts: spaced round an oval inside the floor, standing still, facing the middle. */
export function arenaSpawn(A, k, of) {
  const th = (k + 0.5) / Math.max(1, of) * Math.PI * 2 + 0.35, rx = A.ax * 0.62, rz = A.az * 0.6;
  const x = A.cx + rx * Math.cos(th), z = A.cz + rz * Math.sin(th);
  const dx = A.cx - x, dz = A.cz - z, d = Math.hypot(dx, dz) || 1;
  return { x, z, fx: dx / d, fz: dz / d };
}

/** The player's start: near the far end of the floor, facing the middle. */
export function arenaPlayerStart(A) {
  return { x: A.cx - (A.ax - 26), z: A.cz, fx: 1, fz: 0 };
}

/**
 * The brain of a rival in the arena. No road to follow: pick a target (derby.js hands over the nearest running car in
 * `ctx.player`), aim where it is going, and ram it - while keeping clear of the wall and backing out when stuck.
 * It offers the same few fields derby.js reads from ai.js's Driver (cruise, grudgeT, stuck, reverse, ...).
 */
export class ArenaDriver {
  constructor(rng, aggr = 0.7 + rng() * 0.3) {
    this.rng = rng; this.aggr = aggr;
    this.cruise = 21 + aggr * 13;                   // m/s flat out (about 47 - 75 mph)
    this.mood = 'hunt'; this.target = false; this.grudgeT = 0;
    this.stuck = 0; this.reverse = 0; this.revSteer = 0; this.steerNow = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.q = Track.newQuery();
  }

  drive(car, track, ctx, dt) {
    const inp = this.input, A = arenaInfo(track), fx = car.az.x, fz = car.az.z;
    const P = ctx.player;
    let ax = A.cx, az = A.cz, vT = 9, dist = Infinity;
    this.target = !!P;
    if (P) {
      dist = Math.hypot(P.pos.x - car.pos.x, P.pos.z - car.pos.z);
      const lead = clamp(dist / Math.max(car.speed + 8, 16), 0, 1);
      ax = P.pos.x + P.vel.x * lead; az = P.pos.z + P.vel.z * lead;
      vT = this.cruise;
    }

    // keep off the wall: how far inside the floor is the point a moment ahead?
    const look = 7 + car.speed * 0.9, px = car.pos.x + fx * look, pz = car.pos.z + fz * look;
    track.query(px, car.pos.y + 0.5, pz, this.q, 1.5);
    const edge = this.q.idx >= 0 ? this.q.hw - Math.abs(this.q.d) : -1;
    let dx = ax - car.pos.x, dz = az - car.pos.z;
    if (edge < 6) {
      const angT = Math.atan2(fz * dz - fx * dx, fx * dx + fz * dz), closeIn = P && dist < 14 && Math.abs(angT) < 0.5;
      if (!closeIn) {                                // turn for the middle and come off the throttle as the wall nears
        ax = A.cx; az = A.cz; dx = ax - car.pos.x; dz = az - car.pos.z;
        vT = Math.min(vT, Math.max(6, 6 + edge * 3));
      }
    }

    const ang = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);      // + = the aim point is on our left
    const steerTarget = clamp(ang * 2.2, -1, 1);
    this.steerNow += clamp(steerTarget - this.steerNow, -3.4 * dt, 3.4 * dt);
    let steer = this.steerNow;

    const err = vT - car.fwdSpeed;
    let throttle = err > 0 ? clamp(0.1 + err / 2.8, 0, 1) : 0;
    let brk = err < -3.5 && car.fwdSpeed > 4 ? clamp((-err - 1) / 8, 0, 1) : 0;
    if (Math.abs(ang) > 1.1 && car.fwdSpeed > 14) { throttle *= 0.5; brk = Math.max(brk, 0.2); }   // turn first, then charge

    if (this.reverse > 0) {                         // wedged against the wall or a wreck: back out
      this.reverse -= dt;
      steer = -this.revSteer; throttle = 0; brk = 1;
      if (this.reverse <= 0) this.stuck = 0;
    } else if (throttle > 0.3 && car.speed < 1.4 && car.ay.y > 0.5) {
      this.stuck += dt;
      if (this.stuck > 1.4) { this.reverse = 1.2; this.revSteer = steer || (this.rng() < 0.5 ? 1 : -1); }
    } else this.stuck = Math.max(0, this.stuck - dt * 2);

    inp.throttle = throttle; inp.brake = brk; inp.steer = steer; inp.handbrake = false;
    inp.boost = this.aggr > 0.5 && !!P && dist > 22 && dist < 95 && Math.abs(ang) < 0.15 && car.fwdSpeed > 13 && car.boostFuel > 0.2 && edge > 12;
    return inp;
  }
}
