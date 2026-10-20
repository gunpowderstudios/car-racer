// The film editor: what goes into the movie made from a replay - which part (trim), which camera when (cuts), a soundtrack, a title card and
// credit, and a look (sepia, black and white, 1970s). It only holds the choices and draws the titles/look; replayMode.js makes the movie.
import { VIEWS } from './replay.js';

const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 9.95 ? '0' : ''}${r.toFixed(1)}`; };
export const FILTERS = {
  none: { css: '', label: 'Normal' },
  sepia: { css: 'sepia(0.85) contrast(1.05)', label: 'Sepia' },
  bw: { css: 'grayscale(1) contrast(1.1)', label: 'Black and white' },
  seventies: { css: 'sepia(0.35) saturate(1.35) contrast(1.08)', label: '1970s TV', vignette: true },
};

const RATE_KEY = 'cr.filmrate';
const store = { get() { try { return JSON.parse(localStorage.getItem(RATE_KEY)) || {}; } catch { return {}; } }, set(v) { try { localStorage.setItem(RATE_KEY, JSON.stringify(v)); } catch { /* private window */ } } };
const secs = (n) => { n = Math.max(1, Math.round(n)); return n < 90 ? `${n} s` : `${Math.round(n / 6) / 10} min`; };

export function createFilmEditor({ $, getPlayer, getT, seek, sound, frameOn, setFrame, onMake, onPreview, onClose }) {
  const el = {
    root: $('film'), start: $('fi-start'), end: $('fi-end'), trim: $('fi-trim'), cam: $('fi-cam'), cutView: $('fi-cut-view'), cutAdd: $('fi-cut-add'), cuts: $('fi-cuts'),
    music: $('fi-music'), file: $('fi-file'), vol: $('fi-vol'), title: $('fi-title'), credit: $('fi-credit'), filter: $('fi-filter'), tv: $('fi-tv'),
    make: $('fi-make'), auto: $('fi-auto'), size: $('fi-size'), est: $('fi-est'), quick: $('fi-quick'), preview: $('fi-preview'), close: $('fi-close'),
  };
  const S = { start: 0, end: 0, baseView: -1, cuts: [], music: 'none', file: null, vol: 0.7, title: '', credit: '', filter: 'none', size: 'standard' };
  let open = false;

  const dur = () => { const p = getPlayer(); return Math.max(0.001, p.duration); };
  const toT = (v) => getPlayer().t0 + (v / 1000) * dur();
  const drawTrim = () => { drawEst(); el.trim.textContent = `From ${fmt(S.start - getPlayer().t0)} to ${fmt(S.end - getPlayer().t0)} - a film of ${fmt(S.end - S.start)}`; };
  const drawCuts = () => {
    el.cuts.textContent = '';
    S.cuts.sort((a, b) => a.t - b.t);
    for (const [i, c] of S.cuts.entries()) {
      const row = document.createElement('div'), x = document.createElement('button');
      row.textContent = `${fmt(c.t - getPlayer().t0)}  →  ${VIEWS[c.view]} camera `;
      x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove this cut');
      x.onclick = () => { S.cuts.splice(i, 1); drawCuts(); };
      row.append(x); el.cuts.append(row);
    }
  };
  /** How fast the film is made on this device: film seconds made per second of waiting, learnt from earlier quick saves (a guess until then). */
  const rateOf = (size) => store.get()[size] || (size === 'small' ? 2.2 : 1.4);
  const drawEst = () => {
    const len = Math.max(1, S.end - S.start);
    el.est.textContent = `Watching it being made takes about ${secs(len + 2)}. Quick save (no sound) should take about ${secs(len / rateOf(S.size) + 2)}${store.get()[S.size] ? '' : ' (a guess until you have tried it once)'}.`;
  };
  const sync = () => {
    el.size.value = S.size; drawEst();
    el.title.value = S.title; el.credit.value = S.credit; el.filter.value = S.filter; el.vol.value = String(Math.round(S.vol * 100));
    el.music.value = S.music; el.cam.value = String(S.baseView); el.tv.checked = frameOn();
    const p = getPlayer(); el.start.value = String(Math.round((S.start - p.t0) / dur() * 1000)); el.end.value = String(Math.round((S.end - p.t0) / dur() * 1000));
    drawTrim(); drawCuts();
  };

  el.start.oninput = () => { S.start = Math.min(toT(+el.start.value), S.end - 1); if (S.start >= S.end - 1) { S.start = Math.max(getPlayer().t0, S.end - 1); el.start.value = String(Math.round((S.start - getPlayer().t0) / dur() * 1000)); } seek(S.start); drawTrim(); };
  el.end.oninput = () => { S.end = Math.max(toT(+el.end.value), S.start + 1); if (S.end > getPlayer().t1) S.end = getPlayer().t1; el.end.value = String(Math.round((S.end - getPlayer().t0) / dur() * 1000)); seek(S.end); drawTrim(); };
  el.cam.onchange = () => { S.baseView = +el.cam.value; };
  el.cutAdd.onclick = () => { const t = Math.min(S.end, Math.max(S.start, getT())); S.cuts.push({ t, view: +el.cutView.value }); drawCuts(); };
  el.music.onchange = () => { if (el.music.value === 'file') { el.file.click(); if (!S.file) el.music.value = S.music; else S.music = 'file'; } else S.music = el.music.value; };
  el.file.onchange = () => { const f = el.file.files && el.file.files[0]; if (!f) { el.music.value = S.music; return; } S.file = f; S.music = 'file'; el.music.value = 'file'; el.music.options[el.music.options.length - 1].textContent = 'My file: ' + f.name.slice(0, 28); };
  el.vol.oninput = () => { S.vol = +el.vol.value / 100; };
  el.title.oninput = () => { S.title = el.title.value.slice(0, 40); };
  el.credit.oninput = () => { S.credit = el.credit.value.slice(0, 40); };
  el.filter.onchange = () => { S.filter = FILTERS[el.filter.value] ? el.filter.value : 'none'; };
  el.size.onchange = () => { S.size = el.size.value === 'small' ? 'small' : 'standard'; drawEst(); };
  el.auto.onclick = () => onMake('auto');
  el.tv.onchange = () => setFrame(el.tv.checked);
  el.preview.onclick = () => onPreview(S.start, S.end);
  el.make.onclick = () => onMake('live');
  el.quick.onclick = () => onMake('quick');
  el.close.onclick = () => api.close();

  const api = {
    get isOpen() { return open; },
    state: S,
    open() {
      const p = getPlayer(); S.start = p.t0; S.end = p.t1; S.cuts = [];
      open = true; el.root.hidden = false; sync();
    },
    close() { if (!open) return; open = false; el.root.hidden = true; onClose?.(); },
    /** Which camera (an index into VIEWS) the film wants at replay time `t`, or -1 to leave it as it is. */
    viewAt(t) {
      let v = S.baseView;
      for (const c of S.cuts) if (c.t <= t) v = c.view;
      return v;
    },
    size() { return S.size; },
    /** Remember how fast a quick save went (film seconds per second spent), so the next estimate is about right. */
    learn(filmSeconds, wallSeconds) {
      if (!(filmSeconds > 2 && wallSeconds > 0.5)) return;
      const all = store.get(), r = filmSeconds / wallSeconds; all[S.size] = Math.round((all[S.size] ? all[S.size] * 0.5 + r * 0.5 : r) * 100) / 100; store.set(all);
    },
    /** "Make it for me": find the liveliest stretch of the replay (wrecks and big hits count most), cut between the cameras, add the game theme and a title. */
    autoCut(len = 18) {
      const p = getPlayer(), W = { wreck: 6, hit: 3, prop: 1.2, dent: 0.6 };
      const t0 = p.t0, t1 = p.t1, L = Math.min(len, t1 - t0);
      let best = t0, top = -1;
      for (let a = t0; a + L <= t1 + 0.001; a += 0.5) {
        let sc = 0; for (const e of p.between(a - 0.001, a + L)) sc += W[e.type] || 0;
        sc -= Math.abs(a - (t1 - L)) * 0.002;            // (a tiny nudge towards the end, where the race is decided, when it is a tie)
        if (sc > top) { top = sc; best = a; }
      }
      S.start = best; S.end = Math.min(t1, best + L); S.cuts = []; S.baseView = 0;
      const order = [1, 2, 0, 1];
      for (let k = 1, t = S.start + 4.5; t < S.end - 2; k++, t += 4.5) S.cuts.push({ t, view: order[(k - 1) % order.length] });
      S.music = 'theme'; S.vol = 0.7; S.filter = 'none'; if (!S.title) S.title = 'Highlights';
      sync();
    },
    trim() { return { start: S.start, end: S.end }; },
    /** The picture filter as CSS (for canvas ctx.filter), '' for none. */
    filterCss() { return FILTERS[S.filter]?.css || ''; },
    /** The music for the film: { buffer, vol } (decoded now), or null. */
    async musicClip() {
      if (S.music === 'theme' && sound.buf && sound.buf.music) return { buffer: sound.buf.music, vol: S.vol };
      if (S.music === 'file' && S.file) { try { return { buffer: await sound.decode(await S.file.arrayBuffer()), vol: S.vol }; } catch { return { error: true }; } }
      return null;
    },
    /** Titles and the look, drawn over a finished frame: `secs` into a film that is `total` seconds long. */
    drawOver(ctx, w, h, secs, total) {
      const f = FILTERS[S.filter];
      if (f && f.vignette) {
        const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,8,0,0.55)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      const text = (str, y, size, alpha) => {
        ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${Math.round(size)}px Impact, "Arial Narrow", sans-serif`; ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.12;
        ctx.strokeStyle = '#7a1b10'; ctx.strokeText(str, w / 2, y, w * 0.9); ctx.fillStyle = '#ffd36a'; ctx.fillText(str, w / 2, y, w * 0.9); ctx.restore();
      };
      if (S.title && secs < 3.4) {
        const a = secs < 0.4 ? secs / 0.4 : secs > 2.7 ? (3.4 - secs) / 0.7 : 1;
        ctx.save(); ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#000'; ctx.fillRect(0, h * 0.38, w, h * 0.24); ctx.restore();
        text(S.title, h * 0.5, h * 0.1, a);
      }
      if (S.credit && secs > total - 3.4) {
        const left = total - secs, a = left > 2.7 ? (3.4 - left) / 0.7 : left < 0.5 ? Math.max(0, left / 0.5) : 1;
        text(S.credit, h * 0.86, h * 0.055, Math.max(0, a));
      }
    },
  };
  return api;
}
