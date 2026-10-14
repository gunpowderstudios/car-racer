// The rules of story mode (see storyMode.js for how they are played): four circuits, eight laps, a points championship.
// Every stage pays 5 / 3 / 2 / 1 points to the first four home. After stages 1-3 the standings are cut: only the top
// `keep[stage]` drivers (you and the named rivals alike) go on. After the final, the points leader is champion.

export const STORY = {
  rivals: 8,
  points: [5, 3, 2, 1],
  keep: [5, 4, 3],
  stages: [
    { key: 'speedway',  laps: 1, skill: 0.4,  level: 'Easy' },
    { key: 'technical', laps: 2, skill: 0.55, level: 'Medium' },
    { key: 'hills',     laps: 2, skill: 0.75, level: 'Hard' },
    { key: 'overpass',  laps: 3, skill: 0.85, level: 'Hard' },
  ],
  // The regulars. `skill` nudges their driving up or down from the stage's level, so each has a different pace.
  roster: [
    { id: 'rusty',  name: 'Rusty Nutter',     skill: 0 },
    { id: 'granny', name: 'Granny Smash',     skill: -0.12 },
    { id: 'baron',  name: 'Baron Von Bumper', skill: 0.1 },
    { id: 'mavis',  name: 'Mavis Muffler',    skill: -0.06 },
    { id: 'nigel',  name: 'Nigel Nitro',      skill: 0.15 },
    { id: 'tel',    name: 'Big Tel',          skill: 0.05 },
    { id: 'gaz',    name: 'Gaz Gearbox',      skill: -0.02 },
    { id: 'crumpet', name: 'Lady Crumpet',    skill: 0.12 },
  ],
};

/** Points for finishing in `place` (1 = first). */
export function pointsFor(place) { return STORY.points[place - 1] || 0; }

/** Fresh championship: everyone on zero. `ids` = every driver, the player first. */
export function newTable(ids) {
  const t = {};
  for (const id of ids) t[id] = { id, pts: 0, wins: 0, last: 99 };
  return t;
}

/** Add one stage's result to `table`. `order` = driver ids, first home first; anyone not listed scores nothing. */
export function addStage(table, order) {
  order.forEach((id, i) => { const r = table[id]; if (!r) return; r.pts += pointsFor(i + 1); if (i === 0) r.wins++; r.last = i + 1; });
  for (const id of Object.keys(table)) if (!order.includes(id)) table[id].last = 99;
}

/** The table as a ranked list: points, then wins, then the latest stage's finish. */
export function standings(table) {
  return Object.values(table).sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.last - b.last);
}

/** Drivers still in after stage `stage` (0-based); the last stage cuts nobody. */
export function survivors(table, stage) {
  const k = STORY.keep[stage];
  const s = standings(table);
  return (k ? s.slice(0, k) : s).map((r) => r.id);
}
