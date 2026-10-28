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
  cruiseMin: 29, cruiseMax: 40,     // m/s a rival is happy to cruise at (about 65 - 89 mph)
  huntMax: 48,                      // m/s when chasing the player (about 107 mph)
  aLatCruise: 8.6, aLatHunt: 10.8, // stage 3: carry still more speed through bends
  huntRange: 125,                   // m: faster rivals can start a hunt from a little further away
  jumpSpeed: 32,                    // m/s to take a jump gap at
  grudgeTime: 7,                    // s: how long a rival holds a grudge and won't give up the chase, once rammed
  grudgeRangeMul: 2.2,              // hunting range is stretched this much further while holding a grudge
  catchupStart: 70,                 // m of road lead before a rival starts getting a small helping hand
  catchupFull: 240,                 // m of road lead where the catch-up bonus reaches its cap
  catchupSpeed: 0.10,               // max +10% target speed, still entirely through normal car physics
  raceMax: 74,                       // absolute target ceiling for arcade race catch-up (~165 mph)
};

/** Rival skill 0..1 (Easy .2, Normal .5 = the original behaviour, Hard .75, Expert 1). One number, a handful of knobs. */
export function skillOf(ctx) { return clamp(ctx && ctx.skill != null ? ctx.skill : 0.5, 0, 1.3); }

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
function gapAhead(track, s, span = 130) {
  let len = 0;
  for (let o = 0; o < span + 80; o += 3) {
    const i = Math.floor(((s + o) % track.length + track.length) % track.length / track.ds) % track.n;
    if (track.gap[i]) len += 3; else if (len) break;       // the first gap's length, so long jumps get more speed
    if (!len && o >= span) break;
  }
  return len;
}

/** Average road climb over the next few car lengths. Positive means uphill.
 *  Using height gain / horizontal distance is deliberately simple and works for random tracks too. */
function gradeAhead(track, s, span = 42) {
  const a = track.frameAt(s);
  const b = track.frameAt(s + span);
  const flat = Math.hypot(b.x - a.x, b.z - a.z);
  return flat > 1 ? (b.y - a.y) / flat : 0;
}

export class Driver {
  /** `rng` is a function returning 0..1 (so the tests are repeatable); `aggr` 0..1 is how nasty this one is. */
  constructor(rng, aggr = 0.25 + rng() * 0.55) {
    this.rng = rng;
    this.aggr = aggr;
    this.cruise = AI.cruiseMin + rng() * (AI.cruiseMax - AI.cruiseMin);
    this.lane = (rng() - 0.5) * 1.3;          // preferred lane: -0.65 .. 0.65 of the usable half width
    this.laneNow = this.lane; this.lane0 = this.lane;
    this.mood = 'cruise';
    this.moodT = 3 + rng() * 6;
    this.stuck = 0; this.reverse = 0; this.revSteer = 0; this.turn = null;
    this.s = 0; this.sT = 0;
    this.q = Track.newQuery(); this.q2 = Track.newQuery();
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.target = false;                      // is it currently aiming at the player?
    this.grudgeT = 0;                         // seconds left holding a grudge after being rammed by the player
    this.steerNow = 0;                        // smoothed steering output, so it can't snap lock to lock
  }

