// Multiplayer race layer: 3-lap finishing order and live race position.
//
// Multiplayer remains a banger/destruction race: cars can ram, take damage, wreck and
// respawn. This module only adds race progress, an authoritative finish order from the
// host, and a small HUD card showing where the local player is in the field.
import { Multiplayer, getCurrentMultiplayer } from './multiplayer.js';

const RACE_LAPS = 3;
const patched = Symbol('multiplayerRacePatched');

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

function ensureRaceData(net) {
  if (!net._raceStates) net._raceStates = new Map();
  if (!net._raceFinishPlaces) net._raceFinishPlaces = new Map();
  return net;
}

function emitFinish(net, result) {
  ensureRaceData(net)._raceFinishPlaces.set(result.id, result.place);
  window.dispatchEvent(new CustomEvent('carracer-race-finish', { detail: result }));
}

function recordFinishAsHost(net, id) {
  ensureRaceData(net);
  if (!net.isHost || net._raceFinishPlaces.has(id)) return;
  const place = net._raceFinishPlaces.size + 1;
  const p = net.players.get(id);
  const result = { id, name: p?.name || 'Driver', place };
  net._raceFinishPlaces.set(id, place);
  net._sendAll({ t: 'race-finish-result', ...result });
  emitFinish(net, result);
}

// Enrich the existing 20 Hz state packet with race progress. No extra network stream is needed.
const originalSendState = Multiplayer.prototype.sendState;
Multiplayer.prototype.sendState = function raceSendState(state) {
  ensureRaceData(this);
  const race = window.__game?.race;
  if (race) {
    state = {
      ...state,
      raceProgress: Number.isFinite(race.unwrapped) ? race.unwrapped : 0,
      raceLaps: Number.isFinite(race.laps) ? race.laps : 0,
      raceFinished: this._raceFinishPlaces.has(this.selfId),
    };
  }
  this._raceStates.set(this.selfId, state);
  return originalSendState.call(this, state);
};

// Host sees every guest packet before relaying it, so keep the latest progress and accept
// finish reports here. vehicleChoice already wraps this method; bootstrap imports this module
// afterwards, so both extensions remain in the chain.
const originalHostMessage = Multiplayer.prototype._onHostMessage;
Multiplayer.prototype._onHostMessage = function raceHostMessage(id, msg) {
  ensureRaceData(this);
  if (msg?.t === 'state' && msg.s) this._raceStates.set(id, msg.s);
  if (msg?.t === 'race-finish') {
    recordFinishAsHost(this, id);
    return;
  }
  return originalHostMessage.call(this, id, msg);
};

// Guests already receive relayed state packets on their host connection. Add a second harmless
// listener after joining so the race HUD can read them without changing multiplayer.js core logic.
const originalJoinRoom = Multiplayer.prototype.joinRoom;
Multiplayer.prototype.joinRoom = async function raceJoinRoom(code, name) {
  const joined = await originalJoinRoom.call(this, code, name);
  ensureRaceData(this);
  if (this.hostConn && !this._raceDataListener) {
    this._raceDataListener = (msg) => {
      if (msg?.t === 'state' && msg.id && msg.s) this._raceStates.set(msg.id, msg.s);
      else if (msg?.t === 'race-finish-result' && msg.id && Number.isInteger(msg.place)) emitFinish(this, msg);
      else if (msg?.t === 'left' && msg.id) {
        this._raceStates.delete(msg.id);
        this._raceFinishPlaces.delete(msg.id);
      }
    };
    this.hostConn.on('data', this._raceDataListener);
  }
  return joined;
};

Multiplayer.prototype.reportRaceFinish = function reportRaceFinish() {
  ensureRaceData(this);
  if (!this.selfId || this._raceFinishPlaces.has(this.selfId) || this._raceFinishReported) return;
  this._raceFinishReported = true;
  if (this.isHost) recordFinishAsHost(this, this.selfId);
  else if (this.hostConn?.open) this.hostConn.send({ t: 'race-finish' });
};

const originalStartGame = Multiplayer.prototype.startGame;
Multiplayer.prototype.startGame = function raceStartGame(trackDef) {
  ensureRaceData(this);
  this._raceStates.clear();
  this._raceFinishPlaces.clear();
  this._raceFinishReported = false;
  return originalStartGame.call(this, trackDef);
};

const originalLeave = Multiplayer.prototype.leave;
Multiplayer.prototype.leave = function raceLeave() {
  if (this._raceStates) this._raceStates.clear();
  if (this._raceFinishPlaces) this._raceFinishPlaces.clear();
  this._raceFinishReported = false;
  return originalLeave.call(this);
};

