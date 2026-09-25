// The brain of a rival car. It turns "where am I on the road, where is the player" into the same
// throttle / brake / steer numbers a person would press, so rivals drive on the real car physics
// and can spin, flip and get launched just like you.
//
//  * Cruise: follow the road a little way ahead, in its own lane, slowing for corners and for
//    slower cars in front.
//  * Hunt: now and then an aggressive rival picks the player as a target, aims at where the player
//    is going to be, and rams. The nastier ones use their nitro for the last stretch.
//  * Stuck: reverse out from a wall, and (in derby.js) get put back on the road if truly lost.
//
// Nothing here imports three.js.

import { clamp } from './math.js';
import { Track, SURF } from './track.js';

export const IDLE = Object.freeze({ throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false });

export const AI = {
  cruiseMin: 19, cruiseMax: 28,     // m/s a rival is happy to cruise at (about 42 - 63 mph)
  huntMax: 36,                      // m/s when chasing the player
  aLatCruise: 7.0, aLatHunt: 9.0,   // cornering g-budget (m/s^2) used to pick corner speeds
  huntRange: 110,                   // m: nobody starts hunting from further away than this
  jumpSpeed: 30,                    // m/s to take a jump gap at
};

/** Largest corner curvature in the next `span` metres. */
function curvAhead(track, s, span = 130) {
  let k = 0;
  for (let o = 0; o < span; o += 12) {
    const i = Math.floor(((s + o) % track.length + track.length) % track.length / track.ds) % track.n;
    k = Math.max(k, Math.abs(track.curv[i]));
  }
  return k;
}

/** Is there a jump gap in the road within the next `span` metres? */
function gapAhead(track, s, span = 90) {
  for (let o = 0; o < span; o += 6) {
    const i = Math.floor(((s + o) % track.length + track.length) % track.length / track.ds) % track.n;
    if (track.gap[i]) return true;
  }
  return false;
}

export class Driver {
  /** `rng` is a function returning 0..1 (so the tests are repeatable); `aggr` 0..1 is how nasty this one is. */
  constructor(rng, aggr = 0.25 + rng() * 0.55) {
    this.rng = rng;
    this.aggr = aggr;
    this.cruise = AI.cruiseMin + rng() * (AI.cruiseMax - AI.cruiseMin);
    this.lane = (rng() - 0.5) * 1.3;          // preferred lane: -0.65 .. 0.65 of the usable half width
    this.laneNow = this.lane;
    this.mood = 'cruise';
    this.moodT = 3 + rng() * 6;
    this.stuck = 0; this.reverse = 0; this.revSteer = 0;
    this.s = 0; this.sT = 0;
    this.q = Track.newQuery(); this.q2 = Track.newQuery();
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.target = false;                      // is it currently aiming at the player?
  }

