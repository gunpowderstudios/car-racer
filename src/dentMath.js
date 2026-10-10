// The arithmetic behind visible crash dents. No three.js in here, so `npm test` can check it in Node.
// A dent is a smooth bowl pushed into the car's body by the vertex shader (see dents.js). Sizes are in
// metres; the shader gets them converted to the model's own units.

export const DENT = {
  minHp: 4,            // a hit that takes off fewer hit points than this leaves no mark
  fullHp: 70,          // a hit this hard makes the biggest single dent
  depthMin: 0.05, depthMax: 0.26,      // metres a dent can be pushed in (one hit, and all hits piled together)
  radiusMin: 0.42, radiusMax: 0.85,    // metres across the bowl, centre to edge
  mergeFrac: 0.55,     // a new hit this close (share of the dent's radius) deepens the old dent instead of starting another
  burstSeconds: 0.15,  // hits closer together than this are one crash felt over several physics steps, not several crashes
};

/** How big a dent a hit of `hp` hit points makes, or null when it is too gentle to mark the car. */
export function dentSize(hp) {
  if (!(hp >= DENT.minHp)) return null;
  const k = Math.min(1, (hp - DENT.minHp) / (DENT.fullHp - DENT.minHp));
  return { depth: DENT.depthMin + (DENT.depthMax - DENT.depthMin) * 0.75 * k, radius: DENT.radiusMin + (DENT.radiusMax - DENT.radiusMin) * Math.sqrt(k) };
}

/**
 * Which face of the car's bounding box a point is nearest, given the point relative to the box centre and the
 * box half-sizes. Returns {axis: 0|1|2, sign: +1|-1}, or null for the underside (nobody sees a dent there).
 */
export function faceOf(rx, ry, rz, hx, hy, hz) {
  const a = [rx / hx, ry / hy, rz / hz];
  let k = 0;
  if (Math.abs(a[1]) > Math.abs(a[k])) k = 1;
  if (Math.abs(a[2]) > Math.abs(a[k])) k = 2;
  const sign = a[k] >= 0 ? 1 : -1;
  if (k === 1 && sign < 0) return null;
  return { axis: k, sign };
}

/**
 * The dents on one car. Centres and directions are in the model's own space (what the shader sees); radius
 * and depth stay in metres. `mpu` is metres per model unit, so distances can be compared in metres.
 */
export class DentStore {
  constructor(max) { this.max = max; this.list = []; }
  get length() { return this.list.length; }
  clear() { this.list.length = 0; }

  /**
   * Add a dent, or deepen one already there. Returns the dent that changed.
   * @param {{x,y,z,dx,dy,dz,radius,depth}} d  centre, push direction (unit, pointing into the car), size in metres
   */
  add(d, mpu, now = 0) {
    for (const e of this.list) {
      const dist = Math.hypot(e.x - d.x, e.y - d.y, e.z - d.z) * mpu;
      if (dist > DENT.mergeFrac * Math.max(e.radius, d.radius)) continue;
      if (now - e.t < DENT.burstSeconds) e.depth = Math.min(DENT.depthMax, Math.max(e.depth, d.depth));
      else e.depth = Math.min(DENT.depthMax, e.depth + 0.6 * d.depth);
      e.radius = Math.min(DENT.radiusMax * 1.15, Math.max(e.radius, d.radius));
      e.t = now;
      return e;
    }
    const e = { x: d.x, y: d.y, z: d.z, dx: d.dx, dy: d.dy, dz: d.dz, radius: d.radius, depth: d.depth, t: now };
    if (this.list.length < this.max) this.list.push(e);
    else {                                  // full: the shallowest dent makes way for the new one
      let w = 0;
      for (let i = 1; i < this.list.length; i++) if (this.list[i].depth < this.list[w].depth) w = i;
      this.list[w] = e;
    }
    return e;
  }
}
