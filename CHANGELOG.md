# Bangers & Smash! — Change Log

This file records notable user-facing changes. New entries go at the top.

## v17.664 — The Getaway: the other cars drive like a town

- **Everyone follows the streets.** Traffic and the police now wander junction to junction on their own side of the road, taking each corner properly (slowing for it, not cutting across the pavement). In a test run, hits on buildings dropped from about a dozen every two minutes to none, and bumps between cars from about eight to none.
- **Junction manners.** A car slows to a stop at the line, waits a moment, and goes only when the junction is clear; one car through at a time.
- **They stop for each other** (and for you), including a car sitting where they are about to turn. Cars told to stop now really stop instead of rolling on at a few m/s.
- **Police on patrol are spread out.** With nothing to chase they cruise the town at random like the traffic, not all waiting around the banks. The chase behaviour is unchanged for now.

## v17.663 — The Getaway: much smarter police

- **They know where you are going.** The police work out the junctions you will pass on your way to the safehouse and set up on them (cars 1 and 5 hold the next junctions; before it was only a guess from your heading).
- **Real roadblocks.** Two cars park across a street ahead of you with a gap you can squeeze through (and a bigger damage hit if you crash into them). The game checks first, so a roadblock is never put where it would cut you off from the safehouse: at least one route to the lock-up is always open.
- **Pincer.** One car races up alongside you while the others tail you, to box you in.
- **Shooting.** A police car lined up behind you (within 45 m, clear street) fires about once a second. Hits chip the zone facing them (the back of your car if they are behind) with a gunshot sound and a "Shots fired!" flash; swerving makes you harder to hit.
- **Pressure.** The longer you run with the cash, the further away the police give up their jobs and ram you, and the faster they drive (up to about 70 s of heat).

## v17.662 — Weeval Knievel: barrels in front of the boxes, a taller start

- The cardboard boxes now stay at the back of the run-out, just in front of the wall, on every stage. The skull barrels (with their HIGH EXPLOSIVES gantry) stand in front of them, 26 m before the wall on stage 1, and come 10 m nearer the jump each stage, so you have to brake and stop sooner and more accurately every time.
- The start platform now climbs 20 m higher each stage (80 m on stage 1, 160 m on stage 5; it was only 5 m a stage), so every drop-in feels taller. The takeoff and landing heights are unchanged.

## v17.661 — Weeval boxes (superseded by v17.662)

- The cardboard stack briefly replaced the skull barrels; v17.662 puts the barrels back in front of the boxes.

## v17.660 — Natural handling back, more grip

- Reverted the handling experiments that made the car feel strange: the 30% tighter steering, the extra tail swing in tight corners and the helper changes that went with it are gone.
- The anti-roll help now only steps in when a car is about to tip over (about 20 degrees of lean and more), so normal cornering lean looks natural again. The campervan has the steady anti-roll assist the other tall cars have.
- Your tyres have 25% more grip (was 20%), so the car slides less when cornering. Rivals unchanged.

## v17.659 — More tyre grip

- Your car's tyres have 20% more grip (rivals unchanged), and the tail-swing in tight powered corners is eased back from 55% to 40% rear-grip loss, so the car slides less overall while the back end still steps out in tight corners.

## v17.658 — Smoother drift, editor remembers your track

- Pressing Drift in a corner no longer jolts the car: the starting twist is given over about a third of a second, the slide eases in over about a quarter of a second and out over about half a second.
- Going to the main menu and clicking Design-a-track! again brings back the track you were editing (with its undo history), not a fresh one.

## v17.657 — Nothing pokes up through a road above

- Lamp posts are left out wherever another road passes over them (under a bridge, flyover or tunnel), and flyover pillars now stop at the real underside of the deck where they stand, so neither can stick up through the road above.

## v17.656 — Shortcuts menu, 30% tighter turns, more tail swing

- The editor shortcut legend is now a **Shortcuts** dropdown in the top menu, closed until you open it.
- Your car turns 30% tighter at every speed (rivals are unchanged), with the roll guard coming in sooner to keep it on its wheels.
- The tail swings out more in tight powered corners (rear tyres lose up to 55% grip, was 42%).

## v17.655 — "You were editing" only in the editor

- The "You were editing ... carry on where you left off?" question no longer pops up on the menu a second after the page loads. It now appears the first time you go into the editor after loading the page (Say no and the old copy is dropped).

## v17.654 — Editor shortcut legend

- A small shortcut legend sits under the 3D view in the editor (it moves up when the 3D view is hidden).
- Double-clicking anywhere on the road surface adds a point, not just on the centre line.

## v17.653 — Tails swing out a little more

- Tight powered corners: the rear tyres now give up to 42% of their grip (was 30%) up to about 18 m/s (was 16), and the counter-steer helper eases off by up to 60% there so the tail hangs out longer before it is caught. Braking or coasting is unchanged, and it is your car only (rivals and police are tuned without it).

## v17.652 — Crossings quiet by default, Shift to select several points

- When the road crosses itself in the editor nothing pops up any more: a flat crossing is simply a crossroad, so you can shape the track (and clear the red tight-corner warnings) first. Click the crossing's marker (or a point sitting on it) to open the Crossroad / Gap / Flyover / Tunnel question.
- Hold **Shift** and click points to pick several (click a picked one to let it go), or Shift-drag a box on empty ground to pick everything inside it. Then drag any picked point to move them all together; Delete removes them; **Esc** deselects.

## v17.651 — Harder to roll over, tails step out in tight corners

- Every vehicle now has a soft anti-roll assist: a normal lean in a corner looks the same, but past about 12 degrees, at speed, it fades in and by about 30 degrees it holds the car down, so cars (the campervan especially) no longer tip over on full lock or in a quick weave. Drift's own roll guard is unchanged. Jumps, crashes and being in the air can still flip you.
- Tight corners: at full steering between about 5 and 16 m/s with the throttle down the rear tyres give up to 30% of their grip, so the back end steps out more. The arcade stability layer waits a little longer before pulling it straight in those corners.

## v17.650 — Sound Waves

- New track in **Driving Tests (beta)**: **Sound Waves** - "Pump up da' volume in this hi-fidelity criss-cross of a track that goes up to 11!" About 1 km, two open crossroads, 22 m wide with walls, banked left and right.

## v17.649 — Flyovers and tunnels

- Roadworks now has Flyover (O) and Tunnel (U) alongside Gap. Click a crossing, or tick them in the crossing pop-up (Crossroad / Gap / Flyover / Tunnel, one per crossing).
- A flyover is a bridge with solid concrete pillars you can crash into. A tunnel lifts the upper road to 6.6 m with a concrete roof for the lower road to drive through. Both have their own map icons and are saved in share links.

## v17.648 — New crossroad and gap map icons

- Crossroads on the editor map are now a little 3D junction (a thick plus of road with dashed middle lines). Gaps are two little ramps facing each other with the jump drawn between them. Both are bigger and easier to click.
- A track can mix gaps and crossroads: each crossing is answered on its own (a new test covers a gap at one crossing and a crossroad at another).

## v17.647 — Curve handles on points

- Click a point and two curve handles pop up on it (the line with round ends, a dot marking the leading one). Drag an end to bend the road in and out of that point: the other end mirrors it, and its length sets how wide the curve swings. Double-click an end to put it back to automatic. Handles are saved with the track, in share links and when you reverse it.
- A track you draw with the Draw tool is eased a little when you close it, so no kinks are left in the shape. It still has exactly the points you placed.

## v17.646 — Auto-smooth has a live slider

- Auto-smooth now opens a small box with a Smoothness slider from 0% (as you drew it) to 100% (very smooth). The track on the map and in the 3D view changes as you drag. Apply keeps it (one Undo step); Cancel puts the track back exactly as it was.

## v17.645 — Auto-smooth, gentler crossroad approaches

- New Auto-smooth button (top bar, next to Auto-bank): evens out jagged corners, bumps and lean in one go without shrinking the circuit. Points with a jump gap stay put, and points crowded within 7 m of a neighbour are merged. Press again for more; Undo brings it back.
- The flat, straight stretch at a crossroad now eases back into the road over 40 m instead of 14 m, so the lead-up is much smoother.

## v17.644 — Neat crossroads: straight approaches

- Both roads now run dead straight through a crossroad, for the whole junction and 8 m past it, and ease back into their bend over about 14 m. Crossings come out as a neat cross even when the points were placed on a curve. The 2D editor map shows the straightened road.

## v17.643 — No banking at crossroads

- Roads lean (auto-bank or hand-set banking) no longer get in the way of a crossroad: through the junction, and for the same stretch either side, the road lies completely flat on the ground, then eases back into its banking. A banked crossing used to be refused as a crossroad.

## v17.642 — Crossroads are always flat

- The road through a crossroad is now set completely level (before, a hill kept its slope through the junction, so one road could rise like a wall across the other). The flat stretch reaches out past the corner drums on both roads and eases back into the hill over about 14 m.

## v17.641 — Give-way lines drum to drum

- The white dashed give-way line at each crossroad now runs from the yellow drum on one side to the yellow drum on the other, across the whole approach.
- Add point and Gap now say "Esc stops" when picked. (Esc, or clicking the button again, puts the tool away.)

## v17.640 — Crossroad surface is normal road

- Fixed the black patch on crossroads. The junction surface was built facing down on some crossings, so it was lit from underneath and came out black. It now always faces up and shows the same tarmac as the rest of the road.

## v17.639 — Open crossroads, solid corner drums, Draw keeps your points, camera under bridges

- Crossroads are now plain and open like a real junction: no walls or kerbs across them, just tarmac with the give-way dashes.
- The yellow drums stay at the four corners of each crossroad and are now as solid as a wall: you can crash into them, and they never move or explode. The dark patch on the junction surface was a shadow clash with the roads underneath, so the surface no longer takes shadows.
- No lamp posts in the middle of a crossroad.
- The Draw tool now gives you exactly the points you placed (4 or more) instead of adding dozens along the curve. The preview shows the track's own curve through them, and dragging while you place a point moves it.
- The chase camera no longer dips down and pops up as you drive under a bridge: a road overhead is passed through.

