import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the chase camera is not lifted by a bridge overhead', () => {
  const src = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(src, /q\.idx >= 0 && q\.y < p\.y \+ 1\.5/);
});
