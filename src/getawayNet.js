// The Getaway online (two players): the pure parts, so they run (and are tested) in Node.
//
// One of the two browsers (the host) runs the rules (getaway.js GetawayGame) from both cars' positions and tells the other what is going on:
// a small snapshot about ten times a second, plus every event (pickup, ram, stopped, deliver, win...) the moment it happens. The other browser
// keeps a mirror GetawayGame that these overwrite, so the town, bags, satnav, map and scores are drawn by exactly the same code as the AI game.

const r1 = (n) => Math.round(n * 10) / 10;

/** Who is the robber this round: one of the (two) players, picked at random. `rng` is a 0..1 function. Returns { robber, police } player ids. */
export function pickRoles(ids, rng = Math.random) {
  const list = [...ids].sort();
  if (list.length < 2) return { robber: list[0] ?? null, police: null };
  const k = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return { robber: list[k], police: list[1 - k] ?? list[0] };
}

const STATE = { h: 'hidden', o: 'home', r: 'robber', g: 'ground', p: 'police', s: 'safe' };
const LETTER = { hidden: 'h', home: 'o', robber: 'r', ground: 'g', police: 'p', safe: 's' };

/** What the host sends about the rules every so often: everything the other screen needs to draw the game (a bag is one letter, or [letter, x, z] when it is away from its bank). */
export function snapshotGame(g, seq = 0) {
  const sh = g.safehouse;
  return {
    q: seq, t: r1(g.time),
    bags: g.bags.map((b) => (b.state === 'hidden' || b.state === 'home' ? LETTER[b.state] : [LETTER[b.state], r1(b.x), r1(b.z)])),
    carry: g.robberBag ? g.robberBag.id : -1,
    robbed: g.robbed, strikes: g.strikes, rams: g.ramCount, alarm: !!g.alarm, over: !!g.over, winner: g.winner || null,
    sh: { x: r1(sh.x), z: r1(sh.z), gx: sh.gx, mouth: sh.mouth, street: sh.street, back: sh.back },
    door: g.door ? { gx: g.door.gx, mouth: g.door.mouth, t: r1(g.door.t) } : null,
  };
}

/** Overwrite a mirror GetawayGame with a snapshot from the host. */
export function applySnapshot(g, s) {
  g.time = s.t;
  s.bags.forEach((v, i) => {
    const b = g.bags[i]; if (!b) return;
    const letter = Array.isArray(v) ? v[0] : v;
    b.state = STATE[letter] || 'hidden';
    if (Array.isArray(v)) { b.x = v[1]; b.z = v[2]; } else { b.x = b.home.x; b.z = b.home.z; }
  });
  g.robberBag = s.carry >= 0 ? g.bags[s.carry] || null : null;
  g.robbed = s.robbed; g.strikes = s.strikes; g.ramCount = s.rams; g.alarm = !!s.alarm; g.over = !!s.over; g.winner = s.winner || null;
  g.safehouse = { ...g.safehouse, ...s.sh };
  if (s.door) { if (!g.door || g.door.t !== s.door.t) g.door = { gx: s.door.gx, mouth: s.door.mouth, t: s.door.t, moved: false }; }
  else g.door = null;
  return g;
}

/** Keep only well-formed messages from the other browser (a snapshot's numbers are all finite, the bag list is the right length). */
export function cleanSnapshot(s, bagCount = 24) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.bags) || s.bags.length !== bagCount || !s.sh) return null;
  if (![s.t, s.robbed, s.strikes, s.rams, s.sh.x, s.sh.z].every(Number.isFinite)) return null;
  return s;
}