## v17.637 — Editor: Draw tool, blank Clear, Add point, corner drums

- New Draw button (P): click to place points, drag from a point to bend the curve either side of it (like a pen tool), then click the first point (or press Enter) to close the circuit. Backspace, Undo and Redo step through the points while you draw; Esc starts over.
- Clear now gives a blank page and starts the Draw tool, instead of a ready-made oval. Save, Share, Export and Test Drive wait until a track is drawn. Undo brings the old track back.
- Add point is now a tool (A): click it, then click on the track where the new point should go.
- Crossroads: a yellow drum sits where the walls meet at each corner, joining them neatly. They are only for looks and do not explode.

## v17.636 — Roadworks is just Gap

- The Roadworks menu now holds Gap only (key G). Crossroads need no tool: they happen by themselves wherever the road crosses itself.
- Click the plain road with Gap picked to drop a 30 m jump gap there (change it in the point settings). Click a crossing to make it a 5 m gap.

## v17.635 — Editor: Roadworks dropdown

- New Roadworks menu in the top bar with Crossroad (X) and Gap (G). Pick one, then click a place where the road crosses itself and it is made that way straight away; the tool stays on so you can click several. Esc puts it away.
- A crossroad asked for on roads that are at different heights still shows the flatten warning first.
- Clicking a crossing with the tool picked works even when a road point sits right on it.

## v17.634 — Crossroads look like the road

- The crossroad surface now uses the same tarmac texture and colour as the rest of the track instead of a flat patch.
- The give-way dashes are drawn on top as their own layer.
- The road walls at each corner of a crossroad now run on and meet each other, so there are no gaps between the two roads' walls.
- Each crossroad or gap can be clicked on its own, so one track can mix both.

## v17.633 — Editor: change a crossing at any time

- Click a crossing's marker (white square for a crossroad, amber arch for a gap, red cross for one that is not joined yet) and the "Crossroad or Gap?" box opens again with the current answer ticked; tick the other one to change it.
- Roads at different heights: ticking Crossroad warns "These roads are 3.0 m apart" and, on Flatten the road, raises the lower road up to the higher one (the highest point that already exists, so nothing is dug into the ground) and joins them. Uneven crossings now ask by themselves too.
- A crossing that is already a gap (one road 5 m or more over the other, as in older tracks) is left exactly as it is when you pick Gap, and now shows an arch marker so you can change it.

## v17.632 — Editor: placeable vehicles

- New Vehicles tool in the editor's Obstacles menu (key V): click the map to put a car on the track. Choose which vehicle it is (or the same as yours), whether it is Parked (handbrake on, stays where you put it) or Driving (races round the track like a rival), and which way it faces (a new car lines up with the road). They are saved with the track and in share links.
- In the game placed cars are real cars: you can smash them, they take damage and burn out where they fall. They are not rivals (no grid place, not in the standings, never replaced). A track with placed cars turns damage on even in Test Drive, like Apple Crumple.

## v17.631 — Editor: crossroad or gap, Obstacles menu, back to editor

- When two parts of the road cross in the track editor, a small box asks "Crossroad or Gap?". Tick Gap and one road is lifted 5 m over the other (a bridge you can drive under); tick Crossroad (or close the box) to join them. The answer is remembered in the track.
- Crossroads now look joined: the barriers end exactly where the two roads' walls meet, a plain asphalt patch covers the junction so the painted lines of the two roads stop at its edge, each approach has a dashed white give-way line, and a give-way sign stands beside every approach.
- Barrels, Skull barrels and Fire pits now live in one Obstacles menu in the editor (keys B, K and L still work), ready for more.
- Test Drive has a "Back to editor" button (and the E key) that returns to the same track with your undo history.
- The editor keeps a copy of your work until you Save, so reloading the page or going to the menu no longer loses it; the game offers to carry on where you left off.

## v17.630 — Crossroads

- A road that crosses itself at the same height is now a crossroad instead of a problem. Through the junction the two roads are levelled to one height, the barriers are opened across it, and the track editor marks it with a white square (no more red crosses). Raise one road by 5 m or more and it is a bridge, as before; crossings that are too uneven or too shallow are still reported.
- Lap progress, the AI cars and the race positions now stay on the road they are really driving through a crossroad, so cutting across a junction cannot skip part of the lap.

## v17.629 — Track editor: fire pits

- New Fire pits tool in the track editor (button, or L): drop the flame pits from Apple Crumple on any track. Every few seconds one flares, then roars into a column of fire that throws a car into the air (and wrecks it where damage is on). They show on the map with a flame, are counted in the props list, and survive Save, Export and Share link.

## v17.628 — Aggressive police, and track size in the editor

- The Getaway: when you are the robber and have the cash, any police car within about 110 m now drops its job (roadblock, junction net, safehouse watch) and goes straight for you: faster, boosting early, and ramming as hard and as often as it can.
- Track editor: Shorter and Longer buttons (10% each) resize the whole track, with its props, about its middle. The length shows under them.

## v17.627 — Track editor: skull barrels

- New Skull barrels tool in the track editor (button, or K): drop the black skull barrels that explode the moment anything touches them. They show on the map with a yellow skull, are counted in the props list, and survive Save, Export and Share link.

## v17.626 — Track editor: Clear

- New Clear button in the track editor: it asks first, then starts you again from a plain loop with no props or jumps. Undo brings the old track back.

## v17.625 — Blow up and you're out

- Race Day: if your car explodes you are now out of the race (the stage card says "You're out!"; in the championship that ends your season) instead of respawning. Harder, and easy to change back (one line in main.js: the `repairsMax` rule).
- Quick Race already worked this way; its game-over card now says "You're out of the race!".
- Apple Crumple, The Getaway, Weeval Knievel and multiplayer keep their own wreck rules.

## v17.624 — Swedish Meatballs

- The Volvo estate is now called Swedish Meatballs (it was Swedish Massage).

## v17.623 — A new home screen: vehicle first, then the game

- The home screen now runs top to bottom: the title, your vehicle (swipe along the row), the big game buttons, then every track.
- Pick Quick Race, Demolition Day or Weeval Knievel and that game's track comes up and orbits behind the rotating vehicle, with a PLAY button under the vehicle (a bar along the bottom on a phone). Press Quick Race again for another random track. Race Day, Multiplayer and Design-a-track! open as before.
- The options are behind a white cog, top right (the same cog as in the races). The version number moved to the top left.
- Buckle up! is now called Quick Race.
- The old home screen is still there: add ?classic to the web address.

## v17.622 — Weeval Knievel: upside-down landings count, 5 stages, fewer boxes

- Weeval Knievel is five stages for now (more to come).
- About half as many cardboard boxes again, each bigger.
- The home-page subtitle is now just: You wait ages for a bus...
- Landing upside down no longer fails the stage: land anywhere on the ramp and you go through. You just miss the level-landing bonus (and the target still pays the most).

## v17.621 — Weeval Knievel: explosive barrels

- The black barrels at the end of the jump are now the exploding skull barrels from Apple Crumple: a staggered row right across the run-out. Hit one and you blow up and the whole run is over.
- They move 10 m nearer the jump each stage (stopping short of the landing ramp), under a big WARNING - HIGH EXPLOSIVES! sign framed with yellow chevrons.

## v17.620 — Weeval Knievel button

- On phones the Weeval Knievel button now sits under Demolition Day instead of above the title. It is white, with a Stars and Stripes design at its right-hand end.

## v17.619 — Cancelled game no longer leaves the car stuck

- Fixed: cancelling a game part way and starting a new one could leave the car unable to move. Damage from the cancelled game (a lost wheel, a stalled engine, locked boost and handbrake) was carried into the next game; every new game now starts with a whole car.

## v17.618 — Weeval Knievel: boxes and flames in the replay
- The cardboard boxes and the flames now move in the replay. They are not recorded; they are played again from the car's recorded path (the same hits and tumble, the flames flaring while you are in the air), and rebuilt from the start if you rewind or skip about.

## v17.617 — Weeval Knievel: bigger boxes, higher start
- Half as many cardboard boxes, each bigger.
- The start of the long ramp is 80 m up on stage 1 (it was 60), still 5 m higher each stage.

## v17.616 — Weeval Knievel: go again
- The stage-clear card has a Go again button: have another jump at the same stage for a better score. It costs one of the stage's three tries (the button shows how many are left) and only appears while you have more than one. Only the better of the two jumps counts, and if the second goes wrong the first clear still stands.
- The cardboard crunch sound plays at most every 140 ms, so a stack of hundreds of boxes is a crunch, not a roar.

## v17.615 — Weeval Knievel: boxes that fly
- The cardboard boxes have proper physics now: the car throws what it touches up and out, boxes crash into each other and knock the rest over, the stack above a hit box comes down, and they crumple as they go.
- The stack is half as far from the target as it was (it now stands on the landing ramp, not at the far end of the run-out).
- The bus platform is 40% taller, so the buses are well up in the jump's path. (Falling more than 6 m below the lip before the far side now counts as a miss.)

## v17.614 — Weeval Knievel: real buses in the way
- The parked buses are now the Rootmaster double-decker from the main game (the plain boxes stay as a fallback if the model cannot load), nose to the left looking down the ramp.
- They are raised so their roofs are level with the takeoff lip: they sit right in your flight path, so a low jump crashes into them (a try is lost if you drop into them).

## v17.613 — Weeval Knievel: the buses are back
- A row of red double-decker buses sits in the gap, side-on to the ramp with their noses to the left, on a raised platform so you can see them from the run-up. One more bus each stage (3 on stage 1, 12 on stage 10).
- Each stage the long ramp is 10 m longer and the whole thing (start, takeoff lip, kicker) is 5 m higher; the landing ramp stays put and gets 20 m longer, so the drop to it grows.
- Landing short on the buses or the platform costs a try.
- The home-page button now reads: You wait ages for a bus... then 10 turn up! The track is now called Weeval Knievel.
- A tip on the first screen of each stage: in the air, W (or gas) tips the nose down and S (or brake) lifts it.
- Poles of flame stand down both sides of the gap; they flicker as you go down the ramp and roar up while you are in the air.
- A big stack of cardboard boxes at the end of the run-out, tallest at the back: drive into it and the boxes fly and crumple, slowing you a little for each one you hit. It is rebuilt on every try.

