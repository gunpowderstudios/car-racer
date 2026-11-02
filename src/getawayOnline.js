// The Getaway online: the little bit of messaging it needs on top of the multiplayer link (multiplayer.js). Rules and mirror: getawayNet.js.
//   host -> guest  { t: 'gw', k: 'snap', s: snapshot, ev: [events] }   what the rules say now (and what just happened)
//   guest -> host  { t: 'gw', k: 'ram', speed }                       the robber's side felt a hard knock from the police car
// main.js sets net.h.onGetaway(fromId, msg) to receive them.
import { Multiplayer } from './multiplayer.js';

const cleanEvents = (ev) => (Array.isArray(ev) ? ev.slice(0, 12).filter((e) => e && typeof e.type === 'string').map((e) => ({ ...e, type: String(e.type).slice(0, 16) })) : []);

const originalHostMessage = Multiplayer.prototype._onHostMessage;
Multiplayer.prototype._onHostMessage = function gwHostMessage(id, msg) {
  if (msg && msg.t === 'gw') {
    if (msg.k === 'ram' && Number.isFinite(+msg.speed)) this.h.onGetaway?.(id, { k: 'ram', speed: Math.min(40, Math.max(0, +msg.speed)) });
    return;
  }
  return originalHostMessage.call(this, id, msg);
};

const originalGuestMessage = Multiplayer.prototype._onGuestMessage;
Multiplayer.prototype._onGuestMessage = function gwGuestMessage(msg, ...rest) {
  if (msg && msg.t === 'gw') {
    if (msg.k === 'snap' && msg.s && typeof msg.s === 'object') this.h.onGetaway?.(null, { k: 'snap', s: msg.s, ev: cleanEvents(msg.ev) });
    return;
  }
  return originalGuestMessage.call(this, msg, ...rest);
};

/** Host: tell everyone else what the rules say now. */
Multiplayer.prototype.sendGetawaySnap = function sendGetawaySnap(s, ev) {
  if (this.isHost) this._sendAll({ t: 'gw', k: 'snap', s, ev: ev && ev.length ? ev : undefined });
};
/** Guest: tell the host about a hard knock on the robber. */
Multiplayer.prototype.sendGetawayRam = function sendGetawayRam(speed) {
  if (!this.isHost && this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'gw', k: 'ram', speed });
};
