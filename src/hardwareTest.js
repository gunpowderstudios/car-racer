// "Test my hardware": a small live panel (the same numbers as adding ?perf to the address) with a plain-English verdict,
// and a one-tap switch to Low graphics. It stays on while you drive, so the figures are for real play, not the menu.
let panel = null, timer = 0, samples = [];

const CSS = `#hw-test{position:fixed;right:10px;bottom:10px;z-index:10050;width:min(340px,calc(100vw - 20px));box-sizing:border-box;padding:12px 14px;border-radius:12px;background:rgba(18,16,28,.94);color:#f4efe4;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18)}
#hw-test h3{margin:0 0 6px;font-size:16px}#hw-test .hw-verdict{font-weight:700;margin:6px 0 8px}#hw-test .ok{color:#8fe388}#hw-test .meh{color:#ffd166}#hw-test .bad{color:#ff7a6b}
#hw-test table{border-collapse:collapse;width:100%}#hw-test td{padding:1px 0;vertical-align:top}#hw-test td:first-child{opacity:.7;padding-right:10px;white-space:nowrap}
#hw-test .hw-now{margin:2px 0 8px;padding:6px 8px;border-radius:8px;background:rgba(80,200,90,.16);border:1px solid rgba(120,230,120,.55);color:#b8f5b0;font-weight:700}#hw-test .hw-graph{margin:8px 0 2px}#hw-test .hw-graph select{width:100%;margin-bottom:4px;background:#2a1d4a;color:#f4efe4;border:1px solid rgba(255,255,255,.3);border-radius:6px;padding:3px 6px;font:inherit}#hw-test .hw-graph canvas{width:100%;height:78px;display:block;border-radius:6px;background:rgba(255,255,255,.06)}#hw-test .hw-cap{opacity:.75;font-size:12px;margin-top:3px}#hw-test .hw-lbl{margin:10px 0 4px;opacity:.75;font-size:12px}
#hw-test .hw-btns{display:grid;grid-template-columns:1fr 1fr;gap:6px}#hw-test .hw-btns button{padding:6px 8px;border-radius:8px;border:1px solid transparent;font:inherit;font-weight:700;cursor:pointer;background:#f3c64b;color:#2a1d4a}#hw-test .hw-btns button small{display:block;font-weight:400;opacity:.8}#hw-test .hw-btns button.cur{background:#4cbf5a;color:#0c2a10;cursor:default}#hw-test .hw-btns button.cls{grid-column:1/-1;background:transparent;color:#f4efe4;border-color:rgba(255,255,255,.3)}#hw-test .hw-note{opacity:.7;font-size:12px;margin:8px 0 0}`;

const SERIES = [
  { id: 'fps', label: 'Speed (frames per second)', get: (s) => s.fps, fmt: (v) => `${v.toFixed(0)} fps`, goodHigh: true },
  { id: 'heap', label: 'Memory used by the game (MB)', get: (s) => s.heapMB, fmt: (v) => `${v.toFixed(0)} MB` },
  { id: 'calls', label: 'Draw calls (how much is on screen)', get: (s) => s.calls, fmt: (v) => `${v.toFixed(0)} calls` },
  { id: 'tris', label: 'Triangles (how detailed it is)', get: (s) => s.tris / 1000, fmt: (v) => `${v.toFixed(0)}k` },
  { id: 'gpu', label: 'Models and textures held (graphics memory)', get: (s) => s.geo + s.tex, fmt: (v) => `${v.toFixed(0)} items` },
];
const MAXPTS = 240;                                                  // one reading every quarter of a second: the last minute
let hist = [], booms = [], lastAlive = -1, sampleTimer = 0, which = 'fps';

