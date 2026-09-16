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
   * FOOD — eight snacks, each readable at 34px
   * ====================================================================== */

  function drawPizza(ctx, s, t, p) {
    const k = s * 0.5;
    const wobble = Math.sin(t / 260) * s * 0.012;

    softShadow(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(0, -k * 0.86);
      ctx.lineTo(k * 0.76, k * 0.7);
      ctx.lineTo(-k * 0.76, k * 0.7);
      ctx.closePath();
    });

    // Slice body
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.86);
    ctx.lineTo(k * 0.76, k * 0.66);
    ctx.quadraticCurveTo(0, k * 0.88, -k * 0.76, k * 0.66);
    ctx.closePath();
    ctx.fillStyle = '#FFC55C';
    ctx.fill();

    // Crust along the wide end
    ctx.beginPath();
    ctx.moveTo(-k * 0.76, k * 0.66);
    ctx.quadraticCurveTo(0, k * 0.88, k * 0.76, k * 0.66);
    ctx.quadraticCurveTo(0, k * 1.14, -k * 0.76, k * 0.66);
    ctx.closePath();
    ctx.fillStyle = '#E0952F';
    ctx.fill();
    outline(ctx, s, p, 0.8);
    ctx.stroke();

    // Pepperoni
    ctx.fillStyle = '#E23B3B';
    const spots = [[-0.2, 0.1, 0.15], [0.22, 0.26, 0.13], [0.02, -0.28, 0.11]];
    for (const [px, py, pr] of spots) {
      ctx.beginPath();
      ctx.arc(px * s, py * s + wobble, pr * s, 0, TAU);
      ctx.fill();
    }

    // One heroic strand of cheese escaping the side
    ctx.beginPath();
    ctx.moveTo(k * 0.58, k * 0.34);
    ctx.quadraticCurveTo(k * 0.94, k * 0.5 + wobble * 3, k * 0.78, k * 0.92 + wobble * 4);
    ctx.strokeStyle = '#FFE08A';
    ctx.lineWidth = s * 0.09;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Outline last so it reads
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.86);
    ctx.lineTo(k * 0.76, k * 0.66);
    ctx.quadraticCurveTo(0, k * 0.88, -k * 0.76, k * 0.66);
    ctx.closePath();
    outline(ctx, s, p);
    ctx.stroke();
  }

  function drawBurger(ctx, s, t, p) {
    const k = s * 0.5;
    const bounce = Math.sin(t / 220) * s * 0.02;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.5, k * 0.8, k * 0.3));

    // Bottom bun
    ctx.beginPath();
    ctx.moveTo(-k * 0.78, k * 0.28);
    ctx.lineTo(k * 0.78, k * 0.28);
    ctx.quadraticCurveTo(k * 0.86, k * 0.72, 0, k * 0.72);
    ctx.quadraticCurveTo(-k * 0.86, k * 0.72, -k * 0.78, k * 0.28);
    ctx.closePath();
    ctx.fillStyle = '#E3A45C';
    ctx.fill();
    outline(ctx, s, p, 0.8);
    ctx.stroke();

    // Patty
    roundRect(ctx, -k * 0.82, k * 0.02, k * 1.64, k * 0.3, k * 0.14);
    ctx.fillStyle = '#7B4326';
    ctx.fill();
    outline(ctx, s, p, 0.8);
    ctx.stroke();

    // Cheese, drooping a little on one side
    ctx.beginPath();
    ctx.moveTo(-k * 0.8, k * 0.02);
    ctx.lineTo(k * 0.8, k * 0.02);
    ctx.lineTo(k * 0.62, k * 0.24);
    ctx.lineTo(k * 0.3, k * 0.04);
    ctx.lineTo(-k * 0.1, k * 0.26);
    ctx.lineTo(-k * 0.5, k * 0.04);
    ctx.lineTo(-k * 0.8, k * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#FFC21F';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    // Lettuce frill
    ctx.beginPath();
    ctx.moveTo(-k * 0.84, -k * 0.16);
    for (let i = 0; i <= 6; i += 1) {
      const x = -k * 0.84 + (k * 1.68 * i) / 6;
      ctx.quadraticCurveTo(x, -k * 0.02, x + k * 0.14, -k * 0.16);
    }
    ctx.lineTo(k * 0.8, -k * 0.2);
    ctx.lineTo(-k * 0.84, -k * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#6BBF3A';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    // Top bun, slightly askew because it is a cartoon
    ctx.save();
    ctx.translate(k * 0.04, -k * 0.2 + bounce);
    ctx.rotate(0.07);
    ctx.beginPath();
    ctx.moveTo(-k * 0.82, 0);
    ctx.quadraticCurveTo(-k * 0.76, -k * 0.74, 0, -k * 0.74);
    ctx.quadraticCurveTo(k * 0.76, -k * 0.74, k * 0.82, 0);
    ctx.closePath();
    ctx.fillStyle = '#F0B462';
    ctx.fill();
    outline(ctx, s, p, 0.8);
    ctx.stroke();
    ctx.fillStyle = '#FFF0D0';
    for (const [sx, sy] of [[-0.3, -0.36], [0.06, -0.48], [0.38, -0.3]]) {
      blob(ctx, sx * s, sy * s, s * 0.045, s * 0.028);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDonut(ctx, s, t, p) {
    const k = s * 0.5;
    const shimmer = Math.sin(t / 300);

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.1, k * 0.78, k * 0.74));

    // Dough
    ctx.beginPath();
    ctx.arc(0, 0, k * 0.8, 0, TAU);
    ctx.fillStyle = '#E8A85C';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Glaze with a wobbly lower edge
    ctx.beginPath();
    ctx.arc(0, -k * 0.06, k * 0.74, Math.PI * 0.05, Math.PI * 0.95, true);
    ctx.quadraticCurveTo(k * 0.34, k * 0.42, k * 0.06, k * 0.6);
    ctx.quadraticCurveTo(-k * 0.3, k * 0.4, -k * 0.7, k * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#FF8FC5';
    ctx.fill();
    outline(ctx, s, p, 0.65);
    ctx.stroke();

    // Sprinkles
    const sprinkles = [
      [-0.3, -0.24, 0.6, '#5BD1C4'], [0.04, -0.34, -0.4, '#FFE08A'],
      [0.3, -0.16, 1.1, '#7CFF8E'], [-0.16, 0.16, 0.2, '#FFFFFF'],
      [0.24, 0.16, -0.9, '#FFC21F'], [-0.36, 0.02, 1.4, '#FF6B6B'],
    ];
    ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.05;
    for (const [sx, sy, rot, colour] of sprinkles) {
      ctx.save();
      ctx.translate(sx * s, sy * s);
      ctx.rotate(rot + shimmer * 0.08);
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.moveTo(-s * 0.04, 0);
      ctx.lineTo(s * 0.04, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Hole
    ctx.beginPath();
    ctx.arc(0, 0, k * 0.26, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();
  }

  function drawBanana(ctx, s, t, p) {
    const k = s * 0.5;
    const sway = Math.sin(t / 340) * 0.05;

    ctx.save();
    ctx.rotate(-0.35 + sway);

    softShadow(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(-k * 0.7, -k * 0.3);
      ctx.quadraticCurveTo(0, k * 0.9, k * 0.72, -k * 0.2);
      ctx.quadraticCurveTo(0, k * 0.5, -k * 0.7, -k * 0.3);
      ctx.closePath();
    });

    // Body
    ctx.beginPath();
    ctx.moveTo(-k * 0.7, -k * 0.32);
    ctx.quadraticCurveTo(0, k * 0.86, k * 0.72, -k * 0.22);
    ctx.quadraticCurveTo(0, k * 0.46, -k * 0.7, -k * 0.32);
    ctx.closePath();
    ctx.fillStyle = '#FFE14D';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Inner highlight
    ctx.beginPath();
    ctx.moveTo(-k * 0.5, -k * 0.24);
    ctx.quadraticCurveTo(0, k * 0.5, k * 0.5, -k * 0.2);
    ctx.strokeStyle = '#FFF3A8';
    ctx.lineWidth = s * 0.05;
    ctx.stroke();

    // Peel flaps at the top, flopping with t
    ctx.fillStyle = '#E8C63A';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(-k * 0.66, -k * 0.3);
      ctx.rotate(side * (0.5 + sway * 2));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(k * 0.16, k * 0.3, -k * 0.06, k * 0.52);
      ctx.quadraticCurveTo(-k * 0.2, k * 0.26, 0, 0);
      ctx.closePath();
      ctx.fill();
      outline(ctx, s, p, 0.65);
      ctx.stroke();
      ctx.restore();
    }

    // Stem
    ctx.beginPath();
    ctx.moveTo(-k * 0.68, -k * 0.34);
    ctx.lineTo(-k * 0.78, -k * 0.62);
    ctx.strokeStyle = '#6B4A1F';
    ctx.lineWidth = s * 0.08;
    ctx.stroke();

    ctx.restore();
  }

  function drawTaco(ctx, s, t, p) {
    const k = s * 0.5;
    const jiggle = Math.sin(t / 200) * s * 0.014;

    softShadow(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(0, k * 0.1, k * 0.78, 0, Math.PI);
      ctx.closePath();
    });

    // Filling first, so the shell can sit in front of it
    ctx.fillStyle = '#7BC043';
    ctx.beginPath();
    ctx.ellipse(-k * 0.22, -k * 0.16 + jiggle, k * 0.3, k * 0.2, -0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#E94F37';
    ctx.beginPath();
    ctx.ellipse(k * 0.2, -k * 0.22 - jiggle, k * 0.24, k * 0.18, 0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8B5A2B';
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.04, k * 0.46, k * 0.2, 0, 0, TAU);
    ctx.fill();
    outline(ctx, s, p, 0.55);
    ctx.stroke();

    // One bit of filling making a break for it
    ctx.fillStyle = '#7BC043';
    ctx.beginPath();
    ctx.ellipse(k * 0.48, -k * 0.42 - jiggle * 2, k * 0.12, k * 0.08, 0.7, 0, TAU);
    ctx.fill();
    outline(ctx, s, p, 0.5);
    ctx.stroke();

    // Shell
    ctx.beginPath();
    ctx.moveTo(-k * 0.82, -k * 0.1);
    ctx.arc(0, -k * 0.1, k * 0.82, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = '#F2B233';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Shell shading
    ctx.beginPath();
    ctx.arc(0, -k * 0.1, k * 0.58, Math.PI * 0.12, Math.PI * 0.88);
    ctx.strokeStyle = '#D9952A';
    ctx.lineWidth = s * 0.055;
    ctx.stroke();
  }

  function drawFries(ctx, s, t, p) {
    const k = s * 0.5;
    const flop = Math.sin(t / 240) * 0.12;

    softShadow(ctx, s, () => roundRect(ctx, -k * 0.6, k * 0.02, k * 1.2, k * 0.8, k * 0.12));

    // The fries themselves, fanned out
    const fries = [[-0.34, -0.9, -0.22], [-0.12, -1.02, -0.06], [0.1, -0.96, 0.08],
      [0.3, -0.84, 0.24], [0.02, -0.78, 0.0]];
    ctx.fillStyle = '#FFD470';
    for (let i = 0; i < fries.length; i += 1) {
      const [fx, fy, rot] = fries[i];
      ctx.save();
      ctx.translate(fx * s, k * 0.1);
      ctx.rotate(rot + (i === 4 ? flop : flop * 0.2));
      roundRect(ctx, -s * 0.045, fy * k, s * 0.09, Math.abs(fy) * k + k * 0.2, s * 0.03);
      ctx.fill();
      outline(ctx, s, p, 0.55);
      ctx.stroke();
      ctx.restore();
    }

    // One fry flopping over the edge
    ctx.save();
    ctx.translate(k * 0.52, k * 0.06);
    ctx.rotate(1.25 + flop);
    roundRect(ctx, -s * 0.045, -k * 0.5, s * 0.09, k * 0.62, s * 0.03);
    ctx.fill();
    outline(ctx, s, p, 0.55);
    ctx.stroke();
    ctx.restore();

    // Carton
    ctx.beginPath();
    ctx.moveTo(-k * 0.62, k * 0.02);
    ctx.lineTo(k * 0.62, k * 0.02);
    ctx.lineTo(k * 0.46, k * 0.86);
    ctx.lineTo(-k * 0.46, k * 0.86);
    ctx.closePath();
    ctx.fillStyle = '#E03B3B';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Carton stripe
    ctx.beginPath();
    ctx.moveTo(-k * 0.55, k * 0.3);
    ctx.lineTo(k * 0.55, k * 0.3);
    ctx.strokeStyle = '#FFF0E0';
    ctx.lineWidth = s * 0.07;
    ctx.stroke();
  }

  function drawApple(ctx, s, t, p) {
    const k = s * 0.5;
    const breathe = 1 + Math.sin(t / 380) * 0.02;

    softShadow(ctx, s, () => blob(ctx, 0, k * 0.2, k * 0.7, k * 0.62));

    ctx.save();
    ctx.scale(breathe, 1 / breathe);

    // Two lobes make it read as an apple rather than a ball
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.5);
    ctx.bezierCurveTo(-k * 0.9, -k * 0.7, -k * 0.95, k * 0.62, 0, k * 0.78);
    ctx.bezierCurveTo(k * 0.95, k * 0.62, k * 0.9, -k * 0.7, 0, -k * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#E93B4E';
    ctx.fill();
    outline(ctx, s, p);
    ctx.stroke();

    // Gloss
    ctx.beginPath();
    ctx.ellipse(-k * 0.3, -k * 0.2, k * 0.16, k * 0.26, -0.5, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();

    // Stem
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.5);
    ctx.quadraticCurveTo(k * 0.1, -k * 0.82, k * 0.02, -k * 0.94);
    ctx.strokeStyle = '#6B4A1F';
    ctx.lineWidth = s * 0.075;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Leaf
    ctx.save();
    ctx.translate(k * 0.12, -k * 0.82);
    ctx.rotate(-0.5 + Math.sin(t / 300) * 0.12);
    ctx.beginPath();
    ctx.ellipse(k * 0.22, 0, k * 0.26, k * 0.13, 0, 0, TAU);
    ctx.fillStyle = '#5BB03A';
    ctx.fill();
    outline(ctx, s, p, 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawCake(ctx, s, t, p) {
    const k = s * 0.5;
    const cherryBob = Math.sin(t / 190) * s * 0.022;

    softShadow(ctx, s, () => roundRect(ctx, -k * 0.7, k * 0.2, k * 1.4, k * 0.6, k * 0.1));

    // Sponge layers
    roundRect(ctx, -k * 0.7, -k * 0.1, k * 1.4, k * 0.4, k * 0.07);
    ctx.fillStyle = '#F2C98A';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    roundRect(ctx, -k * 0.7, k * 0.3, k * 1.4, k * 0.42, k * 0.07);
    ctx.fillStyle = '#E8B873';
    ctx.fill();
    outline(ctx, s, p, 0.7);
    ctx.stroke();

    // Cream between the layers
    roundRect(ctx, -k * 0.72, k * 0.18, k * 1.44, k * 0.16, k * 0.06);
    ctx.fillStyle = '#FFF2E0';
    ctx.fill();
    outline(ctx, s, p, 0.55);
    ctx.stroke();

    // Frosting with drips
    ctx.beginPath();
    ctx.moveTo(-k * 0.72, -k * 0.1);
    ctx.lineTo(-k * 0.72, -k * 0.34);
    ctx.quadraticCurveTo(0, -k * 0.62, k * 0.72, -k * 0.34);
    ctx.lineTo(k * 0.72, -k * 0.1);
    ctx.quadraticCurveTo(k * 0.5, k * 0.06, k * 0.34, -k * 0.1);
    ctx.quadraticCurveTo(k * 0.04, k * 0.1, -k * 0.2, -k * 0.1);
    ctx.quadraticCurveTo(-k * 0.46, k * 0.04, -k * 0.72, -k * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#FF7FB0';
    ctx.fill();
    outline(ctx, s, p, 0.8);
    ctx.stroke();

    // Cherry on top, wobbling
    ctx.beginPath();
    ctx.arc(0, -k * 0.56 + cherryBob, k * 0.17, 0, TAU);
    ctx.fillStyle = '#E02040';
    ctx.fill();
    outline(ctx, s, p, 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.7 + cherryBob);
    ctx.quadraticCurveTo(k * 0.14, -k * 0.92, k * 0.06, -k * 0.98);
    ctx.strokeStyle = '#4F7A2A';
    ctx.lineWidth = s * 0.05;
    ctx.stroke();
  }

  /**
   * Canvas draw routines keyed by the shared catalogue id, then merged into
   * NS.FOODS in catalogue order so the engine's "food type 3" always means the
   * same snack in every renderer.
   */
  const DRAWERS = {
    pizza: drawPizza,
    burger: drawBurger,
    donut: drawDonut,
    banana: drawBanana,
    taco: drawTaco,
    fries: drawFries,
    apple: drawApple,
    cake: drawCake,
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
