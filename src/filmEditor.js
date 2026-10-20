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

export function createFilmEditor({ $, getPlayer, getT, seek, sound, frameOn, setFrame, onMake, onPreview, onClose }) {
  const el = {
    root: $('film'), start: $('fi-start'), end: $('fi-end'), trim: $('fi-trim'), cam: $('fi-cam'), cutView: $('fi-cut-view'), cutAdd: $('fi-cut-add'), cuts: $('fi-cuts'),
    music: $('fi-music'), file: $('fi-file'), vol: $('fi-vol'), title: $('fi-title'), credit: $('fi-credit'), filter: $('fi-filter'), tv: $('fi-tv'),
    make: $('fi-make'), quick: $('fi-quick'), preview: $('fi-preview'), close: $('fi-close'),
  };
  const S = { start: 0, end: 0, baseView: -1, cuts: [], music: 'none', file: null, vol: 0.7, title: '', credit: '', filter: 'none' };
  let open = false;

  const dur = () => { const p = getPlayer(); return Math.max(0.001, p.duration); };
  const toT = (v) => getPlayer().t0 + (v / 1000) * dur();
  const drawTrim = () => { el.trim.textContent = `From ${fmt(S.start - getPlayer().t0)} to ${fmt(S.end - getPlayer().t0)} - a film of ${fmt(S.end - S.start)}`; };
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
  const sync = () => {
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
