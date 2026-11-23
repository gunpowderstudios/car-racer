// Share a track as a link: the whole track is packed into the web address itself (compressed, no server, no account).
//   https://bangersandsmash.co.uk/#t=<packed track>
// The friend opens it and the game offers to drive it, edit it or keep it. See main.js (openSharedTrack) and editor.js (Share link).
import { normalizeTrack, openRoad, STUNT_TYPES } from './track.js';

const PIECE_TYPES = [...STUNT_TYPES, 'building', 'ramp'];      // (the stunt pieces and buildings go in their own section at the end)

const PREFIX = '#t=';
const MAX_PACKED = 60000;        // longest packed text we will even try to read
const MAX_JSON = 400000;         // and the most it may unpack to: a link is never trusted

const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };

async function pump(bytes, stream) {
  const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {});   // a bad input fails on the read side below
  const chunks = []; let total = 0;
  const r = stream.readable.getReader();
  for (;;) {
    const { done, value } = await r.read(); if (done) break;
    total += value.length; if (total > MAX_JSON) throw new Error('too big');
    chunks.push(value);
  }
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---- compact binary form (links start with "~"): numbers are rounded and sent as differences, so a link is a few times shorter than the JSON.
class Out {
  constructor() { this.b = []; }
  u(n) { n = Math.max(0, Math.round(n)); while (n >= 128) { this.b.push((n & 127) | 128); n = Math.floor(n / 128); } this.b.push(n); }
  z(n) { n = Math.round(n); this.u(n < 0 ? -2 * n - 1 : 2 * n); }
  str(t) { const e = new TextEncoder().encode(t); this.u(e.length); for (const c of e) this.b.push(c); }
}
class In {
  constructor(a) { this.a = a; this.i = 0; }
  byte() { if (this.i >= this.a.length) throw new Error('short'); return this.a[this.i++]; }
  u() { let n = 0, m = 1; for (let k = 0; k < 8; k++) { const c = this.byte(); n += (c & 127) * m; if (c < 128) return n; m *= 128; } throw new Error('long'); }
  z() { const n = this.u(); return n % 2 ? -(n + 1) / 2 : n / 2; }
  count(max) { const n = this.u(); if (n > max) throw new Error('count'); return n; }
  str() { const n = this.count(200); if (this.i + n > this.a.length) throw new Error('short'); const t = new TextDecoder().decode(this.a.subarray(this.i, this.i + n)); this.i += n; return t; }
}
// (a skull barrel is packed as its kind plus the number of kinds, so links made before skull barrels still unpack)
const PROP_KINDS = ['barrel', 'chicken'];      // (the chicken slot stays so links made before the chickens went still unpack; normalizeProps then drops them)
// (a fire pit is code 4, past barrel 0, chicken 1 and their skull versions 2, 3)
const FIRE_CODE = 4, VEHICLE_CODE = 5;
const Q = { xz: 10, y: 20, bank: 4, w: 2, lip: 10, kick: 2 };

