// version.js is loaded by the small version label script in index.html.
// bootstrap.js now owns the runtime feature order and starts main.js explicitly,
// so version.js no longer contains the growing monkey-patch stack itself.
import './bootstrap.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.24';
export const NOTE = 'Cleanup phase 1: runtime feature patches now load from one explicit bootstrap module before main.js, removing the fragile scattered import order from version.js without changing gameplay';
