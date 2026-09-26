// Destruction derby: rival cars, crashing into them, damage, wrecks and score.
//
//  * Rivals are ordinary Vehicles (same physics as yours) with a Driver (ai.js) pressing their pedals.
//  * Cars collide through a row of five spheres per car, resolved with proper impulses at the point of
//    contact, so a hit at the back corner spins the other car round exactly as it should.
//  * Each crash takes hit points off the zone that was actually touched (damage.js). The first zone to
//    hit zero wrecks the car: it explodes, gets thrown into the air, shoves and hurts its neighbours,
//    then burns for a while as an obstacle.
//  * Wrecking a rival that you hit in the last few seconds (or that a blast you set off caught) scores.
//    `award()` is the one door every kind of points goes through, so new ways to score are one line.
//  * Nothing here imports three.js. main.js draws it, plays the sounds and reads `events`.

import { V3 } from './math.js';
import { Vehicle } from './vehicle.js';
import { Track, SURF } from './track.js';
import { Driver, IDLE, AI } from './ai.js';
import { Health, SPECS, DAMAGE, ZONES, NEIGHBOURS, zoneAt, crashDamage, wallDamage, blastDamage } from './damage.js';

/** Points for each kind of thing worth points. Add a new kind here, then call derby.award('kind'). */
export const POINTS = {
  takedown: 100,
  chicken: 10,
  // Ideas for later - award them from wherever the event happens:
  //   landing: 50,   (a clean landing after a big jump)
  //   barrel: 25,    (an explosive barrel set off)
};

export const DERBY = {
  rivals: 6,             // how many rivals are on the track at once
  grace: 3,              // seconds after the start before anything can hurt you
  spawnGrace: 1.5,       // and before a fresh rival can be hurt
  credit: 6,             // seconds after your hit in which a wreck still counts as yours
  wreckLife: 14,         // how long a wrecked rival actively burns before the fire dies down
  wreckFade: 1.6,        // how long the oldest hulk takes to shrink away when maxWrecks is exceeded
  spawnEvery: 2.5,       // seconds between replacements
  maxWrecks: 8,           // wrecked rivals stay on the track as obstacles forever, up to this many at once
  creditNear: 30,        // m: a blast this close to you counts as yours
  gridLead: 12,          // m: gap from the player to the first row of the starting grid
  gridRow: 8,            // m: gap between grid rows
  gridPerRow: 2,          // cars per row (a real grid staggers pole/second etc.)
};

// Five spheres along the car stand in for its body when cars meet.
const BALL_R = 0.85, BALL_Y = 0.05;
const BALL_LOCAL = [-1.5, -0.75, 0, 0.75, 1.5].map((z) => new V3(0, BALL_Y, z));
const wa = BALL_LOCAL.map(() => new V3()), wb = BALL_LOCAL.map(() => new V3());
const sN = new V3(), sP = new V3(), sVa = new V3(), sVb = new V3(), sT = new V3(), dn = new V3();

/**
 * Collide two cars (their frames must be current). Applies the impulses and pushes them apart, and
 * fills `out` with what the worst contact was: closing speed, effective mass and where. Returns
 * true if the cars struck each other this step.
 */
