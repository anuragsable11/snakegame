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

  /**
   * The prey, as pure data. Both renderers map over this by index — the 2D
   * one attaches a canvas `draw`, the 3D one builds a Three.js group — so
   * the engine can talk about "food type 3" without knowing what a frog is.
   *
   * Order is part of the replay contract: a stored replay reproduces food
   * type 3, so reordering this list would change what old replays show.
   * Appending is safe; reordering is not.
   */
  NS.FOOD_CATALOGUE = Object.freeze([
    { id: 'beetle', name: 'beetle', crumb: '#4a6b3a' },
    { id: 'cricket', name: 'cricket', crumb: '#7fae3a' },
    { id: 'spider', name: 'spider', crumb: '#3a3340' },
    { id: 'grub', name: 'grub', crumb: '#e8dcae' },
    { id: 'frog', name: 'frog', crumb: '#4fa84f' },
    { id: 'mouse', name: 'mouse', crumb: '#8a7a6a' },
    { id: 'lizard', name: 'lizard', crumb: '#7f9a4a' },
    { id: 'egg', name: 'egg', crumb: '#e8e0cc' },
  ]);

  NS.FOOD_TYPES = NS.FOOD_CATALOGUE.length;

  NS.CONFIG = Object.freeze({
    GRID_SIZE: 20,          // board is GRID_SIZE x GRID_SIZE cells
    START_LENGTH: 3,        // segments the noodle starts with
    MAX_LEVEL: 10,          // default cap; each mode can raise it
    POINTS_PER_FOOD: 10,    // multiplied by the current level
    MAX_QUEUED_TURNS: 2,    // buffered turns, so fast inputs aren't lost
    STREAK_WINDOW_MS: 4200, // eat again inside this to keep a hunger streak
    // Speed, level pacing and obstacles now live in NS.DIFFICULTIES / NS.MODES
    // (see core/engine.js) so difficulty changes real numbers, not labels.
    CHEW_MS: 280,           // how long the "eating" face lasts
    GROW_MS: 620,           // how long the swallow-bulge travels the body
    HURT_MS: 520,           // how long the "ouch" face lasts before going dead
    HUNGRY_RANGE: 4,        // cells away that food starts making eyes widen
    TOAST_MS: 1700,         // how long a speech bubble stays up
  });

  NS.STORAGE_KEYS = Object.freeze({
    HIGH_SCORE: 'snake.highScore.v1',  // classic: kept from v1 so old scores survive
    HIGH_SCORE_PREFIX: 'noodle.high.',  // per-mode bests: noodle.high.<mode>
    MUTED: 'snake.muted.v1',
    THEME: 'noodle.theme.v1',
    MODE: 'noodle.mode.v1',
    DIFFICULTY: 'noodle.difficulty.v1',
    RENDERER: 'noodle.renderer.v1',
  });

  /** Classic keeps the original key so existing high scores survive. */
  NS.highScoreKey = function highScoreKey(modeId) {
    return modeId === 'classic'
      ? NS.STORAGE_KEYS.HIGH_SCORE
      : NS.STORAGE_KEYS.HIGH_SCORE_PREFIX + modeId;
  };

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
