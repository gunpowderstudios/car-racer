import './vehicleChoice.js';
import './vehicleDamage.js';
import './cameraChoice.js';
import './menuVehicle.js';
import './sparkEffects.js';
import './offTrackRespawn.js';
import './playerOffTrackRespawn.js?v=16.19';
import './gapEndCollision.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.19';
export const NOTE = 'Player off-track explosion now waits 2.5 seconds before triggering, while the old 1.4 second auto-respawn is held off so it cannot interfere';
