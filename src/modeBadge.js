// A strip at the top of the score card that says which game you are playing and how it ends:
//   Race:       "RACE - LAP 1 OF 3"
//   Demolition: "LAST ONE STANDING - 5 RIVALS LEFT"
// Single-player only (a multiplayer room has its own race banner). Reads the live game state; changes nothing.
import { getCurrentMultiplayer } from './multiplayer.js';

const raceLaps = () => window.__raceLaps?.get?.() || 1;

function ensure() {
  const score = document.getElementById('derby-score');
  if (!score) return null;
  let el = document.getElementById('hud-mode-badge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-mode-badge';
    score.insertBefore(el, score.firstChild);
    const st = document.createElement('style');
    st.textContent = `
#hud-mode-badge{margin:0 -14px 5px;padding:2px 10px;font-family:"Barlow Condensed",Arial,sans-serif;font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;color:#1b1233;background:#ffb31f}
#hud-mode-badge.demo{background:#e8392c;color:#fff}
@media(max-width:600px){#hud-mode-badge{font-size:10px;letter-spacing:.08em;margin:0 -12px 3px;padding:1px 6px}}
`;
    document.head.appendChild(st);
  }
  return el;
}

function update() {
  requestAnimationFrame(update);
  const el = ensure();
  if (!el) return;
  const g = window.__game;
  if (!g || !g.derby || !g.derby.enabled || getCurrentMultiplayer()) { el.hidden = true; return; }
  let text, demo = false;
  if (g.derby.demolition) {
    const n = g.derby._standing();
    text = `Last one standing - ${n} ${n === 1 ? 'rival' : 'rivals'} left`; demo = true;
  } else {
    const laps = raceLaps();
    text = `Race - lap ${Math.max(1, Math.min(laps, (g.race?.index ?? -1) + 1))} of ${laps}`;
  }
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('demo', demo);
  el.hidden = false;
}

requestAnimationFrame(update);
