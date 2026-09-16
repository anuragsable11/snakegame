/**
 * HUNGRY NOODLE 3D — everything that touches the DOM.
 *
 * The HUD, the menus, the overlays and all input binding live here. This layer
 * never simulates anything: it reports intent to main.js through the handlers
 * it is given, and paints whatever state it is told to paint.
 */
(function (NS) {
  'use strict';

  const GameState = NS.GameState;
  const KEY_TO_DIRECTION = NS.KEY_TO_DIRECTION;

  const $ = (id) => document.getElementById(id);

  NS.createUI = function createUI(handlers) {
    const el = {
      body: document.body,
      canvas: $('board'),
      boardWrap: $('board-wrap'),
      score: $('score'),
      highScore: $('high-score'),
      level: $('level'),
      speedBar: $('speed-bar'),
      combo: $('combo'),
      timer: $('timer'),
      timerChip: $('timer-chip'),
      toast: $('toast'),
      toastText: $('toast-text'),
      ghostFlag: $('ghost-flag'),

      panelMenu: $('panel-menu'),
      panelReady: $('panel-ready'),
      panelPaused: $('panel-paused'),
      panelGameOver: $('panel-gameover'),

      menuBest: $('menu-best'),
      menuDaily: $('menu-daily'),
      menuDailyDate: $('menu-daily-date'),
      menuGhost: $('menu-ghost'),
      menuModeName: $('menu-mode-name'),
      menuModeBlurb: $('menu-mode-blurb'),

      gameOverKicker: $('gameover-kicker'),
      gameOverTitle: $('gameover-title'),
      gameOverReason: $('gameover-reason'),
      finalScore: $('final-score'),
      finalHigh: $('final-high'),
      finalLength: $('final-length'),
      newRecord: $('new-record'),

      btnPlay: $('btn-play'),
      btnStart: $('btn-start'),
      btnStartLabel: $('btn-start-label'),
      btnPause: $('btn-pause'),
      btnPauseLabel: $('btn-pause-label'),
      btnRestart: $('btn-restart'),
      btnSound: $('btn-sound'),
      btnRender: $('btn-render'),
      btnRenderLabel: $('btn-render-label'),
      btnMenu: $('btn-menu'),
      iconPause: $('icon-pause'),
      iconResume: $('icon-resume'),
      iconSoundOn: $('icon-sound-on'),
      iconSoundOff: $('icon-sound-off'),

      btnOverlayStart: $('btn-overlay-start'),
      btnOverlayResume: $('btn-overlay-resume'),
      btnOverlayRestart: $('btn-overlay-restart'),
      btnOverlayAgain: $('btn-overlay-again'),
      btnOverlayMenu: $('btn-overlay-menu'),

      modes: document.querySelector('.modes'),
      difficulties: document.querySelector('.difficulties'),
      themes: document.querySelector('.themes'),
      dpad: document.querySelector('.dpad'),
      announcer: $('announcer'),
    };

    let screen = 'menu';       // 'menu' | 'game'
    let toastTimer = 0;

    /* ------------------------------------------------------------ speaking */

    function announce(message) {
      el.announcer.textContent = message;
    }

    function say(line) {
      if (!line) return;
      el.toastText.textContent = line;
      el.toast.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        el.toast.classList.remove('is-visible');
      }, NS.CONFIG.TOAST_MS);
    }

    /** Show or hide the in-game "you are racing your best run" badge. */
    function setGhostFlag(active) {
      if (!el.ghostFlag) return;
      el.ghostFlag.classList.toggle('is-visible', Boolean(active));
    }

    function hideToast() {
      window.clearTimeout(toastTimer);
      el.toast.classList.remove('is-visible');
    }

    /* ---------------------------------------------------------------- HUD */

    function bump(element) {
      element.classList.remove('is-bumped');
      void element.offsetWidth;   // force a reflow so it can retrigger
      element.classList.add('is-bumped');
      window.setTimeout(() => element.classList.remove('is-bumped'), 260);
    }

    function updateHud(state, highScore) {
      if (el.score.textContent !== String(state.score)) {
        el.score.textContent = state.score;
        if (state.score > 0) bump(el.score);
      }
      el.highScore.textContent = highScore;
      el.level.textContent = `Lv ${state.level}`;

      const cap = Math.min(state.mode.levelCap, 12);
      el.speedBar.style.width = `${Math.min(100, (state.level / cap) * 100)}%`;

      const showCombo = state.streak >= 2 && state.status === GameState.PLAYING;
      el.combo.hidden = !showCombo;
      if (showCombo) el.combo.textContent = `x${state.streak}`;

      // Time Attack only
      el.timerChip.hidden = !state.mode.timed;
      if (state.mode.timed) {
        const seconds = Math.max(0, state.timeLeftMs / 1000);
        el.timer.textContent = seconds.toFixed(1);
        el.timerChip.classList.toggle('is-urgent', seconds <= 10);
      }

      updateCanvasLabel(state);
    }

    function updateCanvasLabel(state) {
      el.canvas.setAttribute(
        'aria-label',
        `Hungry Noodle board, ${state.status.toLowerCase().replace('_', ' ')}, ` +
        `${state.mode.name} mode on ${state.difficulty.name}. ` +
        `Score ${state.score}, length ${state.snake.length}, level ${state.level}. ` +
        'Steer with the arrow keys or W A S D.'
      );
    }

    /* ------------------------------------------------------------ screens */

    function showScreen(next) {
      screen = next;
      el.body.dataset.screen = next;
    }

    function syncState(state, options) {
      const status = state.status;
      const inMenu = screen === 'menu';
      const ready = !inMenu && status === GameState.READY;
      const playing = status === GameState.PLAYING;
      const paused = status === GameState.PAUSED;
      const over = status === GameState.GAME_OVER;

      el.body.dataset.state = status;

      el.panelMenu.hidden = !inMenu;
      el.panelReady.hidden = !ready;
      el.panelPaused.hidden = !paused;
      el.panelGameOver.hidden = !over;

      el.btnStart.disabled = inMenu || playing || paused;
      el.btnStartLabel.textContent = over ? 'Again' : 'Start';
      el.btnPause.disabled = !(playing || paused);
      el.btnPauseLabel.textContent = paused ? 'Resume' : 'Pause';
      el.iconPause.hidden = paused;
      el.iconResume.hidden = !paused;
      el.btnRestart.disabled = inMenu || ready;

      if (el.dpad) {
        for (const button of el.dpad.querySelectorAll('[data-direction]')) {
          button.disabled = inMenu || over;
        }
      }

      if (!playing) el.combo.hidden = true;
      if (options && options.hideToast) hideToast();
      updateCanvasLabel(state);
    }

    /* ------------------------------------------------------- game over card */

    function showGameOver(payload) {
      el.finalScore.textContent = payload.score;
      el.finalHigh.textContent = payload.highScore;
      el.finalLength.textContent = payload.length;
      el.newRecord.hidden = !payload.isRecord;

      if (payload.cause === 'win') {
        el.gameOverKicker.textContent = 'PERFECT NOODLE';
        el.gameOverKicker.classList.remove('overlay__kicker--danger');
        el.gameOverTitle.textContent = 'You ate the whole board';
      } else if (payload.cause === 'timeout') {
        el.gameOverKicker.textContent = "TIME'S UP";
        el.gameOverKicker.classList.add('overlay__kicker--danger');
        el.gameOverTitle.textContent = 'The clock beat you';
      } else {
        el.gameOverKicker.textContent = 'NOODLE DOWN';
        el.gameOverKicker.classList.add('overlay__kicker--danger');
        el.gameOverTitle.textContent =
          payload.cause === 'self' ? 'You ate yourself'
            : payload.cause === 'obstacle' ? 'You hit a bin'
              : 'You hit the wall';
      }
      el.gameOverReason.textContent = payload.reason;
      focusButton(el.btnOverlayAgain);
    }

    function focusButton(button) {
      if (!button) return;
      window.requestAnimationFrame(() => {
        if (!button.offsetParent) return;   // hidden — nothing to focus
        button.focus({ preventScroll: true });
      });
    }

    /* ------------------------------------------------------------ pickers */

    function syncChips(container, activeId) {
      if (!container) return;
      for (const button of container.querySelectorAll('[data-value]')) {
        const active = button.dataset.value === activeId;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    }

    /**
     * @param {object} state
     * @param {number} highScore
     * @param {{daily?: {date: string, label: string, best: number|null},
     *          hasGhost?: boolean}} [extra]
     */
    function syncMenu(state, highScore, extra) {
      syncChips(el.modes, state.mode.id);
      syncChips(el.difficulties, state.difficulty.id);
      el.menuBest.textContent = highScore;
      el.menuModeName.textContent = `${state.mode.emoji} ${state.mode.name}`;
      el.menuModeBlurb.textContent = state.mode.blurb;

      const info = extra || {};

      // Daily banner: only meaningful in daily mode
      const isDaily = Boolean(state.mode.daily);
      if (el.menuDaily) el.menuDaily.hidden = !isDaily;
      if (isDaily && info.daily && el.menuDailyDate) {
        el.menuDailyDate.textContent = info.daily.best === null
          ? info.daily.label
          : `${info.daily.label} · your best ${info.daily.best}`;
      }

      // Difficulty is pinned for the daily board, so hide the choice
      if (el.difficulties) el.difficulties.hidden = isDaily;

      if (el.menuGhost) el.menuGhost.hidden = !info.hasGhost;
    }

    function syncThemeChips(themeId) {
      if (!el.themes) return;
      for (const button of el.themes.querySelectorAll('[data-theme]')) {
        const active = button.dataset.theme === themeId;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    }

    function syncSound(muted) {
      el.btnSound.setAttribute('aria-pressed', String(!muted));
      el.btnSound.setAttribute('aria-label', muted ? 'Unmute sound effects' : 'Mute sound effects');
      el.iconSoundOn.hidden = muted;
      el.iconSoundOff.hidden = !muted;
    }

    function syncRenderer(rendererId, available) {
      if (!el.btnRender) return;
      el.btnRenderLabel.textContent = rendererId === '3d' ? '3D' : '2D';
      el.btnRender.setAttribute('aria-pressed', String(rendererId === '3d'));
      el.btnRender.setAttribute('aria-label',
        rendererId === '3d' ? 'Switch to 2D graphics' : 'Switch to 3D graphics');
      el.btnRender.disabled = !available;
      el.btnRender.title = available
        ? 'Toggle 3D / 2D graphics'
        : '3D unavailable — WebGL is not supported here';
    }

    /* -------------------------------------------------------------- input */

    function flashDpad(direction) {
      if (!el.dpad) return;
      const button = el.dpad.querySelector(`[data-direction="${direction}"]`);
      if (!button) return;
      button.classList.add('is-pressed');
      window.setTimeout(() => button.classList.remove('is-pressed'), 110);
    }

    function handleKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const onButton = document.activeElement instanceof HTMLButtonElement;

      const direction = KEY_TO_DIRECTION[key];
      if (direction) {
        event.preventDefault();       // arrows must not scroll the page
        handlers.steer(direction);
        flashDpad(direction);
        return;
      }

      switch (key) {
        case ' ':
        case 'spacebar':
        case 'enter':
          if (onButton) return;       // let a focused button handle itself
          event.preventDefault();
          handlers.primary();
          break;
        case 'p':
          event.preventDefault();
          handlers.togglePause();
          break;
        case 'r':
          event.preventDefault();
          handlers.restart();
          break;
        case 'm':
          event.preventDefault();
          handlers.toggleSound();
          break;
        case 'escape':
          handlers.escape();
          break;
        default:
          break;
      }
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
          handlers.steer(direction);
        });

        button.addEventListener('click', () => {
          if (performance.now() - lastPointerAt < 600) return;
          handlers.steer(direction);
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
        handlers.steer(direction);
        flashDpad(direction);
      });

      const stop = () => { tracking = false; };
      el.canvas.addEventListener('pointerup', stop);
      el.canvas.addEventListener('pointercancel', stop);
    }

    function bind() {
      el.btnPlay.addEventListener('click', handlers.play);
      el.btnStart.addEventListener('click', handlers.restart);
      el.btnRestart.addEventListener('click', handlers.restart);
      el.btnOverlayStart.addEventListener('click', handlers.restart);
      el.btnOverlayAgain.addEventListener('click', handlers.restart);
      el.btnOverlayRestart.addEventListener('click', handlers.restart);
      el.btnPause.addEventListener('click', handlers.togglePause);
      el.btnOverlayResume.addEventListener('click', handlers.resume);
      el.btnSound.addEventListener('click', handlers.toggleSound);
      el.btnMenu.addEventListener('click', handlers.openMenu);
      el.btnOverlayMenu.addEventListener('click', handlers.openMenu);
      if (el.btnRender) el.btnRender.addEventListener('click', handlers.toggleRenderer);

      if (el.modes) {
        el.modes.addEventListener('click', (event) => {
          const button = event.target.closest('[data-value]');
          if (button) handlers.setMode(button.dataset.value);
        });
      }
      if (el.difficulties) {
        el.difficulties.addEventListener('click', (event) => {
          const button = event.target.closest('[data-value]');
          if (button) handlers.setDifficulty(button.dataset.value);
        });
      }
      if (el.themes) {
        el.themes.addEventListener('click', (event) => {
          const button = event.target.closest('[data-theme]');
          if (button) handlers.setTheme(button.dataset.theme);
        });
      }

      // A soft tick for every button except the d-pad, which has its own sound
      document.addEventListener('click', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest('button')
          : null;
        if (!button || button.closest('.dpad')) return;
        handlers.click(button === el.btnSound);
      });

      window.addEventListener('keydown', handleKeyDown);
      bindDpad();
      // Swipe is bound separately: swapping renderers replaces the canvas
      // element, so main.js re-binds it after every swap.

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) handlers.blur();
      });
      window.addEventListener('blur', handlers.blur);
    }

    return {
      el,
      bind,
      bindSwipe,
      announce,
      say,
      hideToast,
      setGhostFlag,
      updateHud,
      syncState,
      syncMenu,
      syncChips,
      syncThemeChips,
      syncSound,
      syncRenderer,
      showGameOver,
      showScreen,
      focusButton,
      getScreen: () => screen,
      boardSize() {
        const rect = el.boardWrap.getBoundingClientRect();
        return Math.max(1, Math.round(rect.width));
      },
    };
  };
}(window.HungryNoodle));