  /**
   * One decision. `car` is this rival's Vehicle, `ctx` = { player: Vehicle | null, cars: Vehicle[] (everyone else) }.
   * Returns a reused input object.
   */
  drive(car, track, ctx, dt) {
    const inp = this.input;
    const fx = car.az.x, fz = car.az.z;
    const sk = skillOf(ctx), d = sk - 0.5;
    const pace = 1 + 0.5 * d;                                   // Expert: 25% quicker everywhere, Easy: 15% slower

    // ---------------------------------------------------------------- where am I
    this.sT -= dt;
    if (this.sT <= 0) { this.s = track.progressAt(car.pos.x, car.pos.y, car.pos.z); this.sT = 0.06; }
    const s = this.s;

    // ---------------------------------------------------------------- mood
    const P = ctx.player;
    this.moodT -= dt;
    this.grudgeT = Math.max(0, this.grudgeT - dt);
    let pd = Infinity, pRoad = false, pLane = 0, playerLead = 0;
    if (P) {
      pd = Math.hypot(P.pos.x - car.pos.x, P.pos.z - car.pos.z);
      if (Math.abs(P.pos.y - car.pos.y) < 6) {
        track.query(P.pos.x, P.pos.y + 0.5, P.pos.z, this.q, 1.5);
        pRoad = this.q.idx >= 0 && Math.abs(this.q.d) < this.q.hw + 0.5;
        if (pRoad) {
          pLane = clamp(this.q.d / Math.max(2, this.q.hw - 3.6), -0.85, 0.85);   // which lane you are in
          playerLead = this.q.s - s;
          if (playerLead > track.length / 2) playerLead -= track.length;
          if (playerLead < -track.length / 2) playerLead += track.length;
        }
      }
    }
    // How hungry the field is for the player (0..1, set per game mode in derby.js): higher means rivals start hunting more often and from
    // further away, hunt for longer, and rest for less - a friend who keeps coming back for another go.
    const hunger = clamp(ctx.huntBias || 0, 0, 1), reach = 1 + 1.5 * hunger;
    const cStart = AI.catchupStart * (1 - 0.6 * Math.max(0, d)), catchup = pRoad ? clamp((playerLead - cStart) / Math.max(1, AI.catchupFull - cStart), 0, 1) : 0;
    if (this.grudgeT > 0 && P && pRoad) { this.mood = 'hunt'; this.moodT = Math.max(this.moodT, 1); }   // rammed: won't let it go
    else if (this.moodT <= 0) {
      if (this.mood === 'hunt') { this.mood = 'cruise'; this.moodT = (4 + this.rng() * 6 / (0.4 + this.aggr)) * (1 - 0.8 * hunger); }
      else if (P && pRoad && pd < AI.huntRange * reach && this.rng() < clamp(this.aggr + hunger, 0, 1)) { this.mood = 'hunt'; this.moodT = (5 + this.rng() * 6) * (1 + hunger); }
      else this.moodT = 1.5 + this.rng() * 2;
    }
    const range = AI.huntRange * (this.grudgeT > 0 ? AI.grudgeRangeMul : 1.6) * reach;
    const hunting = this.mood === 'hunt' && !!P && pRoad && pd < range;
    this.target = hunting;

    // ---------------------------------------------------------------- where to aim
    const look = Math.max(15, car.speed * 0.7);
    const f = track.frameAt(s + look);
    const usable = Math.max(2, f.hw - 3.6);
    let ax, az, vT;
    const k = curvAhead(track, s);
    const tow = (this.towing ? 0.78 : 1) * (track.def.dirt ? 0.88 : 1);     // (loose dirt: less grip, so gentler in the bends too)        // with a caravan on the back: slower, and gentle in the bends so it does not fold up
    const aLat = (hunting ? AI.aLatHunt : AI.aLatCruise) * tow * tow;
    // In a race the rivals cruise as fast as the player's own car has shown it can go (ctx.playerTop, so it follows whichever vehicle was chosen), not at a fixed speed:
    // Normal ~90%, Hard ~95%, Expert 100% of that. Bends still slow them down as before.
    const cruiseV = ctx.racePace && ctx.playerTop > 0 ? Math.max(this.cruise * pace, Math.min(AI.raceMax, ctx.playerTop * (0.8 + 0.2 * sk))) : this.cruise * pace;
    vT = Math.min((hunting ? AI.huntMax * (1 + 0.3 * d) : cruiseV) * tow, Math.sqrt(aLat * (1 + 0.5 * d) / Math.max(k, 1e-4)));

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
      vT = Math.max(vT, Math.min(AI.huntMax * (1 + 0.3 * d), P.speed + 4 + pd * 0.14));
      if (pd < 14 && clear) vT = AI.huntMax * (1 + 0.3 * d);                 // committed: just go for it
    } else {
      // Clever drivers defend: with you close behind them they slide across into your lane to make you work for a pass.
      const block = sk > 0.6 && P && pRoad && playerLead < -3 && playerLead > -32;
      if (block) this.lane += clamp(pLane * 0.8 - this.lane, -1, 1) * Math.min(1, dt * 1.2);
      else if (sk > 0.6) this.lane += (this.lane0 - this.lane) * Math.min(1, dt * 0.3);
      ax = f.x + f.lx * this.laneNow * usable; az = f.z + f.lz * this.laneNow * usable;
    }

