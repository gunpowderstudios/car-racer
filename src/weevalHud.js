// Weeval Knievel's on-screen bits: the stage and tries panel, the speed-to-aim read-out, the big touchdown pop-up and the result card.
// Plain DOM, built once inside #hud the first time it is needed (the same way assaultHud.js does it).
import { WEEVAL } from './weeval.js';

let box = null, card = null, popTimer = 0, keyHandler = null;

function ensure() {
  if (box) return box;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  const st = document.createElement('style');
  st.textContent = `
#weeval-hud{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:30;text-align:center;pointer-events:none;font-family:"Big Shoulders Display",Impact,"Arial Narrow",sans-serif;color:#fff}
#weeval-hud[hidden]{display:none}
#weeval-hud .wk-stage{font-size:clamp(26px,4.6vw,48px);font-weight:900;line-height:1.05;letter-spacing:.03em;background:#1b1230cc;border:3px solid #ffb31f;border-radius:12px;padding:2px 20px;text-transform:uppercase}
#weeval-hud .wk-row{margin-top:5px;display:flex;gap:10px;justify-content:center;align-items:center;font-size:clamp(16px,2.4vw,24px);font-weight:800;letter-spacing:.05em;text-transform:uppercase}
#weeval-hud .wk-tries i{display:inline-block;width:.8em;height:.8em;border-radius:50%;margin:0 .15em;background:#ffb31f;border:2px solid #1b1230}
#weeval-hud .wk-tries i.gone{background:#4b3d7a}
#weeval-hud .wk-aim{background:#1b1230cc;border-radius:8px;padding:0 10px}
#weeval-hud .wk-aim.good{color:#7dff8a}#weeval-hud .wk-aim.near{color:#ffd24a}
#weeval-hud .wk-tip{margin:6px auto 0;max-width:min(92vw,520px);font-size:clamp(14px,2vw,20px);font-weight:800;letter-spacing:.04em;background:#1b1230cc;border:2px solid #4b3d7a;border-radius:8px;padding:3px 12px;color:#ffe9a8}
#weeval-hud .wk-tip[hidden]{display:none}
#weeval-pop{position:absolute;left:50%;top:26%;transform:translateX(-50%);z-index:31;text-align:center;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(30px,5.4vw,60px);color:#ffb31f;text-shadow:0 3px 0 #1b1230,0 0 18px #000;pointer-events:none;white-space:nowrap}
#weeval-pop small{display:block;font-size:.5em;color:#fff}
#weeval-pop[hidden]{display:none}
#weeval-card{pointer-events:auto;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;min-width:min(86vw,400px);padding:22px 26px;background:#1b1230f2;border:4px solid #ffb31f;border-radius:18px;text-align:center;color:#fff;font-family:"Big Shoulders Display",Impact,"Arial Narrow",sans-serif;box-shadow:0 10px 40px #000a}
#weeval-card[hidden]{display:none}
#weeval-card h2{margin:0 0 4px;font-size:42px;text-transform:uppercase;color:#ffb31f}
#weeval-card .wk-big{font-size:60px;font-weight:900;line-height:1}
#weeval-card .wk-line{font-size:22px;margin:4px 0;opacity:.92}
#weeval-card .wk-btns{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:14px}
#weeval-card button{font:inherit;font-size:24px;font-weight:900;padding:6px 20px;border-radius:10px;border:0;cursor:pointer;background:#ffb31f;color:#241a40;text-transform:uppercase}
#weeval-card button.alt{background:#4b3d7a;color:#fff}`;
  document.head.appendChild(st);
  box = document.createElement('div'); box.id = 'weeval-hud'; box.hidden = true;
  box.innerHTML = '<div class="wk-stage">--</div><div class="wk-row"><span class="wk-tries"></span><span class="wk-score"></span><span class="wk-aim"></span></div><div class="wk-tip"></div>';
  hud.appendChild(box);
  const pop = document.createElement('div'); pop.id = 'weeval-pop'; pop.hidden = true; hud.appendChild(pop);
  card = document.createElement('div'); card.id = 'weeval-card'; card.hidden = true; hud.appendChild(card);
  return box;
}

