// The Getaway's on-screen bits: the score, a hint for what to do next, the "robbery in progress" siren, a street map that shows each side only
// what it should know, and the result card. Plain DOM, built once inside #hud the first time it is needed.

let box = null, card = null, pop = null, popTimer = 0, siren = null, compass = null, bagEl = null;
const canvas = () => document.getElementById('minimap');

function ensure() {
  if (box) return box;
  const hud = document.getElementById('hud');
  if (!hud) return null;
  const st = document.createElement('style');
  st.textContent = `
#getaway-hud{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:30;text-align:center;pointer-events:none;font-family:"Big Shoulders Display",Impact,"Arial Narrow",sans-serif;color:#fff;text-shadow:0 2px 6px #000a}
#getaway-hud[hidden]{display:none}
#getaway-hud .gw-row{display:flex;gap:10px;justify-content:center}
#getaway-hud .gw-side{min-width:132px;padding:2px 14px;border-radius:10px;background:#16102acc;border:3px solid #fff4;font-size:clamp(15px,2.2vw,22px);font-weight:900;letter-spacing:.05em;text-transform:uppercase}
#getaway-hud .gw-side.me{border-color:#ffb31f}
#getaway-hud .gw-side.rob b{color:#7dff9a}#getaway-hud .gw-side.pol b{color:#6fb4ff}
#getaway-hud small{display:block;font-size:11px;letter-spacing:.1em;opacity:.7;margin-top:-2px}
#getaway-hud .gw-pips{font-size:clamp(20px,3vw,30px);letter-spacing:.12em;line-height:1}
#getaway-hud .gw-hint{margin-top:5px;font-size:clamp(14px,2vw,20px);font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:#16102a99;display:inline-block;padding:1px 14px;border-radius:8px}
#getaway-siren{position:absolute;left:50%;top:24%;transform:translateX(-50%);z-index:31;pointer-events:none;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(24px,4.4vw,48px);text-transform:uppercase;letter-spacing:.06em;padding:2px 24px;border-radius:12px;color:#fff;text-shadow:0 2px 6px #000c;animation:gw-siren .5s infinite alternate}
#getaway-siren[hidden]{display:none}
@keyframes gw-siren{from{background:#d4231acc;box-shadow:0 0 28px #d4231a}to{background:#1f5fd6cc;box-shadow:0 0 28px #1f5fd6}}
#getaway-pop{position:absolute;left:50%;top:34%;transform:translateX(-50%);z-index:31;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(28px,5vw,54px);color:#ffd23a;text-shadow:0 3px 8px #000c;pointer-events:none;text-transform:uppercase;text-align:center}
#getaway-pop[hidden]{display:none}
#getaway-card{pointer-events:auto;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;min-width:min(86vw,400px);padding:22px 26px;background:#14102af2;border:4px solid #ffb31f;border-radius:16px;text-align:center;color:#fff;font-family:"Big Shoulders Display",Impact,sans-serif}
#getaway-card[hidden]{display:none}
#getaway-card h2{margin:0 0 4px;font-size:46px;text-transform:uppercase;color:#ffb31f}
#getaway-card .gw-line{font-size:22px;margin:4px 0;opacity:.92}
#getaway-card .gw-btns{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:14px}
#getaway-card button{font:inherit;font-size:24px;font-weight:900;padding:6px 20px;border-radius:10px;border:0;cursor:pointer;background:#ffb31f;color:#241a40;text-transform:uppercase}
#getaway-card button.alt{background:#4b3d7a;color:#fff}
body.getaway #minimap{border-radius:10px;width:198px;height:129px}
#getaway-compass{position:absolute;right:244px;top:calc(max(8px,env(safe-area-inset-top)) + 52px);width:70px;height:70px;z-index:30;pointer-events:none;border-radius:50%;background:#16102acc;border:2px solid #f6d9b059;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900}
#getaway-compass[hidden]{display:none}
#getaway-compass .gw-dial{position:absolute;inset:0;transition:none}
#getaway-compass .gw-dial span{position:absolute;left:50%;top:50%;width:20px;margin-left:-10px;margin-top:-10px;text-align:center;font-size:14px;line-height:20px;color:#fff9}
#getaway-compass .gw-dial span.n{color:#ff4b3e;font-size:20px;text-shadow:0 0 6px #000}
#getaway-compass .gw-car{position:absolute;left:50%;top:50%;width:0;height:0;margin:-9px 0 0 -6px;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:18px solid #ffb31f}
body.getaway #lap-card{display:none}
#getaway-bag{position:absolute;right:12px;bottom:150px;z-index:30;pointer-events:none;display:flex;align-items:center;gap:5px;padding:2px 9px 2px 4px;border-radius:14px;background:#16102acc;color:#ffd23a;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:15px;line-height:1}
#getaway-bag[hidden]{display:none}
#getaway-bag i{display:block;width:20px;height:20px;border-radius:50% 50% 45% 45%;background:radial-gradient(circle at 35% 30%,#e8c46a,#a8741f);border:1px solid #fff8;text-align:center;font-style:normal;font-size:13px;line-height:19px;color:#3a2800}
@media (pointer:fine) and (min-width:761px){#speed-stack #getaway-bag{position:static;align-self:flex-end;margin-bottom:-2px}}
@media (max-width:900px){body.getaway #minimap{width:132px;height:86px}#getaway-compass{right:150px;top:calc(max(8px,env(safe-area-inset-top)) + 48px);width:54px;height:54px}#getaway-compass .gw-dial span{font-size:11px}#getaway-compass .gw-dial span.n{font-size:16px}#getaway-hud .gw-side{min-width:96px;padding:1px 8px}}`;
  document.head.appendChild(st);
  box = document.createElement('div'); box.id = 'getaway-hud'; box.hidden = true;
  box.innerHTML = '<div class="gw-row"><div class="gw-side rob"><b>Robbers</b><div class="gw-pips"></div><small>bags safe</small></div><div class="gw-side pol"><b>Police</b><div class="gw-pips"></div><small>strikes</small></div></div><div class="gw-hint"></div>';
  hud.appendChild(box);
  compass = document.createElement('div'); compass.id = 'getaway-compass'; compass.hidden = true;
  compass.innerHTML = '<div class="gw-dial"><span class="n" data-a="0">N</span><span data-a="90">E</span><span data-a="180">S</span><span data-a="270">W</span></div><div class="gw-car"></div>';
  compass.querySelectorAll('.gw-dial span').forEach((n) => { n.style.transform = `rotate(${n.dataset.a}deg) translateY(-24px) rotate(-${n.dataset.a}deg)`; });
  hud.appendChild(compass);
  bagEl = document.createElement('div'); bagEl.id = 'getaway-bag'; bagEl.hidden = true; bagEl.innerHTML = '<i>$</i><span></span>';
  (document.getElementById('speed-stack') || hud).insertBefore(bagEl, (document.getElementById('speed-stack') && document.getElementById('hud-logo')) || null);
  siren = document.createElement('div'); siren.id = 'getaway-siren'; siren.hidden = true; hud.appendChild(siren);
  pop = document.createElement('div'); pop.id = 'getaway-pop'; pop.hidden = true; hud.appendChild(pop);
  card = document.createElement('div'); card.id = 'getaway-card'; card.hidden = true; hud.appendChild(card);
  return box;
}

