// Single-player race position HUD: ranks the player against AI rivals by track progress.
// Uses the existing lap/progress state from the game and AI cars, and only displays during normal solo races.

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
#solo-race-position{position:absolute;top:calc(max(14px,env(safe-area-inset-top)) + 108px);left:16px;padding:7px 22px 8px 12px;background:rgba(42,29,74,.86);border-left:5px solid #ffb31f;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);text-shadow:0 2px 6px rgba(0,0,0,.5)}
#solo-race-position .solo-pos-label{display:block;font-family:"Barlow Condensed",Arial,sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#b9a9d6}
#solo-race-position strong{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-size:26px;line-height:1;color:#ffb31f}
@media(max-width:600px){#solo-race-position{top:calc(max(10px,env(safe-area-inset-top)) + 94px);left:10px}#solo-race-position strong{font-size:22px}}
`;
  document.head.appendChild(style);
  return card;
}

function progressOf(obj) {
  if (!obj) return null;
  const race = obj.race || obj.raceState || obj.progress;
  if (race && Number.isFinite(race.unwrapped)) return race.unwrapped;
  if (Number.isFinite(obj.raceProgress)) return obj.raceProgress;
  if (Number.isFinite(obj.unwrapped)) return obj.unwrapped;
  if (Number.isFinite(obj.progress)) return obj.progress;
  return null;
}

function getSoloField(game) {
  if (!game) return null;
  const player = progressOf(game.race) ?? progressOf(game.car) ?? progressOf(game.player);
  if (!Number.isFinite(player)) return null;

  const candidates = game.derby?.rivals || game.rivals || game.aiCars || game.ais || [];
  const rivals = [];
  for (const item of candidates) {
    const p = progressOf(item?.race) ?? progressOf(item);
    if (Number.isFinite(p) && !item?.wrecked && !item?.wreck) rivals.push(p);
  }
  return { player, rivals };
}

function update() {
  requestAnimationFrame(update);
  const card = ensureCard();
  const value = document.getElementById('solo-pos-value');
  const game = window.__game;

  // Multiplayer has its own position HUD. Hide this card outside an active solo game.
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
