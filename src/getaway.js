// The Getaway: a two-player cops-and-robbers game in a small town. No three.js in here, so it runs (and is tested) in Node.
//
// The town is a grid of blocks (4 across, 3 deep) with streets between and all round them. Every block has a bank, and outside each bank
// (in the middle of the street) lies a bag of money. One player is the ROBBER (the Dodge): drive over a bag to pick it up (one at a time) and
// take it to the safehouse. The other is the POLICE car: ram the robber hard enough and the bag drops; drive over a dropped bag and take it
// back to its bank. Three bags safe in the safehouse and the robbers win; three bags back in the banks and the police win.
//
// Everything here is a pure function of positions handed in each step, so the same code serves the AI game and (later) the online one.

/** The town's measurements, metres. */
export const TOWN = {
  cols: 4, rows: 3,         // blocks across and deep
  bx: 46, bz: 36,          // one block (x by z)
  street: 18,              // street width (a two-lane road with room to overtake)
  border: 12,              // thickness of the solid wall of buildings all round the town
  bagR: 3.4,               // how close a car must come to a bag to pick it up
  homeR: 7,                // how close the police must bring a bag to its bank / the robber to the safehouse
  goal: 3,                 // bags needed to win
  ramSpeed: 7,             // closing speed (m/s) that knocks a bag out of the robber's car
  ramGrace: 2.6,           // seconds after a drop before the robber may take the same bag back
  ramCool: 1.6,            // seconds before another ram can drop another bag
  height: 11,              // how tall the buildings stand (the solid part; the view makes them different)
};

const bagKey = (j, i) => j * TOWN.cols + i;

/**
 * The town laid out: street centre lines (xs, zs), the 12 blocks, the 20 street junctions, the banks and where their bags lie,
 * the solid boxes the cars cannot enter (the blocks and the border wall) and where each side starts.
 */
export function townLayout(T = TOWN) {
  const { cols, rows, bx, bz, street, border } = T;
  const W = cols * bx + (cols + 1) * street, D = rows * bz + (rows + 1) * street;
  const xs = [], zs = [];
  for (let i = 0; i <= cols; i++) xs.push(-W / 2 + street / 2 + i * (bx + street));
  for (let j = 0; j <= rows; j++) zs.push(-D / 2 + street / 2 + j * (bz + street));
  const blocks = [], banks = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    blocks.push({ i, j, cx, cz, hx: bx / 2, hz: bz / 2 });
    banks.push({ id: bagKey(j, i), i, j, cx, cz, bag: { x: cx + bx / 2 - 5, z: cz + bz / 2 + 4.5 }, door: { x: cx, z: cz + bz / 2 } });          // the bag lies small in the corner of the street, by the kerb at the east end of the bank's (south) side
  }
  const nodes = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) nodes.push({ i, j, x: xs[i], z: zs[j] });
  // the solid boxes: every block, and a wall of buildings all round the outside
  const boxes = blocks.map((b) => ({ x0: b.cx - b.hx, x1: b.cx + b.hx, z0: b.cz - b.hz, z1: b.cz + b.hz, kind: 'block' }));
  boxes.push({ x0: -W / 2 - border, x1: W / 2 + border, z0: -D / 2 - border, z1: -D / 2, kind: 'wall' });
  boxes.push({ x0: -W / 2 - border, x1: W / 2 + border, z0: D / 2, z1: D / 2 + border, kind: 'wall' });
  boxes.push({ x0: -W / 2 - border, x1: -W / 2, z0: -D / 2, z1: D / 2, kind: 'wall' });
  boxes.push({ x0: W / 2, x1: W / 2 + border, z0: -D / 2, z1: D / 2, kind: 'wall' });
  const L = {
    T, W, D, xs, zs, blocks, banks, nodes, boxes,
    robberStart: { x: xs[0] + 14, z: zs[rows], fx: 1, fz: 0 },                 // the robber's end of the town: bottom left...
    policeStart: { x: xs[cols] - 14, z: zs[0], fx: -1, fz: 0 },                // ...and the police at the opposite end
  };
  return L;
}

