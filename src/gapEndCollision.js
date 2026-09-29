import { Vehicle } from './vehicle.js';

// The jump/bridge end caps are visibly solid in trackGeometry.js, but until now the
// analytic vehicle collision only knew about side barriers. Add collision against the
// vertical road-slab faces at both ends of every gap so cars cannot pass through them.
const oldWalls = Vehicle.prototype._walls;

function gapEnds(track) {
  if (track._solidGapEnds) return track._solidGapEnds;
  const out = [];
  const n = track.n;
  for (let i = 0; i < n; i++) {
    if (track.gap[i]) continue;
    const nextGap = !!track.gap[(i + 1) % n];
    const prevGap = !!track.gap[(i - 1 + n) % n];
    if (!nextGap && !prevGap) continue;
    const th = Math.hypot(track.tx[i], track.tz[i]) || 1;
    if (nextGap) out.push({ i, dir: 1, tx: track.tx[i] / th, tz: track.tz[i] / th });
    if (prevGap) out.push({ i, dir: -1, tx: track.tx[i] / th, tz: track.tz[i] / th });
  }
  track._solidGapEnds = out;
  return out;
}

Vehicle.prototype._walls = function patchedWalls(track, dt) {
  oldWalls.call(this, track, dt);
  const ends = gapEnds(track);
  if (!ends.length) return;

  const hull = this.spec.hull;
  let best = null;

  for (let h = 0; h < hull.length; h++) {
    const p = this.toWorld(hull[h], this.hullWorld[h]);
    for (const e of ends) {
      const i = e.i;
      const rx = p.x - track.px[i], rz = p.z - track.pz[i];
      const along = rx * e.tx + rz * e.tz;
      const side = rx * track.lx[i] + rz * track.lz[i];
      const pen = -along * e.dir;               // positive only after entering the solid road side
      if (pen <= 0 || pen > 1.4) continue;
      if (Math.abs(side) > track.hw[i] + track.apron + 0.5) continue;

      // Height of the banked road surface at this lateral position. The visible end cap
      // extends vertically from the deck down to ground level, so only points below the deck hit it.
      const roadY = track.py[i] - (track.nx[i] * track.lx[i] * side + track.nz[i] * track.lz[i] * side) / Math.max(0.15, track.ny[i]);
      if (p.y > roadY + 0.08 || p.y < -0.8) continue;

      if (!best || pen > best.pen) best = { pen, p, nx: e.tx * e.dir, nz: e.tz * e.dir };
    }
  }

  if (!best) return;

  // Push the body back into the empty gap, then resolve the inward velocity with the
  // same restitution used by the normal barriers. This makes an undershot landing hit
  // the concrete face instead of ghosting through it.
  this.pos.x += best.nx * Math.min(best.pen, 0.45);
  this.pos.z += best.nz * Math.min(best.pen, 0.45);

  const n = { x: best.nx, y: 0, z: best.nz };
  const v = { x: 0, y: 0, z: 0 };
  this.velocityAt(best.p, v);
  const vn = v.x * n.x + v.z * n.z;
  if (vn < 0) {
    const inv = this.invMassAt(n, best.p);
    if (inv > 1e-6) this.impulseAt(n, -(1 + this.spec.wallBounce) * vn / inv, best.p);
    this.scraping = true;
    if (-vn > 1.5) this.events.push({ type: 'wall', speed: -vn, x: best.p.x, y: best.p.y, z: best.p.z });
  }
};
