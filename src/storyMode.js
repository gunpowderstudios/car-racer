// Story mode: four circuits, eight laps, and only the best five of every race go through.
//   Stage 1  Speedway   1 lap   easy
//   Stage 2  Technical  2 laps  medium
//   Stage 3  Hills      2 laps  hard
//   Stage 4  Overpass   3 laps  hard
// Nine cars start each stage (you and eight rivals). Finish in the top five to move on; anything lower and you are out of the competition.
// The race itself is the normal Race mode (wrecked = respawn); this file only picks each stage's settings and runs the results panel.
// It talks to the game through window.__app (main.js), window.__raceLaps (raceSettings.js) and the 'carracer-player-finish' event (soloRacePosition.js).

import { STORY, qualifies } from './storyData.js';
const SKILL_OF = { easy: 0.2, normal: 0.5, hard: 0.75, expert: 1 };

const state = window.__story = { active: false, stage: 0, total: STORY.stages.length, laps: 1, qualify: STORY.qualify, saved: null, name: '' };
let panel = null, intro = null, introTimer = null, resultTimer = null;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]}`;
const store = { get() { try { return JSON.parse(localStorage.getItem('cr.story')) || {}; } catch { return {}; } }, set(v) { try { localStorage.setItem('cr.story', JSON.stringify(v)); } catch { /* storage unavailable */ } } };

function ensureUi() {
  if (panel) return;
  const hud = document.getElementById('hud');
  if (!hud) return;
  const st = document.createElement('style');
  st.textContent = `
#story-panel{position:absolute;inset:0;z-index:90;display:grid;place-items:center;background:rgba(10,6,24,.62);pointer-events:auto}
#story-panel[hidden],#story-intro[hidden]{display:none}
#story-panel .sp-card{min-width:min(460px,90vw);padding:22px 30px 24px;text-align:center;background:rgba(42,29,74,.96);border-block:5px solid #ffb31f;box-shadow:0 14px 40px rgba(0,0,0,.5)}
#story-panel h2{margin:0;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(40px,8vw,72px);line-height:.95;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#story-panel.out h2{color:#fff;text-shadow:3px 3px 0 #e8392c}
#story-panel p{margin:10px 0 0;font-family:"Barlow Condensed",Arial,sans-serif;font-size:21px;color:#f6d9b0}
#story-panel .sp-next{opacity:.85;font-size:17px}
#story-panel .sp-btns{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}
#story-intro{position:absolute;left:50%;top:22%;transform:translateX(-50%) skewX(-7deg);z-index:30;padding:10px 28px;text-align:center;background:rgba(27,18,51,.92);border-block:4px solid #ffb31f;pointer-events:none}
#story-intro strong{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(30px,6vw,56px);line-height:1;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#story-intro span{display:block;margin-top:3px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:19px;letter-spacing:.05em;text-transform:uppercase;color:#f6d9b0}`;
  document.head.appendChild(st);
  panel = document.createElement('div'); panel.id = 'story-panel'; panel.hidden = true;
  panel.innerHTML = '<div class="sp-card"><h2></h2><p class="sp-line"></p><p class="sp-next"></p><div class="sp-btns"></div></div>';
  intro = document.createElement('div'); intro.id = 'story-intro'; intro.hidden = true; intro.innerHTML = '<strong></strong><span></span>';
  hud.appendChild(panel); hud.appendChild(intro);
}

function stageDef(i) { return STORY.stages[i]; }

function applyStage(i) {
  const app = window.__app, s = stageDef(i);
  app.opts.mode = 'race'; app.opts.rivals = STORY.rivals;
  window.__raceLaps?.set?.(s.laps);
  app.derby.skill = s.skill;
  const def = app.makeTemplate(s.key);
  Object.assign(state, { active: true, stage: i, laps: s.laps, name: def.name });
  return def;
}

function restore() {
  const app = window.__app, sv = state.saved;
  if (sv) { app.opts.mode = sv.mode; app.opts.rivals = sv.rivals; window.__raceLaps?.set?.(sv.laps); }
  app.derby.skill = SKILL_OF[app.opts.skill] ?? 0.75;
  state.saved = null;
}

