// The brain of the computer's car in The Getaway (robber or police). No three.js in here, so it runs (and is tested) in Node.
//
// It offers the same few fields derby.js reads from ai.js's Driver (cruise, grudgeT, stuck, reverse, ...), and drives along the streets
// by following the junction route from getaway.js, so it never tries to cut through a building.

import { clamp } from './math.js';
import { route, streetAt } from './getaway.js';

export class GetawayDriver {
  /** `game` is the GetawayGame, `role` the side this driver plays ('robber' or 'police'). */
  constructor(rng, game, role, skill = 0.7) {
    this.rng = rng; this.game = game; this.role = role; this.skill = skill;
    this.cruise = role === 'police' ? 20 + skill * 8 : 17 + skill * 7;                    // m/s on a straight
    this.mood = 'hunt'; this.target = false; this.grudgeT = 0;
    this.stuck = 0; this.reverse = 0; this.revSteer = 0; this.steerNow = 0;
    this.patrol = null; this.patrolT = 0; this.goal = null; this.path = []; this.repathT = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  }

  /** Where this side wants to go right now, and whether it is a straight-line chase. */
  think(car, foe) {
    const g = this.game, cx = car.pos.x, cz = car.pos.z;
    if (g.over) return { x: cx, z: cz, kind: 'idle' };
    if (this.role === 'robber') {
      if (g.robberBag) return { x: g.safehouse.x, z: g.safehouse.z, kind: 'safehouse' };
      // the nearest bag that is free to take, leaning away from the police
      let best = null, bs = Infinity;
      for (const b of g.loose()) {
        if (g.time < b.lockUntil) continue;
        const mine = Math.hypot(b.x - cx, b.z - cz), theirs = foe ? Math.hypot(b.x - foe.pos.x, b.z - foe.pos.z) : 200;
        const s = mine - 0.35 * Math.min(theirs, 160);
        if (s < bs) { bs = s; best = b; }
      }
      return best ? { x: best.x, z: best.z, kind: 'bag' } : { x: cx, z: cz, kind: 'idle' };
    }
    // police
    if (g.policeBag) return { x: g.policeBag.home.x, z: g.policeBag.home.z, kind: 'bank' };
    const ground = g.bags.filter((b) => b.state === 'ground');
    if (ground.length) {
      let best = null, bd = Infinity;
      for (const b of ground) { const d = Math.hypot(b.x - cx, b.z - cz); if (d < bd) { bd = d; best = b; } }
      // a dropped bag the robber is about to retake is not worth a detour: go for the robber
      if (!(foe && Math.hypot(foe.pos.x - best.x, foe.pos.z - best.z) < bd * 0.6 && g.time < best.lockUntil + 1.5)) return { x: best.x, z: best.z, kind: 'bag' };
    }
    if (foe) {
      // the robber is on the map only while carrying; otherwise the police prowl near the banks the robber is nearest to
      if (g.robberBag) {
        const lead = clamp(Math.hypot(foe.pos.x - cx, foe.pos.z - cz) / Math.max(car.speed + 6, 14), 0, 2.2);
        return { x: foe.pos.x + foe.vel.x * lead, z: foe.pos.z + foe.vel.z * lead, kind: 'robber' };
      }
      // no alarm, no idea where the robber is: cruise past the banks, one after another
      if (!this.patrol || g.time > this.patrolT || Math.hypot(this.patrol.x - cx, this.patrol.z - cz) < 12) {
        const bk = g.L.banks[Math.floor(this.rng() * g.L.banks.length)]; this.patrol = { x: bk.door.x, z: bk.door.z + 4.5 }; this.patrolT = g.time + 25;
      }
      return { x: this.patrol.x, z: this.patrol.z, kind: 'patrol' };
    }
    return { x: cx, z: cz, kind: 'idle' };
  }

