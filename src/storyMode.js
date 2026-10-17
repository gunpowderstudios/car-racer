// Story mode: a four-race points championship against eight named rivals.
//   Stage 1  Speedway   easy      9 cars, top 5 in the standings go on
//   Stage 2  Technical  medium    5 cars, top 4 go on
//   Stage 3  Hills      hard      4 cars, top 3 go on
//   Stage 4  Overpass   hard      3 cars, points leader is champion
// Every stage is one lap unless the Laps option is raised, which applies to all stages.
// Every race pays 5/3/2/1 points; the cut is made on total points (then wins, then latest finish). Rivals who are cut do not race again.
// The race itself is the normal Race mode (wrecked = respawn); this file picks each stage's settings, keeps the table and runs the results panel.
// It talks to the game through window.__app (main.js), window.__raceLaps (raceSettings.js) and the 'carracer-player-finish' event (soloRacePosition.js).

import { startRaceLights, cancelRaceLights } from './raceLights.js';
import { STORY, newTable, addStage, standings, survivors, pointsFor } from './storyData.js';
import { TEMPLATE_KEYS, makeTemplate } from './templates.js';
const SKILL_OF = { easy: 0.2, normal: 0.5, hard: 0.75, expert: 1 };

const state = window.__story = { active: false, stage: 0, total: STORY.stages.length, laps: 1, saved: null, name: '', table: null, alive: [], order: [], single: null };
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
#story-intro em{display:block;margin-top:3px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:15px;font-style:normal;color:#f6d9b0;opacity:.8;max-width:min(560px,86vw)}
#story-panel table{width:100%;margin-top:12px;border-collapse:collapse;font-family:"Barlow Condensed",Arial,sans-serif;font-size:19px;color:#f6d9b0;text-align:left}
#story-panel td,#story-panel th{padding:3px 8px}
#story-panel th{font-size:13px;letter-spacing:.1em;text-transform:uppercase;opacity:.7}
#story-panel tr.me{background:rgba(255,179,31,.22);color:#fff;font-weight:700}
#story-panel tr.cut td{opacity:.55;text-decoration:line-through}
#story-panel td.n{text-align:right}
#story-intro span{display:block;margin-top:3px;font-family:"Barlow Condensed",Arial,sans-serif;font-size:19px;letter-spacing:.05em;text-transform:uppercase;color:#f6d9b0}`;
  document.head.appendChild(st);
  panel = document.createElement('div'); panel.id = 'story-panel'; panel.hidden = true;
  panel.innerHTML = '<div class="sp-card"><h2></h2><p class="sp-line"></p><p class="sp-next"></p><div class="sp-btns"></div></div>';
  intro = document.createElement('div'); intro.id = 'story-intro'; intro.hidden = true; intro.innerHTML = '<strong></strong><span></span><em></em>';
  hud.appendChild(panel); hud.appendChild(intro);
}

/** The stages being played: the four-circuit championship, or one single race on a track picked on the Race Day screen. */
const stages = () => (state.single ? [{ key: state.single, laps: 1, skill: 0.6, level: 'Medium' }] : STORY.stages);
const keepOf = (i) => (state.single ? 0 : STORY.keep[i]);
function stageDef(i) { return stages()[i]; }
/** Laps for a stage: one by default, or whatever the Laps option was set to when the story began. */
function lapsFor(i) { return Math.max(1, (state.saved && state.saved.laps) || stageDef(i).laps); }

const nameOf = (id) => id === 'you' ? 'You' : (STORY.roster.find((r) => r.id === id) || {}).name || id;
const rivalsAlive = () => state.alive.filter((id) => id !== 'you');

