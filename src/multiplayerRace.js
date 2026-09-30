// Multiplayer race layer: configurable finishing order and live race position.
// Multiplayer remains a banger/destruction race: cars can ram, take damage, wreck and respawn.
import { Multiplayer, getCurrentMultiplayer } from './multiplayer.js';

const patched = Symbol('multiplayerRacePatched');
const clampLaps = (v) => Math.max(1, Math.min(3, Math.round(+v || 1)));
const raceLaps = (net) => clampLaps(net?._raceLaps || window.__raceLaps?.get?.() || 1);

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

function ensurePositionRow() {
  const score = document.getElementById('derby-score');
  if (!score) return {};

  let row = document.getElementById('hud-race-position-row');
  if (!row) {
    row = document.createElement('div');
    row.id = 'hud-race-position-row';
    row.hidden = true;
    row.innerHTML = '<span class="hud-race-pos-label">Position</span><strong id="hud-race-position-value">1 of 1</strong>';
    score.appendChild(row);
  }

  if (!document.getElementById('hud-race-position-style')) {
    const style = document.createElement('style');
    style.id = 'hud-race-position-style';
    style.textContent = `
#hud-race-position-row{margin-top:6px;padding-top:5px;border-top:1px solid rgba(246,217,176,.22);text-align:center}
#hud-race-position-row .hud-race-pos-label{display:block;font-family:"Barlow Condensed",Arial,sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#f6d9b0;opacity:.85}
#hud-race-position-value{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-size:22px;line-height:1;color:#ffb31f}
@media(max-width:600px){#hud-race-position-row{margin-top:4px;padding-top:4px}#hud-race-position-value{font-size:19px}}
`;
    document.head.appendChild(style);
  }

  return { row, value: document.getElementById('hud-race-position-value') };
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
  const result = { id, name: p?.name || 'Driver', place, laps: raceLaps(net) };
  net._raceFinishPlaces.set(id, place);
  net._sendAll({ t: 'race-finish-result', ...result });
  emitFinish(net, result);
}

const originalSendState = Multiplayer.prototype.sendState;
Multiplayer.prototype.sendState = function raceSendState(state) {
  ensureRaceData(this);
  const race = window.__game?.race;
  if (race) {
    state = {
      ...state,
      raceProgress: Number.isFinite(race.unwrapped) ? race.unwrapped : 0,
      raceLaps: Number.isFinite(race.laps) ? race.laps : 0,
      raceFinished: race.index >= raceLaps(this),
    };
  }
  this._raceStates.set(this.selfId, state);
  return originalSendState.call(this, state);
};

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

const originalJoinRoom = Multiplayer.prototype.joinRoom;
Multiplayer.prototype.joinRoom = async function raceJoinRoom(code, name) {
  const joined = await originalJoinRoom.call(this, code, name);
  ensureRaceData(this);
  if (this.hostConn && !this._raceDataListener) {
    this._raceDataListener = (msg) => {
      if (msg?.t === 'start') this._raceLaps = clampLaps(msg.track?.raceLaps || 1);
      else if (msg?.t === 'state' && msg.id && msg.s) this._raceStates.set(msg.id, msg.s);
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
  this._raceLaps = clampLaps(trackDef?.raceLaps || window.__raceLaps?.get?.() || 1);
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
  ensurePositionRow();
  if (document.getElementById('mp-race-finish')) return;

  const finish = document.createElement('div');
  finish.id = 'mp-race-finish';
  finish.hidden = true;
  finish.innerHTML = '<div id="mp-finish-title"></div><div id="mp-finish-sub"></div>';
  document.getElementById('hud')?.appendChild(finish);

  const style = document.createElement('style');
  style.textContent = `
#mp-race-finish{position:absolute;left:50%;top:13%;transform:translateX(-50%) skewX(-7deg);min-width:min(520px,88vw);padding:14px 28px;text-align:center;background:rgba(27,18,51,.92);border-block:4px solid #ffb31f;box-shadow:0 12px 35px rgba(0,0,0,.35)}
#mp-finish-title{font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(38px,7vw,76px);line-height:.95;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#mp-finish-sub{margin-top:5px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:20px;color:#f6d9b0;text-shadow:none}
@media(max-width:600px){#mp-race-finish{top:18%}}
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
    sub.textContent = `${result.laps || raceLaps(net)}-lap destruction race winner`;
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
  const { row, value } = ensurePositionRow();
  if (!row || !value) return;

  if (!net || !document.body.classList.contains('mode-drive')) {
    row.hidden = true;
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
  if (race && race.index >= raceLaps(net) && !net._raceFinishReported) net.reportRaceFinish();

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
  row.hidden = false;
}

if (!window[patched]) {
  window[patched] = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHud, { once: true });
  else installHud();
  requestAnimationFrame(updateRaceHud);
}