  drive(car, track, ctx, dt) {
    const inp = this.input, L = this.game.L, fx = car.az.x, fz = car.az.z, foe = ctx.player;
    const G = this.think(car, foe);
    this.target = G.kind !== 'idle'; this.goalKind = G.kind;
    let ax = G.x, az = G.z, vT = this.cruise;
    const dist = Math.hypot(G.x - car.pos.x, G.z - car.pos.z);
    // a straight run at the target when it is close and in the same stretch of street; otherwise follow the junctions
    const sA = streetAt(L, car.pos.x, car.pos.z), sB = streetAt(L, G.x, G.z);
    const same = sA && sB && (sA.kind === 'node' || sB.kind === 'node' || (sA.kind === sB.kind && sA.kind === 'h' ? sA.j === sB.j : sA.kind === sB.kind && sA.i === sB.i));
    if (G.kind === 'idle') { vT = 0; }
    else if (!(same && dist < 40)) {
      const p = route(L, car.pos.x, car.pos.z, fx, fz, G.x, G.z, car.speed);
      let k = 0;
      while (k < p.length - 1 && Math.hypot(p[k].x - car.pos.x, p[k].z - car.pos.z) < 7 + car.speed * 0.25) k++;
      ax = p[k].x; az = p[k].z;
      // ease off for a turn at the junction ahead
      if (k < p.length - 1) {
        const d1 = Math.hypot(ax - car.pos.x, az - car.pos.z), nx = p[k + 1].x - ax, nz = p[k + 1].z - az, nl = Math.hypot(nx, nz) || 1;
        const turn = Math.abs((ax - car.pos.x) / (d1 || 1) * (nz / nl) - (az - car.pos.z) / (d1 || 1) * (nx / nl));
        if (turn > 0.5) vT = Math.min(vT, 7 + d1 * 0.55);
      }
    } else if (G.kind === 'robber') vT = this.cruise * 1.5;
    else vT = Math.min(vT, 7 + dist * 0.8);
    if (G.kind === 'robber' && !(same && dist < 40)) vT = this.cruise * 1.15;
    if (G.kind === 'bag' || G.kind === 'safehouse' || G.kind === 'bank') vT = Math.min(vT, 9 + dist * 0.9);

    const dx = ax - car.pos.x, dz = az - car.pos.z;
    const ang = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);          // + = the aim point is on our left
    const steerTarget = clamp(ang * 2.2, -1, 1);
    this.steerNow += clamp(steerTarget - this.steerNow, -3.6 * dt, 3.6 * dt);
    let steer = this.steerNow;
    const err = vT - car.fwdSpeed;
    let throttle = err > 0 ? clamp(0.1 + err / 2.8, 0, 1) : 0;
    let brk = err < -3 && car.fwdSpeed > 4 ? clamp((-err - 1) / 8, 0, 1) : 0;
    if (Math.abs(ang) > 1.0 && car.fwdSpeed > 9) { throttle *= 0.4; brk = Math.max(brk, 0.25); }
    if (G.kind === 'idle') { throttle = 0; brk = car.fwdSpeed > 1 ? 0.5 : 0; }

    if (this.reverse > 0) {
      this.reverse -= dt; steer = -this.revSteer; throttle = 0; brk = 1;
      if (this.reverse <= 0) this.stuck = 0;
    } else if (throttle > 0.3 && car.speed < 1.4 && car.ay.y > 0.5) {
      this.stuck += dt;
      if (this.stuck > 1.2) { this.reverse = 1.1; this.revSteer = steer || (this.rng() < 0.5 ? 1 : -1); }
    } else this.stuck = Math.max(0, this.stuck - dt * 2);

    inp.throttle = throttle; inp.brake = brk; inp.steer = steer; inp.handbrake = false;
    inp.boost = this.skill > 0.5 && (G.kind === 'robber' || (this.role === 'robber' && G.kind === 'safehouse' && !!foe && Math.hypot(foe.pos.x - car.pos.x, foe.pos.z - car.pos.z) < 60)) && dist > 20 && Math.abs(ang) < 0.12 && car.fwdSpeed > 12 && car.boostFuel > 0.3;
    return inp;
  }
}
