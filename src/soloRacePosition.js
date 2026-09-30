// Single-player race position HUD: ranks the player against AI rivals by track progress.
// The position readout lives inside the existing score card so the HUD stays compact on all devices.

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

function update() {
  requestAnimationFrame(update);
  const { row, value } = ensurePositionRow();
  if (!row || !value) return;

  const game = window.__game;
  const isMp = document.body.classList.contains('mode-mp');
  const hudVisible = game && !document.getElementById('hud')?.hidden;

  if (!hudVisible || isMp) {
    if (!isMp) row.hidden = true;
    return;
  }

  const field = getSoloField(game);
  if (!field || field.rivals.length === 0) {
    row.hidden = true;
    return;
  }

  let place = 1;
  for (const p of field.rivals) if (p > field.player) place++;
  const total = field.rivals.length + 1;
  value.textContent = `${place} of ${total}`;
  row.hidden = false;
}

requestAnimationFrame(update);
