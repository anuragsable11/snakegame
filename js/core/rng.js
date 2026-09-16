/**
 * HUNGRY NOODLE 3D — seeded pseudo-random number generator.
 *
 * Every gameplay-affecting random decision goes through this. Given the same
 * seed it produces the same sequence in every browser and in Node, which is
 * what makes runs reproducible and replays verifiable.
 *
 * Algorithm: mulberry32. Chosen because it is tiny, fast, has a single uint32
 * of state (so it serialises trivially), and only uses operations that are
 * exactly defined in JavaScript — `Math.imul`, `|0`, `>>>`. No floating point
 * accumulates, so there is no platform drift.
 *
 * This is NOT cryptographically secure and is not meant to be.
 */
(function (NS) {
  'use strict';

  const UINT32 = 4294967296;

  /**
   * FNV-1a, 32-bit. Used to turn strings (like a date) into a seed, and to
   * fingerprint simulation state.
   * @param {string} text
   * @param {number} [seed]
   * @returns {number} unsigned 32-bit integer
   */
  NS.hashString = function hashString(text, seed) {
    let hash = seed === undefined ? 0x811c9dc5 : seed >>> 0;
    const input = String(text);
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      // hash *= 16777619, kept in 32-bit range
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  };

  /**
   * A seeded generator.
   *
   * @param {number|string} seed
   * @returns {{
   *   next: function(): number,
   *   int: function(number, number): number,
   *   below: function(number): number,
   *   pick: function(Array): *,
   *   getState: function(): number,
   *   setState: function(number): void,
   *   clone: function(): object,
   *   seed: number
   * }}
   */
  NS.createRng = function createRng(seed) {
    const initial = typeof seed === 'number'
      ? seed >>> 0
      : NS.hashString(seed === undefined ? 'hungry-noodle' : seed);

    let state = initial;

    const api = {
      seed: initial,

      /** @returns {number} float in [0, 1) */
      next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / UINT32;
      },

      /** @returns {number} integer in [0, bound), or 0 when bound < 1 */
      below(bound) {
        if (!(bound > 0)) return 0;
        return Math.floor(api.next() * bound);
      },

      /** @returns {number} integer in [min, max] inclusive */
      int(min, max) {
        const low = Math.ceil(Math.min(min, max));
        const high = Math.floor(Math.max(min, max));
        return low + api.below(high - low + 1);
      },

      /** @returns {*} a uniformly chosen element, or undefined when empty */
      pick(list) {
        if (!list || list.length === 0) return undefined;
        return list[api.below(list.length)];
      },

      /** The whole generator state — one uint32. */
      getState() {
        return state >>> 0;
      },

      setState(value) {
        state = value >>> 0;
      },

      /** An independent generator positioned exactly here. */
      clone() {
        const copy = NS.createRng(initial);
        copy.setState(state);
        return copy;
      },
    };

    return api;
  };

  /**
   * A seed that is safe to show a player and to round-trip through JSON.
   * @returns {number} unsigned 32-bit integer
   */
  NS.randomSeed = function randomSeed() {
    // Presentation-level randomness: choosing which run to play is not part of
    // the simulation, and the chosen value is recorded in the replay.
    return (Math.random() * UINT32) >>> 0;
  };
}(window.HungryNoodle));