export function collideCars(A, B, out) {
  const cx0 = B.pos.x - A.pos.x, cy0 = B.pos.y - A.pos.y, cz0 = B.pos.z - A.pos.z;
  out.closing = 0; out.mu = 0; out.x = out.y = out.z = 0;
  if (cx0 * cx0 + cy0 * cy0 + cz0 * cz0 > 36) return false;
  for (let k = 0; k < BALL_LOCAL.length; k++) { A.toWorld(BALL_LOCAL[k], wa[k]); B.toWorld(BALL_LOCAL[k], wb[k]); }
  const D = BALL_R * 2, D2 = D * D;
  let deepest = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < wa.length; i++) {
      for (let j = 0; j < wb.length; j++) {
        const cx = wb[j].x - wa[i].x, cy = wb[j].y - wa[i].y, cz = wb[j].z - wa[i].z, d2 = cx * cx + cy * cy + cz * cz;
        if (d2 >= D2) continue;
        const d = Math.sqrt(d2) || 1e-6, pen = D - d;
        sN.set(cx / d, cy / d, cz / d);                          // from A towards B
        sP.set(wa[i].x + sN.x * BALL_R, wa[i].y + sN.y * BALL_R, wa[i].z + sN.z * BALL_R);
        if (pass === 0 && pen > deepest) { deepest = pen; dn.copy(sN); }
        A.velocityAt(sP, sVa); B.velocityAt(sP, sVb);
        const vn = (sVb.x - sVa.x) * sN.x + (sVb.y - sVa.y) * sN.y + (sVb.z - sVa.z) * sN.z;
        if (vn >= 0) continue;
        const mu = 1 / (A.invMassAt(sN, sP) + B.invMassAt(sN, sP));
        const e = -vn > 2 ? 0.25 : 0, j2 = -(1 + e) * vn * mu;
        A.impulseAt(sN, -j2, sP); B.impulseAt(sN, j2, sP);
        if (pass === 0 && -vn > out.closing) { out.closing = -vn; out.mu = mu; out.x = sP.x; out.y = sP.y; out.z = sP.z; }
        // a little friction so glancing blows spin the cars
        A.velocityAt(sP, sVa); B.velocityAt(sP, sVb);
        const rn = (sVb.x - sVa.x) * sN.x + (sVb.y - sVa.y) * sN.y + (sVb.z - sVa.z) * sN.z;
        sT.set(sVb.x - sVa.x - sN.x * rn, sVb.y - sVa.y - sN.y * rn, sVb.z - sVa.z - sN.z * rn);
        const tl = sT.length();
        if (tl > 0.05) {
          sT.scale(1 / tl);
          const jt = Math.min(0.35 * j2, tl / (A.invMassAt(sT, sP) + B.invMassAt(sT, sP)));
          A.impulseAt(sT, jt, sP); B.impulseAt(sT, -jt, sP);
        }
      }
    }
  }
  if (deepest > 0.005) { const c = Math.min(deepest, 0.35) * 0.5; A.pos.addScaled(dn, -c); B.pos.addScaled(dn, c); }
  return out.closing > 0;
}

