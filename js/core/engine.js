/**
 * HUNGRY NOODLE 3D — the game engine.
 *
 * This file is the single source of truth for what is happening in the game,
 * and it knows NOTHING about how any of it is drawn. No DOM, no canvas, no
 * Three.js, no audio — just grid coordinates, rules and events.
 *
 * Renderers read `engine.state` and `engine.alpha()`; everything else
 * subscribes to events with `engine.on(...)`. That separation is what lets the
 * same game run through the 2D canvas renderer or the Three.js one.
 */
(function (NS) {
  'use strict';

  const DIRECTIONS = NS.DIRECTIONS;
  const OPPOSITE = NS.OPPOSITE;
  const GameState = NS.GameState;
  const clamp = NS.clamp;

  /* ====================================================================== *
   * Modes and difficulties — these change real variables, not just labels
   * ====================================================================== */

  NS.MODES = {
    classic: {
      id: 'classic',
      name: 'Classic',
      emoji: '🐍',
      blurb: 'Walls kill. Pure, traditional Snake.',
      wrap: false,
      obstacles: false,
      timed: false,
      levelCap: 10,
    },
    timeattack: {
      id: 'timeattack',
      name: 'Time Attack',
      emoji: '⏱️',
      blurb: 'Race the clock. Every snack buys you seconds.',
      wrap: false,
      obstacles: false,
      timed: true,
      levelCap: 10,
    },
    survival: {
      id: 'survival',
      name: 'Survival',
      emoji: '🧱',
      blurb: 'Bins keep appearing. The board fills up around you.',
      wrap: false,
      obstacles: true,
      timed: false,
      levelCap: 12,
    },
    daily: {
      id: 'daily',
      name: 'Daily Challenge',
      emoji: '📅',
      blurb: 'One board, one seed, the same for everyone today.',
      wrap: false,
      obstacles: false,
      timed: false,
      levelCap: 10,
      // Seeded from the UTC date rather than at random; difficulty is pinned
      daily: true,
    },
    endless: {
      id: 'endless',
      name: 'Endless',
      emoji: '♾️',
      blurb: 'No walls — you wrap around. It never stops getting faster.',
      wrap: true,
      obstacles: false,
      timed: false,
      levelCap: 99,
    },
  };

  NS.DIFFICULTIES = {
    easy: {
      id: 'easy',
      name: 'Easy',
      emoji: '🍼',
      baseStep: 185,      // ms per move at level 1
      minStep: 104,       // speed ceiling
      stepDrop: 7,        // ms shaved per level
      foodPerLevel: 5,    // snacks needed to level up
      startObstacles: 0,
      obstacleEvery: 0,   // snacks between new obstacles (survival only)
      timeLimit: 75,
      timeBonus: 3,
    },
    normal: {
      id: 'normal',
      name: 'Normal',
      emoji: '🍜',
      baseStep: 150,
      minStep: 66,
      stepDrop: 9,
      foodPerLevel: 4,
      startObstacles: 2,
      obstacleEvery: 3,
      timeLimit: 60,
      timeBonus: 2,
    },
    hard: {
      id: 'hard',
      name: 'Hard',
      emoji: '🌶️',
      baseStep: 118,
      minStep: 50,
      stepDrop: 11,
      foodPerLevel: 3,
      startObstacles: 5,
      obstacleEvery: 2,
      timeLimit: 45,
      timeBonus: 1.5,
    },
  };

  /* ====================================================================== *
   * Engine
   * ====================================================================== */

  /**
   * @param {object} options
   * @param {number} options.gridSize
   * @param {string} options.mode        key of NS.MODES
   * @param {string} options.difficulty  key of NS.DIFFICULTIES
   * @param {number|string} options.seed seed for the gameplay RNG
   * @param {function} options.now       injectable wall clock, used only for
   *                                     presentation timestamps
   */
  NS.createEngine = function createEngine(options) {
    const opts = options || {};
    const gridSize = opts.gridSize || NS.CONFIG.GRID_SIZE;
    const now = opts.now || (() => performance.now());

    // Every gameplay-affecting random decision comes from here. `seed` is
    // fixed for the life of the engine; `reset()` rewinds the generator to it,
    // so replaying the same seed and inputs reproduces the run exactly.
    let seed = opts.seed === undefined ? NS.randomSeed() : opts.seed;
    let rng = NS.createRng(seed);

    const listeners = Object.create(null);

    const state = {
      status: GameState.READY,
      mode: NS.MODES[opts.mode] || NS.MODES.classic,
      difficulty: NS.DIFFICULTIES[opts.difficulty] || NS.DIFFICULTIES.normal,
      gridSize,
      seed: rng.seed,

      snake: [],
      previousSnake: [],
      direction: 'right',
      queuedTurns: [],

      food: { x: 0, y: 0, type: 0 },
      obstacles: [],

      score: 0,
      foodEaten: 0,
      level: 1,
      streak: 0,

      // --- Deterministic clock -------------------------------------------
      // `tick` counts completed simulation steps; `simTimeMs` is time as the
      // simulation understands it, advanced by exactly one stepMs per tick.
      // Every gameplay and event-cadence decision uses these, never the wall
      // clock, so the same inputs always produce the same run.
      tick: 0,
      simTimeMs: 0,
      lastStreakTick: -9999,
      lastCloseTick: -9999,
      lastTurnTick: 0,

      // --- Presentation-only timestamps ----------------------------------
      // Wall-clock, read by the renderers for face and death animations.
      // Deliberately excluded from the fingerprint.
      lastEatAt: -99999,
      diedAt: 0,

      deathCause: 'wall',

      stepMs: 150,
      accumulator: 0,
      timeLeftMs: 0,     // time attack only
      elapsedMs: 0,
    };

    /* ------------------------------------------------------------ events */

    function on(name, handler) {
      (listeners[name] || (listeners[name] = [])).push(handler);
      return () => off(name, handler);
    }

    function off(name, handler) {
      const list = listeners[name];
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    }

    function emit(name, payload) {
      const list = listeners[name];
      if (!list) return;
      for (let i = 0; i < list.length; i += 1) list[i](payload || {});
    }

    /* ------------------------------------------------------------- rules */

    function stepDurationForLevel(level) {
      const d = state.difficulty;
      return Math.max(d.minStep, d.baseStep - (level - 1) * d.stepDrop);
    }

    const samePosition = (a, b) => a.x === b.x && a.y === b.y;

    function occupiedKeys() {
      const keys = new Set();
      for (const segment of state.snake) keys.add(`${segment.x},${segment.y}`);
      for (const block of state.obstacles) keys.add(`${block.x},${block.y}`);
      return keys;
    }

    /** Free cells, excluding the snake, the obstacles and (optionally) the food. */
    function freeCells(excludeFood) {
      const taken = occupiedKeys();
      if (excludeFood) taken.add(`${state.food.x},${state.food.y}`);
      const free = [];
      for (let y = 0; y < gridSize; y += 1) {
        for (let x = 0; x < gridSize; x += 1) {
          if (!taken.has(`${x},${y}`)) free.push({ x, y });
        }
      }
      return free;
    }

    /**
     * Place a random snack on a random free cell. Picking from the list of free
     * cells (rather than retrying random spots) stays fast even when the board
     * is nearly full, and tells us straight away when the player has won.
     */
    function spawnFood() {
      const free = freeCells(false);
      if (free.length === 0) return false;

      const cell = free[rng.below(free.length)];
      const typeCount = NS.FOOD_TYPES;
      let type = rng.below(typeCount);
      // Never serve the same snack twice in a row — variety is the joke
      if (typeCount > 1 && type === state.food.type) {
        type = (type + 1 + rng.below(typeCount - 1)) % typeCount;
      }

      state.food = { x: cell.x, y: cell.y, type };
      emit('foodSpawned', { food: state.food });
      return true;
    }

    /** Drop an obstacle somewhere that isn't about to trap the player. */
    function spawnObstacle() {
      const free = freeCells(true).filter((cell) => {
        // Keep obstacles away from the head so they never appear on top of you
        const head = state.snake[0];
        return Math.abs(cell.x - head.x) + Math.abs(cell.y - head.y) > 4;
      });
      if (free.length === 0) return false;
      const cell = free[rng.below(free.length)];
      state.obstacles.push(cell);
      emit('obstacleSpawned', { obstacle: cell });
      return true;
    }

    function createStartingSnake() {
      const midY = Math.floor(gridSize / 2);
      const headX = Math.floor(gridSize / 2);
      const snake = [];
      for (let i = 0; i < NS.CONFIG.START_LENGTH; i += 1) {
        snake.push({ x: headX - i, y: midY });
      }
      return snake;
    }

    /* ---------------------------------------------------------- lifecycle */

    function reset() {
      // Rewind the generator so the same seed replays the same run
      rng = NS.createRng(seed);
      state.seed = rng.seed;
      state.tick = 0;
      state.simTimeMs = 0;

      state.snake = createStartingSnake();
      state.previousSnake = state.snake.map((s) => ({ ...s }));
      state.direction = 'right';
      state.queuedTurns = [];
      state.obstacles = [];
      state.score = 0;
      state.foodEaten = 0;
      state.level = 1;
      state.streak = 0;
      state.lastEatAt = -99999;
      state.lastStreakTick = -9999;
      state.lastCloseTick = -9999;
      state.lastTurnTick = state.tick;
      state.deathCause = 'wall';
      state.stepMs = stepDurationForLevel(1);
      state.accumulator = 0;
      state.elapsedMs = 0;
      state.timeLeftMs = state.mode.timed ? state.difficulty.timeLimit * 1000 : 0;

      if (state.mode.obstacles) {
        for (let i = 0; i < state.difficulty.startObstacles; i += 1) spawnObstacle();
      }

      state.food = { x: 0, y: 0, type: -1 };
      spawnFood();

      setStatus(GameState.READY);
      emit('reset', {});
    }

    function setStatus(next) {
      if (state.status === next) return;
      const previous = state.status;
      state.status = next;
      emit('status', { status: next, previous });
    }

    function start() {
      reset();
      state.lastTurnTick = state.tick;
      setStatus(GameState.PLAYING);
      emit('start', {});
    }

    function pause() {
      if (state.status !== GameState.PLAYING) return;
      setStatus(GameState.PAUSED);
    }

    function resume() {
      if (state.status !== GameState.PAUSED) return;
      setStatus(GameState.PLAYING);
    }

    function togglePause() {
      if (state.status === GameState.PLAYING) pause();
      else if (state.status === GameState.PAUSED) resume();
    }

    function end(cause) {
      state.deathCause = cause;
      state.diedAt = now();
      setStatus(GameState.GAME_OVER);
      emit('death', {
        cause,
        score: state.score,
        length: state.snake.length,
        level: state.level,
      });
    }

    /* ------------------------------------------------------------- input */

    /**
     * Queue a turn if it is legal. Reversing straight into the neck is
     * rejected, and turns are compared against the last *queued* direction so
     * buffered inputs stay consistent.
     */
    function queueTurn(name) {
      if (!DIRECTIONS[name]) return false;
      if (state.status !== GameState.PLAYING) return false;

      const last = state.queuedTurns.length > 0
        ? state.queuedTurns[state.queuedTurns.length - 1]
        : state.direction;

      if (name === last || name === OPPOSITE[last]) return false;
      if (state.queuedTurns.length >= NS.CONFIG.MAX_QUEUED_TURNS) return false;

      state.queuedTurns.push(name);
      state.lastTurnTick = state.tick;
      emit('turn', { direction: name });
      return true;
    }

    /* -------------------------------------------------------- simulation */

    /**
     * Advance the noodle by exactly one cell.
     * Fatal moves are detected *before* they are applied, so the snake never
     * ends up rendered inside a wall or inside itself.
     */
    function step() {
      // Apply at most one buffered turn per step: that is what stops a quick
      // double-tap (e.g. up then left while moving right) from folding the
      // snake back into its own neck.
      if (state.queuedTurns.length > 0) {
        state.direction = state.queuedTurns.shift();
      }

      const vector = DIRECTIONS[state.direction];
      const head = state.snake[0];
      let nextHead = { x: head.x + vector.x, y: head.y + vector.y };

      const outside = nextHead.x < 0 || nextHead.y < 0 ||
        nextHead.x >= gridSize || nextHead.y >= gridSize;

      if (outside) {
        if (!state.mode.wrap) {
          end('wall');
          return;
        }
        // Endless mode: come out the other side
        nextHead = {
          x: (nextHead.x + gridSize) % gridSize,
          y: (nextHead.y + gridSize) % gridSize,
        };
        emit('wrap', { at: nextHead });
      }

      // Obstacles are solid
      if (state.obstacles.some((block) => samePosition(block, nextHead))) {
        end('obstacle');
        return;
      }

      const willEat = samePosition(nextHead, state.food);

      // Self collision. The tail cell is about to be vacated, so moving into it
      // is legal — unless we're growing this step and it stays put.
      const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
      if (bodyToCheck.some((segment) => samePosition(segment, nextHead))) {
        end('self');
        return;
      }

      state.previousSnake = state.snake.map((segment) => ({ ...segment }));
      state.snake.unshift(nextHead);
      if (!willEat) state.snake.pop();

      if (willEat) eat(nextHead);
      else noticeNearMiss(nextHead, vector);
    }

    function eat(position) {
      state.foodEaten += 1;
      state.score += NS.CONFIG.POINTS_PER_FOOD * state.level;

      // A "hunger streak" is eating again quickly — it drives the sound pitch
      // and the combo chip, but never the score, so it can't snowball.
      state.streak = (state.simTimeMs - state.lastStreakTick < NS.CONFIG.STREAK_WINDOW_MS)
        ? state.streak + 1
        : 1;
      state.lastStreakTick = state.simTimeMs;
      state.lastEatAt = now();   // presentation only: drives the chewing face

      if (state.mode.timed) {
        state.timeLeftMs += state.difficulty.timeBonus * 1000;
      }

      emit('eat', {
        at: position,
        type: state.food.type,
        score: state.score,
        streak: state.streak,
        level: state.level,
        count: state.foodEaten,
      });

      const nextLevel = clamp(
        Math.floor(state.foodEaten / state.difficulty.foodPerLevel) + 1,
        1, state.mode.levelCap
      );
      if (nextLevel !== state.level) {
        state.level = nextLevel;
        state.stepMs = stepDurationForLevel(state.level);
        emit('level', { level: state.level, stepMs: state.stepMs });
      }

      // Survival: the board keeps closing in
      if (state.mode.obstacles && state.difficulty.obstacleEvery > 0 &&
          state.foodEaten % state.difficulty.obstacleEvery === 0) {
        spawnObstacle();
      }

      // No free cell left means the board is full — a perfect run.
      if (!spawnFood()) end('win');
    }

    /** Spot a squeaky-bum moment so the UI can comment on it. */
    function noticeNearMiss(head, vector) {
      if (state.simTimeMs - state.lastCloseTick < 6000) return;

      const ahead = { x: head.x + vector.x, y: head.y + vector.y };
      const offBoard = !state.mode.wrap && (ahead.x < 0 || ahead.y < 0 ||
        ahead.x >= gridSize || ahead.y >= gridSize);
      const intoSelf = state.snake.slice(0, -1).some((s) => samePosition(s, ahead));
      const intoBlock = state.obstacles.some((b) => samePosition(b, ahead));

      if (offBoard || intoSelf || intoBlock) {
        state.lastCloseTick = state.simTimeMs;
        emit('close', {});
      }
    }

    /**
     * Advance the simulation by exactly one step.
     *
     * This is the deterministic heart of the engine: it takes no arguments,
     * reads no clock, and is the only thing that moves the game forward.
     * Real-time play reaches it through update(); replays call it directly.
     *
     * @returns {boolean} true while the run is still going
     */
    function tick() {
      if (state.status !== GameState.PLAYING) return false;

      state.tick += 1;
      state.simTimeMs += state.stepMs;

      // The Time Attack clock drains in simulated time, so a replay burns
      // it at exactly the same rate the original run did.
      if (state.mode.timed) {
        state.timeLeftMs -= state.stepMs;
        if (state.timeLeftMs <= 0) {
          state.timeLeftMs = 0;
          end('timeout');
          return false;
        }
      }

      step();
      return state.status === GameState.PLAYING;
    }

    /**
     * The simulation state, in a fixed field order.
     *
     * Deliberately hand-built rather than JSON.stringify: object key order
     * is an implementation detail, and presentation-only values (wall-clock
     * timestamps, the render accumulator) must never reach the fingerprint.
     * @returns {string}
     */
    function canonicalState() {
      return [
        'v1',
        `tick:${state.tick}`,
        `status:${state.status}`,
        `mode:${state.mode.id}`,
        `difficulty:${state.difficulty.id}`,
        `grid:${gridSize}`,
        `seed:${rng.seed}`,
        `rng:${rng.getState()}`,
        `dir:${state.direction}`,
        `score:${state.score}`,
        `eaten:${state.foodEaten}`,
        `level:${state.level}`,
        `streak:${state.streak}`,
        `cause:${state.deathCause}`,
        `timeLeft:${Math.round(state.timeLeftMs)}`,
        `snake:${state.snake.map((p) => `${p.x},${p.y}`).join('|')}`,
        `food:${state.food.x},${state.food.y},${state.food.type}`,
        `obstacles:${state.obstacles.map((p) => `${p.x},${p.y}`).join('|')}`,
      ].join(';');
    }

    /** A stable 8-hex-digit digest of the simulation state. */
    function fingerprint() {
      return NS.hashString(canonicalState()).toString(16).padStart(8, '0');
    }

    /** Accumulate real time and run as many fixed steps as it pays for. */
    function update(deltaMs) {
      if (state.status !== GameState.PLAYING) return;

      state.elapsedMs += deltaMs;
      state.accumulator += deltaMs;
      // Guard against huge deltas (a backgrounded tab) running dozens of steps.
      let steps = 0;
      while (state.accumulator >= state.stepMs && steps < 4) {
        state.accumulator -= state.stepMs;
        steps += 1;
        if (!tick()) {
          state.accumulator = 0;
          return;
        }
      }
      if (state.accumulator > state.stepMs) state.accumulator = 0;

      // The noodle gets bored if you hold one direction for ages
      if (state.simTimeMs - state.lastTurnTick * state.stepMs > 9000) {
        state.lastTurnTick = state.tick;
        emit('idle', { seconds: 9 });
      }
    }

    /** How far through the current step we are — renderers interpolate on this. */
    function alpha() {
      if (state.status !== GameState.PLAYING) return 1;
      return clamp(state.accumulator / state.stepMs, 0, 1);
    }

    /* ------------------------------------------------------ configuration */

    function setMode(id) {
      if (!NS.MODES[id]) return;
      state.mode = NS.MODES[id];
      reset();
    }

    function setDifficulty(id) {
      if (!NS.DIFFICULTIES[id]) return;
      state.difficulty = NS.DIFFICULTIES[id];
      reset();
    }

    return {
      state,
      on,
      off,
      alpha,
      start,
      pause,
      resume,
      togglePause,
      queueTurn,
      update,
      tick,
      reset,
      canonicalState,
      fingerprint,
      getSeed: () => rng.seed,
      getRngState: () => rng.getState(),
      /** Change the seed for the NEXT run; reset() or start() applies it. */
      setSeed(value) { seed = value === undefined ? NS.randomSeed() : value; },
      setMode,
      setDifficulty,
      // exposed for tests
      stepDurationForLevel,
      freeCells,
    };
  };
}(window.HungryNoodle));
