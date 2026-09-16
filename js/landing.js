/**
 * HUNGRY NOODLE 3D — the landing page's live demo ("attract mode").
 *
 * The hero shows the real game playing itself: the same engine, the same
 * renderer, driven by a small autopilot instead of a keyboard. This is only
 * possible because the engine has no idea what a keyboard is — it just takes
 * queueTurn() calls from whoever is steering.
 *
 * No audio here: nobody wants a landing page that chomps at them.
 */
(function (NS) {
  'use strict';

  const GameState = NS.GameState;
  const DIRECTIONS = NS.DIRECTIONS;
  const OPPOSITE = NS.OPPOSITE;
  const storage = NS.storage;
  const reduced = NS.prefersReducedMotion;

  const $ = (id) => document.getElementById(id);

  /* ====================================================================== *
   * Autopilot — greedy toward the snack, with a one-step "don't box
   * yourself in" lookahead. Dumb enough to die now and then, which is funny.
   * ====================================================================== */

  function makeAutopilot(engine) {
    const grid = engine.state.gridSize;

    function isFree(x, y, state, includeTail) {
      if (!state.mode.wrap && (x < 0 || y < 0 || x >= grid || y >= grid)) return false;
      const wx = (x + grid) % grid;
      const wy = (y + grid) % grid;
      if (state.obstacles.some((b) => b.x === wx && b.y === wy)) return false;
      const body = includeTail ? state.snake : state.snake.slice(0, -1);
      return !body.some((s) => s.x === wx && s.y === wy);
    }

    /** How many exits a cell would leave us — 0 means a dead end. */
    function exits(x, y, state) {
      let n = 0;
      for (const key of Object.keys(DIRECTIONS)) {
        const v = DIRECTIONS[key];
        if (isFree(x + v.x, y + v.y, state, true)) n += 1;
      }
      return n;
    }

    return function drive() {
      const state = engine.state;
      if (state.status !== GameState.PLAYING) return;
      if (state.queuedTurns.length > 0) return;   // let the last decision play out

      const head = state.snake[0];
      const heading = state.direction;
      let best = null;
      let bestScore = -Infinity;

      for (const key of Object.keys(DIRECTIONS)) {
        if (key === OPPOSITE[heading]) continue;
        const v = DIRECTIONS[key];
        const nx = head.x + v.x;
        const ny = head.y + v.y;
        if (!isFree(nx, ny, state, false)) continue;

        // Closer to the snack is better; a cell with more exits is safer
        let dx = state.food.x - nx;
        let dy = state.food.y - ny;
        if (state.mode.wrap) {
          dx = Math.abs(dx) > grid / 2 ? grid - Math.abs(dx) : Math.abs(dx);
          dy = Math.abs(dy) > grid / 2 ? grid - Math.abs(dy) : Math.abs(dy);
        } else {
          dx = Math.abs(dx);
          dy = Math.abs(dy);
        }
        const distance = dx + dy;
        const room = exits(nx, ny, state);
        const score = -distance * 1.0 + room * 2.2 + (key === heading ? 0.6 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = key;
        }
      }

      if (best && best !== heading) engine.queueTurn(best);
    };
  }

  /* ====================================================================== *
   * Boot
   * ====================================================================== */

  function boot() {
    const canvasHost = $('demo-wrap');
    const caption = $('demo-caption');
    const scoreEl = $('demo-score');
    const modeEl = $('demo-mode');
    if (!canvasHost || !$('demo')) return;   // not on the landing page

    const engine = NS.createEngine({ mode: 'classic', difficulty: 'normal' });
    const banter = NS.createBanter();
    const theme = NS.THEMES[storage.read(NS.STORAGE_KEYS.THEME, 'jungle')] || NS.THEMES.noodle;

    let renderer = null;
    let rendererId = '2d';
    let driver = makeAutopilot(engine);
    let restarts = 0;
    let lastFrame = 0;
    let size = 0;

    const webglOK = NS.isWebGLAvailable() && !!window.THREE;
    try {
      if (webglOK) {
        renderer = NS.createRenderer3D($('demo'), { reduced });
        rendererId = '3d';
      }
    } catch (error) {
      renderer = null;
    }
    if (!renderer) {
      // A canvas that failed WebGL can't become 2D, so swap it for a fresh one
      const fresh = document.createElement('canvas');
      fresh.id = 'demo';
      fresh.setAttribute('role', 'img');
      fresh.setAttribute('aria-label', 'A live demo of Hungry Noodle, playing itself.');
      $('demo').replaceWith(fresh);
      renderer = NS.createRenderer2D(fresh, { reduced });
      rendererId = '2d';
    }
    renderer.mount();
    renderer.setTheme(theme);
    if (modeEl) modeEl.textContent = rendererId === '3d' ? '3D' : '2D';

    function say(line) {
      if (line && caption) caption.textContent = line;
    }

    function resize() {
      const next = Math.max(1, Math.round(canvasHost.getBoundingClientRect().width));
      if (next === size) return;
      size = next;
      renderer.resize(size, Math.min(window.devicePixelRatio || 1, 2));
    }

    function restart() {
      restarts += 1;
      engine.start();
      say(banter.pick('start', {}) || 'READY TO EAT?');
    }

    engine.on('eat', (payload) => {
      if (scoreEl) scoreEl.textContent = payload.score;
      if (renderer.onEat) {
        renderer.onEat({ ...payload, points: NS.CONFIG.POINTS_PER_FOOD * payload.level,
          now: performance.now() });
      }
      const line = banter.pick('eat', payload);
      if (line) say(line);
    });

    engine.on('level', (payload) => {
      if (renderer.onLevel) renderer.onLevel({ ...payload, head: engine.state.snake[0] });
      say(banter.pick('level', payload));
    });

    engine.on('death', (payload) => {
      if (renderer.onDeath) renderer.onDeath({ ...payload, head: engine.state.snake[0] });
      say(banter.pick('over', { cause: payload.cause, score: payload.score }) ||
        'RIP NOODLE 🐍');
      // A beat to appreciate the crash, then he's back at it
      window.setTimeout(() => {
        if (engine.state.status === GameState.GAME_OVER) restart();
      }, 1600);
    });

    engine.on('reset', () => {
      if (renderer.onReset) renderer.onReset();
      if (scoreEl) scoreEl.textContent = '0';
    });

    function loop(now) {
      const delta = Math.min(now - lastFrame, 250);
      lastFrame = now;

      driver();
      engine.update(delta);
      if (renderer.update) renderer.update(delta, now);
      renderer.render(engine, now, delta);

      window.requestAnimationFrame(loop);
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(resize).observe(canvasHost);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    // Don't burn the battery while the tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) engine.pause();
      else if (engine.state.status === GameState.PAUSED) engine.resume();
    });

    restart();
    lastFrame = performance.now();
    window.requestAnimationFrame(loop);

    NS.landing = {
      engine,
      get renderer() { return renderer; },
      get restarts() { return restarts; },
      /** Swap the driver — lets a future "watch the AI" mode plug in. */
      setDriver(fn) { driver = typeof fn === 'function' ? fn : makeAutopilot(engine); },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}(window.HungryNoodle));