## v17.612 — Weeval Knievel: a longer jump
- A much longer jump: the gap is 70 m on stage 1 and 30 m longer every stage, with the bullseye 30 m past the far lip. The takeoff is higher (20 m up) with a steeper 25 degree kicker, and the landing ramp is longer and gentler (170 m). The numbers are all in one place at the top of src/weeval.js (gapStart, gapStep, zoneStart, lipKick) to edit.
- The car is fully repaired - armour, wheels and dents - at the start of every try and every stage.
- The grey slabs across the middle of the long ramp (the tops of the support beams showing through the road) are gone.
- The buses are switched off for now while the jump is tuned. 

## v17.611 — Weeval Knievel: jump the buses
- New solo stunt on the home page, next to Demolition Day: Weeval Knievel. Race down a very high, dead-straight ramp, launch off the kicker, fly over a row of parked buses and land on the far ramp.
- Ten stages. Stage 1 is three buses; every stage adds a bus, makes the gap longer and moves the target further out. You get three tries a stage; land without wrecking or flipping and you are through, however far from the middle.
- A painted bullseye on the landing ramp scores by ring (1000 / 600 / 300 / 150, 50 for anywhere else on the ramp), plus 200 for a level touchdown and 100 for landing with no damage. Best score is saved.
- The panel shows the speed to aim for on each stage (and your speed as you go: green when you are right on it), so you can lift or brake on the way down.
- In the air on this track, W tips the nose down and S lifts it.
- The buses and the end barrier are solid; landing short drops you in the pit and costs a try.

## v17.610 — Deep Pan: dirt and an Overhead camera
- The Deep Pan Pizza's sauce is a duller, browner red (it glared before) and the whole floor is dirty: soft mud blotches, tyre scuffs where the cars have been going round, a dustier edge towards the wall, and a fine grit
- New Overhead camera in the open arenas (Deep Pan Pizza, Bed Pan): press C after the Helicopter view. It looks straight down on the arena with the same side always at the top of the screen, follows your car, and never looks out past the wall. A first version: tell me what to change (height, zoom, whether it should turn with the car)

## v17.609 — More sparks from a lost wheel
- A car dragging a bare hub now throws sparks at walking pace too (they used to need about 9 mph, which a demolition derby car being shoved around rarely reaches), and a hub that is bouncing just off the road still sparks

## v17.608 — Limping rivals
- A rival that has lost a wheel now drives like a real driver would: about 70% of its pace with one wheel gone, half with two, a crawl after that
- A rival that has lost both wheels of an axle, or three wheels, cannot be driven on, so it is out (wrecked) even if it has not exploded. You keep control of your own car however many wheels it has lost

## v17.607 — Version number back, and a car leans onto a lost wheel
- The version number is back in the top right of the home page, as small plain text (no edition badge)
- A car that has lost a wheel now leans onto that corner and sits lower: the body dips towards the missing wheel (more with each wheel lost), in the game and in the replay. The hub is smaller, its spring has given way, and it no longer gets help from the anti-roll bar

## v17.606 — Wheels come off one at a time
- A wheel can now come off on its own, where the car was hit: when a zone's armour is used up, or on a big single knock (about every other time). It is the wheel nearest the hit, on that side. The wheel flies off with sparks and a clang, and it comes off in the replay too
- The corner without a wheel drops: only a small hub is left, so the body dips towards it, drags with little grip, and throws sparks from the road
- A wrecked car has no wheels at all, so its body now sits down on the road instead of hovering where the wheels were
- Mending the car (repair, back on the road after a wreck) puts every wheel back

## v17.605 — Less clutter
- The "Desktop / Tablet / Mobile Edition" badge and version number are gone from the top right of the home page

## v17.604 — The house everywhere
- The little house (back to the home page) is now on the replay and the multiplayer screens too, not just in the game. On the replay it sits just under the Bangers and Smash TV logo so they never overlap. Only the home page itself and the track editor (which has its own Menu button) go without it

## v17.603 — A weak core, not a dead corner
- Your car can now keep driving with parts destroyed. Front, rear, sides and roof are armour around a weak core in the middle (the centre of the damage chart). A used-up part stops protecting the core, and further hits on it go straight through; the car is only wrecked when the core is gone
- The core shows on the damage chart once it starts taking hits. Rivals work as before

## v17.602 — Cars put back
- All the cars are back to the models they had before the rebuilds (police car, Mini, Panda, BMW, Escort, French Cheese, Saab, V8 Pilot, Volvo and Yellow Taxi). The loose-wheel-scrap clean-up from v17.597 stays

## v17.601 — More cars with clean wheels
- The BMW, Escort, French Cheese, Saab, V8 Pilot, Volvo and Yellow Taxi are rebuilt from their original models, each with one clean round wheel on all four corners and a lighter file (the French Cheese is about 1.1 MB instead of 1.6 MB)

## v17.600 — Mini, Panda and police wheels
- The Mini and the Panda are rebuilt from their original models, each with one clean round wheel used on all four corners (a smooth tyre with the real rim and hub), and a lighter body
- The police car's wheels are narrower (the tyre was about 60% too wide) and sit properly in the wheel arches

## v17.599 — One clean wheel on the police car
- The police car now has one properly built wheel (a smooth round tyre with the real rim and hub), used on all four corners, instead of four rough cut-outs. Smaller again, about 680 KB

## v17.598 — Police car rebuilt from the original
- The police car is now rebuilt straight from the original model: the wheels are cut out as four separate wheels, the body is cut down to about 36,000 triangles with the texture mapping kept, and the wheels are smoother. A little smaller to download than before

## v17.597 — Cleaner wheels
- Wheels no longer carry loose scraps of car body (shards beside the tyre, like on the French Cheese) that spun round with them. Small separate pieces sticking out past the tyre are removed from every wheel

## v17.596 — Blur on the TV view only, no shadows message
- The replay's depth-of-field blur is now only on the trackside TV camera. The chase view stays sharp
- The "Shadows turned off to keep the game smooth" message no longer pops up (the game still switches shadows off by itself when it has to)

## v17.595 — Lighter Yellow taxi and Volvo
- The Yellow taxi has a lighter model (57,000 vertices instead of 93,000, a 1.0 MB file instead of 1.4 MB) and so does the Volvo (60,000 instead of 67,000), both with the standard texture layout. They look the same

## v17.594 — Lighter Panda
- The Panda has a lighter model: 51,000 vertices instead of 64,000 and a 0.9 MB file instead of 1.05 MB, with the standard texture layout. It looks the same

## v17.593 — Lighter Mini and Mobility car
- The Mini has a lighter model (54,000 vertices instead of 71,000) and so does the Mobility car (54,000 instead of 65,000), with the standard texture layout. Both look the same

## v17.592 — Lighter bus
- The double-decker bus has a lighter model: 55,000 vertices instead of 187,000 and a 0.9 MB file instead of 2.2 MB. It looks the same

## v17.591 — Lighter German Beema
- The German Beema has a lighter model: 45,000 vertices instead of 118,000 and a 0.7 MB file instead of 1.5 MB. It looks the same

## v17.590 — German Beema uses less memory
- The German Beema has a new export with the standard texture layout (two 1024 px maps and one 512 px map instead of three 1024 px maps): about 4 MB less graphics memory, and it looks the same

## v17.589 — Lighter bus (30% detail)
- The double-decker bus has a lighter model again, this time exported at 30% detail: 187,000 vertices instead of 287,000 and a 2.2 MB file instead of 3.3 MB, and it looks as smooth as the original close up

## v17.588 — Original bus back
- The double-decker bus is back to its original, smoother model. The lighter version looked crinkled and blurry close up in the game

## v17.587 — Lighter bus
- The double-decker bus has a new, much lighter model: 30,000 vertices instead of 287,000, and a 0.6 MB file instead of 3.3 MB. It looks the same and is the same size, so it loads faster and is kinder to phones

## v17.586 — No black scene when shadows switch off
- When the game turned Shadows off to keep things smooth ("Shadows turned off to keep the game smooth"), the materials were not rebuilt, so they kept reading a shadow map that no longer existed and the car, trees and buildings went black while the road stayed lit. The materials are now rebuilt whenever Shadows is switched on or off

## v17.585 — Phones back on Medium graphics
- Phones and tablets start on Medium again. On High an iPhone went black (car, trees and buildings dark while the road stayed lit), the sign of the sun's shadow map failing. High can still be picked in the settings

## v17.584 — Phones start on High graphics
- Phones and tablets now start on High graphics like a computer (sharper picture, soft shadows, full-detail cars and a full rear-view mirror), instead of Medium. If the frame rate sags the game still lowers the resolution by itself, and you can pick another quality in the settings

## v17.583 — No pop-up on phones
- Phones no longer show the "Running at 30 fps? Turn off Low Power Mode" message while you drive, as it got in the way of the game

## v17.582 — Police radio in the replay
- The Getaway replay now plays the police radio chatter along with the sirens, during a robbery, when you were playing the police

## v17.581 — Police radio
- The Getaway: when you play the police and the robber picks up the cash, you now hear the police radio chatter (sounds/police-radio.mp3) as well as the sirens, for as long as the robbery goes on. It starts at a different place in the recording each time. The recording is only downloaded for the police player

## v17.580 — Old Getaway look removed
- The clean, non-retro version of The Getaway's town is gone from the code, along with the `?noretro` switch. The 1980s look is the only look. Nothing changes on screen

## v17.579 — The Getaway is retro
- The 1980s look (sooty brick, boarded and broken windows, patched road, fire escapes, signals, billboards, the shadow-casting sun) is now how The Getaway always looks, with no `?retro` needed. Add `?noretro` to the address to see the old clean town. No other track is affected

