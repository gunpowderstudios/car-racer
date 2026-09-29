// Make existing collision spark calls read more clearly without changing collision physics.
// main.js already emits sparks for AI/derby hits, walls and multiplayer impacts; this patch
// simply makes each requested spark a little brighter/longer and adds extra fragments on harder hits.
import { Particles } from './effects.js';

const originalSpark = Particles.prototype.spark;

function emit(particles, x, y, z, vx, vy, vz, lifeScale = 1, sizeScale = 1) {
  originalSpark.call(particles, x, y, z, vx, vy, vz);
  const s = particles.sparks[(particles.pi - 1 + particles.sparks.length) % particles.sparks.length];
  if (!s) return;
  const d = s.userData;
  d.life *= lifeScale;
  d.max = d.life;
  d.size *= sizeScale;
  s.material.opacity = 1;
}

Particles.prototype.spark = function enhancedCollisionSpark(x, y, z, vx, vy, vz) {
  const speed = Math.hypot(vx, vy, vz);

  // Always make the original spark slightly easier to see.
  emit(this, x, y, z, vx, vy, vz, 1.2, 1.08);

  // Medium impacts get a second fragment; hard hits get a third.
  if (speed > 3) {
    emit(this, x, y, z, vx * 0.8, vy * 0.9 + 0.6, vz * 0.8, 1.3, 0.95);
  }
  if (speed > 7) {
    emit(this, x, y, z, vx * 0.6, vy * 0.75 + 1.2, vz * 0.6, 1.4, 0.9);
  }
};
