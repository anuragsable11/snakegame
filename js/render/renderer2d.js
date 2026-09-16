/**
 * HUNGRY NOODLE — the 2D canvas renderer.
 *
 * One of two interchangeable renderers. It implements the renderer contract:
 *
 *   mount()             attach to the canvas
 *   resize()            match the backing store to the element
 *   setTheme(theme)     repaint for a new palette
 *   render(engine, now) draw one frame
 *   onEat / onDeath / onRecord / onReset   juice hooks fired by main.js
 *   dispose()           release everything
 *
 * It reads engine state and never writes to it.
 */
(function (NS) {
  'use strict';

  const clamp = NS.clamp;
  const easeOutCubic = NS.easeOutCubic;
  const easeOutBack = NS.easeOutBack;

  NS.createRenderer2D = function createRenderer2D(canvas, options) {
    const opts = options || {};
    const reduced = opts.reduced || false;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    const particles = NS.createParticles(reduced ? 40 : 170);

    let theme = NS.THEMES.noodle;
    let cssSize = 0;
    let cell = 0;
    let dpr = 1;
    let backdrop = null;

    // Presentation-only state — none of this belongs to the engine
    let eatFx = null;
    let foodKey = '';
    let foodShownAt = 0;
    let scorePops = [];
    let deathFlash = 0;
    let shake = 0;
    let ghost = null;

    /* ------------------------------------------------------------ helpers */

    function renderBackdrop() {
      if (!cssSize) return;
      const layer = backdrop || document.createElement('canvas');
      layer.width = Math.round(cssSize * dpr);
      layer.height = Math.round(cssSize * dpr);
      const layerCtx = layer.getContext('2d');
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      NS.drawBackdrop(layerCtx, cssSize, cell, theme);
      backdrop = layer;
    }

    /* ------------------------------------------------------------ drawing */

    function drawFood(state, now) {
      // The pop ghost of whatever was just eaten
      if (eatFx) {
        const age = (now - eatFx.at) / 320;
        const scale = 1 + easeOutCubic(age) * 0.9;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age);
        ctx.translate((eatFx.x + 0.5) * cell, (eatFx.y + 0.5) * cell);
        ctx.scale(scale, scale);
        NS.FOODS[eatFx.type].draw(ctx, cell * 0.92, now, theme);
        ctx.restore();
      }

      const food = state.food;
      const definition = NS.FOODS[food.type] || NS.FOODS[0];
      // Notice a new snack ourselves — the engine doesn't deal in wall time
      const key = `${food.x},${food.y},${food.type}`;
      if (key !== foodKey) {
        foodKey = key;
        foodShownAt = now;
      }
      const age = clamp((now - foodShownAt) / 280, 0, 1);
      const scale = reduced ? 1 : easeOutBack(age);
      const bob = reduced ? 0 : Math.sin(now / 420 + food.x * 1.7) * cell * 0.07;
      const tilt = reduced ? 0 : Math.sin(now / 760 + food.y * 1.3) * 0.13;

      ctx.save();
      ctx.translate((food.x + 0.5) * cell, (food.y + 0.5) * cell + bob);
      ctx.rotate(tilt);
      ctx.scale(scale, scale);
      definition.draw(ctx, cell * 0.92, now, theme);
      ctx.restore();
    }

    function drawObstacles(state) {
      if (state.obstacles.length === 0) return;
      ctx.save();
      for (const block of state.obstacles) {
        const x = block.x * cell;
        const y = block.y * cell;
        const inset = cell * 0.1;
        ctx.fillStyle = theme.bodyDark;
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = cell * 0.09;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.rect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
        ctx.fill();
        ctx.stroke();
        // A lid line, so it reads as a bin rather than a block
        ctx.beginPath();
        ctx.moveTo(x + inset * 1.6, y + cell * 0.36);
        ctx.lineTo(x + cell - inset * 1.6, y + cell * 0.36);
        ctx.lineWidth = cell * 0.06;
        ctx.strokeStyle = theme.ink;
        ctx.stroke();
      }
      ctx.restore();
    }

    /**
     * The best-run ghost: the same body shape, drawn faint and flat.
     * Purely a visual overlay — it is positions only, handed in by main.js.
     */
    function drawGhost(now) {
      if (!ghost || !ghost.snake || ghost.snake.length === 0) return;

      const points = ghost.snake.map((segment, index) => {
        const previous = ghost.previousSnake[index] || segment;
        let px = previous.x;
        let py = previous.y;
        if (Math.abs(segment.x - px) > 1) px = segment.x;
        if (Math.abs(segment.y - py) > 1) py = segment.y;
        return {
          x: (px + (segment.x - px) * ghost.alpha + 0.5) * cell,
          y: (py + (segment.y - py) * ghost.alpha + 0.5) * cell,
        };
      });

      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = theme.bodyLight;
      ctx.lineWidth = cell * 0.62;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y);
      ctx.stroke();

      // A brighter head so you can tell which way the ghost is going
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = theme.bodyLight;
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, cell * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawNoodle(state, alpha, now) {
      const face = NS.noodleFace(state, now, reduced);

      // Interpolate each segment from where it was to where it is. When the
      // noodle grew this step the new tail has no previous position, so it
      // simply stays put.
      const points = state.snake.map((segment, index) => {
        const previous = state.previousSnake[index] || segment;
        let px = previous.x;
        let py = previous.y;
        // A wrap teleports the segment; don't smear it across the board
        if (Math.abs(segment.x - px) > 1) px = segment.x;
        if (Math.abs(segment.y - py) > 1) py = segment.y;
        return {
          x: (px + (segment.x - px) * alpha + 0.5) * cell,
          y: (py + (segment.y - py) * alpha + 0.5) * cell,
        };
      });

      NS.drawNoodleBody(ctx, points, cell, now, theme, {
        dead: face.dead,
        grow: face.grow,
        speed: face.speed,
      });

      const head = points[0];
      ctx.save();
      ctx.translate(head.x, head.y);
      NS.drawNoodleHead(ctx, cell, now, theme, face);
      ctx.restore();
    }

    function drawScorePops(now) {
      if (scorePops.length === 0) return;
      const size = Math.max(12, cell * 0.62);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.28;

      for (const pop of scorePops) {
        const age = (now - pop.at) / 900;
        ctx.globalAlpha = clamp(1 - age * age, 0, 1);
        const y = pop.y - easeOutCubic(age) * cell * 1.6;
        ctx.strokeStyle = theme.ink;
        ctx.strokeText(pop.text, pop.x, y);
        ctx.fillStyle = theme.accent;
        ctx.fillText(pop.text, pop.x, y);
      }
      ctx.restore();
    }

    /* ------------------------------------------------------------- public */

    return {
      id: '2d',
      label: '2D',

      mount() { /* the canvas is already in the DOM */ },

      setTheme(next) {
        theme = next;
        renderBackdrop();
      },

      resize(size, ratio) {
        const nextSize = Math.max(1, Math.round(size));
        const nextDpr = clamp(ratio || 1, 1, 3);
        if (nextSize === cssSize && nextDpr === dpr) return;
        cssSize = nextSize;
        dpr = nextDpr;
        cell = cssSize / NS.CONFIG.GRID_SIZE;
        canvas.width = Math.round(cssSize * dpr);
        canvas.height = Math.round(cssSize * dpr);
        renderBackdrop();
      },

      update(deltaMs, now) {
        particles.update(deltaMs);
        if (deathFlash > 0) deathFlash = Math.max(0, deathFlash - deltaMs / 420);
        if (shake > 0) shake = Math.max(0, shake - deltaMs / 300);
        for (let i = scorePops.length - 1; i >= 0; i -= 1) {
          if (now - scorePops[i].at > 900) scorePops.splice(i, 1);
        }
        if (eatFx && now - eatFx.at > 320) eatFx = null;
      },

      render(engine, now) {
        const state = engine.state;
        if (!cssSize) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssSize, cssSize);

        ctx.save();
        if (shake > 0) {
          const amount = shake * cell;
          ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
        }

        if (backdrop) ctx.drawImage(backdrop, 0, 0, cssSize, cssSize);
        if (!reduced) NS.drawBackdropMotion(ctx, cssSize, now, theme);

        drawObstacles(state);
        drawGhost(now);
        drawFood(state, now);
        drawNoodle(state, engine.alpha(), now);
        particles.draw(ctx, theme, now);
        drawScorePops(now);

        ctx.restore();

        if (deathFlash > 0) {
          ctx.fillStyle = `rgba(255, 90, 110, ${deathFlash * 0.26})`;
          ctx.fillRect(0, 0, cssSize, cssSize);
        }
      },

      /* ------------------------------------------------------------ juice */

      /** @param {object|null} view positions only; never an engine */
      setGhost(view) {
        ghost = view;
      },

      onEat(payload) {
        const catalogue = NS.FOOD_CATALOGUE[payload.type] || NS.FOOD_CATALOGUE[0];
        eatFx = { x: payload.at.x, y: payload.at.y, type: payload.type, at: payload.now };
        particles.emit('crumb', (payload.at.x + 0.5) * cell, (payload.at.y + 0.5) * cell, {
          color: catalogue.crumb,
          count: 12,
          scale: reduced ? 0 : 1,
        });
        scorePops.push({
          x: (payload.at.x + 0.5) * cell,
          y: (payload.at.y + 0.5) * cell,
          text: `+${payload.points}`,
          at: payload.now,
        });
      },

      onLevel(payload) {
        const head = payload.head;
        particles.emit('star', (head.x + 0.5) * cell, (head.y + 0.5) * cell, {
          count: 10,
          scale: reduced ? 0 : 1,
        });
      },

      onDeath(payload) {
        deathFlash = 1;
        shake = reduced ? 0 : 0.42;
        if (payload.cause === 'win') return;
        const head = payload.head;
        particles.emit('splat', (head.x + 0.5) * cell, (head.y + 0.5) * cell, {
          color: theme.body,
          count: 18,
          scale: reduced ? 0 : 1,
        });
      },

      onRecord() {
        particles.emit('confetti', cssSize / 2, cssSize * 0.3, {
          count: 30,
          scale: reduced ? 0 : 1,
        });
      },

      onReset() {
        ghost = null;
        particles.clear();
        scorePops.length = 0;
        eatFx = null;
        deathFlash = 0;
        shake = 0;
      },

      dispose() {
        particles.clear();
        backdrop = null;
      },
    };
  };
}(window.HungryNoodle));