## v17.578 — Depth of field in more replays
- The replay's soft background blur (depth of field) now also works on the Medium graphics setting on desktop, and on the chase view as well as the trackside TV camera. It is gentle: strongest on the TV camera, lighter on the chase view, and the car and what is next to it stay sharp. The top view stays sharp, and phones and tablets are unchanged

## v17.577 — Raised pavements and Getaway fixes
- The Getaway: the pavements are now raised (about 17 cm, with a rounded edge), so you bump up and over a kerb. They are level across the junctions and in front of each garage
- The computer cars now take the middle of a junction when they turn, so they stay on the road far more (they were swinging up onto the pavements)
- The bank sign now hangs out in front of the cornice instead of having a bar running across it
- Crashing into a police roadblock (a police car parked sideways across the street) now costs you 1.7 times the usual damage; you can still smash through
- The garage bays are 12 m wide instead of 10, which stops the robber circling and clipping the edge of its lock-up

## v17.576 — Retro town brighter
- `?retro` Getaway: the shadows and textures stay, but the town is lighter overall (a stronger fill light in the shadows and a lighter road), and the blocky box cars parked on the pavements are gone

## v17.575 — Sirens in the Getaway replay
- The replay of a Getaway now has the police siren and the flashing red and blue screen, with a Robbery in progress label, for as long as the alarm was on. The siren gets louder as a police car comes close to the camera, and is also in saved films

## v17.574 — Getaway robber unstuck
- The Getaway: when you play the police, the computer robber could freeze (front wheels turning, car not moving) behind a parked car, such as yours, or nose to nose with a town car. After a few seconds it now reverses, then edges round and carries on with the robbery

## v17.573 — Bumper camera off
- The C key no longer goes to the bumper camera: it now cycles Chase, High, Bonnet and Helicopter

## v17.572 — New German Beema
- The German Beema (BMW) has a new model made from the original scan: rounder wheels with clear spokes, a cleaner body, and more surface detail (80,000 polygons, 1.1 MB)

## v17.571 — Cars put back
- All 16 car models are back to the earlier versions (the newer ones lost surface detail: flat body panels and plain wheel rims). Smaller than the originals, with no separate phone copies

## v17.570 — Rounder wheels
- All the cars have new models with much smoother, rounder wheels (about 7,000 polygons a wheel instead of about 2,700), still one file per car, 1.1-1.6 MB each

## v17.569 — Higher TV camera
- The TV replay camera is 30% higher (2-5.6 m above the road instead of 1.5-4.3 m), so the track walls block the view less

## v17.568 — One set of car models
- The separate lighter phone copies of the cars are gone: phones and computers now load the same (new, smaller) car files, which have the same textures. This also removes about 11 MB from the site

## v17.567 — Smaller vehicles
- Every vehicle model is about 30% smaller to download (the French Cheese van more than half), with fewer polygons and the same textures, so the game loads faster and uses less memory on phones
- Phones no longer get the older 'lite' copy of the Bus, Saab, BMW and Motorhome, because the new full model is now the smaller file

## v17.566 — Against the black scene on phones
- The sun's shadow map is now rebuilt whenever the game comes back to the front (after another app), when the phone gives the graphics back after losing them, and whenever Shadows is switched on. A broken shadow map left everything near the car black while the far buildings stayed lit. If it ever happens again, switching Shadows off and on in the settings brings the lighting back

## v17.565 — Multiplayer back on phones and tablets
- Multiplayer is back on phones and tablets. The Getaway is not offered in multiplayer there for now (it is still on computers)
- Opening an invite link no longer risks a blank "Loading your multiplayer invite" screen for ever: after 12 seconds it says it is still loading, a game file that fails to load shows the error straight away, and after 45 seconds the cover is lifted so you can see what is going on

## v17.564 — Smaller 70s Saloon
- The 70s Saloon model is about 17% smaller to download (fewer polygons, same look), so it loads faster

## v17.563 — Music off by default
- Music starts switched off on every device until you turn it on (your own choice is still remembered)

## v17.562 — No multiplayer on phones and tablets (for now)
- The Multiplayer button is hidden on phones and tablets, and an invite link opened on one just says multiplayer is for computers for now

## v17.561 — Police drive better, rivals have names
- The Getaway: computer police cars crash into buildings and walls far less. They look ahead and slow for what is in the way, no longer charge straight at the robber through a corner, and only do the fast boost U-turn on open road, near the middle of a street
- In the replay, the car being watched is now called by its vehicle's name (Cuddly Panda and so on) instead of Rival 1 or Rival 2

## v17.560 — Bigger home vehicle
- On a computer, the rotating vehicle on the home page is 50% bigger (it still always fits whole), sits lower on the page, and its name and description now sit close underneath it instead of far below. Phones and tablets are unchanged.

## v17.559 — Skid marks when pulling away, bigger home preview
- A flat-out start from a standstill leaves a short pair of black marks, and a start with boost leaves a proper burnout. (Donuts already did.)
- The rotating vehicle preview on the home page now always shows the whole vehicle, whichever way it is turned (the big bus was being cut off): the camera backs off just far enough, and it re-fits if the window changes shape.
- IMPORTANT FIX: v17.558 was published with its version files accidentally emptied, which stopped the game starting. This release puts them back.

## v17.558 — Online Getaway waits for you
- Switching to another window or app for a bit no longer throws the other player out of an online Getaway: the game waits up to 45 seconds (instead of 5), pauses the rules, and shows "Waiting for the other player..." until they are back.

## v17.557 — Online Getaway: no laps, original colours
- No Laps choice when The Getaway is picked in Multiplayer (it has no laps).
- Online, the robber is always the original orange Dodge and the police car keeps its livery, instead of being painted in each player's colour.

## v17.556 — The Getaway online, for two players
- In Multiplayer, pick **The Getaway (exactly 2 players)** as the track and start: one of you is the robber (the Dodge) and the other the police (the police car), picked at random each round. The same town, bags, safehouse, satnav and map as the one-player game.
- The host's game runs the rules (pickups, rams, strikes, deliveries, the safehouse moving, who wins) and the other screen follows it. Three hard rams from the police stop a robbery (the robber goes back to his start); three bags safe and the robbers win, three strikes and the robber is in jail.
- After a round the host can start another one (new random sides). Cars are not damaged in this online game: it is all about the rams.
- Not in yet: the town's computer-driven traffic (the online town is empty for now) and replays.

## v17.555 — Race Day podium at the very end
- In the Race Day championship the podium no longer pops up after every stage: you get the stage results, and the podium is shown once, with the overall standings, after the final stage. A single Race Day race still shows its podium. Health still starts fresh on each stage.

## v17.554 — Damage kept after coming off the track
- After the 3-2-1 that puts you back on the road, your damage stays exactly as it was (the chart and the dents), and you carry on with the health you had left. If you were already destroyed, the race is over as before. (This replaces v17.553, which repaired the car.)

## v17.553 — Repaired for real after coming off the track
- After the 3-2-1 that puts you back on the road, the car's dents, burnt look and missing wheels are repaired along with the damage chart (before, the chart reset but the car still looked damaged). Rivals put back on the road are repaired the same way.

## v17.552 — No spanners: one wreck and it's over
- The three spanners (lives) are gone from every racing game. Once your car is destroyed the race is over. Falling off the track is not a wreck: you still get the 3-2-1 and go back on the road, and the Back on the road button is free. Rivals are unchanged.

## v17.551 — Lap timer in the replay
- While you watch your own car in a replay, the top bar shows the lap number and a running lap time ("Lap 2/3  0:41.2"), and "Finished" with your last lap time at the end.

## v17.550 — Bigger podium
- The winners podium, with its cars and blocks, is drawn 30% bigger on every screen (the camera comes in closer). The names move with it.

## v17.549 — Tablets match phones
- Tablets (any touch screen) now have exactly the same screen as phones, same sizes and positions, not a bigger version: no speedometer or damage chart, the round buttons low on the left, restart top right, and in The Getaway the satnav top left with the scores beside it.

## v17.548 — Back on the road button, safer restart
- A little white **road in perspective** button on the left puts the car back on the road in one tap (on touch screens).
- The top-right **restart** button now asks twice: the first tap lights it up and says "Tap again to restart", and a second tap within a few seconds restarts the race.
- The Getaway's compass is nudged clear of the map on phones, and on tablets it sits level with the map.

## v17.547 — Music button and restart button
- A white **musical notes** button turns the music on and off in one tap. On a phone it is the last of the round buttons on the left; on a computer it sits on its own at the left of the screen. A line through it shows when the music is off.
- The round-arrow button now **restarts the race** and has moved to the top right, under the cog, so it is hard to press by accident (the map moves down a little to make room). "Back on road" is still in the cog menu, and B on a keyboard.

## v17.546 — A clearer phone screen
- On phones (all tracks): the speedometer and the damage chart are gone, and the round buttons (mirror, back on road, explode, horn) sit lower, just above the steering.
- The Getaway on a phone: the satnav and its compass are top left, the two score boxes are smaller and sit beside them, and the hint, alarm banner and pop-up messages are smaller so they fit neatly.
- Tablets and computers are unchanged.

## v17.545 — No early win message
- The race counts laps by the furthest point you have reached along the road, so cutting across the grass at a bend could add distance and bring the "You won!" / finish message up while you were still short of the line. The message now waits until the car is actually over the line.

## v17.544 — One site address
- The page's canonical link, share-card images, search-engine data and the address shown on phones now all say bangersandsmash.co.uk (without www), matching how the domain is set up. The site-address test now expects that too, so the tests check goes green again.

## v17.543 — Heavier over humps
- On tracks with road humps (the dirt stages and Got the hump), gravity pulls 30% harder while a car is in the air, so it comes back down off a hump sooner and lands closer instead of floating. A 0.6 m hump at 25 m/s used to give about 0.63 s of air; it now gives about 0.5 s. Tracks without humps, and the big gap jumps, are unchanged.

