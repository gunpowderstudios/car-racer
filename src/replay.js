// Replay: a quiet recorder that notes where every car (and caravan) is about 20 times a second, a player that
// blends between those notes, and a TV-style camera director. Nothing here touches the graphics: main.js and replayMode.js
// move the real car models to the poses this gives back, so the replay looks exactly like the race.
//
//  * ReplayRecorder - a rolling window of the last `maxSeconds` of the race, plus a log of the events (dents, wrecks, big hits)
//  * ReplayPlayer   - poses at any time t (interpolated), and the events between two times
//  * ReplayCams     - trackside camera shots that cut as the car goes past, a high follow view, a chase offset

export const HZ = 20;
export const STRIDE = 29;     // numbers per car per sample: present, x y z, qx qy qz qw, steer, 4 wheel spins, health, wrecked, has van, 9 van numbers, rpm, throttle, tyre skid, boost
const MAX_EVENTS = 6000;

const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class ReplayRecorder {
  constructor({ hz = HZ, maxSeconds = 240 } = {}) {
    this.hz = hz; this.maxSeconds = maxSeconds;
    this.reset();
  }
  reset() {
    this.frames = []; this.head = 0; this.table = []; this.index = new Map(); this.events = []; this.lastT = -Infinity;
  }
  get empty() { return this.frames.length - this.head < 2; }
  get t0() { return this.frames.length > this.head ? this.frames[this.head].t : 0; }
  get t1() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
  get duration() { return Math.max(0, this.t1 - this.t0); }

  /** Note the cars at game time `t` (seconds). Returns false when it is too soon after the last note. `ents` is a list of
   *  { id, hue, isPlayer, x, y, z, qx, qy, qz, qw, steer, spin: [4], health, wrecked, van: [9] | null }. */
  record(t, ents) {
    if (t < this.lastT) { this.reset(); }                                    // the clock went backwards: a new race
    if (t - this.lastT < 1 / this.hz - 1e-6) return false;
    this.lastT = t;
    for (const e of ents) if (!this.index.has(e.id)) { this.index.set(e.id, this.table.length); this.table.push({ id: e.id, hue: e.hue ?? 0, isPlayer: !!e.isPlayer }); }
    const a = new Float64Array(this.table.length * STRIDE);
    for (const e of ents) {
      const o = this.index.get(e.id) * STRIDE;
      a[o] = 1; a[o + 1] = e.x; a[o + 2] = e.y; a[o + 3] = e.z;
      a[o + 4] = e.qx; a[o + 5] = e.qy; a[o + 6] = e.qz; a[o + 7] = e.qw;
      a[o + 8] = e.steer || 0;
      for (let i = 0; i < 4; i++) a[o + 9 + i] = e.spin ? e.spin[i] || 0 : 0;
      a[o + 13] = e.health ?? 1; a[o + 14] = e.wrecked ? 1 : 0;
      if (e.van) { a[o + 15] = 1; for (let i = 0; i < 9; i++) a[o + 16 + i] = e.van[i]; }
      a[o + 25] = e.rpm || 0; a[o + 26] = e.thr || 0; a[o + 27] = e.skid || 0; a[o + 28] = e.boost ? 1 : 0;
    }
    this.frames.push({ t, a });
    // keep a rolling window: forget what is older than maxSeconds
    while (this.frames.length - this.head > 2 && t - this.frames[this.head].t > this.maxSeconds) this.head++;
    if (this.head > 1500) { this.frames.splice(0, this.head); this.head = 0; }
    return true;
  }

  /** Log something that happened: { type: 'dent'|'clear'|'wreck'|'hit', id, ...}. Events must come in time order. */
  event(t, e) {
    this.events.push({ ...e, t });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }
}

export class ReplayPlayer {
  constructor(rec) {
    this.rec = rec;
    this._out = []; this._lastIdx = 0;
  }
  get t0() { return this.rec.t0; }
  get t1() { return this.rec.t1; }
  get duration() { return this.rec.duration; }
  get cars() { return this.rec.table; }

