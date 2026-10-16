import { ChaseCamera } from './carVisual.js';

// Keep the existing camera implementations untouched, but remove Bonnet from the cycle.
// The C key/button now rotates through Chase -> High -> Bumper -> Chase.
ChaseCamera.prototype.cycle = function cycleWithoutBonnet() {
  this.mode = (this.mode + 1) % 3;
  this.ready = false;
  return ['Chase', 'High', 'Bumper'][this.mode];
};
