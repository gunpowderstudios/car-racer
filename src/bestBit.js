// "Make my movie": finds the liveliest stretch of a replay (wrecks and big hits count most) and chooses the camera (always the TV one) for it.
// Nothing here touches the graphics: replayMode.js makes the film.
const WEIGHT = { wreck: 6, hit: 3, prop: 1.2, dent: 0.6 };

/** `player` is a ReplayPlayer. Returns { start, end, cuts: [{ t, view }] } (replay times). */
export function pickBestBit(player, len = 18) {
  const t0 = player.t0, t1 = player.t1, L = Math.min(len, t1 - t0);
  let best = t0, top = -Infinity;
  for (let a = t0; a + L <= t1 + 0.001; a += 0.5) {
    let sc = 0; for (const e of player.between(a - 0.001, a + L)) sc += WEIGHT[e.type] || 0;
    sc -= Math.abs(a - (t1 - L)) * 0.002;           // (a tiny nudge towards the end, where the race is decided, when it is a tie)
    if (sc > top) { top = sc; best = a; }
  }
  const start = best, end = Math.min(t1, best + L);
  const cuts = [{ t: start, view: 0 }];            // the whole film is from the TV (trackside) camera, which cuts to a new spot by itself as the cars pass
  return { start, end, cuts };
}
