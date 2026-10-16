// Share a track as a link: the whole track is packed into the web address itself (compressed, no server, no account).
//   https://gunpowderstudios.github.io/car-racer/#t=<packed track>
// The friend opens it and the game offers to drive it, edit it or keep it. See main.js (openSharedTrack) and editor.js (Share link).
import { normalizeTrack } from './track.js';

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

/** The packed text for a track (just the part after "#t="). */
export async function packTrack(def) {
  const json = JSON.stringify(normalizeTrack(def));
  return toB64(await pump(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

/** Back to a track, or null if this is not a good track link. */
export async function unpackTrack(text) {
  try {
    if (typeof text !== 'string' || !text || text.length > MAX_PACKED || /[^A-Za-z0-9_-]/.test(text)) return null;
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
