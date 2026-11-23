// Buildings you place in the editor (props of type 'building': w across, d deep, h tall, rot, style). Put one on the ground and it is a solid block.
// Put its middle over the road and it becomes a TUNNEL: it snaps onto the road, turns to run along it, and is two side walls with a roof over the top,
// so the road runs through. No three.js in here: buildingLayout() says where every part is (buildingView.js draws it) and buildingBlocks() turns the
// parts into the solid boxes the car bumps into (the same `blocks` the Getaway's town uses).

export const BUILDING = { w: 20, d: 20, h: 25, minW: 4, maxW: 120, minH: 3, maxH: 150, styles: 8 };
const CLEAR = 6.5;                      // a tunnel's roof is this far above the road
const MARGIN = 1.5;                     // and its walls this far off the road edge

/**
 * One entry per building prop: { pi (index in def.props), tunnel, x, z, th (turn, radians), parts: [{ u0, u1, v0, v1, y, h }] } with the parts in the
 * building's own frame (u across, v along), the whole thing placed at (x, z) and turned by th about the vertical.
 */
export function buildingLayout(track, groundY = 0) {
  const out = [], n = track.n, P = track.def.props || [];
  P.forEach((p, pi) => {
    if (p.type !== 'building') return;
    const w = p.w || BUILDING.w, d = p.d || BUILDING.d, h = p.h || BUILDING.h;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) { if (track.gap[i]) continue; const dd = Math.hypot(track.px[i] - p.x, track.pz[i] - p.z); if (dd < bd) { bd = dd; best = i; } }
    if (best >= 0 && bd < track.hw[best] * 0.9) {                         // over the road: a tunnel along it
      const i = best, hw = track.hw[i], inner = hw + MARGIN, W = Math.max(w, 2 * inner + 8), y0 = track.py[i] - 1;
      const th = Math.atan2(track.tx[i], track.tz[i]);                      // v runs along the road, u across it
      const top = Math.max(h, CLEAR + 3);
      let low = track.py[i];                                                 // the lowest the road goes along the tunnel's length: the walls must reach below that and below the grass (a raised or sloping road leaves a gap otherwise)
      for (let k = 0; k < n; k++) if (!track.gap[k] && Math.hypot(track.px[k] - track.px[i], track.pz[k] - track.pz[i]) < d / 2 + 6) low = Math.min(low, track.py[k]);
      const yb = Math.min(groundY, low) - 1.5, sideH = y0 + top + 1 - yb;
      out.push({ pi, tunnel: true, x: track.px[i], z: track.pz[i], th, style: p.style || 0, w: W, d, h: top, y: y0, parts: [
        { u0: -W / 2, u1: -inner, v0: -d / 2, v1: d / 2, y: yb, h: sideH },
        { u0: inner, u1: W / 2, v0: -d / 2, v1: d / 2, y: yb, h: sideH },
        { u0: -inner, u1: inner, v0: -d / 2, v1: d / 2, y: track.py[i] + CLEAR, h: top - CLEAR },
      ] });
    } else {
      out.push({ pi, tunnel: false, x: p.x, z: p.z, th: (p.rot || 0) * Math.PI / 180, style: p.style || 0, w, d, h, y: p.y, parts: [{ u0: -w / 2, u1: w / 2, v0: -d / 2, v1: d / 2, y: p.y, h }] });
    }
  });
  return out;
}

/** The solid boxes (axis-aligned, as the car code wants) for a building list: one box for a part turned square on, a grid of small boxes otherwise. */
export function buildingBlocks(list) {
  const blocks = [];
  for (const b of list) {
    const cs = Math.cos(b.th), sn = Math.sin(b.th), ac = Math.abs(cs), as = Math.abs(sn);
    for (const q of b.parts) {
      const kind = 'wall', y = q.y, h = q.h, W = q.u1 - q.u0, D = q.v1 - q.v0, mu = (q.u0 + q.u1) / 2, mv = (q.v0 + q.v1) / 2;
      const cx = b.x + mu * cs + mv * sn, cz = b.z - mu * sn + mv * cs;        // the part's middle in the world
      if (as < 1e-3 || ac < 1e-3) { const ex = ac * W / 2 + as * D / 2, ez = as * W / 2 + ac * D / 2; blocks.push({ x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, kind, y, h }); continue; }
      const s = Math.max(2.5, Math.max(W, D) / 14), nu = Math.max(1, Math.ceil(W / s)), nv = Math.max(1, Math.ceil(D / s)), su = W / nu, sv = D / nv;
      const hx = 0.8 * (ac * su / 2 + as * sv / 2), hz = 0.8 * (as * su / 2 + ac * sv / 2);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const lu = q.u0 + su * (i + 0.5), lv = q.v0 + sv * (j + 0.5), wx = b.x + lu * cs + lv * sn, wz = b.z - lu * sn + lv * cs;
        blocks.push({ x0: wx - hx, x1: wx + hx, z0: wz - hz, z1: wz + hz, kind, y, h });
      }
    }
  }
  return blocks;
}
