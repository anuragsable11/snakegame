/**
 * HUNGRY NOODLE 3D — bootstrap and wiring.
 *
 * This is the only file that knows about all the pieces at once. It owns the
 * animation loop and translates engine events into sound, jokes, HUD updates
 * and renderer juice.
 *
 *   engine (pure rules)  ->  events  ->  main.js  ->  ui.js / renderer / audio
 *
 * Swapping the renderer swaps one object. Nothing else changes.
 */
(function (NS) {
  'use strict';

  const storage = NS.storage;
  const KEYS = NS.STORAGE_KEYS;
  const GameState = NS.GameState;
  const reduced = NS.prefersReducedMotion;

  function boot() {
    /* ------------------------------------------------------- collaborators */

    const engine = NS.createEngine({
      gridSize: NS.CONFIG.GRID_SIZE,
      mode: storage.read(KEYS.MODE, 'classic'),
      difficulty: storage.read(KEYS.DIFFICULTY, 'normal'),
    });

    const audio = NS.createAudio(storage);
    const banter = NS.createBanter();

    let renderer = null;
    let theme = NS.THEMES[storage.read(KEYS.THEME, 'noodle')] || NS.THEMES.noodle;
    let highScore = 0;
    let lastFrameTime = 0;
    let boardSize = 0;

    const webglOK = NS.isWebGLAvailable() && !!window.THREE;
    // Honour the stored preference, but never promise 3D we can't deliver
    let rendererId = webglOK ? storage.read(KEYS.RENDERER, '3d') : '2d';
    if (!webglOK) rendererId = '2d';

    /* ------------------------------------------------------------ helpers */

    function readHighScore() {
      return Number.parseInt(storage.read(NS.highScoreKey(engine.state.mode.id), '0'), 10) || 0;
    }

    function refreshHud() {
      ui.updateHud(engine.state, highScore);
    }

    function say(trigger, context) {
      ui.say(banter.pick(trigger, context || {}));
    }

    /* ----------------------------------------------------------- renderer */

    function createRenderer(id) {
      const canvas = ui.el.canvas;
      if (id === '3d') {
        const made = NS.createRenderer3D(canvas, { reduced });
        made.mount();
        return made;
      }
      const made = NS.createRenderer2D(canvas, { reduced });
      made.mount();
      return made;
    }

    /**
     * Swapping renderers means swapping the canvas too: a canvas that has ever
     * handed out a WebGL context can never hand out a 2D one, and vice versa.
     */
    function useRenderer(id, options) {
      const previous = renderer;
      const oldCanvas = ui.el.canvas;

      const fresh = document.createElement('canvas');
      fresh.id = 'board';
      fresh.setAttribute('role', 'img');
      fresh.setAttribute('aria-label', oldCanvas.getAttribute('aria-label') || 'Hungry Noodle board');

      try {
        oldCanvas.replaceWith(fresh);
        ui.el.canvas = fresh;
        renderer = createRenderer(id);
        rendererId = id;
      } catch (error) {
        // 3D failed — fall back rather than showing a blank board
        if (id === '3d') {
          console.warn('Hungry Noodle: 3D unavailable, falling back to 2D.', error);
          const fallback = document.createElement('canvas');
          fallback.id = 'board';
          fallback.setAttribute('role', 'img');
          fresh.replaceWith(fallback);
          ui.el.canvas = fallback;
          renderer = createRenderer('2d');
          rendererId = '2d';
          ui.announce('3D graphics are unavailable, so the game is running in 2D.');
        } else {
          throw error;
        }
      }

      if (previous && previous.dispose) previous.dispose();

      renderer.setTheme(theme);
      boardSize = 0;             // force a resize on the new canvas
      resize();
      ui.syncRenderer(rendererId, webglOK);
      storage.write(KEYS.RENDERER, rendererId);

      // The swap replaced the element the swipe handler was bound to
      ui.bindSwipe();

      if (options && options.announce) {
        ui.announce(`${rendererId === '3d' ? '3D' : '2D'} graphics.`);
      }
    }

    function resize() {
      const size = ui.boardSize();
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      if (size === boardSize) return;
      boardSize = size;
      if (renderer) renderer.resize(size, ratio);
    }

    /* -------------------------------------------------------------- input */

    function steer(direction) {
      audio.unlock();
      if (ui.getScreen() === 'menu') return;
      if (engine.state.status === GameState.READY) {
        startRun();
      }
      if (engine.queueTurn(direction)) audio.turn();
    }

    function startRun() {
      audio.unlock();
      engine.start();
      ui.showScreen('game');
      ui.syncState(engine.state);
      refreshHud();
      audio.start();
      ui.announce(`${engine.state.mode.name} on ${engine.state.difficulty.name}. Go!`);
      say('start', {});
    }

    function openMenu() {
      engine.reset();
      ui.showScreen('menu');
      ui.hideToast();
      highScore = readHighScore();
      ui.syncMenu(engine.state, highScore);
      ui.syncState(engine.state);
      refreshHud();
      ui.focusButton(ui.el.btnPlay);
    }

    const handlers = {
      play: startRun,
      restart: startRun,

      resume() {
        engine.resume();
        lastFrameTime = performance.now();
        ui.syncState(engine.state);
        ui.announce('Resumed.');
      },

      togglePause() {
        if (ui.getScreen() === 'menu') return;
        const wasPlaying = engine.state.status === GameState.PLAYING;
        engine.togglePause();
        lastFrameTime = performance.now();
        ui.syncState(engine.state, { hideToast: wasPlaying });
        if (engine.state.status === GameState.PAUSED) {
          ui.announce(`Paused at ${engine.state.score} points.`);
          ui.focusButton(ui.el.btnOverlayResume);
        } else {
          ui.announce('Resumed.');
        }
      },

      primary() {
        if (ui.getScreen() === 'menu') { startRun(); return; }
        const status = engine.state.status;
        if (status === GameState.READY || status === GameState.GAME_OVER) startRun();
        else handlers.togglePause();
      },

      escape() {
        if (ui.getScreen() === 'menu') return;
        if (engine.state.status === GameState.PLAYING) handlers.togglePause();
        else openMenu();
      },

      blur() {
        if (engine.state.status !== GameState.PLAYING) return;
        engine.pause();
        ui.syncState(engine.state, { hideToast: true });
      },

      steer,
      openMenu,

      toggleSound() {
        const muted = !audio.isMuted();
        audio.setMuted(muted);
        ui.syncSound(muted);
        if (!muted) audio.click();
        ui.announce(muted ? 'Sound muted.' : 'Sound on.');
      },

      click(isSoundButton) {
        audio.unlock();
        if (!isSoundButton) audio.click();
      },

      toggleRenderer() {
        if (!webglOK) return;
        useRenderer(rendererId === '3d' ? '2d' : '3d', { announce: true });
      },

      setMode(id) {
        engine.setMode(id);
        storage.write(KEYS.MODE, id);
        highScore = readHighScore();
        ui.syncMenu(engine.state, highScore);
        refreshHud();
      },

      setDifficulty(id) {
        engine.setDifficulty(id);
        storage.write(KEYS.DIFFICULTY, id);
        ui.syncMenu(engine.state, highScore);
        refreshHud();
      },

      setTheme(id) {
        theme = NS.THEMES[id] || NS.THEMES.noodle;
        storage.write(KEYS.THEME, theme.id);
        document.body.dataset.theme = theme.id;
        if (renderer) renderer.setTheme(theme);
        ui.syncThemeChips(theme.id);
        ui.announce(`${theme.name} theme.`);
        say('theme', { name: theme.name });
      },
    };

    const ui = NS.createUI(handlers);

    /* ------------------------------------------------- engine subscriptions */

    engine.on('eat', (payload) => {
      const points = NS.CONFIG.POINTS_PER_FOOD * payload.level;
      audio.eat({ streak: payload.streak, count: payload.count });
      if (renderer && renderer.onEat) {
        renderer.onEat({ ...payload, points, now: performance.now() });
      }
      refreshHud();
      say('eat', payload);
    });

    engine.on('level', (payload) => {
      audio.levelUp();
      if (renderer && renderer.onLevel) {
        renderer.onLevel({ ...payload, head: engine.state.snake[0] });
      }
      refreshHud();
      ui.announce(`Level ${payload.level}. The noodle is faster now.`);
      say('level', payload);
    });

    engine.on('close', () => say('close', {}));
    engine.on('idle', (payload) => say('idle', payload));

    engine.on('death', (payload) => {
      const isRecord = payload.score > highScore && payload.score > 0;
      if (isRecord) {
        highScore = payload.score;
        storage.write(NS.highScoreKey(engine.state.mode.id), highScore);
      }

      if (renderer && renderer.onDeath) {
        renderer.onDeath({ ...payload, head: engine.state.snake[0] });
      }
      if (isRecord) {
        audio.record();
        if (renderer && renderer.onRecord) renderer.onRecord();
      } else {
        audio.gameOver(payload.cause);
      }

      refreshHud();
      ui.syncState(engine.state, { hideToast: true });
      ui.showGameOver({
        cause: payload.cause,
        score: payload.score,
        length: payload.length,
        highScore,
        isRecord,
        reason: banter.pick('over', { cause: payload.cause, score: payload.score }) ||
          'The noodle has left the chat.',
      });
      ui.announce(
        `Game over. ${payload.score} points with a length of ${payload.length}.` +
        (isRecord ? ' That is a new high score!' : '')
      );
    });

    engine.on('reset', () => {
      banter.reset();
      if (renderer && renderer.onReset) renderer.onReset();
    });

    /* --------------------------------------------------------------- loop */

    function loop(now) {
      const delta = Math.min(now - lastFrameTime, 250);
      lastFrameTime = now;

      engine.update(delta);
      if (renderer) {
        if (renderer.update) renderer.update(delta, now);
        renderer.render(engine, now, delta);
      }

      // The clock is the only HUD value that changes without an event
      if (engine.state.mode.timed && engine.state.status === GameState.PLAYING) {
        refreshHud();
      }

      window.requestAnimationFrame(loop);
    }

    /* --------------------------------------------------------------- init */

    document.body.dataset.theme = theme.id;
    ui.bind();
    ui.syncSound(audio.isMuted());
    ui.syncThemeChips(theme.id);

    useRenderer(rendererId);
    if (!webglOK) {
      ui.announce('3D graphics are unavailable here, so the game is running in 2D.');
    }

    highScore = readHighScore();
    engine.reset();
    ui.showScreen('menu');
    ui.syncMenu(engine.state, highScore);
    ui.syncState(engine.state);
    refreshHud();

    if ('ResizeObserver' in window) {
      new ResizeObserver(resize).observe(ui.el.boardWrap);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    lastFrameTime = performance.now();
    window.requestAnimationFrame(loop);

    NS.game = { engine, ui, get renderer() { return renderer; } };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}(window.HungryNoodle));
