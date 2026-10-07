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
const howMade = readFileSync(new URL('../how-we-made-it.html', import.meta.url), 'utf8');
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
  assert.match(vehicleChoice, /id: 'bmw', name: 'German Beema', url: 'cars\/bmw-shrink\.glb'/);
  assert.match(vehicleChoice, /targetLength: 4\.33/);
  assert.match(vehicleChoice, /wheelbase: 2\.57/);
  assert.match(vehicleChoice, /body: \{ width: 1\.65, length: 4\.33/);
  assert.match(vehicleProfiles, /bmw: \{/);
  assert.match(vehicleProfiles, /mass: 1080/);
  assert.match(vehicleProfiles, /peakTorque: 190/);
});


test('random circuits scatter more barrels and chickens', () => {
  assert.match(templates, /scatter\('barrel', 6 \+ Math\.floor\(rnd\(\) \* 7\)\)/);
  assert.match(templates, /scatter\('chicken', 4 \+ Math\.floor\(rnd\(\) \* 6\)\)/);
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


test('main menu links to the development story', () => {
  assert.match(indexHtml, /href="how-we-made-it\.html"[^>]*>How we made this game<\/a>/);
  assert.match(howMade, /How we made Bangers and Smash!/);
  assert.match(howMade, /SHRINK3D/);
  assert.match(howMade, /Happy Camper/);
  assert.match(howMade, /track editor/i);
});


test('development page has an interactive Mr Muscle viewer and visible yellow footer links', () => {
  assert.match(howMade, /id="muscle-car-canvas"/);
  assert.match(howMade, /cars\/car-shrink\.glb/);
  assert.match(howMade, /GLTFLoader/);
  assert.match(howMade, /pointerdown/);
  assert.match(indexHtml, /How we made this game<\/a> &middot;/);
  assert.match(indexHtml, /style="color:#ffb31f">View the source on GitHub/);
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


test('development page loads compressed GLB with Meshopt', () => {
  assert.match(howMade, /MeshoptDecoder/);
  assert.match(howMade, /setMeshoptDecoder\(MeshoptDecoder\)/);
  assert.match(howMade, /cars\/car-shrink\.glb/);
});


test('3D reset pauses auto-rotation so the straight view is visible', () => {
  assert.match(editorPreview, /this\.yaw = 0;/);
  assert.match(editorPreview, /this\.spin = false;\s+\/\/ hold the reset view briefly/);
  assert.match(editorPreview, /e\.preventDefault\(\)/);
  assert.match(editorPreview, /e\.stopPropagation\(\)/);
});


test('gameplay camera resets with double-click or zero', () => {
  assert.match(cameraOrbit, /addEventListener\('dblclick'/);
  assert.match(cameraOrbit, /e\.key !== '0'/);
  assert.match(cameraOrbit, /cam\.snap\(\)/);
  assert.match(indexHtml, /<kbd>0<\/kbd> Reset view/);
  assert.match(indexHtml, /double-click the game view to centre the camera/);
});


test('development page car viewer is a five-car swipe carousel', () => {
  assert.match(howMade, /Mr Muscle.*car-shrink\.glb/s);
  assert.match(howMade, /70s Saloon.*escort-shrink\.glb/s);
  assert.match(howMade, /German Beema.*bmw-shrink\.glb/s);
  assert.match(howMade, /Motorhome.*motor-home-shrink\.glb/s);
  assert.match(howMade, /Happy Camper.*campervan-shrink\.glb/s);
  assert.match(howMade, /id="car-prev"/);
  assert.match(howMade, /id="car-next"/);
  assert.match(howMade, /swipeArea\.addEventListener\('pointerup'/);
  assert.match(howMade, /className = 'car-dot'/);
});


test('Happy Camper carousel uses the shrunk model', () => {
  assert.match(howMade, /Happy Camper.*campervan-shrink\.glb/s);
  assert.doesNotMatch(howMade, /cars\/campervan\.glb/);
});


test('vehicle model cache busting follows the game version', () => {
  const gameVersion = versionFile.match(/VERSION = '([^']+)'/)?.[1];
  const modelVersion = assetVersion.match(/ASSET_VERSION = '([^']+)'/)?.[1];
  assert.equal(modelVersion, gameVersion);
  assert.match(vehicleChoice, /assetUrl\(url \|\| config\.url\)/);
  assert.match(vehicleChoice, /fetch\(assetUrl\(selectedVehicle\(\)\.url\)/);
  assert.match(howMade, /loader\.loadAsync\(assetUrl\(car\.url\)\)/);
  assert.match(serviceWorker, /const MODEL = \/\\\.glb\$\/i/);
  assert.match(serviceWorker, /MODEL\.test\(url\.pathname\)/);
});


test('development story recommends a structured changelog for AI-assisted development', () => {
  assert.match(howMade, /CHANGELOG\.md/);
  assert.match(howMade, /v2\.25, v2\.24, v2\.23/);
  assert.match(howMade, /core engine version/i);
  assert.match(howMade, /should <em>not<\/em> be overwritten/);
  assert.match(howMade, /version-bump rule/);
  assert.match(howMade, /known issues/i);
  assert.match(howMade, /Claude, ChatGPT/);
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


test('mobile multiplayer hides duplicate copy invite but keeps share invite', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="mp-share"[^>]*>Share invite<\/button>/);
  assert.match(indexHtml, /id="mp-copy"[^>]*>Copy invite link<\/button>/);
  assert.match(css, /@media \(pointer: coarse\) and \(max-width: 760px\)[\s\S]*#mp-copy \{ display: none !important; \}/);
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
  assert.match(mpCore, /retryMs = 15000/);
  assert.match(mpCore, /e\?\.peerType !== 'peer-unavailable'/);
  assert.match(mpCore, /Room \${roomCode} is waking up/);
  assert.match(mpCore, /_joinRoomAttempt\(roomCode\)/);
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


test('barrel blast car push is 7.5', () => {
  const propsFile = readFileSync(new URL('../src/props.js', import.meta.url), 'utf8');
  assert.match(propsFile, /carPush: 7\.5/);
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
  assert.match(main, /derby\.enabled = !net && opts\.rivals > 0/);
  assert.match(main, /derby\.damageEnabled = derby\.enabled && !!opts\.derby/);
  assert.match(main, /v\.root\.scale\.setScalar\(1\)/);
  assert.doesNotMatch(main, /f\.expire\) k = 1 - f\.expireT/);
  assert.match(derbyFile, /this\.enabled = false; this\.damageEnabled = true/);
  assert.match(derbyFile, /if \(!this\.damageEnabled \|\| f\.wrecked \|\| hp <= 0\) return/);
  assert.match(derbyFile, /!this\.damageEnabled && f\.flipT > 3/);
});


test('1972 VW Type 2 camper uses period-correct size and 1600 drivetrain character', () => {
  const camper = readFileSync(new URL('../src/campervanVehicle.js', import.meta.url), 'utf8');
  assert.match(camper, /targetLength: 4\.50/);
  assert.match(camper, /mass: 1280/);
  assert.match(camper, /frontWeight: 0\.44/);
  assert.match(camper, /wheelbase: 2\.40/);
  assert.match(camper, /track: 1\.41/);
  assert.match(camper, /peakTorque: 106/);
  assert.match(camper, /gears: \[3\.80, 2\.06, 1\.26, 0\.82\]/);
  assert.match(camper, /finalDrive: 5\.375/);
  assert.match(camper, /aero: \{ drag: 0\.80, down: 0\.08 \}/);
  assert.match(camper, /CAR\.profileName = '1972 VW Type 2 1600 campervan'/);
});


test('menu vehicle selector has a rotating 3D preview and playful blurbs', () => {
  const preview = readFileSync(new URL('../src/menuVehiclePreview.js', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(indexHtml, /id="menu-vehicle-preview"/);
  assert.match(indexHtml, /id="menu-vehicle-canvas"/);
  assert.match(bootstrap, /import '\.\/menuVehiclePreview\.js\?v=17\.24'/);
  assert.match(preview, /Big, loud and happiest going sideways/);
  assert.match(preview, /Your Dad\\'s favourite! Light, lively and always up for a scrap/);
  assert.match(preview, /Great engineering, tuned to nip down the shops/);
  assert.match(preview, /Slow, huge and deeply annoying if you\\'re stuck behind it/);
  assert.match(preview, /Peace, love and absolutely no hurry whatsoever/);
  assert.match(preview, /yaw \+= dt \* 0\.26/);
  assert.match(preview, /pointerdown/);
  assert.match(preview, /dragging/);
  assert.match(preview, /GLTFLoader/);
  assert.match(indexHtml, /id="menu-vehicle-choice"[\s\S]*id="track-list"/);
  assert.match(vehicleChoice, /const slot = document\.getElementById\('menu-vehicle-choice'\)/);
  assert.match(css, /\.menu-vehicle-preview \{/);
  assert.match(css, /#menu-vehicle-canvas \{[\s\S]*cursor: grab/);
  assert.doesNotMatch(css, /background: linear-gradient\(145deg, rgba\(27,18,51,\.38\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
});
