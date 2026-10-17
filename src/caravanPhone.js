// Towing a caravan needs a desktop browser: the caravan model brings about 90 MB of textures with it, and a phone's browser runs out of memory and quits.
// A touch screen (phone or tablet: the same test the track editor uses) never loads the caravan, and its menu card is greyed out.
export const CARAVAN_DESKTOP_ONLY = 'Towing a caravan needs a desktop browser (a phone does not have the memory for it).';
export function caravanBlocked() {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}