  /** Index of the last sample at or before t. */
  _find(t) {
    const F = this.rec.frames, lo0 = this.rec.head;
    if (t <= F[lo0].t) return lo0;
    if (t >= F[F.length - 1].t) return F.length - 1;
    let lo = lo0, hi = F.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].t <= t) lo = mid; else hi = mid; }
    return lo;
  }

  /** The cars at time t, blended between the two nearest notes. The returned objects are reused: copy what you keep. */
  sample(t) {
    const rec = this.rec, F = rec.frames, out = this._out;
    out.length = 0;
    if (rec.empty) return out;
    const i = this._find(t), A = F[i], B = F[Math.min(F.length - 1, i + 1)];
    const k = B.t > A.t ? clamp((t - A.t) / (B.t - A.t), 0, 1) : 0;
    const n = A.a.length / STRIDE;
    for (let c = 0; c < n; c++) {
      const o = c * STRIDE, a = A.a;
      if (!a[o]) continue;
      const hasB = o < B.a.length && B.a[o] === 1, b = hasB ? B.a : a, kk = hasB ? k : 0;
      let e = out[out.length] = this._ent(c);
      const m = (j) => a[o + j] + (b[o + j] - a[o + j]) * kk;
      e.idx = c; e.id = rec.table[c].id; e.hue = rec.table[c].hue; e.isPlayer = rec.table[c].isPlayer;
      e.x = m(1); e.y = m(2); e.z = m(3);
      // quaternion: a straight blend (the notes are close together), flipped to the near side and renormalised
      let qx = a[o + 4], qy = a[o + 5], qz = a[o + 6], qw = a[o + 7];
      let bx = b[o + 4], by = b[o + 5], bz = b[o + 6], bw = b[o + 7];
      if (qx * bx + qy * by + qz * bz + qw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      qx += (bx - qx) * kk; qy += (by - qy) * kk; qz += (bz - qz) * kk; qw += (bw - qw) * kk;
      const ql = Math.hypot(qx, qy, qz, qw) || 1;
      e.qx = qx / ql; e.qy = qy / ql; e.qz = qz / ql; e.qw = qw / ql;
      e.steer = m(8);
      for (let w = 0; w < 4; w++) e.spin[w] = m(9 + w);
      e.health = m(13); e.wrecked = a[o + 14] === 1;
      e.rpm = m(25); e.thr = m(26); e.skid = m(27); e.boost = a[o + 28] === 1;
      if (a[o + 15] === 1) {
        const v = e.van || (e.van = new Array(9).fill(0)), hv = hasB && b[o + 15] === 1, bv = hv ? b : a, kv = hv ? kk : 0;
        for (let j = 0; j < 9; j++) v[j] = a[o + 16 + j] + (bv[o + 16 + j] - a[o + 16 + j]) * kv;
        v[3] = a[o + 19] + wrapPi(bv[o + 19] - a[o + 19]) * kv;           // the yaw takes the short way round
      } else e.van = null;
    }
    return out;
  }
  _ent(c) {
    return this._pool?.[c] || ((this._pool || (this._pool = []))[c] = { idx: c, id: 0, hue: 0, isPlayer: false, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, steer: 0, spin: [0, 0, 0, 0], health: 1, wrecked: false, van: null });
  }

  /** Events with ta < t <= tb, in order. */
  between(ta, tb) {
    const E = this.rec.events, out = [];
    let lo = 0, hi = E.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (E[mid].t <= ta) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < E.length && E[i].t <= tb; i++) out.push(E[i]);
    return out;
  }
}

// ------------------------------------------------------------------------------------------ cameras
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const VIEWS = ['TV', 'Chase', 'Top'];