function encodeTrack(d) {
  const o = new Out();
  o.u(d.walls ? 1 : 0); o.u(d.dirt ? 1 : 0); o.u(d.berm ? 1 : 0); o.u(d.lowCam ? 1 : 0); o.u(d.mode === 'lastStanding' ? 1 : 0);
  o.str(d.name); o.u(d.width * 2);
  o.u(d.handles.length);
  let px = 0, pz = 0;
  for (const h of d.handles) {
    const m = (h.w ? 1 : 0) | (h.bank ? 2 : 0) | (h.gap ? 4 : 0) | (h.gap && h.lip !== 0.5 ? 8 : 0) | (h.gap && h.kick ? 16 : 0) | (h.open ? 32 : 0) | (Math.abs(h.y - 0.65) > 0.02 ? 64 : 0) | (h.hx !== undefined ? 128 : 0);
    o.u(m);
    const x = Math.round(h.x * Q.xz), z = Math.round(h.z * Q.xz);
    o.z(x - px); o.z(z - pz); px = x; pz = z;
    if (m & 64) o.u(h.y * Q.y);
    if (m & 1) o.u(h.w * Q.w);
    if (m & 2) o.z(h.bank * Q.bank);
    if (m & 4) o.u(h.gap);
    if (m & 8) o.u(h.lip * Q.lip);
    if (m & 16) o.u(h.kick * Q.kick);
    if (m & 128) { o.z(Math.round(h.hx * Q.xz)); o.z(Math.round(h.hz * Q.xz)); }
  }
  const props = (d.props || []).filter((p) => !PIECE_TYPES.includes(p.type));      // (the stunt props go in their own section at the end, so links made before them still read)
  o.u(props.length); px = 0; pz = 0;
  for (const p of props) { const x = Math.round(p.x * Q.xz), z = Math.round(p.z * Q.xz); o.u(p.type === 'fire' ? FIRE_CODE : p.type === 'vehicle' ? VEHICLE_CODE : PROP_KINDS.indexOf(p.type) + (p.lethal ? PROP_KINDS.length : 0)); o.z(x - px); o.z(z - pz); o.z(p.y * Q.xz); px = x; pz = z; if (p.type === 'vehicle') { o.u(p.mode === 'driving' ? 1 : 0); o.u(Math.round((p.yaw + Math.PI) * 100)); o.str(p.car || ''); } }
  const bumps = d.bumps || [];
  o.u(bumps.length); px = 0; pz = 0;
  for (const b of bumps) { const x = Math.round(b.x * Q.xz), z = Math.round(b.z * Q.xz); o.z(x - px); o.z(z - pz); o.u(b.r * 10); o.u(b.h < 0 ? 10000 + Math.round(-b.h * 100) : Math.round(b.h * 100)); px = x; pz = z; }      // (a dip is its depth plus 10000: older links never go that high)
  const pud = d.puddles || [];
  o.u(pud.length); px = 0; pz = 0;
  for (const b of pud) { const x = Math.round(b.x * Q.xz), z = Math.round(b.z * Q.xz); o.z(x - px); o.z(z - pz); o.u(b.r * 10); px = x; pz = z; }
  const rocks = d.rocks || [];
  o.u(rocks.length); px = 0; pz = 0;
  for (const b of rocks) { const x = Math.round(b.x * Q.xz), z = Math.round(b.z * Q.xz); o.z(x - px); o.z(z - pz); o.u(b.r * 20); o.u(b.h * 20); px = x; pz = z; }
  const rough = d.rough || [];
  o.u(rough.length); for (const b of rough) { o.u(b.s); o.u(b.len); o.u(b.amp * 100); }
  const rollers = d.rollers || [];
  o.u(rollers.length); px = 0; pz = 0;
  for (const b of rollers) { const x = Math.round(b.x * Q.xz), z = Math.round(b.z * Q.xz); o.z(x - px); o.z(z - pz); o.u(b.r * 20); o.u((Math.atan2(b.dz, b.dx) + Math.PI) * 100); px = x; pz = z; }
  const st = d.structures || [];
  o.u(st.length); px = 0; pz = 0;
  for (const b of st) { const x = Math.round(b.x * Q.xz), z = Math.round(b.z * Q.xz); o.z(x - px); o.z(z - pz); o.u(b.type === 'tunnel' ? 1 : 0); px = x; pz = z; }
  if ((d.weeval && d.weeval.custom) || (d.props || []).some((p) => PIECE_TYPES.includes(p.type))) {      // a stunt jump from the editor, or buses, boxes and a bullseye on an ordinary track
    const sp = (d.props || []).filter((p) => PIECE_TYPES.includes(p.type));
    o.u(d.weeval && d.weeval.custom ? (d.weeval.oneRoad ? 2 : 1) : 3); o.u(sp.length); px = 0; pz = 0;
    for (const p of sp) { const x = Math.round(p.x * Q.xz), z = Math.round(p.z * Q.xz); o.u(PIECE_TYPES.indexOf(p.type) + (p.rot ? 16 : 0)); o.z(x - px); o.z(z - pz); o.z(p.y * Q.xz); o.u((p.up || 0) * 10); if (p.rot) o.u(p.rot); if (p.type === 'building') { o.u((p.w || 20) * 2); o.u((p.d || 20) * 2); o.u((p.h || 25) * 2); o.u(p.style || 0); } else if (p.type === 'ramp') { o.u((p.w || 8) * 2); o.u((p.d || 14) * 2); o.u((p.h || 2.5) * 2); } px = x; pz = z; }
  }
  return Uint8Array.from(o.b);
}

