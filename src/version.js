import './bootstrap.js';

// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '17.282';
export const NOTE = 'Film sound is recorded on the audio thread (AudioWorklet) so a busy page cannot chop it; unused screen frames are not drawn while filming.';
