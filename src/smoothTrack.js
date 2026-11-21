// Auto-smooth: evens out a track's points so the curve is less jagged. Taubin smoothing (a pull towards the neighbours, then a small push
// back out) so the circuit does not shrink; the height and lean of each point are eased the same way. Points that carry a jump gap stay
// exactly where they are (and so do their heights), and points crowded in under MIN_GAP of a neighbour are merged.
const LAMBDA = 0.45, MU = -0.47, PASSES = 3, MIN_GAP = 7;

export function smoothHandles(handles) {
  let H = handles.map((h) => ({ ...h }));
  const n0 = H.length;
  // merge crowded points (never a gap point, never below 4 points)
  for (let i = 0; i < H.length && H.length > 4;) {
    const a = H[i], b = H[(i + 1) % H.length];
    if (!a.gap && !b.gap && Math.hypot(a.x - b.x, a.z - b.z) < MIN_GAP) {
      const j = (i + 1) % H.length;
      a.x = (a.x + b.x) / 2; a.z = (a.z + b.z) / 2; a.y = (a.y + b.y) / 2; a.bank = ((a.bank || 0) + (b.bank || 0)) / 2;
      H.splice(j, 1); if (j < i) i--;
    } else i++;
  }
  const merged = n0 - H.length, n = H.length;
  const step = (k) => {
    const out = H.map((h) => ({ ...h }));
    for (let i = 0; i < n; i++) {
      const h = H[i], p = H[(i + n - 1) % n], q = H[(i + 1) % n];
      if (h.gap) continue;
      out[i].x = h.x + k * ((p.x + q.x) / 2 - h.x);
      out[i].z = h.z + k * ((p.z + q.z) / 2 - h.z);
      if (!p.gap && !q.gap) out[i].y = Math.max(0, h.y + k * 0.7 * ((p.y + q.y) / 2 - h.y));
      out[i].bank = (h.bank || 0) + k * ((p.bank || 0) / 2 + (q.bank || 0) / 2 - (h.bank || 0));
    }
    H = out;
  };
  for (let r = 0; r < PASSES; r++) { step(LAMBDA); step(MU); }
  H.forEach((h) => { h.x = Math.round(h.x * 10) / 10; h.z = Math.round(h.z * 10) / 10; h.y = Math.round(h.y * 20) / 20; h.bank = Math.round((h.bank || 0) * 2) / 2; });
  return { handles: H, merged };
}
