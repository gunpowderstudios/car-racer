// Fifth damage-zone UI: turn the existing centre/cabin shape into the roof health panel.
// Loaded before main.js creates the Hud, so the first damage update already knows how to draw it.
import { Hud } from './hud.js';

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
