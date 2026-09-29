import { getCurrentMultiplayer } from './multiplayer.js';
import { normalizeTrack } from './track.js';

// Multiplayer track policy:
// - the host may choose built-in, random, or one of their locally saved editor tracks in the lobby;
// - the exact chosen track definition is sent to every player when the race starts;
// - once a multiplayer race is running, the editor is locked for host and guests alike.
//
// This module deliberately does not patch Multiplayer methods. It reads the explicit live-session
// reference exported by multiplayer.js and only owns the small piece of UI policy described above.

let multiplayerFlow = new URLSearchParams(location.search).has('room');

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
  return multiplayerFlow && document.body.classList.contains('mode-drive');
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

// The normal main.js click handler only understands built-in template keys. Intercept a saved-track
// choice first, validate/normalise it, then send that exact definition through the normal session.
const startBtn = document.getElementById('mp-start');
startBtn?.addEventListener('click', (e) => {
  const sel = document.getElementById('mp-track');
  const value = sel?.value || '';
  if (!value.startsWith('custom:')) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  const net = getCurrentMultiplayer();
  if (!net?.isHost) return;

  const name = value.slice(7);
  const raw = savedTracks()[name];
  if (!raw) {
    refreshCustomTrackOptions();
    return;
  }

  try {
    net.startGame(normalizeTrack(raw));
  } catch {
    showLockedMessage();
  }
}, true);

// Entering multiplayer marks the following drive session as networked; returning to the normal
// menu clears that flag. Direct invite links start in the multiplayer flow as well.
document.getElementById('btn-multiplayer')?.addEventListener('click', () => {
  multiplayerFlow = true;
  setTimeout(refreshCustomTrackOptions, 0);
});

// Block the E shortcut before Input sees it. This applies to host and guests once driving.
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

new MutationObserver(() => {
  if (document.body.classList.contains('mode-menu')) multiplayerFlow = false;
  syncEditorLock();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

setTimeout(() => { refreshCustomTrackOptions(); syncEditorLock(); }, 0);
