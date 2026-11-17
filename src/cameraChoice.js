import { ChaseCamera } from './carVisual.js';

// The C key/button rotates through Chase -> High -> Bonnet -> Helicopter -> (Overhead, in the arenas only) -> Chase. (The Bumper view, mode 2, is switched off for now: the
// cycle steps over it and its code stays.) The bonnet view needs a vehicle with a bonnet (see bonnetCam.js): a bus, motorhome or campervan skips it.
// The Overhead view (mode 5) looks straight down on the arena from above, like a derby seen from the stands, and only exists where ChaseCamera.arena is set.
ChaseCamera.prototype.cycle = function cycleCameras() {
  let m = this.mode;
  do { m = (m + 1) % 6; } while (m === 2 || (m === 3 && !this.bonnet) || (m === 5 && !this.arena));
  this.mode = m;
  this.ready = false;
  return ['Chase', 'High', 'Bumper', 'Bonnet', 'Helicopter', 'Overhead'][this.mode];
};