export class ReplayCams {
  /** `track` is the game's Track; `arena` is arenaInfo(track) for an arena with no road to follow, else null. */
  constructor(track, arena = null) {
    this.track = track; this.arena = arena;
    this._f = {};
    this.reset();
    this.out = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 50 };
  }
  reset() { this.shot = null; this.time = 0; this.n = 0; this.tx = this.ty = this.tz = null; this.fov = 50; this.top = null; }

  /** TV: a trackside camera. Cuts to a new one ahead of the car once the car has gone past, or got too far away. */
  _newShot(fc, s) {
    const tr = this.track, speed = Math.hypot(fc.vx, fc.vz);
    this.n++;
    const h = hash(this.n), side = this.n % 2 ? 1 : -1;
    if (this.arena) {
      // an arena has no road: cameras stand round the edge of the floor; take the one nearest the car
      const A = this.arena, spots = [];
      for (let k = 0; k < 8; k++) { const th = k / 8 * Math.PI * 2 + 0.2; spots.push({ x: A.cx + Math.cos(th) * (A.ax * 1.08 + 4), z: A.cz + Math.sin(th) * (A.az * 1.08 + 4) }); }
      let best = null, bd = Infinity;
      for (const p of spots) { const d = (p.x - fc.x) ** 2 + (p.z - fc.z) ** 2 - (this.shot && p.x === this.shot.x && p.z === this.shot.z ? 1e12 : 0); if (d < bd) { bd = d; best = p; } }
      return { x: best.x, y: A.y + 5 + h * 4, z: best.z, s: 0, born: this.time, hold: 4 };
    }
    const L = tr.length, lead = clamp(28 + speed * 1.5, 38, 85);
    const f = tr.frameAt((s + lead) % L, this._f), off = f.hw + 3.5 + h * 7;
    return { x: f.x + f.lx * side * off, y: f.y + f.ly * side * off + 1.5 + h * 2.8, z: f.z + f.lz * side * off, s: (s + lead) % L, born: this.time, hold: 1.4 };
  }
  _needsCut(fc, s) {
    const sh = this.shot, age = this.time - sh.born;
    if (age < sh.hold) return false;
    const d = Math.hypot(fc.x - sh.x, fc.z - sh.z);
    if (this.arena) return d > this.arena.a * 1.1 || age > 9;
    let along = s - sh.s; const L = this.track.length;
    if (along > L / 2) along -= L; if (along < -L / 2) along += L;
    return along > 16 || d > 140 || age > 16;
  }

  /** mode: 'TV' | 'Top'. focus: { x, y, z, vx, vz, fx, fz } (position, velocity, facing). Returns {px,py,pz,tx,ty,tz,fov}. */
  update(mode, dt, fc) {
    this.time += dt;
    const o = this.out, kt = 1 - Math.exp(-dt * 7);
    let px, py, pz, ty = fc.y + 0.8, fov = 50;
    if (mode === 'Top') {
      const fl = Math.hypot(fc.fx, fc.fz) || 1, bx = -fc.fx / fl, bz = -fc.fz / fl;
      const gx = fc.x + bx * 22, gy = fc.y + 30, gz = fc.z + bz * 22;
      if (!this.top) this.top = { x: gx, y: gy, z: gz };
      const kp = 1 - Math.exp(-dt * 2.5);
      this.top.x += (gx - this.top.x) * kp; this.top.y += (gy - this.top.y) * kp; this.top.z += (gz - this.top.z) * kp;
      px = this.top.x; py = this.top.y; pz = this.top.z; fov = 55;
    } else {
      this.top = null;
      const s = this.arena ? 0 : this.track.progressAt(fc.x, fc.y, fc.z);
      if (!this.shot || this._needsCut(fc, s)) { this.shot = this._newShot(fc, s); this.tx = null; }
      px = this.shot.x; py = this.shot.y; pz = this.shot.z;
      // zoom so the car stays a similar size on screen (a car is about 5 m long: fill roughly a sixth of the width)
      const d = Math.max(8, Math.hypot(fc.x - px, fc.y - py, fc.z - pz));
      fov = clamp(2 * Math.atan(7 / d) * 180 / Math.PI, 12, 58);
    }
    // the camera swings round to follow the car with a little lag, as an operator would
    if (this.tx === null) { this.tx = fc.x; this.ty = ty; this.tz = fc.z; this.fov = fov; }
    else { this.tx += (fc.x - this.tx) * kt; this.ty += (ty - this.ty) * kt; this.tz += (fc.z - this.tz) * kt; this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 3)); }
    o.px = px; o.py = py; o.pz = pz; o.tx = this.tx; o.ty = this.ty; o.tz = this.tz; o.fov = this.fov;
    return o;
  }
}
