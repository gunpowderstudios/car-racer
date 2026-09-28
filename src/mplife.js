// A multiplayer driver's life: health, being wrecked, and coming back. Pure logic - no rendering, no network -
// so the rules can be tested. main.js owns what it looks and sounds like (the explosion, the banner, the repositioning).

export const LIFE = {
  respawnDelay: 3,   // seconds a wrecked car sits there smoking before it is put back on the road
  grace: 3,          // seconds of protection after coming back, so you can't be killed again on the spot
};

export class Life {
  constructor() { this.reset(); }

  /** Full health, not wrecked, no timers running. */
  reset() { this.health = 1; this.exploded = false; this.respawnAt = Infinity; this.graceUntil = 0; }

  get dead() { return this.health <= 0; }

  /** Still in the moment of protection after a respawn (`t` is game time in seconds). */
  invulnerable(t) { return t < this.graceUntil; }

  /**
   * Take `amount` (a fraction of full health) off at time `t`. Returns 'died' if this was the blow that wrecked you
   * (explode now - and come back after the delay), 'hurt' if you took damage and are still going, or null if nothing
   * happened: you're already wrecked, still protected, or the amount was nothing.
   */
  damage(amount, t) {
    if (this.dead || this.invulnerable(t) || !(amount > 0)) return null;
    this.health = Math.max(0, this.health - amount);
    if (this.health > 0) return 'hurt';
    this.exploded = true; this.respawnAt = t + LIFE.respawnDelay;
    return 'died';
  }

  /** Call every frame. Once a wrecked car has waited long enough, brings it back (full health, briefly protected) and
   *  returns true - exactly once per death - so the caller can put the car back on the road. */
  respawnDue(t) {
    if (!this.dead || t < this.respawnAt) return false;
    this.health = 1; this.exploded = false; this.respawnAt = Infinity; this.graceUntil = t + LIFE.grace;
    return true;
  }
}
