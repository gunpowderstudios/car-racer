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
test('TV video is sized and compressed for social media', () => {
  const r = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  assert.match(r, /videoBitrate\(R\.player\.duration, tv \? 3\.5e6 : 5e6\)/);
  assert.match(r, /small \? 960 : 1280; out\.height = small \? 640 : 854/);
});
import { videoBitrate, WHATSAPP_BYTES } from '../src/mp4Save.js';
test('video bitrate keeps a replay under the WhatsApp size', () => {
  for (const sec of [10, 38, 60, 120]) {
    const bytes = (videoBitrate(sec) + 128000) * sec / 8;
    assert.ok(bytes <= WHATSAPP_BYTES * 1.001 || videoBitrate(sec) === 1e6, `${sec}s -> ${bytes}`);
  }
  assert.equal(videoBitrate(5), 3.5e6);
  assert.ok(videoBitrate(60) < 2e6);
});
test('the mp4 writer is the first choice and MediaRecorder the fallback', () => {
  const r = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  assert.match(r, /createMp4Saver\(/);
  assert.match(r, /new MR\(stream/);
});
