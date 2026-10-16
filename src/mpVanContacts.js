// Caravans and other players' cars in multiplayer. Everyone simulates only their own car and caravan, and sees the others from their reports,
// so each side does its half: a remote car shoves and hurts MY caravan, and MY car is stopped by THEIR caravan (their screen does the mirror image).
const mpA = [0, 0, 0, 0, 0, 0], mpB = [0, 0, 0, 0, 0, 0], vel = { x: 0, z: 0 }, out = { closing: 0, mu: 0, x: 0, z: 0 };

/** A car as a row of three round bumpers along its heading ([x, z] pairs into `o`), and their radius. */
export function carBalls(cx, cz, fx, fz, spec, o) {
  const l = Math.hypot(fx, fz) || 1, ux = fx / l, uz = fz / l, r = Math.max(0.6, spec.width * 0.45), h = Math.max(0, spec.length / 2 - r);
  for (let k = 0; k < 3; k++) { const d = (k - 1) * h; o[k * 2] = cx + ux * d; o[k * 2 + 1] = cz + uz * d; }
  return r;
}

/** The remote car `c` (its last report: x, y, z, vx, vz) heading (fx, fz), against my caravan `van`: impulses and push-out on the caravan.
 *  Returns the closing speed, effective mass and where it hit (a shared object), or null if they are not touching. */
export function remoteCarHitsVan(van, c, fx, fz, theirs) {
  if (Math.abs(c.y - van.pos.y) > 2 || (c.x - van.pos.x) ** 2 + (c.z - van.pos.z) ** 2 > 100) return null;
  const rc = carBalls(c.x, c.z, fx, fz, theirs, mpA), rv = van.bumpers(mpB), D = rv + rc;
  let deepest = 0, dnx = 0, dnz = 0;
  out.closing = 0; out.mu = 0; out.x = out.z = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const ex = mpA[j * 2] - mpB[i * 2], ez = mpA[j * 2 + 1] - mpB[i * 2 + 1], d2 = ex * ex + ez * ez;
    if (d2 >= D * D) continue;
    const d = Math.sqrt(d2) || 1e-6, nx = ex / d, nz = ez / d, px = mpB[i * 2] + nx * rv, pz = mpB[i * 2 + 1] + nz * rv;
    if (D - d > deepest) { deepest = D - d; dnx = nx; dnz = nz; }
    van.velAt(px, pz, vel);
    const vn = ((+c.vx || 0) - vel.x) * nx + ((+c.vz || 0) - vel.z) * nz;      // their car's speed towards the caravan
    if (vn >= 0) continue;
    const mu = 1 / (van.invMassAt(nx, nz, px, pz) + 1 / theirs.mass);
    van.impulse(nx, nz, (1 + (-vn > 2 ? 0.2 : 0)) * vn * mu, px, pz);           // (vn is negative: this pushes the caravan along the way they are going)
    if (-vn > out.closing) { out.closing = -vn; out.mu = mu; out.x = px; out.z = pz; }
  }
  if (deepest > 0.005) { const k = Math.min(deepest, 0.35); van.pos.x -= dnx * k; van.pos.z -= dnz * k; }
  return deepest > 0 ? out : null;
}

/** My car against another player's caravan `vs` ([axle x, y, z, yaw, ...] from their report): pushed out of it, and loses most of its closing speed. */
export function carHitsRemoteVan(car, vs, spec, mine) {
  if (!Array.isArray(vs) || vs.length < 9 || !vs.every(Number.isFinite)) return false;
  if (Math.abs(vs[1] - car.pos.y) > 2 || (vs[0] - car.pos.x) ** 2 + (vs[2] - car.pos.z) ** 2 > 100) return false;
  const sy = Math.sin(vs[3]), cy = Math.cos(vs[3]), rv = Math.max(0.5, spec.width * 0.47), a = spec.rear + rv, b = spec.front - rv;
  const rm = carBalls(car.pos.x, car.pos.z, car.az.x, car.az.z, mine, mpA), D = rv + rm;
  let deepest = 0, dnx = 0, dnz = 0;
  for (let i = 0; i < 3; i++) {
    const zr = a + (b - a) * i * 0.5, bx = vs[0] + sy * zr, bz = vs[2] + cy * zr;
    for (let j = 0; j < 3; j++) {
      const ex = mpA[j * 2] - bx, ez = mpA[j * 2 + 1] - bz, d2 = ex * ex + ez * ez;
      if (d2 >= D * D) continue;
      const d = Math.sqrt(d2) || 1e-6;
      if (D - d > deepest) { deepest = D - d; dnx = ex / d; dnz = ez / d; }
    }
  }
  if (deepest <= 0) return false;
  car.pos.x += dnx * deepest; car.pos.z += dnz * deepest;
  const vn = car.vel.x * dnx + car.vel.z * dnz;
  if (vn < 0) { const dv = -vn * 0.6; car.vel.x += dnx * dv; car.vel.z += dnz * dv; }
  return true;
}
