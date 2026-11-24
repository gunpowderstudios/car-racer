// Pure maths for the replay camera: does a building stand in the way?

/** Does the line from `a` to `c` (x,y,z each) pass through (or start inside) this building? The building is checked in its own frame, a little fatter than it is so a camera brushing it counts. */export function lineHitsBuilding(B, a, c, pad = 1.2) {
  const loc = (p) => { const dx = p.x - B.x, dz = p.z - B.z; return [dx * B.c - dz * B.s, p.y, dx * B.s + dz * B.c]; }, A = loc(a), E = loc(c);
  for (const [u0, y0, v0, u1, y1, v1] of B.parts) {
    const lo = [u0 - pad, y0 - pad, v0 - pad], hi = [u1 + pad, y1 + pad, v1 + pad];
    let t0 = 0, t1 = 1, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const d = E[k] - A[k];
      if (Math.abs(d) < 1e-9) { if (A[k] < lo[k] || A[k] > hi[k]) ok = false; continue; }
      let ta = (lo[k] - A[k]) / d, tb = (hi[k] - A[k]) / d; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
    }
    if (ok) return true;
  }
  return false;
}
