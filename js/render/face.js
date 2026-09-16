/**
 * HUNGRY NOODLE — what the noodle is feeling right now.
 *
 * Pure presentation logic derived from engine state, shared by the 2D and 3D
 * renderers so the noodle has the same personality either way.
 */
(function (NS) {
  'use strict';

  const CONFIG = NS.CONFIG;
  const GameState = NS.GameState;
  const clamp = NS.clamp;

  /** Manhattan distance from the head to the snack, in cells. */
  function foodDistance(state) {
    const head = state.snake[0];
    if (!head) return 99;
    return Math.abs(state.food.x - head.x) + Math.abs(state.food.y - head.y);
  }

  function expressionFor(state, now) {
    if (state.status === GameState.GAME_OVER) {
      if (state.deathCause === 'win') return 'eating';
      return now - state.diedAt < CONFIG.HURT_MS ? 'hurt' : 'dead';
    }
    if (now - state.lastEatAt < CONFIG.CHEW_MS) return 'eating';
    if (state.status === GameState.PLAYING) {
      if (state.level >= 7) return 'fast';
      if (foodDistance(state) <= CONFIG.HUNGRY_RANGE) return 'hungry';
    }
    return 'idle';
  }

  /**
   * @returns {{dir, expression, chew, blink, tongue, look, grow, speed}}
   */
  NS.noodleFace = function noodleFace(state, now, reduced) {
    const expression = expressionFor(state, now);
    const sinceEat = now - state.lastEatAt;

    // A chew is one open-close pulse
    const chew = sinceEat < CONFIG.CHEW_MS
      ? Math.sin((sinceEat / CONFIG.CHEW_MS) * Math.PI)
      : 0;

    // Blink every ~3.4s unless the face is already busy
    let blink = 0;
    if (!reduced && expression !== 'dead' && expression !== 'eating') {
      const phase = now % 3400;
      if (phase < 140) blink = Math.sin((phase / 140) * Math.PI);
    }

    const tongue = expression === 'hungry'
      ? 0.45 + 0.35 * Math.sin(now / 180)
      : (expression === 'dead' ? 1 : 0);

    // Pupils: mostly the heading, nudged toward whatever smells good
    const head = state.snake[0] || { x: 0, y: 0 };
    const dx = state.food.x - head.x;
    const dy = state.food.y - head.y;
    const length = Math.hypot(dx, dy) || 1;

    const levelCap = state.mode ? state.mode.levelCap : CONFIG.MAX_LEVEL;

    return {
      dir: NS.DIRECTIONS[state.direction],
      expression,
      chew,
      blink,
      tongue,
      look: {
        x: clamp(dx / length, -1, 1) * 0.55,
        y: clamp(dy / length, -1, 1) * 0.55,
      },
      // How far through the swallow-bulge we are (0 = none)
      grow: sinceEat < CONFIG.GROW_MS ? clamp(sinceEat / CONFIG.GROW_MS, 0, 1) : 0,
      speed: clamp((state.level - 1) / Math.max(1, Math.min(levelCap, 10) - 1), 0, 1),
      dead: state.status === GameState.GAME_OVER && state.deathCause !== 'win',
    };
  };
}(window.HungryNoodle));