/** Draw one series as a filled line, with its highest and lowest points marked and a tick wherever a barrel went off. */
export function drawGraph(cv, values, ticks, ser) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1), w = Math.max(10, Math.round((cv.clientWidth || 300) * dpr)), h = Math.round(78 * dpr);
  if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
  if (values.length < 2) return { min: 0, max: 0 };
  let mn = Infinity, mx = -Infinity, iMin = 0, iMax = 0;
  values.forEach((v, i) => { if (v < mn) { mn = v; iMin = i; } if (v > mx) { mx = v; iMax = i; } });
  const pad = 8 * dpr, span = Math.max(1e-6, mx - mn), X = (i) => (i / (MAXPTS - 1)) * (w - 2 * pad) + pad + (MAXPTS - values.length) / (MAXPTS - 1) * (w - 2 * pad), Y = (v) => h - pad - ((v - mn) / span) * (h - 2 * pad);
  g.strokeStyle = 'rgba(255,170,60,.7)'; g.lineWidth = 1 * dpr;
  ticks.forEach((t) => { if (t >= 0 && t < values.length) { const x = X(t); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } });      // a barrel went off here
  g.beginPath(); values.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  g.strokeStyle = '#7fe08a'; g.lineWidth = 2 * dpr; g.lineJoin = 'round'; g.stroke();
  g.lineTo(X(values.length - 1), h); g.lineTo(X(0), h); g.closePath(); g.fillStyle = 'rgba(127,224,138,.18)'; g.fill();
  const dot = (i, c) => { g.beginPath(); g.arc(X(i), Y(values[i]), 3.5 * dpr, 0, Math.PI * 2); g.fillStyle = c; g.fill(); };
  if (span > 1e-6) { dot(iMax, ser.goodHigh ? '#8fe388' : '#ff7a6b'); dot(iMin, ser.goodHigh ? '#ff7a6b' : '#8fe388'); }
  return { min: mn, max: mx };
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Plain-English summary from the frame rates seen in the last few seconds. */
export function verdict(avg, low) {
  if (!(avg > 0)) return { cls: 'meh', text: 'Measuring...' };
  if (avg >= 55 && low >= 40) return { cls: 'ok', text: 'Smooth: this computer copes fine.' };
  if (avg >= 30) return { cls: 'meh', text: 'Playable, but not smooth. Low graphics should help.' };
  return { cls: 'bad', text: 'Struggling. Switch to Low graphics.' };
}

export function closeHardwareTest() { clearInterval(timer); clearInterval(sampleTimer); timer = sampleTimer = 0; hist = []; booms = []; if (panel) panel.remove(); panel = null; samples = []; }

