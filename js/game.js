/**
 * HUNGRY NOODLE — game state, simulation, rendering, input and UI.
 *
 * This is the orchestrator. The pure-drawing modules (art, themes, particles),
 * the sound module and the comedy writer are all loaded before it and reached
 * through the HungryNoodle namespace.
 *
 * The simulation below (stepping, collision, food, scoring, levels) is the
 * original game logic, unchanged — the cartoon makeover is entirely in the
 * rendering and presentation layers.
 */
(function (NS) {
  'use strict';

  const CONFIG = NS.CONFIG;
  const KEYS = NS.STORAGE_KEYS;
  const GameState = NS.GameState;
  const DIRECTIONS = NS.DIRECTIONS;
  const OPPOSITE = NS.OPPOSITE;
  const KEY_TO_DIRECTION = NS.KEY_TO_DIRECTION;
  const storage = NS.storage;
  const clamp = NS.clamp;
  const easeOutCubic = NS.easeOutCubic;
  const easeOutBack = NS.easeOutBack;
  const reduced = NS.prefersReducedMotion;

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
    combo: $('combo'),
    toast: $('toast'),
    toastText: $('toast-text'),
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
    themes: document.querySelector('.themes'),
    dpad: document.querySelector('.dpad'),
    announcer: $('announcer'),
  };

  const ctx = el.canvas.getContext('2d');

  /* ====================================================================== *
   * Collaborators
   * ====================================================================== */

  const audio = NS.createAudio(storage);
  const particles = NS.createParticles(reduced ? 40 : 170);
  const banter = NS.createBanter();
  const FOODS = NS.FOODS;

  /* ====================================================================== *
   * Game state
   * ====================================================================== */

  const state = {
    status: GameState.READY,
    snake: [],            // [{x, y}, ...] head first
    previousSnake: [],    // positions one step ago, used to interpolate motion
    direction: 'right',   // the committed heading
    queuedTurns: [],      // buffered turns applied one per step
    food: { x: 0, y: 0, type: 0, spawnedAt: 0 },
    score: 0,
    highScore: 0,
    foodEaten: 0,
    level: 1,
    stepMs: CONFIG.BASE_STEP_MS,
    accumulator: 0,       // ms carried toward the next step
    lastFrameTime: 0,
    deathCause: 'wall',   // 'wall' | 'self' | 'win'

    // Presentation-only state
    theme: null,
    backdrop: null,       // pre-rendered board layer
    lastEatAt: -99999,
    diedAt: 0,
    streak: 0,
    lastStreakAt: -99999,
    lastCloseAt: -99999,
    lastTurnAt: 0,
    eatFx: null,          // the food "pop" ghost left behind after a bite
    scorePops: [],        // floating +10s
    deathFlash: 0,
    shake: 0,
    toastTimer: 0,

    // Rendering geometry, recalculated on resize
    cssSize: 0,
    cell: 0,
    dpr: 1,
  };

  /* ====================================================================== *
   * Small helpers
   * ====================================================================== */

  const samePosition = (a, b) => a.x === b.x && a.y === b.y;

  /** Step duration for a level — higher level, shorter step. */
  function stepDurationForLevel(level) {
    return Math.max(
      CONFIG.MIN_STEP_MS,
      CONFIG.BASE_STEP_MS - (level - 1) * CONFIG.STEP_DECREMENT_MS
    );
  }

  function announce(message) {
    el.announcer.textContent = message;
  }

  /** Pop a funny line into the speech bubble — the writer decides if it speaks. */
  function say(trigger, context) {
    const line = banter.pick(trigger, context || {});
    if (!line) return;
    el.toastText.textContent = line;
    el.toast.classList.add('is-visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      el.toast.classList.remove('is-visible');
    }, CONFIG.TOAST_MS);
  }

  function hideToast() {
    window.clearTimeout(state.toastTimer);
    el.toast.classList.remove('is-visible');
  }

  /* ====================================================================== *
   * Themes
   * ====================================================================== */

  function setTheme(id, options) {
    const theme = NS.THEMES[id] || NS.THEMES.noodle;
    state.theme = theme;
    storage.write(KEYS.THEME, theme.id);
    el.body.dataset.theme = theme.id;

    renderBackdrop();
    syncThemeButtons();

    if (options && options.announce) {
      announce(`${theme.name} theme.`);
      say('theme', { name: theme.name });
    }
  }

  function syncThemeButtons() {
    if (!el.themes) return;
    for (const button of el.themes.querySelectorAll('[data-theme]')) {
      const active = button.dataset.theme === state.theme.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  /* ====================================================================== *
   * Setup and lifecycle
   * ====================================================================== */

  /** Build the starting noodle: centred, heading right, tail trailing left. */
  function createStartingSnake() {
    const midY = Math.floor(CONFIG.GRID_SIZE / 2);
    const headX = Math.floor(CONFIG.GRID_SIZE / 2);
    const snake = [];
    for (let i = 0; i < CONFIG.START_LENGTH; i += 1) {
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
    state.deathCause = 'wall';
    state.lastEatAt = -99999;
    state.streak = 0;
    state.lastStreakAt = -99999;
    state.lastCloseAt = -99999;
    state.eatFx = null;
    state.scorePops.length = 0;
    state.deathFlash = 0;
    state.shake = 0;
    particles.clear();
    banter.reset();
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
    state.lastTurnAt = state.lastFrameTime;
    setStatus(GameState.PLAYING);
    audio.start();
    announce('Game started. Good luck!');
    say('start', {});
  }

  function pauseGame() {
    if (state.status !== GameState.PLAYING) return;
    setStatus(GameState.PAUSED);
    hideToast();
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
      default:
        break;
    }
  }

  function endGame(cause) {
    const now = performance.now();
    state.deathCause = cause;
    state.diedAt = now;
    state.deathFlash = 1;
    state.shake = reduced ? 0 : 0.42;
    hideToast();

    const head = state.snake[0];
    if (cause !== 'win') {
      particles.emit('splat', (head.x + 0.5) * state.cell, (head.y + 0.5) * state.cell, {
        color: state.theme.body,
        count: 18,
        scale: reduced ? 0 : 1,
      });
    }

    const isRecord = state.score > state.highScore && state.score > 0;
    if (isRecord) {
      state.highScore = state.score;
      storage.write(KEYS.HIGH_SCORE, state.highScore);
      particles.emit('confetti', state.cssSize / 2, state.cssSize * 0.3, {
        count: 30,
        scale: reduced ? 0 : 1,
      });
    }

    updateStats();
    el.finalScore.textContent = state.score;
    el.finalHigh.textContent = state.highScore;
    el.finalLength.textContent = state.snake.length;
    el.newRecord.hidden = !isRecord;

    if (cause === 'win') {
      el.gameOverKicker.textContent = 'PERFECT NOODLE';
      el.gameOverKicker.classList.remove('overlay__kicker--danger');
      el.gameOverTitle.textContent = 'You ate the whole board';
      el.gameOverReason.textContent = 'There is literally nothing left. Take a nap.';
    } else {
      el.gameOverKicker.textContent = 'NOODLE DOWN';
      el.gameOverKicker.classList.add('overlay__kicker--danger');
      el.gameOverTitle.textContent = cause === 'self' ? 'You ate yourself' : 'You hit the wall';
      el.gameOverReason.textContent =
        banter.pick('over', { cause, score: state.score }) ||
        (cause === 'self' ? 'The noodle bit the noodle.' : 'The wall was right there.');
    }

    if (isRecord) audio.record();
    else audio.gameOver(cause);

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
   * Place a random snack on a random free cell. Picking from the list of free
   * cells (rather than retrying random spots) stays fast even when the board
   * is nearly full, and tells us straight away when the player has won.
   */
  function spawnFood() {
    const occupied = new Set(state.snake.map((segment) => `${segment.x},${segment.y}`));
    const free = [];

    for (let y = 0; y < CONFIG.GRID_SIZE; y += 1) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }

    if (free.length === 0) return false;

    const cell = free[Math.floor(Math.random() * free.length)];
    // Never serve the same snack twice in a row — variety is the joke.
    let type = Math.floor(Math.random() * FOODS.length);
    if (FOODS.length > 1 && type === state.food.type) {
      type = (type + 1 + Math.floor(Math.random() * (FOODS.length - 1))) % FOODS.length;
    }

    state.food = { x: cell.x, y: cell.y, type, spawnedAt: performance.now() };
    return true;
  }

  /* ====================================================================== *
   * Simulation  (unchanged rules from the original game)
   * ====================================================================== */

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
      state.lastTurnAt = performance.now();
    }

    const vector = DIRECTIONS[state.direction];
    const head = state.snake[0];
    const nextHead = { x: head.x + vector.x, y: head.y + vector.y };

    // Wall collision
    if (nextHead.x < 0 || nextHead.y < 0 ||
        nextHead.x >= CONFIG.GRID_SIZE || nextHead.y >= CONFIG.GRID_SIZE) {
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
    else noticeNearMiss(nextHead, vector);
  }

  function eatFood(position) {
    const now = performance.now();
    const eaten = FOODS[state.food.type];

    state.foodEaten += 1;
    state.score += CONFIG.POINTS_PER_FOOD * state.level;

    // A "hunger streak" is eating again quickly — it drives the sound pitch
    // and the little combo chip, but never the score, so it can't snowball.
    state.streak = (now - state.lastStreakAt < CONFIG.STREAK_WINDOW_MS)
      ? state.streak + 1
      : 1;
    state.lastStreakAt = now;
    state.lastEatAt = now;

    // Leave a pop ghost and a burst of crumbs where the snack was
    state.eatFx = { x: position.x, y: position.y, type: state.food.type, at: now };
    particles.emit('crumb', (position.x + 0.5) * state.cell, (position.y + 0.5) * state.cell, {
      color: eaten.crumb,
      count: 12,
      scale: reduced ? 0 : 1,
    });
    state.scorePops.push({
      x: (position.x + 0.5) * state.cell,
      y: (position.y + 0.5) * state.cell,
      text: `+${CONFIG.POINTS_PER_FOOD * state.level}`,
      at: now,
    });

    audio.eat({ streak: state.streak, count: state.foodEaten });

    const nextLevel = clamp(
      Math.floor(state.foodEaten / CONFIG.FOOD_PER_LEVEL) + 1, 1, CONFIG.MAX_LEVEL
    );
    if (nextLevel !== state.level) {
      state.level = nextLevel;
      state.stepMs = stepDurationForLevel(state.level);
      audio.levelUp();
      particles.emit('star', (position.x + 0.5) * state.cell, (position.y + 0.5) * state.cell, {
        count: 10,
        scale: reduced ? 0 : 1,
      });
      announce(`Level ${state.level}. The noodle is faster now.`);
      say('level', { level: state.level });
    } else {
      say('eat', { score: state.score, streak: state.streak, level: state.level });
    }

    updateStats();

    // No free cell left means the board is full — a perfect run.
    if (!spawnFood()) endGame('win');
  }

  /** Spot a squeaky-bum moment so the noodle can comment on it. */
  function noticeNearMiss(head, vector) {
    const now = performance.now();
    if (now - state.lastCloseAt < 6000) return;

    const ahead = { x: head.x + vector.x, y: head.y + vector.y };
    const offBoard = ahead.x < 0 || ahead.y < 0 ||
      ahead.x >= CONFIG.GRID_SIZE || ahead.y >= CONFIG.GRID_SIZE;
    const intoSelf = state.snake.slice(0, -1).some((s) => samePosition(s, ahead));

    if (offBoard || intoSelf) {
      state.lastCloseAt = now;
      say('close', {});
    }
  }

  /** Accumulate real time and run as many fixed steps as it pays for. */
  function update(deltaMs, now) {
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

      // The noodle gets bored if you hold one direction for ages
      if (now - state.lastTurnAt > 9000) {
        state.lastTurnAt = now;
        say('idle', { seconds: 9 });
      }
    }

    particles.update(deltaMs);

    if (state.deathFlash > 0) state.deathFlash = Math.max(0, state.deathFlash - deltaMs / 420);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - deltaMs / 300);

    // Retire finished score popups
    for (let i = state.scorePops.length - 1; i >= 0; i -= 1) {
      if (now - state.scorePops[i].at > 900) state.scorePops.splice(i, 1);
    }
    if (state.eatFx && now - state.eatFx.at > 320) state.eatFx = null;
  }

  /* ====================================================================== *
   * The noodle's face — what it is feeling right now
   * ====================================================================== */

  /** How far the snack is, in cells, from the head. */
  function foodDistance() {
    const head = state.snake[0];
    return Math.abs(state.food.x - head.x) + Math.abs(state.food.y - head.y);
  }

  function currentExpression(now) {
    if (state.status === GameState.GAME_OVER) {
      if (state.deathCause === 'win') return 'eating';
      return now - state.diedAt < CONFIG.HURT_MS ? 'hurt' : 'dead';
    }
    if (now - state.lastEatAt < CONFIG.CHEW_MS) return 'eating';
    if (state.status === GameState.PLAYING) {
      if (state.level >= 7) return 'fast';
      if (foodDistance() <= CONFIG.HUNGRY_RANGE) return 'hungry';
    }
    return 'idle';
  }

  /** Pupil bias: mostly the heading, nudged toward whatever smells good. */
  function lookVector() {
    const head = state.snake[0];
    const dx = state.food.x - head.x;
    const dy = state.food.y - head.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: clamp(dx / length, -1, 1) * 0.55, y: clamp(dy / length, -1, 1) * 0.55 };
  }

  function faceOptions(now) {
    const expression = currentExpression(now);
    const sinceEat = now - state.lastEatAt;

    // A chew is one open-close pulse
    const chew = sinceEat < CONFIG.CHEW_MS
      ? Math.sin((sinceEat / CONFIG.CHEW_MS) * Math.PI)
      : 0;

    // Blink every ~3.4s unless the face is already doing something
    let blink = 0;
    if (!reduced && expression !== 'dead' && expression !== 'eating') {
      const phase = now % 3400;
      if (phase < 140) blink = Math.sin((phase / 140) * Math.PI);
    }

    const tongue = expression === 'hungry'
      ? 0.45 + 0.35 * Math.sin(now / 180)
      : (expression === 'dead' ? 1 : 0);

    return {
      dir: DIRECTIONS[state.direction],
      expression,
      chew,
      blink,
      tongue,
      look: lookVector(),
    };
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
    state.cell = size / CONFIG.GRID_SIZE;

    el.canvas.width = Math.round(size * dpr);
    el.canvas.height = Math.round(size * dpr);

    renderBackdrop();
  }

  /**
   * The board never changes between resizes or theme switches, so draw it once
   * into an offscreen canvas and blit it each frame.
   */
  function renderBackdrop() {
    if (!state.cssSize || !state.theme) return;
    const layer = state.backdrop || document.createElement('canvas');
    layer.width = Math.round(state.cssSize * state.dpr);
    layer.height = Math.round(state.cssSize * state.dpr);
    const layerCtx = layer.getContext('2d');
    layerCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    NS.drawBackdrop(layerCtx, state.cssSize, state.cell, state.theme);
    state.backdrop = layer;
  }

  function draw(now) {
    const size = state.cssSize;
    if (!size || !state.theme) return;
    const palette = state.theme;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    if (state.shake > 0) {
      const amount = state.shake * state.cell;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    if (state.backdrop) ctx.drawImage(state.backdrop, 0, 0, size, size);
    if (!reduced) NS.drawBackdropMotion(ctx, size, now, palette);

    drawFood(now, palette);
    drawNoodle(now, palette);
    particles.draw(ctx, palette, now);
    drawScorePops(now, palette);

    ctx.restore();

    if (state.deathFlash > 0) {
      ctx.fillStyle = `rgba(255, 90, 110, ${state.deathFlash * 0.26})`;
      ctx.fillRect(0, 0, size, size);
    }
  }

  function drawFood(now, palette) {
    const cell = state.cell;

    // The pop ghost of whatever was just eaten
    if (state.eatFx) {
      const age = (now - state.eatFx.at) / 320;
      const scale = 1 + easeOutCubic(age) * 0.9;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.translate((state.eatFx.x + 0.5) * cell, (state.eatFx.y + 0.5) * cell);
      ctx.scale(scale, scale);
      FOODS[state.eatFx.type].draw(ctx, cell * 0.92, now, palette);
      ctx.restore();
    }

    const food = state.food;
    const definition = FOODS[food.type];
    const age = clamp((now - food.spawnedAt) / 280, 0, 1);
    const scale = reduced ? 1 : easeOutBack(age);
    const bob = reduced ? 0 : Math.sin(now / 420 + food.x * 1.7) * cell * 0.07;
    const tilt = reduced ? 0 : Math.sin(now / 760 + food.y * 1.3) * 0.13;

    ctx.save();
    ctx.translate((food.x + 0.5) * cell, (food.y + 0.5) * cell + bob);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);
    definition.draw(ctx, cell * 0.92, now, palette);
    ctx.restore();
  }

  function drawNoodle(now, palette) {
    const cell = state.cell;

    // How far through the current step we are — this is what makes the noodle
    // glide between cells instead of teleporting.
    const t = state.status === GameState.PLAYING
      ? clamp(state.accumulator / state.stepMs, 0, 1)
      : 1;

    // Interpolate each segment from where it was to where it is. When the
    // noodle grew this step the new tail has no previous position, so it
    // simply stays put.
    const points = state.snake.map((segment, index) => {
      const previous = state.previousSnake[index] || segment;
      return {
        x: (previous.x + (segment.x - previous.x) * t + 0.5) * cell,
        y: (previous.y + (segment.y - previous.y) * t + 0.5) * cell,
      };
    });

    const dead = state.status === GameState.GAME_OVER && state.deathCause !== 'win';
    const sinceEat = now - state.lastEatAt;
    const grow = sinceEat < CONFIG.GROW_MS ? clamp(sinceEat / CONFIG.GROW_MS, 0, 1) : 0;

    NS.drawNoodleBody(ctx, points, cell, now, palette, {
      dead,
      grow,
      speed: (state.level - 1) / (CONFIG.MAX_LEVEL - 1),
    });

    const head = points[0];
    ctx.save();
    ctx.translate(head.x, head.y);
    NS.drawNoodleHead(ctx, cell, now, palette, faceOptions(now));
    ctx.restore();
  }

  function drawScorePops(now, palette) {
    if (state.scorePops.length === 0) return;
    const size = Math.max(12, state.cell * 0.62);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.28;

    for (const pop of state.scorePops) {
      const age = (now - pop.at) / 900;
      ctx.globalAlpha = clamp(1 - age * age, 0, 1);
      const y = pop.y - easeOutCubic(age) * state.cell * 1.6;
      ctx.strokeStyle = palette.ink;
      ctx.strokeText(pop.text, pop.x, y);
      ctx.fillStyle = palette.accent;
      ctx.fillText(pop.text, pop.x, y);
    }
    ctx.restore();
  }

  /* ====================================================================== *
   * Main loop — always running, so idle screens still animate
   * ====================================================================== */

  function loop(now) {
    const delta = Math.min(now - state.lastFrameTime, 250);
    state.lastFrameTime = now;

    update(delta, now);
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
    if (state.queuedTurns.length >= CONFIG.MAX_QUEUED_TURNS) return;

    state.queuedTurns.push(name);
    state.lastTurnAt = performance.now();
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
      default:
        break;
    }
  }

  /** Briefly light up the matching d-pad key when steering with the keyboard. */
  function flashDpad(direction) {
    if (!el.dpad) return;
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

  function bindDpad() {
    if (!el.dpad) return;
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
    window.setTimeout(() => element.classList.remove('is-bumped'), 260);
  }

  function updateStats() {
    if (el.score.textContent !== String(state.score)) {
      el.score.textContent = state.score;
      if (state.score > 0) bumpValue(el.score);
    }
    el.highScore.textContent = state.highScore;
    el.level.textContent = `Lv ${state.level}`;
    el.speedBar.style.width = `${(state.level / CONFIG.MAX_LEVEL) * 100}%`;

    if (el.combo) {
      const show = state.streak >= 2 && state.status === GameState.PLAYING;
      el.combo.hidden = !show;
      if (show) el.combo.textContent = `x${state.streak}`;
    }

    updateCanvasLabel();
  }

  /** The canvas is the game to a sighted player; describe it for everyone else. */
  function updateCanvasLabel() {
    el.canvas.setAttribute(
      'aria-label',
      `Hungry Noodle board, ${state.status.toLowerCase().replace('_', ' ')}. ` +
      `Score ${state.score}, length ${state.snake.length}, level ${state.level}. ` +
      'Steer with the arrow keys or W A S D.'
    );
  }

  /** Reflect the current game state in the DOM. Single source of truth. */
  function syncUI() {
    const status = state.status;
    const ready = status === GameState.READY;
    const playing = status === GameState.PLAYING;
    const paused = status === GameState.PAUSED;
    const over = status === GameState.GAME_OVER;

    el.body.dataset.state = status;

    el.panelReady.hidden = !ready;
    el.panelPaused.hidden = !paused;
    el.panelGameOver.hidden = !over;

    el.btnStart.disabled = playing || paused;
    el.btnStartLabel.textContent = over ? 'Again' : 'Start';

    el.btnPause.disabled = !(playing || paused);
    el.btnPauseLabel.textContent = paused ? 'Resume' : 'Pause';
    el.iconPause.hidden = paused;
    el.iconResume.hidden = !paused;

    el.btnRestart.disabled = ready;

    if (el.dpad) {
      for (const button of el.dpad.querySelectorAll('[data-direction]')) {
        button.disabled = over;
      }
    }

    if (el.combo && !playing) el.combo.hidden = true;

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

    if (el.themes) {
      el.themes.addEventListener('click', (event) => {
        const button = event.target.closest('[data-theme]');
        if (!button) return;
        setTheme(button.dataset.theme, { announce: true });
      });
    }

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
    state.highScore = Number.parseInt(storage.read(KEYS.HIGH_SCORE, '0'), 10) || 0;

    // Reflect the stored preferences without creating an AudioContext or
    // announcing anything before the player has done a thing.
    syncSoundUI(audio.isMuted());
    setTheme(storage.read(KEYS.THEME, 'noodle'));

    resizeCanvas();
    resetGame();
    bindEvents();

    state.lastFrameTime = performance.now();
    window.requestAnimationFrame(loop);
  }

  init();
}(window.HungryNoodle));
