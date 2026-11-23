// Traffic lights and pedestrian crossings (props of type 'lights' and 'crossing' placed on the road in the editor). No three.js here:
// signalLayout() says where each one is and which way the road runs; signalState() says what colour it is at a given time; the cars
// that drive like ordinary traffic (the 'regular' vehicles) stop at a red or amber (see ai.js), and signalView.js draws them.

export const SIGNAL = {
  lights: { green: 9, amber: 2, red: 8 },        // seconds
  crossing: { green: 14, amber: 0, red: 8 },     // a crossing with no lights beside it holds the traffic for the 8 s the pedestrians are walking
  stop: 5,                                       // a car stops this far before the signal (its middle: the nose is about 2.3 m further on)
  pair: 30,                                      // a crossing this close to traffic lights shares them: people walk while the lights are red
};
/** The signals' clock, in seconds: one clock for every light, car and pedestrian, so they all agree on the colour. */
export const signalClock = { fixed: null, get t() { return this.fixed !== null ? this.fixed : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0); } };      // (tests set `fixed` to freeze it at a chosen time)

const period = (k) => SIGNAL[k].green + SIGNAL[k].amber + SIGNAL[k].red;
export function signalState(kind, t, phase = 0) {
  const c = SIGNAL[kind], P = period(kind), u = (((t + phase) % P) + P) % P;
  return u < c.green ? 'green' : u < c.green + c.amber ? 'amber' : 'red';
}

/** One entry per lights / crossing prop: where, which way the traffic runs (fx, fz), the road's left (lx, lz) and half width, and its timing offset. */
export function signalLayout(track) {
  const out = [];
  (track?.def?.props || []).forEach((p, pi) => {
    if (p.type !== 'lights' && p.type !== 'crossing') return;
    const rot = (p.rot || 0) * Math.PI / 180, fx = Math.sin(rot), fz = Math.cos(rot);
    let lx = fz, lz = -fx, hw = (track.def.width || 14) / 2, y = p.y || 0;
    try { const f = track.frameAt(track.progressAt(p.x, (p.y || 0) + 0.5, p.z)); lx = f.lx; lz = f.lz; hw = f.hw; y = f.y; } catch { /* off the road: use the turn it was given */ }
    out.push({ pi, kind: p.type, x: p.x, z: p.z, y, fx, fz, lx, lz, hw, phase: (pi * 3.7) % period(p.type), partner: -1 });
  });
  for (const c of out) {
    if (c.kind !== 'crossing') continue;
    let bd = SIGNAL.pair; out.forEach((l, i) => { if (l.kind !== 'lights') return; const d = Math.hypot(l.x - c.x, l.z - c.z); if (d < bd) { bd = d; c.partner = i; } });
  }
  return out;
}

/** The colour a driver should obey at this signal. A crossing beside traffic lights follows them. */
export function carState(list, sg, t) {
  if (sg.kind === 'lights') return signalState('lights', t, sg.phase);
  return sg.partner >= 0 ? signalState('lights', t, list[sg.partner].phase) : signalState('crossing', t, sg.phase);
}

/** How far across a crossing the people have walked (0..1), or -1 when nobody is crossing. They walk while the traffic is held at red. */
export function walkFraction(list, sg, t) {
  if (sg.kind !== 'crossing') return -1;
  const kind = sg.partner >= 0 ? 'lights' : 'crossing', ph = sg.partner >= 0 ? list[sg.partner].phase : sg.phase, c = SIGNAL[kind], P = period(kind), u = (((t + ph) % P) + P) % P;
  const start = c.green + c.amber; if (u < start) return -1;
  return Math.min(1, (u - start) / Math.max(1, c.red - 0.8));
}
