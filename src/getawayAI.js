// The brain of the computer's car in The Getaway (robber or police). No three.js in here, so it runs (and is tested) in Node.
//
// It offers the same few fields derby.js reads from ai.js's Driver (cruise, grudgeT, stuck, reverse, ...), and drives along the streets
// by following the junction route from getaway.js, so it never tries to cut through a building.

import { clamp } from './math.js';
import { route, streetAt, nearestNode, safehouseRoute } from './getaway.js';

export class GetawayDriver {
  /** `game` is the GetawayGame, `role` the side this driver plays ('robber' or 'police'). */
  constructor(rng, game, role, skill = 0.7) {
    this.rng = rng; this.game = game; this.role = role; this.skill = skill;
    this.cruise = role === 'police' ? 22 + skill * 8 : 15 + skill * 5;                    // m/s on a straight
    this.mood = 'hunt'; this.target = false; this.grudgeT = 0;
    this.stuck = 0; this.reverse = 0; this.revSteer = 0; this.steerNow = 0;
    this.lane = role === 'traffic' ? 4 : 3.4;      // metres to the left of the middle of the street (keep left, like the traffic)
    this.patrol = null; this.patrolT = 0; this.goal = null; this.path = []; this.repathT = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  }

  /** Where this side wants to go right now, and whether it is a straight-line chase. */
  think(car, foe) {
    const g = this.game, cx = car.pos.x, cz = car.pos.z;
    if (g.over) return { x: cx, z: cz, kind: 'idle' };
    if (this.role === 'robber') {
      if (g.robberBag && g.copsNear && foe) {                      // the police are on the garage door: shake them off first (head for the junction furthest from them, for a few seconds)
        if (!this.flee || g.time > this.fleeT || Math.hypot(this.flee.x - cx, this.flee.z - cz) < 12) {
          let best = null, bd = -1; for (const n of g.L.nodes) { const d = Math.hypot(n.x - foe.pos.x, n.z - foe.pos.z) - 0.4 * Math.hypot(n.x - cx, n.z - cz); if (Math.hypot(n.x - cx, n.z - cz) > 30 && d > bd) { bd = d; best = n; } }
          this.flee = best; this.fleeT = g.time + 8;
        }
        if (this.flee) return { x: this.flee.x, z: this.flee.z, kind: 'bank' };
      }
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
    // police: with the alarm on, the shortest way to the robber; otherwise cruise past the banks, one after another
    if (foe && g.robberBag) {
      const d = Math.hypot(foe.pos.x - cx, foe.pos.z - cz), lead = d < 45 ? clamp(d / Math.max(car.speed + 6, 14), 0, 1.5) : 0;
      return { x: foe.pos.x + foe.vel.x * lead, z: foe.pos.z + foe.vel.z * lead, kind: 'robber' };
    }
    if (!this.patrol || g.time > this.patrolT || Math.hypot(this.patrol.x - cx, this.patrol.z - cz) < 12) {
      const bk = g.L.banks[Math.floor(this.rng() * g.L.banks.length)]; this.patrol = { x: bk.bag.x, z: bk.bag.z }; this.patrolT = g.time + 25;
    }
    return { x: this.patrol.x, z: this.patrol.z, kind: 'patrol' };
  }

  /** The point `ahead` metres along a list of points, and the way that stretch runs (for staying in lane). */
  _along(P, ahead) {
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const dx = P[i].x - P[i - 1].x, dz = P[i].z - P[i - 1].z, l = Math.hypot(dx, dz);
      if (l < 1e-3) continue;
      if (acc + l >= ahead) { const t = (ahead - acc) / l; return { x: P[i - 1].x + dx * t, z: P[i - 1].z + dz * t, dx: dx / l, dz: dz / l, rest: l * (1 - t) }; }
      acc += l;
    }
    const a = P[P.length - 2] || P[0], b = P[P.length - 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: b.x, z: b.z, dx: (b.x - a.x) / l, dz: (b.z - a.z) / l, rest: 0 };
  }

