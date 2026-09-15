/**
 * Snake — a modern take on the classic arcade game.
 *
 * Vanilla JavaScript + HTML5 Canvas, no dependencies.
 * The whole game lives inside one IIFE so nothing leaks onto `window`.
 *
 * Architecture
 *   config      — tunable gameplay constants
 *   storage     — safe localStorage wrapper (private mode can throw)
 *   audio       — Web Audio API sound effects, generated on the fly
 *   state       — the single mutable game-state object
 *   simulation  — fixed-timestep stepping (move / eat / collide)
 *   rendering   — requestAnimationFrame drawing, interpolated for smoothness
 *   input       — keyboard, on-screen d-pad, swipe
 *   ui          — DOM syncing driven by the current game state
 */
(() => {
  'use strict';

  /* ====================================================================== *
   * Configuration
   * ====================================================================== */

  const GRID_SIZE = 20;          // board is GRID_SIZE x GRID_SIZE cells
  const START_LENGTH = 3;        // segments the snake starts with
  const BASE_STEP_MS = 150;      // ms between moves at level 1
  const STEP_DECREMENT_MS = 9;   // ms shaved off per level gained
  const MIN_STEP_MS = 66;        // speed ceiling
  const FOOD_PER_LEVEL = 4;      // fruits needed to advance one level
  const MAX_LEVEL = 10;
  const POINTS_PER_FOOD = 10;    // multiplied by the current level
  const MAX_QUEUED_TURNS = 2;    // buffered turns, so fast inputs aren't lost

  const STORAGE_KEY_HIGH_SCORE = 'snake.highScore.v1';
  const STORAGE_KEY_MUTED = 'snake.muted.v1';

  /** The four states the game can be in. */
  const GameState = Object.freeze({
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
  });

  const DIRECTIONS = Object.freeze({
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  });

  const OPPOSITE = Object.freeze({
    up: 'down', down: 'up', left: 'right', right: 'left',
  });

  /** Arrow keys and WASD both steer. */
  const KEY_TO_DIRECTION = Object.freeze({
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
  });

  const COLORS = Object.freeze({
    boardFrom: '#0a1120',
    boardTo: '#0d1729',
    grid: 'rgba(120, 160, 220, 0.055)',
    checker: 'rgba(255, 255, 255, 0.014)',
    wall: 'rgba(126, 152, 199, 0.22)',
    snakeHead: '#8dffcd',
    snakeMid: '#3ef2a1',
    snakeTail: '#12b37a',
    snakeGlow: 'rgba(62, 242, 161, 0.45)',
    dead: '#ff5c7a',
    foodCore: '#ffc2cf',
    foodMid: '#ff4d6d',
    foodEdge: '#c9184a',
    foodGlow: 'rgba(255, 77, 109, 0.55)',
  });

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================================================================== *
   * Storage — never let a blocked localStorage break the game
   * ====================================================================== */

  const storage = {
    read(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch {
        /* Private browsing or a full quota — scores just won't persist. */
      }
    },
  };

  /* ====================================================================== *
   * Audio — short effects synthesised with the Web Audio API (no files)
   * ====================================================================== */

  const audio = (() => {
    let context = null;
    let master = null;
    let muted = storage.read(STORAGE_KEY_MUTED, 'false') === 'true';

    /** Lazily create the context; browsers require a user gesture first. */
    function ensureContext() {
      if (context) {
        if (context.state === 'suspended') context.resume();
        return context;
      }
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try {
        context = new Ctor();
        master = context.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(context.destination);
      } catch {
        context = null;
      }
      return context;
    }

    /** One enveloped oscillator note. */
    function note({ freq, toFreq, type = 'sine', duration = 0.12, volume = 0.16, delay = 0 }) {
      const ctx = ensureContext();
      if (!ctx || muted) return;

      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, start + duration);

      // Exponential ramps can't touch zero, so fade to a near-silent value.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    return {
      unlock: ensureContext,
      eat() {
        note({ freq: 620, toFreq: 950, type: 'triangle', duration: 0.09, volume: 0.18 });
        note({ freq: 940, toFreq: 1180, type: 'sine', duration: 0.08, volume: 0.1, delay: 0.06 });
      },
      levelUp() {
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          note({ freq, type: 'triangle', duration: 0.13, volume: 0.13, delay: i * 0.07 });
        });
      },
      gameOver() {
        note({ freq: 420, toFreq: 110, type: 'sawtooth', duration: 0.5, volume: 0.15 });
        note({ freq: 150, toFreq: 60, type: 'sine', duration: 0.6, volume: 0.2, delay: 0.06 });
      },
      click() {
        note({ freq: 340, toFreq: 460, type: 'triangle', duration: 0.05, volume: 0.09 });
      },
      turn() {
        note({ freq: 220, type: 'sine', duration: 0.035, volume: 0.05 });
      },
      isMuted() {
        return muted;
      },
      setMuted(value) {
        muted = value;
        storage.write(STORAGE_KEY_MUTED, muted);
        if (master) master.gain.value = muted ? 0 : 1;
        if (!muted) ensureContext();
      },
    };
  })();

  /* ====================================================================== *
   * DOM references
   * ====================================================================== */

  const $ = (id) => document.getElementById(id);

  const el = {
    body: document.body,
    canvas: $('board'),
    boardWrap: $('board-wrap'),
    score: $('score'),
    highScore: $('high-score'),
    level: $('level'),
    speedBar: $('speed-bar'),
    panelReady: $('panel-ready'),
    panelPaused: $('panel-paused'),
    panelGameOver: $('panel-gameover'),
    gameOverKicker: $('gameover-kicker'),
    gameOverTitle: $('gameover-title'),
    gameOverReason: $('gameover-reason'),
    finalScore: $('final-score'),
    finalHigh: $('final-high'),
    finalLength: $('final-length'),
    newRecord: $('new-record'),
    btnStart: $('btn-start'),
    btnStartLabel: $('btn-start-label'),
    btnPause: $('btn-pause'),
    btnPauseLabel: $('btn-pause-label'),
    btnRestart: $('btn-restart'),
    btnSound: $('btn-sound'),
    iconPause: $('icon-pause'),
    iconResume: $('icon-resume'),
    iconSoundOn: $('icon-sound-on'),
    iconSoundOff: $('icon-sound-off'),
    btnOverlayStart: $('btn-overlay-start'),
    btnOverlayResume: $('btn-overlay-resume'),
    btnOverlayRestart: $('btn-overlay-restart'),
    btnOverlayAgain: $('btn-overlay-again'),
    dpad: document.querySelector('.dpad'),
    announcer: $('announcer'),
  };

  const ctx = el.canvas.getContext('2d');

  /* ====================================================================== *
   * Game state
   * ====================================================================== */

  const state = {
    status: GameState.READY,
    snake: [],            // [{x, y}, ...] head first
    previousSnake: [],    // positions one step ago, used to interpolate motion
    direction: 'right',   // the committed heading
    queuedTurns: [],      // buffered turns applied one per step
    food: { x: 0, y: 0 },
    score: 0,
    highScore: 0,
    foodEaten: 0,
    level: 1,
    stepMs: BASE_STEP_MS,
    accumulator: 0,       // ms carried toward the next step
    lastFrameTime: 0,
    deathCause: 'wall',   // 'wall' | 'self' | 'win'
    particles: [],
    deathFlash: 0,        // 0..1, decays after a crash
    shake: 0,             // screen-shake amplitude in cells
    // Rendering geometry, recalculated on resize
    cssSize: 0,
    cell: 0,
    dpr: 1,
    background: null,     // pre-rendered board, redrawn only on resize
  };

  /* ====================================================================== *
   * Helpers
   * ====================================================================== */

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const samePosition = (a, b) => a.x === b.x && a.y === b.y;

  /** Step duration for a level — higher level, shorter step. */
  function stepDurationForLevel(level) {
    return Math.max(MIN_STEP_MS, BASE_STEP_MS - (level - 1) * STEP_DECREMENT_MS);
  }

  function announce(message) {
    el.announcer.textContent = message;
  }

  /* ====================================================================== *
   * Setup and lifecycle
   * ====================================================================== */

  /** Build the starting snake: centred, heading right, tail trailing left. */
  function createStartingSnake() {
    const midY = Math.floor(GRID_SIZE / 2);
    const headX = Math.floor(GRID_SIZE / 2);
    const snake = [];
    for (let i = 0; i < START_LENGTH; i += 1) {
      snake.push({ x: headX - i, y: midY });
    }
    return snake;
  }

  /** Reset every per-run value and drop back to READY. */
  function resetGame() {
    state.snake = createStartingSnake();
    state.previousSnake = state.snake.map((segment) => ({ ...segment }));
    state.direction = 'right';
    state.queuedTurns = [];
    state.score = 0;
    state.foodEaten = 0;
    state.level = 1;
    state.stepMs = stepDurationForLevel(1);
    state.accumulator = 0;
    state.particles = [];
    state.deathFlash = 0;
    state.shake = 0;
    state.deathCause = 'wall';
    spawnFood();
    setStatus(GameState.READY);
    updateStats();
  }

  function setStatus(next) {
    state.status = next;
    syncUI();
  }

  function startGame() {
    audio.unlock();
    resetGame();
    state.lastFrameTime = performance.now();
    setStatus(GameState.PLAYING);
    announce('Game started. Good luck!');
  }

  function pauseGame() {
    if (state.status !== GameState.PLAYING) return;
    setStatus(GameState.PAUSED);
    announce(`Paused at ${state.score} points.`);
    focusOverlayButton(el.btnOverlayResume);
  }

  function resumeGame() {
    if (state.status !== GameState.PAUSED) return;
    state.lastFrameTime = performance.now();
    setStatus(GameState.PLAYING);
    announce('Resumed.');
  }

  function togglePause() {
    if (state.status === GameState.PLAYING) pauseGame();
    else if (state.status === GameState.PAUSED) resumeGame();
  }

  /** Space / Enter does the sensible thing for whatever state we're in. */
  function primaryAction() {
    switch (state.status) {
      case GameState.READY:
      case GameState.GAME_OVER:
        startGame();
        break;
      case GameState.PLAYING:
        pauseGame();
        break;
      case GameState.PAUSED:
        resumeGame();
        break;
    }
  }

  function endGame(cause) {
    state.deathCause = cause;
    state.deathFlash = 1;
    state.shake = prefersReducedMotion ? 0 : 0.35;

    const isRecord = state.score > state.highScore && state.score > 0;
    if (isRecord) {
      state.highScore = state.score;
      storage.write(STORAGE_KEY_HIGH_SCORE, state.highScore);
    }

    updateStats();
    el.finalScore.textContent = state.score;
    el.finalHigh.textContent = state.highScore;
    el.finalLength.textContent = state.snake.length;
    el.newRecord.hidden = !isRecord;

    if (cause === 'win') {
      el.gameOverKicker.textContent = 'Perfect run';
      el.gameOverKicker.classList.remove('overlay__kicker--danger');
      el.gameOverTitle.textContent = 'You filled the board!';
      el.gameOverReason.textContent = 'There is nowhere left for fruit to spawn. Nothing left to prove.';
    } else {
      el.gameOverKicker.textContent = 'Game Over';
      el.gameOverKicker.classList.add('overlay__kicker--danger');
      el.gameOverTitle.textContent = 'You crashed';
      el.gameOverReason.textContent = cause === 'self'
        ? 'You ran into your own tail.'
        : 'You hit the wall.';
    }

    audio.gameOver();
    setStatus(GameState.GAME_OVER);
    announce(
      `Game over. ${state.score} points with a length of ${state.snake.length}.` +
      (isRecord ? ' That is a new high score!' : '')
    );
    focusOverlayButton(el.btnOverlayAgain);
  }

  /* ====================================================================== *
   * Food
   * ====================================================================== */

  /**
   * Place fruit on a random free cell. Picking from the list of free cells
   * (rather than retrying random spots) stays fast even when the board is
   * nearly full, and tells us straight away when the player has won.
   */
  function spawnFood() {
    const occupied = new Set(state.snake.map((segment) => `${segment.x},${segment.y}`));
    const free = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }

    if (free.length === 0) return false;
    state.food = free[Math.floor(Math.random() * free.length)];
    return true;
  }

  /* ====================================================================== *
   * Simulation
   * ====================================================================== */

  /**
   * Advance the snake by exactly one cell.
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
    const nextHead = { x: head.x + vector.x, y: head.y + vector.y };

    // Wall collision
    if (nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= GRID_SIZE || nextHead.y >= GRID_SIZE) {
      endGame('wall');
      return;
    }

    const willEat = samePosition(nextHead, state.food);

    // Self collision. The tail cell is about to be vacated, so moving into it
    // is legal — unless we're growing this step and it stays put.
    const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
    if (bodyToCheck.some((segment) => samePosition(segment, nextHead))) {
      endGame('self');
      return;
    }

    state.previousSnake = state.snake.map((segment) => ({ ...segment }));
    state.snake.unshift(nextHead);
    if (!willEat) state.snake.pop();

    if (willEat) eatFood(nextHead);
  }

  function eatFood(position) {
    state.foodEaten += 1;
    state.score += POINTS_PER_FOOD * state.level;

    spawnParticles(position);
    audio.eat();

    const nextLevel = clamp(Math.floor(state.foodEaten / FOOD_PER_LEVEL) + 1, 1, MAX_LEVEL);
    if (nextLevel !== state.level) {
      state.level = nextLevel;
      state.stepMs = stepDurationForLevel(state.level);
      audio.levelUp();
      announce(`Level ${state.level}. The snake is faster now.`);
    }

    updateStats();

    // No free cell left means the board is full — a perfect run.
    if (!spawnFood()) endGame('win');
  }

  /** Accumulate real time and run as many fixed steps as it pays for. */
  function update(deltaMs) {
    if (state.status === GameState.PLAYING) {
      state.accumulator += deltaMs;
      // Guard against huge deltas (a backgrounded tab) running dozens of steps.
      const maxSteps = 4;
      let steps = 0;
      while (state.accumulator >= state.stepMs && steps < maxSteps) {
        state.accumulator -= state.stepMs;
        steps += 1;
        step();
        if (state.status !== GameState.PLAYING) {
          state.accumulator = 0;
          break;
        }
      }
      if (state.accumulator > state.stepMs) state.accumulator = 0;
    }

    updateParticles(deltaMs);

    if (state.deathFlash > 0) state.deathFlash = Math.max(0, state.deathFlash - deltaMs / 420);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - deltaMs / 300);
  }

  /* ====================================================================== *
   * Particles (celebration burst when fruit is eaten)
   * ====================================================================== */

  function spawnParticles(cellPosition) {
    if (prefersReducedMotion) return;
    const count = 14;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 2.6 + Math.random() * 3.4; // cells per second
      state.particles.push({
        x: cellPosition.x + 0.5,
        y: cellPosition.y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 1.6 + Math.random() * 1.2,
        size: 0.08 + Math.random() * 0.08, // in cells
      });
    }
  }

  function updateParticles(deltaMs) {
    if (state.particles.length === 0) return;
    const seconds = deltaMs / 1000;
    state.particles = state.particles.filter((particle) => {
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.vx *= 0.92;
      particle.vy *= 0.92;
      particle.life -= particle.decay * seconds;
      return particle.life > 0;
    });
  }

  /* ====================================================================== *
   * Rendering
   * ====================================================================== */

  /** Match the backing store to the element's CSS size and pixel density. */
  function resizeCanvas() {
    const rect = el.boardWrap.getBoundingClientRect();
    const size = Math.max(1, Math.round(rect.width));
    const dpr = clamp(window.devicePixelRatio || 1, 1, 3);

    if (size === state.cssSize && dpr === state.dpr) return;

    state.cssSize = size;
    state.dpr = dpr;
    state.cell = size / GRID_SIZE;

    el.canvas.width = Math.round(size * dpr);
    el.canvas.height = Math.round(size * dpr);

    renderBackground();
  }

  /**
   * The grid never changes between resizes, so draw it once into an offscreen
   * canvas and blit it each frame.
   */
  function renderBackground() {
    const size = state.cssSize;
    const dpr = state.dpr;
    const cell = state.cell;

    const layer = document.createElement('canvas');
    layer.width = Math.round(size * dpr);
    layer.height = Math.round(size * dpr);

    const g = layer.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gradient = g.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, COLORS.boardFrom);
    gradient.addColorStop(1, COLORS.boardTo);
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);

    // Checkerboard tint, so the grid reads as cells rather than just lines
    g.fillStyle = COLORS.checker;
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if ((x + y) % 2 === 0) g.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < GRID_SIZE; i += 1) {
      const offset = Math.round(i * cell) + 0.5;
      g.moveTo(offset, 0);
      g.lineTo(offset, size);
      g.moveTo(0, offset);
      g.lineTo(size, offset);
    }
    g.stroke();

    // Inner wall line — a visual reminder of the deadly boundary
    g.strokeStyle = COLORS.wall;
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);

    state.background = layer;
  }

  function circle(x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(now) {
    const size = state.cssSize;
    if (!size) return;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    if (state.shake > 0) {
      const amount = state.shake * state.cell;
      ctx.translate(
        (Math.random() - 0.5) * amount,
        (Math.random() - 0.5) * amount
      );
    }

    if (state.background) ctx.drawImage(state.background, 0, 0, size, size);

    drawFood(now);
    drawSnake(now);
    drawParticles();

    ctx.restore();

    if (state.deathFlash > 0) {
      ctx.fillStyle = `rgba(255, 77, 109, ${state.deathFlash * 0.28})`;
      ctx.fillRect(0, 0, size, size);
    }
  }

  function drawFood(now) {
    const cell = state.cell;
    const cx = (state.food.x + 0.5) * cell;
    const cy = (state.food.y + 0.5) * cell;
    const pulse = prefersReducedMotion ? 1 : 1 + Math.sin(now / 240) * 0.07;
    const radius = cell * 0.33 * pulse;

    ctx.save();
    ctx.shadowColor = COLORS.foodGlow;
    ctx.shadowBlur = cell * 0.9;

    const body = ctx.createRadialGradient(
      cx - radius * 0.35, cy - radius * 0.4, radius * 0.1,
      cx, cy, radius
    );
    body.addColorStop(0, COLORS.foodCore);
    body.addColorStop(0.45, COLORS.foodMid);
    body.addColorStop(1, COLORS.foodEdge);
    ctx.fillStyle = body;
    circle(cx, cy, radius);
    ctx.restore();

    // Leaf
    ctx.save();
    ctx.translate(cx + radius * 0.34, cy - radius * 0.88);
    ctx.rotate(-0.5);
    ctx.fillStyle = COLORS.snakeMid;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.42, radius * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Specular highlight
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(
      cx - radius * 0.32, cy - radius * 0.34,
      radius * 0.2, radius * 0.13, -0.6, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  function drawSnake(now) {
    const cell = state.cell;

    // How far through the current step we are — this is what makes the snake
    // glide between cells instead of teleporting.
    const t = state.status === GameState.PLAYING
      ? clamp(state.accumulator / state.stepMs, 0, 1)
      : 1;

    // Interpolate each segment from where it was to where it is. When the
    // snake grew this step the new tail has no previous position, so it
    // simply stays put.
    const points = state.snake.map((segment, index) => {
      const previous = state.previousSnake[index] || segment;
      return {
        x: (previous.x + (segment.x - previous.x) * t + 0.5) * cell,
        y: (previous.y + (segment.y - previous.y) * t + 0.5) * cell,
      };
    });

    const head = points[0];
    const tail = points[points.length - 1];
    const dead = state.status === GameState.GAME_OVER && state.deathCause !== 'win';

    const path = new Path2D();
    path.moveTo(head.x, head.y);
    for (let i = 1; i < points.length; i += 1) path.lineTo(points[i].x, points[i].y);

    const gradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    gradient.addColorStop(0, dead ? COLORS.dead : COLORS.snakeHead);
    gradient.addColorStop(0.5, dead ? '#d34a68' : COLORS.snakeMid);
    gradient.addColorStop(1, dead ? '#8e2f45' : COLORS.snakeTail);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = dead ? COLORS.foodGlow : COLORS.snakeGlow;
    ctx.shadowBlur = cell * 0.7;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = cell * 0.8;

    if (points.length === 1) {
      // A gradient between two identical points paints nothing, so a
      // single-segment snake gets a flat fill instead.
      ctx.fillStyle = dead ? COLORS.dead : COLORS.snakeMid;
      circle(head.x, head.y, cell * 0.4);
    } else {
      ctx.stroke(path);
    }
    ctx.restore();

    // Lighter core running down the middle, for a bit of dimension
    if (points.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.lineWidth = cell * 0.32;
      ctx.stroke(path);
      ctx.restore();
    }

    drawHead(head, dead, now);
  }

  function drawHead(head, dead, now) {
    const cell = state.cell;
    const vector = DIRECTIONS[state.direction];
    // Perpendicular to the heading — used to push the eyes apart
    const side = { x: -vector.y, y: vector.x };

    ctx.save();
    ctx.fillStyle = dead ? COLORS.dead : COLORS.snakeHead;
    circle(head.x, head.y, cell * 0.42);

    // Eyes blink occasionally, purely for charm
    const blinking = !prefersReducedMotion &&
      state.status === GameState.PLAYING &&
      Math.sin(now / 1400) > 0.985;

    const forward = cell * 0.14;
    const spread = cell * 0.17;
    const eyeRadius = cell * (blinking ? 0.035 : 0.1);

    for (const sign of [-1, 1]) {
      const ex = head.x + vector.x * forward + side.x * spread * sign;
      const ey = head.y + vector.y * forward + side.y * spread * sign;

      ctx.fillStyle = '#ffffff';
      circle(ex, ey, eyeRadius);

      if (!blinking) {
        ctx.fillStyle = dead ? '#5a0f20' : '#0a1120';
        circle(
          ex + vector.x * cell * 0.03,
          ey + vector.y * cell * 0.03,
          cell * 0.05
        );
      }
    }
    ctx.restore();
  }

  function drawParticles() {
    if (state.particles.length === 0) return;
    const cell = state.cell;
    ctx.save();
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life, 0, 1);
      ctx.fillStyle = COLORS.foodMid;
      circle(particle.x * cell, particle.y * cell, particle.size * cell * particle.life);
    }
    ctx.restore();
  }

  /* ====================================================================== *
   * Main loop — always running, so idle screens still animate
   * ====================================================================== */

  function loop(now) {
    const delta = Math.min(now - state.lastFrameTime, 250);
    state.lastFrameTime = now;

    update(delta);
    draw(now);

    window.requestAnimationFrame(loop);
  }

  /* ====================================================================== *
   * Input
   * ====================================================================== */

  /**
   * Queue a turn if it is legal. Reversing straight into the neck is
   * rejected, and turns are compared against the last *queued* direction so
   * buffered inputs stay consistent.
   */
  function queueTurn(name) {
    if (!DIRECTIONS[name]) return;

    // A direction key on the ready screen also starts the game.
    if (state.status === GameState.READY) {
      startGame();
    } else if (state.status !== GameState.PLAYING) {
      return;
    }

    const last = state.queuedTurns.length > 0
      ? state.queuedTurns[state.queuedTurns.length - 1]
      : state.direction;

    if (name === last || name === OPPOSITE[last]) return;
    if (state.queuedTurns.length >= MAX_QUEUED_TURNS) return;

    state.queuedTurns.push(name);
    audio.turn();
  }

  function handleKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const focusOnButton = document.activeElement instanceof HTMLButtonElement;

    const direction = KEY_TO_DIRECTION[key];
    if (direction) {
      event.preventDefault(); // arrows must not scroll the page
      audio.unlock();
      queueTurn(direction);
      flashDpad(direction);
      return;
    }

    switch (key) {
      case ' ':
      case 'spacebar':
      case 'enter':
        // Let a focused button handle its own activation instead.
        if (focusOnButton) return;
        event.preventDefault();
        audio.unlock();
        primaryAction();
        break;
      case 'p':
        event.preventDefault();
        togglePause();
        break;
      case 'r':
        if (state.status !== GameState.READY) {
          event.preventDefault();
          startGame();
        }
        break;
      case 'm':
        event.preventDefault();
        setMuted(!audio.isMuted());
        break;
      case 'escape':
        if (state.status === GameState.PLAYING) pauseGame();
        break;
    }
  }

  /** Briefly light up the matching d-pad key when steering with the keyboard. */
  function flashDpad(direction) {
    const button = el.dpad.querySelector(`[data-direction="${direction}"]`);
    if (!button) return;
    button.classList.add('is-pressed');
    window.setTimeout(() => button.classList.remove('is-pressed'), 110);
  }

  /** Paint the sound button to match a mute value, without side effects. */
  function syncSoundUI(muted) {
    el.btnSound.setAttribute('aria-pressed', String(!muted));
    el.btnSound.setAttribute('aria-label', muted ? 'Unmute sound effects' : 'Mute sound effects');
    el.iconSoundOn.hidden = muted;
    el.iconSoundOff.hidden = !muted;
  }

  function setMuted(muted) {
    audio.setMuted(muted);
    syncSoundUI(muted);
    if (!muted) audio.click();
    announce(muted ? 'Sound muted.' : 'Sound on.');
  }

  /* ------------------------------ Touch ---------------------------------- */

  function bindDpad() {
    for (const button of el.dpad.querySelectorAll('[data-direction]')) {
      const direction = button.dataset.direction;

      // pointerdown reacts immediately on touch; click keeps the pad usable
      // from the keyboard. Ignoring a click that closely follows a pointer
      // press stops one tap from steering twice — and unlike a boolean flag,
      // it recovers on its own if a press never produces a click.
      let lastPointerAt = -Infinity;

      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        lastPointerAt = performance.now();
        queueTurn(direction);
      });

      button.addEventListener('click', () => {
        if (performance.now() - lastPointerAt < 600) return;
        queueTurn(direction);
      });
    }
  }

  /** Swiping across the board steers too — handy on phones. */
  function bindSwipe() {
    const MIN_SWIPE = 24;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    el.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    });

    el.canvas.addEventListener('pointermove', (event) => {
      if (!tracking) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < MIN_SWIPE && Math.abs(dy) < MIN_SWIPE) return;

      tracking = false;
      const direction = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
      queueTurn(direction);
      flashDpad(direction);
    });

    const stop = () => { tracking = false; };
    el.canvas.addEventListener('pointerup', stop);
    el.canvas.addEventListener('pointercancel', stop);
  }

  /* ====================================================================== *
   * UI syncing
   * ====================================================================== */

  function bumpValue(element) {
    element.classList.remove('is-bumped');
    // Force a reflow so the animation can retrigger on consecutive scores.
    void element.offsetWidth;
    element.classList.add('is-bumped');
    window.setTimeout(() => element.classList.remove('is-bumped'), 240);
  }

  function updateStats() {
    if (el.score.textContent !== String(state.score)) {
      el.score.textContent = state.score;
      if (state.score > 0) bumpValue(el.score);
    }
    el.highScore.textContent = state.highScore;
    el.level.textContent = `Lv ${state.level}`;
    el.speedBar.style.width = `${(state.level / MAX_LEVEL) * 100}%`;
    updateCanvasLabel();
  }

  /** The canvas is the game to a sighted player; describe it for everyone else. */
  function updateCanvasLabel() {
    el.canvas.setAttribute(
      'aria-label',
      `Snake game board, ${state.status.toLowerCase().replace('_', ' ')}. ` +
      `Score ${state.score}, length ${state.snake.length}, level ${state.level}. ` +
      'Steer with the arrow keys or W A S D.'
    );
  }

  /** Reflect the current game state in the DOM. Single source of truth. */
  function syncUI() {
    const { status } = state;
    const ready = status === GameState.READY;
    const playing = status === GameState.PLAYING;
    const paused = status === GameState.PAUSED;
    const over = status === GameState.GAME_OVER;

    el.body.dataset.state = status;

    el.panelReady.hidden = !ready;
    el.panelPaused.hidden = !paused;
    el.panelGameOver.hidden = !over;

    el.btnStart.disabled = playing || paused;
    el.btnStartLabel.textContent = over ? 'New Game' : 'Start';

    el.btnPause.disabled = !(playing || paused);
    el.btnPauseLabel.textContent = paused ? 'Resume' : 'Pause';
    el.iconPause.hidden = paused;
    el.iconResume.hidden = !paused;

    el.btnRestart.disabled = ready;

    for (const button of el.dpad.querySelectorAll('[data-direction]')) {
      button.disabled = over;
    }

    updateCanvasLabel();
  }

  /** Move focus onto an overlay's primary button, but never on first load. */
  function focusOverlayButton(button) {
    if (!button) return;
    window.requestAnimationFrame(() => {
      if (!button.offsetParent) return; // hidden — nothing to focus
      button.focus({ preventScroll: true });
    });
  }

  /* ====================================================================== *
   * Wiring
   * ====================================================================== */

  function bindEvents() {
    el.btnStart.addEventListener('click', startGame);
    el.btnOverlayStart.addEventListener('click', startGame);
    el.btnOverlayAgain.addEventListener('click', startGame);
    el.btnOverlayRestart.addEventListener('click', startGame);
    el.btnRestart.addEventListener('click', startGame);
    el.btnPause.addEventListener('click', togglePause);
    el.btnOverlayResume.addEventListener('click', resumeGame);
    el.btnSound.addEventListener('click', () => setMuted(!audio.isMuted()));

    // A soft tick for every button except the d-pad, which has its own sound.
    document.addEventListener('click', (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('button')
        : null;
      if (!button || button.closest('.dpad')) return;
      audio.unlock();
      if (button !== el.btnSound) audio.click();
    });

    window.addEventListener('keydown', handleKeyDown);

    bindDpad();
    bindSwipe();

    // Keep the board crisp and correctly scaled at any size
    if ('ResizeObserver' in window) {
      new ResizeObserver(resizeCanvas).observe(el.boardWrap);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    // Don't let the game run on while the player is looking elsewhere
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseGame();
    });
    window.addEventListener('blur', pauseGame);
  }

  function init() {
    state.highScore = Number.parseInt(storage.read(STORAGE_KEY_HIGH_SCORE, '0'), 10) || 0;

    // Reflect the stored preference without creating an AudioContext or
    // announcing anything before the player has done a thing.
    syncSoundUI(audio.isMuted());

    resizeCanvas();
    resetGame();
    bindEvents();

    state.lastFrameTime = performance.now();
    window.requestAnimationFrame(loop);
  }

  init();
})();
