// Towing a caravan needs a reasonably capable device: the caravan model brings about 13 MB of textures (it was 92 MB, which made a phone's browser quit).
// A touch screen that the quality check puts on the Low tier (little memory, few cores, an old graphics chip, or data saving) does not load it,
// and its menu card is greyed out. Other phones and tablets can tow. ?caravan=1 / ?caravan=0 on the address forces it on or off for testing.
import { detectTier, probeDevice } from './quality.js';

export const CARAVAN_DESKTOP_ONLY = 'Towing a caravan needs a more powerful device (this one is on the Low graphics setting).';
let weak = null;       // asked once per page: the device probe makes a throwaway WebGL context
export function caravanBlocked() {
  try {
    const force = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('caravan') : null;
    if (force === '1') return false;
    if (force === '0') return true;
    if (typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches) return false;      // a computer
    if (weak === null || typeof document === 'undefined') weak = detectTier({ ...probeDevice() }) === 'low';
    return weak;
  } catch { return false; }
}