    // Stage 3 difficulty: faster base pace plus a modest catch-up bonus when the PLAYER is genuinely ahead.
    // It raises the AI's chosen target speed; it never moves the car or bypasses normal physics.
    if (catchup > 0) vT *= 1 + AI.catchupSpeed * (1 + 2 * d) * catchup;

    // Arcade race pressure: once the player opens a gap, don't let a cautious cruise target make the
    // field give up. Match the player's real pace and ask for a little more on Hard/Expert. This is
    // still only a target speed: the rival must achieve it with its own tyres, gearbox and physics.
    if (ctx.racePace && P && pRoad && playerLead > 5) {
      const pressure = clamp((playerLead - 5) / 80, 0, 1);
      const paceMul = 0.98 + 0.13 * sk;                       // Hard ~112%, Expert ~115%
      const chaseTarget = P.speed * paceMul + pressure * (3 + 5 * sk);
      vT = Math.max(vT, Math.min(AI.raceMax, chaseTarget));
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
      // Stage 3: change lane first and shed less speed before committing to the pass.
      if (gap < 8 && car.fwdSpeed > o.fwdSpeed) { vT = Math.min(vT, Math.max(7, o.speed + gap * 0.7)); brake = Math.max(brake, 0.15); }
    }
    // barrels sitting on the road: a drum goes off with a bang and takes the car with it, so they are treated like boulders - the gap-finder below steers round them
    // (looking well ahead, because there is a long way to slow down from 35 m/s), and the car comes off the throttle so it can swerve in time
    const blk = this._blk || (this._blk = []); blk.length = 0; let carLat, carLatV = 0;
    const free = (c) => blk.every((o) => Math.abs(c - o.side) >= o.w);               // is moving sideways by c (in the same units as an obstacle's `side`) clear of everything in blk?
    const edgeMax = Math.max(usable * 0.9, f.hw - 2.4);                              // swerving round something may use nearly the whole road, not just the usual racing width
    const BW = 3.2;                                                                 // clear width wanted either side of a drum's centre: half a car, the drum, and some margin
    if (ctx.barrels) {
      const sight = 28 + car.fwdSpeed * 1.5;
      for (const b of ctx.barrels) {
        if (!b.alive) continue;
        const rx = b.pos.x - car.pos.x, rz = b.pos.z - car.pos.z;
        if (rx * fx + rz * fz < -1 || rx * rx + rz * rz > sight * sight || Math.abs(b.pos.y - car.pos.y) > 3) continue;
        const bs = track.progressAt(b.pos.x, b.pos.y, b.pos.z), bf = track.frameAt(bs);
        let ahead = bs - s; if (ahead < -track.length / 2) ahead += track.length; if (ahead > track.length / 2) ahead -= track.length;
        if (ahead < -1 || ahead > sight) continue;
        if (carLat === undefined) { const cf = track.frameAt(s); carLat = (car.pos.x - cf.x) * cf.lx + (car.pos.z - cf.z) * cf.lz; carLatV = car.vel.x * cf.lx + car.vel.z * cf.lz; }
        const side = carLat - ((b.pos.x - bf.x) * bf.lx + (b.pos.z - bf.z) * bf.lz);
        if (Math.abs(side) > BW + 3 + Math.abs(carLatV) * 0.8) continue;
        blk.push({ side: side + carLatV * 0.7 * ahead / Math.max(10, car.fwdSpeed), w: BW });      // (where the drum will be across our nose by the time we get there, given the sideways drift we already have)
        if (Math.abs(side) < BW + 0.6) {                                           // on our line: slow enough to be at about 12 m/s by the time we reach it
          const vSafe = Math.sqrt(144 + 2 * 7 * Math.max(0, ahead - 7));
          if (car.fwdSpeed > vSafe) { vT = Math.min(vT, vSafe); brake = Math.max(brake, clamp((car.fwdSpeed - vSafe) / 8, 0.3, 1)); }
        }
      }
    }
    // washboard patches shake the car about: come into them slower, so it is not thrown off line
    if (track.def.rough) for (const rp of track.def.rough) {
      let ds = rp.s - s; if (ds < -track.length / 2) ds += track.length; if (ds > track.length / 2) ds -= track.length;
      if (ds < 45 && ds > -rp.len) vT = Math.min(vT, 16 + Math.max(0, ds) * 0.2);
    }
    // boulders on or beside the road: find the nearest gap to drive through (round a pair of them, not between), and ease off for the close ones (rolling boulders too)
    let rockShift = 0;
    if (track.rocks) {
      for (const b of track.rocks) {
        let rx = b.x - car.pos.x, rz = b.z - car.pos.z, ahead, side0;
        if (b.roller) ahead = rx * fx + rz * fz;
        else {                                                                  // a rock that stays put: where it is along and across the ROAD (the car's heading is no use on a bend)
          if (b.rs === undefined) { b.rs = track.progressAt(b.x, b.y, b.z); const bf = track.frameAt(b.rs); b.rl = (b.x - bf.x) * bf.lx + (b.z - bf.z) * bf.lz; }
          ahead = b.rs - s; if (ahead < -track.length / 2) ahead += track.length; if (ahead > track.length / 2) ahead -= track.length;
          if (carLat === undefined) { const cf = track.frameAt(s); carLat = (car.pos.x - cf.x) * cf.lx + (car.pos.z - cf.z) * cf.lz; }
          side0 = carLat - b.rl;
        }
        if (ahead < 0 || ahead > (b.roller ? 70 : 65) || Math.abs(b.y - car.pos.y) > 3.5) continue;
        if (b.roller && b.state === 'roll') {                                                                   // where a rolling boulder will be when we get there
          const tA = Math.min(3.5, ahead / Math.max(car.fwdSpeed, 6)), tacc = Math.max(0, (9.5 - b.speed) / 6);
          const run = tA < tacc ? b.speed * tA + 3 * tA * tA : b.speed * tacc + 3 * tacc * tacc + 9.5 * (tA - tacc);
          rx += b.dx * run; rz += b.dz * run;
        } else if (b.roller && b.state === 'wait') { if (ahead < 75 && Math.abs(rx * car.ax.x + rz * car.ax.z) < 16) vT = Math.min(vT, 17); continue; }     // about to go: ease off and watch it
        const side = b.roller ? rx * car.ax.x + rz * car.ax.z : side0;
        if (Math.abs(side) > b.r + 3.2) continue;
        blk.push({ side, w: b.r * 0.9 + 2.5 });
        if (!b.roller && ahead < 60 && Math.abs(side) < b.r * 0.9 + 2.5) { vT = Math.min(vT, Math.max(10, 4 + ahead * 0.3)); if (ahead < 50) brake = Math.max(brake, 0.2); }      // on our line: be slow enough to swing round it
        if (b.roller ? ahead < 60 : ahead < 32 && Math.abs(side) < b.r + 1.9) { vT = Math.min(vT, Math.max(b.roller ? 8 : 11, ahead * (b.roller ? 0.5 : 0.9) + 4)); brake = Math.max(brake, b.roller ? 0.5 : 0.2); }
      }
    }
    {
      if (blk.length) {
        let best = 0;
        if (!free(0)) {
          const cand = [];
          if (carLat === undefined) { const cf = track.frameAt(s); carLat = (car.pos.x - cf.x) * cf.lx + (car.pos.z - cf.z) * cf.lz; }
          for (const o of blk) for (const sg of [-1, 1]) { const c = o.side + sg * o.w; if (free(c) && Math.abs(carLat - c) <= edgeMax) cand.push(c); }      // (a gap between a drum and the wall is no gap at all)
          const pick = (sg) => cand.filter((c) => sg === 0 || (c > 0) === (sg > 0)).sort((x, y) => Math.abs(x) - Math.abs(y))[0];
          let c = this._pass ? pick(this._pass) : undefined;                                         // pick a side once and stay with it (no dithering as the boulder slides past)
          if (c === undefined) c = pick(0);
          if (c === undefined) c = blk[0].side > 0 ? -3 : 3;
          this._pass = c > 0 ? 1 : -1; best = c;
        }
        rockShift = best;
      } else this._pass = 0;
    }
    if (rockShift && ctx.barrels) this.laneNow += clamp(-rockShift * 3.5, -5, 5) / usable * dt;                        // (a drum: move over firmly, even when only a little way is needed)
    else if (rockShift) this.laneNow += clamp(-rockShift / usable * 1.8 * dt, -1.3 * dt, 1.3 * dt);       // (lane runs the opposite way to "side"; steer round, then drift back once clear)
    else {
      let want = this.lane + clamp(laneBias, -1, 1) * 0.5;
      if (blk.length) {                                                       // drifting back to our usual line must not take us through the thing we just swerved round
        if (carLat === undefined) { const cf = track.frameAt(s); carLat = (car.pos.x - cf.x) * cf.lx + (car.pos.z - cf.z) * cf.lz; }
        if (!free(carLat - want * usable)) want = this.laneNow;
      }
      this.laneNow += clamp((want - this.laneNow) * 0.9 * dt, -0.6 * dt, 0.6 * dt);
    }
    const laneMax = blk.length ? Math.max(0.85, edgeMax / usable) : 0.85;
    this.laneNow = clamp(this.laneNow, -laneMax, laneMax);
    if (hunting && rockShift) { ax -= f.lx * rockShift; az -= f.lz * rockShift; }                      // (charging at the player: the aim point still swings round whatever is in the way)

