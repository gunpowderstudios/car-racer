// More chicken-like behaviour layered onto Props without touching the barrel/vehicle physics.
// Chickens remain non-physical trigger targets: this only changes how they wander and react.
import { Props } from './props.js';
import { clamp } from './math.js';

const TUNE = {
  walkMin: 0.45,
  walkMax: 0.95,
  fleeSpeed: 1.85,
  scareRadius: 7.5,
  wanderMargin: 0.7,
  respawnMin: 4.0,
  respawnMax: 7.0,
};

function initChicken(c, props) {
  if (c.smartChicken) return;
  const rnd = props.rng;
  c.smartChicken = true;
  c.spawnX = c.pos.x; c.spawnY = c.pos.y; c.spawnZ = c.pos.z;
  c.speed = TUNE.walkMin + rnd() * (TUNE.walkMax - TUNE.walkMin);
  c.drift = (rnd() - 0.5) * 0.55;
  c.heading = 0;
  c.nervous = 0.25 + rnd() * 0.75;
  c.state = 'walk';
  c.stateT = 1.2 + rnd() * 2.8;
  c.respawnDelay = 0;
}

Props.prototype._stepChickens = function stepSmartChickens(dt) {
  const track = this.track, rnd = this.rng;

  for (const c of this.chickens) {
    initChicken(c, this);

    // After a splat, stay gone for a few seconds, then quietly reappear at the placed position.
    if (c.deadT >= 0) {
      c.deadT += dt;
      if (c.respawnDelay > 0 && c.deadT >= c.respawnDelay) {
        const g = track.groundAt(c.spawnX, c.spawnZ, c.spawnY + 0.5, this.gq, true);
        c.pos.set(c.spawnX, g.y, c.spawnZ);
        c.nx = g.nx; c.ny = g.ny; c.nz = g.nz;
        c.alive = true; c.deadT = -1;
        c.state = 'look'; c.stateT = 0.45 + rnd() * 0.75;
        c.walkDir = rnd() < 0.5 ? 1 : -1;
        c.drift = (rnd() - 0.5) * 0.45;
        c.speed = TUNE.walkMin + rnd() * (TUNE.walkMax - TUNE.walkMin);
      }
      continue;
    }
    if (!c.alive) continue;

    const q = this.gq;
    track.query(c.pos.x, c.pos.y + 0.3, c.pos.z, q, 1.0);
    if (q.idx < 0) continue;

    // Nearest car: most chickens scurry away; a few freeze briefly first for comic timing.
    let near2 = Infinity, nearCar = null;
    for (const car of this._cars) {
      const dx = c.pos.x - car.pos.x, dz = c.pos.z - car.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < near2) { near2 = d2; nearCar = car; }
    }

    const scare2 = TUNE.scareRadius * TUNE.scareRadius;
    if (nearCar && near2 < scare2 && c.state !== 'flee' && c.state !== 'freeze') {
      const dx = c.pos.x - nearCar.pos.x, dz = c.pos.z - nearCar.pos.z;
      const lateral = dx * q.lx + dz * q.lz;
      c.walkDir = lateral >= 0 ? 1 : -1;                 // choose the road side away from the car
      const forward = dx * q.tx + dz * q.tz;
      c.drift = clamp(forward * 0.18, -0.65, 0.65);
      if (rnd() < 0.18 * (1.15 - c.nervous)) {
        c.state = 'freeze'; c.stateT = 0.18 + rnd() * 0.42;
      } else {
        c.state = 'flee'; c.stateT = 0.8 + rnd() * 1.0;
      }
    }

    c.stateT -= dt;
    if (c.stateT <= 0) {
      if (c.state === 'freeze' && nearCar && near2 < scare2) {
        c.state = 'flee'; c.stateT = 0.9 + rnd() * 0.9;
      } else if (c.state === 'flee') {
        c.state = 'walk'; c.stateT = 0.8 + rnd() * 2.3;
        c.speed = TUNE.walkMin + rnd() * (TUNE.walkMax - TUNE.walkMin);
        c.drift = (rnd() - 0.5) * 0.55;
      } else if (c.state === 'peck' || c.state === 'look' || c.state === 'freeze') {
        c.state = 'walk'; c.stateT = 0.7 + rnd() * 2.6;
        if (rnd() < 0.35) c.walkDir *= -1;
        c.speed = TUNE.walkMin + rnd() * (TUNE.walkMax - TUNE.walkMin);
        c.drift = (rnd() - 0.5) * 0.55;
      } else {
        const r = rnd();
        if (r < 0.48) {
          c.state = 'peck'; c.stateT = 0.35 + rnd() * 1.1;
        } else if (r < 0.72) {
          c.state = 'look'; c.stateT = 0.35 + rnd() * 0.9;
        } else {
          c.state = 'walk'; c.stateT = 0.6 + rnd() * 2.4;
          if (rnd() < 0.55) c.walkDir *= -1;
          c.speed = TUNE.walkMin + rnd() * (TUNE.walkMax - TUNE.walkMin);
          c.drift = (rnd() - 0.5) * 0.7;
        }
      }
    }

    // Pecking / looking / freezing are stationary pauses.
    if (c.state === 'peck' || c.state === 'look' || c.state === 'freeze') continue;

    // Mostly cross the road, but meander a little along it so the paths don't look mechanical.
    let side = c.walkDir;
    const speed = c.state === 'flee' ? TUNE.fleeSpeed * (0.9 + c.nervous * 0.25) : c.speed;
    const nextD = q.d + side * speed * dt;
    if (Math.abs(nextD) > Math.max(0.35, q.hw - TUNE.wanderMargin)) {
      side = c.walkDir = q.d > 0 ? -1 : 1;
      c.drift *= 0.35;
    }

    let vx = q.lx * side + q.tx * c.drift;
    let vz = q.lz * side + q.tz * c.drift;
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    c.pos.x += vx * speed * dt;
    c.pos.z += vz * speed * dt;
    c.heading = Math.atan2(vx, vz);

    const g = track.groundAt(c.pos.x, c.pos.z, c.pos.y + 0.5, this.gq, true);
    c.pos.y = g.y; c.nx = g.nx; c.ny = g.ny; c.nz = g.nz;
  }
};

// Keep Claude's existing non-physical hit test/splat event. We only add the respawn timer.
const originalChickenContacts = Props.prototype._chickenContacts;
Props.prototype._chickenContacts = function smartChickenContacts(car) {
  originalChickenContacts.call(this, car);
  for (const c of this.chickens) {
    if (c.deadT === 0 && (!c.respawnDelay || c.respawnDelay <= 0)) {
      c.respawnDelay = TUNE.respawnMin + this.rng() * (TUNE.respawnMax - TUNE.respawnMin);
    }
  }
};
