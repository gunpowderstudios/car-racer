// Car Racer - online multiplayer (v1: simple P2P via PeerJS, host relays state).
//
// Architecture: the host's browser tab acts as the "server" - every guest opens a
// direct WebRTC connection to the host (star topology). The host assigns car
// colours, relays each player's state to everyone else, and relays lobby/start
// messages. There is no dedicated backend and nothing to deploy: PeerJS's public
// broker is only used to introduce peers to each other, all game traffic then
// flows peer-to-peer.
//
// This module knows nothing about rendering or physics - it just moves plain
// objects around and calls the callbacks it was given. main.js owns turning
// remote state into visuals.

const PEER_PREFIX = 'carracer-';           // namespaces our room codes on the shared public broker
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O/1/I/L - easy to read aloud
const STATE_HZ = 20;

function randomCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/** Plain-text, short, no markup. Used for both player names and room codes coming from the network. */
function sanitizeName(s) {
  return String(s || '').replace(/[<>&"']/g, '').trim().slice(0, 20) || 'Driver';
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
   *   onHit(fromId, data) - fromId rammed you; data is whatever they sent (an impulse to apply)
   *   onPlayerLeft(id)
   *   onError(message) - show this to the user, then multiplayer is done for this session
   * }
   */
  constructor(handlers) {
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
    this.started = false;      // host only: once true, the game is underway and new joins are turned away
  }

  get selfName() { return this.players.get(this.selfId)?.name; }

  _assignHue() {
    const N = 7; // RIVAL_LOOKS.length, kept in sync manually to avoid importing three.js here
    for (let i = 0; i < N; i++) if (!this.usedHues.has(i)) { this.usedHues.add(i); return i; }
    return Math.floor(Math.random() * N);  // ran out of unique colours - reuse one
  }

  _broadcastLobby() {
    const list = [...this.players.values()];
    this.h.onLobby(list, this.selfId, this.selfId);
    if (this.isHost) this._sendAll({ t: 'lobby', players: list });
  }

  _sendAll(msg, exceptId) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) c.send(msg);
  }

  async createRoom(name) {
    await loadPeerJs();
    const myName = sanitizeName(name);
    return new Promise((resolve, reject) => {
      const code = randomCode();
      const peer = new window.Peer(PEER_PREFIX + code);
      peer.on('open', (id) => {
        this.peer = peer; this.isHost = true; this.selfId = id; this.roomCode = code;
        const hue = this._assignHue();
        this.players.set(id, { id, name: myName, hue });
        peer.on('connection', (conn) => this._hostAcceptsGuest(conn));
        peer.on('error', (e) => this._peerError(e));
        this._broadcastLobby();
        resolve(code);
      });
      peer.on('error', (e) => { reject(this._friendlyPeerError(e)); });
    });
  }

  _hostAcceptsGuest(conn) {
    conn.on('open', () => {
      if (this.started) { conn.send({ t: 'started' }); setTimeout(() => conn.close(), 200); return; }
      if (this.players.size >= 8) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 200); return; }
      this.conns.set(conn.peer, conn);
      conn.on('data', (msg) => this._onHostMessage(conn.peer, msg));
      conn.on('close', () => this._playerLeft(conn.peer));
    });
  }

  _onHostMessage(id, msg) {
    if (msg.t === 'join') {
      const hue = this._assignHue();
      this.players.set(id, { id, name: sanitizeName(msg.name), hue });
      this._broadcastLobby();
    } else if (msg.t === 'state') {
      this.h.onState(id, msg.s);
      this._sendAll({ t: 'state', id, s: msg.s }, id);
    } else if (msg.t === 'hit') {
      if (msg.to === this.selfId) this.h.onHit(id, msg.d);
      else { const c = this.conns.get(msg.to); if (c && c.open) c.send({ t: 'hit', from: id, d: msg.d }); }
    }
  }

  _playerLeft(id) {
    const p = this.players.get(id);
    if (p) this.usedHues.delete(p.hue);
    this.players.delete(id); this.conns.delete(id);
    this.h.onPlayerLeft(id);
    this._broadcastLobby();
  }

  async joinRoom(code, name) {
    await loadPeerJs();
    const myName = sanitizeName(name), roomCode = sanitizeName(code).toUpperCase().slice(0, 8);
    return new Promise((resolve, reject) => {
      const peer = new window.Peer();
      peer.on('open', (id) => {
        this.peer = peer; this.selfId = id; this.roomCode = roomCode;
        const conn = peer.connect(PEER_PREFIX + roomCode, { reliable: true });
        let settled = false;
        const fail = (msg) => { if (!settled) { settled = true; reject(new Error(msg)); } };
        conn.on('open', () => {
          this.hostConn = conn;
          conn.send({ t: 'join', name: myName });
        });
        conn.on('data', (msg) => {
          if (msg.t === 'full') { fail('That room is full.'); return; }
          if (msg.t === 'started') { fail('That game has already started. Ask your friend to create a new room.'); return; }
          if (msg.t === 'lobby') {
            for (const p of msg.players) this.players.set(p.id, p);
            for (const id of [...this.players.keys()]) if (!msg.players.some((p) => p.id === id)) this.players.delete(id);
            this.h.onLobby(msg.players, msg.players[0]?.id, this.selfId);
            if (!settled) { settled = true; resolve(roomCode); }
          } else if (msg.t === 'start') {
            this.h.onStart(msg.track);
          } else if (msg.t === 'state') {
            this.h.onState(msg.id, msg.s);
          } else if (msg.t === 'left') {
            this.h.onPlayerLeft(msg.id);
          } else if (msg.t === 'hit') {
            this.h.onHit(msg.from, msg.d);
          }
        });
        conn.on('close', () => this.h.onError('The host left the game.'));
        conn.on('error', () => fail('Could not connect to that room.'));
        setTimeout(() => fail('Room not found. Check the code and try again.'), 8000);
      });
      peer.on('error', (e) => reject(this._friendlyPeerError(e)));
    });
  }

  _friendlyPeerError(e) {
    const type = e && e.type;
    if (type === 'peer-unavailable') return new Error('Room not found. Check the code and try again.');
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'disconnected') return new Error('Multiplayer server unavailable right now. Try again shortly.');
    if (type === 'unavailable-id') return new Error('That room code is already taken - try again.');
    return new Error('Multiplayer connection problem.');
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

  /** Host only: tell every guest (and the caller) which track to load, and to leave the lobby and start driving. */
  startGame(trackDef) {
    if (!this.isHost) return;
    this.started = true;
    this._sendAll({ t: 'start', track: trackDef });
    this.h.onStart(trackDef);
  }

  /** Call every frame while driving; internally throttled to STATE_HZ. */
  sendState(state) {
    const now = performance.now();
    if (this._lastSend && now - this._lastSend < 1000 / STATE_HZ) return;
    this._lastSend = now;
    if (this.isHost) this._sendAll({ t: 'state', id: this.selfId, s: state });
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'state', s: state });
  }

  leave() {
    if (this.isHost) this._sendAll({ t: 'left', id: this.selfId });
    try { this.peer && this.peer.destroy(); } catch { /* already gone */ }
    this.peer = null; this.conns.clear(); this.hostConn = null; this.players.clear(); this.usedHues.clear();
  }
}

export { randomCode, sanitizeName };
