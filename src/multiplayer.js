// Car Racer - online multiplayer (v1: simple P2P via PeerJS, host relays state).
//
// Architecture: the host's browser tab acts as the "server" - every guest opens a
// direct WebRTC connection to the host (star topology). The host assigns car
// colours, relays each player's state to everyone else, and relays lobby/start
// messages. There is no dedicated backend and nothing to deploy: PeerJS's public
// broker is only used to introduce peers to each other, all game traffic then
// flows peer-to-peer.
//
// This module mostly knows nothing about rendering or physics. The one explicit
// gameplay hook is multiplayer off-track recovery, updated from sendState() so it
// shares the normal multiplayer frame path instead of monkey-patching prototypes.
import { updateMultiplayerOffTrack, resetMultiplayerOffTrack } from './multiplayerOffTrackRecovery.js';
import { ChatLimiter, normaliseChat } from './chat.js';

const PEER_PREFIX = 'carracer-';           // namespaces our room codes on the shared public broker
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O/1/I/L - easy to read aloud
const STATE_HZ = 20;
const STALE_PLAYER_MS = 5000;               // after the race starts, no state for this long means the player has gone
const STALE_FIRST_MS = 25000;               // ...but a player who has not sent their first state yet is still loading the track - a slow phone can take a while
let currentMultiplayer = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// PeerJS errors that only mean "the link to the matchmaking server dropped" - what happens to a phone's tab when you
// switch to another app. Existing player-to-player connections are unaffected, so these are recoverable, not fatal.
const BROKER_LOSS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected']);

/** The live multiplayer session owned by main.js, if one exists. */
export function getCurrentMultiplayer() { return currentMultiplayer; }

function randomCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/** Plain-text, short, no markup. Used for both player names and room codes coming from the network. */
function sanitizeName(s) {
  return String(s || '').replace(/[<>&"']/g, '').trim().slice(0, 20) || 'Driver';
}

function showLeaveNotice(name) {
  if (typeof document === 'undefined') return;
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = `${name || 'A player'} left the game`;
  t.classList.add('show');
  clearTimeout(showLeaveNotice._t);
  showLeaveNotice._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  if (loadPeerJs._p) return loadPeerJs._p;
  return loadPeerJs._p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not reach the multiplayer network. Check your connection.'));
    document.head.appendChild(s);
  });
}

export class Multiplayer {
  /**
   * handlers: {
   *   onLobby(players, hostId, selfId) - players: [{id,name,hue}], called on any roster change
   *   onStart(trackDef) - host said go, and picked this track (a normalizeTrack()-shaped object)
   *   onState(id, state) - a remote player's latest pose
   *   onBoom(fromId, i) - their copy of barrel number i just went off
   *   onHit(fromId, data) - fromId rammed you; data is whatever they sent (an impulse to apply)
   *   onPlayerLeft(id)
   *   onError(message) - show this to the user, then multiplayer is done for this session
   * }
   */
  constructor(handlers) {
    currentMultiplayer = this;
    this.h = handlers;
    this.peer = null;
    this.conns = new Map();       // host only: playerId -> DataConnection
    this.hostConn = null;         // guest only: DataConnection to the host
    this.isHost = false;
    this.selfId = null;
    this.roomCode = null;
    this.players = new Map();     // id -> {id,name,hue}  (kept on both host and guests)
    this.usedHues = new Set();
    this._sendTimer = null;
    this._lastSeen = new Map();
    this._gotState = new Set();    // host: players who have sent at least one state since the race started
    this._staleTimer = null;
    this.started = false;      // once true the game is underway (host: new joins are turned away; guest: a lost host is final)
    this._leaving = false;     // set by leave(), so nothing tries to reconnect a session the player closed
    this._chatLimiter = new ChatLimiter();
    this._recentHue = new Map(); // host: id -> colour of a player who just dropped, so they get it back if they rejoin
    // host: reconnecting to the matchmaking server after the tab was paused
    this._brokerTimer = null; this._brokerLostAt = 0;
    this.reconnectMs = 5 * 60 * 1000; this.reconnectDelayMs = 2000;
    // guest: rejoining the lobby after the host's tab was paused or reloaded
    this._guest = null; this._joined = false; this._rejoining = false; this._rejoinTimer = null; this._rejoinStart = 0;
    this._pendingConn = null; this._hostBye = false; this._newPeerPending = false;
    this.rejoinMs = 60 * 1000; this.rejoinDelayMs = 2500;
  }

