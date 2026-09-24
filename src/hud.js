// DOM heads-up display: speed, gear, RPM strip, lap timing, minimap, banner messages,
// and the destruction-derby score, damage chart and game-over card.
import { ZONES } from './damage.js';

const $ = (id) => document.getElementById(id);

export const fmtTime = (t) => {
  if (t == null || !Number.isFinite(t)) return '--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

export class Hud {
  constructor() {
    this.el = { speed: $('speed'), unit: $('unit'), gear: $('gear'), rpm: $('rpm'), lapNum: $('lap-num'), lapTime: $('lap-time'), lapBest: $('lap-best'),
      banner: $('banner'), hand: $('hand-flag'), map: $('minimap'), debug: $('debug'),
      boost: $('boost-bar'), boostFill: $('boost-fill'), ctlBoost: $('ctl-boost'), ctlHand: $('ctl-hand') };
    for (let i = 0; i < 24; i++) this.el.rpm.appendChild(document.createElement('i'));
    this.segs = [...this.el.rpm.children];
    this.kmh = false; this._bt = 0; this._last = {};
    this.mapCache = null;
    // destruction derby panels
    this.dz = {}; this.dt = {};
    for (const z of ZONES) { this.dz[z] = $('dz-' + z); this.dt[z] = $('dt-' + z); }
    this.d = { score: $('derby-score'), num: $('ds-score'), sub: $('ds-sub'), card: $('dmg-card'), feed: $('feed'), over: $('gameover') };
    this._flash = {};
  }
  setUnits(kmh) { this.kmh = kmh; this.el.unit.textContent = kmh ? 'km/h' : 'mph'; }

  banner(text, ms = 1400) {
    const b = this.el.banner; b.textContent = text; b.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), ms);
  }

  update(car, info) {
    const sp = car.speed * (this.kmh ? 3.6 : 2.23694);
    const s = String(Math.round(sp));
    if (s !== this._last.speed) { this.el.speed.textContent = s; this._last.speed = s; }
    const g = car.gear < 0 ? 'R' : String(car.gear);
    if (g !== this._last.gear) { this.el.gear.textContent = g; this._last.gear = g; }
    const on = Math.round(Math.min(1, (car.rpm - 900) / (6900 - 900)) * this.segs.length);
    if (on !== this._last.rpm) {
      this.segs.forEach((el, i) => { el.className = i < on ? 'on' + (i > 17 ? ' red' : i > 13 ? ' hot' : '') : ''; });
      this._last.rpm = on;
    }
    this.el.hand.classList.toggle('on', !!car.handbrake);
    this.el.ctlHand.classList.toggle('on', !!car.handbrake);
    const fuel = Math.round(car.boostFuel * 100);
    if (fuel !== this._last.fuel) { this.el.boostFill.style.width = fuel + '%'; this._last.fuel = fuel; }
    const bs = car.boosting ? 'on' : car.boostFuel < car.spec.boost.restart ? 'low' : '';
    if (bs !== this._last.bs) { this.el.boost.className = bs; this.el.ctlBoost.classList.toggle('on', bs === 'on'); this._last.bs = bs; }
    if (info) {
      const lt = info.lap > 0 ? `Lap ${info.lap}` : 'Get to the line';
      if (lt !== this._last.lap) { this.el.lapNum.textContent = lt; this._last.lap = lt; }
      const tm = fmtTime(info.time ?? 0);
      if (tm !== this._last.time) { this.el.lapTime.textContent = info.time == null ? '0:00.0' : tm; this._last.time = tm; }
      const bt = info.best != null ? `Best ${fmtTime(info.best)}` : 'No best lap yet';
      if (bt !== this._last.best) { this.el.lapBest.textContent = bt; this._last.best = bt; }
    }
  }

  // ------------------------------------------------------------ destruction derby
  /** Show or hide the score and damage panels (they only make sense in derby mode). */
  derbyMode(on) {
    this.d.score.hidden = !on; this.d.card.hidden = !on;
    if (!on) { this.d.feed.textContent = ''; this.hideGameOver(); }
    this._last.ds = this._last.dmg = null;
  }

  /** Score, wrecks and how many rivals are still running. */
  setScore(score, wrecked, rivals) {
    const k = score + '|' + wrecked + '|' + rivals;
    if (k === this._last.ds) return;
    this._last.ds = k;
    this.d.num.textContent = score.toLocaleString('en-GB');
    this.d.sub.textContent = `${wrecked} wrecked \u00b7 ${rivals} rivals`;
  }

  /** The four-part damage chart. `health` is a damage.js Health. */
  setDamage(health, hitZone = null) {
    const parts = [];
    for (const z of ZONES) parts.push(Math.round(health.frac(z) * 100));
    if (hitZone) { this._flash[hitZone] = performance.now() + 220; }
    const now = performance.now();
    const k = parts.join(',') + '|' + ZONES.map((z) => (this._flash[z] > now ? 1 : 0)).join('');
    if (k === this._last.dmg) return;
    this._last.dmg = k;
    ZONES.forEach((z, i) => {
      const pct = parts[i], el = this.dz[z];
      el.style.fill = pct <= 0 ? '#120a0a' : `hsl(${Math.round(pct * 1.15)} 78% ${pct < 30 ? 42 : 38}%)`;
      el.classList.toggle('hit', this._flash[z] > now);
      el.classList.toggle('low', pct > 0 && pct < 30);
      this.dt[z].textContent = pct <= 0 ? '\u2716' : String(pct);
    });
  }
  /** Whether a zone flash is still fading (so setDamage keeps being called until it is). */
  get flashing() { const n = performance.now(); return ZONES.some((z) => this._flash[z] > n); }

  /** A short "+100 Takedown" line that fades away by itself. */
  feed(text) {
    const li = document.createElement('div'); li.className = 'feed-item'; li.textContent = text;
    this.d.feed.appendChild(li);
    while (this.d.feed.children.length > 4) this.d.feed.firstChild.remove();
    setTimeout(() => li.remove(), 2600);
  }

  showGameOver({ score, takedowns, best, isBest, zone }) {
    const o = this.d.over;
    $('go-why').textContent = zone;
    $('go-score').textContent = score.toLocaleString('en-GB');
    $('go-kills').textContent = String(takedowns);
    $('go-best').textContent = isBest ? 'New best score!' : `Best ${best.toLocaleString('en-GB')}`;
    o.classList.toggle('best', !!isBest);
    o.hidden = false;
  }
  hideGameOver() { this.d.over.hidden = true; }

  buildMap(track) {
    const W = this.el.map.width, H = this.el.map.height, pad = 22;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < track.n; i++) { minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]); minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]); }
    const sc = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxZ - minZ || 1));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const g = off.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = 'rgba(246,217,176,.95)'; g.lineWidth = 6;
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= track.n; i += 3) {
      const k = i % track.n;
      const x = (track.px[k] - cx) * sc + W / 2, y = (track.pz[k] - cz) * sc + H / 2;
      if (track.gap[k]) { pen = false; continue; }
      if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#ffb31f'; const sx = (track.px[0] - cx) * sc + W / 2, sy = (track.pz[0] - cz) * sc + H / 2;
    g.beginPath(); g.arc(sx, sy, 6, 0, 7); g.fill();
    this.mapCache = { off, sc, cx, cz, W, H };
  }

  /** `others` (optional): [{ x, z, wreck }] for the rival cars. */
  drawMap(car, others) {
    const m = this.mapCache; if (!m) return;
    const g = this.el.map.getContext('2d');
    g.clearRect(0, 0, m.W, m.H); g.drawImage(m.off, 0, 0);
    if (others) {
      for (const o of others) {
        const ox = (o.x - m.cx) * m.sc + m.W / 2, oy = (o.z - m.cz) * m.sc + m.H / 2;
        if (o.wreck) { g.strokeStyle = 'rgba(20,12,12,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(ox - 4, oy - 4); g.lineTo(ox + 4, oy + 4); g.moveTo(ox + 4, oy - 4); g.lineTo(ox - 4, oy + 4); g.stroke(); }
        else { g.fillStyle = '#5ab8ff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(ox, oy, 5, 0, 7); g.fill(); g.stroke(); }
      }
    }
    const x = (car.pos.x - m.cx) * m.sc + m.W / 2, y = (car.pos.z - m.cz) * m.sc + m.H / 2;
    const fx = car.az.x, fz = car.az.z, l = Math.hypot(fx, fz) || 1, dx = fx / l, dz = fz / l;
    g.fillStyle = '#e8392c'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + dx * 11, y + dz * 11); g.lineTo(x - dx * 7 - dz * 7, y - dz * 7 + dx * 7); g.lineTo(x - dx * 7 + dz * 7, y - dz * 7 - dx * 7); g.closePath(); g.fill(); g.stroke();
  }
}
