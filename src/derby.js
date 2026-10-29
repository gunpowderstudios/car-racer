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
import { Caravan } from './caravan.js';
import { ArenaDriver, arenaInfo, arenaSpawn } from './arena.js';
import { Health, SPECS, DAMAGE, ZONES, NEIGHBOURS, zoneAt, crashDamage, wallDamage, blastDamage, roofDentHp } from './damage.js';

/** Points for each kind of thing worth points. Add a new kind here, then call derby.award('kind'). */
export const POINTS = {
  takedown: 100,
  winner: 500,           // last car running in a free-for-all arena
  // Ideas for later - award them from wherever the event happens:
  //   landing: 50,   (a clean landing after a big jump)
  //   barrel: 25,    (an explosive barrel set off)
};

export const DERBY = {
  rivals: 6,             // how many live rivals the derby tries to keep in play
  hornClosing: 7,        // a rival honks when it is closing on you at least this fast (m/s)...
  hornTtc: 0.9,          // ...and would reach you within this many seconds
  hornCooldown: 9,       // seconds before the same rival may honk again
  hornGap: 4,            // seconds between honks from the whole field: no continuous horning
  wrongWayTime: 14,      // a rival still facing the wrong way after this long (it has had a good go at turning round: see ai.js) is put back on the road facing forwards...
  stuckTime: 10,         // ...and so is one that has been stuck (hardly moving) this long
  stallFrac: 0.14,       // one hit this big (as a share of that zone's armour) stalls your engine: a hard wall hit, a proper T-bone
  stallFracRival: 0.28,  // ...rivals have far less armour, so it takes a bigger bang to stall one
  grace: 3,              // seconds after the start before anything can hurt you
  spawnGrace: 1.5,       // and before a fresh rival can be hurt
  credit: 6,             // seconds after your hit in which a wreck still counts as yours
  repairsDemolition: 0,  // Last One Standing: one wreck and the player is out
  brutalArmour: 0.6,     // Demolition Day: rivals take just this share of every hit, and drive at full (Expert) skill
  rivalClash: 0.4,       // Demolition: rivals hitting each other take just this share of the damage, so they don't wreck one another before you get to them
  repairs: 3,            // every car, yours and each rival, can be repaired this many times; the next wreck is scrap and stays on the track, burnt out
  wreckLife: 14,         // how long a wreck actively burns; the hulk itself can remain after that
  wreckFade: 1.6,        // fade/shrink time when an old hulk is retired after the wreck cap is exceeded
  spawnEvery: 2.5,       // seconds between replacements
  maxWrecks: 4,          // persistent wrecks allowed on the circuit before the oldest one fades away
  creditNear: 30,        // m: a blast this close to you counts as yours
  gridLead: 12,          // m: gap from the player to the first row of the starting grid
  gridRow: 8,            // m: gap between grid rows
  gridPerRow: 2,         // cars per row (a real grid staggers pole/second etc.)
  huntBiasRace: 0.35,    // how keen rivals are to come after you (0..1, see ai.js): Race, where they still have a race to run
  huntBiasDemolition: 1, // ...and Demolition, where chasing you is the whole point
  respawnDelay: 3,       // Race mode: seconds a wrecked player smoulders before being put back on the road
  respawnGrace: 3,       // ...and the protection they get after coming back
};

// Five spheres along the car stand in for its body when cars meet. A vehicle with a `body` in its physics profile (width and
// length, set on CAR by vehicleChoice.js) gets spheres sized to it: radius = half the width, spread so the row of spheres covers
// the length. That keeps a wide motor home from visually sinking into its neighbours and a tiny Mini from bouncing off
// thin air. A car with no `body` keeps the original 0.85 m radius and a 3 m row.
const BALL_R = 0.85, BALL_Y = 0.05, BALL_FRAC = [-1, -0.5, 0, 0.5, 1];
const ballsA = BALL_FRAC.map(() => new V3()), ballsB = BALL_FRAC.map(() => new V3());
const wa = BALL_FRAC.map(() => new V3()), wb = BALL_FRAC.map(() => new V3());
const sN = new V3(), sP = new V3(), sVa = new V3(), sVb = new V3(), sT = new V3(), dn = new V3();
/** Lay the car's spheres out along its length (into `balls`) and return their radius. */
export function layoutBalls(car, balls) {
  const b = car?.spec?.body;
  const r = b?.width ? Math.max(0.55, b.width * 0.5) : BALL_R;
  const half = b?.length ? Math.max(0, b.length * 0.5 - r) : 1.5;
  for (let k = 0; k < balls.length; k++) balls[k].set(0, BALL_Y, half * BALL_FRAC[k]);
  return r;
}

/** A Jamboree rival's damage spec: the usual rival one, scaled by how tough (or tinny) that vehicle is. */
const kindSpecs = new Map();
function kindSpec(kind) {
  let sp = kindSpecs.get(kind.id);
  if (!sp) { const m = kind.damageMul || 1; sp = { ...SPECS.rival, mul: { front: m, back: m, left: m, right: m, roof: m } }; kindSpecs.set(kind.id, sp); }
  return sp;
}

/**
 * Collide two cars (their frames must be current). Applies the impulses and pushes them apart, and
 * fills `out` with what the worst contact was: closing speed, effective mass and where. Returns
 * true if the cars struck each other this step.
 */
