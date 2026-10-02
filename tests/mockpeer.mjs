// A tiny in-memory stand-in for PeerJS: a "broker" that knows which ids are registered, and peers that can
// connect, send, close, drop off the broker (disconnect/reconnect) or die without saying goodbye (kill).
// It follows the parts of the PeerJS 1.x API that src/multiplayer.js uses, including peer.open / disconnected / destroyed.
class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) { (this._h.get(ev) || this._h.set(ev, []).get(ev)).push(fn); return this; }
  emit(ev, ...a) { for (const fn of [...(this._h.get(ev) || [])]) fn(...a); }
}
const tick = (fn, ms = 1) => setTimeout(fn, ms);

export class Broker {
  constructor() { this.ids = new Map(); this.n = 0; this.releaseDelay = 0; this.offline = false; }
  fresh() { return 'mock' + (++this.n); }
}

export function makePeerClass(broker) {
  class DataConn extends Emitter {
    constructor(local, remoteId) { super(); this.local = local; this.peer = remoteId; this.open = false; this.other = null; }
    send(msg) { const o = this.other; if (!this.open || !o) return; const copy = JSON.parse(JSON.stringify(msg)); tick(() => { if (o.open) o.emit('data', copy); }); }
    close() { if (!this.open) return; this._shut(); const o = this.other; if (o && o.open) tick(() => o._shut()); }
    _shut() { if (!this.open) return; this.open = false; this.emit('close'); }
  }
  class Peer extends Emitter {
    constructor(id) {
      super();
      this.id = id || broker.fresh(); this.open = false; this.disconnected = false; this.destroyed = false; this.conns = new Set();
      tick(() => this._register());
    }
    _register() {
      if (this.destroyed) return;
      if (broker.offline) { this.open = false; this.disconnected = true; this.emit('error', { type: 'socket-error' }); this.emit('disconnected', this.id); return; }
      const holder = broker.ids.get(this.id);
      if (holder && holder !== this) { this.emit('error', { type: 'unavailable-id' }); this.destroy(); return; }
      broker.ids.set(this.id, this); this.open = true; this.disconnected = false; this.emit('open', this.id);
    }
    connect(remoteId) {
      if (this.disconnected || this.destroyed) { this.emit('error', { type: 'disconnected' }); return undefined; }
      const mine = new DataConn(this, remoteId);
      this.conns.add(mine);
      tick(() => {
        const target = broker.ids.get(remoteId);
        if (!target || target.destroyed || !target.open) { this.emit('error', { type: 'peer-unavailable' }); return; }
        const theirs = new DataConn(target, this.id);
        mine.other = theirs; theirs.other = mine; target.conns.add(theirs);
        target.emit('connection', theirs);
        tick(() => { mine.open = true; theirs.open = true; mine.emit('open'); theirs.emit('open'); });
      });
      return mine;
    }
    // network blip / app switch: the link to the broker goes, existing data connections survive
    disconnect() { if (this.disconnected) return; this.disconnected = true; this.open = false; if (broker.ids.get(this.id) === this) broker.ids.delete(this.id); this.emit('disconnected', this.id); }
    reconnect() {
      if (this.destroyed) throw new Error('destroyed');
      if (!this.disconnected) throw new Error('not disconnected');
      this.disconnected = false; tick(() => this._register());
    }
    destroy() {
      if (this.destroyed) return; this.destroyed = true; this.open = false;
      if (broker.ids.get(this.id) === this) broker.ids.delete(this.id);
      for (const c of [...this.conns]) c.close();
    }
    // the tab is killed: nothing is said, links just die, and the broker frees the id after a delay
    kill() {
      this.destroyed = true; this.open = false;
      const free = () => { if (broker.ids.get(this.id) === this) broker.ids.delete(this.id); };
      if (broker.releaseDelay) tick(free, broker.releaseDelay); else free();
      for (const c of [...this.conns]) { const o = c.other; c.open = false; if (o && o.open) tick(() => o._shut()); }
    }
  }
  return Peer;
}