/** Show or hide the whole panel (hidden on every other track). The map canvas is made wide for the town and put back when it goes. */
export function getawayHudShow(on) {
  const el = ensure(); if (!el) return;
  el.hidden = !on; compass.hidden = !on; if (!on && bagEl) bagEl.hidden = true; document.body.classList.toggle('getaway', !!on);
  const c = canvas(); if (c) { const w = on ? 264 : 220, h = on ? 172 : 220; if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; }
  if (!on) { hideGetawayResult(); siren.hidden = true; pop.hidden = true; }
}

const pips = (n, goal) => '●'.repeat(Math.min(n, goal)) + '○'.repeat(Math.max(0, goal - n));

/** Score, hint and siren. `game` is the GetawayGame and `role` the side the person plays ('robber' or 'police'). */
export function getawayHudUpdate(game, role) {
  const el = ensure(); if (!el || el.hidden) return;
  const [rob, pol] = el.querySelectorAll('.gw-side');
  rob.classList.toggle('me', role === 'robber'); pol.classList.toggle('me', role === 'police');
  rob.querySelector('.gw-pips').textContent = pips(game.robbed, game.goal);
  pol.querySelector('.gw-pips').textContent = pips(game.strikes, game.L.T.jail);
  let hint;
  const need = game.L.T.rams;
  if (role === 'robber') hint = game.robberBag ? `Follow the red line! Rammed ${game.ramCount}/${need}` : 'Follow the red line to the bag';
  else hint = game.robberBag ? `Ram him! ${game.ramCount}/${need}` : 'Patrol the town - wait for the alarm';
  el.querySelector('.gw-hint').textContent = hint;
  if (bagEl) { bagEl.hidden = !(role === 'robber' && game.robberBag); bagEl.querySelector('span').textContent = `${game.ramCount}/${need}`; }
  const on = game.alarm && !game.over;
  siren.hidden = !on;
  if (on) siren.textContent = role === 'police' ? 'Robbery in progress!' : 'Alarm! The police are coming';
}

