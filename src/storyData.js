// The rules of story mode (see storyMode.js for how they are played): four circuits, eight laps, top five of nine go through each stage.

export const STORY = {
  rivals: 8,
  qualify: 5,
  stages: [
    { key: 'speedway',  laps: 1, skill: 0.4,  level: 'Easy' },
    { key: 'technical', laps: 2, skill: 0.55, level: 'Medium' },
    { key: 'hills',     laps: 2, skill: 0.75, level: 'Hard' },
    { key: 'overpass',  laps: 3, skill: 0.85, level: 'Hard' },
  ],
};
/** Does finishing in `place` of `total` take you through? (Five of nine; with a small field, everyone but last.) */
export function qualifies(place, total) { return place <= Math.min(STORY.qualify, Math.max(1, total - 1)); }

