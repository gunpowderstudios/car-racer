import './vehicleChoice.js';
import './vehicleDamage.js';
import './cameraChoice.js';
import './menuVehicle.js';
import './sparkEffects.js';
import './offTrackRespawn.js';
import './playerOffTrackRespawn.js?v=16.18';
import './gapEndCollision.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.18';
export const NOTE = 'Force browsers to load the fixed off-track reset module instead of a cached v16.16 copy that still referenced an undefined derby variable';
