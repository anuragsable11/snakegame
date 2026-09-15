/**
 * HUNGRY NOODLE — a small pooled particle system.
 *
 * The pool is allocated once and reused forever: no allocation per frame, no
 * array churn, and a hard cap so a long run can never drown the renderer.
 */
(function (NS) {
  'use strict';

  const TAU = Math.PI * 2;

  NS.createParticles = function createParticles(maxCount) {
    const capacity = Math.max(8, maxCount || 160);
    const pool = new Array(capacity);
    for (let i = 0; i < capacity; i += 1) {
      pool[i] = {
        type: 'crumb', x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 1,
        size: 1, spin: 0, spinRate: 0, color: '#fff', gravity: 0,
      };
    }
    let live = 0;

    /** Grab the next free slot, or null when the pool is full. */
    function take() {
      if (live >= capacity) return null;
      const particle = pool[live];
      live += 1;
      return particle;
    }

    /** Swap-remove: O(1), and never reorders the live prefix meaningfully. */
    function release(index) {
      live -= 1;
      const temp = pool[index];
      pool[index] = pool[live];
      pool[live] = temp;
    }

    const api = {
      /**
       * @param {string} type  crumb | star | puff | confetti | splat
       * @param {number} x     board pixels
       * @param {number} y     board pixels
       * @param {object} opts  {count, color, scale}
       */
      emit(type, x, y, opts) {
        const options = opts || {};
        const scale = options.scale === undefined ? 1 : options.scale;
        if (scale <= 0) return;             // reduced motion switches this off

        const count = Math.round((options.count || 10) * Math.min(scale, 1));
        for (let i = 0; i < count; i += 1) {
          const particle = take();
          if (!particle) return;            // pool full — drop the rest silently

          const angle = Math.random() * TAU;
          particle.type = type;
          particle.x = x;
          particle.y = y;
          particle.spin = Math.random() * TAU;
          particle.color = options.color || '#FFD23F';
          particle.life = 1;

          switch (type) {
            case 'star': {
              const speed = 18 + Math.random() * 46;
              particle.vx = Math.cos(angle) * speed;
              particle.vy = Math.sin(angle) * speed;
              particle.gravity = 0;
              particle.decay = 1.1 + Math.random() * 0.6;
              particle.size = 4 + Math.random() * 4;
              particle.spinRate = (Math.random() - 0.5) * 6;
              break;
            }
            case 'puff': {
              const speed = 10 + Math.random() * 26;
              particle.vx = Math.cos(angle) * speed;
              particle.vy = Math.sin(angle) * speed - 14;
              particle.gravity = -18;
              particle.decay = 1.5 + Math.random() * 0.7;
              particle.size = 5 + Math.random() * 7;
              particle.spinRate = 0;
              break;
            }
            case 'confetti': {
              particle.vx = (Math.random() - 0.5) * 220;
              particle.vy = -120 - Math.random() * 180;
              particle.gravity = 420;
              particle.decay = 0.45 + Math.random() * 0.3;
              particle.size = 4 + Math.random() * 4;
              particle.spinRate = (Math.random() - 0.5) * 14;
              particle.color = CONFETTI[i % CONFETTI.length];
              break;
            }
            case 'splat': {
              const speed = 40 + Math.random() * 170;
              particle.vx = Math.cos(angle) * speed;
              particle.vy = Math.sin(angle) * speed;
              particle.gravity = 260;
              particle.decay = 0.9 + Math.random() * 0.6;
              particle.size = 3 + Math.random() * 5;
              particle.spinRate = 0;
              break;
            }
            default: {              // crumb
              const speed = 50 + Math.random() * 150;
              particle.vx = Math.cos(angle) * speed;
              particle.vy = Math.sin(angle) * speed - 40;
              particle.gravity = 520;
              particle.decay = 1.0 + Math.random() * 0.7;
              particle.size = 3 + Math.random() * 4;
              particle.spinRate = (Math.random() - 0.5) * 12;
              break;
            }
          }
        }
      },

      /** Delta-time based, so 30fps and 144fps look the same. */
      update(deltaMs) {
        const seconds = Math.min(deltaMs, 64) / 1000;
        for (let i = live - 1; i >= 0; i -= 1) {
          const particle = pool[i];
          particle.vy += particle.gravity * seconds;
          particle.vx *= 0.99;
          particle.x += particle.vx * seconds;
          particle.y += particle.vy * seconds;
          particle.spin += particle.spinRate * seconds;
          particle.life -= particle.decay * seconds;
          if (particle.life <= 0) release(i);
        }
      },

      draw(ctx, palette, t) {
        if (live === 0) return;
        ctx.save();
        for (let i = 0; i < live; i += 1) {
          const particle = pool[i];
          const life = particle.life < 0 ? 0 : particle.life;
          ctx.globalAlpha = life > 1 ? 1 : life;

          switch (particle.type) {
            case 'star':
              drawStar(ctx, particle, palette);
              break;
            case 'puff':
              ctx.globalAlpha = (life > 1 ? 1 : life) * 0.4;
              ctx.fillStyle = palette.bodyLight;
              ctx.beginPath();
              ctx.arc(particle.x, particle.y, particle.size * (2 - life), 0, TAU);
              ctx.fill();
              break;
            case 'confetti':
              ctx.save();
              ctx.translate(particle.x, particle.y);
              ctx.rotate(particle.spin);
              ctx.fillStyle = particle.color;
              ctx.fillRect(-particle.size * 0.5, -particle.size * 1.4,
                particle.size, particle.size * 2.8);
              ctx.restore();
              break;
            case 'splat':
              ctx.fillStyle = palette.ink;
              ctx.beginPath();
              ctx.arc(particle.x, particle.y, particle.size * life, 0, TAU);
              ctx.fill();
              break;
            default:        // crumb — a chunky tumbling shard
              ctx.save();
              ctx.translate(particle.x, particle.y);
              ctx.rotate(particle.spin);
              ctx.fillStyle = particle.color;
              ctx.fillRect(-particle.size * 0.5, -particle.size * 0.5,
                particle.size, particle.size);
              ctx.restore();
              break;
          }
        }
        ctx.restore();
      },

      clear() { live = 0; },

      get count() { return live; },
    };

    function drawStar(ctx, particle, palette) {
      const grow = 1 + (1 - particle.life) * 0.6;
      const r = particle.size * grow;
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.spin);
      ctx.fillStyle = palette.accent2;
      ctx.beginPath();
      // A four-point twinkle: two crossed tapered diamonds
      ctx.moveTo(0, -r * 2);
      ctx.quadraticCurveTo(0, 0, r * 2, 0);
      ctx.quadraticCurveTo(0, 0, 0, r * 2);
      ctx.quadraticCurveTo(0, 0, -r * 2, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const CONFETTI = ['#FFD23F', '#FF8A3D', '#5BD1C4', '#FF7DA0', '#B388FF', '#7CFF8E'];

    return api;
  };
}(window.HungryNoodle));
