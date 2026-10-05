// Cache-busting version for replaceable game assets such as GLB car models.
// Keep this in step with src/version.js. Tests enforce that the two versions match.
export const ASSET_VERSION = '17.11';

export function assetUrl(url) {
  const s = String(url || '');
  const join = s.includes('?') ? '&' : '?';
  return `${s}${join}v=${encodeURIComponent(ASSET_VERSION)}`;
}