  drive(car, track, ctx, dt) {
    const g = this.game, inp = this.input, L = this.game.L, fx = car.az.x, fz = car.az.z, foe = ctx.player, v = car.fwdSpeed;
    const G = this.think(car, foe), px = car.pos.x, pz = car.pos.z;
    this.target = G.kind !== 'idle'; this.goalKind = G.kind;
    const dist = Math.hypot(G.x - px, G.z - pz);
    // in a garage bay that is not the way on: back straight out into the street
    const bay = L.garages.find((q) => Math.abs(px - q.gx) < 5.6 && pz > q.mouth - 4 && pz < q.back + 1);
    if (bay && !(G.kind === 'safehouse' && g.safehouse.gx === bay.gx && g.safehouse.mouth === bay.mouth) && (fz > 0.2 || this.backing)) {
      this.backing = pz > bay.mouth - 3.5;
      inp.throttle = 0; inp.brake = this.backing ? 1 : 0.6; inp.steer = clamp((px - bay.gx) * 0.06, -0.3, 0.3) * (fz > 0 ? 1 : -1); inp.handbrake = false; inp.boost = false;
      return inp;
    }
    this.backing = false;
    let vT = G.kind === 'idle' ? 0 : this.cruise * (this.role === 'police' ? (g.alarm ? 1.12 : 0.6) : 1), ax = G.x, az = G.z, chase = false;
    const sA = streetAt(L, px, pz), sB = streetAt(L, G.x, G.z);
    const same = sA && sB && (sA.kind === 'node' || sB.kind === 'node' || (sA.kind === sB.kind && (sA.kind === 'h' ? sA.j === sB.j : sA.i === sB.i)));
    if (G.kind === 'robber' && same && sA.kind !== 'node' && sB.kind !== 'node' && dist < 40) { chase = true; vT = this.cruise * 1.25; }            // the last stretch of a chase: straight at him
    else if (G.kind !== 'idle') {
      // follow the streets: aim a little way ahead along the route, in the left-hand lane, and slow for the corners
      const pts = G.path || (G.kind === 'safehouse' && g.safehouse.gx !== undefined ? safehouseRoute(L, g.safehouse, px, pz, fx, fz, car.speed) : route(L, px, pz, fx, fz, G.x, G.z, car.speed)), P = [{ x: px, z: pz }];
      for (const q of pts) if (Math.hypot(q.x - P[P.length - 1].x, q.z - P[P.length - 1].z) > 2) P.push(q);
      while (P.length > 2 && Math.hypot(P[1].x - px, P[1].z - pz) < 14 && (px - P[1].x) * (P[2].x - P[1].x) + (pz - P[1].z) * (P[2].z - P[1].z) > 0) P.splice(1, 1);       // (a junction the car has already passed is not on the way)
      // the first real corner on the way: how far off, and how sharp
      let corner = null, run = 0;
      for (let i = 1; i < P.length - 1 && run < 60; i++) {
        const d1x = P[i].x - P[i - 1].x, d1z = P[i].z - P[i - 1].z, d2x = P[i + 1].x - P[i].x, d2z = P[i + 1].z - P[i].z, l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
        run += l1; if (l1 < 1e-3 || l2 < 1e-3) continue;
        const turn = Math.acos(clamp((d1x * d2x + d1z * d2z) / (l1 * l2), -1, 1));
        if (turn > 0.35) { corner = { d: run, turn }; break; }
      }
      let Ld = clamp(6 + Math.max(v, 0) * 0.55, 8, 24);
      if (corner && corner.d > 7 && corner.d < Ld + 6) Ld = corner.d - 0.5;                    // do not look round a corner before reaching it: aim for the corner, then turn (so the inside kerb is not clipped)
      const A = this._along(P, Ld);
      const toGoal = Math.hypot(G.x - A.x, G.z - A.z), lane = G.kind === 'safehouse' ? 0 : G.kind === 'drive' ? this.lane : this.lane * clamp((toGoal - 6) / 14, 0, 1);
      ax = A.x + A.dz * lane; az = A.z - A.dx * lane;
      if (corner) { const vc = 14 - 8 * clamp(corner.turn / 1.57, 0, 1.2); vT = Math.min(vT, Math.sqrt(vc * vc + 14 * Math.max(corner.d - 6, 0))); }
      if (G.kind === 'safehouse' && g.safehouse.gx !== undefined) { const dg = Math.hypot(px - g.safehouse.gx, pz - g.safehouse.street); if (dg < 40) vT = Math.min(vT, 7 + dg * 0.15); }
      if (G.kind === 'bag' || G.kind === 'safehouse' || G.kind === 'bank') vT = Math.min(vT, 8 + dist * 0.7);
    }

    // stay on the tarmac: never aim for the pavement, and steer back to the road if the car has strayed onto it (except on the way into the garage)
    const garage = G.kind === 'safehouse' && g.safehouse.gx !== undefined && Math.hypot(px - g.safehouse.gx, pz - g.safehouse.street) < 34;
    if (garage) { /* the garage turn leaves the street on purpose */ }
    else if (sA && sA.kind === 'h') { const c = L.zs[sA.j], dev = pz - c; az = clamp(az, c - 4.6, c + 4.6); if (Math.abs(dev) > 5.2) { az = c + Math.sign(dev) * 1.5; vT = Math.min(vT, 9); } }
    else if (sA && sA.kind === 'v') { const c = L.xs[sA.i], dev = px - c; ax = clamp(ax, c - 4.6, c + 4.6); if (Math.abs(dev) > 5.2) { ax = c + Math.sign(dev) * 1.5; vT = Math.min(vT, 9); } }

    // keep clear of other cars: ease off for one in the way ahead (not the one being chased, and never wait for ever in a jam)
    let blocked = false;
    if (!(this.shove > 0)) {
      for (const c of ctx.cars || []) {
        if (c === car || (chase && c === foe)) continue;
        const tr = this.role === 'traffic' || !g.alarm, human = c === foe;       // traffic, and the police and robber until a robbery starts, stop for anything in the way
        const rx = c.pos.x - px, rz = c.pos.z - pz, ahead = rx * fx + rz * fz, side = Math.abs(rz * fx - rx * fz);
        if (ahead > 0 && ahead < (tr ? 10 : 7) + Math.max(v, 0) * 0.8 && side < (tr ? 3.6 : 3.3) && Math.abs(c.pos.y - car.pos.y) < 3 && ((tr && human) || c.az.x * fx + c.az.z * fz > 0.2 || c.speed < 2.5)) {
          const gap = ahead - (tr ? 7 : 5.5); if (tr && human) this.waitT = -1e9; vT = Math.min(vT, gap <= 0 ? 0 : gap * 1.3 + Math.max(0, c.fwdSpeed ?? 0) * 0.8); blocked = true;
        }
      }
    }
    this.waitT = blocked && car.speed < 1.5 ? (this.waitT || 0) + dt : 0;
    if (this.waitT > 3) { this.shove = 2.5; this.waitT = 0; }               // a jam: just edge forward for a moment
    if (this.shove > 0) { this.shove -= dt; vT = Math.min(vT, 5); }

    const dx = ax - px, dz = az - pz;
    const ang = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);          // + = the aim point is on our left
    const maxS = clamp(1.25 - Math.max(v, 0) / 40, 0.45, 1);
    const steerTarget = clamp(ang * 1.6, -maxS, maxS);
    this.steerNow += clamp(steerTarget - this.steerNow, -2.4 * dt, 2.4 * dt);
    let steer = this.steerNow;
    if (Math.abs(ang) > 0.7) vT = Math.min(vT, 9);
    const err = vT - v;
    let throttle = err > 0 ? clamp(0.12 + err / 4, 0, 1) : 0;
    let brk = err < -2.5 && v > 3 ? clamp((-err - 1.5) / 9, 0, 1) : 0;
    if (G.kind === 'idle') { throttle = 0; brk = v > 1 ? 0.5 : 0; }

