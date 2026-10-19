import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const f = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('horn is 20% quieter and can be turned off in the cog', () => {
  const a = f('src/audio.js');
  assert.match(a, /_hornVoice\(0\.269, 1\)/);
  assert.match(a, /0\.32 \* clamp01/);
  assert.equal((a.match(/this\.hornOn === false/g) || []).length, 2);
  assert.match(f('index.html'), /id="opt-horn"/);
  assert.match(f('src/main.js'), /bindOpt\('opt-horn', 'horn'/);
});
test('Jamboree rivals keep the original colours of their vehicles', () => {
  const m = f('src/main.js');
  assert.match(m, /v\.adopt\(src, null\)/);
  assert.match(f('src/carVisual.js'), /if \(look\) \{/);
});