## v17.542 — Sound effects balanced
Every effect was measured and brought closer together.
- **Quieter:** the flame (about 7 steps), the engine start (about 6), fireworks and boulders (a little), horns and the start-light beeps (about 3).
- **Louder:** the tyre screech (so donuts and skids are heard), barrel clangs, and small bumps (a low-speed shunt was almost silent).

## v17.541 — Donut back to full strength
- The gentler boost donut of v17.539 stopped the car completing a full circle, so the spin rate and rear grip are back to how they were in v17.538.

## v17.540 — Donut skid marks
- A boost donut now burns black rings into the road from the rear tyres, and the road remembers more marks before the oldest fade (4500 instead of 2600).

## v17.539 — Gentler boost donuts
- The boost donut spins about a third slower (a full circle takes roughly three seconds at full steering instead of two) and the rear tyres keep more grip, so the car still swings round but is easier to control.

## v17.538 — Buckle up! honours the laps setting
- Buckle up! was forced to a single lap whatever you chose. It now runs the number of laps you pick (1 to 5), and the button says "Quick random race".

## v17.537 — Getaway police: net, roadblocks, U-turns, alarm
- **U-turns.** A police car pointing the wrong way when the robber is behind it now spins round with the boost donut instead of crawling round a block.
- **The net.** Several police cars now take up positions at different junctions ahead of the robber and hold them until he gets close. They are real cars, so he can ram his way through.
- **Roadblocks.** One car parks broadside across the street ahead of the robber, just short of a junction, and stays there until he is past or close. It can be rammed too.
- **Alarm.** The moment the cash is lifted the screen edges flash red and blue, the siren sounds and the pop-up says the police are alerted.

## v17.536 — Smarter Getaway police
- **They keep up.** In a chase the police now match the robber's speed (plus a little) instead of cruising at a fixed 60-odd mph, so a robber can no longer simply drive away from them now that every car is equally fast.
- **Different jobs.** The police cars are no longer one queue: the first tails the robber, the second cuts him off at the junction ahead of him, the third waits at the junction nearest the safehouse and joins in when he gets close, and so on round again.
- **Better patrols.** With no robbery on, they wait near the banks where a bag is out, so they are already close when it is lifted.
- **Aimed rams.** On the last stretch of a chase they use their nitro so the hit lands above ramming speed.
- **Pressure.** Each bag the robber gets home makes them a little faster and sharper, and each strike eases them off a little.

## v17.535 — The web address on every movie
- Every saved movie (widescreen, tall 9:16, with or without the TV set) now has bangersandsmash.co.uk printed bottom right in the game's yellow (#FFB320), with a dark edge so it reads on any picture.

## v17.534 — Full-screen replays
- The replay screen has a little corner box (bottom right). Click it and every control disappears, the browser goes full screen where it can, and the replay fills the screen; click the box again (or press Esc) and the controls come back. The box itself stays, faint, so you can find it.

## v17.533 — Quieter editing-room music
- The lift music in the "Recording..." movie room is 30% quieter (volume 0.5 to 0.35). It was never recorded into the film, so the film's sound is unchanged.

## v17.532 — Walls drawn at their true height
- The red-and-white track walls and the arena walls are now drawn 1.25 m high, the same height cars and barrels collide with. They were drawn 1.05 m high, so the invisible wall stood 20 cm above the picture. The physics is unchanged.

## v17.531 — Tougher cars
- Damage was too easy, so every car's armour is up: rivals and town traffic can take about 25% more ramming before they wreck, and your own car about 40% more (the 20% weakness on your car is now 10%). Each vehicle's own toughness still applies on top, and the size rule still applies (a bus still wrecks a Panda faster than the reverse).

## v17.530 — A lighter first load
- Each car model is now downloaded once and shared by every car that uses it (before, every rival in the same car fetched its own copy, so one model could come down four times, about 2 MB wasted). The vehicle picker, the podium and the caravan share the same downloads, and a file that already had a version tag no longer got a second one (that made a second address for the same car and a second download). The model bytes are kept for the session, so rivals that come back after a wreck need no new download.
- The big home-screen icon is now a WebP of about 80 KB instead of a 0.5 MB PNG (the installable-app icons are unchanged).

## v17.529 — Rivals spin out and fly less
- Rivals now take a jump at a speed that clears it (about 70 mph) instead of at whatever speed they had, so they stop flying over jumps flat out.
- A rival that starts sliding sideways now lifts off the throttle and steers into the slide, like a driver would, instead of keeping the pedal down and spinning.
- Rivals trust a little less grip in bends (about 10% less cornering force), since every car now has the same strong pull.
- The donut effect from v17.528 is for the player's own car only. A rival using its nitro at low speed was getting its rear tyres knocked loose by it, which made it spin.

## v17.528 — Donuts come from Boost, Drift is as it was
- Drift is back exactly as it was before v17.525: a handbrake slide when slow and the assisted drift at speed. The low-speed "tight turn" on Drift is gone.
- Instead, pressing Boost at walking pace (below about 27 mph) while steering breaks the rear tyres loose and swings the back end round, up to a full donut on the spot, with no Shift needed. Above that speed the normal drift is all there is.

## v17.527 — Donuts
- Hold Boost and Drift together at walking pace (up to about 27 mph) while steering and the car spins round on the spot with its rear tyres letting go, a proper donut, with the engine still pulling. As the speed climbs further it turns into the normal drift. Drift on its own at low speed is still the tight turn from v17.525.

## v17.526 — A blown-up robber no longer ends the round dead
- In The Getaway, when the robber's car is destroyed (a third ram, or too much damage) it now counts as a strike against him instead of freezing both cars. Any bag he carried goes back to its bank, a new one is put out, and after 6 seconds both sides are driving again with the score kept. The game still ends at three strikes (the robber is jailed) or three bags safe (he gets away).
- A robber who is blown up as the human player now comes back at the robber's start, not the police start.

## v17.525 — Tight turns with Drift at low speed
- Holding Drift while steering below about 16 mph (7 m/s) now turns the car tightly round the corner on full grip (about a 3 m turning circle at the lowest speeds), with the engine still pulling, instead of locking the rear wheels and sliding. The effect fades out as the speed rises toward where the normal drift takes over. A handbrake with no steering still locks the rear wheels.

## v17.524 — The robber explodes on the third ram
- In The Getaway (normal and `?retro`) the third hard ram on a robber carrying a bag now blows his car up there and then, with the usual blast, and the police win the round. Before, the third ram only sent the cash back to the bank and gave a strike.

## v17.523 — Retro Getaway street dressing (?retro)
- With `?retro`, The Getaway gets 1980s street detail: fire escapes up the fronts, traffic signals at the junctions, billboards on the roofs, cars parked up on the kerb, dumpsters, heaps of rubble and oil stains on the road. All of it is drawn with the existing shared instanced meshes (no new draw calls) and none of it is solid, so the driving is unchanged. Without `?retro` nothing changes.

## v17.522 — Retro Getaway keeps the red dusk sky, gains shadows
- `?retro` no longer changes the sky, haze or light colour: the Getaway keeps the same dusk background as the rest of the game. It now lifts the shadow-casting sun so the buildings throw shadows across the streets and onto the cars (on Medium and High graphics), and drops the extra flat light the town had. The brick, window and road looks from v17.521 are unchanged. Still only with `?retro`, and only on The Getaway.

## v17.521 — A 1980s town (hidden test: add ?retro)
- Add `?retro` to the web address and The Getaway looks like a run-down 1980s American town: faded sooty brick and stone, dark, boarded-up and smashed windows with dirt under every sill, boarded shop fronts, patched grey asphalt, and a dusty-blue hazy daytime sky instead of the pink dusk. Without `?retro` nothing changes, and no other track is touched. No extra meshes were added, so it costs no more to draw.

## v17.520 — Size decides who gets hurt
- Every vehicle goes at the same speed, but in a crash the heavier one now deals more damage and takes less, and the lighter one the reverse. A bus flattens a Panda; a Panda barely scratches a bus. Applies on every track and mode, including multiplayer (the effect is capped so nothing is invincible or made of paper).

## v17.520 — Big vehicles win crashes
- With every vehicle now the same speed, size decides a crash: in races, demolition, arenas and The Getaway the heavier vehicle gives out more damage and takes less (a bus flattens a Panda; a Panda barely scratches a bus). It is the same rule multiplayer already used, now in every game.

## v17.519 — Reverse twice as fast
- Every vehicle now reverses with twice the pull and up to twice the top speed (about 40 mph instead of 20), so backing out of a wall or a bad spot is quick. Forward speed is unchanged.

## v17.518 — Films say when they are paused
- Making a movie only moves on while its tab is on screen (browsers stop drawing hidden tabs). If you look at another tab, the tab title now reads "Film PAUSED, come back to this tab", and when you return the film carries on exactly where it stopped, with a note. The editing-room hint explains it and suggests giving the game its own window.

## v17.517 — Every vehicle is fast, and the same speed
- All vehicles, yours and the rivals', now pull and top out at the same fast speed in every mode (races, demolition, arenas, The Getaway), the way multiplayer already did. A campervan keeps up with a sports car, and rivals no longer leave a slow vehicle behind.
- Weight, toughness, handling and crash damage still differ per vehicle, so a bus is still tougher than a mobility vehicle.

## v17.516 — A town that looks built
- Every block in The Getaway gets cornices over the shops and under the roof, a roof parapet, and (on some) a set-back top floor, a water tank on legs, a chimney, aerials and air-conditioning boxes. Drainpipes run down the corners and warm lamps hang over the shop fronts. A skyline of far-off towers stands beyond the town walls.
- All of it is drawn with a few instanced meshes and none of it is solid, so the driving and the collisions are unchanged.

## v17.515 — More high hills; Getaway score off the mirror
- The hills have highs: now a much longer loop (about 3.7 km instead of 1.7 km) with 17 hills instead of 9, several 15-25 m high, still gentle enough to drive; the jump is kept as it was.
- Got the hump (the random track): more of its hills are big ones (about one in three instead of one in four).
- The Getaway: on a computer the Robbers / Police boxes now sit on the left under the sound mixer, so the rear-view mirror is not hidden.