function decodeTrack(bytes) {
  const r = new In(bytes), def = {};
  def.walls = !!r.u(); def.dirt = !!r.u(); def.berm = !!r.u(); def.lowCam = !!r.u(); if (r.u()) def.mode = 'lastStanding';
  def.name = r.str(); def.width = r.u() / 2;
  const n = r.count(400); def.handles = []; let px = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    const m = r.u(); px += r.z(); pz += r.z();
    const h = { x: px / Q.xz, z: pz / Q.xz, y: m & 64 ? r.u() / Q.y : 0.65 };
    if (m & 1) h.w = r.u() / Q.w;
    if (m & 2) h.bank = r.z() / Q.bank;
    if (m & 4) h.gap = r.u();
    if (m & 8) h.lip = r.u() / Q.lip;
    if (m & 16) h.kick = r.u() / Q.kick;
    if (m & 32) h.open = true;
    if (m & 128) { h.hx = r.z() / Q.xz; h.hz = r.z() / Q.xz; }
    def.handles.push(h);
  }
  def.props = []; px = 0; pz = 0;
  for (let i = 0, c = r.count(1000); i < c; i++) { const ku = r.u(), k = ku === FIRE_CODE ? 'fire' : ku === VEHICLE_CODE ? 'vehicle' : PROP_KINDS[ku % PROP_KINDS.length]; px += r.z(); pz += r.z(); const pr = { type: k, ...(ku >= PROP_KINDS.length && ku < FIRE_CODE ? { lethal: true } : {}), x: px / Q.xz, z: pz / Q.xz, y: r.z() / Q.xz }; if (ku === VEHICLE_CODE) { pr.mode = r.u() ? 'driving' : 'static'; pr.yaw = r.u() / 100 - Math.PI; const cs = r.str(); if (cs) pr.car = cs; } def.props.push(pr); }
  const bumps = []; px = 0; pz = 0;
  for (let i = 0, c = r.count(100); i < c; i++) { px += r.z(); pz += r.z(); const rr = r.u() / 10, hv = r.u(); bumps.push({ x: px / Q.xz, z: pz / Q.xz, r: rr, h: hv >= 10000 ? -(hv - 10000) / 100 : hv / 100 }); }
  if (bumps.length) def.bumps = bumps;
  const pud = []; px = 0; pz = 0;
  for (let i = 0, c = r.count(100); i < c; i++) { px += r.z(); pz += r.z(); pud.push({ x: px / Q.xz, z: pz / Q.xz, r: r.u() / 10 }); }
  if (pud.length) def.puddles = pud;
  const rocks = []; px = 0; pz = 0;
  if (r.i < r.a.length) for (let i = 0, c = r.count(200); i < c; i++) { px += r.z(); pz += r.z(); rocks.push({ x: px / Q.xz, z: pz / Q.xz, r: r.u() / 20, h: r.u() / 20 }); }
  if (rocks.length) def.rocks = rocks;
  if (r.i < r.a.length) {
    const rough = []; for (let i = 0, c = r.count(30); i < c; i++) rough.push({ s: r.u(), len: r.u(), amp: r.u() / 100 });
    if (rough.length) def.rough = rough;
    const rl = []; px = 0; pz = 0;
    for (let i = 0, c = r.count(30); i < c; i++) { px += r.z(); pz += r.z(); const rr = r.u() / 20, a = r.u() / 100 - Math.PI; rl.push({ x: px / Q.xz, z: pz / Q.xz, r: rr, dx: Math.cos(a), dz: Math.sin(a) }); }
    if (rl.length) def.rollers = rl;
  }
  if (r.i < r.a.length) {                                                       // flyovers and tunnels (links made before them end here)
    const st = []; px = 0; pz = 0;
    for (let i = 0, c = r.count(40); i < c; i++) { px += r.z(); pz += r.z(); st.push({ x: px / Q.xz, z: pz / Q.xz, type: r.u() ? 'tunnel' : 'flyover' }); }
    if (st.length) def.structures = st;
  }
  let stuntFlag = 0; if (r.i < r.a.length) stuntFlag = r.u();
  if (stuntFlag >= 1 && stuntFlag <= 3) {                                         // a stunt jump, or stunt pieces on an ordinary track (3) (links made before them end here)
    if (stuntFlag !== 3) def.weeval = { stage: 1, custom: true, ...(stuntFlag === 2 ? { oneRoad: true } : {}) }; px = 0; pz = 0;
    for (let i = 0, c = r.count(600); i < c; i++) { const k = r.u(); px += r.z(); pz += r.z(); const pr = { type: PIECE_TYPES[(k & 7) % PIECE_TYPES.length], x: px / Q.xz, z: pz / Q.xz, y: r.z() / Q.xz }; const up = r.u() / 10; if (up) pr.up = up; if (k & 16) pr.rot = r.u(); else if (k & 8) pr.rot = 90; if (pr.type === 'building') { pr.w = r.u() / 2; pr.d = r.u() / 2; pr.h = r.u() / 2; pr.style = r.u(); } else if (pr.type === 'ramp') { pr.w = r.u() / 2; pr.d = r.u() / 2; pr.h = r.u() / 2; } def.props.push(pr); }
  }
  return def;
}

/** The packed text for a track (just the part after "#t="): "~" then base64 of [0 raw | 1 deflated] + the compact binary. */
export async function packTrack(def) {
  const raw = encodeTrack(openRoad(normalizeTrack(def)));
  const sq = await pump(raw, new CompressionStream('deflate-raw'));
  const body = sq.length < raw.length ? Uint8Array.from([1, ...sq]) : Uint8Array.from([0, ...raw]);
  return '~' + toB64(body);
}

/** Back to a track, or null if this is not a good track link. */
export async function unpackTrack(text) {
  try {
    if (typeof text !== 'string' || !text || text.length > MAX_PACKED || /[^A-Za-z0-9_~-]/.test(text.replace(/^~/, ''))) return null;
    if (text[0] === '~') {                                                  // the compact form
      const body = fromB64(text.slice(1));
      const bin = body[0] === 1 ? await pump(body.subarray(1), new DecompressionStream('deflate-raw')) : body.subarray(1);
      const d = normalizeTrack(decodeTrack(bin));
      return d.handles.length >= 3 ? d : null;
    }
    const json = new TextDecoder().decode(await pump(fromB64(text), new DecompressionStream('deflate-raw')));
    const d = normalizeTrack(JSON.parse(json));
    return d.handles.length >= 3 ? d : null;
  } catch { return null; }
}

/** The full web address that opens this track. */
export async function trackLinkUrl(def, base = `${location.origin}${location.pathname}`) {
  return `${base}${PREFIX}${await packTrack(def)}`;
}

/** The packed part of the current address, if it is a track link. */
export function packedFromHash(hash) {
  return typeof hash === 'string' && hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null;
}
