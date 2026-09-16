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

    // Records the live run so it can be replayed and raced against later.
    const recorder = NS.createRecorder(engine);

    // The ghost is an entirely separate engine replaying the stored best
    // run. It shares nothing with the player: its own seed, its own RNG,
    // its own state. It cannot collide, score, or perturb the live game.
    let ghost = null;
    let ghostAccumulator = 0;

    /** The most recent finished run, kept so the UI can offer a replay. */
    let lastReplay = null;

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

    /**
     * Extra menu context: the daily banner, and whether a ghost is available
     * for the current configuration.
     */
    function menuInfo() {
      const isDaily = Boolean(engine.state.mode.daily);
      const challenge = isDaily ? NS.dailyChallenge() : null;
      const result = challenge ? NS.getDailyResult(challenge.date) : null;

      const ghostReplay = NS.loadBestReplay(engine.state.mode.id, {
        difficulty: isDaily ? NS.DAILY_DIFFICULTY : engine.state.difficulty.id,
        gridSize: engine.state.gridSize,
        seed: challenge ? challenge.seed : undefined,
      });

      return {
        daily: challenge ? {
          date: challenge.date,
          label: NS.dailyLabel(challenge.date),
          best: result ? result.score : null,
        } : null,
        hasGhost: Boolean(ghostReplay),
      };
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
      if (engine.queueTurn(direction)) {
        recorder.onTurn(direction);
        audio.turn();
      }
    }

    /**
     * Pick the seed for the next run. Daily mode is seeded from the UTC
     * date so everyone gets the same board; everything else is random.
     */
    function seedNextRun() {
      if (engine.state.mode.daily) {
        // Same board, same speed, for everyone, on this UTC date
        if (engine.state.difficulty.id !== NS.DAILY_DIFFICULTY) {
          engine.setDifficulty(NS.DAILY_DIFFICULTY);
        }
        engine.setSeed(NS.dailyChallenge().seed);
      } else {
        engine.setSeed(NS.randomSeed());
      }
    }

    /** Load the stored best run for this configuration, if there is one. */
    function loadGhost() {
      ghost = null;
      const replay = NS.loadBestReplay(engine.state.mode.id, {
        difficulty: engine.state.difficulty.id,
        gridSize: engine.state.gridSize,
        seed: engine.state.mode.daily ? engine.getSeed() : undefined,
      });
      if (!replay) return;
      try {
        ghost = NS.createPlayback(replay);
      } catch (error) {
        // A ghost is a nicety — never let it take the game down
        ghost = null;
      }
    }

    function startRun() {
      audio.unlock();
      seedNextRun();
      engine.start();
      recorder.start();
      loadGhost();
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
      ui.syncMenu(engine.state, highScore, menuInfo());
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
        ui.syncMenu(engine.state, highScore, menuInfo());
        refreshHud();
      },

      setDifficulty(id) {
        engine.setDifficulty(id);
        storage.write(KEYS.DIFFICULTY, id);
        ui.syncMenu(engine.state, highScore, menuInfo());
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

      // Persist the run: the replay becomes the ghost, and daily results
      // are kept per UTC date. Both verify before they are trusted.
      const replay = recorder.finish();
      let ghostSaved = false;
      try {
        ghostSaved = NS.saveBestReplay(replay);
      } catch (error) {
        ghostSaved = false;
      }
      if (engine.state.mode.daily) {
        NS.saveDailyResult(NS.dailyDateKey(), payload.score);
      }
      lastReplay = replay;

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
      ghostAccumulator = 0;
      if (renderer && renderer.onReset) renderer.onReset();
    });

    /* -------------------------------------------------------------- ghost */

    /**
     * Advance the ghost in real time, at the pace its own replay dictates.
     *
     * It runs on a private accumulator rather than the player's: the ghost
     * may be a faster or slower run, so its step duration is its own. Nothing
     * here can reach the live engine.
     */

    function advanceGhost(deltaMs) {
      if (!ghost || ghost.done()) return;
      if (engine.state.status !== GameState.PLAYING) return;

      ghostAccumulator += deltaMs;
      let steps = 0;
      while (ghostAccumulator >= ghost.engine.state.stepMs && steps < 4) {
        ghostAccumulator -= ghost.engine.state.stepMs;
        steps += 1;
        if (!ghost.step()) break;
      }
      if (ghostAccumulator > ghost.engine.state.stepMs) ghostAccumulator = 0;
    }

    /**
     * A read-only snapshot for the renderers: interpolated body positions and
     * nothing else. Renderers get positions, not an engine, so there is no way
     * for drawing code to drive the ghost simulation.
     *
     * @returns {{points: Array<{x:number,y:number}>, alpha:number}|null}
     */
    function ghostView() {
      if (!ghost || ghost.done()) return null;
      if (engine.state.status !== GameState.PLAYING) return null;
      const ghostState = ghost.engine.state;
      if (ghostState.status !== GameState.PLAYING) return null;

      return {
        snake: ghostState.snake,
        previousSnake: ghostState.previousSnake,
        alpha: Math.min(ghostAccumulator / ghostState.stepMs, 1),
        score: ghostState.score,
      };
    }

    /* --------------------------------------------------------------- loop */

    function loop(now) {
      const delta = Math.min(now - lastFrameTime, 250);
      lastFrameTime = now;

      engine.update(delta);
      advanceGhost(delta);

      if (renderer) {
        if (renderer.update) renderer.update(delta, now);
        if (renderer.setGhost) renderer.setGhost(ghostView());
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
    ui.syncMenu(engine.state, highScore, menuInfo());
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