function applyStage(i) {
  const app = window.__app, s = stageDef(i), rv = rivalsAlive();
  app.opts.mode = 'race'; app.opts.rivals = Math.max(1, rv.length);
  window.__raceLaps?.set?.(lapsFor(i));
  app.derby.skill = s.skill;
  app.derby.slotSkill = {};                                             // grid slot n is the nth surviving rival
  rv.forEach((id, k) => { app.derby.slotSkill[k + 1] = (STORY.roster.find((r) => r.id === id) || {}).skill || 0; });
  const def = app.makeTemplate(s.key);
  Object.assign(state, { active: true, stage: i, laps: lapsFor(i), name: def.name });
  return def;
}

function restore() {
  const app = window.__app, sv = state.saved;
  if (sv) { app.opts.mode = sv.mode; app.opts.rivals = sv.rivals; window.__raceLaps?.set?.(sv.laps); }
  app.derby.skill = SKILL_OF[app.opts.skill] ?? 0.75; app.derby.slotSkill = null;
  state.saved = null;
}

export function endStory() {
  clearTimeout(resultTimer); clearTimeout(introTimer); cancelRaceLights();
  if (panel) panel.hidden = true; if (intro) intro.hidden = true;
  window.__app?.freeze(false);
  if (state.active) { state.active = false; restore(); }
}

export function startStory(i = 0, resume = null) {
  const app = window.__app; if (!app) return;
  if (i === 0 && !resume) { state.alive = ['you', ...STORY.roster.map((r) => r.id)]; state.table = newTable(state.alive); }
  state.total = stages().length;
  ensureUi();
  if (!state.active) state.saved = { mode: app.opts.mode, rivals: app.opts.rivals, laps: window.__raceLaps?.get?.() || 1 };
  clearTimeout(resultTimer); cancelRaceLights();
  const def = applyStage(i), s = stageDef(i);
  if (panel) panel.hidden = true;
  app.freeze(false);
  app.startDriving(def);
  app.freeze(true);                                                       // hold the grid still for the start lights
  startRaceLights(() => app.freeze(false), (f, d, g) => app.sound?.beep?.(f, d, g));
  ensureUi();
  if (intro) {
    intro.querySelector('strong').textContent = (state.single ? 'Race Day' : `Stage ${i + 1} of ${stages().length}`);
    intro.querySelector('span').textContent = `${def.name} - ${lapsFor(i)} ${lapsFor(i) === 1 ? 'lap' : 'laps'} - ${s.level} - ${STORY.points.join('/')} points${keepOf(i) ? ` - top ${keepOf(i)} go on` : state.single ? '' : ' - points leader wins'}`;
    const names = intro.querySelector('em'); if (names) names.textContent = 'Racing: ' + rivalsAlive().map(nameOf).join(', ');
    intro.hidden = false; clearTimeout(introTimer); introTimer = setTimeout(() => { intro.hidden = true; }, 4200);
  }
}

function table(rows, cutAfter) {
  const t = document.createElement('table');
  t.innerHTML = '<tr><th></th><th>Driver</th><th class="n">Race</th><th class="n">Total</th></tr>';
  rows.forEach((r, k) => {
    const tr = document.createElement('tr');
    if (r.id === 'you') tr.className = 'me';
    if (cutAfter != null && k >= cutAfter) tr.className += ' cut';
    tr.innerHTML = `<td>${k + 1}</td><td></td><td class="n">+${r.gain}</td><td class="n">${r.pts}</td>`;
    tr.children[1].textContent = nameOf(r.id) + (cutAfter != null && k >= cutAfter ? ' - out' : '');
    t.appendChild(tr);
  });
  return t;
}

