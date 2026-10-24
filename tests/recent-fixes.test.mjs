import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const solo = readFileSync(new URL('../src/soloRacePosition.js', import.meta.url), 'utf8');
const multiplayer = readFileSync(new URL('../src/multiplayerRace.js', import.meta.url), 'utf8');
const celebration = readFileSync(new URL('../src/raceCelebration.js', import.meta.url), 'utf8');
const camper = readFileSync(new URL('../src/campervanVehicle.js', import.meta.url), 'utf8');
const vehicleChoice = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
const vehicleProfiles = readFileSync(new URL('../src/vehiclePhysicsProfiles.js', import.meta.url), 'utf8');
const templates = readFileSync(new URL('../src/templates.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/editor.js', import.meta.url), 'utf8');
const editorPreview = readFileSync(new URL('../src/editorPreview.js', import.meta.url), 'utf8');
const cameraOrbit = readFileSync(new URL('../src/cameraOrbit.js', import.meta.url), 'utf8');
const assetVersion = readFileSync(new URL('../src/assetVersion.js', import.meta.url), 'utf8');
const versionFile = readFileSync(new URL('../src/version.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const inputFile = readFileSync(new URL('../src/input.js', import.meta.url), 'utf8');
const vehicle = readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');

test('multiplayer core finish banner uses selected race length without an off-by-one', () => {
  assert.match(main, /const mpRaceLaps = \(\) =>/);
  assert.match(main, /idx >= mpRaceLaps\(\)/);
  assert.match(main, /maxLap: net \? mpRaceLaps\(\) : null/);
  assert.doesNotMatch(main, /MP_RACE_LAPS/);
});

test('solo race field size stays fixed when original rivals wreck', () => {
  assert.match(solo, /total: startingRivalCount \+ 1/);
  assert.match(solo, /const total = field\.total/);
  assert.doesNotMatch(solo, /const total = field\.rivals\.length \+ 1/);
});

test('all local race finishes use the shared large finish overlay', () => {
  assert.match(solo, /carracer-player-finish/);
  assert.match(multiplayer, /carracer-player-finish/);
  assert.match(celebration, /YOU CAME \$\{ordinal\(place\)\}!/);
  assert.match(celebration, /race-finish-active #derby-score/);
  assert.match(celebration, /race-finish-active #dmg-card/);
});

test('campervan rivals recolour only the original red body texture', () => {
  assert.match(camper, /function recolourCamperBodyTexture/);
  assert.match(camper, /dominance = r - Math\.max\(g, b\)/);
  assert.match(camper, /r < g \* 1\.12/);
  assert.match(camper, /m\.map = tex/);
  assert.doesNotMatch(camper, /m\.color\.set\(look\.tint\)/);
});


test('German Beema is available with its own size and handling profile', () => {
  assert.match(vehicleChoice, /id: 'bmw', name: 'German Beema', url: 'cars\/bmw-SHRINK\.glb'/);
  assert.match(vehicleChoice, /targetLength: 4\.33/);
  assert.match(vehicleProfiles, /wheelbase: 2\.57/);
  assert.match(vehicleProfiles, /body: \{ width: 1\.72, length: 4\.33/);
  assert.match(vehicleProfiles, /bmw: \{/);
  assert.match(vehicleProfiles, /mass: 1080/);
  assert.match(vehicleProfiles, /peakTorque: 201/);
});


test('random circuits scatter barrels, and no chickens', () => {
  assert.match(templates, /scatter\('barrel', 6 \+ Math\.floor\(rnd\(\) \* 7\)\)/);
  assert.doesNotMatch(templates, /scatter\('chicken'/);
});


test('German Beema keeps local paint and loads clean independently-coloured rival copies', () => {
  assert.match(vehicleChoice, /function recolourBmwPaintTexture/);
  assert.match(vehicleChoice, /const colourVariant = view\._bmwColourVariant === true/);
  assert.match(vehicleChoice, /if \(wanted\.id === 'bmw' && look\)/);
  assert.match(vehicleChoice, /this\.load\(wanted\.url, wanted\)/);
  assert.match(vehicleChoice, /this\._bmwColourVariant = true/);
  assert.match(vehicleChoice, /this\.setOwnLook\(look\)/);
  assert.match(vehicleChoice, /if \(config\.id === 'bmw'\) this\._bmwColourVariant = false/);
  assert.doesNotMatch(vehicleChoice, /applyBmwLook\(this, look, src\)/);
});






test('zero key resets the track editor 3D view', () => {
  assert.match(editorPreview, /resetView\(\) \{/);
  assert.match(editorPreview, /this\.yaw = 0;/);
  assert.match(editorPreview, /this\.pitch = 0\.5/);
  assert.match(editorPreview, /this\.zoom = 1/);
  assert.match(editorPreview, /dblclick'.*resetView/s);
  assert.match(editor, /e\.key === '0'.*resetView/);
  assert.match(indexHtml, /<b>0<\/b> resets the 3D view/);
});




test('3D reset pauses auto-rotation so the straight view is visible', () => {
  assert.match(editorPreview, /this\.yaw = 0;/);
  assert.match(editorPreview, /this\.spin = false;\s+\/\/ hold the reset view briefly/);
  assert.match(editorPreview, /e\.preventDefault\(\)/);
  assert.match(editorPreview, /e\.stopPropagation\(\)/);
});


test('gameplay camera resets with double-click or zero', () => {
  assert.match(cameraOrbit, /addEventListener\('dblclick'/);
  assert.match(cameraOrbit, /e\.key !== '0' && e\.key !== 'r'/);
  assert.match(cameraOrbit, /cam\.snap\(\)/);
  assert.match(indexHtml, /<kbd>R<\/kbd> Reset view/);
  assert.match(indexHtml, /<kbd>B<\/kbd> Back on road/);
  assert.match(indexHtml, /double-click the game view to centre the camera/);
});






test('vehicle model cache busting follows the game version', () => {
  const gameVersion = versionFile.match(/VERSION = '([^']+)'/)?.[1];
  const modelVersion = assetVersion.match(/ASSET_VERSION = '([^']+)'/)?.[1];
  assert.equal(modelVersion, gameVersion);
  assert.match(vehicleChoice, /assetUrl\(modelUrl\(url \|\| config\.url\)\)/);
  assert.match(vehicleChoice, /fetch\(assetUrl\(modelUrl\(selectedVehicle\(\)\.url\)\)/);
  assert.match(serviceWorker, /const MODEL = \/\\\.glb\$\/i/);
  assert.match(serviceWorker, /MODEL\.test\(url\.pathname\)/);
});




test('auto-fitted vehicles ground their visible model at suspension rest height', () => {
  assert.match(vehicleChoice, /const restHeight = restHeightForVehicle\(config\);/);
  assert.match(vehicleChoice, /model\.position\.y \+= -restHeight - box\.min\.y/);
  assert.doesNotMatch(vehicleChoice, /Number\.isFinite\(bodyBottom\) \? bodyBottom/);
});


test('grass plane stays below low road sections to avoid z-fighting', () => {
  const stage = readFileSync(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /this\.groundLevel = -0\.35/);
  assert.match(stage, /this\.ground\.position\.set\(camPos\.x, this\.groundLevel, camPos\.z\)/);
  assert.doesNotMatch(stage, /this\.ground\.position\.set\(camPos\.x, 0, camPos\.z\)/);
});


test('off-track player reset uses a stronger vertical hop without forced cartwheeling', () => {
  const recovery = readFileSync(new URL('../src/derbyOffTrackRecovery.js', import.meta.url), 'utf8');
  assert.match(recovery, /const PLAYER_EXPLOSION_LIFT = 4\.8/);
  assert.match(recovery, /c\.vel\.y \+= PLAYER_EXPLOSION_LIFT/);
  assert.doesNotMatch(recovery, /function addPlayerTumble/);
  assert.doesNotMatch(recovery, /PLAYER_TUMBLE_/);
});


test('mobile brake label damage chart and braking tyre sound are clearer', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const audio = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="t-brake">Brake<br><small>\/ R<\/small>/);
  assert.match(css, /#dmg-card \{[^}]*width: 88px/s);
  assert.match(audio, /const brakeSkid = car\.gear > 0 && car\.onGround && car\.speed > 4/);
  assert.match(audio, /car\.brk \* clamp01/);
  assert.match(audio, /Math\.max\(Math\.min\(1, car\.skidLevel\), brakeSkid \* 0\.72\)/);
});


test('multiplayer lobby shows both Share invite and Copy link, on phones too', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="mp-share"[^>]*>Share invite<\/button>/);
  assert.match(indexHtml, /id="mp-copy"[^>]*>Copy link<\/button>/);
  assert.doesNotMatch(css, /#mp-copy \{ display: none/);
});


test('handbrake drift assist holds a controllable slide instead of forcing a spin', () => {
  assert.match(vehicle, /_updateDriftAssist\(dt, input, handNow\)/);
  assert.match(vehicle, /this\.driftTarget = sign \* this\.driftBase/);
  assert.match(vehicle, /this\.driftBase \+ intoCorner \* 0\.14/);
  assert.match(vehicle, /this\.angVel\.addScaled\(this\.ay, -sign \* yawKick\)/);
  assert.match(vehicle, /this\.driftBlend \*= Math\.exp\(-dt \/ 0\.32\)/);
  assert.match(vehicle, /_applyDriftYawAssist\(\)/);
  assert.match(vehicle, /const yawAccel = clamp\(-error \* 9\.5 - yawRate \* 2\.5/);
  assert.match(vehicle, /const driftRearGrip = !w\.front \? 1 - 0\.34 \* this\.driftBlend : 1/);
  assert.match(vehicle, /const lockedHB = this\.handbrake && !this\.driftActive && this\.speed <= 7 && !w\.front/);
});


test('drift control labels match the new assisted drift behaviour', () => {
  assert.match(indexHtml, /id="t-hand">Drift<\/button>/);
  assert.match(indexHtml, /id="ctl-hand"><kbd class="wide">Shift<\/kbd> Drift<\/span>/);
  assert.match(indexHtml, /id="hand-flag">Drift<\/div>/);
  assert.match(indexHtml, /Shift drift/);
});


test('multiplayer join retries a temporarily unavailable mobile host', () => {
  const mpCore = readFileSync(new URL('../src/multiplayer.js', import.meta.url), 'utf8');
  assert.match(mpCore, /joinRoom\(code, name, \{ retryMs = 120000/);
  assert.match(mpCore, /e\?\.peerType !== 'peer-unavailable'/);
  assert.match(mpCore, /Room \${roomCode} is waking up/);
  assert.match(mpCore, /_joinRoomAttempt\(roomCode, connectMs\)/);
  assert.match(main, /finally \{[\s\S]*net\?\.resume\(\)/);
});


test('assisted drift keeps throttle and acceleration', () => {
  assert.match(vehicle, /if \(this\.handbrake && !this\.driftActive && this\.speed <= 7\) drive = 0/);
  assert.doesNotMatch(vehicle, /if \(this\.handbrake\) drive = 0/);
});


test('Drift applies throttle on desktop mobile and gamepad', () => {
  assert.match(inputFile, /key\('KeyW', 'ArrowUp'\) \|\| key\('ShiftLeft', 'ShiftRight'\) \|\| t\.gas \|\| t\.hand \|\| this\.pad\.hand \? 1 : 0/);
  assert.match(inputFile, /handbrake: key\('ShiftLeft', 'ShiftRight'\) \|\| t\.hand \|\| this\.pad\.hand/);
});

test('Drift deliberately initiates left or right powered slides', () => {
  assert.match(vehicle, /Math\.abs\(steer\) > 0\.08\s*\? -Math\.sign\(steer\)/);
  assert.match(vehicle, /this\.driftBase = clamp\(0\.30 \+ Math\.abs\(steer\) \* 0\.16/);
  assert.match(vehicle, /const yawKick = 0\.65 \+ Math\.abs\(steer\) \* 0\.45/);
  assert.match(vehicle, /this\.angVel\.addScaled\(this\.ay, -sign \* yawKick\)/);
});


test('barrel blast gives the car a big push and a jolt upwards', () => {
  const propsFile = readFileSync(new URL('../src/props.js', import.meta.url), 'utf8');
  assert.match(propsFile, /carPush: 11,/);
  assert.match(propsFile, /carLift: 0\.9,/);
});


test('desktop Drift no longer brakes when Shift is pressed before steering', () => {
  assert.match(vehicle, /const atDriftSpeed = this\.onGround && this\.fwdSpeed > 5 && this\.speed > 7/);
  assert.match(vehicle, /if \(handNow && !this\.driftActive && atDriftSpeed && wantsCorner\)/);
  assert.match(vehicle, /if \(!handNow \|\| !atDriftSpeed\) \{\s*this\.driftActive = false/);
  assert.match(vehicle, /if \(this\.handbrake && !this\.driftActive && this\.speed <= 7\) drive = 0/);
  assert.match(vehicle, /const lockedHB = this\.handbrake && !this\.driftActive && this\.speed <= 7 && !w\.front/);
});


test('race AI stays full-size and supports a zero-rival lap-time mode', () => {
  const derbyFile = readFileSync(new URL('../src/derby.js', import.meta.url), 'utf8');
  assert.match(indexHtml, /option value="0">0 — Lap time only<\/option>/);
  assert.match(main, /derby\.enabled = !net && \(opts\.rivals > 0 \|\| demoDay\)/);
  assert.match(main, /derby\.damageEnabled = derby\.enabled;/);
  assert.match(main, /v\.root\.scale\.setScalar\(1\)/);
  assert.doesNotMatch(main, /f\.expire\) k = 1 - f\.expireT/);
  assert.match(derbyFile, /this\.enabled = false; this\.damageEnabled = true/);
  assert.match(derbyFile, /if \(!this\.damageEnabled \|\| f\.wrecked \|\| hp <= 0\) return/);
  assert.match(derbyFile, /!this\.damageEnabled && f\.flipT > 3/);
});


test('1972 VW Type 2 camper uses period-correct size and 1600 drivetrain character', () => {
  const camper = vehicleProfiles.slice(vehicleProfiles.indexOf('campervan: {'));   // the camper's profile (vehiclePhysicsProfiles.js)
  assert.match(vehicleChoice, /targetLength: 4\.50/);
  assert.match(camper, /1972 VW Type 2 1600 campervan/);
  assert.match(camper, /mass: 1280/);
  assert.match(camper, /frontWeight: 0\.44/);
  assert.match(camper, /wheelbase: 2\.40/);
  assert.match(camper, /track: 1\.41/);
  assert.match(camper, /peakTorque: 242/);      // (a stock 1600 makes 106: this camper is tuned to take about 8.7 s to 60 mph)
  assert.match(camper, /gears: \[3\.80, 2\.06, 1\.26, 0\.82\]/);
  assert.match(camper, /finalDrive: 5\.375/);
  assert.match(camper, /aero: \{ drag: 0\.80, down: 0\.08 \}/);
});


test('menu vehicle selector has a rotating 3D preview and playful blurbs', () => {
  const preview = readFileSync(new URL('../src/menuVehiclePreview.js', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="menu-vehicle-preview"/);
  assert.match(indexHtml, /id="menu-vehicle-canvas"/);
  assert.match(bootstrap, /import '\.\/menuVehiclePreview\.js\?v=17\.27'/);
  assert.match(preview, /Big, loud and happiest going sideways/);
  assert.match(preview, /Your Dad\\'s favourite! Light, lively and always up for a scrap/);
  assert.match(preview, /Great engineering and boringly reliable, Wunderbar!/);
  assert.match(preview, /Put the kettle on dear!.*Slow, huge and deeply annoying if you\\'re stuck behind it/);
  assert.match(preview, /Peace, love and absolutely no hurry whatsoever/);
  assert.match(preview, /yaw \+= dt \* 0\.26/);
  assert.match(preview, /pointerdown/);
  assert.match(preview, /dragging/);
  assert.match(preview, /GLTFLoader/);
  assert.match(indexHtml, /id="menu-vehicle-choice"[\s\S]*id="track-list"[\s\S]*class="options"[\s\S]*id="menu-vehicle-preview"/);
  assert.match(vehicleChoice, /const slot = document\.getElementById\('menu-vehicle-choice'\)/);
  assert.match(css, /\.menu-vehicle-preview \{/);
  assert.match(css, /#menu-vehicle-canvas \{[\s\S]*cursor: grab/);
  assert.doesNotMatch(css, /background: linear-gradient\(145deg, rgba\(27,18,51,\.38\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
});


test('oval template is displayed as Deep Pan Pizza', () => {
  const templates = readFileSync(new URL('../src/templates.js', import.meta.url), 'utf8');
  assert.match(templates, /oval:\s*\{\s*name: 'Deep Pan Pizza'/);
});


test('mobile menu orders vehicle preview, then the car grid, then race options, then tracks', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /#menu-vehicle-choice \{ order: 6;/);
  assert.match(css, /#menu-vehicle-preview \{\s*order: 5;/);
  assert.match(css, /#menu \.options \{ order: 7; \}/);
  assert.match(css, /#track-list \{ order: 8; \}/);
  assert.match(css, /@media \(max-width: 980px\)/);
});

test('keys: R resets the camera view, B is back on road, Backspace/Delete restart; gamepad has d-pad, reset view and connect notice', () => {
  const input = readFileSync(new URL('../src/input.js', import.meta.url), 'utf8');
  assert.match(input, /KeyB: onReset/);
  assert.match(input, /Backspace: onRestart, Delete: onRestart/);
  assert.doesNotMatch(input, /KeyR: onReset/);
  assert.match(input, /buttons\[14\]/);
  assert.match(input, /edge\('view', 11/);
  assert.match(input, /gamepadconnected/);
  assert.match(cameraOrbit, /ctl-reset-view/);
});

test('laps count on a circuit (and only there): the lap index follows race.max on circuits, and stays put in an arena', () => {
  assert.match(main, /const idx = lapped \? Math\.floor\(race\.max \/ L\) : race\.index;/);
});

test('Handling option: Arcade (default) turns the stability layer on, Standard is the raw physics', () => {
  assert.match(indexHtml, /id="opt-handling"/);
  assert.match(main, /handling: 'arcade'/);
  assert.match(main, /car\.opts\.stability = opts\.handling === 'standard' \? 0 : 1/);
});

test('the bus and the motorhome start every race on the High camera', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /\['bus', 'motor-home'\]\.includes\(selectedVehicle\(\)\.id\)/);
  assert.match(src, /chase\.mode = phone \|\| big \? 1 : 0/);
});

test('a new point in the editor can be made a jump without crashing, and a crash tells you the track was kept', () => {
  const ed = readFileSync(new URL('../src/editor.js', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ed, /\$\('ed-lip-o'\)\.textContent = h\.gap \? `\$\{h\.lip\.toFixed/, 'the lip readout no longer assumes a lip');
  assert.match(ed, /if \(h\.gap\) \{ if \(!Number\.isFinite\(\+h\.lip\)/, 'ticking Gap gives the point a lip and kick');
  assert.match(main, /copied automatically a moment ago/, 'the crash screen says the track was kept');
});

test('Test my hardware: the cog has the button and the verdict is plain English', async () => {
  const { verdict } = await import('../src/hardwareTest.js');
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="btn-hwtest"/);
  assert.equal(verdict(60, 55).cls, 'ok'); assert.equal(verdict(40, 20).cls, 'meh'); assert.equal(verdict(18, 10).cls, 'bad'); assert.equal(verdict(0, 0).cls, 'meh');
});
