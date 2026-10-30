# Bangers & Smash! — Change Log

This file records notable user-facing changes. New entries go at the top.

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
