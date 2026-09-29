import './vehicleChoice.js';
import './vehicleDamage.js';
import './cameraChoice.js';
import './menuVehicle.js';
import './sparkEffects.js';
import './offTrackRespawn.js';
import './playerOffTrackRespawn.js?v=16.20';
import './multiplayerOffTrackRespawn.js?v=16.21';
import './gapEndCollision.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.21';
export const NOTE = 'Multiplayer now uses the same 2.5 second off-track explosion, upward lift, momentum-preserving 3-2-1 countdown and full-health road reset as single-player';
