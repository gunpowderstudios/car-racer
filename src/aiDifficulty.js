// A tougher field: rivals corner harder, carry more speed, use their nitro on straights and get a stronger but still physics-based catch-up.
// Measured on the built-in tracks: a driver with nitro and 14 m/s² cornering is about 12% quicker than Hard rivals used to be. These numbers make Hard and Expert about 6% quicker a lap, and any more cornering grip than this starts to put rivals off the road.
import { AI } from './ai.js';

AI.cruiseMin = 38;      // ~85 mph
AI.cruiseMax = 50;      // ~112 mph
AI.huntMax = 56;        // ~125 mph
AI.aLatCruise = 10.5;
AI.aLatHunt = 12.5;
AI.catchupStart = 35;
AI.catchupFull = 190;
AI.catchupSpeed = 0.22; // up to +22% chosen target speed when genuinely behind