  /**
   * One decision. `car` is this rival's Vehicle, `ctx` = { player: Vehicle | null, cars: Vehicle[] (everyone else) }.
   * Returns a reused input object.
   */
  drive(car, track, ctx, dt) {
    const inp = this.input;
    const fx = car.az.x, fz = car.az.z;

    // ---------------------------------------------------------------- where am I
    this.sT -= dt;
    if (this.sT <= 0) { this.s = track.progressAt(car.pos.x, car.pos.y, car.pos.z); this.sT = 0.06; }
    const s = this.s;

    // ---------------------------------------------------------------- mood
    const P = ctx.player;
    this.moodT -= dt;
    let pd = Infinity, pRoad = false, pLane = 0;
    if (P) {
      pd = Math.hypot(P.pos.x - car.pos.x, P.pos.z - car.pos.z);
      if (Math.abs(P.pos.y - car.pos.y) < 6) {
        track.query(P.pos.x, P.pos.y + 0.5, P.pos.z, this.q, 1.5);
        pRoad = this.q.idx >= 0 && Math.abs(this.q.d) < this.q.hw + 0.5;
        if (pRoad) pLane = clamp(this.q.d / Math.max(2, this.q.hw - 3.6), -0.85, 0.85);   // which lane you are in
      }
    }
    if (this.moodT <= 0) {
      if (this.mood === 'hunt') { this.mood = 'cruise'; this.moodT = 4 + this.rng() * 6 / (0.4 + this.aggr); }
      else if (P && pRoad && pd < AI.huntRange && this.rng() < this.aggr) { this.mood = 'hunt'; this.moodT = 5 + this.rng() * 6; }
      else this.moodT = 1.5 + this.rng() * 2;
    }
    const hunting = this.mood === 'hunt' && !!P && pRoad && pd < AI.huntRange * 1.6;
    this.target = hunting;

    // ---------------------------------------------------------------- where to aim
    const look = Math.max(11, car.speed * 0.55);
    const f = track.frameAt(s + look);
    const usable = Math.max(2, f.hw - 3.6);
    let ax, az, vT;
    const k = curvAhead(track, s);
    const aLat = hunting ? AI.aLatHunt : AI.aLatCruise;
    vT = Math.min(hunting ? AI.huntMax : this.cruise, Math.sqrt(aLat / Math.max(k, 1e-4)));

    if (hunting) {
      // aim where the player will be by the time we get there
      const lead = clamp(pd / Math.max(car.speed + 8, 16), 0, 1.2);
      const tx = P.pos.x + P.vel.x * lead, tz = P.pos.z + P.vel.z * lead;
      // Only cut straight across when the whole line is road. Otherwise stay on the road and
      // come up the lane the player is in, so a hunter never drives itself into a barrier.
      // ...and never try to U-turn onto a player who has gone past: give up the hunt and pick up the road again.
      const angT = Math.atan2(fz * (tx - car.pos.x) - fx * (tz - car.pos.z), fx * (tx - car.pos.x) + fz * (tz - car.pos.z));
      const behind = Math.abs(angT) > 1.3;
      if (behind) this.moodT = Math.min(this.moodT, 1.2);
      let clear = pd < 45 && !behind;
      for (let t = 0.25; clear && t <= 1.001; t += 0.25) {
        const x = car.pos.x + (tx - car.pos.x) * t, z = car.pos.z + (tz - car.pos.z) * t;
        track.query(x, car.pos.y + 0.5, z, this.q2, 1.5);
        clear = this.q2.idx >= 0 && Math.abs(this.q2.d) < this.q2.hw - 1.4 && Math.abs(this.q2.y - car.pos.y) < 3;
      }
      if (clear) { ax = tx; az = tz; }
      else { ax = f.x + f.lx * pLane * usable; az = f.z + f.lz * pLane * usable; }
      vT = Math.max(vT, Math.min(AI.huntMax, P.speed + 3 + pd * 0.12));
      if (pd < 14 && clear) vT = AI.huntMax;                 // committed: just go for it
    } else {
      ax = f.x + f.lx * this.laneNow * usable; az = f.z + f.lz * this.laneNow * usable;
    }

    // ---------------------------------------------------------------- other cars in the way
    let laneBias = 0, brake = 0;
    for (const o of ctx.cars) {
      if (o === car || (hunting && o === P)) continue;
      const rx = o.pos.x - car.pos.x, rz = o.pos.z - car.pos.z;
      const ahead = rx * fx + rz * fz;
      if (ahead < 0 || ahead > 20) continue;
      const side = rx * car.ax.x + rz * car.ax.z;            // + = it is on our left
      if (Math.abs(side) > 2.6 || Math.abs(o.pos.y - car.pos.y) > 2.5) continue;
      laneBias += side > 0 ? -1 : 1;
      const gap = ahead - 4.7;
      if (gap < 12 && car.fwdSpeed > o.fwdSpeed) { vT = Math.min(vT, Math.max(4, o.speed - 1 + gap * 0.4)); brake = Math.max(brake, 0.3); }
    }
    this.laneNow += clamp((this.lane + clamp(laneBias, -1, 1) * 0.5 - this.laneNow) * 0.9 * dt, -0.6 * dt, 0.6 * dt);
    this.laneNow = clamp(this.laneNow, -0.85, 0.85);

    // ---------------------------------------------------------------- jumps: commit or don't
    const jump = !hunting && gapAhead(track, s);
    if (jump) { vT = Math.max(vT, AI.jumpSpeed); ax = f.x; az = f.z; }

    // ---------------------------------------------------------------- steer
    const dx = ax - car.pos.x, dz = az - car.pos.z;
    const ang = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);      // + = target is on our left
    let steer = clamp(ang * 2.2, -1, 1);
    if (jump) steer = clamp(steer, -0.25, 0.25);

    // ---------------------------------------------------------------- pedals
    const err = vT - car.fwdSpeed;
    let throttle = err > 0 ? clamp(err / 4, 0, 1) : 0;
    let brk = err < -2 && car.fwdSpeed > 3 ? clamp(-err / 6, 0, 1) : 0;
    if (hunting && Math.abs(ang) > 1.1 && car.fwdSpeed > 14) { throttle *= 0.4; brk = Math.max(brk, 0.25); }   // turn first, then charge
    brk = Math.max(brk, err < 0 ? brake : 0);

    // ---------------------------------------------------------------- stuck: back out
    if (this.reverse > 0) {
      this.reverse -= dt;
      steer = -this.revSteer; throttle = 0; brk = 1;
      if (this.reverse <= 0) this.stuck = 0;
    } else if (throttle > 0.3 && car.speed < 1.4 && car.ay.y > 0.5) {
      this.stuck += dt;
      if (this.stuck > 1.6) { this.reverse = 1.3; this.revSteer = steer || (this.rng() < 0.5 ? 1 : -1); }
    } else this.stuck = Math.max(0, this.stuck - dt * 2);

    inp.throttle = throttle; inp.brake = brk; inp.steer = steer; inp.handbrake = false;
    // The nastier ones fire the nitro for the last run at the player
    inp.boost = hunting && this.aggr > 0.7 && pd > 18 && pd < 75 && Math.abs(ang) < 0.15 && car.fwdSpeed > 12 && car.boostFuel > 0.3;
    return inp;
  }
}

/** Is this car on a real road surface (as opposed to embankment or open ground)? */
export function onRoad(track, car, q = Track.newQuery()) {
  track.query(car.pos.x, car.pos.y + 0.5, car.pos.z, q, 1.2);
  return q.surface === SURF.ROAD;
}
