// Where the road crosses itself at one height the editor asks "crossroad or gap?". This holds the maths for that (no DOM).
import { Track, CROSS_MAX_DY, CROSS_MIN_SIN } from './track.js';
export { CROSS_MAX_DY, CROSS_MIN_SIN };

const KNOWN_R = 15;            // a crossing within this of one already answered is the same crossing
export const GAP_HEIGHT = 5.2;  // how far one road is lifted over the other for a "gap" (a bridge you can drive under)

/** The crossroads of this track the person has not been asked about yet. */
export function pendingJunctions(track, def) {
  const known = def.junctions || [];
  return (track.crossroads || []).filter((c) => !known.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < KNOWN_R));
}

/** The stretches of road under (x, z): the samples within 7 m split into the separate stretches, each with its average height and arc position, lowest first. */
export function roadsAt(track, x, z) {
  const hits = [];
  for (let i = 0; i < track.n; i++) if (Math.abs(track.px[i] - x) < 7 && Math.abs(track.pz[i] - z) < 7 && Math.hypot(track.px[i] - x, track.pz[i] - z) < 7) hits.push(i);
  if (!hits.length) return [];
  const groups = [[hits[0]]];
  for (let k = 1; k < hits.length; k++) {
    const g = groups[groups.length - 1];
    if (hits[k] - g[g.length - 1] > 12) groups.push([hits[k]]); else g.push(hits[k]);
  }
  if (groups.length > 1 && hits[0] === 0 && hits[hits.length - 1] >= track.n - 12) groups[0] = groups.pop().concat(groups[0]);   // (one stretch that wraps past the start line)
  return groups.map((g) => ({ y: g.reduce((a, i) => a + track.py[i], 0) / g.length, s: track.s[g[Math.floor(g.length / 2)]] })).sort((a, b) => a.y - b.y);
}

/** The two road heights under (x, z), lowest first. */
export function roadHeightsAt(track, x, z) { return roadsAt(track, x, z).map((r) => r.y); }

/** The handles that make up the road near arc position `s` (within 45 m, or the nearest one). */
function handlesNear(def, track, s) {
  const L = track.length;
  const idx = def.handles.map((h, k) => { let d = Math.abs(track.handleS[k] - s); if (d > L / 2) d = L - d; return { k, d }; }).sort((a, b) => a.d - b.d);       // (each handle's own place along the lap, so a handle sitting right on the crossing still belongs to one road)
  const set = idx.filter((o) => o.d < 45).map((o) => o.k);
  return set.length ? set : [idx[0].k];
}

/** "Crossroad": remember the answer so the crossing is not asked about again. */
export function keepCrossroad(def, c) {
  def.junctions ||= [];
  if (!def.junctions.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < KNOWN_R)) def.junctions.push({ x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10 });
  if (def.junctions.length > 40) def.junctions.shift();
}
/** The crossing is no longer a remembered crossroad (it became a gap). */
export function forgetCrossroad(def, c) { def.junctions = (def.junctions || []).filter((k) => Math.hypot(k.x - c.x, k.z - c.z) >= KNOWN_R); }

/**
 * "Gap": lift the higher road (its nearest handles) until it clears the other by GAP_HEIGHT. A crossing that is already a gap that high or
 * higher is left exactly as it is. Returns the number of metres lifted (0 = nothing to do).
 */
export function makeGap(def, c) {
  const t0 = new Track(def), rs = roadsAt(t0, c.x, c.z);
  if (rs.length >= 2 && rs[rs.length - 1].y - rs[0].y >= GAP_HEIGHT) return 0;
  const upper = rs.length >= 2 ? rs[rs.length - 1].s : c.sB, set = handlesNear(def, t0, upper);
  let lifted = 0;
  for (let it = 0; it < 24; it++) {
    const hs = roadHeightsAt(new Track(def), c.x, c.z);
    if (hs.length >= 2 && hs[hs.length - 1] - hs[0] >= GAP_HEIGHT) return lifted;
    for (const k of set) def.handles[k].y = (def.handles[k].y ?? 0) + 0.8;
    lifted += 0.8;
  }
  return lifted;
}

/**
 * "Crossroad" for roads at different heights: raise the lower road up to the higher one (the highest point that already exists, so nothing
 * is dug into the ground) until they are level enough to join. Returns how far the lower road was raised, or -1 if it could not be done.
 */
export function flattenCrossing(def, c) {
  const t0 = new Track(def), rs = roadsAt(t0, c.x, c.z);
  if (rs.length < 2) return -1;
  const set = handlesNear(def, t0, rs[0].s), target = rs[rs.length - 1].y;
  let raised = 0;
  for (let it = 0; it < 80; it++) {
    const hs = roadHeightsAt(new Track(def), c.x, c.z);
    if (hs.length >= 2 && hs[hs.length - 1] - hs[0] < 0.4) return raised;
    const step = Math.min(1, Math.max(0.1, (target - hs[0]) * 0.6));
    for (const k of set) def.handles[k].y = (def.handles[k].y ?? 0) + step;
    raised += step;
  }
  return raised;
}
