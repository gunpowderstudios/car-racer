// Fifth damage-zone UI and upside-down roof damage.
// Loaded before main.js creates the Hud/Derby, so the centre damage panel and the
// roof-contact behaviour are installed before a race starts.
import { Hud } from './hud.js';
import { Derby } from './derby.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const originalSetDamage = Hud.prototype.setDamage;

function ensureRoofHud(hud) {
  if (hud.dz?.roof && hud.dt?.roof) return;
  const svg = document.getElementById('dmg-svg');
  if (!svg) return;

  let roof = document.getElementById('dz-roof');
  if (!roof) {
    roof = svg.querySelector('.cabin');
    if (roof) {
      roof.id = 'dz-roof';
      roof.classList.remove('cabin');
      roof.classList.add('dz');
    }
  }

  let text = document.getElementById('dt-roof');
  if (!text) {
    text = document.createElementNS(SVG_NS, 'text');
    text.id = 'dt-roof';
    text.setAttribute('class', 'dt sm');
    text.setAttribute('x', '60');
    text.setAttribute('y', '85');
    text.textContent = '100';
    svg.appendChild(text);
  }

  svg.setAttribute('aria-label', 'Damage to the front, rear, left, right and roof of your car');
  hud.dz.roof = roof;
  hud.dt.roof = text;
}

Hud.prototype.setDamage = function setDamageWithRoof(health, hitZone = null) {
  ensureRoofHud(this);
  return originalSetDamage.call(this, health, hitZone);
};

// The rigid-body ground contact already stops a car physically on its roof, but a gentle
// roll can settle there without producing a large enough one-frame impact event to remove HP.
// Treat sustained, genuinely upside-down contact as roof crush instead. This also makes the
// centre damage panel visibly useful when the player ends up resting on the roof.
const originalDerbyStep = Derby.prototype.step;
Derby.prototype.step = function stepWithRoofCrush(dt, barrels = null) {
  const result = originalDerbyStep.call(this, dt, barrels);

  if (!this.enabled || !this.fighters) return result;
  for (const f of this.fighters) {
    if (!f || f.gone || f.wrecked || !f.car) continue;
    const c = f.car;
    const restingOnRoof = c.ay.y < -0.35 && c.speed < 7;
    f._roofRestT = restingOnRoof ? (f._roofRestT || 0) + dt : 0;

    // Give a rollover a short grace period, then crush the roof slowly enough that the
    // player has time to reset the car. Rivals use the same rule for consistency.
    if (f._roofRestT > 0.75) this._damage(f, 'roof', 5 * dt, null);
  }
  return result;
};
