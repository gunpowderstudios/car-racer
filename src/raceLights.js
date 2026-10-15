// Grand Prix start lights for Race Day: five red lights come on one by one, hold for a random moment, then go out - that is the start.
// The race is held still (window.__app.freeze) until the lights go out. Used by storyMode.js.

let box = null, timers = [], onDone = null;

function ensure() {
  if (box) return box;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  const st = document.createElement('style');
  st.textContent = `
#race-lights{position:absolute;left:50%;top:50%;transform:translateX(-50%);z-index:35;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
#race-lights[hidden]{display:none}
#race-lights .rl-gantry{display:flex;gap:clamp(8px,2vw,18px);padding:12px clamp(12px,2.4vw,22px);background:#14101f;border:3px solid #3a2f57;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.55)}
#race-lights .rl-col{display:grid;gap:8px}
#race-lights .rl-lamp{width:clamp(26px,5.5vw,52px);height:clamp(26px,5.5vw,52px);border-radius:50%;background:#2a1418;box-shadow:inset 0 0 0 3px #0c0810,inset 0 -6px 10px rgba(0,0,0,.5)}
#race-lights .rl-col.on .rl-lamp{background:radial-gradient(circle at 38% 32%,#ff8a7a,#e8140c 55%,#9d0a05);box-shadow:inset 0 0 0 3px #0c0810,0 0 18px 4px rgba(255,40,20,.75)}
#race-lights .rl-msg{font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(34px,7vw,72px);line-height:1;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c;transform:skewX(-7deg)}
@media(prefers-reduced-motion:reduce){#race-lights .rl-lamp{transition:none}}`;
  document.head.appendChild(st);
  box = document.createElement('div'); box.id = 'race-lights'; box.hidden = true; box.setAttribute('aria-live', 'assertive');
  box.innerHTML = '<div class="rl-gantry">' + '<div class="rl-col"><div class="rl-lamp"></div><div class="rl-lamp"></div></div>'.repeat(5) + '</div><div class="rl-msg"></div>';
  hud.appendChild(box);
  return box;
}

function clear() { timers.forEach(clearTimeout); timers = []; }

/** Stop the sequence at once (leaving the race, restarting). Calls nothing. */
export function cancelRaceLights() {
  clear(); onDone = null;
  if (box) box.hidden = true;
}

/** Run the sequence, then call `go` as the lights go out. `beep(freq, dur)` is optional. */
export function startRaceLights(go, beep) {
  const el = ensure();
  if (!el) { go(); return; }
  clear(); onDone = go;
  const cols = [...el.querySelectorAll('.rl-col')], msg = el.querySelector('.rl-msg');
  cols.forEach((c) => c.classList.remove('on')); msg.textContent = ''; el.hidden = false;
  const step = 800;
  cols.forEach((c, i) => timers.push(setTimeout(() => { c.classList.add('on'); beep?.(440, 0.2); }, 600 + i * step)));
  const hold = 500 + Math.random() * 1100;                       // the lights stay on for a random moment: no jumping the start
  timers.push(setTimeout(() => {
    cols.forEach((c) => c.classList.remove('on')); msg.textContent = 'Go!'; beep?.(880, 0.5, 0.35);
    const f = onDone; onDone = null; f?.();
    timers.push(setTimeout(() => { el.hidden = true; }, 1000));
  }, 600 + cols.length * step + hold));
}
