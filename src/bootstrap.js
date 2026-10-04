// Runtime bootstrap for Car Racer.
//
// Keep runtime extensions in one explicit order, then start main.js. Stable feature
// patches can be folded back into core modules here without making script-tag order
// part of the game's behaviour.
import './vehicleChoice.js?v=17.05';
import './vehiclePhysicsProfiles.js?v=16.86';
import './campervanVehicle.js?v=16.97';
import './cameraChoice.js';
import './cameraOrbit.js?v=16.95';
import './menuVehicle.js';
import './derbyOffTrackRecovery.js?v=16.66';
import './multiplayerTrackLock.js?v=16.28';
import './raceSettings.js?v=16.45';
import './aiDifficulty.js?v=16.45';
import './multiplayerRace.js?v=16.81';
import './soloRacePosition.js?v=16.81';
import './raceCelebration.js?v=16.81';
import './roofDamage.js?v=16.55';
import './roofFxGuard.js?v=16.59';
import './hardLandingFix.js?v=16.56';
import './gapEndCollision.js';

// Start the game only after every runtime extension above has been installed.
import './main.js';
