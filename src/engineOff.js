// "Engine off" prompt for the player: a big hit stalls the engine (derby.js) and you have to start it again.
// Restart with Space or Enter, the gamepad A / X button, or by tapping the prompt. Rivals just turn the key on their own.
let prompt = null, padPrev = false;

// One restart path for key, tap and gamepad: cranks the engine and plays the starter sound.
function restart() {
  const car = window.__game?.car;
  if (car && car.restartEngine()) window.__app?.sound?.engineStart?.();
}

function ensure() {
  if (prompt) return prompt;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  prompt = document.createElement('button');
  prompt.id = 'engine-off'; prompt.type = 'button'; prompt.hidden = true;
  prompt.innerHTML = '<strong>Stalled!</strong><span>Press SPACE or ENTER (or tap) to restart</span>';
  const st = document.createElement('style');
  st.textContent = `
#engine-off{position:absolute;left:50%;top:34%;transform:translateX(-50%) skewX(-7deg);z-index:25;padding:10px 26px;border:0;border-block:4px solid #e8392c;background:rgba(27,18,51,.92);color:#fff;text-align:center;cursor:pointer;pointer-events:auto;animation:engineBlink 1s ease-in-out infinite}
#engine-off[hidden]{display:none}
#engine-off strong{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(32px,6vw,58px);line-height:1;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#engine-off span{display:block;margin-top:4px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:19px;letter-spacing:.06em;text-transform:uppercase;color:#f6d9b0}
@keyframes engineBlink{50%{opacity:.72}}
@media(prefers-reduced-motion:reduce){#engine-off{animation:none}}`;
  document.head.appendChild(st);
  prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); restart(); });
  hud.appendChild(prompt);
  return prompt;
}

addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
  const car = window.__game?.car;
  if (car && car.engineOff) restart();
});

function tick() {
  requestAnimationFrame(tick);
  const g = window.__game, car = g && g.car, el = ensure();
  if (!el) return;
  const off = !!(car && car.engineOff) && !document.getElementById('hud')?.hidden;
  if (off === !el.hidden) { /* unchanged */ } else el.hidden = !off;
  if (off) {                                              // gamepad A / X restarts it too
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p && p.connected) : null;
    const down = !!(gp && (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed));
    if (down && !padPrev) restart();
    padPrev = down;
  } else padPrev = false;
}
requestAnimationFrame(tick);
