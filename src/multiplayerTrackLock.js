import { Multiplayer } from './multiplayer.js';
import { normalizeTrack } from './track.js';

// Multiplayer track policy:
// - the host may choose built-in, random, or one of their locally saved editor tracks in the lobby;
// - the exact chosen track definition is sent to every player when the race starts;
// - once a multiplayer race is running, the editor is locked for host and guests alike.

let activeNet = null;

function savedTracks() {
  try {
    const all = JSON.parse(localStorage.getItem('cr.tracks') || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

function refreshCustomTrackOptions() {
  const sel = document.getElementById('mp-track');
  if (!sel) return;

  // main.js rebuilds the built-in options at boot. Only replace our own group.
  sel.querySelector('optgroup[data-custom-tracks]')?.remove();
  const all = savedTracks();
  const names = Object.keys(all).sort((a, b) => a.localeCompare(b));
  if (!names.length) return;

  const group = document.createElement('optgroup');
  group.label = 'My tracks';
  group.dataset.customTracks = '1';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = `custom:${name}`;
    opt.textContent = name;
    group.appendChild(opt);
  }
  sel.appendChild(group);
}

function multiplayerRaceRunning() {
  return !!activeNet && document.body.classList.contains('mode-drive');
}

function showLockedMessage() {
  const b = document.getElementById('banner');
  if (!b) return;
  b.textContent = 'Track locked during multiplayer';
  b.classList.add('show');
  clearTimeout(showLockedMessage._t);
  showLockedMessage._t = setTimeout(() => b.classList.remove('show'), 1400);
}

function syncEditorLock() {
  const locked = multiplayerRaceRunning();
  const edit = document.querySelector('#controls button[data-act="edit"]');
  if (edit) {
    edit.hidden = locked;
    edit.disabled = locked;
    edit.setAttribute('aria-hidden', String(locked));
  }
}

// Remember the live Multiplayer object without changing main.js's networking code.
const oldCreateRoom = Multiplayer.prototype.createRoom;
Multiplayer.prototype.createRoom = async function patchedCreateRoom(...args) {
  activeNet = this;
  try {
    const out = await oldCreateRoom.apply(this, args);
    refreshCustomTrackOptions();
    syncEditorLock();
    return out;
  } catch (e) {
    if (activeNet === this) activeNet = null;
    throw e;
  }
};

const oldJoinRoom = Multiplayer.prototype.joinRoom;
Multiplayer.prototype.joinRoom = async function patchedJoinRoom(...args) {
  activeNet = this;
  try {
    const out = await oldJoinRoom.apply(this, args);
    syncEditorLock();
    return out;
  } catch (e) {
    if (activeNet === this) activeNet = null;
    throw e;
  }
};

const oldStartGame = Multiplayer.prototype.startGame;
Multiplayer.prototype.startGame = function patchedStartGame(trackDef, ...rest) {
  activeNet = this;
  const out = oldStartGame.call(this, trackDef, ...rest);
  queueMicrotask(syncEditorLock);
  return out;
};

const oldLeave = Multiplayer.prototype.leave;
Multiplayer.prototype.leave = function patchedLeave(...args) {
  const out = oldLeave.apply(this, args);
  if (activeNet === this) activeNet = null;
  queueMicrotask(syncEditorLock);
  return out;
};

// The normal main.js click handler only understands built-in template keys. Intercept a saved-track
// choice first, validate/normalise it, then send that exact definition through the existing startGame path.
const startBtn = document.getElementById('mp-start');
startBtn?.addEventListener('click', (e) => {
  const sel = document.getElementById('mp-track');
  const value = sel?.value || '';
  if (!value.startsWith('custom:')) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  if (!activeNet?.isHost) return;

  const name = value.slice(7);
  const raw = savedTracks()[name];
  if (!raw) {
    refreshCustomTrackOptions();
    return;
  }

  try {
    activeNet.startGame(normalizeTrack(raw));
  } catch {
    showLockedMessage();
  }
}, true);

// Keep the host's list fresh each time multiplayer is opened.
document.getElementById('btn-multiplayer')?.addEventListener('click', () => setTimeout(refreshCustomTrackOptions, 0));

// Block the E shortcut before Input sees it. This applies to both the host and every guest once driving.
addEventListener('keydown', (e) => {
  if (!multiplayerRaceRunning()) return;
  if (e.code !== 'KeyE' && String(e.key || '').toLowerCase() !== 'e') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  showLockedMessage();
}, true);

// Also block the HUD Edit button if it is triggered by keyboard/accessibility tooling before it is hidden.
document.querySelector('#controls button[data-act="edit"]')?.addEventListener('click', (e) => {
  if (!multiplayerRaceRunning()) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  showLockedMessage();
}, true);

// mode-drive is set by main.js only after the multiplayer start message is received. Watching the body class
// therefore locks the editor at the right moment on guests as well as on the host.
new MutationObserver(syncEditorLock).observe(document.body, { attributes: true, attributeFilter: ['class'] });
setTimeout(() => { refreshCustomTrackOptions(); syncEditorLock(); }, 0);