export function collideCars(A, B, out) {
  const cx0 = B.pos.x - A.pos.x, cy0 = B.pos.y - A.pos.y, cz0 = B.pos.z - A.pos.z;
  out.closing = 0; out.mu = 0; out.x = out.y = out.z = 0;
  if (cx0 * cx0 + cy0 * cy0 + cz0 * cz0 > 36) return false;
  const rA = layoutBalls(A, ballsA), rB = layoutBalls(B, ballsB);
  for (let k = 0; k < wa.length; k++) { A.toWorld(ballsA[k], wa[k]); B.toWorld(ballsB[k], wb[k]); }
  const D = rA + rB, D2 = D * D;
  let deepest = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < wa.length; i++) {
      for (let j = 0; j < wb.length; j++) {
        const cx = wb[j].x - wa[i].x, cy = wb[j].y - wa[i].y, cz = wb[j].z - wa[i].z, d2 = cx * cx + cy * cy + cz * cz;
        if (d2 >= D2) continue;
        const d = Math.sqrt(d2) || 1e-6, pen = D - d;
        sN.set(cx / d, cy / d, cz / d);                          // from A towards B
        sP.set(wa[i].x + sN.x * rA, wa[i].y + sN.y * rA, wa[i].z + sN.z * rA);
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

const vbA = new Float64Array(6), vbB = new Float64Array(6), vVan = { x: 0, z: 0 }, vVan2 = { x: 0, z: 0 }, vN = new V3(), vP = new V3(), vCar = new V3();
/**
 * A caravan against a car (its frame must be current): the caravan's three round bumpers against the car's row of spheres, in the
 * flat of the road. Applies the impulses and pushes them apart; `out` gets the closing speed and effective mass. True if they struck.
 */
export function collideVanCar(van, car, out) {
  out.closing = 0; out.mu = 0; out.x = out.y = out.z = 0; out.nx = out.nz = 0;
  const dx = car.pos.x - van.pos.x, dz = car.pos.z - van.pos.z;
  if (dx * dx + dz * dz > 64) return false;
  const rv = van.bumpers(vbA), rc = layoutBalls(car, ballsB);
  let deepest = 0, dnx = 0, dnz = 0;
  for (let k = 0; k < ballsB.length; k++) car.toWorld(ballsB[k], wb[k]);
  const D = rv + rc;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 3; i++) {
      const cx = vbA[i * 2], cz = vbA[i * 2 + 1];
      for (let j = 0; j < wb.length; j++) {
        if (Math.abs(wb[j].y - van.pos.y) > 1.6) continue;
        const ex = wb[j].x - cx, ez = wb[j].z - cz, d2 = ex * ex + ez * ez;
        if (d2 >= D * D) continue;
        const d = Math.sqrt(d2) || 1e-6, pen = D - d, nx = ex / d, nz = ez / d;      // from the caravan towards the car
        const px = cx + nx * rv, pz = cz + nz * rv;
        if (pass === 0 && pen > deepest) { deepest = pen; dnx = nx; dnz = nz; }
        vP.set(px, wb[j].y, pz); vN.set(nx, 0, nz);
        van.velAt(px, pz, vVan); car.velocityAt(vP, vCar);
        const vn = (vCar.x - vVan.x) * nx + (vCar.z - vVan.z) * nz;
        if (vn >= 0) continue;
        const mu = 1 / (van.invMassAt(nx, nz, px, pz) + car.invMassAt(vN, vP));
        const j2 = -(1 + (-vn > 2 ? 0.2 : 0)) * vn * mu;
        van.impulse(nx, nz, -j2, px, pz); car.impulseAt(vN, j2, vP);
        if (pass === 0) { out.nx += nx * -vn; out.nz += nz * -vn; }      // (every contact's push, weighted by its closing speed: the overall direction of the knock, for Caravan.broadside)
        if (pass === 0 && -vn > out.closing) { out.closing = -vn; out.mu = mu; out.x = px; out.y = wb[j].y; out.z = pz; }
      }
    }
  }
  if (deepest > 0.005) { const c = Math.min(deepest, 0.35) * 0.5; van.pos.x -= dnx * c; van.pos.z -= dnz * c; car.pos.x += dnx * c; car.pos.z += dnz * c; }
  return out.closing > 0;
}

/** One caravan against another (the rivals each tow one): round bumpers against round bumpers. */
export function collideVanVan(a, b, out) {
  out.closing = 0; out.mu = 0; out.x = out.y = out.z = 0;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  if (dx * dx + dz * dz > 64) return false;
  const ra = a.bumpers(vbA), rb = b.bumpers(vbB), D = ra + rb;
  let deepest = 0, dnx = 0, dnz = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const ex = vbB[j * 2] - vbA[i * 2], ez = vbB[j * 2 + 1] - vbA[i * 2 + 1], d2 = ex * ex + ez * ez;
    if (d2 >= D * D) continue;
    const d = Math.sqrt(d2) || 1e-6, pen = D - d, nx = ex / d, nz = ez / d, px = vbA[i * 2] + nx * ra, pz = vbA[i * 2 + 1] + nz * ra;
    if (pass === 0 && pen > deepest) { deepest = pen; dnx = nx; dnz = nz; }
    a.velAt(px, pz, vVan); b.velAt(px, pz, vVan2);
    const vn = (vVan2.x - vVan.x) * nx + (vVan2.z - vVan.z) * nz;
    if (vn >= 0) continue;
    const mu = 1 / (a.invMassAt(nx, nz, px, pz) + b.invMassAt(nx, nz, px, pz)), j2 = -vn * mu * 1.2;
    a.impulse(nx, nz, -j2, px, pz); b.impulse(nx, nz, j2, px, pz);
    if (pass === 0 && -vn > out.closing) { out.closing = -vn; out.mu = mu; out.x = px; out.y = a.pos.y; out.z = pz; }
  }
  if (deepest > 0.005) { const c = Math.min(deepest, 0.35) * 0.5; a.pos.x -= dnx * c; a.pos.z -= dnz * c; b.pos.x += dnx * c; b.pos.z += dnz * c; }
  return out.closing > 0;
}

