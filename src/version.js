// version.js is loaded by the small version label script in index.html.
// bootstrap.js owns the runtime feature order and starts main.js explicitly.
import './bootstrap.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.28';
export const NOTE = 'Cleanup phase 5: multiplayer track locking no longer monkey-patches Multiplayer methods; it now uses an explicit live-session reference while preserving custom host tracks and editor locking';
