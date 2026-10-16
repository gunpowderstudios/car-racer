// Roof damage added a fifth health zone, but older visual-effect code only knows
// front/back/left/right local positions. If an effect asks Vehicle.toWorld() with
// no local point (currently when Roof is the weakest zone), use the centre of the
// roof rather than crashing the render loop.
import { Vehicle } from './vehicle.js';
import { V3 } from './math.js';

const roofLocal = new V3(0, 0.72, 0);
const originalToWorld = Vehicle.prototype.toWorld;

Vehicle.prototype.toWorld = function toWorldWithRoofFallback(local, out) {
  return originalToWorld.call(this, local || roofLocal, out);
};