/** Where the safehouse can go: the middle of every vertical street's segments and of the top street's (no bag ever lies there), so never on a bank's bag. */
export function safehouseSpots(L) {
  const { cols, rows } = L.T, out = [];
  for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) out.push({ x: L.xs[i], z: (L.zs[j] + L.zs[j + 1]) / 2 });
  for (let i = 0; i < cols; i++) out.push({ x: (L.xs[i] + L.xs[i + 1]) / 2, z: L.zs[0] });
  return out;
}

/** One safehouse picked at random (`rng` is a 0..1 function), at least `minFrom` metres from both starting places. */
export function pickSafehouse(L, rng = Math.random, minFrom = 110, from = null, not = null) {
  const away = from || [L.robberStart, L.policeStart];
  const all = safehouseSpots(L).filter((p) => !not || p.x !== not.x || p.z !== not.z), far = all.filter((p) => away.every((a) => Math.hypot(p.x - a.x, p.z - a.z) >= minFrom));
  const list = far.length ? far : all;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// ------------------------------------------------------------------------------------------------ getting about the streets (for the AI)

/** Index of the junction at column i, row j. */
export const nodeAt = (L, i, j) => j * (L.T.cols + 1) + i;

/** Which street a point is on: { kind: 'node', n } at a junction, { kind: 'h', j, i } on horizontal street j between junctions i and i+1, { kind: 'v', i, j } on a vertical street. */
export function streetAt(L, x, z) {
  const { cols, rows, street } = L.T, half = street / 2 + 0.5;
  let bi = -1, bj = -1;
  for (let i = 0; i <= cols; i++) if (Math.abs(x - L.xs[i]) <= half) { bi = i; break; }
  for (let j = 0; j <= rows; j++) if (Math.abs(z - L.zs[j]) <= half) { bj = j; break; }
  if (bi >= 0 && bj >= 0) return { kind: 'node', n: nodeAt(L, bi, bj), i: bi, j: bj };
  if (bj >= 0) { let i = 0; while (i < cols - 1 && x > L.xs[i + 1]) i++; return { kind: 'h', j: bj, i }; }
  if (bi >= 0) { let j = 0; while (j < rows - 1 && z > L.zs[j + 1]) j++; return { kind: 'v', i: bi, j }; }
  return null;
}

/** The nearest junction to a point. */
export function nearestNode(L, x, z) {
  let best = 0, bd = Infinity;
  for (let n = 0; n < L.nodes.length; n++) { const d = (L.nodes[n].x - x) ** 2 + (L.nodes[n].z - z) ** 2; if (d < bd) { bd = d; best = n; } }
  return best;
}

function neighbours(L, n) {
  const { cols, rows } = L.T, nd = L.nodes[n], out = [];
  if (nd.i > 0) out.push(nodeAt(L, nd.i - 1, nd.j));
  if (nd.i < cols) out.push(nodeAt(L, nd.i + 1, nd.j));
  if (nd.j > 0) out.push(nodeAt(L, nd.i, nd.j - 1));
  if (nd.j < rows) out.push(nodeAt(L, nd.i, nd.j + 1));
  return out;
}

/** The junctions at the two ends of the street segment a point is on (or just the junction it is at). */
function endsOf(L, s, x, z) {
  if (!s) return [nearestNode(L, x, z)];
  if (s.kind === 'node') return [s.n];
  if (s.kind === 'h') return [nodeAt(L, s.i, s.j), nodeAt(L, s.i + 1, s.j)];
  return [nodeAt(L, s.i, s.j), nodeAt(L, s.i, s.j + 1)];
}

const sameSegment = (a, b) => a && b && a.kind === b.kind && a.kind !== 'node' && (a.kind === 'h' ? a.j === b.j && a.i === b.i : a.i === b.i && a.j === b.j);

/**
 * The way from a car at (x, z) heading (hx, hz) to a target point: a list of points to drive through (junctions, then the target). A junction
 * straight behind a moving car costs extra, so it carries on and turns at the next one instead of stopping to turn round.
 */
export function route(L, x, z, hx, hz, tx, tz, speed = 0) {
  const sA = streetAt(L, x, z), sB = streetAt(L, tx, tz);
  if (sameSegment(sA, sB)) return [{ x: tx, z: tz }];
  if (sA && sB && sA.kind === 'node' && sB.kind === 'node' && sA.n === sB.n) return [{ x: tx, z: tz }];
  const N = L.nodes.length, dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
  const hl = Math.hypot(hx, hz) || 1, fx = hx / hl, fz = hz / hl;
  for (const n of endsOf(L, sA, x, z)) {
    const nd = L.nodes[n], dx = nd.x - x, dz = nd.z - z, d = Math.hypot(dx, dz);
    const behind = speed > 4 && d > 6 && (dx * fx + dz * fz) / d < -0.3;
    dist[n] = d + (behind ? 90 : 0);
  }
  for (;;) {
    let u = -1, ud = Infinity;
    for (let n = 0; n < N; n++) if (!done[n] && dist[n] < ud) { ud = dist[n]; u = n; }
    if (u < 0) break;
    done[u] = true;
    for (const v of neighbours(L, u)) {
      const d = ud + Math.hypot(L.nodes[v].x - L.nodes[u].x, L.nodes[v].z - L.nodes[u].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  let best = -1, bc = Infinity;
  for (const n of endsOf(L, sB, tx, tz)) { const c = dist[n] + Math.hypot(L.nodes[n].x - tx, L.nodes[n].z - tz); if (c < bc) { bc = c; best = n; } }
  if (best < 0) return [{ x: tx, z: tz }];
  const pts = [{ x: tx, z: tz }];
  for (let n = best; n >= 0; n = prev[n]) pts.push({ x: L.nodes[n].x, z: L.nodes[n].z });
  return pts.reverse();
}

// ------------------------------------------------------------------------------------------------ the game

/**
 * The rules. `bags` are the 12 bags of money: each is 'home' (outside its bank), 'robber' (in the robber's car), 'ground' (dropped in the road),
 * 'police' (in the police car) or 'safe' (in the safehouse, for good).
 */
export class GetawayGame {
  constructor(layout = townLayout(), { rng = Math.random, safehouse = null, goal = layout.T.goal } = {}) {
    this.L = layout; this.rng = rng; this.goal = goal;
    this.reset(safehouse);
  }

  reset(safehouse = null) {
    const L = this.L;
    this.safehouse = safehouse || pickSafehouse(L, this.rng);
    this.bags = L.banks.map((b) => ({ id: b.id, home: { x: b.bag.x, z: b.bag.z }, x: b.bag.x, z: b.bag.z, state: 'hidden', lockUntil: 0 }));
    this.robbed = 0;        // bags the robbers have got into the safehouse
    this.returned = 0;      // bags the police have got back into the banks
    this.time = 0; this.over = false; this.winner = null;
    this.robberBag = null; this.policeBag = null;       // the bag each is carrying (or null)
    this.ramCoolUntil = 0; this.events = [];
    this.alarm = false;     // a robbery in progress: the robber has a bag
    this._spawn(null, null);       // only one bag is out at a time; the rest are hidden until it is safe
  }

  /** Put the next bag out at a random bank (the hidden ones only), keeping away from both cars when it can. */
  _spawn(robber, police) {
    const hid = this.bags.filter((b) => b.state === 'hidden'); if (!hid.length) return null;
    const far = hid.filter((b) => [robber, police].every((c) => !c || Math.hypot(b.home.x - c.x, b.home.z - c.z) > 60));
    const list = far.length ? far : hid, b = list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))];
    b.state = 'home'; b.x = b.home.x; b.z = b.home.z; b.lockUntil = 0;
    this.events.push({ type: 'spawn', bag: b.id });
    return b;
  }

  get robberCarrying() { return !!this.robberBag; }

  /** Bags lying about that either side could pick up (home or dropped), for the AI and the map. */
  loose() { return this.bags.filter((b) => b.state === 'home' || b.state === 'ground'); }

  /**
   * One step. `robber` and `police` are { x, z } (the cars); `rams` is the closing speeds of car-against-car knocks since the last step (m/s).
   * Appends what happened to this.events: pickup, drop, deliver, return, win.
   */
  step(dt, robber, police, rams = []) {
    if (this.over) return;
    this.time += dt;
    const T = this.L.T;
    // a hard enough ram knocks the bag out of the robber's car, into the road where it was
    if (this.robberBag && this.time >= this.ramCoolUntil) {
      let hardest = 0; for (const s of rams) hardest = Math.max(hardest, s);
      if (hardest >= T.ramSpeed) {
        const b = this.robberBag; this.robberBag = null;
        b.state = 'ground'; b.x = robber.x; b.z = robber.z; b.lockUntil = this.time + T.ramGrace;
        this.ramCoolUntil = this.time + T.ramCool; this.alarm = false;
        this.events.push({ type: 'drop', bag: b.id, x: b.x, z: b.z, speed: hardest });
      }
    }
    // picking bags up: the robber takes a bag from its bank or the road; the police only take one from the road
    for (const b of this.bags) {
      if (!this.robberBag && (b.state === 'home' || b.state === 'ground') && this.time >= b.lockUntil && Math.hypot(robber.x - b.x, robber.z - b.z) < T.bagR) {
        this.robberBag = b; b.state = 'robber'; this.alarm = true;
        this.events.push({ type: 'pickup', who: 'robber', bag: b.id, x: b.x, z: b.z });
      } else if (!this.policeBag && b.state === 'ground' && Math.hypot(police.x - b.x, police.z - b.z) < T.bagR) {
        this.policeBag = b; b.state = 'police';
        this.events.push({ type: 'pickup', who: 'police', bag: b.id, x: b.x, z: b.z });
      }
    }
    // a bag carried follows its car
    if (this.robberBag) { this.robberBag.x = robber.x; this.robberBag.z = robber.z; }
    if (this.policeBag) { this.policeBag.x = police.x; this.policeBag.z = police.z; }
    // delivery to the safehouse
    if (this.robberBag && Math.hypot(robber.x - this.safehouse.x, robber.z - this.safehouse.z) < T.homeR) {
      const b = this.robberBag; this.robberBag = null; b.state = 'safe'; b.x = this.safehouse.x; b.z = this.safehouse.z; this.alarm = false; this.robbed++;
      this.events.push({ type: 'deliver', bag: b.id, count: this.robbed });
      if (this.robbed >= this.goal) this._win('robber');
      else {                                         // the next bag turns up somewhere else, and the safehouse moves
        const old = this.safehouse;
        this.safehouse = pickSafehouse(this.L, this.rng, 90, [robber, police], old);
        this._spawn(robber, police);
      }
    }
    // the police bring a bag back to its own bank
    if (this.policeBag && !this.over) {
      const b = this.policeBag;
      if (Math.hypot(police.x - b.home.x, police.z - b.home.z) < T.homeR) {
        this.policeBag = null; b.state = 'home'; b.x = b.home.x; b.z = b.home.z; this.returned++;
        this.events.push({ type: 'return', bag: b.id, count: this.returned });
        if (this.returned >= this.goal) this._win('police');
      }
    }
  }

  _win(who) { this.over = true; this.winner = who; this.events.push({ type: 'win', who, robbed: this.robbed, returned: this.returned, time: this.time }); }
}

/** Where a bag is drawn and picked up is already in the game; this keeps a point inside the streets (never inside a building), for dropping things. */
export function onStreet(L, x, z) {
  const s = streetAt(L, x, z);
  if (s) return { x, z };
  const n = L.nodes[nearestNode(L, x, z)];
  return { x: n.x, z: n.z };
}


/** Where a car that has flipped or got wedged is stood back up: the nearest junction, pointing along the street towards the middle of the town. */
export function rescuePose(L, x, z) {
  const n = L.nodes[nearestNode(L, x, z)], dx = -n.x, dz = -n.z;
  return Math.abs(dx) >= Math.abs(dz) ? { x: n.x, z: n.z, fx: Math.sign(dx) || 1, fz: 0 } : { x: n.x, z: n.z, fx: 0, fz: Math.sign(dz) || 1 };
}
