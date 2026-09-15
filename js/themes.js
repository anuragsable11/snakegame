/**
 * HUNGRY NOODLE — themes and the cartoon backdrop.
 *
 * A theme is a flat palette. Everything that draws takes one, so switching
 * themes repaints the whole game without touching any drawing code.
 */
(function (NS) {
  'use strict';

  /**
   * Palette keys, used by every drawing routine:
   *   ink        near-black outline colour for everything
   *   body/bodyDark/bodyLight   the noodle
   *   belly      belly stripe
   *   cheek      blush
   *   tongue     mouth interior
   *   board1/board2   board gradient
   *   tile       faint checker tile (rgba)
   *   accent/accent2  highlights, score pops, sparkles
   *   crumb      generic particle colour
   */
  NS.THEMES = {
    noodle: {
      id: 'noodle',
      name: 'Hungry Noodle',
      emoji: '🍜',
      ink: '#241826',
      body: '#FFD23F',
      bodyDark: '#D98E14',
      bodyLight: '#FFE9A0',
      belly: '#FFF4CF',
      cheek: '#FF7DA0',
      tongue: '#E0426B',
      board1: '#3A2A52',
      board2: '#241A38',
      tile: 'rgba(255, 255, 255, 0.035)',
      accent: '#FF8A3D',
      accent2: '#5BD1C4',
      crumb: '#FFD23F',
    },
    spicy: {
      id: 'spicy',
      name: 'Spicy Noodle',
      emoji: '🌶️',
      ink: '#2A1110',
      body: '#FF6B35',
      bodyDark: '#B32D0C',
      bodyLight: '#FFA472',
      belly: '#FFD9C2',
      cheek: '#FF2E63',
      tongue: '#C81D45',
      board1: '#43191A',
      board2: '#280D0E',
      tile: 'rgba(255, 190, 120, 0.045)',
      accent: '#FFC53D',
      accent2: '#FF4D4D',
      crumb: '#FF9F1C',
    },
    dessert: {
      id: 'dessert',
      name: 'Dessert Monster',
      emoji: '🍩',
      ink: '#2B1A2E',
      body: '#FF9ECD',
      bodyDark: '#D45C9B',
      bodyLight: '#FFCDE6',
      belly: '#FFF0F8',
      cheek: '#FF5FA2',
      tongue: '#C63D80',
      board1: '#3D2A4F',
      board2: '#241733',
      tile: 'rgba(255, 220, 245, 0.05)',
      accent: '#7BE0D6',
      accent2: '#FFD66B',
      crumb: '#FFB3DE',
    },
    alien: {
      id: 'alien',
      name: 'Alien Noodle',
      emoji: '👽',
      ink: '#0E1A22',
      body: '#7CFF8E',
      bodyDark: '#27A84F',
      bodyLight: '#CCFFD5',
      belly: '#E8FFEE',
      cheek: '#FF6FD8',
      tongue: '#2E8C5A',
      board1: '#1B2A55',
      board2: '#0B1430',
      tile: 'rgba(160, 200, 255, 0.05)',
      accent: '#B388FF',
      accent2: '#4ECDC4',
      crumb: '#A8FFC0',
    },
  };

  /* ------------------------------------------------------------------ *
   * Deterministic pseudo-random, so a resize never reshuffles the board
   * ------------------------------------------------------------------ */

  function seeded(seed) {
    let value = seed;
    return function next() {
      value = (value * 1664525 + 1013904223) % 4294967296;
      return value / 4294967296;
    };
  }

  /**
   * Render the static board layer. Called once per resize or theme change,
   * then blitted every frame.
   */
  NS.drawBackdrop = function drawBackdrop(ctx, size, cell, p) {
    // Base gradient
    const base = ctx.createLinearGradient(0, 0, size * 0.4, size);
    base.addColorStop(0, p.board1);
    base.addColorStop(1, p.board2);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Picnic checker — deliberately barely-there, so the noodle always wins
    ctx.fillStyle = p.tile;
    const tile = cell * 2;
    for (let y = 0; y * tile < size; y += 1) {
      for (let x = 0; x * tile < size; x += 1) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }

    // Scattered crumbs and specks: the board should read as a messy table
    const random = seeded(90210);
    ctx.save();
    for (let i = 0; i < 26; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const r = cell * (0.045 + random() * 0.07);
      ctx.globalAlpha = 0.05 + random() * 0.07;
      ctx.fillStyle = i % 3 === 0 ? p.accent : p.crumb;
      ctx.beginPath();
      if (i % 4 === 0) {
        ctx.rect(x, y, r * 2.4, r * 1.2);
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();

    // Soft vignette so the middle of the board pops
    const vignette = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.32,
      size / 2, size / 2, size * 0.78
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    // Chunky inner wall — the thing you must not touch
    ctx.strokeStyle = p.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(3, cell * 0.16);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
    ctx.globalAlpha = 1;
  };

  /**
   * The cheap animated layer, drawn fresh each frame on top of the blit.
   * Eight slow floating specks — deterministic from t and the index alone.
   */
  NS.drawBackdropMotion = function drawBackdropMotion(ctx, size, t, p) {
    ctx.save();
    ctx.fillStyle = p.accent2;
    for (let i = 0; i < 8; i += 1) {
      const speed = 0.008 + i * 0.0016;
      const phase = (t * speed + i * 97) % (size + 60);
      const y = size + 30 - phase;
      const x = ((i * 137) % size) + Math.sin(t / 900 + i) * size * 0.035;
      const r = size * (0.004 + (i % 3) * 0.002);
      ctx.globalAlpha = 0.16 * Math.sin((phase / (size + 60)) * Math.PI);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
}(window.HungryNoodle));