/** getStats() -> { tier, fps, res, maxRes, physicsHz, shadows, mirror, rivals, calls, tris, geo, tex, gpu, cores, memory, screen, loadMs, quality }; setQuality(name) switches and reloads. */
export function openHardwareTest(getStats, setQuality) {
  if (panel) { closeHardwareTest(); return; }
  if (!document.getElementById('hw-test-css')) { const st = document.createElement('style'); st.id = 'hw-test-css'; st.textContent = CSS; document.head.appendChild(st); }
  panel = document.createElement('div'); panel.id = 'hw-test'; panel.setAttribute('role', 'status');
  panel.innerHTML = '<h3>Test my hardware</h3><div class="hw-live"></div><div class="hw-graph"><select aria-label="What to graph"></select><canvas></canvas><div class="hw-cap"></div></div><div class="hw-ctl"></div>';
  document.body.appendChild(panel); samples = [];
  const live = panel.querySelector('.hw-live'), ctl = panel.querySelector('.hw-ctl'); let built = false;
  const draw = () => {
    if (!panel) return;
    const s = getStats(); if (s.fps > 0) samples.push(s.fps); if (samples.length > 20) samples.shift();
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0, low = samples.length ? Math.min(...samples) : 0, v = verdict(avg, low);
    const row = (k, val) => `<tr><td>${k}</td><td>${esc(val)}</td></tr>`;
    const setting = ['low', 'medium', 'high'].includes(s.quality) ? s.quality : 'auto', auto = setting === 'auto', tn = s.tier[0].toUpperCase() + s.tier.slice(1);
    live.innerHTML = `<div class="hw-now">Running now: ${esc(tn)} graphics (${auto ? 'chosen automatically' : 'chosen by you'})</div><div class="hw-verdict ${v.cls}">${esc(v.text)}</div><table>` +
      row('Speed', `${s.fps.toFixed(0)} fps now, ${avg.toFixed(0)} average, ${low.toFixed(0)} lowest (last 10 s)`) +
      row('Picture sharpness', `${(s.res / s.maxRes * 100).toFixed(0)}% of full (${s.res.toFixed(2)}x)`) +
      row('Physics', `${s.physicsHz} Hz`) +
      row('Shadows / mirror', `${s.shadows ? 'on' : 'off'} / ${s.mirror ? 'on' : 'off'}`) +
      row('Cars racing', s.rivals) +
      row('Drawing load', `${s.calls} draw calls, ${(s.tris / 1000).toFixed(0)}k triangles`) +
      row('Models / textures', `${s.geo} / ${s.tex}`) +
      row('Graphics chip', s.gpu || 'unknown') +
      row('Processor / memory', `${s.cores || '?'} cores${s.memory ? `, ${s.memory}+ GB` : ''}`) +
      row('Screen', s.screen) + '</table>';
    if (built) return;                                                           // the buttons are made once: rebuilding them twice a second could swallow a click
    built = true;
    const choice = (q, label, note) => `<button type="button" data-q="${q}" class="${q === setting ? 'cur' : ''}" ${q === setting ? 'disabled' : ''}>${q === setting ? '&#10003; ' : ''}${label}<small>${note}</small></button>`;
    ctl.innerHTML = '<div class="hw-lbl">Switch graphics (green = in use). Changing it restarts the game, because the sharpness, shadows and smoothing are set when it loads.</div><div class="hw-btns">' +
      choice('auto', 'Automatic', auto ? `now ${tn}` : 'let the game pick') + choice('low', 'Low', 'fastest, plainest') + choice('medium', 'Medium', 'in between') + choice('high', 'High', 'best looking') +
      '<button type="button" data-q="close" class="cls">Close</button></div><p class="hw-note">Keep this open while you drive for real numbers. Same figures as adding ?perf to the web address.</p>';
    ctl.querySelectorAll('button:not([disabled])').forEach((b) => { b.onclick = () => { if (b.dataset.q === 'close') closeHardwareTest(); else { closeHardwareTest(); setQuality(b.dataset.q); } }; });
  };
  const sel = panel.querySelector('.hw-graph select'), cv = panel.querySelector('canvas'), cap = panel.querySelector('.hw-cap');
  sel.innerHTML = SERIES.map((x) => `<option value="${x.id}">${x.label}</option>`).join(''); sel.value = which;
  const paint = () => {
    const ser = SERIES.find((x) => x.id === which) || SERIES[0], vals = hist.map((p) => p[ser.id]);
    if (ser.id === 'heap' && !(vals.some((v) => v > 0))) { cap.textContent = 'This browser does not report memory use (Chrome and Edge do). Pick another line.'; drawGraph(cv, [], [], ser); return; }
    const r = drawGraph(cv, vals, booms, ser);
    cap.textContent = vals.length > 1 ? `Last minute: lowest ${ser.fmt(r.min)}, highest ${ser.fmt(r.max)}. Orange lines are barrels going off; dots mark the peak and the dip.` : 'Collecting...';
  };
  sel.onchange = () => { which = sel.value; paint(); };
  const sample = () => {
    if (!panel) return;
    const s = getStats(), pt = {}; for (const x of SERIES) pt[x.id] = x.get(s);
    if (lastAlive >= 0 && s.alive < lastAlive) booms.push(hist.length);       // some barrels went off since the last reading
    lastAlive = s.alive; hist.push(pt);
    if (hist.length > MAXPTS) { hist.shift(); for (let i = booms.length - 1; i >= 0; i--) { booms[i]--; if (booms[i] < 0) booms.splice(i, 1); } }
    paint();
  };
  lastAlive = -1; sample(); sampleTimer = setInterval(sample, 250);
  draw(); timer = setInterval(draw, 500);
}