function show(kind, place, rows, cutAfter) {
  ensureUi(); if (!panel) return;
  const i = state.stage, last = i === stages().length - 1, card = panel.querySelector('.sp-card');
  const h = card.querySelector('h2'), line = card.querySelector('.sp-line'), next = card.querySelector('.sp-next'), btns = card.querySelector('.sp-btns');
  panel.classList.toggle('out', kind === 'out'); btns.innerHTML = ''; card.querySelector('table')?.remove();
  const add = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; btns.appendChild(b); return b; };
  const mine = rows.findIndex((r) => r.id === 'you') + 1, mp = rows[mine - 1]?.pts ?? 0;
  let primary;
  if (kind === 'out') {
    h.textContent = 'You\'re out!'; line.textContent = `Finished the stage ${ordinal(place)}, but ${ordinal(mine)} in the standings on ${mp} pts - only the top ${keepOf(i)} go on.`; next.textContent = `You reached stage ${i + 1} of ${stages().length}.`;
    primary = add('Start again', () => startStory(0), 'btn-play'); add('Menu', () => { endStory(); window.__app.showMenu(); });
  } else if (last) {
    const champ = mine === 1;
    h.textContent = state.single ? (champ ? 'You won!' : 'Race over!') : champ ? 'Champion!' : 'Season over!'; line.textContent = state.single ? `You finished ${ordinal(place)} on ${state.name}.` : `You finished ${ordinal(mine)} overall on ${mp} points.`;
    next.textContent = state.single ? (champ ? 'Beat all eight rivals.' : `${nameOf(rows[0].id)} wins it. Go again?`) : champ ? 'Four circuits, and you beat the lot.' : `${nameOf(rows[0].id)} takes the title. Go again?`;
    primary = add('Play again', () => startStory(0), 'btn-play'); add('Menu', () => { endStory(); window.__app.showMenu(); });
  } else {
    const n = stageDef(i + 1), nd = window.__app.makeTemplate(n.key);
    h.textContent = `Stage ${i + 1} complete!`; line.textContent = `${ordinal(place)} in the race (+${pointsFor(place)} pts) - ${ordinal(mine)} overall, you're through.`;
    next.textContent = `Next: ${nd.name}, ${lapsFor(i + 1)} ${lapsFor(i + 1) === 1 ? 'lap' : 'laps'}, ${n.level}.`;
    primary = add('Next stage', () => startStory(i + 1, true), 'btn-play'); add('Menu', () => { endStory(); window.__app.showMenu(); });
  }
  line.parentNode.insertBefore(table(rows, cutAfter), next);
  window.__app.freeze(true);
  panel.hidden = false; primary.focus();
}

/** Score the race that just finished, cut the standings, and show the results. */
function finishStage(detail) {
  const i = state.stage, rv = rivalsAlive();
  const slotId = (n) => n === 0 ? 'you' : rv[n - 1];
  const order = (detail.order && detail.order.length ? detail.order : [0]).map(slotId).filter(Boolean);
  for (const id of state.alive) if (!order.includes(id)) order.push(id);        // cars that never made the list finish last
  const gain = {}; order.forEach((id, k) => { gain[id] = pointsFor(k + 1); });
  addStage(state.table, order);
  const sub = {}; for (const id of state.alive) sub[id] = state.table[id];
  const ranked = standings(sub).map((r) => ({ id: r.id, pts: r.pts, gain: gain[r.id] || 0 }));
  const keep = keepOf(i), through = !keep || ranked.slice(0, keep).some((r) => r.id === 'you');
  const place = order.indexOf('you') + 1;
  if (through && keep) state.alive = survivors(sub, i);
  const b = store.get();
  if (state.single) { /* a single race leaves any championship you have on the go alone */ }
  else if (through) store.set({ ...b, best: Math.max(b.best || 0, i + 1), champ: keep ? { stage: i + 1, table: state.table, alive: state.alive } : null });
  else store.set({ ...b, champ: null });
  show(through ? 'through' : 'out', place, ranked, keep || null);
}

window.addEventListener('carracer-player-finish', (e) => {
  if (!state.active || !e.detail || e.detail.mode !== 'solo') return;
  const g = window.__game;
  if (!g || g.track?.def?.name !== state.name) { endStory(); return; }                // you went off and started something else
  const detail = e.detail;
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => { if (state.active) finishStage(detail); }, 4200);
});

// Starting any other race from the menu quietly ends the story (and gives your own settings back).
setInterval(() => {
  if (!state.active) return;
  const g = window.__game, drive = document.body.classList.contains('mode-drive');
  if (g && drive && g.track?.def?.name !== state.name) endStory();
}, 1500);

