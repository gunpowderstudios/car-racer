// Towing a caravan needs a desktop browser: the caravan model brings about 13 MB of textures with it (it was 92 MB, which made a phone's browser quit).
// A touch screen (phone or tablet: the same test the track editor uses) never loads the caravan, and its menu card is greyed out.
// ?caravan=1 on the address switches that block off so a phone can be tried with it.
export const CARAVAN_DESKTOP_ONLY = 'Towing a caravan needs a desktop browser (a phone does not have the memory for it).';
export function caravanBlocked() {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('caravan') === '1') return false;
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch { return false; }
}
