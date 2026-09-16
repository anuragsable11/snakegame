/**
 * HUNGRY NOODLE — all the cartoon artwork, drawn with plain Canvas paths.
 *
 * House rules for every routine in here:
 *   - the caller has already translated to the item's centre; draw around 0,0
 *   - fit inside a box of s x s
 *   - balance every save() with a restore(), and leave globalAlpha at 1
 *   - no shadowBlur (too slow at 60fps) — fake shadows with offset shapes
 *   - no Math.random() while drawing, or the art would flicker every frame
 *   - outline everything: thick dark lines are what make it read as a cartoon
 */
(function (NS) {
  'use strict';

  const TAU = Math.PI * 2;

  /* ====================================================================== *
   * Tiny shared helpers
   * ====================================================================== */

  function outline(ctx, s, p, scale) {
    ctx.lineWidth = s * 0.075 * (scale || 1);
    ctx.strokeStyle = p.ink;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function blob(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, TAU);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /** A cheap fake drop-shadow: the same shape, offset, dark and translucent. */
  function softShadow(ctx, s, drawShape) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    ctx.translate(0, s * 0.06);
    drawShape();
    ctx.fill();
    ctx.restore();
  }

  /* ====================================================================== *
   * PREY — eight creatures, each readable at 34px
   *
   * Silhouette does all the work at this size, so every creature leans on one
   * unmistakable cue: the beetle's split shell, the cricket's hind leg, the
   * spider's leg spread, the frog's eyes-on-top, the mouse's ears, the
   * lizard's tail. Natural colours, but the dark outline stays — it is what
   * keeps a small shape legible against a busy forest floor.
   * ====================================================================== */

  function drawBeetle(ctx, s, t, p) {
    const k = s * 0.5;
    const twitch = Math.sin(t / 240) * 0.18;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.1, k * 0.52, k * 0.66));

    // Legs first, so the shell sits over them
    ctx.strokeStyle = '#1b2612';
    ctx.lineWidth = s * 0.05;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const y = -k * 0.3 + i * k * 0.34;
        ctx.beginPath();
        ctx.moveTo(side * k * 0.34, y);
        ctx.lineTo(side * k * 0.72, y + (i - 1) * k * 0.16);
        ctx.stroke();
      }
    }

    // Head and thorax
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.66, k * 0.2, k * 0.16, 0, 0, TAU);
    ctx.fillStyle = '#1d2d19';
    ctx.fill();
    outline(ctx, s, p, 0.6);
    ctx.stroke();

    // Antennae
    ctx.strokeStyle = '#1b2612';
    ctx.lineWidth = s * 0.04;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * k * 0.1, -k * 0.74);
      ctx.quadraticCurveTo(side * k * 0.3, -k * 0.98,
        side * (k * 0.42 + twitch * k), -k * 1.02);
      ctx.stroke();
    }

    // Domed shell
    ctx.beginPath();
    ctx.ellipse(0, k * 0.06, k * 0.54, k * 0.7, 0, 0, TAU);
    ctx.fillStyle = '#33502c';
    ctx.fill();

    // A sheen down one side, so it reads as domed rather than flat
    ctx.beginPath();
    ctx.ellipse(-k * 0.22, -k * 0.06, k * 0.16, k * 0.4, -0.2, 0, TAU);
    ctx.fillStyle = 'rgba(180, 220, 150, 0.22)';
    ctx.fill();

    // The seam — the silhouette cue
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.56);
    ctx.lineTo(0, k * 0.72);
    ctx.strokeStyle = '#16210f';
    ctx.lineWidth = s * 0.055;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, k * 0.06, k * 0.54, k * 0.7, 0, 0, TAU);
    outline(ctx, s, p);
    ctx.stroke();
  }

  function drawCricket(ctx, s, t, p) {
    const k = s * 0.5;
    const flex = Math.sin(t / 200) * 0.14;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.4, k * 0.5, k * 0.2));

    // Antennae, swept back
    ctx.strokeStyle = '#3f5419';
    ctx.lineWidth = s * 0.04;
    ctx.lineCap = 'round';
    for (const offset of [-0.08, 0.02]) {
      ctx.beginPath();
      ctx.moveTo(k * 0.44, -k * 0.2 + offset * k);
      ctx.quadraticCurveTo(k * 0.9, -k * 0.5, k * 1.0, -k * 0.06);
      ctx.stroke();
    }

    /*
     * The oversized hind leg is the whole silhouette: a thick thigh angled up
     * and back, with a thin shin dropping from it.
     */
    ctx.beginPath();
    ctx.moveTo(-k * 0.1, k * 0.04);
    ctx.quadraticCurveTo(-k * 0.62, -k * 0.5 - flex * k, -k * 0.5, k * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#6d8c32';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-k * 0.5, k * 0.08);
    ctx.lineTo(-k * 0.76, k * 0.66 + flex * k * 0.4);
    ctx.strokeStyle = '#4d6621';
    ctx.lineWidth = s * 0.05;
    ctx.stroke();

    // Front legs
    for (const x of [k * 0.1, k * 0.32]) {
      ctx.beginPath();
      ctx.moveTo(x, k * 0.12);
      ctx.lineTo(x + k * 0.16, k * 0.6);
      ctx.stroke();
    }

    // Body, head end to the right
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.04, k * 0.54, k * 0.24, -0.1, 0, TAU);
    ctx.fillStyle = '#7a9c38';
    ctx.fill();
    outline(ctx, s, p, 0.85);
    ctx.stroke();

    // Folded wing along the back
    ctx.beginPath();
    ctx.ellipse(-k * 0.06, -k * 0.16, k * 0.44, k * 0.12, -0.12, 0, TAU);
    ctx.fillStyle = '#8fae46';
    ctx.fill();
    outline(ctx, s, p, 0.5);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.ellipse(k * 0.48, -k * 0.1, k * 0.2, k * 0.2, 0, 0, TAU);
    ctx.fillStyle = '#5f7c2a';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(k * 0.56, -k * 0.16, k * 0.06, 0, TAU);
    ctx.fillStyle = '#15150f';
    ctx.fill();
  }

  function drawSpider(ctx, s, t, p) {
    const k = s * 0.5;
    const creep = Math.sin(t / 260) * 0.08;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.12, k * 0.44, k * 0.4));

    /*
     * Eight legs, four a side, each bent at a knee. The spread IS the
     * silhouette, so they are drawn bold and wide.
     */
    ctx.strokeStyle = '#1a151d';
    ctx.lineWidth = s * 0.055;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        const spread = 0.62 - i * 0.3;
        const lean = (i % 2 === 0 ? creep : -creep);
        ctx.beginPath();
        ctx.moveTo(side * k * 0.16, spread * k * 0.34);
        ctx.lineTo(side * k * 0.66, spread * k * 0.6 - k * 0.22 + lean * k);
        ctx.lineTo(side * k * 0.88, spread * k * 0.5 + k * 0.32 + lean * k);
        ctx.stroke();
      }
    }

    // Abdomen and front body
    ctx.beginPath();
    ctx.ellipse(0, k * 0.2, k * 0.4, k * 0.44, 0, 0, TAU);
    ctx.fillStyle = '#2f2833';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // A pale marking, so it is not a black blob
    ctx.beginPath();
    ctx.ellipse(0, k * 0.16, k * 0.12, k * 0.22, 0, 0, TAU);
    ctx.fillStyle = '#b9a88f';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -k * 0.32, k * 0.24, k * 0.22, 0, 0, TAU);
    ctx.fillStyle = '#241e28';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    // Two tiny eye clusters
    ctx.fillStyle = '#d8d0c0';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * k * 0.09, -k * 0.42, k * 0.05, 0, TAU);
      ctx.fill();
    }
  }

  function drawGrub(ctx, s, t, p) {
    const k = s * 0.5;
    const curl = Math.sin(t / 300) * 0.1;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.16, k * 0.5, k * 0.44));

    /*
     * A fat pale larva curled into a C: seven shrinking discs along an arc,
     * with creases between them.
     */
    const segments = 7;
    for (let i = 0; i < segments; i += 1) {
      const u = i / (segments - 1);
      const angle = Math.PI * (0.25 + u * (0.85 + curl));
      const radius = k * 0.46;
      const width = k * (0.3 - u * 0.11);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius - k * 0.05;

      ctx.beginPath();
      ctx.arc(x, y, width, 0, TAU);
      ctx.fillStyle = i === 0 ? '#c9a07a' : '#e8dcae';
      ctx.fill();
      outline(ctx, s, p, 0.55);
      ctx.stroke();

      // A faint crease, so the segments read as segments
      if (i > 0) {
        ctx.beginPath();
        ctx.arc(x, y, width * 0.82, angle - 1.9, angle - 0.6);
        ctx.strokeStyle = 'rgba(160, 130, 90, 0.5)';
        ctx.lineWidth = s * 0.025;
        ctx.stroke();
      }
    }

    // Head detail at the thick end
    const headAngle = Math.PI * 0.25;
    const hx = Math.cos(headAngle) * k * 0.46;
    const hy = Math.sin(headAngle) * k * 0.46 - k * 0.05;
    ctx.beginPath();
    ctx.arc(hx, hy, k * 0.07, 0, TAU);
    ctx.fillStyle = '#6b4a2a';
    ctx.fill();
  }

  function drawFrog(ctx, s, t, p) {
    const k = s * 0.5;
    const throat = (Math.sin(t / 260) * 0.5 + 0.5) * 0.12;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.2, k * 0.6, k * 0.44));

    // Folded back legs, either side
    ctx.fillStyle = '#437a34';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * k * 0.6, k * 0.18, k * 0.2, k * 0.34, side * 0.4, 0, TAU);
      ctx.fill();
      outline(ctx, s, p, 0.6);
      ctx.stroke();
    }

    // Front feet
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * k * 0.34, k * 0.6, k * 0.14, k * 0.09, side * 0.3, 0, TAU);
      ctx.fillStyle = '#4d8a3c';
      ctx.fill();
      outline(ctx, s, p, 0.5);
      ctx.stroke();
    }

    // Wide squat body
    ctx.beginPath();
    ctx.ellipse(0, k * 0.1, k * 0.56, k * 0.5, 0, 0, TAU);
    ctx.fillStyle = '#4d8a3c';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Darker mottling
    ctx.fillStyle = '#315a26';
    ctx.beginPath();
    ctx.ellipse(k * 0.2, 0, k * 0.16, k * 0.11, 0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-k * 0.24, k * 0.2, k * 0.13, k * 0.1, -0.3, 0, TAU);
    ctx.fill();

    // Pulsing throat — the one piece of life
    ctx.beginPath();
    ctx.ellipse(0, k * 0.42, k * 0.26, k * (0.12 + throat), 0, 0, TAU);
    ctx.fillStyle = '#c2cf8a';
    ctx.fill();

    /*
     * The eyes sit ON TOP of the head, not on the front. That is what makes a
     * green blob read as a frog when seen from above.
     */
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * k * 0.28, -k * 0.38, k * 0.19, 0, TAU);
      ctx.fillStyle = '#d8c96a';
      ctx.fill();
      outline(ctx, s, p, 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(side * k * 0.3, -k * 0.38, k * 0.08, k * 0.11, 0, 0, TAU);
      ctx.fillStyle = '#15150f';
      ctx.fill();
    }
  }

  function drawMouse(ctx, s, t, p) {
    const k = s * 0.5;
    const flick = Math.sin(t / 280) * 0.16;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.34, k * 0.5, k * 0.24));

    // Tail, curling away behind
    ctx.beginPath();
    ctx.moveTo(-k * 0.42, k * 0.16);
    ctx.quadraticCurveTo(-k * 0.92, k * 0.3 + flick * k, -k * 0.74, -k * 0.34 + flick * k);
    ctx.strokeStyle = '#9c8c7c';
    ctx.lineWidth = s * 0.05;
    ctx.lineCap = 'round';
    ctx.stroke();

    // The ears are the silhouette cue — big and round
    for (const [ex, ey, er] of [[-k * 0.04, -k * 0.42, k * 0.22], [k * 0.3, -k * 0.34, k * 0.19]]) {
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fillStyle = '#b09a94';
      ctx.fill();
      outline(ctx, s, p, 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, er * 0.5, 0, TAU);
      ctx.fillStyle = '#d8a6a6';
      ctx.fill();
    }

    // Body tapering into a snout
    ctx.beginPath();
    ctx.moveTo(-k * 0.44, k * 0.1);
    ctx.quadraticCurveTo(-k * 0.3, -k * 0.34, k * 0.16, -k * 0.24);
    ctx.quadraticCurveTo(k * 0.72, -k * 0.16, k * 0.78, k * 0.16);
    ctx.quadraticCurveTo(k * 0.4, k * 0.5, -k * 0.16, k * 0.44);
    ctx.closePath();
    ctx.fillStyle = '#8a7a6a';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Paler belly
    ctx.beginPath();
    ctx.ellipse(k * 0.06, k * 0.3, k * 0.36, k * 0.13, -0.06, 0, TAU);
    ctx.fillStyle = '#c6bbae';
    ctx.fill();

    // Eye, nose, whiskers
    ctx.beginPath();
    ctx.arc(k * 0.44, -k * 0.06, k * 0.07, 0, TAU);
    ctx.fillStyle = '#15120f';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(k * 0.78, k * 0.12, k * 0.06, 0, TAU);
    ctx.fillStyle = '#d8a6a6';
    ctx.fill();

    ctx.strokeStyle = 'rgba(30, 24, 18, 0.55)';
    ctx.lineWidth = s * 0.022;
    for (const angle of [-0.3, 0, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(k * 0.74, k * 0.14);
      ctx.lineTo(k * 0.74 + Math.cos(angle) * k * 0.34, k * 0.14 + Math.sin(angle) * k * 0.34);
      ctx.stroke();
    }
  }

  function drawLizard(ctx, s, t, p) {
    const k = s * 0.5;
    const flick = Math.sin(t / 220) * 0.22;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.1, k * 0.32, k * 0.5));

    /*
     * The tail is the silhouette cue, so it gets real length — it sweeps down
     * and curls back on itself.
     */
    ctx.beginPath();
    ctx.moveTo(0, k * 0.2);
    ctx.quadraticCurveTo(k * 0.2, k * 0.74, -k * 0.24 + flick * k * 0.4, k * 0.92);
    ctx.strokeStyle = '#6e8a3f';
    ctx.lineWidth = s * 0.11;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(-k * 0.1, k * 0.74);
    ctx.quadraticCurveTo(-k * 0.3, k * 0.92, -k * 0.36 + flick * k * 0.5, k * 0.7);
    ctx.stroke();

    // Four splayed legs with toes
    ctx.strokeStyle = '#5d7633';
    ctx.lineWidth = s * 0.05;
    for (const side of [-1, 1]) {
      for (const y of [-k * 0.2, k * 0.24]) {
        ctx.beginPath();
        ctx.moveTo(side * k * 0.14, y);
        ctx.lineTo(side * k * 0.46, y + (y < 0 ? -k * 0.18 : k * 0.2));
        ctx.stroke();
        for (const spread of [-0.3, 0, 0.3]) {
          ctx.beginPath();
          ctx.moveTo(side * k * 0.46, y + (y < 0 ? -k * 0.18 : k * 0.2));
          ctx.lineTo(side * k * 0.6, y + (y < 0 ? -k * 0.3 : k * 0.34) + spread * k * 0.16);
          ctx.lineWidth = s * 0.025;
          ctx.stroke();
        }
        ctx.lineWidth = s * 0.05;
      }
    }

    // Body
    ctx.beginPath();
    ctx.ellipse(0, k * 0.02, k * 0.22, k * 0.44, 0, 0, TAU);
    ctx.fillStyle = '#6e8a3f';
    ctx.fill();
    outline(ctx, s, p, 0.85);
    ctx.stroke();

    // Darker banding across the back
    ctx.strokeStyle = '#4a5f26';
    ctx.lineWidth = s * 0.05;
    for (const y of [-k * 0.18, k * 0.04, k * 0.26]) {
      ctx.beginPath();
      ctx.moveTo(-k * 0.18, y);
      ctx.lineTo(k * 0.18, y);
      ctx.stroke();
    }

    // A distinctly wider head
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.5, k * 0.25, k * 0.2, 0, 0, TAU);
    ctx.fillStyle = '#7d9a49';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    ctx.fillStyle = '#161608';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * k * 0.14, -k * 0.54, k * 0.055, 0, TAU);
      ctx.fill();
    }
  }

  function drawEgg(ctx, s, t, p) {
    const k = s * 0.5;
    const shimmer = Math.sin(t / 400) * 0.03;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.5, k * 0.5, k * 0.16));

    // A few crossed twigs beneath — a suggestion of a nest, not a basket
    ctx.strokeStyle = '#6b5433';
    ctx.lineWidth = s * 0.055;
    ctx.lineCap = 'round';
    for (const angle of [-0.25, 0.1, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(-k * 0.78, k * 0.52 + angle * k * 0.24);
      ctx.lineTo(k * 0.78, k * 0.52 - angle * k * 0.24);
      ctx.stroke();
    }

    /*
     * The calmest item in the set, deliberately: when four other things on
     * screen have legs, one plain shape is a relief to read.
     */
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.02, k * 0.38, k * 0.5, 0.06, 0, TAU);
    ctx.fillStyle = '#e8e2cc';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Brown speckles
    ctx.fillStyle = '#9c7a4a';
    const speckles = [[-0.12, -0.24, 0.07], [0.14, -0.06, 0.06], [-0.05, 0.16, 0.05],
      [0.18, 0.26, 0.045], [-0.2, 0.04, 0.045], [0.02, -0.38, 0.04]];
    for (const [sx, sy, sr] of speckles) {
      ctx.beginPath();
      ctx.arc(sx * s, sy * s, sr * s, 0, TAU);
      ctx.fill();
    }

    // Soft highlight, so it reads as a rounded shell
    ctx.beginPath();
    ctx.ellipse(-k * 0.13, -k * 0.24, k * 0.11, k * (0.17 + shimmer), -0.4, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
  }

  /**
   * Canvas draw routines keyed by the shared catalogue id, then merged into
   * NS.FOODS in catalogue order so the engine's "food type 3" always means the
   * same creature in every renderer.
   */
  const DRAWERS = {
    beetle: drawBeetle,
    cricket: drawCricket,
    spider: drawSpider,
    grub: drawGrub,
    frog: drawFrog,
    mouse: drawMouse,
    lizard: drawLizard,
    egg: drawEgg,
  };

  NS.FOODS = NS.FOOD_CATALOGUE.map((item) => ({
    id: item.id,
    name: item.name,
    crumb: item.crumb,
    draw: DRAWERS[item.id],
  }));

  /* ====================================================================== *
   * THE NOODLE — body first, then the face
   * ====================================================================== */

  /**
   * Draw the whole noodle as one tapering, wobbling tube.
   *
   * Unlike the item art this one works in BOARD space: `pts` are already
   * interpolated pixel positions, head first.
   */
  NS.drawNoodleBody = function drawNoodleBody(ctx, pts, cell, t, p, o) {
    const options = o || {};
    const count = pts.length;
    const headWidth = cell * 0.82;
    const tailWidth = cell * 0.4;
    const ink = p.ink;
    const fill = options.dead ? p.bodyDark : p.body;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Wobble amplitude: a calm noodle barely moves, a fast one ripples
    const wobbleAmount = options.dead
      ? 0
      : cell * 0.075 * (0.4 + 0.6 * (options.speed || 0));

    // Precompute the wobbled centre line once, reused by every pass
    const path = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const point = pts[i];
      let nx = 0;
      let ny = 0;
      if (count > 1) {
        const other = pts[i === 0 ? 1 : i - 1];
        const dx = point.x - other.x;
        const dy = point.y - other.y;
        const length = Math.hypot(dx, dy) || 1;
        // perpendicular to the local direction
        nx = -dy / length;
        ny = dx / length;
      }
      const wave = wobbleAmount * Math.sin(t / 150 - i * 0.55);
      path[i] = { x: point.x + nx * wave, y: point.y + ny * wave };
    }

    // Radius per segment: taper, plus the swallow-bulge travelling down
    const radii = new Array(count);
    const bulgeAt = options.grow > 0 ? options.grow * (count + 2) : -10;
    for (let i = 0; i < count; i += 1) {
      const along = count === 1 ? 0 : i / (count - 1);
      let radius = (headWidth + (tailWidth - headWidth) * Math.pow(along, 0.75)) / 2;
      const distance = Math.abs(i - bulgeAt);
      if (distance < 2.2) {
        // A fat lump sliding along the body — the best gag in the game
        radius *= 1 + 0.5 * Math.cos((distance / 2.2) * (Math.PI / 2));
      }
      radii[i] = radius;
    }

    // 1. Ink outline: a fat stroke under everything
    strokeTube(ctx, path, radii, cell * 0.075 * 2, ink, true);
    // 2. Body fill
    strokeTube(ctx, path, radii, 0, fill, true);

    // 3. Belly highlight, offset down-right to fake a light from above
    ctx.save();
    ctx.globalAlpha = options.dead ? 0.25 : 0.55;
    ctx.translate(0, cell * 0.08);
    strokeTube(ctx, path, radii.map((r) => r * 0.42), 0, p.belly, false);
    ctx.restore();

    // 4. Dark underside
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(0, cell * 0.2);
    strokeTube(ctx, path, radii.map((r) => r * 0.3), 0, p.bodyDark, false);
    ctx.restore();

    // 5. Tail flick — a little upturned tip that sways
    if (count > 2) {
      const tip = path[count - 1];
      const before = path[count - 2];
      const dx = tip.x - before.x;
      const dy = tip.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const sway = options.dead ? 0.6 : Math.sin(t / 220) * 0.5;
      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(Math.atan2(dy, dx) + sway);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(cell * 0.3, -cell * 0.06, cell * 0.44, -cell * 0.24);
      ctx.lineWidth = tailWidth * 0.7;
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineWidth = tailWidth * 0.7 - cell * 0.1;
      ctx.strokeStyle = fill;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  };

  /**
   * Stroke a variable-width tube by walking the path with round segments.
   * Cheaper and far more controllable than trying to taper a single stroke.
   */
  function strokeTube(ctx, path, radii, padding, colour, capEnds) {
    const count = path.length;
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Joints: a circle at every vertex
    for (let i = 0; i < count; i += 1) {
      const r = radii[i] + padding / 2;
      if (r <= 0) continue;
      ctx.beginPath();
      ctx.arc(path[i].x, path[i].y, r, 0, TAU);
      ctx.fill();
    }

    // Links: a stroke between neighbours, width averaged across the pair
    for (let i = 0; i < count - 1; i += 1) {
      const width = (radii[i] + radii[i + 1]) + padding;
      if (width <= 0) continue;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(path[i].x, path[i].y);
      ctx.lineTo(path[i + 1].x, path[i + 1].y);
      ctx.stroke();
    }

    if (capEnds && count === 1) {
      ctx.beginPath();
      ctx.arc(path[0].x, path[0].y, radii[0] + padding / 2, 0, TAU);
      ctx.fill();
    }
  }

  /**
   * The face. Always drawn upright — direction is expressed by the eyes, a
   * lean, and a slight tilt, never by rotating the artwork.
   */
  NS.drawNoodleHead = function drawNoodleHead(ctx, s, t, p, o) {
    const options = o || {};
    const dir = options.dir || { x: 1, y: 0 };
    const expression = options.expression || 'idle';
    const chew = options.chew || 0;
    const blink = options.blink || 0;
    const tongue = options.tongue || 0;
    const look = options.look || { x: 0, y: 0 };

    const dead = expression === 'dead';
    const hurt = expression === 'hurt';
    const eating = expression === 'eating';
    const hungry = expression === 'hungry';
    const fast = expression === 'fast';

    const r = s * 0.56;                       // the head is bigger than a segment
    const lean = s * 0.09;                    // how far the face leans into travel
    const squash = 1 + chew * 0.12 + (dead ? 0.1 : 0);

    ctx.save();

    // Speed lines trailing behind a panicking noodle
    if (fast) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.bodyLight;
      ctx.lineWidth = s * 0.06;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i += 1) {
        const offset = i * s * 0.22;
        ctx.beginPath();
        ctx.moveTo(-dir.x * s * 0.6 - dir.y * offset, -dir.y * s * 0.6 - dir.x * offset);
        ctx.lineTo(-dir.x * s * 1.05 - dir.y * offset, -dir.y * s * 1.05 - dir.x * offset);
        ctx.stroke();
      }
      ctx.restore();
    }

    // A small tilt into the turn, and a sag when dead
    ctx.rotate(dead ? 0.24 : (dir.x * 0.06 + dir.y * 0.04));
    ctx.scale(squash, 1 / squash);

    // Head blob, a touch wider than tall
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.06, r * 0.98, 0, 0, TAU);
    ctx.fillStyle = dead ? p.bodyDark : p.body;
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Two noodle wisps on top, swaying
    ctx.save();
    ctx.lineWidth = s * 0.075;
    ctx.strokeStyle = p.ink;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const sway = Math.sin(t / 260 + side) * 0.3 + (dead ? side * 0.5 : 0);
      ctx.beginPath();
      ctx.moveTo(side * r * 0.34, -r * 0.82);
      ctx.quadraticCurveTo(
        side * r * (0.5 + sway * 0.3), -r * 1.24,
        side * r * (0.3 + sway * 0.6), -r * 1.5
      );
      ctx.stroke();
    }
    ctx.restore();

    // Everything below leans toward where we are going
    ctx.save();
    ctx.translate(dir.x * lean, dir.y * lean);

    // Blush
    if (!dead) {
      ctx.save();
      ctx.globalAlpha = eating ? 0.75 : 0.42;
      ctx.fillStyle = p.cheek;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.66, r * 0.26, r * 0.22, r * 0.15, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ----------------------------- eyes ----------------------------- */

    const eyeY = -r * 0.16;
    const eyeSpread = r * 0.38;
    const eyeR = fast ? r * 0.34 : (hungry ? r * 0.33 : r * 0.28);
    const pupilR = fast ? r * 0.08 : (hungry ? r * 0.09 : r * 0.13);

    for (let i = 0; i < 2; i += 1) {
      const side = i === 0 ? -1 : 1;
      const ex = side * eyeSpread;

      if (dead) {
        // X eyes
        ctx.save();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = s * 0.08;
        ctx.lineCap = 'round';
        const d = r * 0.2;
        ctx.beginPath();
        ctx.moveTo(ex - d, eyeY - d);
        ctx.lineTo(ex + d, eyeY + d);
        ctx.moveTo(ex + d, eyeY - d);
        ctx.lineTo(ex - d, eyeY + d);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (eating || (hurt && side < 0)) {
        // Happy (or squinting) arc instead of an open eye
        ctx.save();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = s * 0.075;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, eyeY + r * 0.06, eyeR * 0.8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      // Sclera
      const lidClose = blink;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, eyeR * (1 - lidClose * 0.92), 0, 0, TAU);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      outline(ctx, s, p, 0.75);
      ctx.stroke();

      if (lidClose > 0.75) continue;

      // Pupil — slides toward the heading, nudged further by `look`
      const px = ex + (dir.x * 0.5 + look.x * 0.45) * (eyeR - pupilR) * 1.25;
      const py = eyeY + (dir.y * 0.5 + look.y * 0.45) * (eyeR - pupilR) * 1.25;
      // Never let it escape the sclera
      const dx = px - ex;
      const dy = py - eyeY;
      const limit = eyeR - pupilR - s * 0.01;
      const dist = Math.hypot(dx, dy);
      const clamped = dist > limit ? limit / dist : 1;

      ctx.beginPath();
      ctx.arc(ex + dx * clamped, eyeY + dy * clamped, pupilR, 0, TAU);
      ctx.fillStyle = p.ink;
      ctx.fill();

      // Specular dot
      ctx.beginPath();
      ctx.arc(
        ex + dx * clamped - pupilR * 0.4,
        eyeY + dy * clamped - pupilR * 0.45,
        pupilR * 0.38, 0, TAU
      );
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    /* ----------------------------- mouth ---------------------------- */

    const mouthY = r * 0.42;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = s * 0.075;

    if (dead) {
      // Slack open mouth with a lolling tongue
      ctx.beginPath();
      ctx.ellipse(0, mouthY, r * 0.3, r * 0.26, 0, 0, TAU);
      ctx.fillStyle = p.tongue;
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(r * 0.24, mouthY + r * 0.2);
      ctx.rotate(0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.16, r * 0.3, 0, 0, TAU);
      ctx.fillStyle = p.cheek;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (eating || chew > 0.05) {
      // Mid-chomp: an open oval that squashes with the chew
      const open = 0.18 + chew * 0.42;
      ctx.beginPath();
      ctx.ellipse(0, mouthY, r * 0.34, r * open, 0, 0, TAU);
      ctx.fillStyle = p.tongue;
      ctx.fill();
      ctx.stroke();
    } else if (fast) {
      // Terrified little O
      ctx.beginPath();
      ctx.ellipse(0, mouthY, r * 0.17, r * 0.22, 0, 0, TAU);
      ctx.fillStyle = p.tongue;
      ctx.fill();
      ctx.stroke();
    } else if (hurt) {
      // Wavy grimace
      ctx.beginPath();
      ctx.moveTo(-r * 0.36, mouthY);
      ctx.quadraticCurveTo(-r * 0.18, mouthY - r * 0.16, 0, mouthY);
      ctx.quadraticCurveTo(r * 0.18, mouthY + r * 0.16, r * 0.36, mouthY);
      ctx.stroke();
    } else if (hungry) {
      // Open grin with a licking tongue
      ctx.beginPath();
      ctx.arc(0, mouthY - r * 0.1, r * 0.34, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.fillStyle = p.tongue;
      ctx.fill();
      ctx.stroke();
      if (tongue > 0) {
        ctx.save();
        ctx.translate(r * 0.12, mouthY + r * 0.12);
        ctx.beginPath();
        ctx.ellipse(0, tongue * r * 0.16, r * 0.15, r * (0.12 + tongue * 0.16), -0.3, 0, TAU);
        ctx.fillStyle = p.cheek;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Content little smile
      ctx.beginPath();
      ctx.moveTo(-r * 0.26, mouthY - r * 0.04);
      ctx.quadraticCurveTo(0, mouthY + r * 0.2, r * 0.26, mouthY - r * 0.04);
      ctx.stroke();
    }
    ctx.restore();

    // A hungry noodle drools. Obviously.
    if (hungry) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#9FE8FF';
      const drip = (Math.sin(t / 420) + 1) * 0.5;
      ctx.beginPath();
      ctx.ellipse(r * 0.3, mouthY + r * (0.3 + drip * 0.3), r * 0.07, r * 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // lean
    ctx.restore(); // head
  };
}(window.HungryNoodle));