## v17.514 — Town traffic takes damage too
- Every car in The Getaway can now be dented, stalled and wrecked, the town's traffic included. A wrecked town car stays as a hulk for 12 seconds, then a new one turns up at a junction away from you.

## v17.513 — The Getaway uses the real damage system
- The robber and the police cars now take the same damage as in the other races: five armour zones, dents and holes (Holy Moley), stalled engines on big hits, smoke and fire, and wrecks that explode. The damage chart shows at the left for your own car.
- Traffic is never hurt. A wrecked robber still means the police win; a wrecked police car (yours or the computer's) is out for 6 seconds and comes back at the police start; a drop in the garage patches the robber up.
- This replaces the simple 100-point health bar and the separate stall rule added earlier.

## v17.512 — Fewer surprise resets in The Getaway
- The general "propped on its side for 2 s" reset no longer applies in The Getaway; only a car that is properly upside down (or on its side) and nearly stopped for 3 s is stood back up, and the message now says why (upside down / off the map).

## v17.511 — Getaway state in the F3 panel
- The F3 debug panel now also shows, in The Getaway, whether the engine is off, the cranking time, throttle, health and whether the round is over.

## v17.510 — Track name in the film file name
- A saved replay film is now called e.g. bangers-and-smash-the-getaway-replay.mp4 instead of the same name every time.

## v17.509 — Police don't see the money
- Playing the police, the bags in the banks, their rings and beams, and the safehouse are hidden (the robber's map already hid them). A bag lying loose on the road after a stopped robbery still shows.

## v17.508 — Stall can't repeat straight away
- After a stalled engine is restarted the car cannot stall again for 9 seconds, so two cars grinding together can no longer keep killing each other's engines.

## v17.507 — Bigger Getaway town, stalls, SatNaff
- The town is twice the size (6 x 4 blocks, 24 banks and garages), with more traffic and police.
- A big knock (a hard wall hit or a proper ram) stalls the engine of the robber or a police car: you restart with Space / Enter / tap; the computer turns the key after a couple of seconds.
- The robber now sees every police car on the map, not just the close ones.
- The map is labelled SatNaff.

## v17.506 — Police survive ramming
- Police cars now take far less damage from car-to-car knocks (they have to ram the robber three times), so you are no longer wrecked after a couple of rams. A wrecked police car is back after 5 seconds instead of 8. The robber's damage is unchanged.

## v17.505 — The Getaway loads faster
- The Getaway used to wait for every one of its ~14 car models (1–2 MB each) to load one after another. It now starts as soon as your car and the main police car are ready; the traffic and extra police cars appear a moment after the start.

## v17.504 — Satnav line stays on the road
- The red satnav line now runs down the middle of the streets and turns each junction corner in a neat curve, instead of sometimes cutting across a building corner. It also eases back onto the middle of the street if you are driving at the side. A new test checks 300 random routes never touch a building.

## v17.503 — Easier to see satnav line
- The red satnav line is back to a ribbon with arrows, a little wider and stronger than before, so it is easy to follow. The map line is a solid red line.

## v17.502 — The Getaway: damage
- The robber and the police cars now have 100 health each, shown as a small bar on the scoreboard. Hitting walls, buildings and other cars takes it down (harder knocks hurt more); traffic is never hurt.
- A wrecked robber's car means the police win ("Robber wrecked!"). It is a second way to win, besides three strikes.
- A wrecked police car blows up and is out for 8 seconds, then reappears at the police start with full health. It does not lose the game.
- Hiding a bag in the garage repairs the robber's car completely.

## v17.501 — M for music, black barrels, un-jamming
- Pressing M on the home screen now turns the music on or off (as it already did during a race).
- Apple Crumple has four black-and-yellow barrels, which go off the moment you touch them.
- The Getaway: a computer car that had once waited for you could never push through a jam afterwards (the AI robber could sit in traffic for ever). They now work their way out of jams again.

## v17.500 — The Getaway: steadier result card, tidier screen
- The win/lose card now stays up until you press one of its buttons (or Enter / Esc). A key still held down as the game ends (Space for boost, say) no longer sends you into the next round, and Restart does nothing while the card is up.
- "Robbery in progress!" / "Alarm!" and the pop-up messages are smaller and sit below the scoreboard instead of over the road.
- The satnav line is now a plain red dotted line, on the road and on the map, with no arrows.

## v17.499 — The Getaway: a sharper robber
- "Lose the cops!" is gone: the garage door now does that job, so the police can stop a drop only by ramming the robber or by getting into the garage first.
- The computer robber is harder to follow: it drives about 30% faster while carrying a bag, boosts the whole way to the garage, and picks bags that are further from the police.

## v17.498 — The Getaway: the garage door shuts
- When the robber hides a bag, the garage door comes down behind him (solid, for a few seconds), and a moment later he reappears at a junction on the other side of the town, away from the police and the garage. No more waiting at the safehouse to follow him to the next robbery. This works whichever side you play.

## v17.497 — The track link in the address bar
- While you race one of the game's own tracks, the address bar shows its link (bangersandsmash.co.uk/#the-twister), ready to copy and send. An edited, random or imported track shows nothing, and multiplayer is left alone.

## v17.496 — A way home
- The TV and its "LIVE TV Playback!" slogan are taken off the home page for now (hidden, not deleted).
- A little white house icon, top right beside the cog, takes you back to the home page from a race, The Getaway or multiplayer. (The track editor keeps its own Menu button.)

## v17.495 — Every cog-menu entry reachable on a phone
- On a phone the cog menu was taller than the screen, so Replay, Share race and Menu could not be reached. It now scrolls (and is a little more compact on short screens), so every entry can be tapped.

## v17.494 — Share gives the track's own link
- The share button now copies the short link for the track you are on (bangersandsmash.co.uk/#the-twister, #the-getaway and so on). A track you have edited, or the random one, still shares as the full track link, with your car.

## v17.493 — A web address for every game
- Every track and game now has its own link: bangersandsmash.co.uk/#the-twister, #the-getaway, #apple-crumple and so on (the name of the track, lower case, with dashes; #got-the-hump for the random one). Opening it takes you to that track on the menu, ready to pick your vehicle - it does not start the race.
- #the-getaway/robber and #the-getaway/police go straight into The Getaway as that side.
- The address bar follows you: choosing a track puts its link in the address bar to copy and share, and going back to the menu clears it.

## v17.492 — The Getaway: faster to load, no stuck cars
- Loads faster: the town's traffic is seven cars (three on a phone) drawn from a different handful of vehicle kinds each round, instead of every model at once.
- Cars no longer start (or get stood back up after a flip) on top of one another: police and traffic start at different junctions, and a flipped car is put upright at the nearest junction with no car on it.
- Police patrol at a sensible speed until a robbery starts (they were flipping into the traffic), and only go flat out once the robber has a bag.
- Traffic only stops for cars that are coming the same way or stopped in the road (and always for you), so junctions do not lock up.

## v17.491 — Options start closed
- The Options panel on the menu now starts closed (tap Options to open it).
- The Getaway on a phone has one less traffic car, to keep the game running at full speed.

## v17.490 — The Getaway: lose the cops
- With a bag in the car, if any police car is near the safehouse garage (or right on your tail) the drop will not complete: the screen says "Lose the cops!" as you get close. Shake them off, and the bag goes in as soon as none are near.

## v17.489 — The Getaway: a proper town's traffic
- The town's traffic is now every kind of civilian vehicle in the game (cars, the bus, campervan, motorhome and more; never the police car), ten of them on a computer and four on a phone, and some of the ones that can tow have a caravan on the back.
- Until a robbery starts, the police cars (and the computer robber) stop for any car in front of them, yours included, like the rest of the traffic. When the robber picks up a bag the police drop that and chase as fast as they can.

## v17.488 — The Getaway: garage safehouse, more police
- The safehouse is now a garage cut into a building: drive in through the open door, right to the middle of the bay, to hide the bag. The satnav line and the computer robber both take the turn into the garage.
- Every building has a garage bay in its north face; the safehouse is one of them at a time, marked with a green SAFEHOUSE sign, door posts and a green ring inside.
- When you play the robber there are now four more computer police cars patrolling the streets (two on phones), so any of the five can catch you: any of them ramming you counts. They all show on the map when close, and the siren gets louder as the nearest one gets closer.
- A computer car left in a garage backs straight out again.

## v17.487 — The Getaway: far safehouse, police siren
- When the robber picks up a bag, the safehouse now moves to the far side of the map from where he is.
- If you play the police, your siren now sounds as soon as the robber grabs a bag.

## v17.486 — The Getaway: tidier HUD, police stay on the road
- The red satnav line is thinner and fainter, on the road and on the map.
- The bag you are carrying is now a small icon (with the ram count) above the Bangers and Smash! TV logo, instead of a big sack over your car.
- The computer police only drive straight at you along the same street, and keep to the tarmac, so they stop ploughing into buildings.
- Traffic now stops for any car in front, including yours, and waits until you move away.

## v17.485 — The Getaway: strikes and a satnav line
- New rules: the police no longer pick bags up. Ram the robber three times while he is carrying a bag and the robbery is stopped: the money goes straight back in its bank, the next bag is put out for the robber, and the robber gets a strike. Three strikes and he is in jail (police win). Three bags in the safehouse still wins it for the robbers.
- The scoreboard now shows bags safe (robbers) and strikes (police), and a hint tells you how many times the robber has been rammed.
- A red satnav line (with arrows) runs along the road, and on the map, showing where to go: the robber follows it to the bag and then the safehouse, the police follow it to the robber while the alarm is on.
- The computer police take the shortest route to the robber as soon as he picks a bag up.
- Traffic now drives straight down the streets and turns left or right at random at the junctions (never turning round).
- The computer's cars keep to the tarmac and steer back if they stray onto the pavement.

## v17.484 — The Getaway: compass, sidewalks and traffic
- A compass beside the map (for both robbers and police) shows which way North is, turning as you drive. North is the top of the map.
- The streets now have pavements and kerb lines.
- Ordinary cars (taxi, Mini, Volvo, Panda and BMW) now drive about the town, keeping left. They are solid, so they get in the way, but they never knock the bag out of the robber's car: only the other player can. Fewer on phones.
- The computer's drivers are much neater: they follow the streets in the left lane, slow down and take corners properly instead of cutting them, no longer turn round at junctions, and keep back from other cars.

## v17.483 — The Getaway: the police lose you
- The police siren now sounds only while the robber is carrying a bag (the alarm is on). Once the bag is in the safehouse the police lose you, and the computer police go back to cruising past the banks until the next robbery.

## v17.482 — The Getaway: one bag at a time
- Bags are now small and tucked into a street corner by their bank.
- Only one bag is out at a time. The robber sees it on the map; the police don't know where it is until the alarm goes. Drop one off and the next bag turns up at a different, random bank.
- Every time the robber drops a bag off, the safehouse moves somewhere else.
- The track list heading is now "Driving Tests (beta)" and The Getaway sits under it with Apple Crumple.
- The police siren now wails through the town: faint when the police are far away, loud when they are right behind you, so the robber can hear them coming.

## v17.481 — The Getaway (cops and robbers)
- New game under "Cops and Robbers" in the track list: **The Getaway**. A small town of 4 x 3 blocks with a bank on every block and a bag of money lying in the street outside each one.
- Play the **Robber** (the Dodge): drive over a bag (one at a time) and take it to the safehouse, which is hidden in a different random spot each round. Three bags safe and the robbers win.
- Or play the **Police** (the police car): you start at the far end of town with a street map. The moment a bag is picked up the map flashes "Robbery in progress" and shows the robber. Ram him hard to knock the bag out of his car, drive over it and return it to its bank. Three bags back and the robbers are jailed.
- This version is you against the computer (it plays the other side). Sides swap each round. Online two-player is next.
- Buildings are solid: the town has its own walls and blocks to drive into. The Dodge and the police car are lent to you for the game, and your chosen vehicle comes back afterwards.

## v17.480 — Menu TV, open Apple Crumple
- The TV on the main menu now sits lower, clear of the edition badge, and reads "LIVE TV Playback!" underneath instead of the cassette and "Record your greatest hit!".
- Apple Crumple no longer asks for a password: anyone can pick it from the track list.

## v17.479 — Housekeeping
- Fixed the asset version number that was left behind at v17.467, so the latest files and car models are always fetched fresh; tidied the v17.468 and v17.469 notes in this log.

## v17.478 — Replay dock restored
- Mobile and tablet replay controls once again slide/tuck down and return when the tab is tapped.
- Removed the separate top-right Back to game button; Back to game remains in the replay controls.

## v17.477 — Replay controls stay visible
- Tablet and mobile replay controls no longer tuck away behind the dock.
- Available replay controls now stay visible and use a tighter wrapping layout so they fit smaller screens.

## v17.476 — Replay exit always visible on touch
- Phones and tablets now keep a Back to game button visible in the top-right of the replay screen, even when the bottom replay controls are tucked away.

## v17.475 — Larger edition badge
- The top-right Desktop/Tablet/Mobile Edition and version badge is now 50% larger on all devices.

## v17.474 — Bigger tablet quick controls + horn
- Tablet camera and quick-action icons are now 50% larger than mobile.
- Added a hold-to-honk Horn button to the quick-action stack on both mobile and tablet. It uses the existing horn input/behaviour; gameplay is unchanged.

## v17.473 — Version joins edition label
- The version number now sits in the top-right badge after Desktop Edition, Tablet Edition or Mobile Edition instead of appearing in the main menu.

## v17.472 — Tablet controls fixed
- The camera, mirror, back-on-road and explode buttons now show on larger tablets too, including wide iPads.
- The tablet damage chart is about 30% larger. Gameplay is unchanged.

## v17.471 — Tablet screen controls
- Tablets now get the same on-screen camera and quick-action buttons as mobile: mirror, back on road and explode. This is UI-only; gameplay behaviour is unchanged.

## v17.470 — Device edition label restored
- Restored the small top-right Desktop Edition, Tablet Edition or Mobile Edition label on the main menu. No gameplay or audio code changed.

## v17.469 — Edition label rolled back
- Removed the new Desktop/Tablet/Mobile Edition corner label after sound was reported missing. No gameplay or audio code was changed.

## v17.468 — Device edition label
- A small top-right label on the main menu now identifies the current version as Desktop Edition, Tablet Edition or Mobile Edition.

## v17.467 — Hazards move in the replay
- Apple Crumple: the hammers, spinners, rolling rocks and presses now move in the replay (and in made movies) exactly as they did in your run; they used to stand frozen.

## v17.466 — Solid spinners
- Apple Crumple: the spinning bars (and their poles) are now properly solid. Before, they only gave you a knock and you could carry on through; now you are stopped, pushed out and bounced off, with the same damage as before.

## v17.465 — Tidier phone replay
- The Film shape and In a TV set choices are gone from the replay on a phone.

## v17.464 — More replay on a phone
- On a phone the replay controls now tuck down out of the way, leaving the whole screen for the replay; tap the little tab at the bottom to bring them back up (and again to put them away).

## v17.463 — Simpler graphics quality
- Starting quality is now just: computers on High, phones and tablets on Medium (you can still pick any level in Settings). The old special cases for older phones are gone for now, until mobile has been tested.

## v17.462 — Lights and podium on every race
- Every race against rivals now starts with the Red, Red, Green! lights (also when you restart). Demolition, arenas and Apple Crumple are not races, so they start as before.
- Race Day races now finish with the podium too; the stage results come up once you close it.

## v17.461 — Site publishing fixed
- Updates since v17.456 were not reaching the live site (a stray file stopped the site build); fixed, so everything from v17.457 on goes out together.

## v17.460 — Fair and square multiplayer
- In multiplayer every car now pulls and tops out at the same speed, whatever it is (weight, handling and crash damage still differ).
- Other players now show up as the car they actually chose, instead of everyone looking like the first car.
- The lethal black barrels lose their yellow stripes and get a yellow skull and crossbones instead.

## v17.459 — Start lights in multiplayer
- Multiplayer races now begin with the Red, Red, Green! start lights, like Race Day. Everyone is held on the grid and the lights go out at the same moment for all players.

## v17.458 — Join chime
- A two-note chime plays in the multiplayer lobby whenever someone joins the room.

## v17.457 — Proper bumps in multiplayer
- Car-to-car contact in multiplayer now works like the solo game: a real two-car impact (heavier cars shove lighter ones, off-centre hits spin you), a little bounce on hard hits, and a dent, health loss, sparks, smoke, debris and crash sound on BOTH cars - not just the one that got rammed.

## v17.456 — Podium comes back properly
- Coming back to the podium after watching a replay (or making a movie) showed a blank white box instead of the podium; it now gets a fresh drawing surface each time and shows the cars again.

## v17.455 — Race Day: 1 lap
- Race Day now starts on 1 lap (it remembers what you pick afterwards) and the lap choice goes up to 5 laps, both on the Race Day screen and in Settings. The Race Day button's sub-title is now "Jump in and put your foot down!". (Multiplayer races stay at up to 3 laps.)

## v17.454 — Lethal black barrels
- New black barrels with yellow hazard stripes: they explode the instant anything touches them, and every car within about 7 m of the blast (you or the rivals) is wrecked on the spot. About one in six barrels on the Barrels track is one, scattered at random with the red ones, and a few turn up on random circuits too. (Not during the spawn grace after a start or respawn.)

## v17.453 — Rivals keep up with your car
- In races the rivals now cruise at the pace of the car you chose: they follow the fastest speed your car has been showing lately (about 90% of it on Normal, 95% on Hard, 100% on Expert), instead of a fixed top speed, so a fast car can't simply leave them behind. Bends still slow them as before.

## v17.452 — Replay from the podium
- Multiplayer races are now recorded (you and the other players' cars), and the podium has a "Watch replay" button. When the replay ends you are back on the podium.

## v17.451 — AI cars lean with banked roads
- Rival cars were being held level with the flat ground by their anti-roll stabiliser, so on banked roads they stood upright instead of leaning with the road (and floated off it). The stabiliser now measures roll against the road under the wheels, so rivals (and the player's drift/caravan guard) bank with the track.

## v17.450 — Merged holes, banked Bluebell
- Holy Moley: when the same spot is hit again and again, its small holes run together into one bigger hole.
- Bluebell Woods: every corner now banks into the turn, up to the maximum 20 degrees on the tighter ones (not at the start or beside a jump).

## v17.449 — Ragged debris
- Crash debris is no longer square: the pieces are ragged, uneven shards in a mix of sizes — small chips, mid-size bits, long slivers and the odd large panel.

## v17.448 — Several small holes
- Holy Moley: a deep crumple now tears two or three small holes scattered over it instead of one big one.

## v17.447 — Holy Moley on by default
- Holy Moley (real damage) is now on by default, including for players who had the old default saved. Switching it off in settings still sticks.

## v17.446 — Even music levels
- All the tunes now play at the same loudness (each was measured and levelled: the fairground tune was much louder than the rock one), and the music as a whole sits a little lower than the sound effects. Applies to the menu, in-game and movie soundtracks.

## v17.445 — In the lift
- New tune "In the lift" (the movie-editing music) in the Tune choices (menu, settings and in-game) and as a movie soundtrack.

## v17.444 — Rival bell and siren
- When rival cars honk as you approach, a rival bus now rings its bell and a rival police car sounds its siren (also in the replay), instead of the normal horn.

## v17.443 — Tyres not black
- Holy Moley: the black inside a hole no longer spreads to the tyres (they now have their own material instead of sharing the body's).

## v17.442 — Smaller holes
- Holy Moley holes are about 40% smaller.

## v17.441 — Black holes
- Holy Moley: the inside seen through a torn hole is now plain black (no lighting or reflections), instead of showing the inside of the model.

## v17.440 — Sharper holes
- Holy Moley holes now look like torn sheet metal: a crisp jagged edge with only a thin burnt rim (no more graduated dark fade), steep walls and a flat floor, and no paint smudging round the tear.

## v17.439 — Holy Moley (real damage)
- New setting, off by default: Holy Moley (real damage). When it is on, a hard enough crash tears a ragged hole right through the bodywork (dark, scorched edges, the dark inside of the car showing through) and pieces of panel and sparks fly off. It uses the existing dents, so it costs almost nothing, and only the shader switches on - the car models are untouched.

## v17.438 — Shared tracks: solo or with other cars
- When a friend sends you a track link, you can now choose "Drive it solo" (just your car on the track) or "Drive it with other cars" (the usual rivals).

## v17.437 — Boulder rumble
- boulder.mp3 plays when a rolling boulder sets off, on Apple Crumple and on Bluebell Woods (and any other track with rolling rocks), quieter with distance.

## v17.436 — Apple Crumple replay
- The result card at the end of Apple Crumple has a Watch replay button; when the replay ends the card is back so you can try again. (The hazards themselves don't animate in the replay yet.)
- The yellow warning signs now face you with a clean front; their posts are on the back.
- crusher.mp3 is now in the sounds folder, so all four hazard sounds are in.

## v17.435 — Apple Crumple: stages, flaming hoop, fireworks
- The yellow hazard stripes and checkpoint strips now lie flat on the road (they used to hover on hills and banks).
- Every stage (the road between checkpoints) now has its own clock: 20 s for the first, then 18, 16, 14 and 12. Reaching a checkpoint starts the next stage's clock afresh; run out of time in a stage and the run is over. A wreck now costs 5 s, a fall or reset 3 s.
- A new finale: a long ramp up to a second jump, with a flaming hoop hanging over the gap. Fly through it to finish (miss it and you still finish, with +10 s), then enjoy the fireworks. Medal times are now gold 58 s, silver 68 s, bronze 80 s.
- Sounds wired in: hammer.mp3 (each swing), crusher.mp3 (each slam), flame.mp3 (each burst of fire) and fireworks.mp3 (at the finish), quieter with distance. Drop the files into the sounds folder; the game just stays silent for any that are missing.

## v17.434 — Bigger pizza toppings, smarter rivals round drums
- Deep Pan Pizza: the olive humps are 50% higher and the cheese dips 50% deeper.
- Rival cars now see explosive drums much earlier, slow down for the ones in their path, and swerve round them (using nearly the whole road, and not drifting back through them). On the road tracks the rivals set off roughly half as many drums as before - far fewer on the thin road - and in the arena the rivals steer round drums too, even while charging at a target.

## v17.433 — Bug sweep
- Fixed Deep Pan Pizza: two of the cheese dips were silently missing (eight olive humps but only six dips). It now has six humps and six dips, properly spaced out, none close to where you start.
- Brought the automated tests up to date with earlier deliberate changes (single-life Last One Standing, Expert skill 1.3, Arcade-only handling, new button wording, pizza sauce colour, movie soundtrack rule); the test suite is now fully green.

## v17.432 — Apple Crumple is deadlier
- The hammers, the crushing presses and the fire pits now wreck your car outright (boulders and the spinning arm still just knock you about).
- You have 3 spanners (lives) on the course: each wreck uses one (and costs +10 s), and when they run out the car is scrapped and the run ends.
- Resetting with B on the course costs time, not a spanner.

## v17.431 — Apple Crumple tweaks
- Fixed: the "Try again" and "Menu" buttons on the result card could not be clicked (Enter and Esc work too).
- More hills round the course.
- Boulders are now plain rocks.
- New hazard: random fire pits that shoot a column of flame into the air, burning and throwing any car above them.
- Apple Crumple asks for a password until it is ready.

## v17.430 — Apple Crumple, the obstacle course (feature branch)
- New solo timed obstacle course in **Driving Tests**: swinging hammers, rolling boulders, a spinning arm, crushing presses, exploding barrels, a big jump and a final gauntlet.
- Beat the clock: start lights, a countdown timer, four checkpoints that repair your car and act as restart points, and a finish line with a result card, medals and best time.
- Wrecks cost +10 s, falling off or resetting +5 s; you restart at your last checkpoint.
- Every hazard is real: it touches your car, shoves it and takes hit points off the zone it hit. Warning signs and hazard stripes come before each one.

## v17.428 — Apple Crumple moved to Driving Tests
- Moved **Apple Crumple** out of Wacky Racing and into **Driving Tests**.
- Driving Tests is now a real section rather than showing only “Coming soon…”.

## v17.427 — Apple Crumple startup fix
- Fixed the game-wide startup crash introduced by Apple Crumple.
- The obstacle-course barrel generator now rounds coordinates directly instead of calling an out-of-scope helper.

## v17.426 — Apple Crumple
- Added **Apple Crumple** under Wacky Racing as a solo one-lap assault course.
- Added deterministic swinging demolition hammers with real car impacts and denting.
- Added three triggered rolling boulder crossings, barrel slaloms and a jump.
- Added a 90-second target clock; overtime is allowed so a run is never simply thrown away.
- Apple Crumple is currently **solo only** and excluded from Multiplayer and Race Day.
- Normal race podium is suppressed; finishing shows **Course complete!** and your run time.

## v17.425 — More visible crumple damage
- Increased visual dent depth and radius by roughly **25–30%**.
- Smaller genuine impacts can now leave a visible dent.
- Bigger impacts reach strong crumple deformation sooner.
- This is **visual only**: car HP, crash damage and wrecking strength are unchanged.

## v17.424 — Race Day stage-flow fix
- Race Day no longer opens the generic solo podium after each championship stage.
- The finish message remains visible for about **5 seconds**, then the Race Day results panel appears.
- Championship stages can now continue normally via **Next stage** instead of being covered by the podium.

## v17.423 — Buckle Up race-mode fix
- Fixed an old saved **Demolition** mode leaking into **Buckle up!** after the Options simplification.
- Buckle up now always starts a normal **1-lap race** on a random circuit.
- **Deep Pan Pizza / Demolition Day** still forces Last One Standing from the arena track itself.

## v17.422 — Podium car colours
- Solo AI podium cars now keep the same paint colour they used during the race.
- Wacky Racing podiums continue to use each rival's actual vehicle as well as its race colour.
- Multiplayer podiums use each player's transmitted name, chosen vehicle and colour.
- Added the same special recolouring path used by pale/neutral-body vehicles so podium paint matches the race more closely.

## v17.421 — Arcade-only cleanup
- Removed the final obsolete code that still referenced the old Handling dropdown.
- Prevents a menu error now that Handling has been removed from Options.

## v17.420 — Simplified game setup
- **Buckle up!** is now always a quick **1-lap random race**.
- Buckle up respects the optional **Vehicles** choice below: **Mixed vehicles** or **Same vehicle, different colours**.
- Removed Demolition from the Options selector; **Demolition Day** is the dedicated Last One Standing experience and still launches Deep Pan Pizza.
- **Race Day** is unchanged.
- Removed the Handling selector and forced **Arcade handling throughout**, including for players with an old Standard setting saved.

## v17.419 — Deep Pan Pizza previews
- The large editor map now shows Deep Pan Pizza with its crust, dark sauce, olive humps and cheese dips instead of a plain arena disc.
- The editor 3D preview now uses a pizza texture generated from the same bump/topping data as the playable arena.
- The home-page track preview uses that same 3D preview renderer, so selecting Deep Pan Pizza now shows the pizza there too.

## v17.418 — Deep Pan Pizza visual tune
- Darkened the red tomato sauce base.
- Increased the cheese circles/dips by **30%**.
- Increased spacing between pizza toppings so the arena looks less tightly patterned and more like a real pizza.

## v17.417 — Podium after race finish
- Solo race finish/win message now remains readable for a full **5 seconds**.
- After those 5 seconds, the podium appears automatically using the actual finishing order and vehicles from that race.
- The podium now says **You came 1st!** when the local player wins.

## v17.416 — Wacky Racing label
- Renamed the game-mode option to **Wacky Racing - a mix of vehicles**.

## v17.415 — Mobile icon spacing
- Increased the vertical spacing between the small mobile quick-action icons.
- Moved the camera-cycle icon slightly higher above Boost for clearer separation.

## v17.414 — Mobile quick actions
- Added three small white vertical buttons above the phone speedometer: Mirror, Back on road and Explode.
- Each uses the existing game action so behaviour matches the desktop/cog controls.

## v17.413 — Mobile camera button
- Added a small white camera-cycle icon directly above Boost on phones.
- It uses the same camera switching behaviour as the existing C/LB camera control.

## v17.412 — Mobile Auto performance
- Auto graphics now starts **phones at Medium** instead of High.
- Auto keeps **tablets at High**.
- Medium quality on touch devices now runs vehicle physics at **60Hz** instead of 120Hz; headless lap testing already showed equivalent handling at 60Hz.
- Manual **Low / Medium / High** quality choices still take priority over Auto.
- Existing adaptive resolution remains active and can still reduce render resolution or disable expensive features when frame rate falls.

## v17.411 — Mobile home buttons
- Big home-screen race buttons now use the full available phone width.

## v17.410 — Custom music reset
- Added Reset for locally uploaded music.
- Reset deletes the stored browser copy and returns Custom music to Lounge when needed.

## v17.409 — Last One Standing
- Player now has one life: first wreck means elimination and the round ends.

## v17.408 — Movie Maker music safety
- User-uploaded custom music is gameplay-only and cannot be included in exported movies.

## v17.407 — Solid trees
- Scenery tree trunks now have physical collision.

## v17.406 — Custom music
- Players can upload a local music track and keep it in IndexedDB on that browser/device.

## v17.405 — Tougher, steadier AI
- Increased default race AI pace and catch-up pressure.
- Added AI-only anti-roll assistance to reduce rival rollovers.

## v17.404 — Mobile holding screen
- Added “Try it anyway…” so phone/tablet users can enter the existing touch version.

## v17.403 — Mobile/tablet notice
- Added the larger-screen recommendation screen for mobile and tablet visitors.