/** The Race Day screen: the championship, or a single race on any circuit, and how many laps. */
function openSetup() {
  let ov = document.getElementById('story-setup');
  if (!ov) {
    const st = document.createElement('style');
    st.textContent = `#story-setup{position:fixed;inset:0;z-index:70;display:grid;place-items:center;background:rgba(10,6,24,.78)}#story-setup[hidden]{display:none}
#story-setup .sp-card{width:min(460px,92vw);padding:22px 28px 24px;background:rgba(42,29,74,.97);border-block:5px solid #ffb31f;box-shadow:0 14px 40px rgba(0,0,0,.5);text-align:left;color:#f6d9b0;font-family:"Barlow Condensed",Arial,sans-serif;font-size:19px}
#story-setup h2{margin:0 0 6px;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:44px;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
#story-setup label{display:block;margin-top:12px}#story-setup select{display:block;width:100%;margin-top:4px;background:#2a1d4a;color:#f6d9b0;border:1px solid rgba(246,217,176,.45);padding:6px 8px;font:inherit}
#story-setup .sp-btns{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}#story-setup p{margin:4px 0 0;font-size:16px;opacity:.85}`;
    document.head.appendChild(st);
    ov = document.createElement('div'); ov.id = 'story-setup'; ov.hidden = true;
    const tracks = TEMPLATE_KEYS.filter((k) => k !== 'random' && k !== 'oval').map((k) => `<option value="${k}">${makeTemplate(k).name}</option>`).join('');
    ov.innerHTML = `<div class="sp-card"><h2>Race Day</h2><p>Race eight named rivals for points: a four-circuit championship, or one race on a track of your choice.</p>
<label>Track<select id="sp-track"><option value="champ">The championship (all four circuits)</option>${tracks}</select></label>
<label>Laps<select id="sp-laps"><option value="1">1 lap</option><option value="2">2 laps</option><option value="3">3 laps</option></select></label>
<div class="sp-btns"><button id="sp-go" class="btn btn-play" type="button">Go!</button><button id="sp-cancel" class="btn ghost" type="button">Cancel</button></div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#sp-cancel').onclick = () => { ov.hidden = true; };
    ov.querySelector('#sp-go').onclick = () => {
      ov.hidden = true;
      const pick = ov.querySelector('#sp-track').value;
      window.__raceLaps?.set?.(+ov.querySelector('#sp-laps').value);
      try { localStorage.setItem('cr.storyTrack', pick); localStorage.setItem('cr.storyLaps', ov.querySelector('#sp-laps').value); } catch { /* storage unavailable */ }
      if (pick !== 'champ') { state.single = pick; startStory(0); return; }
      state.single = null;
      const c = store.get().champ;
      if (c && c.table && c.alive?.includes('you') && STORY.stages[c.stage] && confirm(`Continue your championship at stage ${c.stage + 1} of ${STORY.stages.length}?\n\nOK = continue, Cancel = start a new one.`)) {
        state.table = c.table; state.alive = c.alive; startStory(c.stage, true);
      } else startStory(0);
    };
  }
  let saved = 'champ'; try { saved = localStorage.getItem('cr.storyTrack') || 'champ'; } catch { /* storage unavailable */ }
  const sel = ov.querySelector('#sp-track'); sel.value = [...sel.options].some((o) => o.value === saved) ? saved : 'champ';
  let dayLaps = '2'; try { dayLaps = localStorage.getItem('cr.storyLaps') || '2'; } catch { /* storage unavailable */ }      // Race Day starts on 2 laps (then remembers what you picked last)
  ov.querySelector('#sp-laps').value = ['1', '2', '3'].includes(dayLaps) ? dayLaps : '2';
  ov.hidden = false;
}

document.getElementById('btn-story')?.addEventListener('click', () => {
  if (state.active) endStory();
  openSetup();
});
