// Single-player race position HUD: ranks the player against AI rivals by track progress.
// The position readout lives inside the existing score card so the HUD stays compact on all devices.
import { getCurrentMultiplayer } from './multiplayer.js';

function raceLaps() { return window.__raceLaps?.get?.() || 1; }
function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
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
#solo-race-finish{position:absolute;left:50%;top:13%;transform:translateX(-50%) skewX(-7deg);min-width:min(520px,88vw);padding:14px 28px;text-align:center;background:rgba(27,18,51,.92);border-block:4px solid #ffb31f;box-shadow:0 12px 35px rgba(0,0,0,.35);z-index:20}
#solo-finish-title{font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(38px,7vw,76px);line-height:.95;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#solo-finish-sub{margin-top:5px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:20px;color:#f6d9b0}
@media(max-width:600px){#hud-race-position-row{margin-top:4px;padding-top:4px}#hud-race-position-value{font-size:19px}#solo-race-finish{top:18%}}
`;
    document.head.appendChild(style);
  }

  let finish = document.getElementById('solo-race-finish');
  if (!finish) {
    finish = document.createElement('div');
    finish.id = 'solo-race-finish';
    finish.hidden = true;
    finish.innerHTML = '<div id="solo-finish-title"></div><div id="solo-finish-sub"></div>';
    document.getElementById('hud')?.appendChild(finish);
  }

  return { row, value: document.getElementById('hud-race-position-value'), finish };
}

function unwrapNear(s, playerProgress, length) {
  let u = Math.floor(playerProgress / length) * length + s;
  while (u - playerProgress > length / 2) u -= length;
  while (playerProgress - u > length / 2) u += length;
  return u;
}

function getSoloField(game) {
  const track = game?.track;
  const player = game?.race?.unwrapped;
  const length = track?.length;
  if (!track || !Number.isFinite(player) || !Number.isFinite(length) || length <= 0) return null;

  const fighters = game.derby?.rivals || [];
  const rivals = [];
  for (const fighter of fighters) {
    if (!fighter || fighter.gone || fighter.wrecked || !fighter.car) continue;
    const c = fighter.car;
    const s = track.progressAt(c.pos.x, c.pos.y, c.pos.z);
    if (Number.isFinite(s)) rivals.push(unwrapNear(s, player, length));
  }
  return { player, rivals };
}

let finishShown = false;
let finishTimer = null;
let lastPlace = 1;
let lastTotal = 1;

function showFinish(place, total) {
  const box = document.getElementById('solo-race-finish');
  const title = document.getElementById('solo-finish-title');
  const sub = document.getElementById('solo-finish-sub');
  if (!box || !title || !sub) return;
  title.textContent = place === 1 ? 'You won!' : `Finished ${ordinal(place)}`;
  sub.textContent = place === 1 ? `${raceLaps()}-lap race winner` : `${place} of ${total}`;
  box.hidden = false;
  if (place === 1) window.dispatchEvent(new CustomEvent('carracer-player-win', { detail: { mode: 'solo', place, laps: raceLaps() } }));
  clearTimeout(finishTimer);
  finishTimer = setTimeout(() => { box.hidden = true; }, place === 1 ? 4500 : 3200);
}

function update() {
  requestAnimationFrame(update);
  const { row, value, finish } = ensurePositionRow();
  if (!row || !value) return;

  const game = window.__game;
  const isMp = !!getCurrentMultiplayer();
  const hudVisible = game && !document.getElementById('hud')?.hidden;

  if (!hudVisible || isMp) {
    if (!isMp) row.hidden = true;
    if (finish) finish.hidden = true;
    finishShown = false;
    return;
  }

  const field = getSoloField(game);
  if (field && field.rivals.length > 0) {
    let place = 1;
    for (const p of field.rivals) if (p > field.player) place++;
    const total = field.rivals.length + 1;
    lastPlace = place;
    lastTotal = total;
    value.textContent = `${place} of ${total}`;
    row.hidden = false;
  } else {
    row.hidden = true;
  }

  // Finish detection is independent of the rival field. That way a completed race
  // always produces a result even if the AI list is briefly empty while cars respawn/wreck.
  const finished = !!game?.race && game.race.index >= raceLaps();
  if (finished && !finishShown) {
    finishShown = true;
    showFinish(lastPlace, lastTotal);
  } else if (!finished) {
    finishShown = false;
  }
}

requestAnimationFrame(update);
