# Car Racer

A 3D racing game with heavy, slidey 70s muscle-car handling (think the original *Driver*) and a track
editor built into the same page. No build step: open it through any static web server.

```
npm start            # then open http://localhost:8080
npm test             # physics, track and geometry tests (Node 20+, no dependencies)
```

Try `?track=hills` (or `speedway`, `kidney`, `technical`, `overpass`) to jump straight in, and `&edit=1` to open the editor.

## Controls

| | |
|---|---|
| W / S or Up / Down | throttle, brake (hold S when stopped to reverse) |
| A / D or Left / Right | steer |
| Space | handbrake: locks the rear wheels for handbrake turns |
| R | put the car back on the road (also happens automatically if you flip or fall off) |
| C | camera: chase, high, bumper |
| E | open the track editor with the current track |
| Esc | menu, M music, F3 telemetry |

Gamepad (right trigger, left trigger, left stick, B or RB for handbrake, Y reset) and touch controls also work.
The menu has a **drift assist** option that counter-steers when the rear axle slides.

## The track editor

Draw a closed circuit by dragging points. The editor and the game share the same `Track` class, so what you see is what you drive.

- Drag a point to move it. **Double-click the road** to add a point, or press A. Delete removes one.
- Every point has a height, a bank angle, an optional width, and an optional **jump gap** (a takeoff ramp is built for you).
- Drag the markers in the **height strip** at the bottom to build hills. Steep sections turn red.
- **Auto-bank** leans every corner into the turn. **Reverse** drives the loop the other way.
- Tight corners and roads that cross at the same height are flagged. Raise one crossing by about 5 m to make a bridge.
- Save keeps the track in your browser. Export writes a `.json` file; import it from the menu.

Track format (`version: 5`): `{ name, width, walls, handles: [{ x, y, z, w, bank, gap }] }` in metres and degrees.
`y` is the height of the lowest edge of the road. `bank > 0` lifts the left edge. Old editor files (v4) are migrated on load.

## How it works

| File | What it does |
|---|---|
| `src/track.js` | Spline through the handles, resampled by arc length. Answers "what is the ground here?" for any point, so there is no road mesh to collide with and walls have no seams. |
| `src/vehicle.js` | Full 3D rigid body: four spring/damper wheels, slip-angle tyres with a friction ellipse, locking handbrake, automatic gearbox and engine. **All tuning lives in the `CAR` object at the top.** |
| `src/trackGeometry.js` | Road, kerb, barrier and embankment meshes built to match the physics surface exactly (no three.js needed, so it is tested in Node). |
| `src/editor.js` | The blueprint editor and height strip. |
| `src/main.js` | Game loop (fixed 120 Hz physics, interpolated rendering), laps, respawn, menu. |
| `src/stage.js`, `carVisual.js`, `effects.js` | Scenery, car model and chase camera, skid marks and smoke. |

Tuning the feel: in `CAR.tyre` lower `muFront` and `muRear` for a slidier car; in `CAR.susp` change the spring rates for more or less body roll; `CAR.engine` holds the torque curve and gear ratios.
If the model's nose points the wrong way, set `MODEL.flip = true` in `src/carVisual.js`.

## Migrating from the old version

This replaces the single-file `index.html` and the `track-editor/` folder. You can delete `track-editor/`, `cars/car.gltf` (22 MB, the game uses `cars/car.glb`),
and the sounds `boost`, `barrel`, `cluck`, `explosion` and `engine.mp3`, which are no longer used.
There are also Dropbox-style "conflicted copy" files inside `.git`, which are worth removing before they confuse git.

## Ideas for next

Opponent cars, a damage model, open point-to-point tracks, a ghost of your best lap, and a street-network mode for the full Driver experience.