    // ---------------------------------------------------------------- hills / jumps
    const uphillGrade = gradeAhead(track, s);
    const steepUphill = uphillGrade > 0.075;   // about a 7.5% average climb ahead
    const jump = gapAhead(track, s);
    if (jump) { vT = Math.max(vT, AI.jumpSpeed, 4.6 * Math.sqrt(jump)); ax = f.x; az = f.z; }

    // ---------------------------------------------------------------- steer
    const dx = ax - car.pos.x, dz = az - car.pos.z;
    const ang = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);      // + = target is on our left
    let steerTarget = clamp(ang * 2.2, -1, 1);
    if (jump) steerTarget = clamp(steerTarget, -0.25, 0.25);
    this.steerNow += clamp(steerTarget - this.steerNow, -3.2 * (1 + d) * dt, 3.2 * (1 + d) * dt);   // can't snap side to side
    let steer = this.steerNow;

    // ---------------------------------------------------------------- pedals
    const err = vT - car.fwdSpeed;
    // Stage 3: harder throttle, later braking, but still entirely through the real Vehicle model.
    let throttle = err > 0 ? clamp(0.10 + err / 2.8, 0, 1) : 0;
    let brk = err < -3.5 && car.fwdSpeed > 4 ? clamp((-err - 1) / 8, 0, 1) : 0;
    if (hunting && Math.abs(ang) > 1.1 && car.fwdSpeed > 14) { throttle *= 0.6; brk = Math.max(brk, 0.18); }   // turn first, then charge
    brk = Math.max(brk, err < -1.5 ? brake : 0);

    // ---------------------------------------------------------------- stuck: back out
    if (this.reverse > 0) {
      this.reverse -= dt;
      steer = -this.revSteer; throttle = 0; brk = 1;
      if (this.reverse <= 0) this.stuck = 0;
    } else if (throttle > 0.3 && car.speed < 1.4 && car.ay.y > 0.5 && !steepUphill) {
      // On a steep climb, crawling is not the same thing as being wedged against a barrier.
      // Reversing here used to make rivals roll back down random-track hills and repeatedly retry.
      this.stuck += dt;
      if (this.stuck > 1.6) { this.reverse = 1.3; this.revSteer = steer || (this.rng() < 0.5 ? 1 : -1); }
    } else this.stuck = Math.max(0, this.stuck - dt * 2);

    // ---------------------------------------------------------------- spun round and facing the wrong way: turn round like a driver would (a three-point turn)
    const fr0 = track.frameAt(s), facing = car.az.x * fr0.fx + car.az.z * fr0.fz;
    if (!this.turn && facing < -0.25 && car.speed < 9 && car.onGround && car.ay.y > 0.5) this.turn = { dir: Math.sign(ang) || 1, rev: false, t: 0, total: 0 };
    if (this.turn) {
      const T = this.turn; T.t += dt; T.total += dt;
      const lane = Math.abs((car.pos.x - fr0.x) * fr0.lx + (car.pos.z - fr0.z) * fr0.lz), edge = lane > fr0.hw - 2.2;
      if (facing > 0.5 || T.total > 25 || !car.onGround) this.turn = null;
      else if (!T.rev) {                                    // forwards, full lock towards the way round, until it runs out of road or time
        steer = T.dir; throttle = 0.65; brk = 0;
        if (T.t > 1.8 || (edge && T.t > 0.7) || (T.t > 0.5 && car.fwdSpeed < 0.6)) { T.rev = true; T.t = 0; }
      } else {                                              // then backwards with the lock the other way, so the nose keeps swinging round
        steer = -T.dir; throttle = 0; brk = 1;
        if (T.t > 1.6 || (edge && T.t > 0.7) || (T.t > 0.9 && car.speed < 0.6)) { T.rev = false; T.t = 0; }
      }
    }

    inp.throttle = throttle; inp.brake = brk; inp.steer = steer; inp.handbrake = false;
    // Nitro still uses the real finite tank. Rivals may also spend it to rescue a genuine steep climb:
    // this mirrors what a human naturally does instead of leaving the pack stalled on procedural hills.
    const hillBoost = steepUphill
      && throttle > 0.85
      && car.fwdSpeed < 20
      && car.fwdSpeed > 1
      && Math.abs(ang) < 0.32
      && car.boostFuel > 0.2;
    const raceBoost = this.aggr > 0.45
      && (hunting || catchup > 0.2)
      && Math.abs(ang) < 0.15
      && car.fwdSpeed > 13
      && car.boostFuel > 0.2
      && (!P || playerLead > 10);
    // Good drivers use their nitro on the straights, whoever is around, and keep a little back for later.
    const straightBoost = sk > 0.5 && k < 0.006 && !jump && Math.abs(ang) < 0.12 && car.fwdSpeed > 18 && car.boostFuel > 0.3;
    inp.boost = hillBoost || raceBoost || straightBoost;
    return inp;
  }
}

/** Is this car on a real road surface (as opposed to embankment or open ground)? */
export function onRoad(track, car, q = Track.newQuery()) {
  track.query(car.pos.x, car.pos.y + 0.5, car.pos.z, q, 1.2);
  return q.surface === SURF.ROAD;
}