/** Put a car on the road at arc length s, `offset` metres left of the centreline, moving at `speed`. */

/** Arcade race equaliser: match a rival's straight-line potential to the player's current vehicle
 *  without changing its mass, grip, steering or crash behaviour. Destruction modes leave real vehicle
 *  performance differences alone. The exponent softens extremes so oddball vehicles still keep character. */
function raceEngineEqualizer(playerSpec, rivalSpec) {
  if (!playerSpec || !rivalSpec) return 1;
  const pPW = Math.max(0.01, (playerSpec.engine?.peakTorque || 1) / Math.max(1, playerSpec.mass || 1));
  const rPW = Math.max(0.01, (rivalSpec.engine?.peakTorque || 1) / Math.max(1, rivalSpec.mass || 1));
  const pDrag = Math.max(0.1, playerSpec.aero?.drag || 0.55);
  const rDrag = Math.max(0.1, rivalSpec.aero?.drag || 0.55);
  return Math.max(0.70, Math.min(2.35,
    Math.pow(pPW / rPW, 0.80) * Math.pow(rDrag / pDrag, 0.25)
  ));
}

export function placeOnRoad(car, track, s, offset = 0, speed = 0) {
  const f = track.frameAt(track.restartS(s)), h = car.restHeight + 0.08;
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

/** Where the tow ball is on a rival (the standard car body). */
const RIVAL_HITCH = { x: 0, y: -0.02, z: -2.55 };

export class Derby {
  constructor() {
    this.enabled = false; this.damageEnabled = true;
    this.track = null; this.fighters = []; this.player = null; this.events = [];
    this.score = 0; this.takedowns = 0; this.over = false; this.won = false; this.time = 0;
    this.lastStanding = false; this._arenaField = 0;   // free-for-all arena: see start()
    this.onImpact = null;                                 // The Getaway: (fighter, 'wall' | 'car', speed, other) for every knock, so main.js can wear the cars down
    this.getaway = false; this.getawaySetup = null;    // The Getaway (see _spawnGetaway): main.js fills in { L, role, makeDriver(rng), rescue(car) } before start()
    this.slotSkill = null;                               // optional { raceSlot: skill offset }
    this.brutal = false;                                 // Demolition Day: tougher, Expert-skill rivals whatever the options say (main.js sets it)
    this.skill = 0.75;                                   // rival skill 0..1 (see ai.js skillOf); main.js sets it from the menu
    this.towing = false;                               // set by main.js: every rival tows a caravan
    this.mode = 'race'; this.demolition = false;       // see start(): Race respawns the player, Demolition is last one standing
    this.count = DERBY.rivals; this.rng = mulberry(7);
    this._id = 1; this._hue = 0; this._tick = 0; this._spawnT = 0;
    this.repairsMax = Infinity; this.repairs = Infinity;   // Race: how many wrecks you can be repaired from before the car is scrap (set before start())
    this.pool = null;                     // Jamboree: the kinds of vehicle the rivals are drawn from (see _kind); null = every rival is the player's own kind
    this._replacementS = [];              // {s, raceSlot}: wreck position + persistent race identity awaiting a replacement
    this._hit = { closing: 0, mu: 0, x: 0, y: 0, z: 0 };
    this._ctx = { player: null, cars: [], barrels: null };
    this._q = Track.newQuery();
    this.cars = [];                       // every car that should take part in physics, player first
  }

  get rivals() { return this.fighters.filter((f) => !f.isPlayer && !f.gone); }
  get alive() { let n = 0; for (const f of this.fighters) if (!f.isPlayer && !f.gone && !f.wrecked) n++; return n; }

  /** Begin a fresh game on `track` with the player's car and `count` rivals. */
  start(track, playerCar, count = DERBY.rivals, seed = 7, mode = 'race') {
    this.track = track; this.count = count; this.rng = mulberry(seed);
    this.raceSerial = (this.raceSerial || 0) + 1;
    this.fighters.length = 0; this.events.length = 0;
    this.score = 0; this.takedowns = 0; this.over = false; this.won = false; this.time = 0;
    // A track marked mode 'lastStanding' (The Oval) is a free-for-all: rivals start spread round the ring, fight each
    // other as well as you, are never replaced, and the last car still running wins.
    this.lastStanding = !!(track && track.def && track.def.mode === 'lastStanding'); this._arenaField = 0;
    this.getaway = !!(track && track.def && track.def.getaway && this.getawaySetup);      // The Getaway: one computer car (robber or police) in the town (see _spawnGetaway)
    // Two ways to play. RACE: you are wrecked, you explode, you come back on the road and the race goes on; rivals are replaced.
    // DEMOLITION: wrecked means out, nobody is replaced, and the last car running wins. The Oval is always demolition.
    this.mode = mode === 'demolition' || this.lastStanding ? 'demolition' : 'race'; this.demolition = this.mode === 'demolition';
    this._id = 1; this._hue = 0; this._tick = 0; this._spawnT = DERBY.spawnEvery;
    this._replacementS.length = 0; this._wrecks = new Map(); this._bag = null; this.repairs = this.repairsMax;
    const p = this.player = {
      id: 0, isPlayer: true, car: playerCar, health: new Health(SPECS.player.hp), spec: SPECS.player,
      wrecked: false, wreckT: 0, respawnAt: Infinity, graceUntil: 0, gone: false, age: 99, lastHit: null, flash: 0, flashZone: 'front', flipT: 0,
      prev: pose(), cur: pose(), hue: -1,
    };
    this.fighters.push(p);
    if (this.getaway) this._spawnGetaway();
    else if (this.lastStanding) {
      for (let k = 0; k < count; k++) { this._spawnArena(k, count); this._arenaField++; }
    } else for (let k = 0; k < count; k++) this._spawnGrid(k, count);
    this._refreshCars();
  }

  /** The Getaway: the one computer car, on the side `getawaySetup.role` ('robber' or 'police'), standing at its end of the town. */
  _spawnGetaway() {
    const S = this.getawaySetup, p = S.role === 'robber' ? S.L.robberStart : S.L.policeStart, kind = S.kind, car = new Vehicle(kind?.spec);
    car.reset(new V3(p.x, this.track.py[0] + car.restHeight + 0.08, p.z), new V3(p.fx, 0, p.fz), new V3(0, 1, 0), 0);
    car.opts.assist = 0.7;
    const me = this.add(car, S.makeDriver(this.rng), 1, kind); me.cop = S.role === 'police';
    // more police cars patrolling the streets (when the robber is the person): each starts at its own junction, away from the robber and from each other
    const extra = S.role === 'police' ? (S.extraPolice || 0) : 0, cops = [S.L.policeStart];
    for (let k = 0; k < extra; k++) {
      let n = null;
      for (let t = 0; t < 40 && !n; t++) {
        const c = S.L.nodes[Math.floor(this.rng() * S.L.nodes.length)];
        if (Math.hypot(c.x - S.L.robberStart.x, c.z - S.L.robberStart.z) > 80 && cops.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 50)) n = c;
      }
      if (!n) break;
      cops.push(n);
      const horiz = this.rng() < 0.5, dir = this.rng() < 0.5 ? 1 : -1, cc = new Vehicle(kind?.spec);
      cc.reset(new V3(n.x, this.track.py[0] + cc.restHeight + 0.08, n.z), new V3(horiz ? dir : 0, 0, horiz ? 0 : dir), new V3(0, 1, 0), 0);
      cc.opts.assist = 0.7;
      this.add(cc, S.makeDriver(this.rng), k + 2, kind).cop = true;
    }
    // ordinary traffic wandering the streets: a few cars of a few kinds (each is a car to simulate and a model to draw, so not many)
    const spots = cops.slice(1);      // (not at a junction where a police car starts)
    for (let k = 0; k < (S.traffic || 0); k++) {
      let n = null;
      for (let t = 0; t < 30 && !n; t++) {
        const c = S.L.nodes[Math.floor(this.rng() * S.L.nodes.length)];
        if ([S.L.robberStart, S.L.policeStart, ...spots].every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 45)) n = c;
      }
      if (!n) break;
      spots.push(n);
      const tk = this._kind(), tc = new Vehicle(tk?.spec), horiz = this.rng() < 0.5, dir = this.rng() < 0.5 ? 1 : -1;
      tc.reset(new V3(n.x, this.track.py[0] + tc.restHeight + 0.08, n.z), new V3(horiz ? dir : 0, 0, horiz ? 0 : dir), new V3(0, 1, 0), 0);
      tc.opts.assist = 0.7;
      this.add(tc, S.makeTraffic(this.rng), k + 2 + Math.max(0, cops.length - 1), tk);
    }
    return me;
  }

  /** Rival `k` of `of` in The Oval: standing still on a ring inside the floor, facing the middle, spoiling for a fight. */
  _spawnArena(k, of) {
    const A = arenaInfo(this.track), p = arenaSpawn(A, k, of), kind = this._kind(), car = new Vehicle(kind?.spec);
    car.reset(new V3(p.x, A.y + car.restHeight + 0.08, p.z), new V3(p.fx, 0, p.fz), new V3(0, 1, 0), 0);
    car.opts.assist = 0.7;
    return this.add(car, new ArenaDriver(this.rng), k + 1, kind);
  }

  /** Place rival `k` of `of` in a starting grid ahead of the player: a couple of cars per
   *  row, stationary, like a real race lineup. Only used for the initial field in `start()` -
   *  a rival wrecked mid-race is replaced by `_spawn()` near where that wreck happened. */
  _spawnGrid(k, of) {
    const T = this.track, P = this.player, L = T.length, rnd = this.rng;
    const ps = T.progressAt(P.car.pos.x, P.car.pos.y, P.car.pos.z);
    const perRow = Math.max(1, DERBY.gridPerRow);
    const row = Math.floor(k / perRow), col = k % perRow;
    const cols = Math.min(perRow, of - row * perRow);
    const rowGap = this.towing ? DERBY.gridRow + 6 : DERBY.gridRow;       // everyone has a caravan trailing behind them: leave room for it
    let s = ps + DERBY.gridLead + row * rowGap;
    s = ((s % L) + L) % L;
    const fr = T.frameAt(s);
    const lane = Math.max(2, fr.hw - 3);
    const off = cols > 1 ? (col - (cols - 1) / 2) * lane * 0.85 : (rnd() - 0.5) * lane * 0.3;
    const kind = this._kind(), car = new Vehicle(kind?.spec);
    const driver = new Driver(rnd);
    placeOnRoad(car, T, s, off, 0);        // stationary on the grid, like a real start
    car.opts.assist = 0.7;
    return this.add(car, driver, k + 1, kind);
  }

  /** Switch the derby off (plain racing). */
  stop() { if (this.player) { const h = this.player.car.hurt; h.front = h.back = h.left = h.right = h.roof = 0; this.player.car.engineOff = false; } this.fighters.length = 0; this.events.length = 0; this.player = null; this.over = false; this._refreshCars(); }

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
    const replacement = k < 0 && this._replacementS.length ? this._replacementS[0] : null;
    const replacementS = replacement && typeof replacement === 'object' ? replacement.s : replacement;
    const replacementSlot = replacement && typeof replacement === 'object' ? replacement.raceSlot : null;
    let s = 0, off = 0, ok = false;
    for (let t = 0; t < 14 && !ok; t++) {
      if (replacementS != null) {
        // First choice is just behind where the old car died, so a replacement never turns up ahead of you (or ahead of its own wreck) and keeps its place
        // in the race. If that road space is occupied, walk farther back in small steps rather than teleporting it elsewhere on the lap.
        s = replacementS - 10 - t * 7 + (t ? (rnd() - 0.5) * 4 : 0);
      } else {
        // No wreck to replace (rare): drop the car just behind the player, never out ahead of the field where it would pop into view.
        s = k >= 0 ? ps + margin + (L - 2 * margin) * (k + 0.5) / of + (t ? (rnd() - 0.5) * 40 : 0)
          : ps - 70 - rnd() * 60 - t * 9;
      }
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
    if (replacementS != null) this._replacementS.shift();
    const kind = this._kind(), car = new Vehicle(kind?.spec);
    const driver = new Driver(rnd);
    placeOnRoad(car, T, s, off, driver.cruise * 0.85);
    car.opts.assist = 0.7;
    return this.add(car, driver, replacementSlot, kind);
  }

  /** Jamboree: the next kind of vehicle for a rival (`pool` is a list of { id, spec, damageMul }). They come out of a shuffled bag,
   *  so no kind turns up twice until all of them have; none when the pool is empty (every rival is the same as the player's car). */
  _kind() {
    const pool = this.pool;
    if (!pool || !pool.length) return null;
    if (!this._bag || !this._bag.length) {
      this._bag = pool.slice();
      for (let i = this._bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this._bag[i], this._bag[j]] = [this._bag[j], this._bag[i]]; }
    }
    return this._bag.pop();
  }

  /** Add a rival that `driver` (see ai.js) pedals, or that just coasts if there is none. Used by _spawn and the tests.
   *  `raceSlot` is the persistent grid identity; replacement cars inherit the slot of the wreck they replace. */
  add(car, driver = null, raceSlot = null, kind = null) {
    // In races, performance follows the player's chosen vehicle closely enough that a quirky slow rival
    // cannot simply be left behind on the straights. It still keeps its own handling, weight and damage.
    car.aiEngineMul = this.demolition ? 1 : raceEngineEqualizer(this.player?.car?.spec, car.spec);
    car.aiRollGuard = this.demolition ? 0.48 : 0.72;          // AI-only stability: keep rivals racing instead of repeatedly rolling over
    const f = {
      id: this._id++, raceSlot: Number.isInteger(raceSlot) ? raceSlot : null,
      isPlayer: false, car, driver, health: new Health(SPECS.rival.hp), spec: kind ? kindSpec(kind) : SPECS.rival, vehicleId: kind ? kind.id : null,
      wrecked: false, wreckT: 0, gone: false, age: 0, lastHit: null, flash: 0, flashZone: 'front', flipT: 0, idleT: 0, offT: 0,
      expire: false, expireT: 0,
      inp: IDLE, think: 0, prev: pose(), cur: pose(), hue: this._hue++ % HUES,
    };
    // a rival with a caravan on the back (slower and gentler through the bends, see Driver.towing). In Jamboree only some do, and only
    // the kinds that can tow at all (kind.hitch is their hitch point: the bus, campervan and motorhome have none).
    if (this.towing && this.track && (!kind || (kind.hitch && this.rng() < 0.5))) {
      const van = new Caravan(kind?.hitch || RIVAL_HITCH, { yawDamp: 2.0 }); van.auto = true; van.track = this.track; car.tow = van; van.reset(car);
      if (driver) driver.towing = true;
    }
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
    for (const f of F) {                                   // a stalled rival turns the key again after a couple of seconds
      if (!f.isPlayer && f.car.engineOff && f.car.crank <= 0 && !f.wrecked && (f.stallT -= dt) <= 0) f.car.restartEngine();
    }
    for (const f of F) {                                   // damaged cars drive worse: tell each car how much armour it has lost
      const h = f.car.hurt, hp = f.health;
      if (h && hp) { h.front = 1 - hp.frac('front'); h.back = 1 - hp.frac('back'); h.left = 1 - hp.frac('left'); h.right = 1 - hp.frac('right'); h.roof = 1 - hp.frac('roof'); }
    }

    // -------- rivals think and drive
    const ctx = this._ctx;
    ctx.player = P.wrecked ? null : P.car; ctx.cars = this.cars; ctx.barrels = barrels;
    this.playerTop = Math.max(P.car.speed, (this.playerTop || 0) - 0.4 * dt);       // the fastest the player's car has been going lately: the race pace for the rivals follows it
    ctx.playerTop = this.playerTop;
    const baseSkill = this.brutal ? 1 : this.skill; ctx.skill = baseSkill; const slotSkill = this.slotSkill;          // story mode gives each named rival their own pace
    ctx.huntBias = this.demolition ? DERBY.huntBiasDemolition : DERBY.huntBiasRace;
    ctx.racePace = !this.demolition;                         // race AI may pace itself against the player; demolition keeps natural vehicle performance
    for (const f of F) {
      if (f.isPlayer || f.gone) continue;
      f.age += dt;
      ctx.skill = slotSkill && slotSkill[f.raceSlot] != null ? Math.max(0, Math.min(1, baseSkill + slotSkill[f.raceSlot])) : baseSkill;
      if (f.driver && !f.wrecked && (this._tick + f.id) % 4 === 0) {
        if (this.lastStanding) ctx.player = this._nearestFoe(f);         // everyone is everyone's target
        f.inp = f.driver.drive(f.car, T, ctx, dt * 4);
        if (this.lastStanding) ctx.player = P.wrecked ? null : P.car;
      }
      try { f.car.step(dt, f.wrecked ? IDLE : f.inp, T); }
      catch { this._remove(f); }
    }

    // -------- a rival about to hit you leans on the horn - once in a while, never a constant racket
    this._hornGap = (this._hornGap || 0) - dt;
    if (this._hornGap <= 0 && !P.wrecked && this.time > DERBY.grace) {
      const pc = P.car;
      for (const f of F) {
        if (f.isPlayer || f.gone || f.wrecked || f.car.engineOff) continue;
        f.hornT = (f.hornT || 0) - dt;
        if (f.hornT > 0 || (this._tick + f.id) % 3) continue;
        const px = pc.pos.x - f.car.pos.x, pz = pc.pos.z - f.car.pos.z, d = Math.hypot(px, pz);
        if (d > 30 || d < 2 || Math.abs(pc.pos.y - f.car.pos.y) > 3) continue;
        const closing = ((f.car.vel.x - pc.vel.x) * px + (f.car.vel.z - pc.vel.z) * pz) / d;      // m/s the gap is shrinking
        const ttc = (d - 3.5) / Math.max(closing, 0.1);
        if (closing > DERBY.hornClosing && ttc < DERBY.hornTtc) {
          f.hornT = DERBY.hornCooldown + this.rng() * 4; this._hornGap = DERBY.hornGap;
          this.events.push({ type: 'honk', id: f.id, dist: d, pitch: 0.85 + ((f.id * 37) % 10) / 25 });
          break;
        }
      }
    }

    // -------- walls and the ground, from every car's own events
    for (const f of F) {
      if (f.gone) continue;
      const ev = f.car.events;
      for (const e of ev) {
        if (e.type !== 'wall' && e.type !== 'ground') continue;
        if (this.damageEnabled) {
          let hp = wallDamage(f.car.mass, e.speed) * f.spec.wallMul;
          if (e.type === 'ground') hp *= DAMAGE.ground / DAMAGE.wall;
          if (hp > 0) {
            const zone = zoneAt(f.car, e.x, e.y, e.z);
            // landing hard marks the paint, not the body - but a roof on the ground (a roll) crumples, so it gets a dent
            const roof = e.type === 'ground' && zone === 'roof';
            this._damage(f, zone, hp, null, e.type === 'wall' || roof ? e.x : undefined, e.y, e.z, roof ? roofDentHp(e.speed) : undefined);
          }
        }
        if (this.getaway && this.onImpact && e.type === 'wall' && e.speed > 3) this.onImpact(f, 'wall', e.speed, null);
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
        if (H.closing > 1.5) this._hitEvent('car', H.closing, H.x, H.y, H.z, a.isPlayer || b.isPlayer, a.id, b.id);
        if (this.getaway && this.onImpact && H.closing > 4) { this.onImpact(a, 'car', H.closing, b); this.onImpact(b, 'car', H.closing, a); }
        if (this.damageEnabled) {
          const hp = crashDamage(H.mu, H.closing) * (this.demolition && !a.isPlayer && !b.isPlayer ? DERBY.rivalClash : 1);
          if (hp > 0) {
            this._damage(a, zoneAt(a.car, H.x, H.y, H.z), hp, b, H.x, H.y, H.z);
            this._damage(b, zoneAt(b.car, H.x, H.y, H.z), hp, a, H.x, H.y, H.z);
          }
        }
      }
    }

    // -------- caravans against cars and each other (a caravan never collides with the car that tows it)
    for (const a of F) {
      const va = a.car.tow;
      if (!va || a.gone) continue;
      for (const b of F) {
        if (b.gone) continue;
        if (b === a) { collideVanCar(va, a.car, H); continue; }       // the car and the caravan it tows keep out of each other's way, but do no damage
        if (collideVanCar(va, b.car, H) && H.closing > 1.2) {
          if (H.closing > 2.5) this._hitEvent('car', H.closing, H.x, H.y, H.z, a.isPlayer || b.isPlayer);
          va.struck('car', H.closing, H.x, H.y, H.z, crashDamage(H.mu, H.closing) * va.spec.carMul * va.broadside(H.nx, H.nz));      // (square on its side is far worse than nose to tail)
        }
        const vb = b.car.tow;
        if (vb && b.id > a.id && collideVanVan(va, vb, H) && H.closing > 1.2) {
          const hp = crashDamage(H.mu, H.closing) * va.spec.carMul;
          va.struck('car', H.closing, H.x, H.y, H.z, hp); vb.struck('car', H.closing, H.x, H.y, H.z, hp);
        }
      }
    }
    for (const f of F) if (!f.isPlayer && f.car.tow) f.car.tow.events.length = 0;   // (the player's caravan knocks are left for main.js: sound, sparks)

    // -------- housekeeping
    let wrecks = 0;
    for (const f of F) {
      if (f.gone) continue;
      f.flash = Math.max(0, f.flash - dt * 3.5);
      if (f.wrecked) {
        f.wreckT += dt;
        if (f.isPlayer && !this.over && this.time >= f.respawnAt) this._revivePlayer(f);
        if (!f.isPlayer) {
          // Off-track recovery also uses wrecked=true during its 3-2-1 cinematic; that is not a real hulk.
          if (!f._offTrackReset) wrecks++;
          if (f.expire) { f.expireT += dt; if (f.expireT > DERBY.wreckFade) this._remove(f); }
        }
      }
      else if (!f.isPlayer) this._watch(f, dt);
      else f.flipT = 0;
      this._snap(f);
    }
    if (wrecks > DERBY.maxWrecks) {                         // enough hulks: fade the oldest to make room
      let old = null;
      for (const f of F) if (f.wrecked && !f.isPlayer && !f.gone && !f.expire && !f.scrap && !f._offTrackReset && (!old || f.wreckT > old.wreckT)) old = f;
      if (old) old.expire = true;
    }

    // -------- replacements
    // Keep the requested number of live opponents. Wrecks remain as persistent track obstacles,
    // independently capped by DERBY.maxWrecks so the circuit cannot grow without limit.
    this._spawnT -= dt;
    if (this._spawnT <= 0) {
      this._spawnT = 0.5;
      if (this.alive < this.count && !this.over && !this.demolition) { if (this._spawn()) this._spawnT = DERBY.spawnEvery; }
    }

    // -------- last one standing
    if (this.demolition && !this.getaway && !this.over && !P.wrecked && (this._arenaField > 0 || this.count > 0) && this.time > DERBY.grace && this._standing() === 0) this._win();
  }

  /** Rivals still in the fight. One that is only 3-2-1 resetting after being lost off the road still counts. */
  _standing() {
    let n = 0;
    for (const f of this.fighters) if (!f.isPlayer && !f.gone && (!f.wrecked || f._offTrackReset)) n++;
    return n;
  }

  /** The closest car (you included) that is still running, as far as rival `f` is concerned. */
  _nearestFoe(f) {
    let best = null, bd = Infinity, keep = null, kd = Infinity;
    for (const o of this.fighters) {
      if (o === f || o.gone || o.wrecked) continue;
      const d = (o.car.pos.x - f.car.pos.x) ** 2 + (o.car.pos.z - f.car.pos.z) ** 2;
      if (d < bd) { bd = d; best = o; }
      if (o === f._foe) { keep = o; kd = d; }
    }
    if (keep && kd < bd * 2.25) best = keep;               // stick with the current target unless another is much closer: no dithering between two
    f._foe = best;
    return best ? best.car : null;
  }

  /** Race mode: the wrecked player comes back with full health and a few seconds' protection. main.js puts the car back on the road. */
  _revivePlayer(f) {
    f.health = new Health(SPECS.player.hp);
    f.wrecked = false; f.wreckT = 0; f.respawnAt = Infinity; f.graceUntil = this.time + DERBY.respawnGrace; f.flipT = 0; f.flash = 0;
    this.events.push({ type: 'respawn', id: f.id, isPlayer: true });
  }

  /** Apple Crumple checkpoint: the pit crew patch the player's car up to full health (and restart a stalled engine). */
  repairPlayer() {
    const f = this.player;
    if (!f || f.wrecked || !this.damageEnabled) return;
    f.health = new Health(SPECS.player.hp); f.flash = 0; f.car.engineOff = false;
    this.events.push({ type: 'repaired', id: f.id, isPlayer: true });
  }

  _win() {
    this.award('winner', 1, 'Last one standing');
    this.over = true; this.won = true;
    this.events.push({ type: 'over', won: true, zone: null, score: this.score, takedowns: this.takedowns });
  }

  /** Rivals that flipped, got lost or got stuck: cook the upside-down ones, put the lost ones back. */
  _watch(f, dt) {
    const c = f.car, T = this.track;
    if (this.getaway) {                                    // the town has no road to be put back on: a car that flips goes upright at its junction
      f.flipT = c.ay.y < 0.15 && c.speed < 5 ? f.flipT + dt : 0;
      if (f.flipT > 2.5 || c.pos.y < -5) { this.getawaySetup.rescue(c, this.cars); f.flipT = 0; this._pose(f, f.cur); this._pose(f, f.prev); }
      return;
    }
    f.flipT = c.ay.y < 0.15 && c.speed < 5 ? f.flipT + dt : 0;
    if (f.flipT > 3 && this.damageEnabled) this._damage(f, 'front', DAMAGE.burnPerSecond * dt, null);      // destruction: an engine fire, eventually
    f.idleT = c.speed < 2 && c.ay.y > 0.15 ? f.idleT + dt : 0;
    T.query(c.pos.x, c.pos.y + 0.5, c.pos.z, this._q, 1.2);
    f.offT = this._q.idx < 0 || this._q.surface === SURF.BASE ? f.offT + dt : 0;
    const far = this._dist(c.pos.x, c.pos.y, c.pos.z) > 45;
    // Facing the wrong way for a few seconds, or stuck, even in plain sight: don't wait for it to sort itself out, put it back on the road facing the right way.
    if (!this.lastStanding && f.driver && c.onGround && f.age > 4) {
      const fr = T.frameAt(T.progressAt(c.pos.x, c.pos.y, c.pos.z));
      f.wrongT = (c.az.x * fr.fx + c.az.z * fr.fz) < -0.25 ? (f.wrongT || 0) + dt : 0;
      if (f.wrongT > DERBY.wrongWayTime || (f.idleT > DERBY.stuckTime && !c.engineOff)) {
        const s = T.progressAt(c.pos.x, c.pos.y, c.pos.z);
        placeOnRoad(c, T, s + 8, 0, f.driver.cruise * 0.6);
        f.wrongT = f.idleT = f.offT = f.flipT = 0; f.driver.stuck = 0; f.driver.reverse = 0; f.driver.turn = null; c.engineOff = false; c.crank = 0;
        this._pose(f, f.cur); this._pose(f, f.prev);
        return;
      }
    }
    if (c.pos.y < -25 || (!this.damageEnabled && f.flipT > 3) || ((f.offT > 3 || f.idleT > 6) && far)) {
      const s = T.progressAt(c.pos.x, c.pos.y, c.pos.z);
      placeOnRoad(c, T, s + 10, 0, (f.driver ? f.driver.cruise : 20) * 0.6);
      f.idleT = f.offT = f.flipT = 0;
      if (f.driver) { f.driver.stuck = 0; f.driver.reverse = 0; }
      this._pose(f, f.cur); this._pose(f, f.prev);
    }
  }

  _remove(f) { f.gone = true; this._refreshCars(); this.events.push({ type: 'gone', id: f.id }); }

  _hitEvent(kind, speed, x, y, z, involvesPlayer = false, a = -1, b = -1) {
    const dist = this._dist(x, y, z);
    if (dist > 110) return;
    this.events.push({ type: 'hit', kind, speed, x, y, z, dist, player: involvesPlayer, a, b });
  }

  // --------------------------------------------------------------------- damage
  /** `x, y, z` (optional) is where in the world it happened; the event then carries it in the car's own space so the dent can go in the right place. */
  _damage(f, zone, hp, by, x, y, z, dentHp) {
    if (!this.damageEnabled || f.wrecked || hp <= 0) return;
    if (f.isPlayer) { if (this.over || this.time < DERBY.grace || this.time < f.graceUntil) return; }
    else if (f.age < DERBY.spawnGrace) return;
    if (by) f.lastHit = { by: by.id, t: this.time };
    if (by && by.isPlayer && !f.isPlayer && f.driver) f.driver.grudgeT = Math.max(f.driver.grudgeT, AI.grudgeTime);
    if (this.brutal && !f.isPlayer) hp *= DERBY.brutalArmour;
    f.health.hit(zone, hp * (f.spec.mul?.[zone] ?? 1));
    for (const n of NEIGHBOURS[zone]) f.health.hit(n, hp * DAMAGE.bleed * (f.spec.mul?.[n] ?? 1));
    f.health.last = zone;
    f.flash = 1; f.flashZone = zone;
    // A big single hit (about a fifth of a zone's armour in one go) kills the engine: the driver has to start it again.
    if (!f.health.wrecked && hp * (f.spec.mul?.[zone] ?? 1) >= (f.isPlayer ? DERBY.stallFrac : DERBY.stallFracRival) * f.health.max[zone] && !f.car.engineOff) {
      f.car.engineOff = true; f.car.crank = 0; f.stallT = 2 + this.rng() * 2.5;
      this.events.push({ type: 'stall', id: f.id, isPlayer: f.isPlayer });
    }
    const ev = { type: 'damage', id: f.id, isPlayer: f.isPlayer, zone, hp };
    if (dentHp !== undefined) ev.dentHp = dentHp;
    if (x !== undefined) {
      const c = f.car, dx = x - c.pos.x, dy = y - c.pos.y, dz = z - c.pos.z;
      ev.lx = dx * c.ax.x + dy * c.ax.y + dz * c.ax.z; ev.ly = dx * c.ay.x + dy * c.ay.y + dz * c.ay.z; ev.lz = dx * c.az.x + dy * c.az.y + dz * c.az.z;
    }
    this.events.push(ev);
    if (f.health.wrecked) this._wreck(f, f.health.wrecked);
  }

  /** X: blow your own car up (stuck, wedged, or just for fun). Goes through the normal wreck, so a race puts you back on the road. */
  selfDestruct() {
    const f = this.player;
    if (!f || !this.damageEnabled || f.wrecked || this.over) return false;
    f.health.hit('front', f.health.max.front * 10);
    this.events.push({ type: 'damage', id: f.id, isPlayer: true, zone: 'front', hp: 0 });
    if (f.health.wrecked) this._wreck(f, f.health.wrecked);
    return true;
  }

  _wreck(f, zone) {
    const c = f.car, rnd = this.rng;
    f.wrecked = true; f.wreckT = 0;
    c.refreshFrame();
    if (!f.isPlayer) {
      const wreckS = this.track.progressAt(c.pos.x, c.pos.y, c.pos.z);
      const key = f.raceSlot ?? 'id' + f.id, n = (this._wrecks.get(key) || 0) + 1;
      this._wrecks.set(key, n);
      if (this.demolition || n <= DERBY.repairs) { if (Number.isFinite(wreckS)) this._replacementS.push({ s: wreckS, raceSlot: f.raceSlot }); }
      else { f.scrap = true; this.count = Math.max(0, this.count - 1); }      // out of repairs: no replacement, and the burnt-out hulk stays where it fell
    }
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
      this._damage(o, zoneAt(o.car, c.pos.x, c.pos.y, c.pos.z), hp, by && f.lastHit && this.time - f.lastHit.t <= DERBY.credit ? by : null, c.pos.x, c.pos.y, c.pos.z);
    }
    if (f.isPlayer) {
      if (Number.isFinite(this.repairsMax)) {
        if (this.repairs <= 0) {
          this.over = true;                                           // no spanners left: the car is scrap (and stays on the track, burnt out)
          this.events.push({ type: 'over', scrap: true, zone, score: this.score, takedowns: this.takedowns });
        } else { this.repairs--; f.respawnAt = this.time + DERBY.respawnDelay; }           // a spanner is used: repaired and back on the road shortly
      } else if (this.demolition) {
        this.over = true;
        this.events.push({ type: 'over', zone, score: this.score, takedowns: this.takedowns });
      } else f.respawnAt = this.time + DERBY.respawnDelay;           // Race: back on the road shortly
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
    if (!this.enabled || !this.damageEnabled || !this.player) return;
    const P = this.player;
    const credit = this._dist(x, y, z) < DERBY.creditNear ? { id: P.id } : null;   // near you: your doing
    for (const f of this.fighters) {
      if (f.gone || f.wrecked) continue;
      const c = f.car;
      const d = Math.hypot(c.pos.x - x, c.pos.y - y, c.pos.z - z);
      const hp = blastDamage(kind, d) * f.spec.blastMul;
      if (hp <= 0) continue;
      c.refreshFrame();
      this._damage(f, zoneAt(c, x, y, z), hp, f.isPlayer ? { id: -1 } : credit, x, y, z);
    }
  }
}

export { ZONES };