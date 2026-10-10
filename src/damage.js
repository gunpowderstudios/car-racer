// Damage model for the destruction derby. No three.js in here, so it runs (and is tested) in Node.
//
// Every car has five zones - front, back, left, right and roof - each with its own hit points.
// A hit lands on the zone nearest to where the cars touched. The moment ANY zone reaches
// zero the car is wrecked and goes up in flames, so where you get hit matters as much as
// how hard. Your car is a banger built for the job: the front has extra plate welded on
// (lots of hit points), the rest is tougher than a rival's but much easier to kill.
//
// All the numbers you would want to tune are in ARMOUR and DAMAGE below.

export const ZONES = ['front', 'back', 'left', 'right', 'roof'];
export const ZONE_LABEL = { front: 'Front', back: 'Rear', left: 'Left side', right: 'Right side', roof: 'Roof' };

/** How tough every car is, as a share of its original armour. 1 = as first built; 0.8 = 20% weaker, so cars crumple and wreck sooner. Each vehicle then has its own damageMul on top (vehicleChoice.js). */
export const TOUGHNESS = 0.8;
const tough = (hp) => Object.fromEntries(Object.entries(hp).map(([zone, v]) => [zone, Math.round(v * TOUGHNESS)]));

/** Hit points per zone. */
export const ARMOUR = {
  player: tough({ front: 320, back: 160, left: 180, right: 180, roof: 150 }),
  rival: tough({ front: 95, back: 85, left: 85, right: 85, roof: 75 }),
};

export const DAMAGE = {
  // Cars: hit points lost = perKJ x (energy of the crash above the threshold, in kilojoules).
  // The energy is that of the closing speed acting on the two cars' effective mass, so a
  // hard head-on is many times worse than a nudge, and a heavy hit is capped by maxHit.
  perKJ: 0.65,
  minSpeed: 3,          // m/s of closing speed that is simply shrugged off (nudges, bumping in a queue)
  bleed: 0.25,          // share of a hit that also crumples the neighbouring zones
  maxHit: 110,          // most one crash can take off one zone: from full health, a single hit never kills you
  // Barriers and the ground hurt much less than another car: they are softer than a bumper.
  wall: 0.12, ground: 0.04,
  // Explosions. `point` is what a rival loses at point blank, `radius` how far the blast reaches.
  // A player takes a fraction (the "mul" in each car's spec): the bodywork is thicker.
  barrel: { radius: 10, point: 90 },
  wreck: { radius: 8, point: 60, push: 4.5 },      // a wrecked car going up hurts its neighbours too
  burnPerSecond: 16,    // a rival lying on its roof cooks itself at this rate
};

/** Which zones sit beside each one for secondary crumple damage. */
export const NEIGHBOURS = {
  front: ['left', 'right'], back: ['left', 'right'],
  left: ['front', 'back'], right: ['front', 'back'],
  roof: ['left', 'right'],
};

export const SPECS = {
  // `mul` scales the damage a zone takes: the plate welded across your front end soaks up half of every hit.
  player: { hp: ARMOUR.player, blastMul: 0.4, wallMul: 1, mul: { front: 0.5 } },
  rival: { hp: ARMOUR.rival, blastMul: 1, wallMul: 1, mul: {} },
};

/** Which zone of `car` is nearest world point (x, y, z). Needs the car's frame to be current. */
export function zoneAt(car, x, y, z) {
  const dx = x - car.pos.x, dy = y - car.pos.y, dz = z - car.pos.z;
  const lx = dx * car.ax.x + dy * car.ax.y + dz * car.ax.z;
  const ly = dx * car.ay.x + dy * car.ay.y + dz * car.ay.z;
  const lz = dx * car.az.x + dy * car.az.y + dz * car.az.z;

  // A roof-ground impact has a contact point well above the centre of mass in the car's own
  // local Y axis. Keep the threshold above bonnet/shoulder contacts so ordinary side and front
  // crashes are still classified exactly as before.
  const shoulder = car?.spec?.body?.shoulder ?? 0.25;
  if (ly > shoulder + 0.12 && ly > Math.abs(lx) * 0.4 && ly > Math.abs(lz) * 0.12) return 'roof';

  // Compare how far along each horizontal axis the point is as a share of the car's half length / half width.
  if (Math.abs(lz) / 2.35 >= Math.abs(lx) / 0.93) return lz >= 0 ? 'front' : 'back';
  return lx >= 0 ? 'left' : 'right';
}

/** Hit points a crash takes off a zone. `mu` is the effective mass (kg), `closing` the closing speed (m/s). */
export function crashDamage(mu, closing) {
  const v = closing - DAMAGE.minSpeed;
  if (v <= 0) return 0;
  const kJ = 0.5 * mu * v * v / 1000;
  return Math.min(DAMAGE.maxHit, DAMAGE.perKJ * kJ);
}

/**
 * How big a dent (in hit points' worth, see dentMath.js) a roof hitting the ground at `speed` m/s leaves. The hit points a
 * ground impact takes off are tiny, so rolls would never mark the roof; this sizes the dent from the speed instead.
 */
export function roofDentHp(speed) {
  return Math.min(60, Math.max(0, (speed - 2.5) * 2.6));
}

/** Hit points a barrier hit takes off a zone. */
export function wallDamage(mass, speed) {
  const v = speed - DAMAGE.minSpeed;
  if (v <= 0) return 0;
  return Math.min(DAMAGE.maxHit, DAMAGE.perKJ * DAMAGE.wall * 0.5 * mass * v * v / 1000);
}

/** Blast damage at distance d from an explosion of `kind` ({ radius, point }); falls off linearly. */
export function blastDamage(kind, d) {
  if (d >= kind.radius) return 0;
  const near = 2;                                   // full damage inside two metres
  return kind.point * Math.min(1, (kind.radius - d) / (kind.radius - near));
}

/** How much of an explosion's full punch lands at distance d, 0..1: everything inside two metres, then a straight
 *  fall to nothing at the blast radius. (Multiplayer scales this onto its single health bar.) */
export function blastFraction(kind, d) {
  return kind.point > 0 ? blastDamage(kind, d) / kind.point : 0;
}

/** The zone health of one car. */
export class Health {
  constructor(hp) {
    this.max = { ...hp };
    this.hp = { ...hp };
    this.last = null;              // the zone hit most recently
    this.wrecked = null;           // the zone that gave out, once one has
  }
  /** Take `amount` off `zone`. Returns the amount actually taken. */
  hit(zone, amount) {
    if (this.wrecked || amount <= 0) return 0;
    const took = Math.min(amount, this.hp[zone]);
    this.hp[zone] -= took;
    this.last = zone;
    if (this.hp[zone] <= 1e-6) { this.hp[zone] = 0; this.wrecked = zone; }
    return took;
  }
  frac(zone) { return this.hp[zone] / this.max[zone]; }
  /** The weakest zone as a fraction of its own maximum: what decides when the car goes up. */
  get worst() { let w = 1; for (const z of ZONES) w = Math.min(w, this.frac(z)); return w; }
  get worstZone() { let w = 2, k = 'front'; for (const z of ZONES) { const f = this.frac(z); if (f < w) { w = f; k = z; } } return k; }
  reset() { this.hp = { ...this.max }; this.last = null; this.wrecked = null; }
}
