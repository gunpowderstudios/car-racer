// The Getaway: a two-player cops-and-robbers game in a small town. No three.js in here, so it runs (and is tested) in Node.
//
// The town is a grid of blocks (4 across, 3 deep) with streets between and all round them. Every block has a bank; one bag of money is out at a time,
// lying small in a corner of the street outside a bank. One player is the ROBBER (the Dodge): drive over the bag and take it to the safehouse. The other
// is the POLICE car: ram the robber three times while he carries the bag and the robbery is stopped (the money goes back in its bank, the robber gets a
// strike). Three bags in the safehouse and the robbers win; three strikes and the robber goes to jail.
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
  goal: 3,                 // bags the robber needs in the safehouse to win
  ramSpeed: 6,             // closing speed (m/s) that counts as a ram
  rams: 3,                 // rams on the robber (while he carries a bag) that stop the robbery
  jail: 3,                 // stopped robberies (strikes) that put the robber in jail
  ramCool: 1.2,            // seconds before another ram can count
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
    this.strikes = 0;       // robberies the police have stopped (three and the robber is in jail)
    this.ramCount = 0;      // hard rams on the bag being carried now
    this.time = 0; this.over = false; this.winner = null;
    this.robberBag = null;       // the bag the robber is carrying (or null)
    this.ramCoolUntil = 0; this.events = [];
    this.alarm = false;     // a robbery in progress: the robber has a bag
    this._spawn(null, null);       // only one bag is out at a time; the rest are hidden until it is safe
  }

  /** Put the next bag out at a random bank (the hidden ones only), keeping away from both cars when it can. */
  _spawn(robber, police, not = null) {
    const hid = this.bags.filter((b) => b.state === 'hidden' && b !== not); if (!hid.length) return null;
    const far = hid.filter((b) => [robber, police].every((c) => !c || Math.hypot(b.home.x - c.x, b.home.z - c.z) > 60));
    const list = far.length ? far : hid, b = list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))];
    b.state = 'home'; b.x = b.home.x; b.z = b.home.z; b.lockUntil = 0;
    this.events.push({ type: 'spawn', bag: b.id });
    return b;
  }

  get robberCarrying() { return !!this.robberBag; }

  /** The bag that is out (at its bank) waiting to be picked up, as a list for the AI and the map. */
  loose() { return this.bags.filter((b) => b.state === 'home'); }

  /**
   * One step. `robber` and `police` are { x, z } (the cars); `rams` is the closing speeds of car-against-car knocks since the last step (m/s).
   * Appends what happened to this.events: pickup, ram, stopped, deliver, spawn, win.
   * The robber picks a bag up from its bank and drives it to the safehouse. Each hard ram from the police counts; the third stops the robbery: the bag
   * goes back in its bank (and the next one is put out) and the robber gets a strike. Three strikes and he is in jail.
   */
  step(dt, robber, police, rams = []) {
    if (this.over) return;
    this.time += dt;
    const T = this.L.T;
    if (this.robberBag && this.time >= this.ramCoolUntil) {
      let hardest = 0; for (const s of rams) hardest = Math.max(hardest, s);
      if (hardest >= T.ramSpeed) {
        this.ramCount++; this.ramCoolUntil = this.time + T.ramCool;
        this.events.push({ type: 'ram', count: this.ramCount, need: T.rams, speed: hardest });
        if (this.ramCount >= T.rams) {                 // robbery stopped: the money goes back in its bank and the next bag is put out
          const b = this.robberBag; this.robberBag = null; b.state = 'hidden'; b.x = b.home.x; b.z = b.home.z;
          this.alarm = false; this.ramCount = 0; this.strikes++;
          this.events.push({ type: 'stopped', bag: b.id, count: this.strikes });
          if (this.strikes >= T.jail) this._win('police'); else this._spawn(robber, police, b);
        }
      }
    }
    if (this.over) return;
    if (!this.robberBag) {                              // the robber takes the bag that is out
      for (const b of this.bags) if (b.state === 'home' && Math.hypot(robber.x - b.x, robber.z - b.z) < T.bagR) {
        this.robberBag = b; b.state = 'robber'; this.alarm = true; this.ramCount = 0;
        this.events.push({ type: 'pickup', who: 'robber', bag: b.id, x: b.x, z: b.z });
        break;
      }
    }
    if (this.robberBag) { this.robberBag.x = robber.x; this.robberBag.z = robber.z; }
    if (this.robberBag && Math.hypot(robber.x - this.safehouse.x, robber.z - this.safehouse.z) < T.homeR) {      // delivery to the safehouse
      const b = this.robberBag; this.robberBag = null; b.state = 'safe'; b.x = this.safehouse.x; b.z = this.safehouse.z; this.alarm = false; this.robbed++; this.ramCount = 0;
      this.events.push({ type: 'deliver', bag: b.id, count: this.robbed });
      if (this.robbed >= this.goal) this._win('robber');
      else {                                         // the next bag turns up somewhere else, and the safehouse moves
        const old = this.safehouse;
        this.safehouse = pickSafehouse(this.L, this.rng, 90, [robber, police], old);
        this._spawn(robber, police);
      }
    }
  }

  _win(who) { this.over = true; this.winner = who; this.events.push({ type: 'win', who, robbed: this.robbed, strikes: this.strikes, time: this.time }); }
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
