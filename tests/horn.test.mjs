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
  assert.match(r, /out\.width = 1280; out\.height = 854/);
  assert.match(r, /seconds: filmLen/);
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
test('the mp4 writer makes the film', () => {
  const r = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  assert.match(r, /createMp4Saver\(/);
});
test('controller hints and the button check exist', () => {
  const h = f('index.html'), c = f('css/style.css');
  assert.match(h, /id="pad-test"/);
  assert.ok((h.match(/pad-legend/g) || []).length >= 8);
  assert.match(c, /body\.has-pad #controls \.key-legend \{ display: none/);
  assert.match(f('src/input.js'), /classList\.add\('has-pad'\)/);
  assert.match(f('src/input.js'), /gp\.axes\[9\]/);
});
test('home screen has the TV set with the logo on its screen', () => {
  assert.match(f('index.html'), /<img src="tv\/tv-set\.webp"/);
  assert.match(f('css/style.css'), /#menu-tv-logo \{ position: absolute; left: 40\.7%/);
});
test('with the Campervan selected, Jamboree rivals (no look given) are not turned into campervans', () => {
  assert.match(f('src/campervanVehicle.js'), /selectedId\(\) === ID && !!look && \(!look\.vehicleId/);
});
test('video is stamped with the replay clock, with the replay held when the encoder falls behind', () => {
  const m = f('src/mp4Save.js'), r = f('src/replayMode.js');
  assert.match(m, /busy\(\)/); assert.match(m, /setClock\(/);
  assert.match(r, /saver\.addFrame\(out, R\.t - R\.saveStart\)/);
  assert.match(r, /R\.held = !!\(R\.saving && R\.saver && R\.saver\.busy\(\)\)/);
});
test('the site is ready for bangersandsmash.co.uk', () => {
  const h = f('index.html');
  assert.equal(f('CNAME').trim(), 'bangersandsmash.co.uk');
  assert.match(h, /rel="canonical" href="https:\/\/bangersandsmash\.co\.uk\/"/);
  assert.match(h, /og:image" content="https:\/\/bangersandsmash\.co\.uk\/src\/share-card\.png"/);
  assert.match(f('sitemap.xml'), /<loc>https:\/\/bangersandsmash\.co\.uk\/<\/loc>/);
  assert.match(f('robots.txt'), /Sitemap: https:\/\/bangersandsmash\.co\.uk\/sitemap\.xml/);
  assert.doesNotMatch(f('site.webmanifest'), /\/car-racer\//);
});
test('saving a video steps the replay in exact 1/30 s steps so the video is evenly spaced', () => {
  const r = f('src/replayMode.js');
  assert.match(r, /R\.nextT \+= 1000 \/ 30; dt = 1 \/ 30;/);
  assert.match(r, /saver && !R\.held && !R\.skip/);
});
test('saving a video shows the dark editing-room screen and silences the speakers', () => {
  assert.match(f('index.html'), /Now in the editing room/);
  assert.match(f('index.html'), /id="rp-editing"/);
  assert.match(f('src/replayMode.js'), /el\.edit\.hidden = !quick/);
  assert.match(f('src/replayMode.js'), /d\.sound\.speakers\?\.\(!quick\)/);
  assert.match(f('src/audio.js'), /speakers\(on\)/);
});
