// Where the road crosses itself at one height the editor asks "crossroad or gap?". This holds the maths for that (no DOM).
import { Track } from './track.js';

const KNOWN_R = 15;            // a crossing within this of one already answered is the same crossing
export const GAP_HEIGHT = 5.2;  // how far one road is lifted over the other for a "gap" (a bridge you can drive under)

/** The crossroads of this track the person has not been asked about yet. */
export function pendingJunctions(track, def) {
  const known = def.junctions || [];
  return (track.crossroads || []).filter((c) => !known.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < KNOWN_R));
}

/** The two road heights under (x, z): the samples within 7 m split into the two stretches of road, each one's average height, lowest first. */
export function roadHeightsAt(track, x, z) {
  const hits = [];
  for (let i = 0; i < track.n; i++) if (Math.abs(track.px[i] - x) < 7 && Math.abs(track.pz[i] - z) < 7 && Math.hypot(track.px[i] - x, track.pz[i] - z) < 7) hits.push(i);
  if (!hits.length) return [];
  const groups = [[hits[0]]];
  for (let k = 1; k < hits.length; k++) {
    const g = groups[groups.length - 1];
    if (hits[k] - g[g.length - 1] > 12) groups.push([hits[k]]); else g.push(hits[k]);
  }
  if (groups.length > 1 && hits[0] === 0 && hits[hits.length - 1] >= track.n - 12) groups[0] = groups.pop().concat(groups[0]);   // (one stretch that wraps past the start line)
  return groups.map((g) => g.reduce((a, i) => a + track.py[i], 0) / g.length).sort((a, b) => a - b);
}

/** "Crossroad": remember the answer so the crossing is not asked about again. */
export function keepCrossroad(def, c) { (def.junctions ||= []).push({ x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10 }); if (def.junctions.length > 40) def.junctions.shift(); }

/** "Gap": lift the later road (nearest handles) until it clears the other by GAP_HEIGHT. Returns the number of metres lifted, or 0 if it could not. */
export function makeGap(def, c) {
  const t0 = new Track(def), L = t0.length;
  const idx = def.handles.map((h, k) => {
    const s = t0.progressAt(h.x, h.y ?? 0, h.z);
    let d = Math.abs(s - c.sB); if (d > L / 2) d = L - d;
    return { k, d };
  }).sort((a, b) => a.d - b.d);
  const set = idx.filter((o) => o.d < 45).map((o) => o.k);
  if (!set.length) set.push(idx[0].k);
  let lifted = 0;
  for (let it = 0; it < 24; it++) {
    const hs = roadHeightsAt(new Track(def), c.x, c.z);
    if (hs.length >= 2 && hs[hs.length - 1] - hs[0] >= GAP_HEIGHT) return lifted;
    for (const k of set) def.handles[k].y = (def.handles[k].y ?? 0) + 0.8;
    lifted += 0.8;
  }
  return lifted;
}
