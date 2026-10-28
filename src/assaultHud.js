// Apple Crumple's on-screen bits: the countdown clock, the checkpoint count, penalty pop-ups and the result card.
// Plain DOM, built once inside #hud the first time it is needed.

let box = null, card = null, popTimer = 0;

const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
export { fmt as fmtClock };

function ensure() {
  if (box) return box;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  const st = document.createElement('style');
  st.textContent = `
#assault-hud{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:30;text-align:center;pointer-events:none;font-family:"Big Shoulders Display",Impact,"Arial Narrow",sans-serif;color:#fff;text-shadow:0 2px 6px #000a}
#assault-hud[hidden]{display:none}
#assault-hud .as-time{font-size:clamp(40px,7vw,76px);font-weight:900;line-height:1;letter-spacing:.02em;background:#1b1230cc;border:3px solid #ffb31f;border-radius:12px;padding:2px 22px}
#assault-hud.low .as-time{border-color:#ff3b30;color:#ff8a80;animation:as-pulse .6s infinite alternate}
#assault-hud .as-sub{margin-top:4px;font-size:clamp(16px,2.4vw,24px);font-weight:800;letter-spacing:.06em;text-transform:uppercase}
#assault-hud .as-pen{color:#ff8a80}
#assault-pop{position:absolute;left:50%;top:26%;transform:translateX(-50%);z-index:31;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(28px,5vw,54px);color:#ffb31f;text-shadow:0 3px 8px #000c;pointer-events:none;text-transform:uppercase;text-align:center}
#assault-pop[hidden]{display:none}
#assault-card{pointer-events:auto;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;min-width:min(86vw,380px);padding:22px 26px;background:#1b1230f2;border:4px solid #ffb31f;border-radius:16px;text-align:center;color:#fff;font-family:"Big Shoulders Display",Impact,sans-serif}
#assault-card[hidden]{display:none}
#assault-card h2{margin:0 0 4px;font-size:44px;text-transform:uppercase;color:#ffb31f}
#assault-card .as-big{font-size:64px;font-weight:900;line-height:1}
#assault-card .as-line{font-size:22px;margin:4px 0;opacity:.9}
#assault-card .as-medal{font-size:30px;font-weight:900;margin:6px 0}
#assault-card .as-btns{display:flex;gap:12px;justify-content:center;margin-top:14px}
#assault-card button{font:inherit;font-size:24px;font-weight:900;padding:6px 20px;border-radius:10px;border:0;cursor:pointer;background:#ffb31f;color:#241a40;text-transform:uppercase}
#assault-card button.alt{background:#4b3d7a;color:#fff}
@keyframes as-pulse{from{transform:scale(1)}to{transform:scale(1.06)}}`;
  document.head.appendChild(st);
  box = document.createElement('div'); box.id = 'assault-hud'; box.hidden = true;
  box.innerHTML = '<div class="as-time">--</div><div class="as-sub"></div>';
  hud.appendChild(box);
  const pop = document.createElement('div'); pop.id = 'assault-pop'; pop.hidden = true; hud.appendChild(pop);
  card = document.createElement('div'); card.id = 'assault-card'; card.hidden = true; hud.appendChild(card);
  return box;
}

/** Show or hide the whole panel (hidden when the track is not the obstacle course). */
export function assaultHudShow(on) {
  const el = ensure(); if (!el) return;
  el.hidden = !on;
  if (!on) { hideResult(); const p = document.getElementById('assault-pop'); if (p) p.hidden = true; }
}

/** Refresh the clock: `a` is the Assault run. */
export function assaultHudUpdate(a) {
  const el = ensure(); if (!el || el.hidden) return;
  const t = el.querySelector('.as-time'), sub = el.querySelector('.as-sub');
  if (a.state === 'ready') { t.textContent = fmt(a.limit); sub.textContent = 'Get ready - the clock starts at the line'; el.classList.remove('low'); return; }
  const left = a.remaining;
  t.textContent = fmt(left); el.classList.toggle('low', left < 15 && a.state === 'running');
  const cp = Math.min(a.next, a.checkpoints.length);
  sub.innerHTML = `Checkpoint ${cp}/${a.checkpoints.length}` + (a.penalty ? ` <span class="as-pen">+${a.penalty}s penalties</span>` : '');
}

/** A big word in the middle of the screen for a moment ("Checkpoint 2/4", "+10s Wrecked"). */
export function assaultPop(text, ms = 1600) {
  ensure(); const p = document.getElementById('assault-pop'); if (!p) return;
  p.textContent = text; p.hidden = false; clearTimeout(popTimer); popTimer = setTimeout(() => { p.hidden = true; }, ms);
}

export function hideResult() { if (card) card.hidden = true; }

// Enter or Space is "Try again" while the result card is up (the buttons work with the mouse, a finger and the keyboard)
let keyHandler = null;

const MEDAL = { gold: ['GOLD', '#ffd24a'], silver: ['SILVER', '#d5dbe6'], bronze: ['BRONZE', '#d98b4e'] };

/** The result card. `res` is Assault.result; `best` the best finishing time so far (seconds) and `isBest` whether this run set it. */
export function showResult(res, best, isBest, onAgain, onMenu) {
  ensure(); if (!card) return;
  const fin = res.state === 'finished', m = res.medal && MEDAL[res.medal];
  card.innerHTML = `<h2>${fin ? 'Course complete!' : 'Out of time!'}</h2>`
    + (fin ? `<div class="as-big">${fmt(res.time)}</div>` : '<div class="as-line">The clock ran out before the finish line</div>')
    + (fin && m ? `<div class="as-medal" style="color:${m[1]}">${m[0]} MEDAL</div>` : '')
    + (fin ? `<div class="as-line">Driving ${fmt(res.clean)}${res.penalty ? ` + ${res.penalty}s penalties (${res.wrecks} wreck${res.wrecks === 1 ? '' : 's'})` : ' - no penalties!'}</div>` : '')
    + (best != null ? `<div class="as-line">${isBest && fin ? 'New best time!' : 'Best'} ${fmt(best)}</div>` : '')
    + '<div class="as-btns"><button class="again">Try again (Enter)</button><button class="alt menu">Menu (Esc)</button></div>';
  card.querySelector('.again').onclick = () => { card.hidden = true; onAgain(); };
  card.querySelector('.menu').onclick = () => { card.hidden = true; onMenu(); };
  card.hidden = false;
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (card.hidden) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.hidden = true; onAgain(); }
    else if (e.key === 'Escape') { e.preventDefault(); card.hidden = true; onMenu(); }
  };
  document.addEventListener('keydown', keyHandler);
}