export function weevalHudShow(on) {
  const el = ensure(); if (!el) return;
  el.hidden = !on;
  if (!on) { hideWeevalCard(); const p = document.getElementById('weeval-pop'); if (p) p.hidden = true; }
}

/** Refresh the panel. `w` is the Weeval, `kmh` whether speeds are shown in km/h, `speed` the car's speed (m/s). */
export function weevalHudUpdate(w, kmh, speed) {
  const el = ensure(); if (!el || el.hidden) return;
  el.querySelector('.wk-stage').textContent = `Stage ${w.run.stage}/${WEEVAL.stages} - ${w.L.buses} buses`;
  el.querySelector('.wk-tries').innerHTML = Array.from({ length: WEEVAL.tries }, (_, i) => `<i class="${i < w.run.tries ? '' : 'gone'}"></i>`).join('');
  el.querySelector('.wk-score').textContent = `${w.run.total} pts`;
  const aim = WEEVAL.aim[w.L.stage - 1], k = kmh ? 3.6 : 2.23694, unit = kmh ? 'km/h' : 'mph', a = el.querySelector('.wk-aim');
  const tip = el.querySelector('.wk-tip'); tip.hidden = !(w.state === 'ready' || w.state === 'run' || w.state === 'air');
  if (!tip.hidden && !tip.textContent) tip.textContent = 'TIP: in the air, W (or gas) tips the nose down and S (or brake) lifts it - land level for a bonus!';
  const show = w.state === 'ready' || w.state === 'run';
  a.hidden = !show;
  if (show) {
    a.textContent = `Aim ${Math.round(aim * k)} ${unit}` + (w.state === 'run' ? ` - now ${Math.round(Math.max(0, speed) * k)}` : '');
    const e = Math.abs(speed - aim); a.className = 'wk-aim' + (w.state === 'run' && e < 1 ? ' good' : w.state === 'run' && e < 3 ? ' near' : '');
  }
}

/** A big word in the middle of the screen for a moment. `sub` is a smaller line under it. */
export function weevalPop(text, sub = '', ms = 2200) {
  ensure(); const p = document.getElementById('weeval-pop'); if (!p) return;
  p.innerHTML = '';
  p.append(document.createTextNode(text));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; p.appendChild(s); }
  p.hidden = false; clearTimeout(popTimer); popTimer = setTimeout(() => { p.hidden = true; }, ms);
}

export function hideWeevalCard() { if (card) card.hidden = true; }

/**
 * The card between attempts. `c` = { title, big, lines: [], buttons: [{ label, run, alt }] }. Enter or Space presses the first button, Escape the last.
 */
export function showWeevalCard(c) {
  ensure(); if (!card) return;
  card.innerHTML = `<h2></h2>` + (c.big ? '<div class="wk-big"></div>' : '') + (c.lines || []).map(() => '<div class="wk-line"></div>').join('') + '<div class="wk-btns"></div>';
  card.querySelector('h2').textContent = c.title;
  if (c.big) card.querySelector('.wk-big').textContent = c.big;
  card.querySelectorAll('.wk-line').forEach((d, i) => { d.textContent = c.lines[i]; });
  const btns = card.querySelector('.wk-btns');
  for (const b of c.buttons) { const el = document.createElement('button'); el.textContent = b.label; if (b.alt) el.className = 'alt'; el.onclick = () => { card.hidden = true; b.run(); }; btns.appendChild(el); }
  card.hidden = false;
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (card.hidden) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.hidden = true; c.buttons[0].run(); }
    else if (e.key === 'Escape') { e.preventDefault(); card.hidden = true; c.buttons[c.buttons.length - 1].run(); }
  };
  document.addEventListener('keydown', keyHandler);
}
