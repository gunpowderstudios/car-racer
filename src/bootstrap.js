// Runtime bootstrap for Car Racer.
//
// Keep runtime extensions in one explicit order, then start main.js. Stable feature
// patches can be folded back into core modules here without making script-tag order
// part of the game's behaviour.
import './vehicleChoice.js?v=16.52';
import './vehiclePhysicsProfiles.js?v=16.51';
import './cameraChoice.js';
import './menuVehicle.js';
import './derbyOffTrackRecovery.js?v=16.25';
import './multiplayerTrackLock.js?v=16.28';
import './raceSettings.js?v=16.45';
import './aiDifficulty.js?v=16.45';
import './multiplayerRace.js?v=16.45';
import './soloRacePosition.js?v=16.46';
import './gapEndCollision.js';

// Start the game only after every runtime extension above has been installed.
import './main.js';
