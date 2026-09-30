// A slightly tougher default field: rivals carry more speed and get a stronger but still physics-based catch-up.
import { AI } from './ai.js';

AI.cruiseMin = 34;      // ~76 mph
AI.cruiseMax = 45;      // ~101 mph
AI.huntMax = 52;        // ~116 mph
AI.aLatCruise = 9.5;
AI.aLatHunt = 12.0;
AI.catchupStart = 45;
AI.catchupFull = 190;
AI.catchupSpeed = 0.18; // up to +18% chosen target speed when genuinely behind