    if (this.reverse > 0) {
      this.reverse -= dt; steer = -this.revSteer; throttle = 0; brk = 1;
      if (this.reverse <= 0) this.stuck = 0;
    } else if (throttle > 0.3 && car.speed < 1.4 && car.ay.y > 0.5) {
      this.stuck += dt;
      if (this.stuck > 1.6) { this.reverse = 1.1; this.revSteer = steer || (this.rng() < 0.5 ? 1 : -1); }
    } else this.stuck = Math.max(0, this.stuck - dt * 2);

    inp.throttle = throttle; inp.brake = brk; inp.steer = steer; inp.handbrake = false;
    inp.boost = this.skill > 0.5 && this.role !== 'traffic' && (G.kind === 'robber' || G.kind === 'intercept' || (this.role === 'robber' && G.kind === 'safehouse' && !!foe && Math.hypot(foe.pos.x - px, foe.pos.z - pz) < 60)) && dist > 25 && Math.abs(ang) < 0.1 && v > 12 && car.boostFuel > 0.3;
    return inp;
  }
}

/** Ordinary traffic: drives straight down a street, and at each junction goes straight on or turns left or right at random (never turning round), in the left-hand lane. */
export class TrafficDriver extends GetawayDriver {
  constructor(rng, game) { super(rng, game, 'traffic', 0.4); this.cruise = 9 + rng() * 5; this.lane = 3.2; this.from = null; this.to = null; this.next = null; }
  _nbrs(n) {
    const { cols, rows } = this.game.L.T, i = n % (cols + 1), j = Math.floor(n / (cols + 1)), out = [];
    if (i > 0) out.push(n - 1); if (i < cols) out.push(n + 1); if (j > 0) out.push(n - (cols + 1)); if (j < rows) out.push(n + (cols + 1));
    return out;
  }
  /** At junction `n`, having come from `from`: straight on about half the time, otherwise a turn; a dead end turns round. */
  _choose(from, n) {
    const L = this.game.L, nd = L.nodes[n], fr = L.nodes[from], opts = this._nbrs(n).filter((m) => m !== from);
    if (!opts.length) return from;
    const dx = nd.x - fr.x, dz = nd.z - fr.z, dl = Math.hypot(dx, dz) || 1;
    const w = opts.map((m) => { const q = L.nodes[m], ex = q.x - nd.x, ez = q.z - nd.z, dot = (dx * ex + dz * ez) / (dl * (Math.hypot(ex, ez) || 1)); return dot > 0.5 ? 2 : 1; });
    let r = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < opts.length; k++) { r -= w[k]; if (r <= 0) return opts[k]; }
    return opts[opts.length - 1];
  }
  think(car) {
    const L = this.game.L;
    if (this.to == null) {                        // start: head for the junction ahead on the street the car is facing along
      const n0 = nearestNode(L, car.pos.x, car.pos.z), nd = L.nodes[n0];
      const ahead = this._nbrs(n0).filter((m) => (L.nodes[m].x - nd.x) * car.az.x + (L.nodes[m].z - nd.z) * car.az.z > 0);
      this.from = n0; this.to = ahead.length ? ahead[Math.floor(this.rng() * ahead.length)] : this._nbrs(n0)[0]; this.next = this._choose(this.from, this.to);
    }
    let T = L.nodes[this.to];
    if (Math.hypot(T.x - car.pos.x, T.z - car.pos.z) < 8) { this.from = this.to; this.to = this.next; this.next = this._choose(this.from, this.to); T = L.nodes[this.to]; }
    const N = L.nodes[this.next];
    return { x: T.x, z: T.z, kind: 'drive', path: [{ x: T.x, z: T.z }, { x: N.x, z: N.z }] };
  }
}
