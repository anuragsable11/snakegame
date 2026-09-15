/**
 * HUNGRY NOODLE — shared configuration, enums and storage.
 *
 * Every module hangs off the single `HungryNoodle` global. Plain classic
 * scripts (not ES modules) on purpose: the game has to run by double-clicking
 * index.html, and browsers refuse to load ES modules over file://.
 *
 * Load order matters — this file comes first.
 */
window.HungryNoodle = window.HungryNoodle || {};

(function (NS) {
  'use strict';

  /* ---------------------------------------------------------------- Rules */

  NS.CONFIG = Object.freeze({
    GRID_SIZE: 20,          // board is GRID_SIZE x GRID_SIZE cells
    START_LENGTH: 3,        // segments the noodle starts with
    BASE_STEP_MS: 150,      // ms between moves at level 1
    STEP_DECREMENT_MS: 9,   // ms shaved off per level gained
    MIN_STEP_MS: 66,        // speed ceiling
    FOOD_PER_LEVEL: 4,      // fruits needed to advance one level
    MAX_LEVEL: 10,
    POINTS_PER_FOOD: 10,    // multiplied by the current level
    MAX_QUEUED_TURNS: 2,    // buffered turns, so fast inputs aren't lost
    STREAK_WINDOW_MS: 4200, // eat again inside this to keep a hunger streak
    CHEW_MS: 280,           // how long the "eating" face lasts
    GROW_MS: 620,           // how long the swallow-bulge travels the body
    HURT_MS: 520,           // how long the "ouch" face lasts before going dead
    HUNGRY_RANGE: 4,        // cells away that food starts making eyes widen
    TOAST_MS: 1700,         // how long a speech bubble stays up
  });

  NS.STORAGE_KEYS = Object.freeze({
    HIGH_SCORE: 'snake.highScore.v1',  // kept from v1 so old scores survive
    MUTED: 'snake.muted.v1',
    THEME: 'noodle.theme.v1',
  });

  /** The four states the game can be in. */
  NS.GameState = Object.freeze({
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
  });

  NS.DIRECTIONS = Object.freeze({
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  });

  NS.OPPOSITE = Object.freeze({
    up: 'down', down: 'up', left: 'right', right: 'left',
  });

  /** Arrow keys and WASD both steer. */
  NS.KEY_TO_DIRECTION = Object.freeze({
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
  });

  /* -------------------------------------------------------------- Helpers */

  NS.clamp = function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  /** Smooth 0..1 ramp — used all over the animation code. */
  NS.easeOutCubic = function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  };

  NS.easeOutBack = function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  NS.prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------------------------- Storage */

  /** localStorage that never throws — private mode and full quotas included. */
  NS.storage = {
    read(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    write(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (error) {
        /* Nothing to do — the score just won't persist this session. */
      }
    },
  };
}(window.HungryNoodle));
