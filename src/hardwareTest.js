// "Test my hardware": a small live panel (the same numbers as adding ?perf to the address) with a plain-English verdict,
// and a one-tap switch to Low graphics. It stays on while you drive, so the figures are for real play, not the menu.
let panel = null, timer = 0, samples = [];

const CSS = `#hw-test{position:fixed;right:10px;bottom:10px;z-index:10050;width:min(340px,calc(100vw - 20px));box-sizing:border-box;padding:12px 14px;border-radius:12px;background:rgba(18,16,28,.94);color:#f4efe4;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18)}
#hw-test h3{margin:0 0 6px;font-size:16px}#hw-test .hw-verdict{font-weight:700;margin:6px 0 8px}#hw-test .ok{color:#8fe388}#hw-test .meh{color:#ffd166}#hw-test .bad{color:#ff7a6b}
#hw-test table{border-collapse:collapse;width:100%}#hw-test td{padding:1px 0;vertical-align:top}#hw-test td:first-child{opacity:.7;padding-right:10px;white-space:nowrap}
#hw-test .hw-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#hw-test .hw-note{opacity:.7;font-size:12px;margin:8px 0 0}`;

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Plain-English summary from the frame rates seen in the last few seconds. */
export function verdict(avg, low) {
  if (!(avg > 0)) return { cls: 'meh', text: 'Measuring...' };
  if (avg >= 55 && low >= 40) return { cls: 'ok', text: 'Smooth: this computer copes fine.' };
  if (avg >= 30) return { cls: 'meh', text: 'Playable, but not smooth. Low graphics should help.' };
  return { cls: 'bad', text: 'Struggling. Switch to Low graphics.' };
}

export function closeHardwareTest() { clearInterval(timer); timer = 0; if (panel) panel.remove(); panel = null; samples = []; }

/** getStats() -> { tier, fps, res, maxRes, physicsHz, shadows, mirror, rivals, calls, tris, geo, tex, gpu, cores, memory, screen, loadMs, quality }; setQuality(name) switches and reloads. */
export function openHardwareTest(getStats, setQuality) {
  if (panel) { closeHardwareTest(); return; }
  if (!document.getElementById('hw-test-css')) { const st = document.createElement('style'); st.id = 'hw-test-css'; st.textContent = CSS; document.head.appendChild(st); }
  panel = document.createElement('div'); panel.id = 'hw-test'; panel.setAttribute('role', 'status');
  document.body.appendChild(panel); samples = [];
  const draw = () => {
    if (!panel) return;
    const s = getStats(); if (s.fps > 0) samples.push(s.fps); if (samples.length > 20) samples.shift();
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0, low = samples.length ? Math.min(...samples) : 0, v = verdict(avg, low);
    const row = (k, val) => `<tr><td>${k}</td><td>${esc(val)}</td></tr>`;
    panel.innerHTML = `<h3>Test my hardware</h3><div class="hw-verdict ${v.cls}">${esc(v.text)}</div><table>` +
      row('Speed', `${s.fps.toFixed(0)} fps now, ${avg.toFixed(0)} average, ${low.toFixed(0)} lowest (last 10 s)`) +
      row('Graphics', `${s.tier}${s.quality && s.quality !== 'auto' ? ' (chosen)' : ' (automatic)'}`) +
      row('Picture sharpness', `${(s.res / s.maxRes * 100).toFixed(0)}% of full (${s.res.toFixed(2)}x)`) +
      row('Physics', `${s.physicsHz} Hz`) +
      row('Shadows / mirror', `${s.shadows ? 'on' : 'off'} / ${s.mirror ? 'on' : 'off'}`) +
      row('Cars racing', s.rivals) +
      row('Drawing load', `${s.calls} draw calls, ${(s.tris / 1000).toFixed(0)}k triangles`) +
      row('Models / textures', `${s.geo} / ${s.tex}`) +
      row('Graphics chip', s.gpu || 'unknown') +
      row('Processor / memory', `${s.cores || '?'} cores${s.memory ? `, ${s.memory}+ GB` : ''}`) +
      row('Screen', s.screen) +
      `</table><div class="hw-btns"><button type="button" class="btn" data-q="low">Use Low graphics</button><button type="button" class="btn ghost" data-q="auto">Automatic</button><button type="button" class="btn ghost" data-q="close">Close</button></div>` +
      `<p class="hw-note">Keep this open while you drive for real numbers. Same figures as adding ?perf to the web address.</p>`;
    panel.querySelectorAll('button').forEach((b) => { b.onclick = () => { if (b.dataset.q === 'close') closeHardwareTest(); else { closeHardwareTest(); setQuality(b.dataset.q); } }; });
  };
  draw(); timer = setInterval(draw, 500);
}
