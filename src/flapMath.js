// A torn-off panel that stays hinged to the car and flaps about (Holy Moley, see flaps.js). No three.js in here, so `npm test` can check it in Node.
//
// The plate is hinged along one edge of the hole. `th` is how far it has swung out from the body (0 = lying flat, up to ~2.2 rad), `w` how fast it is turning.
// Vectors are in the car's own space (x right, y up, z forward, metres). The basis is: `a` the hinge axis, `s` the direction the plate lies in
// when flat (across the hole, away from the hinge), `n` the body's outward normal; a = s x n, so turning by +th about `a` swings `s` towards `n`.

export const FLAP = {
  rest: 0.75,            // radians: where a limp panel hangs when nothing is pushing it (a bent panel stays part open)
  stiff: 9,              // how hard the bent metal springs back towards that
  damp: 2.6,             // 1/s of friction in the hinge
  air: 0.16,             // how hard the wind pushes on the plate (acceleration per (m/s)^2 across its face)
  min: 0.12, max: 2.25,  // the stops: it cannot go into the body, or fold right over the roof
  bounce: 0.35,          // how much of its speed it keeps hitting a stop
};

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A new flap: hinged with basis (a, s, n), plate length L (m), flung open to start with. */
export function newFlap(s, n, L, th = 1.0, w = 6) {
  const a = cross(s, n), l = Math.hypot(a[0], a[1], a[2]) || 1;
  return { a: [a[0] / l, a[1] / l, a[2] / l], s: [...s], n: [...n], L, th, w };
}

/** Where the plate points (unit) and which way its face looks, at angle th. */
export function plateDir(f, th = f.th) { const c = Math.cos(th), sn = Math.sin(th); return [f.s[0] * c + f.n[0] * sn, f.s[1] * c + f.n[1] * sn, f.s[2] * c + f.n[2] * sn]; }
export function plateNormal(f, th = f.th) { const c = Math.cos(th), sn = Math.sin(th); return [-f.s[0] * sn + f.n[0] * c, -f.s[1] * sn + f.n[1] * c, -f.s[2] * sn + f.n[2] * c]; }

/**
 * Advance one flap by dt seconds. `env`: ax/ay/az the car's own acceleration, vx/vy/vz its velocity (both in car space), gx/gy/gz gravity in car space (m/s^2, pointing down),
 * `flutter` a little turbulence (0..1). Returns the flap.
 */
export function stepFlap(f, env, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const d = plateDir(f), p = plateNormal(f);
    const wind = [-env.vx, -env.vy, -env.vz], wp = dot(wind, p);                       // the air coming at the car, along the plate's face
    const k = FLAP.air * wp * Math.abs(wp);
    const eff = [-env.ax + env.gx + p[0] * k, -env.ay + env.gy + p[1] * k, -env.az + env.gz + p[2] * k];    // what the plate "feels" (inertia, gravity, wind) as an acceleration
    const dxe = cross(d, eff);
    let acc = (1.5 / f.L) * dot(f.a, dxe);                                              // torque about the hinge over the plate's moment of inertia
    acc += -FLAP.stiff * (f.th - FLAP.rest) - FLAP.damp * f.w;
    if (env.flutter) acc += env.flutter * 9 * Math.sin(env.t * 31 + f.L * 7) * Math.sin(env.t * 17.3);
    f.w += acc * h; f.th += f.w * h;
    if (f.th < FLAP.min) { f.th = FLAP.min; f.w = f.w < 0 ? -f.w * FLAP.bounce : f.w; }
    else if (f.th > FLAP.max) { f.th = FLAP.max; f.w = f.w > 0 ? -f.w * FLAP.bounce : f.w; }
  }
  return f;
}

/** A hinge for a hole at `c` with outward normal `n` and radius `r`: at the top edge if the body faces sideways (it then hangs down), otherwise at the front edge (the wind lays it back).
 *  Returns { pivot: [x,y,z], s: [x,y,z] }. */
export function hingeFor(c, n, r) {
  const up = [0, 1, 0], fw = [0, 0, 1];
  const proj = (v) => { const k = dot(v, n); return [v[0] - n[0] * k, v[1] - n[1] * k, v[2] - n[2] * k]; };
  let t = proj(up), l = Math.hypot(t[0], t[1], t[2]);
  if (l < 0.35) { t = proj(fw); l = Math.hypot(t[0], t[1], t[2]) || 1; }
  t = [t[0] / l, t[1] / l, t[2] / l];                                                  // along the surface, towards the edge to hinge on
  return { pivot: [c[0] + t[0] * r * 0.8, c[1] + t[1] * r * 0.8, c[2] + t[2] * r * 0.8], s: [-t[0], -t[1], -t[2]] };
}