/** A big word in the middle of the screen for a moment. */
export function getawayPop(text, ms = 1600) {
  ensure(); if (!pop) return;
  pop.textContent = text; pop.hidden = false; clearTimeout(popTimer); popTimer = setTimeout(() => { pop.hidden = true; }, ms);
}

export function hideGetawayResult() { if (card) card.hidden = true; }

let keyHandler = null;
/** The result card. `info` = { title, lines[], nextRole } ; the buttons are Play again (the sides swap), Watch replay and Menu. */
export function showGetawayResult(info, onAgain, onMenu, onReplay) {
  ensure(); if (!card) return;
  card.innerHTML = `<h2></h2>${info.lines.map(() => '<div class="gw-line"></div>').join('')}<div class="gw-btns"><button class="again"></button>${onReplay ? '<button class="alt replay">Watch replay</button>' : ''}<button class="alt menu">Menu (Esc)</button></div>`;
  card.querySelector('h2').textContent = info.title;
  card.querySelectorAll('.gw-line').forEach((n, i) => { n.textContent = info.lines[i]; });
  card.querySelector('.again').textContent = info.again || 'Play again (Enter)';
  card.querySelector('.again').onclick = () => { card.hidden = true; onAgain(); };
  const rp = card.querySelector('.replay'); if (rp) rp.onclick = () => { card.hidden = true; onReplay(); };
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

// ------------------------------------------------------------------------------------------------ the street map
let mapBase = null;
function baseMap(L, w, h) {
  const sc = Math.min((w - 12) / L.W, (h - 12) / L.D), off = document.createElement('canvas'); off.width = w; off.height = h;
  const g = off.getContext('2d'), X = (x) => w / 2 + x * sc, Z = (z) => h / 2 + z * sc;
  g.fillStyle = '#23283a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4a4f66'; g.fillRect(X(-L.W / 2), Z(-L.D / 2), L.W * sc, L.D * sc);
  g.fillStyle = '#1a1e2c';
  for (const b of L.blocks) g.fillRect(X(b.cx - b.hx), Z(b.cz - b.hz), b.hx * 2 * sc, b.hz * 2 * sc);
  return { L, w, h, sc, off, X, Z };
}

/**
 * Draw the map. Each side sees what it should: the robber sees the safehouse, the banks' bags and any police car close by; the police see the banks
 * and any bag lying loose, but the robber only while there is a robbery in progress (while he has a bag), and never the safehouse. `line` is the satnav route to draw.
 * `me` and `foe` are the two cars; `t` is a clock in seconds, for the flashing.
 */
export function drawGetawayMap(game, role, me, foe, t = 0, line = null, cops = null) {
  const c = canvas(); if (!c) return;
  const L = game.L;
  if (!mapBase || mapBase.L !== L || mapBase.w !== c.width || mapBase.h !== c.height) mapBase = baseMap(L, c.width, c.height);
  const { off, X, Z, sc } = mapBase, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height); g.drawImage(off, 0, 0);
  const flash = 0.5 + 0.5 * Math.sin(t * 8);
  // banks: gold when the money is still there, a dim outline when it has been taken
  for (const bank of L.banks) { g.fillStyle = '#6b5a24'; g.fillRect(X(bank.door.x) - 4, Z(bank.door.z) - 3, 8, 6); }          // every bank looks the same: nobody knows which has the bag
  for (const b of game.bags) {
    if (b.state === 'home' && role === 'robber') { g.fillStyle = '#ffd23a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.fillRect(X(b.x) - 5, Z(b.z) - 5, 10, 10); g.strokeRect(X(b.x) - 5, Z(b.z) - 5, 10, 10); }       // the robber sees where the bag is
  }
  if (line && line.length > 1) {                                   // the satnav line
    g.strokeStyle = 'rgba(255,59,48,0.7)'; g.lineWidth = 1.5; g.lineJoin = 'round'; g.beginPath(); line.forEach((p, i) => { if (i) g.lineTo(X(p.x), Z(p.z)); else g.moveTo(X(p.x), Z(p.z)); }); g.stroke();
  }
  if (role === 'robber') {                                         // the safehouse
    const s = game.safehouse, x = X(s.x), y = Z(s.z);
    g.fillStyle = '#5dff8a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath(); g.fill(); g.stroke();
  }
  const car = (p, colour) => {
    if (!p) return; const x = X(p.pos.x), y = Z(p.pos.z), l = Math.hypot(p.az.x, p.az.z) || 1, dx = p.az.x / l, dz = p.az.z / l;
    g.fillStyle = colour; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + dx * 10, y + dz * 10); g.lineTo(x - dx * 6 - dz * 6, y - dz * 6 + dx * 6); g.lineTo(x - dx * 6 + dz * 6, y - dz * 6 - dx * 6); g.closePath(); g.fill(); g.stroke();
  };
  if (role === 'police') {
    if (game.alarm && foe) {                                       // robbery in progress: the robber shows up, flashing
      const x = X(foe.pos.x), y = Z(foe.pos.z);
      g.fillStyle = `rgba(255,60,50,${0.35 + 0.35 * flash})`; g.beginPath(); g.arc(x, y, 13, 0, 7); g.fill();
      g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke();
    }
    car(me, '#5aa0ff');
  } else {
    for (const fc of (cops && cops.length ? cops : foe ? [foe] : [])) if (Math.hypot(fc.pos.x - me.pos.x, fc.pos.z - me.pos.z) < 70) { const x = X(fc.pos.x), y = Z(fc.pos.z); g.fillStyle = `rgba(80,140,255,${0.5 + 0.5 * flash})`; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke(); }
    car(me, '#e8392c');
  }
}

/** The compass: the dial turns so North (the top of the map) is where it really is from the way the car faces (`fx`, `fz` = the car's forward direction). */
export function getawayCompass(fx, fz) {
  if (!compass || compass.hidden) return;
  const cross = fx * -1 - fz * 0, dot = fz * -1;          // north is (0, -1): angle from the car's heading to north, clockwise
  compass.firstChild.style.transform = `rotate(${(Math.atan2(cross, dot) * 180 / Math.PI).toFixed(1)}deg)`;
}