function installHud() {
  if (document.getElementById('mp-race-position')) return;
  const card = document.createElement('div');
  card.id = 'mp-race-position';
  card.hidden = true;
  card.innerHTML = '<span class="mp-pos-label">Position</span><strong id="mp-pos-value">1 of 1</strong>';
  document.getElementById('hud')?.appendChild(card);

  const finish = document.createElement('div');
  finish.id = 'mp-race-finish';
  finish.hidden = true;
  finish.innerHTML = '<div id="mp-finish-title"></div><div id="mp-finish-sub"></div>';
  document.getElementById('hud')?.appendChild(finish);

  const style = document.createElement('style');
  style.textContent = `
#mp-race-position{position:absolute;top:calc(max(14px,env(safe-area-inset-top)) + 108px);left:16px;padding:7px 22px 8px 12px;background:rgba(42,29,74,.86);border-left:5px solid #ffb31f;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);text-shadow:0 2px 6px rgba(0,0,0,.5)}
#mp-race-position .mp-pos-label{display:block;font-family:"Barlow Condensed",Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#b9a9d6}
#mp-race-position strong{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-size:26px;line-height:1;color:#ffb31f}
#mp-race-finish{position:absolute;left:50%;top:13%;transform:translateX(-50%) skewX(-7deg);min-width:min(520px,88vw);padding:14px 28px;text-align:center;background:rgba(27,18,51,.92);border-block:4px solid #ffb31f;box-shadow:0 12px 35px rgba(0,0,0,.35)}
#mp-finish-title{font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(38px,7vw,76px);line-height:.95;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#mp-finish-sub{margin-top:5px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:20px;color:#f6d9b0;text-shadow:none}
@media(max-width:600px){#mp-race-position{top:calc(max(10px,env(safe-area-inset-top)) + 94px);left:10px}#mp-race-position strong{font-size:22px}#mp-race-finish{top:18%}}
`;
  document.head.appendChild(style);
}

let currentSession = null;
let finishHideTimer = null;

function showFinish(result) {
  const net = getCurrentMultiplayer();
  if (!net) return;
  const box = document.getElementById('mp-race-finish');
  const title = document.getElementById('mp-finish-title');
  const sub = document.getElementById('mp-finish-sub');
  if (!box || !title || !sub) return;

  if (result.place === 1) {
    title.textContent = result.id === net.selfId ? 'You win!' : `${result.name} wins!`;
    sub.textContent = '3-lap destruction race winner';
  } else if (result.id === net.selfId) {
    title.textContent = `Finished ${ordinal(result.place)}`;
    sub.textContent = 'Race complete';
  } else {
    return;
  }
  box.hidden = false;
  clearTimeout(finishHideTimer);
  finishHideTimer = setTimeout(() => { box.hidden = true; }, result.place === 1 ? 4500 : 3000);
}

window.addEventListener('carracer-race-finish', (e) => showFinish(e.detail));

function updateRaceHud() {
  requestAnimationFrame(updateRaceHud);
  const net = getCurrentMultiplayer();
  const card = document.getElementById('mp-race-position');
  const value = document.getElementById('mp-pos-value');
  if (!card || !value) return;

  if (!net || !net.started || !document.body.classList.contains('mode-drive')) {
    card.hidden = true;
    currentSession = null;
    return;
  }

  ensureRaceData(net);
  if (currentSession !== net) {
    currentSession = net;
    net._raceFinishReported = false;
    net._raceStates.clear();
    net._raceFinishPlaces.clear();
  }

  const race = window.__game?.race;
  if (race && race.laps >= RACE_LAPS && !net._raceFinishReported) net.reportRaceFinish();

  const entries = [...net.players.values()].map((p) => {
    const finishPlace = net._raceFinishPlaces.get(p.id) || null;
    const state = net._raceStates.get(p.id);
    const progress = p.id === net.selfId && race ? race.unwrapped : state?.raceProgress;
    return { id: p.id, finishPlace, progress: Number.isFinite(progress) ? progress : -Infinity };
  });
  entries.sort((a, b) => {
    if (a.finishPlace && b.finishPlace) return a.finishPlace - b.finishPlace;
    if (a.finishPlace) return -1;
    if (b.finishPlace) return 1;
    return b.progress - a.progress;
  });

  const position = Math.max(1, entries.findIndex((p) => p.id === net.selfId) + 1);
  value.textContent = `${position} of ${Math.max(1, entries.length)}`;
  card.hidden = false;
}

if (!window[patched]) {
  window[patched] = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHud, { once: true });
  else installHud();
  requestAnimationFrame(updateRaceHud);
}
