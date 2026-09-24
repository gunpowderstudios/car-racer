// DOM heads-up display: speed, gear, RPM strip, lap timing, minimap, banner messages.
const $ = (id) => document.getElementById(id);

export const fmtTime = (t) => {
  if (t == null || !Number.isFinite(t)) return '--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

export class Hud {
  constructor() {
    this.el = { speed: $('speed'), unit: $('unit'), gear: $('gear'), rpm: $('rpm'), lapNum: $('lap-num'), lapTime: $('lap-time'), lapBest: $('lap-best'),
      banner: $('banner'), hand: $('hand-flag'), map: $('minimap'), hints: $('hints'), debug: $('debug') };
    for (let i = 0; i < 24; i++) this.el.rpm.appendChild(document.createElement('i'));
    this.segs = [...this.el.rpm.children];
    this.kmh = false; this._bt = 0; this._last = {};
    this.mapCache = null;
  }
  setUnits(kmh) { this.kmh = kmh; this.el.unit.textContent = kmh ? 'km/h' : 'mph'; }
  hideHintsLater(ms = 9000) { this.el.hints.classList.remove('fade'); clearTimeout(this._ht); this._ht = setTimeout(() => this.el.hints.classList.add('fade'), ms); }

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
    if (info) {
      const lt = info.lap > 0 ? `Lap ${info.lap}` : 'Get to the line';
      if (lt !== this._last.lap) { this.el.lapNum.textContent = lt; this._last.lap = lt; }
      const tm = fmtTime(info.time ?? 0);
      if (tm !== this._last.time) { this.el.lapTime.textContent = info.time == null ? '0:00.0' : tm; this._last.time = tm; }
      const bt = info.best != null ? `Best ${fmtTime(info.best)}` : 'No best lap yet';
      if (bt !== this._last.best) { this.el.lapBest.textContent = bt; this._last.best = bt; }
    }
  }

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

  drawMap(car) {
    const m = this.mapCache; if (!m) return;
    const g = this.el.map.getContext('2d');
    g.clearRect(0, 0, m.W, m.H); g.drawImage(m.off, 0, 0);
    const x = (car.pos.x - m.cx) * m.sc + m.W / 2, y = (car.pos.z - m.cz) * m.sc + m.H / 2;
    const fx = car.az.x, fz = car.az.z, l = Math.hypot(fx, fz) || 1, dx = fx / l, dz = fz / l;
    g.fillStyle = '#e8392c'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + dx * 11, y + dz * 11); g.lineTo(x - dx * 7 - dz * 7, y - dz * 7 + dx * 7); g.lineTo(x - dx * 7 + dz * 7, y - dz * 7 - dx * 7); g.closePath(); g.fill(); g.stroke();
  }
}
