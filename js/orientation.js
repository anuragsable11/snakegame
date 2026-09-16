/**
 * HUNGRY NOODLE 3D — the landscape nudge.
 *
 * Phones play better sideways: in landscape the board is sized by height and
 * sits beside the controls, instead of the two competing for vertical space.
 *
 * What is actually possible here is limited, and worth being honest about:
 *
 *   - A browser tab CANNOT force or lock orientation. `screen.orientation.lock`
 *     only works from fullscreen, and iOS Safari does not implement it at all.
 *   - So this asks, and offers one tap that enters fullscreen and *tries* the
 *     lock. Every step degrades quietly if the browser refuses.
 *   - Portrait always stays fully playable. The hint is dismissible, and the
 *     dismissal is remembered.
 *
 * None of this touches the engine or the renderers.
 */
(function (NS) {
  'use strict';

  const DISMISS_KEY = 'noodle.rotateHint.v1';

  const $ = (id) => document.getElementById(id);

  NS.createOrientationNudge = function createOrientationNudge() {
    const hint = $('rotate-hint');
    const goButton = $('btn-fullscreen');
    const closeButton = $('btn-rotate-dismiss');
    if (!hint) return { refresh() {} };

    let dismissed = NS.storage.read(DISMISS_KEY, 'false') === 'true';

    /** A phone-sized viewport, held upright, driven by touch. */
    function shouldPrompt() {
      if (dismissed) return false;
      if (!window.matchMedia) return false;
      return window.matchMedia(
        '(max-width: 900px) and (orientation: portrait) and (pointer: coarse)'
      ).matches;
    }

    function refresh() {
      hint.hidden = !shouldPrompt();
    }

    /**
     * Enter fullscreen, then try to lock to landscape.
     *
     * Both halves are best-effort: fullscreen can be refused, and the lock is
     * unsupported on iOS. A rejection here is normal, not an error — the hint
     * stays up and the player can simply turn the phone.
     */
    async function goLandscape() {
      const root = document.documentElement;
      const request = root.requestFullscreen ||
        root.webkitRequestFullscreen ||
        root.mozRequestFullScreen ||
        root.msRequestFullscreen;

      if (request) {
        try {
          await request.call(root);
        } catch (error) {
          // Refused (or already fullscreen) — carry on and still try the lock
        }
      }

      const orientation = window.screen && window.screen.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        try {
          await orientation.lock('landscape');
        } catch (error) {
          // Not supported (iOS) or not permitted. The hint stays up; turning
          // the phone by hand works regardless.
        }
      }

      refresh();
    }

    function dismiss() {
      dismissed = true;
      NS.storage.write(DISMISS_KEY, 'true');
      refresh();
    }

    if (goButton) {
      goButton.addEventListener('click', () => { goLandscape(); });
    }
    if (closeButton) {
      closeButton.addEventListener('click', dismiss);
    }

    // Re-evaluate whenever the viewport could have changed shape
    if (window.matchMedia) {
      const portrait = window.matchMedia('(orientation: portrait)');
      const listen = portrait.addEventListener
        ? portrait.addEventListener.bind(portrait, 'change')
        : portrait.addListener && portrait.addListener.bind(portrait);
      if (listen) listen(refresh);
    }
    window.addEventListener('resize', refresh);

    refresh();

    return { refresh, dismiss, goLandscape, shouldPrompt };
  };
}(window.HungryNoodle));
