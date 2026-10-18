// The bonnet camera: where to put it on each vehicle, worked out from the model itself.
//
// Points come in the car's own frame (x sideways, y up, z forward, the same space the camera is placed in). We look at the highest surface
// along the middle of the car, walking back from the nose: a car has a bonnet if that surface stays low for a stretch and then steps up
// (the windscreen). The camera sits just in front of that step, a hand above the bonnet, so the screen and roof are behind it and the view
// is the road with a strip of bonnet at the bottom. A bus, motorhome or van, whose nose is a flat wall, has no step and gets no bonnet camera.

const BIN = 0.1;                  // m: along-the-car resolution of the profile

/** pts: flat [x, y, z, x, y, z, ...]. Returns { y, z, pitch, len, rise } (camera height and place, tilt down in radians) or null when the vehicle has no bonnet. */
export function findBonnet(pts, log) {
  let zMax = -Infinity, zMin = Infinity, yMax = -Infinity, xMax = 0;
  for (let i = 0; i < pts.length; i += 3) { const z = pts[i + 2]; if (z > zMax) zMax = z; if (z < zMin) zMin = z; if (pts[i + 1] > yMax) yMax = pts[i + 1]; if (Math.abs(pts[i]) > xMax) xMax = Math.abs(pts[i]); }
  const L = zMax - zMin;
  if (!(L > 2) || !(xMax > 0.5)) return null;
  const band = Math.min(0.55, xMax * 0.45), nb = Math.ceil(L / BIN) + 1, top = new Array(nb).fill(-Infinity);
  for (let i = 0; i < pts.length; i += 3) {
    if (Math.abs(pts[i]) > band) continue;
    const k = Math.floor((zMax - pts[i + 2]) / BIN);         // 0 = the nose
    if (pts[i + 1] > top[k]) top[k] = pts[i + 1];
  }
  for (let k = 1; k < nb; k++) if (top[k] === -Infinity) top[k] = top[k - 1];       // a gap (an open grille, say) takes the height before it
  if (top[0] === -Infinity) return null;
  // a low-poly body has big flat triangles with no vertices in the middle of the bonnet: fill a gap that has higher ground on both sides
  for (let pass = 0; pass < 2; pass++) {
    const was = top.slice();
    for (let k = 0; k < nb; k++) {
      let l = -Infinity, r = -Infinity;
      for (let j = Math.max(0, k - 3); j < k; j++) l = Math.max(l, was[j]);
      for (let j = k + 1; j <= Math.min(nb - 1, k + 3); j++) r = Math.max(r, was[j]);
      top[k] = Math.max(was[k], Math.min(l, r));
    }
  }
  // walk back from the nose: the bonnet is the low stretch; the screen is where the surface climbs well above what it was a few bins earlier
  const kStart = Math.round(0.3 / BIN), kEnd = Math.min(nb - 1, Math.floor(0.5 * L / BIN)), lag = 3;
  let step = -1;
  for (let k = kStart + lag; k <= kEnd; k++) {
    let base = -Infinity; for (let j = kStart; j <= k - lag; j++) base = Math.max(base, top[j]);
    if (top[k] > base + 0.2) { step = Math.max(kStart + 1, k - lag); break; }
  }
  log?.('profile', top.slice(0, 30).map((v) => v.toFixed(2)).join(' '), 'step', step);
  if (step < 0) return null;
  const len = step * BIN;                                                  // how long the bonnet is
  if (len < 0.6 || len > 0.42 * L) return null;
  let bonnetY = -Infinity; for (let k = 0; k < step; k++) bonnetY = Math.max(bonnetY, top[k]);
  let rise = -Infinity; for (let k = step; k <= Math.min(nb - 1, step + 8); k++) rise = Math.max(rise, top[k] - bonnetY);   // how far the screen climbs above the bonnet
  if (rise < 0.28) return null;
  // the camera: just in front of the step, 0.3 m above the bonnet
  const z = zMax - (step - 1) * BIN, y = bonnetY + 0.3;
  const d = Math.max(0.4, zMax - z), vfov = 1.15;
  const pitch = Math.min(0.12, Math.max(-0.12, Math.atan2(y - bonnetY, d) + 0.13 * vfov - vfov / 2));   // tilt so the nose of the bonnet sits about an eighth of the way up the screen
  return { y, z, pitch, len, rise };
}