  get selfName() { return this.players.get(this.selfId)?.name; }

  /** Give the next player a colour at random from those nobody has yet - the host included, so the host isn't
   *  always yellow. The host is the only one who chooses; everyone (each player too, on their own car) is then
   *  told the same colour for the same person. `rand` is only a parameter so a test can steer it. */
  _assignHue(rand = Math.random) {
    const N = 7; // RIVAL_LOOKS.length, kept in sync manually to avoid importing three.js here
    const free = [];
    for (let i = 0; i < N; i++) if (!this.usedHues.has(i)) free.push(i);
    if (!free.length) return Math.floor(rand() * N);  // ran out of unique colours (an eighth player) - reuse one
    const hue = free[Math.min(free.length - 1, Math.floor(rand() * free.length))];
    this.usedHues.add(hue);
    return hue;
  }

  _broadcastLobby() {
    const list = [...this.players.values()];
    this.h.onLobby(list, this.selfId, this.selfId);
    if (this.isHost) this._sendAll({ t: 'lobby', players: list });
  }

  _sendAll(msg, exceptId) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) c.send(msg);
  }

  _startStaleWatch() {
    if (this._staleTimer) return;
    this._staleTimer = setInterval(() => {
      if (!this.isHost || !this.started) return;
      const now = performance.now();
      for (const id of [...this.conns.keys()]) {
        const limit = this._gotState.has(id) ? STALE_PLAYER_MS : STALE_FIRST_MS;
        if (now - (this._lastSeen.get(id) || now) > limit) this._playerLeft(id);
      }
    }, 1000);
  }

  /**
   * Open a room as host. `resumeCode` re-opens a room under the same code (after the page was reloaded or the tab
   * discarded): the matchmaking server can take up to a minute to release the old code, so that case keeps trying.
   */
  async createRoom(name, resumeCode = null, { retryMs = 60000, delayMs = 3000 } = {}) {
    await loadPeerJs();
    const myName = sanitizeName(name);
    const wanted = resumeCode ? sanitizeName(resumeCode).toUpperCase().slice(0, 8) : null;
    const deadline = Date.now() + retryMs;
    let attempts = 0;
    for (;;) {
      const code = wanted || randomCode();
      try { return await this._openHostPeer(code, myName); }
      catch (e) {
        if (this._leaving || !(e && e.peerType === 'unavailable-id')) throw e;
        if (wanted ? Date.now() >= deadline : ++attempts >= 4) throw e;       // a random code that is taken: just draw another
        if (wanted) { if (this.h.onStatus) this.h.onStatus(`Re-opening room ${wanted}\u2026`); await sleep(delayMs); }
      }
    }
  }

  _openHostPeer(code, myName) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PEER_PREFIX + code);
      let opened = false;
      peer.on('open', (id) => {
        if (opened) { this._brokerBack(); return; }       // 'open' fires again after peer.reconnect() succeeds
        opened = true;
        this.peer = peer; this.isHost = true; this.selfId = id; this.roomCode = code;
        const hue = this._assignHue();
        this.players.set(id, { id, name: myName, hue });
        peer.on('connection', (conn) => this._hostAcceptsGuest(conn));
        peer.on('disconnected', () => this._brokerLost(peer));
        this._startStaleWatch();
        this._broadcastLobby();
        resolve(code);
      });
      peer.on('error', (e) => {
        if (!opened) { try { peer.destroy(); } catch { /* already gone */ } reject(this._friendlyPeerError(e)); return; }
        if (e && BROKER_LOSS.has(e.type)) { this._brokerLost(peer); return; }   // switched app / lost signal: reconnect, don't quit
        this._peerError(e);
      });
    });
  }

  /** The link to the matchmaking server dropped. Keep retrying; the room and anyone already connected carry on. */
  _brokerLost(peer) {
    if (this._leaving || !peer || peer.destroyed) return;
    if (!this._brokerLostAt) this._brokerLostAt = Date.now();
    if (this._brokerTimer) return;
    if (this.h.onStatus) this.h.onStatus('Reconnecting to the multiplayer server\u2026');
    const tick = () => {
      this._brokerTimer = null;
      if (this._leaving || peer.destroyed) return;
      if (peer.open) { this._brokerBack(); return; }
      if (Date.now() - this._brokerLostAt > this.reconnectMs) { this.h.onError('Lost the connection to the multiplayer server.'); return; }
      if (peer.disconnected) { try { peer.reconnect(); } catch { /* try again next tick */ } }
      this._brokerTimer = setTimeout(tick, this.reconnectDelayMs);
    };
    tick();
  }

  _brokerBack() {
    clearTimeout(this._brokerTimer); this._brokerTimer = null; this._brokerLostAt = 0;
    if (this.h.onStatus) this.h.onStatus(null);
  }

  /** Call when the page becomes visible again or the network comes back: nudge a dropped connection along. */
  resume() {
    if (this._leaving) return;
    if (this.isHost) { const p = this.peer; if (p && !p.destroyed && !p.open) { clearTimeout(this._brokerTimer); this._brokerTimer = null; this._brokerLost(p); } }
    else if (this._rejoining) this._rejoinTick();
  }

  _hostAcceptsGuest(conn) {
    conn.on('open', () => {
      if (this.started) { conn.send({ t: 'started' }); setTimeout(() => conn.close(), 200); return; }
      if (this.players.size >= 8) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 200); return; }
      const old = this.conns.get(conn.peer);          // the same player coming back (their tab was paused): replace the dead link
      if (old && old !== conn) { try { old.close(); } catch { /* already closed */ } }
      this.conns.set(conn.peer, conn);
      this._lastSeen.set(conn.peer, performance.now());
      conn.on('data', (msg) => this._onHostMessage(conn.peer, msg));
      conn.on('close', () => { if (this.conns.get(conn.peer) === conn) this._playerLeft(conn.peer); });   // ignore the old link's late close
    });
  }

  _onHostMessage(id, msg) {
    this._lastSeen.set(id, performance.now());
    if (msg.t === 'join') {
      const prev = this.players.get(id);
      const back = this._recentHue.get(id);
      let hue;
      if (prev) hue = prev.hue;                                    // keep your colour if you are rejoining
      else if (back && Date.now() - back.at < 120000 && !this.usedHues.has(back.hue)) { hue = back.hue; this.usedHues.add(hue); }
      else hue = this._assignHue();
      this._recentHue.delete(id);
      this.players.set(id, { id, name: sanitizeName(msg.name), hue });
      this._broadcastLobby();
    } else if (msg.t === 'state') {
      this._gotState.add(id);
      this.h.onState(id, msg.s);
      this._sendAll({ t: 'state', id, s: msg.s }, id);
    } else if (msg.t === 'boom') {
      if (!Number.isInteger(msg.i)) return;
      this.h.onBoom(id, msg.i);
      this._sendAll({ t: 'boom', from: id, i: msg.i }, id);
    } else if (msg.t === 'hit') {
      if (msg.to === this.selfId) this.h.onHit(id, msg.d);
      else { const c = this.conns.get(msg.to); if (c && c.open) c.send({ t: 'hit', from: id, d: msg.d }); }
    } else if (msg.t === 'chat') {
      const m = normaliseChat(msg);                                // checked again here: never trust what a guest sent
      if (!m || !this.players.has(id) || !this._chatLimiter.allow(id, performance.now())) return;
      if (this.h.onChat) this.h.onChat(id, m);
      this._sendAll({ t: 'chat', from: id, ...m }, id);            // `from` is who really sent it, set by the host
    } else if (msg.t === 'leave') {
      // A deliberate leave should remove the car immediately instead of waiting for
      // WebRTC/PeerJS to notice the socket has disappeared. The later close event is harmless.
      const c = this.conns.get(id);
      this._playerLeft(id);
      try { c && c.close(); } catch { /* already closed */ }
    }
  }

  _playerLeft(id) {
    // The explicit leave message, stale-player watchdog and later connection close can all arrive.
    // Treat cleanup as idempotent so the roster and left notification are only sent once.
    if (!this.players.has(id) && !this.conns.has(id)) return;
    const p = this.players.get(id);
    if (p) { this.usedHues.delete(p.hue); this._recentHue.set(id, { hue: p.hue, at: Date.now() }); }
    this.players.delete(id); this.conns.delete(id); this._lastSeen.delete(id); this._gotState.delete(id); this._chatLimiter.forget(id);
    this.h.onPlayerLeft(id);
    if (p && id !== this.selfId) showLeaveNotice(p.name);
    this._sendAll({ t: 'left', id });   // the other guests never see the leaver's connection close, so tell them (their car is removed)
    this._broadcastLobby();
  }

  async joinRoom(code, name) {
    await loadPeerJs();
    const myName = sanitizeName(name), roomCode = sanitizeName(code).toUpperCase().slice(0, 8);
    this._guest = { name: myName, code: roomCode };
    return new Promise((resolve, reject) => {
      const peer = new window.Peer();
      let settled = false;
      const fail = (msg) => { if (!settled) { settled = true; try { peer.destroy(); } catch { /* already gone */ } reject(new Error(msg)); } };
      peer.on('error', (e) => { if (!settled) { settled = true; reject(this._friendlyPeerError(e)); } else this._guestPeerError(e); });
      peer.on('open', (id) => {
        if (settled) return;
        this.peer = peer; this.selfId = id; this.roomCode = roomCode;
        this._dial(() => { if (!settled) { settled = true; resolve(roomCode); } }, fail);
        setTimeout(() => fail('Room not found. Check the code and try again.'), 8000);
      });
    });
  }

  /** Open a connection to the host. `onFirstLobby` runs when the host's lobby arrives; `onFail(msg, fatal)` when it cannot be reached. */
  _dial(onFirstLobby, onFail) {
    const conn = this.peer.connect(PEER_PREFIX + this._guest.code, { reliable: true });
    if (!conn) return null;                                       // PeerJS gives nothing back while it is itself disconnected
    this._pendingConn = conn;
    conn.on('open', () => { this.hostConn = conn; conn.send({ t: 'join', name: this._guest.name }); });
    conn.on('data', (msg) => this._onGuestMessage(msg, onFirstLobby, onFail));
    conn.on('close', () => this._hostConnClosed(conn));
    conn.on('error', () => { if (onFail) onFail('Could not connect to that room.', false); });
    return conn;
  }

  _onGuestMessage(msg, onFirstLobby, onFail) {
    if (msg.t === 'full') { if (onFail) onFail('That room is full.', true); return; }
    if (msg.t === 'started') { if (onFail) onFail('That game has already started. Ask your friend to create a new room.', true); return; }
    if (msg.t === 'lobby') {
      for (const p of msg.players) this.players.set(p.id, p);
      for (const id of [...this.players.keys()]) if (!msg.players.some((p) => p.id === id)) this.players.delete(id);
      if (this._rejoining) this._rejoinDone();
      this._joined = true;
      this.h.onLobby(msg.players, msg.players[0]?.id, this.selfId);
      if (onFirstLobby) onFirstLobby();
    } else if (msg.t === 'start') {
      this.started = true;
      this.h.onStart(msg.track);
    } else if (msg.t === 'state') {
      this.h.onState(msg.id, msg.s);
    } else if (msg.t === 'left') {
      const p = this.players.get(msg.id);
      this.players.delete(msg.id);
      this.h.onPlayerLeft(msg.id);
      if (p && msg.id !== this.selfId) showLeaveNotice(p.name);
    } else if (msg.t === 'boom') {
      if (Number.isInteger(msg.i)) this.h.onBoom(msg.from, msg.i);
    } else if (msg.t === 'hit') {
      this.h.onHit(msg.from, msg.d);
    } else if (msg.t === 'chat') {
      const m = normaliseChat(msg);
      if (m && msg.from !== this.selfId && this.h.onChat) this.h.onChat(String(msg.from), m);
    } else if (msg.t === 'bye') {
      this._hostBye = true;                                       // the host closed the room on purpose: do not wait for them to come back
    }
  }

  _hostConnClosed(conn) {
    if (this._leaving || (conn !== this.hostConn && conn !== this._pendingConn)) return;   // not the current link
    if (this._rejoining) return;                                  // one failed attempt: the retry timer carries on
    if (!this._joined) return;                                    // never got in; joinRoom() reports that
    if (this.started || this._hostBye) { this.h.onError('The host left the game.'); return; }
    this._startRejoin();
  }

  /** The host vanished from the lobby (their tab was paused, or reloaded). Keep knocking for a while: when they are back
   *  the room is back under the same code, and this puts the player straight back in it. */
  _startRejoin() {
    this._rejoining = true; this._rejoinStart = Date.now(); this.hostConn = null;
    if (this.h.onStatus) this.h.onStatus('The host is away \u2013 trying to reconnect\u2026');
    this._rejoinTick();
  }

  _rejoinTick() {
    clearTimeout(this._rejoinTimer); this._rejoinTimer = null;
    if (this._leaving || !this._rejoining) return;
    if (Date.now() - this._rejoinStart > this.rejoinMs) { this._rejoining = false; this.h.onError('The host left the game.'); return; }
    this._rejoinTimer = setTimeout(() => this._rejoinTick(), this.rejoinDelayMs);   // the next try, whatever happens to this one
    this._ensureGuestPeer().then((peer) => {
      if (!peer || this._leaving || !this._rejoining) return;
      try { this._pendingConn && this._pendingConn.close(); } catch { /* already closed */ }
      this._dial(null, (msg, fatal) => {
        if (fatal && this._rejoining) { this._rejoining = false; clearTimeout(this._rejoinTimer); this.h.onError(msg); }
      });
    });
  }

  _rejoinDone() {
    this._rejoining = false; clearTimeout(this._rejoinTimer); this._rejoinTimer = null;
    if (this.h.onStatus) this.h.onStatus(null);
  }

  /** Resolves to a peer that is connected to the matchmaking server, or null if there isn't one yet (try again later). */
  _ensureGuestPeer() {
    const peer = this.peer;
    if (peer && !peer.destroyed) {
      if (peer.open) return Promise.resolve(peer);
      if (peer.disconnected) { try { peer.reconnect(); } catch { /* next try */ } }
      return Promise.resolve(null);
    }
    if (this._newPeerPending) return Promise.resolve(null);
    this._newPeerPending = true;
    return new Promise((resolve) => {
      const np = new window.Peer();
      np.on('open', (id) => { this._newPeerPending = false; this.peer = np; this.selfId = id; resolve(null); });   // used from the next try
      np.on('error', (e) => { this._newPeerPending = false; this._guestPeerError(e); resolve(null); });
    });
  }

  _guestPeerError() { /* once in a room, a signalling hiccup is harmless: the rejoin timer deals with a lost host */ }

  _friendlyPeerError(e) {
    const type = e && e.type;
    const tag = (err) => { err.peerType = type; return err; };
    if (type === 'peer-unavailable') return tag(new Error('Room not found. Check the code and try again.'));
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'disconnected') return tag(new Error('Multiplayer server unavailable right now. Try again shortly.'));
    if (type === 'unavailable-id') return tag(new Error('That room code is already taken - try again.'));
    return tag(new Error('Multiplayer connection problem.'));
  }

  _peerError(e) { this.h.onError(this._friendlyPeerError(e).message); }

  /** Tell one specific player they've just been hit (a ram, not a barrel/wreck) - `data` is whatever
   *  main.js wants applied on their end (an impulse direction and strength). Guests can't reach each
   *  other directly, so this goes via the host either way. */
  sendHit(targetId, data) {
    if (targetId === this.selfId) return;             // never hit yourself
    if (this.isHost) {
      const c = this.conns.get(targetId);
      if (c && c.open) c.send({ t: 'hit', from: this.selfId, d: data });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send({ t: 'hit', to: targetId, d: data });
    }
  }

  /** A barrel on this player's copy of the track has just gone off: tell everyone else (`i` is the barrel's
   *  index in the track's prop list, the same on every machine) so it goes off for them too. */
  sendBoom(i) {
    if (this.isHost) this._sendAll({ t: 'boom', from: this.selfId, i });
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'boom', i });
  }

  /** Send a chat message: {q: quick-chat number} or {x: typed text}. Returns false if it was empty or sent too fast. */
  sendChat(msg) {
    const m = normaliseChat(msg);
    if (!m || !this.selfId || !this._chatLimiter.allow(this.selfId, performance.now())) return false;
    if (this.isHost) this._sendAll({ t: 'chat', from: this.selfId, ...m });
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'chat', ...m });
    else return false;
    if (this.h.onChat) this.h.onChat(this.selfId, m);          // you see your own message too
    return true;
  }

  /** Host only: tell every guest (and the caller) which track to load, and to leave the lobby and start driving. */
  startGame(trackDef) {
    if (!this.isHost) return;
    this.started = true;
    const now = performance.now();
    this._gotState.clear();
    for (const id of this.conns.keys()) this._lastSeen.set(id, now);
    this._sendAll({ t: 'start', track: trackDef });
    this.h.onStart(trackDef);
  }

  /** Call every frame while driving; recovery updates every call, network traffic stays at STATE_HZ. */
  sendState(state) {
    state = updateMultiplayerOffTrack(state);
    const now = performance.now();
    if (this._lastSend && now - this._lastSend < 1000 / STATE_HZ) return;
    this._lastSend = now;
    if (this.isHost) this._sendAll({ t: 'state', id: this.selfId, s: state });
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'state', s: state });
  }

  leave() {
    this._leaving = true;
    clearTimeout(this._brokerTimer); this._brokerTimer = null; clearTimeout(this._rejoinTimer); this._rejoinTimer = null;
    resetMultiplayerOffTrack();
    if (this._staleTimer) { clearInterval(this._staleTimer); this._staleTimer = null; }

    // Tell the host explicitly before tearing down a guest connection. PeerJS close detection can
    // otherwise take long enough that the departed player's last pose looks like a parked/static car.
    const peer = this.peer;
    const guestConn = !this.isHost ? this.hostConn : null;
    if (this.isHost) {
      this._sendAll({ t: 'bye' });                                  // closing the room on purpose: guests must not wait for it to come back
      this._sendAll({ t: 'left', id: this.selfId });
      try { peer && peer.destroy(); } catch { /* already gone */ }
    } else if (guestConn && guestConn.open) {
      try { guestConn.send({ t: 'leave' }); } catch { /* connection already failing */ }
      // Give the reliable data channel a moment to flush the leave packet, then close locally.
      setTimeout(() => { try { peer && peer.destroy(); } catch { /* already gone */ } }, 80);
    } else {
      try { peer && peer.destroy(); } catch { /* already gone */ }
    }

    this.peer = null; this.conns.clear(); this.hostConn = null; this.players.clear(); this.usedHues.clear(); this._lastSeen.clear();
    if (currentMultiplayer === this) currentMultiplayer = null;
  }
}

export { randomCode, sanitizeName };
