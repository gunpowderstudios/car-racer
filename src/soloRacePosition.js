// Single-player race position HUD: ranks the player against AI rivals by track progress.
// Uses the player's existing unwrapped race distance and each rival's real position on the track.

function ensureCard() {
  let card = document.getElementById('solo-race-position');
  if (card) return card;

  card = document.createElement('div');
  card.id = 'solo-race-position';
  card.hidden = true;
  card.innerHTML = '<span class="solo-pos-label">Position</span><strong id="solo-pos-value">1 of 1</strong>';
  document.getElementById('hud')?.appendChild(card);

  const style = document.createElement('style');
  style.textContent = `
#solo-race-position{position:absolute;top:calc(max(14px,env(safe-area-inset-top)) + 180px);left:16px;padding:7px 22px 8px 12px;background:rgba(42,29,74,.86);border-left:5px solid #ffb31f;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);text-shadow:0 2px 6px rgba(0,0,0,.5)}
#solo-race-position .solo-pos-label{display:block;font-family:"Barlow Condensed",Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#b9a9d6}
#solo-race-position strong{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-size:26px;line-height:1;color:#ffb31f}
@media(max-width:600px){#solo-race-position{top:calc(max(10px,env(safe-area-inset-top)) + 190px);left:10px}#solo-race-position strong{font-size:22px}}
`;
  document.head.appendChild(style);
  return card;
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
  const card = ensureCard();
  const value = document.getElementById('solo-pos-value');
  const game = window.__game;

  // Multiplayer has its own position HUD. Hide this card outside an active solo race.
  const isMp = document.body.classList.contains('mode-mp');
  const hudVisible = game && !document.getElementById('hud')?.hidden;
  if (!hudVisible || isMp) {
    card.hidden = true;
    return;
  }

  const field = getSoloField(game);
  if (!field || field.rivals.length === 0) {
    card.hidden = true;
    return;
  }

  let place = 1;
  for (const p of field.rivals) if (p > field.player) place++;
  const total = field.rivals.length + 1;
  value.textContent = `${place} of ${total}`;
  card.hidden = false;
}

requestAnimationFrame(update);
