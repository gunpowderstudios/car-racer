// The caravan model's wheel meshes come with a stray flap of body panelling welded to the tyre (the wheel-arch skirt), which swung round with the wheel like a coin flipping.
// A real wheel looks the same turned to any angle, so a triangle that is only found on one side of the wheel is not part of it: this finds those and hands them back to the body.
const SECTORS = 12, MIN_SECTORS = 9;

/** Triangle indices of a wheel mesh, split into the ones that are round about the wheel's axle ("wheel") and the ones that are not ("rest"). The axle is the shortest side of the mesh's box. */
export function splitWheelTriangles(geo) {
  const pos = geo.attributes.position, idx = geo.index;
  const T = idx ? idx.count / 3 : pos.count / 3;
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const ax = size.indexOf(Math.min(...size)), a = (ax + 1) % 3, b = (ax + 2) % 3;
  const comp = ['getX', 'getY', 'getZ'], mn = [bb.min.x, bb.min.y, bb.min.z], mx = [bb.max.x, bb.max.y, bb.max.z];
  const cen = new Float32Array(T * 3);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const i = vi(t, k); for (let c = 0; c < 3; c++) cen[t * 3 + c] += pos[comp[c]](i) / 3; }
  let ca = (mn[a] + mx[a]) / 2, cb = (mn[b] + mx[b]) / 2;
  let round = new Uint8Array(T).fill(1);
  for (let pass = 0; pass < 3; pass++) {
    const bins = new Map(), key = new Int32Array(T), sec = new Int32Array(T);
    for (let t = 0; t < T; t++) {
      const da = cen[t * 3 + a] - ca, db = cen[t * 3 + b] - cb, r = Math.hypot(da, db), z = cen[t * 3 + ax];
      const s = Math.floor(((Math.atan2(db, da) + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS;
      const k = Math.floor(r / 0.05) * 1000 + Math.floor((z - mn[ax]) / 0.05); key[t] = k; sec[t] = s;
      bins.set(k, (bins.get(k) || 0) | (1 << s));
    }
    const pc = (v) => { let n = 0; for (; v; v &= v - 1) n++; return n; };
    let sa = 0, sb = 0, n = 0;
    for (let t = 0; t < T; t++) {
      round[t] = pc(bins.get(key[t])) >= MIN_SECTORS ? 1 : 0;
      if (round[t]) { sa += cen[t * 3 + a]; sb += cen[t * 3 + b]; n++; }
    }
    if (!n) break;
    // the axle runs through the middle of the round part
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (let t = 0; t < T; t++) if (round[t]) for (let k = 0; k < 3; k++) { const i = vi(t, k), va = pos[comp[a]](i), vb = pos[comp[b]](i); if (va < lo[0]) lo[0] = va; if (va > hi[0]) hi[0] = va; if (vb < lo[1]) lo[1] = vb; if (vb > hi[1]) hi[1] = vb; }
    ca = (lo[0] + hi[0]) / 2; cb = (lo[1] + hi[1]) / 2;
  }
  const wheel = [], rest = [];
  for (let t = 0; t < T; t++) { const dst = round[t] ? wheel : rest; for (let k = 0; k < 3; k++) dst.push(vi(t, k)); }
  return { wheel, rest, axis: ax };
}
