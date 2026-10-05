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
  assert.match(vehicle, /this\.driftBase \+ intoCorner \* 0\.12/);
  assert.match(vehicle, /this\.driftBlend \*= Math\.exp\(-dt \/ 0\.32\)/);
  assert.match(vehicle, /_applyDriftYawAssist\(\)/);
  assert.match(vehicle, /const yawAccel = clamp\(-error \* 8\.0 - yawRate \* 2\.2/);
  assert.match(vehicle, /const driftRearGrip = !w\.front \? 1 - 0\.34 \* this\.driftBlend : 1/);
  assert.match(vehicle, /const lockedHB = this\.handbrake && !this\.driftActive && !w\.front/);
});


test('drift control labels match the new assisted drift behaviour', () => {
  assert.match(indexHtml, /id="t-hand">Drift<\/button>/);
  assert.match(indexHtml, /id="ctl-hand"><kbd class="wide">Shift<\/kbd> Drift<\/span>/);
  assert.match(indexHtml, /id="hand-flag">Drift<\/div>/);
  assert.match(indexHtml, /Shift drift/);
});