export function endStory() {
  clearTimeout(resultTimer); clearTimeout(introTimer);
  if (panel) panel.hidden = true; if (intro) intro.hidden = true;
  window.__app?.freeze(false);
  if (state.active) { state.active = false; restore(); }
}

export function startStory(i = 0) {
  const app = window.__app; if (!app) return;
  ensureUi();
  if (!state.active) state.saved = { mode: app.opts.mode, rivals: app.opts.rivals, laps: window.__raceLaps?.get?.() || 1 };
  clearTimeout(resultTimer);
  const def = applyStage(i), s = stageDef(i);
  if (panel) panel.hidden = true;
  app.freeze(false);
  app.startDriving(def);
  ensureUi();
  if (intro) {
    intro.querySelector('strong').textContent = `Stage ${i + 1} of ${STORY.stages.length}`;
    intro.querySelector('span').textContent = `${def.name} - ${s.laps} ${s.laps === 1 ? 'lap' : 'laps'} - ${s.level} - top ${STORY.qualify} go through`;
    intro.hidden = false; clearTimeout(introTimer); introTimer = setTimeout(() => { intro.hidden = true; }, 4200);
  }
}

function show(kind, place, total) {
  ensureUi(); if (!panel) return;
  const i = state.stage, last = i === STORY.stages.length - 1, card = panel.querySelector('.sp-card');
  const h = card.querySelector('h2'), line = card.querySelector('.sp-line'), next = card.querySelector('.sp-next'), btns = card.querySelector('.sp-btns');
  panel.classList.toggle('out', kind === 'out'); btns.innerHTML = '';
  const add = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; btns.appendChild(b); return b; };
  let primary;
  if (kind === 'out') {
    h.textContent = 'You\'re out!'; line.textContent = `${ordinal(place)} of ${total} - only the top ${STORY.qualify} go through.`; next.textContent = `You reached stage ${i + 1} of ${STORY.stages.length}.`;
    primary = add('Start again', () => startStory(0), 'btn-play'); add('Menu', () => { endStory(); window.__app.showMenu(); });
  } else if (last) {
    h.textContent = place === 1 ? 'Champion!' : 'Story complete!'; line.textContent = `You finished ${ordinal(place)} of ${total} in the final.`;
    next.textContent = place === 1 ? 'Four circuits, eight laps, and you beat the lot.' : 'You made it through every stage. Win the final to be champion.';
    primary = add('Play again', () => startStory(0), 'btn-play'); add('Menu', () => { endStory(); window.__app.showMenu(); });
  } else {
    const n = stageDef(i + 1), nd = window.__app.makeTemplate(n.key);
    h.textContent = `Stage ${i + 1} complete!`; line.textContent = `${ordinal(place)} of ${total} - you're through.`;
    next.textContent = `Next: ${nd.name}, ${n.laps} ${n.laps === 1 ? 'lap' : 'laps'}, ${n.level}.`;
    primary = add('Next stage', () => startStory(i + 1), 'btn-play'); add('Menu', () => { endStory(); window.__app.showMenu(); });
  }
  const b = store.get(); if (kind !== 'out' && (b.best || 0) < i + 1) store.set({ ...b, best: i + 1 });
  window.__app.freeze(true);
  panel.hidden = false; primary.focus();
}

window.addEventListener('carracer-player-finish', (e) => {
  if (!state.active || !e.detail || e.detail.mode !== 'solo') return;
  const g = window.__game;
  if (!g || g.track?.def?.name !== state.name) { endStory(); return; }                // you went off and started something else
  const { place, total } = e.detail;
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => { if (state.active) show(qualifies(place, total) ? 'through' : 'out', place, total); }, 4200);
});

// Starting any other race from the menu quietly ends the story (and gives your own settings back).
setInterval(() => {
  if (!state.active) return;
  const g = window.__game, drive = document.body.classList.contains('mode-drive');
  if (g && drive && g.track?.def?.name !== state.name) endStory();
}, 1500);

document.getElementById('btn-story')?.addEventListener('click', () => { if (state.active) endStory(); startStory(0); });
