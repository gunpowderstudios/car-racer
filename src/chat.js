// Multiplayer chat: the quick-chat lines, text cleaning and a flood limiter. Pure logic - no DOM - so it can
// be unit-tested with `npm test`.
//
// Quick chats travel as a number (an index into QUICK_CHATS), never as text. Every player's game turns the number
// into words from its own copy of this list, so nobody can put arbitrary words in a quick chat, and a message
// costs a few bytes. Typed messages are cleaned here before they are sent AND again by the host before they are
// relayed, and are only ever shown with textContent (never as HTML), which is why '<3' and ':>' are fine to allow.

export const QUICK_CHATS = [
  'Nice one!',
  'Oops, my bad!',
  'Beep beep, coming through!',
  'Mind the barrels!',
  'I meant to do that.',
  'Hold my tea.',
  'Is this a race or a car park?',
  'Sorry, officer!',
  'My nan drives faster than that!',
  'That is going to leave a mark.',
  'Catch me if you can!',
  'Rematch?',
];

export const MAX_CHAT_LEN = 80;

// Control characters, zero-width characters and the bidi overrides that can make text read backwards.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

/** Plain text, one line, no invisible or reversing characters, at most MAX_CHAT_LEN characters. '' if nothing is left. */
export function cleanChatText(s) {
  if (typeof s !== 'string') return '';
  return s.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LEN).trim();
}

/** Check a chat message from the network or the UI. Returns {q} (quick chat), {x} (typed text) or null. */
export function normaliseChat(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (Number.isInteger(msg.q)) return msg.q >= 0 && msg.q < QUICK_CHATS.length ? { q: msg.q } : null;
  const x = cleanChatText(msg.x);
  return x ? { x } : null;
}

/** The words to show for a checked message. */
export function chatWords(m) { return m.q != null ? QUICK_CHATS[m.q] : m.x; }

/**
 * Per-sender flood limit: at least `gapMs` between messages and no more than `burst` in any `windowMs`.
 * The host applies it to each guest, and each player applies it to themselves.
 */
export class ChatLimiter {
  constructor({ gapMs = 600, burst = 6, windowMs = 10000 } = {}) {
    Object.assign(this, { gapMs, burst, windowMs });
    this.sent = new Map();   // sender id -> recent send times
  }
  allow(id, now) {
    const list = (this.sent.get(id) || []).filter((t) => now - t < this.windowMs);
    const ok = (!list.length || now - list[list.length - 1] >= this.gapMs) && list.length < this.burst;
    if (ok) list.push(now);
    this.sent.set(id, list);
    return ok;
  }
  forget(id) { this.sent.delete(id); }
}