/** Put a car on the road at arc length s, `offset` metres left of the centreline, moving at `speed`. */
export function placeOnRoad(car, track, s, offset = 0, speed = 0) {
  const f = track.frameAt(s), h = car.restHeight + 0.08;
  car.reset(new V3(f.x + f.lx * offset + f.nx * h, f.y + f.ly * offset + f.ny * h, f.z + f.lz * offset + f.nz * h),
    new V3(f.fx, f.fy, f.fz), new V3(f.nx, f.ny, f.nz), speed);
  return f;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const pose = () => ({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 });
const HUES = 7;

export class Derby {
  constructor() {
    this.enabled = false;
    this.track = null; this.fighters = []; this.player = null; this.events = [];
    this.score = 0; this.takedowns = 0; this.over = false; this.time = 0;
    this.count = DERBY.rivals; this.rng = mulberry(7);
    this._id = 1; this._hue = 0; this._tick = 0; this._spawnT = 0;
    this._hit = { closing: 0, mu: 0, x: 0, y: 0, z: 0 };
    this._ctx = { player: null, cars: [], barrels: null };
    this._q = Track.newQuery();
    this.cars = [];                       // every car that should take part in physics, player first
  }

  get rivals() { return this.fighters.filter((f) => !f.isPlayer && !f.gone); }
  get alive() { let n = 0; for (const f of this.fighters) if (!f.isPlayer && !f.gone && !f.wrecked) n++; return n; }

  /** Begin a fresh game on `track` with the player's car and `count` rivals. */
  start(track, playerCar, count = DERBY.rivals, seed = 7) {
    this.track = track; this.count = count; this.rng = mulberry(seed);
    this.fighters.length = 0; this.events.length = 0;
    this.score = 0; this.takedowns = 0; this.over = false; this.time = 0;
    this._id = 1; this._hue = 0; this._tick = 0; this._spawnT = DERBY.spawnEvery;
    const p = this.player = {
      id: 0, isPlayer: true, car: playerCar, health: new Health(SPECS.player.hp), spec: SPECS.player,
      wrecked: false, wreckT: 0, gone: false, age: 99, lastHit: null, flash: 0, flashZone: 'front', flipT: 0,
      prev: pose(), cur: pose(), hue: -1,
    };
    this.fighters.push(p);
    for (let k = 0; k < count; k++) this._spawnGrid(k, count);
    this._refreshCars();
  }

  /** Place rival `k` of `of` in a starting grid ahead of the player: a couple of cars per
   *  row, stationary, like a real race lineup. Only used for the initial field in `start()` -
   *  a rival wrecked mid-race is replaced by `_spawn()`, which drops it in anywhere on the track. */
  _spawnGrid(k, of) {
    const T = this.track, P = this.player, L = T.length, rnd = this.rng;
    const ps = T.progressAt(P.car.pos.x, P.car.pos.y, P.car.pos.z);
    const perRow = Math.max(1, DERBY.gridPerRow);
    const row = Math.floor(k / perRow), col = k % perRow;
    const cols = Math.min(perRow, of - row * perRow);
    let s = ps + DERBY.gridLead + row * DERBY.gridRow;
    s = ((s % L) + L) % L;
    const fr = T.frameAt(s);
    const lane = Math.max(2, fr.hw - 3);
    const off = cols > 1 ? (col - (cols - 1) / 2) * lane * 0.85 : (rnd() - 0.5) * lane * 0.3;
    const car = new Vehicle();
    const driver = new Driver(rnd);
    placeOnRoad(car, T, s, off, 0);        // stationary on the grid, like a real start
    car.opts.assist = 0.7;
    return this.add(car, driver);
  }

  /** Switch the derby off (plain racing). */
  stop() { this.fighters.length = 0; this.events.length = 0; this.player = null; this.over = false; this._refreshCars(); }

  _refreshCars() {
    this.cars.length = 0;
    if (this.player) this.cars.push(this.player.car);
    for (const f of this.fighters) if (!f.isPlayer && !f.gone) this.cars.push(f.car);
  }

  // ------------------------------------------------------------------- spawning
  _spawn(k = -1, of = 0) {
    const T = this.track, P = this.player, L = T.length, rnd = this.rng;
    const ps = T.progressAt(P.car.pos.x, P.car.pos.y, P.car.pos.z);
    const margin = Math.min(140, L * 0.18);
    let s = 0, off = 0, ok = false;
    for (let t = 0; t < 14 && !ok; t++) {
      s = k >= 0 ? ps + margin + (L - 2 * margin) * (k + 0.5) / of + (t ? (rnd() - 0.5) * 40 : 0)
        : ps + margin + rnd() * (L - 2 * margin);
      s = ((s % L) + L) % L;
      const fr = T.frameAt(s);
      off = (rnd() - 0.5) * Math.max(2, fr.hw - 4) * 1.2;
      const x = fr.x + fr.lx * off, y = fr.y, z = fr.z + fr.lz * off;
      ok = true;
      for (const o of this.fighters) {
        if (o.gone) continue;
        if (Math.hypot(o.car.pos.x - x, o.car.pos.z - z) < 30 && Math.abs(o.car.pos.y - y) < 6) { ok = false; break; }
      }
    }
    if (!ok) return null;
    const car = new Vehicle();
    const driver = new Driver(rnd);
    placeOnRoad(car, T, s, off, driver.cruise * 0.85);
    car.opts.assist = 0.7;
    return this.add(car, driver);
  }

  /** Add a rival that `driver` (see ai.js) pedals, or that just coasts if there is none. Used by _spawn and the tests. */
  add(car, driver = null) {
    const f = {
      id: this._id++, isPlayer: false, car, driver, health: new Health(SPECS.rival.hp), spec: SPECS.rival,
      wrecked: false, wreckT: 0, gone: false, age: 0, lastHit: null, flash: 0, flashZone: 'front', flipT: 0, idleT: 0, offT: 0,
      expire: false, expireT: 0,
      inp: IDLE, think: 0, prev: pose(), cur: pose(), hue: this._hue++ % HUES,
    };
    this._pose(f, f.cur); this._pose(f, f.prev);
    this.fighters.push(f);
    this._refreshCars();
    return f;
  }

  _pose(f, o) {
    const c = f.car;
    o.x = c.pos.x; o.y = c.pos.y; o.z = c.pos.z; o.qx = c.rot.x; o.qy = c.rot.y; o.qz = c.rot.z; o.qw = c.rot.w;
  }
  _snap(f) { const t = f.prev; f.prev = f.cur; f.cur = t; this._pose(f, f.cur); }
  _dist(x, y, z) { const c = this.player?.car; return c ? Math.hypot(x - c.pos.x, y - c.pos.y, z - c.pos.z) : Infinity; }

  // ----------------------------------------------------------------------- step
  /**
   * Advance the rivals one physics step and settle every collision. Call it straight after the
   * player's car has stepped, before that car's own events are read (they are used here for damage).
   */
  step(dt, barrels = null) {
    if (!this.enabled || !this.track || !this.player) return;
    const T = this.track, P = this.player, F = this.fighters;
    this.time += dt; this._tick++;

    // -------- rivals think and drive
    const ctx = this._ctx;
    ctx.player = P.wrecked ? null : P.car; ctx.cars = this.cars; ctx.barrels = barrels;
    for (const f of F) {
      if (f.isPlayer || f.gone) continue;
      f.age += dt;
      if (f.driver && !f.wrecked && (this._tick + f.id) % 4 === 0) f.inp = f.driver.drive(f.car, T, ctx, dt * 4);
      try { f.car.step(dt, f.wrecked ? IDLE : f.inp, T); }
      catch { this._remove(f); }
    }

    // -------- walls and the ground, from every car's own events
    for (const f of F) {
      if (f.gone) continue;
      const ev = f.car.events;
      for (const e of ev) {
        if (e.type !== 'wall' && e.type !== 'ground') continue;
        let hp = wallDamage(f.car.mass, e.speed) * f.spec.wallMul;
        if (e.type === 'ground') hp *= DAMAGE.ground / DAMAGE.wall;
        if (hp > 0) this._damage(f, zoneAt(f.car, e.x, e.y, e.z), hp, null);
        if (!f.isPlayer && e.speed > 3 && e.type === 'wall') this._hitEvent('wall', e.speed, e.x, e.y, e.z);
      }
      if (!f.isPlayer) ev.length = 0;            // the player's own are left for main.js (sound, sparks)
    }

    // -------- cars against cars
    for (const f of F) if (!f.gone) f.car.refreshFrame();
    const H = this._hit;
    for (let i = 0; i < F.length; i++) {
      const a = F[i]; if (a.gone) continue;
      for (let j = i + 1; j < F.length; j++) {
        const b = F[j]; if (b.gone) continue;
        if (!collideCars(a.car, b.car, H)) continue;
        if (H.closing > 1.5) this._hitEvent('car', H.closing, H.x, H.y, H.z, a.isPlayer || b.isPlayer);
        const hp = crashDamage(H.mu, H.closing);
        if (hp > 0) {
          this._damage(a, zoneAt(a.car, H.x, H.y, H.z), hp, b);
          this._damage(b, zoneAt(b.car, H.x, H.y, H.z), hp, a);
        }
      }
    }

    // -------- housekeeping
    let wrecks = 0;
    for (const f of F) {
      if (f.gone) continue;
      f.flash = Math.max(0, f.flash - dt * 3.5);
      if (f.wrecked) {
        f.wreckT += dt;
        if (!f.isPlayer) {
          wrecks++;
          if (f.expire) { f.expireT += dt; if (f.expireT > DERBY.wreckFade) this._remove(f); }
        }
      }
      else if (!f.isPlayer) this._watch(f, dt);
      else f.flipT = 0;
      this._snap(f);
    }
    if (wrecks > DERBY.maxWrecks) {                         // too many hulks: fade the oldest to make room
      let old = null;
      for (const f of F) if (f.wrecked && !f.isPlayer && !f.gone && !f.expire && (!old || f.wreckT > old.wreckT)) old = f;
      if (old) old.expire = true;
    }

    // -------- replacements
    this._spawnT -= dt;
    if (this._spawnT <= 0) {
      this._spawnT = 0.5;
      if (this.alive < this.count && !this.over) { if (this._spawn()) this._spawnT = DERBY.spawnEvery; }
    }
  }

  /** Rivals that flipped, got lost or got stuck: cook the upside-down ones, put the lost ones back. */
  _watch(f, dt) {
    const c = f.car, T = this.track;
    f.flipT = c.ay.y < 0.15 && c.speed < 5 ? f.flipT + dt : 0;
    if (f.flipT > 3) this._damage(f, 'front', DAMAGE.burnPerSecond * dt, null);      // an engine fire, eventually
    f.idleT = c.speed < 2 && c.ay.y > 0.15 ? f.idleT + dt : 0;
    T.query(c.pos.x, c.pos.y + 0.5, c.pos.z, this._q, 1.2);
    f.offT = this._q.idx < 0 || this._q.surface === SURF.BASE ? f.offT + dt : 0;
    const far = this._dist(c.pos.x, c.pos.y, c.pos.z) > 45;
    if (c.pos.y < -25 || ((f.offT > 3 || f.idleT > 6) && far)) {
      const s = T.progressAt(c.pos.x, c.pos.y, c.pos.z);
      placeOnRoad(c, T, s + 10, 0, (f.driver ? f.driver.cruise : 20) * 0.6);
      f.idleT = f.offT = f.flipT = 0;
      if (f.driver) { f.driver.stuck = 0; f.driver.reverse = 0; }
      this._pose(f, f.cur); this._pose(f, f.prev);
    }
  }

  _remove(f) { f.gone = true; this._refreshCars(); this.events.push({ type: 'gone', id: f.id }); }

  _hitEvent(kind, speed, x, y, z, involvesPlayer = false) {
    const dist = this._dist(x, y, z);
    if (dist > 110) return;
    this.events.push({ type: 'hit', kind, speed, x, y, z, dist, player: involvesPlayer });
  }

  // --------------------------------------------------------------------- damage
  _damage(f, zone, hp, by) {
    if (f.wrecked || hp <= 0) return;
    if (f.isPlayer) { if (this.over || this.time < DERBY.grace) return; }
    else if (f.age < DERBY.spawnGrace) return;
    if (by) f.lastHit = { by: by.id, t: this.time };
    if (by && by.isPlayer && !f.isPlayer && f.driver) f.driver.grudgeT = Math.max(f.driver.grudgeT, AI.grudgeTime);
    f.health.hit(zone, hp * (f.spec.mul?.[zone] ?? 1));
    for (const n of NEIGHBOURS[zone]) f.health.hit(n, hp * DAMAGE.bleed * (f.spec.mul?.[n] ?? 1));
    f.health.last = zone;
    f.flash = 1; f.flashZone = zone;
    this.events.push({ type: 'damage', id: f.id, isPlayer: f.isPlayer, zone, hp });
    if (f.health.wrecked) this._wreck(f, f.health.wrecked);
  }

  _wreck(f, zone) {
    const c = f.car, rnd = this.rng;
    f.wrecked = true; f.wreckT = 0;
    c.refreshFrame();
    this.events.push({ type: 'wreck', id: f.id, isPlayer: f.isPlayer, zone, x: c.pos.x, y: c.pos.y, z: c.pos.z, dist: this._dist(c.pos.x, c.pos.y, c.pos.z) });
    // the blast heaves the hulk into the air and sets it spinning
    c.vel.y += 4.5 + rnd() * 2.5;
    c.angVel.x += (rnd() - 0.5) * 3; c.angVel.z += (rnd() - 0.5) * 3; c.angVel.y += (rnd() - 0.5) * 2;
    // ...and the neighbours feel it: shoved, hurt, and credited to whoever did the wrecking
    const by = f.lastHit && f.lastHit.by !== undefined ? { id: f.lastHit.by } : null;
    for (const o of this.fighters) {
      if (o === f || o.gone) continue;
      const dx = o.car.pos.x - c.pos.x, dy = o.car.pos.y - c.pos.y, dz = o.car.pos.z - c.pos.z, d = Math.hypot(dx, dy, dz);
      if (d >= DAMAGE.wreck.radius) continue;
      const k = 1 - d / DAMAGE.wreck.radius, inv = d > 0.05 ? 1 / d : 0;
      sN.set(dx * inv, dy * inv + 0.45, dz * inv);
      if (!inv) sN.set(0, 1, 0);
      sN.normalize();
      o.car.impulseAt(sN, o.car.mass * DAMAGE.wreck.push * k, sP.set(o.car.pos.x, o.car.pos.y - 0.25, o.car.pos.z));
      const hp = blastDamage(DAMAGE.wreck, d) * o.spec.blastMul;
      this._damage(o, zoneAt(o.car, c.pos.x, c.pos.y, c.pos.z), hp, by && f.lastHit && this.time - f.lastHit.t <= DERBY.credit ? by : null);
    }
    if (f.isPlayer) {
      this.over = true;
      this.events.push({ type: 'over', zone, score: this.score, takedowns: this.takedowns });
    } else {
      const h = f.lastHit;
      if (!this.over && h && h.by === this.player.id && this.time - h.t <= DERBY.credit) {
        this.takedowns++;
        this.award('takedown', 1, 'Takedown');
      }
    }
  }

  /** The one place points are handed out. `kind` is a key of POINTS; `mult` scales it. */
  award(kind, mult = 1, label = kind) {
    const points = Math.round((POINTS[kind] ?? 0) * mult);
    if (points <= 0 || this.over) return 0;
    this.score += points;
    this.events.push({ type: 'award', kind, points, label, score: this.score });
    return points;
  }

  /** A barrel (or anything explosive) has gone off at (x, y, z): hurt every car in range. */
  blast(x, y, z, kind = DAMAGE.barrel) {
    if (!this.enabled || !this.player) return;
    const P = this.player;
    const credit = this._dist(x, y, z) < DERBY.creditNear ? { id: P.id } : null;   // near you: your doing
    for (const f of this.fighters) {
      if (f.gone || f.wrecked) continue;
      const c = f.car;
      const d = Math.hypot(c.pos.x - x, c.pos.y - y, c.pos.z - z);
      const hp = blastDamage(kind, d) * f.spec.blastMul;
      if (hp <= 0) continue;
      c.refreshFrame();
      this._damage(f, zoneAt(c, x, y, z), hp, f.isPlayer ? { id: -1 } : credit);
    }
  }
}

export { ZONES };
