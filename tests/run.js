/** Hungry Noodle 3D — full test suite. */
const fs = require('fs');
const path = require('path');
const { boot, bootEngine, PROJECT } = require('./env');
const { makeProbeContext } = require('./probe');

let failures = 0;
const failedNames = [];
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) { failures += 1; failedNames.push(name); }
  


console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
}
const section = (name) => console.log(`\n--- ${name} ---`);

/** Source with comments stripped — assert on code, not prose. */
function codeOf(relativePath) {
  return fs.readFileSync(path.join(PROJECT, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}


/* ========================================================================== *
 * A. THE ENGINE — pure rules, no DOM anywhere in this section
 * ========================================================================== */

section('engine: isolation');
const pure = bootEngine();
check('engine loads without any DOM', typeof pure.NS.createEngine === 'function');
check('engine file never touches the DOM',
  !/\bdocument\b|\bwindow\.(?!HungryNoodle)/.test(codeOf('js/core/engine.js')) &&
  !/THREE|getElementById|getContext/.test(codeOf('js/core/engine.js')),
  'engine.js references rendering');

/** Build an engine with a fixed seed and a controlled clock. */
function makeEngine(options = {}) {
  const env = bootEngine();
  const clock = { now: 0 };
  const engine = env.NS.createEngine({
    mode: options.mode || 'classic',
    difficulty: options.difficulty || 'normal',
    seed: options.seed === undefined ? 1 : options.seed,
    now: () => clock.now,
  });

  /**
   * Pin every snack to the first free cell, in row-major order.
   *
   * These tests navigate to a known cell, so they need to know where the food
   * is. Before Phase 2 that came from injecting `random: () => 0`; the engine
   * now owns its RNG, so the same behaviour is reproduced here instead. The
   * engine still consumes its RNG exactly as it would in a real run — only the
   * resulting position is overridden, so nothing about determinism is bypassed.
   */
  function pinFirstFreeCell() {
    engine.on('foodSpawned', () => {
      const free = engine.freeCells(false);
      if (free.length === 0) return;
      engine.state.food = { x: free[0].x, y: free[0].y, type: 0 };
    });
    const free = engine.freeCells(false);
    if (free.length > 0) engine.state.food = { x: free[0].x, y: free[0].y, type: 0 };
  }
  const events = [];
  for (const name of ['eat', 'level', 'death', 'start', 'reset', 'close', 'idle', 'wrap']) {
    engine.on(name, (payload) => events.push({ name, payload }));
  }
  return { env, engine, clock, events, NS: env.NS, pinFirstFreeCell,
    run(steps, stepMs) {
      for (let i = 0; i < steps; i += 1) {
        clock.now += stepMs || engine.state.stepMs;
        engine.update(stepMs || engine.state.stepMs);
      }
    } };
}

section('engine: movement and collision');
{
  const t = makeEngine();
  t.engine.start();
  check('starts PLAYING', t.engine.state.status === 'PLAYING', t.engine.state.status);
  check('starts with 3 segments', t.engine.state.snake.length === 3);
  const head0 = { ...t.engine.state.snake[0] };
  t.run(1);
  check('a step moves the head one cell',
    t.engine.state.snake[0].x === head0.x + 1 && t.engine.state.snake[0].y === head0.y,
    JSON.stringify(t.engine.state.snake[0]));

  check('reverse is refused', t.engine.queueTurn('left') === false);
  check('a legal turn is accepted', t.engine.queueTurn('up') === true);
  check('a second queued turn is accepted', t.engine.queueTurn('left') === true);
  check('a third is dropped', t.engine.queueTurn('down') === false);
}

{
  const t = makeEngine();
  t.engine.start();
  t.engine.queueTurn('up');
  t.run(30);                       // straight into the top wall
  check('hitting a wall ends the run', t.engine.state.status === 'GAME_OVER');
  check('death cause is wall', t.engine.state.deathCause === 'wall',
    t.engine.state.deathCause);
}

section('engine: eating, scoring and levels');
{
  // Snacks pinned to the first free cell, so the route below is known
  const t = makeEngine();
  t.pinFirstFreeCell();
  t.engine.start();
  check('food spawned at 0,0', t.engine.state.food.x === 0 && t.engine.state.food.y === 0,
    JSON.stringify(t.engine.state.food));
  t.engine.queueTurn('up');
  t.run(10);
  t.engine.queueTurn('left');
  t.run(10);
  check('score is 10 after one snack', t.engine.state.score === 10, String(t.engine.state.score));
  check('the noodle grew', t.engine.state.snake.length === 4, String(t.engine.state.snake.length));
  check('an eat event fired', t.events.some((e) => e.name === 'eat'));
  check('level is still 1', t.engine.state.level === 1);
}

{
  // Normal difficulty levels up every 4 snacks
  const t = makeEngine();
  t.pinFirstFreeCell();
  t.engine.start();
  t.engine.queueTurn('up');    t.run(10);
  t.engine.queueTurn('left');  t.run(10);   // snack 1
  t.engine.queueTurn('down');  t.run(1);
  t.engine.queueTurn('right'); t.run(4);
  t.engine.queueTurn('up');    t.run(1);    // snack 2
  t.engine.queueTurn('left');  t.run(4);    // snack 3
  t.engine.queueTurn('down');  t.run(1);
  t.engine.queueTurn('right'); t.run(5);
  t.engine.queueTurn('up');    t.run(1);    // snack 4
  check('four snacks eaten', t.engine.state.foodEaten === 4, String(t.engine.state.foodEaten));
  check('score is 40', t.engine.state.score === 40, String(t.engine.state.score));
  check('level 2 reached', t.engine.state.level === 2, String(t.engine.state.level));
  check('a level event fired', t.events.some((e) => e.name === 'level'));
  check('the step got shorter', t.engine.state.stepMs === 141, String(t.engine.state.stepMs));
  check('streak counted', t.engine.state.streak >= 2, String(t.engine.state.streak));
}

section('engine: difficulty changes real numbers');
{
  const easy = makeEngine({ difficulty: 'easy' });
  const normal = makeEngine({ difficulty: 'normal' });
  const hard = makeEngine({ difficulty: 'hard' });
  easy.engine.start(); normal.engine.start(); hard.engine.start();

  check('easy is slower than normal',
    easy.engine.state.stepMs > normal.engine.state.stepMs,
    `${easy.engine.state.stepMs} vs ${normal.engine.state.stepMs}`);
  check('hard is faster than normal',
    hard.engine.state.stepMs < normal.engine.state.stepMs,
    `${hard.engine.state.stepMs} vs ${normal.engine.state.stepMs}`);
  check('speed ceilings differ',
    easy.engine.state.difficulty.minStep > hard.engine.state.difficulty.minStep);
  check('snacks per level differ',
    easy.engine.state.difficulty.foodPerLevel !== hard.engine.state.difficulty.foodPerLevel,
    `${easy.engine.state.difficulty.foodPerLevel} vs ${hard.engine.state.difficulty.foodPerLevel}`);
  check('easy levels at 5 snacks', easy.engine.state.difficulty.foodPerLevel === 5);
  check('hard levels at 3 snacks', hard.engine.state.difficulty.foodPerLevel === 3);
  check('level 10 speeds differ',
    easy.engine.stepDurationForLevel(10) !== hard.engine.stepDurationForLevel(10),
    `${easy.engine.stepDurationForLevel(10)} vs ${hard.engine.stepDurationForLevel(10)}`);
}

section('engine: Endless wraps instead of dying');
{
  const t = makeEngine({ mode: 'endless' });
  t.engine.start();
  t.engine.queueTurn('up');
  t.run(30);
  check('still alive after crossing the top edge', t.engine.state.status === 'PLAYING',
    t.engine.state.status);
  check('a wrap event fired', t.events.some((e) => e.name === 'wrap'));
  check('the head stayed on the board',
    t.engine.state.snake[0].y >= 0 && t.engine.state.snake[0].y < 20,
    JSON.stringify(t.engine.state.snake[0]));
  check('classic would have died here', makeEngine({ mode: 'classic' }).engine.state.mode.wrap === false);
}

section('engine: Time Attack');
{
  const t = makeEngine({ mode: 'timeattack' });
  t.pinFirstFreeCell();
  t.engine.start();
  check('the clock starts at the difficulty limit',
    t.engine.state.timeLeftMs === 60000, String(t.engine.state.timeLeftMs));
  t.run(20, 100);
  check('the clock is ticking down', t.engine.state.timeLeftMs < 60000,
    String(t.engine.state.timeLeftMs));

  const before = t.engine.state.timeLeftMs;
  t.engine.queueTurn('up');    t.run(10);
  t.engine.queueTurn('left');  t.run(10);   // eat
  check('eating buys seconds', t.engine.state.timeLeftMs > before - 3000,
    `${before} -> ${t.engine.state.timeLeftMs}`);

  // The clock drains in simulated time now, so one tick spends one stepMs
  const drain = makeEngine({ mode: 'timeattack' });
  drain.engine.start();
  drain.engine.state.timeLeftMs = 50;   // less than one step
  drain.engine.tick();
  check('running out of time ends the run', drain.engine.state.status === 'GAME_OVER',
    drain.engine.state.status);
  check('death cause is timeout', drain.engine.state.deathCause === 'timeout',
    drain.engine.state.deathCause);
  check('classic has no clock', makeEngine({ mode: 'classic' }).engine.state.mode.timed === false);
}

section('engine: Survival obstacles');
{
  const t = makeEngine({ mode: 'survival', difficulty: 'normal', random: () => 0.5 });
  t.engine.start();
  check('survival starts with obstacles', t.engine.state.obstacles.length === 2,
    String(t.engine.state.obstacles.length));
  const hard = makeEngine({ mode: 'survival', difficulty: 'hard', random: () => 0.5 });
  hard.engine.start();
  check('hard starts with more obstacles', hard.engine.state.obstacles.length === 5,
    String(hard.engine.state.obstacles.length));
  const classic = makeEngine({ mode: 'classic', difficulty: 'hard' });
  classic.engine.start();
  check('classic never has obstacles', classic.engine.state.obstacles.length === 0);
}

{
  // Walk deliberately into a planted obstacle
  const t = makeEngine({ mode: 'survival' });
  t.engine.start();
  const head = t.engine.state.snake[0];
  t.engine.state.obstacles = [{ x: head.x + 2, y: head.y }];
  t.run(2);
  check('hitting an obstacle ends the run', t.engine.state.status === 'GAME_OVER');
  check('death cause is obstacle', t.engine.state.deathCause === 'obstacle',
    t.engine.state.deathCause);
}

section('engine: self collision and the win');
{
  const t = makeEngine();
  t.pinFirstFreeCell();
  t.engine.start();
  t.engine.queueTurn('up');    t.run(10);
  t.engine.queueTurn('left');  t.run(10);   // snack 1, length 4
  t.engine.queueTurn('down');  t.run(1);
  t.engine.queueTurn('right'); t.run(1);
  check('following the vacating tail is legal', t.engine.state.status === 'PLAYING');
  t.run(3);
  t.engine.queueTurn('up');    t.run(1);    // snack 2, length 5
  t.engine.queueTurn('left');  t.run(1);
  t.engine.queueTurn('down');  t.run(1);    // into our own body
  check('running into the body ends the run', t.engine.state.status === 'GAME_OVER');
  check('death cause is self', t.engine.state.deathCause === 'self', t.engine.state.deathCause);
}

{
  // A 2x2 board can actually be filled
  const tiny = bootEngine((src, file) => (file.includes('config')
    ? src.replace('GRID_SIZE: 20,', 'GRID_SIZE: 2,').replace('START_LENGTH: 3,', 'START_LENGTH: 1,')
    : src));
  const clock = { now: 0 };
  const engine = tiny.NS.createEngine({ seed: 1, now: () => clock.now });
  engine.on('foodSpawned', () => {
    const free = engine.freeCells(false);
    if (free.length > 0) engine.state.food = { x: free[0].x, y: free[0].y, type: 0 };
  });
  engine.start();
  {
    const free = engine.freeCells(false);
    if (free.length > 0) engine.state.food = { x: free[0].x, y: free[0].y, type: 0 };
  }
  const stepOnce = (dir) => {
    engine.queueTurn(dir);
    clock.now += engine.state.stepMs;
    engine.update(engine.state.stepMs);
  };
  stepOnce('up'); stepOnce('left'); stepOnce('down'); stepOnce('right');
  check('filling the board ends the run', engine.state.status === 'GAME_OVER',
    engine.state.status);
  check('and it counts as a win', engine.state.deathCause === 'win', engine.state.deathCause);
}

section('engine: frame-rate independence');
{
  const coarse = makeEngine();
  const fine = makeEngine();
  coarse.engine.start();
  fine.engine.start();
  coarse.engine.queueTurn('up');
  fine.engine.queueTurn('up');
  coarse.run(10, 150);                          // 10 frames of 150ms
  for (let i = 0; i < 60; i += 1) {             // 60 frames of 25ms
    fine.clock.now += 25;
    fine.engine.update(25);
  }
  check('1500ms is 10 steps either way',
    JSON.stringify(coarse.engine.state.snake) === JSON.stringify(fine.engine.state.snake),
    `${JSON.stringify(coarse.engine.state.snake[0])} vs ${JSON.stringify(fine.engine.state.snake[0])}`);
}

section('engine: pause freezes everything');
{
  const t = makeEngine();
  t.engine.start();
  t.run(3);
  const frozen = JSON.stringify(t.engine.state.snake);
  t.engine.pause();
  t.run(40);
  check('no simulation while paused', JSON.stringify(t.engine.state.snake) === frozen);
  check('alpha is 1 while paused', t.engine.alpha() === 1);
  t.engine.resume();
  t.run(1);
  check('resuming steps again', JSON.stringify(t.engine.state.snake) !== frozen);
}

/* ========================================================================== *
 * B. Art, particles, banter, audio
 * ========================================================================== */

const g = boot({ store: new Map() });

/**
 * Pin snacks to the first free cell for the UI-driven sections below, so a
 * test can walk to a known cell. The engine's RNG still runs exactly as it
 * would in a real game; only the resulting position is overridden. The
 * listener survives resets, so it covers every run in this file.
 */
function pinFoodFor(api) {
  const engine = api.engine();
  const place = () => {
    const free = engine.freeCells(false);
    if (free.length > 0) engine.state.food = { x: free[0].x, y: free[0].y, type: 0 };
  };
  engine.on('foodSpawned', place);
  place();
}
pinFoodFor(g);

section('modules');
check('every script loaded', g.loaded.length >= 11, g.loaded.join(', '));
for (const member of ['CONFIG', 'MODES', 'DIFFICULTIES', 'THEMES', 'FOODS', 'createEngine',
  'createRenderer2D', 'createRenderer3D', 'createUI', 'createAudio', 'createParticles',
  'createBanter', 'noodleFace', 'isWebGLAvailable']) {
  check(`namespace exposes ${member}`, g.ns[member] !== undefined);
}
check('five game modes', Object.keys(g.ns.MODES).length === 5,
  Object.keys(g.ns.MODES).join(', '));
check('three difficulties', Object.keys(g.ns.DIFFICULTIES).length === 3);

function drawProbe(label, fn) {
  const probe = makeProbeContext();
  let error = null;
  try { fn(probe.ctx); } catch (e) { error = e; }
  check(`${label} draws without throwing`, !error, error && error.stack);
  if (error) return;
  check(`${label} balances save/restore`, probe.depth() === 0, `depth ${probe.depth()}`);
  check(`${label} never over-restores`, !probe.underflow());
  check(`${label} leaves globalAlpha at 1`, probe.alpha() === 1, String(probe.alpha()));
  check(`${label} sets no shadowBlur/filter`, !probe.usedShadow());
  check(`${label} draws something`, probe.ops() > 3, `${probe.ops()} ops`);
}

section('2D art still works');
const theme = g.ns.THEMES.noodle;
check('eight foods', g.ns.FOODS.length === 8);
check('food order matches the catalogue',
  g.ns.FOODS.every((f, i) => f.id === g.ns.FOOD_CATALOGUE[i].id));
for (const food of g.ns.FOODS) {
  drawProbe(`food:${food.id}`, (c) => food.draw(c, 34, 1234, theme));
}
for (const expression of ['idle', 'hungry', 'eating', 'fast', 'hurt', 'dead']) {
  drawProbe(`head:${expression}`, (c) => g.ns.drawNoodleHead(c, 32, 900, theme, {
    dir: { x: 1, y: 0 }, expression, chew: 0.5, blink: 0.2, tongue: 0.4,
    look: { x: 0.3, y: -0.2 },
  }));
}
for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
  drawProbe(`head:looking ${dir.x},${dir.y}`, (c) => g.ns.drawNoodleHead(c, 32, 500, theme, {
    dir, expression: 'idle', chew: 0, blink: 0, tongue: 0, look: { x: 0, y: 0 },
  }));
}
const longBody = Array.from({ length: 60 }, (_, i) => ({ x: 20 + i * 16, y: 300 }));
drawProbe('body:60 segments', (c) => g.ns.drawNoodleBody(c, longBody, 32, 700, theme,
  { dead: false, grow: 0.4, speed: 0.6 }));
drawProbe('body:dead', (c) => g.ns.drawNoodleBody(c, longBody, 32, 700, theme,
  { dead: true, grow: 0, speed: 0 }));
drawProbe('body:single segment', (c) => g.ns.drawNoodleBody(c, [{ x: 40, y: 40 }], 32, 0, theme,
  { dead: false, grow: 0, speed: 0 }));
drawProbe('backdrop:motion', (c) => g.ns.drawBackdropMotion(c, 640, 1000, theme));

section('themes: palettes and contrast');
const PALETTE_KEYS = ['ink', 'body', 'bodyDark', 'bodyLight', 'belly', 'cheek', 'tongue',
  'board1', 'board2', 'tile', 'accent', 'accent2', 'crumb'];
check('five themes', Object.keys(g.ns.THEMES).length === 5, Object.keys(g.ns.THEMES).join(', '));
for (const id of Object.keys(g.ns.THEMES)) {
  const missing = PALETTE_KEYS.filter((k) => !g.ns.THEMES[id][k]);
  check(`theme ${id} has every palette key`, missing.length === 0, missing.join(', '));
  check(`theme ${id} has a name and emoji`, !!g.ns.THEMES[id].name && !!g.ns.THEMES[id].emoji);
}

/** Relative luminance, for the noodle-vs-board contrast floor. */
function luminance(hex) {
  const raw = String(hex).replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const [r, gg, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
for (const id of Object.keys(g.ns.THEMES)) {
  const ratio = contrast(g.ns.THEMES[id].body, g.ns.THEMES[id].board1);
  check(`theme ${id}: noodle vs board contrast >= 3`, ratio >= 3, ratio.toFixed(2));
}

section('banter');
const REQUIRED = ['READY TO EAT?', 'YUM!', 'MORE FOOD!', 'THAT WAS GOOD!',
  'THE NOODLE IS HUNGRY!', 'Bro is STILL hungry', 'Someone stop this snake!',
  'This noodle has no limits!', 'ABSOLUTE UNIT', 'THE NOODLE HAS CRASHED',
  'TOO MUCH FOOD!', 'RIP NOODLE', 'Bro forgot how to turn.',
  'The noodle has left the chat.'];
const harvested = new Set();
for (let round = 0; round < 40; round += 1) {
  const b = g.ns.createBanter();
  for (const trigger of ['start', 'level', 'close', 'idle', 'record', 'over', 'eat', 'theme']) {
    for (let i = 0; i < 40; i += 1) {
      g.advance(14000);
      const line = b.pick(trigger, { score: [0, 200, 600][i % 3], streak: 2,
        level: 1 + (i % 9), seconds: 12, cause: ['wall', 'self', 'win'][i % 3] });
      if (line) harvested.add(line);
    }
  }
}
const missingLines = REQUIRED.filter((n) => ![...harvested].some((l) => l.includes(n)));
check('every requested line is in the pools', missingLines.length === 0, missingLines.join(' | '));
check('pools are big enough', harvested.size >= 50, `${harvested.size} lines`);

// Cadence: the joke only works if it mostly keeps quiet
const cadence = g.ns.createBanter();
check('start always speaks', typeof cadence.pick('start', {}) === 'string');
check('level always speaks', typeof cadence.pick('level', { level: 2 }) === 'string');
check('game over always speaks',
  typeof cadence.pick('over', { cause: 'wall', score: 10 }) === 'string');
let spoke = 0;
const seen = [];
for (let i = 0; i < 400; i += 1) {
  g.advance(900);
  const line = cadence.pick('eat', { score: i * 10, streak: 1, level: 1 });
  if (line) { spoke += 1; seen.push(line); }
}
check('eat stays mostly quiet', spoke > 0 && spoke < 200, `${spoke}/400 spoke`);
check('eat lines vary', new Set(seen).size >= 5, `${new Set(seen).size} distinct`);
let repeats = 0;
for (let i = 1; i < seen.length; i += 1) if (seen[i] === seen[i - 1]) repeats += 1;
check('no back-to-back repeats', repeats === 0, `${repeats} repeats`);

section('particles and audio');
const parts = g.ns.createParticles(60);
for (const type of ['crumb', 'star', 'puff', 'confetti', 'splat']) {
  parts.clear();
  parts.emit(type, 100, 100, { color: '#f00', count: 12, scale: 1 });
  check(`emit ${type}`, parts.count > 0);
  parts.update(16);
  const probe = makeProbeContext();
  let drawError = null;
  try { parts.draw(probe.ctx, theme, 1000); } catch (e) { drawError = e; }
  check(`draw ${type} does not throw`, !drawError, drawError && drawError.message);
  check(`draw ${type} balances save/restore`, probe.depth() === 0, `depth ${probe.depth()}`);
}
parts.clear();
for (let i = 0; i < 40; i += 1) parts.emit('crumb', 10, 10, { count: 20, scale: 1 });
check('particle pool is capped', parts.count <= 60, String(parts.count));
for (let i = 0; i < 600; i += 1) parts.update(16);
check('particles eventually die', parts.count === 0, String(parts.count));
parts.clear();
parts.emit('crumb', 10, 10, { count: 12, scale: 0 });
check('scale 0 suppresses particles (reduced motion)', parts.count === 0, String(parts.count));

const audio = g.ns.createAudio(g.ns.storage);
for (const method of ['unlock', 'eat', 'levelUp', 'gameOver', 'click', 'turn',
  'isMuted', 'setMuted', 'record', 'start']) {
  check(`audio.${method} exists`, typeof audio[method] === 'function');
}
let audioError = null;
try {
  audio.unlock(); audio.start();
  for (let i = 1; i < 12; i += 1) audio.eat({ streak: i, count: i });
  audio.levelUp(); audio.gameOver('wall'); audio.gameOver('win');
  audio.record(); audio.click(); audio.turn();
} catch (e) { audioError = e; }
check('every sound plays', !audioError, audioError && audioError.stack);
check('oscillators were created', (g.counts['audio.createOscillator'] || 0) > 5,
  String(g.counts['audio.createOscillator'] || 0));
check('the noise buffer is reused, not rebuilt per shot',
  (g.counts['audio.createBuffer'] || 0) <= 3, String(g.counts['audio.createBuffer'] || 0));

/* ========================================================================== *
 * C. The whole game, WebGL absent — the 2D fallback path
 * ========================================================================== */

section('fallback: no WebGL');
check('booted without throwing', !!g.game());
check('fell back to the 2D renderer', g.game().renderer.id === '2d', g.game().renderer.id);
check('the 3D toggle is disabled', g.registry.get('btn-render').disabled === true);
check('it says so out loud', /2D/.test(g.text('announcer')), g.text('announcer'));
check('starts on the menu screen', g.screen() === 'menu', g.screen());
check('menu card is visible', g.registry.get('panel-menu').hidden === false);

section('menu');
Math.random = () => 0;
check('mode name shown', g.text('menu-mode-name').includes('Classic'), g.text('menu-mode-name'));
g.pick('modes', 'survival');
check('picking a mode updates the engine', g.engine().state.mode.id === 'survival',
  g.engine().state.mode.id);
check('and the menu blurb', g.text('menu-mode-blurb').includes('Bins'), g.text('menu-mode-blurb'));
check('and persists', g.store.get('noodle.mode.v1') === 'survival');
g.pick('difficulties', 'hard');
check('picking a difficulty updates the engine', g.engine().state.difficulty.id === 'hard');
check('and persists', g.store.get('noodle.difficulty.v1') === 'hard');
g.pick('modes', 'classic');
g.pick('difficulties', 'normal');
check('back to classic/normal', g.engine().state.mode.id === 'classic' &&
  g.engine().state.difficulty.id === 'normal');

section('playing');
g.click('btn-play');
check('Play starts a run', g.state() === 'PLAYING', g.state());
check('screen switched to the game', g.screen() === 'game', g.screen());
check('menu card hidden', g.registry.get('panel-menu').hidden === true);
g.press('ArrowUp');   g.steps(10);
g.press('ArrowLeft'); g.steps(10);
check('score reached 10 through the UI', g.score() === 10, String(g.score()));
check('a frame rendered without throwing', (g.frame(16), true));
check('HUD shows the length', /length 4/.test(g.label()), g.label());
g.steps(1);
check('wall ends the run', g.state() === 'GAME_OVER', g.state());
check('game over card shown', g.registry.get('panel-gameover').hidden === false);
check('final score shown', g.text('final-score') === '10');
check('high score persisted to the classic key', g.store.get('snake.highScore.v1') === '10',
  String(g.store.get('snake.highScore.v1')));
check('record badge shown', g.registry.get('new-record').hidden === false);
check('a funny reason was written', g.text('gameover-reason').length > 3,
  g.text('gameover-reason'));

section('per-mode high scores');
g.click('btn-overlay-menu');
check('back on the menu', g.screen() === 'menu', g.screen());
check('classic best shown', g.text('menu-best') === '10', g.text('menu-best'));
g.pick('modes', 'endless');
check('endless has its own best', g.text('menu-best') === '0', g.text('menu-best'));
g.pick('modes', 'classic');
check('classic best is still there', g.text('menu-best') === '10', g.text('menu-best'));

section('endless mode through the UI');
g.pick('modes', 'endless');
g.click('btn-play');
g.press('ArrowUp');
g.steps(30);
check('wrapping keeps you alive', g.state() === 'PLAYING', g.state());
g.click('btn-overlay-menu');
g.pick('modes', 'classic');

section('time attack HUD');
g.pick('modes', 'timeattack');
g.click('btn-play');
check('the timer chip appears', g.registry.get('timer-chip').hidden === false);
g.steps(10, 100);
check('the timer counts down', Number(g.text('timer')) < 60, g.text('timer'));
g.click('btn-overlay-menu');
check('timer chip hidden outside time attack',
  (g.pick('modes', 'classic'), g.registry.get('timer-chip').hidden === true));

section('controls');
g.click('btn-play');
g.press('p');      check('P pauses', g.state() === 'PAUSED', g.state());
g.press(' ');      check('Space resumes', g.state() === 'PLAYING', g.state());
g.press('r');      check('R restarts', g.state() === 'PLAYING', g.state());
g.press('w');      g.steps(1);
check('W steers', g.state() === 'PLAYING');
g.press('a');      g.steps(1);
check('A steers', g.state() === 'PLAYING');
g.tap('up');       g.steps(1);
check('d-pad steers', g.state() === 'PLAYING');
g.press('m');      check('M mutes', g.store.get('snake.muted.v1') === 'true');
g.press('m');      check('M unmutes', g.store.get('snake.muted.v1') === 'false');
g.click('btn-pause');
check('pause button works', g.state() === 'PAUSED', g.state());
g.click('btn-pause');
check('and resumes', g.state() === 'PLAYING', g.state());
g.doc.hidden = true;
g.doc.dispatch('visibilitychange', {});
check('hiding the tab pauses', g.state() === 'PAUSED', g.state());
g.doc.hidden = false;

section('themes');
for (const id of ['spicy', 'dessert', 'alien', 'noodle']) {
  g.pick('themes', id);
  g.frame(16);
  check(`theme ${id} applies`, g.body.dataset.theme === id, g.body.dataset.theme);
}
check('theme persists', g.store.get('noodle.theme.v1') === 'noodle');

section('long run stability (2D)');
g.click('btn-menu');
g.click('btn-play');
let crashed = null;
try { for (let i = 0; i < 900; i += 1) g.frame(16); } catch (e) { crashed = e; }
check('900 frames without throwing', !crashed, crashed && crashed.stack);
check('canvas save/restore balanced', (g.counts.__depth || 0) === 0, String(g.counts.__depth));
check('no restore underflow', !g.counts.__underflow);

/* ========================================================================== *
 * D. The 3D renderer — real three.js, stubbed WebGLRenderer
 * ========================================================================== */

section('3D renderer');
const three = boot({ store: new Map(), webgl: true, withThree: true });
check('three.js loaded', !!three.THREE && !!three.THREE.Scene);
check('WebGL detected', three.ns.isWebGLAvailable() === true);
check('the 3D renderer was chosen', three.game().renderer.id === '3d',
  three.game().renderer.id);
check('a WebGLRenderer was constructed', three.counts.webglRenderers >= 1);
check('the 3D toggle is enabled', three.registry.get('btn-render').disabled === false);
check('renderer preference persisted', three.store.get('noodle.renderer.v1') === '3d');

three.click('btn-play');
check('3D run starts', three.state() === 'PLAYING', three.state());
const rendersBefore = three.counts.glRenders || 0;
three.frame(16);
check('the scene renders each frame', (three.counts.glRenders || 0) > rendersBefore);

// Put a snack directly in front of the head rather than fishing for it
{
  const head = three.engine().state.snake[0];
  three.engine().state.food = { x: head.x + 2, y: head.y, type: 2 };
  three.steps(2);
}
check('eating works in 3D', three.score() === 10, String(three.score()));
check('the noodle grew in 3D', three.engine().state.snake.length === 4,
  String(three.engine().state.snake.length));

// Every food model must build without throwing
let buildError = null;
try {
  for (let i = 0; i < 8; i += 1) {
    three.engine().state.food = { x: 5, y: 5, type: i };
    three.frame(16);
  }
} catch (e) { buildError = e; }
check('all eight 3D food models build', !buildError, buildError && buildError.stack);

// Obstacles and every expression
let sceneError = null;
try {
  three.engine().state.obstacles = [{ x: 2, y: 2 }, { x: 3, y: 9 }];
  for (let i = 0; i < 40; i += 1) three.frame(16);
  three.steps(3);
} catch (e) { sceneError = e; }
check('obstacles render in 3D', !sceneError, sceneError && sceneError.stack);

let longRun3d = null;
try { for (let i = 0; i < 600; i += 1) three.frame(16); } catch (e) { longRun3d = e; }
check('600 3D frames without throwing', !longRun3d, longRun3d && longRun3d.stack);

section('3D resources are shared');
{
  const src = fs.readFileSync(path.join(PROJECT, 'js/render/renderer3d.js'), 'utf8');
  check('geometries are built once in a table', /const geo = \{/.test(src));
  check('materials are cached', /materialCache/.test(src));
  check('the whole body is one instanced draw call',
    /new THREE\.InstancedMesh\(geo\.segment, bodyMaterial, MAX_BODY_INSTANCES\)/.test(src));
  check('the old per-segment pool is gone', !/segmentPool/.test(src));
  check('the instance count is capped', /MAX_BODY_INSTANCES = \d+/.test(src));
  check('particles are a fixed-size buffer', /MAX_PARTICLES/.test(src));
  check('dispose releases geometries and materials',
    /dispose\(\)/.test(src) && /materialCache\.forEach/.test(src));
  const perFrame = src.slice(src.indexOf('function layoutSnake'));
  check('no geometry is allocated per frame', !/new THREE\.\w+Geometry/.test(perFrame));
  check('no material is allocated per frame', !/new THREE\.Mesh\w*Material/.test(perFrame));
}

section('renderer toggle and fallback');
three.click('btn-render');
check('toggling drops to 2D', three.game().renderer.id === '2d', three.game().renderer.id);
check('the old WebGL renderer was disposed', (three.counts.glDisposes || 0) >= 1);
three.frame(16);
check('2D keeps rendering after the swap', true);
three.click('btn-render');
check('toggling returns to 3D', three.game().renderer.id === '3d', three.game().renderer.id);
three.frame(16);
check('game state survived both swaps', three.state() === 'PLAYING' ||
  three.state() === 'GAME_OVER', three.state());
three.press('ArrowDown');
three.steps(2);
check('steering still works after swapping', !!three.engine().state.snake.length);

/* ========================================================================== *
 * E. Markup, CSS and hygiene
 * ========================================================================== */

/* ========================================================================== *
 * E. Persistence across a reload
 * ========================================================================== */

section('persistence across a reload');
{
  // Reboot the whole game with the same localStorage, as a refresh would
  const reloaded = boot({ store: g.store });
  check('high score is read back',
    reloaded.text('high-score') === String(g.store.get('snake.highScore.v1')),
    `${reloaded.text('high-score')} vs ${g.store.get('snake.highScore.v1')}`);
  check('theme is read back', reloaded.body.dataset.theme === g.store.get('noodle.theme.v1'),
    reloaded.body.dataset.theme);
  check('mode is read back', reloaded.engine().state.mode.id === g.store.get('noodle.mode.v1'),
    reloaded.engine().state.mode.id);
  check('difficulty is read back',
    reloaded.engine().state.difficulty.id === g.store.get('noodle.difficulty.v1'),
    reloaded.engine().state.difficulty.id);
  check('a reload starts on the menu', reloaded.screen() === 'menu', reloaded.screen());
  check('a reload starts at READY', reloaded.state() === 'READY', reloaded.state());
  check('a reload resets the score', reloaded.score() === 0, String(reloaded.score()));
}

{
  // Corrupt storage must not take the game down
  const corrupt = new Map([
    ['snake.highScore.v1', 'not-a-number'],
    ['noodle.theme.v1', 'nonsense'],
    ['noodle.mode.v1', 'nonsense'],
    ['noodle.difficulty.v1', 'nonsense'],
  ]);
  let bootError = null;
  let survivor = null;
  try { survivor = boot({ store: corrupt }); } catch (e) { bootError = e; }
  check('a corrupt store does not crash the boot', !bootError, bootError && bootError.message);
  if (survivor) {
    check('a bad high score falls back to 0', survivor.text('high-score') === '0',
      survivor.text('high-score'));
    check('a bad theme falls back to the default',
      survivor.body.dataset.theme === 'noodle', survivor.body.dataset.theme);
    check('a bad mode falls back to classic',
      survivor.engine().state.mode.id === 'classic', survivor.engine().state.mode.id);
    check('a bad difficulty falls back to normal',
      survivor.engine().state.difficulty.id === 'normal',
      survivor.engine().state.difficulty.id);
  }
}

/* ========================================================================== *
 * F. Markup, CSS and hygiene
 * ========================================================================== */

section('markup and css');

/** Both shipped pages get the same hygiene treatment. */
const PAGES = ['index.html', 'play.html'];
const pageSource = Object.fromEntries(
  PAGES.map((page) => [page, fs.readFileSync(path.join(PROJECT, page), 'utf8')])
);

const css = fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8');

for (const page of PAGES) {
  const html = pageSource[page];
  check(`${page}: three.js is vendored, not a CDN`, /src="vendor\/three\.min\.js"/.test(html));
  check(`${page}: no external URLs at all`, !/https?:\/\/(?!www\.w3\.org|openapi\.vercel\.sh)/.test(html));
  check(`${page}: no ES modules (file:// must work)`, !/type="module"/.test(html));
  check(`${page}: no inline styles`, !/ style="/.test(html));
  check(`${page}: no inline handlers`, !/ on[a-z]+="/.test(html));
  check(`${page}: no inline scripts`, !/<script(?![^>]*src=)/.test(html));
  check(`${page}: every script file exists`, (() => {
    const missing = [...html.matchAll(/<script src="([^"]+)"/g)]
      .map((m) => m[1]).filter((src) => !fs.existsSync(path.join(PROJECT, src)));
    return missing.length === 0;
  })());
}

check('vendored three.js exists', fs.existsSync(path.join(PROJECT, 'vendor/three.min.js')));

/**
 * Each page must be styled by the stylesheets IT links — a page that uses
 * classes from a stylesheet it never loads renders unstyled in production.
 */
for (const page of PAGES) {
  const html = pageSource[page];
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);

  check(`${page}: links at least one stylesheet`, sheets.length > 0);
  check(`${page}: every stylesheet exists`,
    sheets.every((href) => fs.existsSync(path.join(PROJECT, href))),
    sheets.join(', '));

  const linkedCss = sheets
    .filter((href) => fs.existsSync(path.join(PROJECT, href)))
    .map((href) => fs.readFileSync(path.join(PROJECT, href), 'utf8'))
    .join('\n');

  const used = new Set([...html.matchAll(/class="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  const defined = new Set([...linkedCss.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const unstyled = [...used].filter((c) => !defined.has(c));
  check(`${page}: every class is styled by a linked stylesheet`,
    unstyled.length === 0, unstyled.join(', '));
}

check('the landing page links to the game', /href="play\.html"/.test(pageSource['index.html']));
check('the game page links back to the landing page', /href="index\.html"/.test(pageSource['play.html']));

const html = pageSource['play.html'];

section('responsive and touch css');
for (const query of ['max-width: 900px', 'max-width: 640px', 'max-width: 380px',
  'max-height: 720px', 'orientation: landscape']) {
  check(`breakpoint kept: ${query}`, css.includes(query));
}
check('reduced motion still honoured', css.includes('prefers-reduced-motion'));
check('safe-area insets kept', (css.match(/env\(safe-area-inset/g) || []).length >= 3);
check('body uses dvh as well as vh', /min-height: 100dvh/.test(css));
check('board is capped by viewport height on phones', /width: min\(100%, 70dvh\)/.test(css));
check('the phone layout puts themes after the d-pad',
  /"hud"\s*"board"\s*"controls"\s*"dpad"\s*"themes"/.test(css));
check('landscape lays the board beside the controls', /"board hud"/.test(css));
check('buttons opt out of double-tap zoom',
  (css.match(/touch-action: manipulation/g) || []).length >= 3);
check('controls are not text-selectable',
  (css.match(/user-select: none/g) || []).length >= 6);
check('the board still swallows swipes', /#board \{[^}]*touch-action: none/.test(css));
check('theme name is hidden on phones', /\.theme-btn__name \{ display: none; \}/.test(css));
check('the stage uses named grid areas', /\.stage \{[^}]*grid-template-areas/.test(css));

section('architecture');
const engineCode = codeOf('js/core/engine.js');
const r3dCode = codeOf('js/render/renderer3d.js');
const r2dCode = codeOf('js/render/renderer2d.js');
check('engine has no rendering code', !/THREE|ctx\.|\.getContext/.test(engineCode));
check('engine has no audio code', !/createAudio|AudioContext/.test(engineCode));
check('engine has no storage code', !/localStorage|NS\.storage/.test(engineCode));
check('3D renderer never writes engine state', !/state\.\w+\s*=[^=]/.test(r3dCode));
check('2D renderer never writes engine state', !/state\.\w+\s*=[^=]/.test(r2dCode));
check('both renderers expose the same contract', (() => {
  const contract = ['mount', 'setTheme', 'resize', 'update', 'render',
    'onEat', 'onLevel', 'onDeath', 'onRecord', 'onReset', 'dispose'];
  return contract.every((m) => r2dCode.includes(m + '(') && r3dCode.includes(m + '('));
})());
check('old monolith is gone', !fs.existsSync(path.join(PROJECT, 'js/game.js')));

/* ========================================================================== *
 * G. PHASE 2 — seeded RNG, determinism, replay, ghost, daily challenge
 * ========================================================================== */

section('rng: determinism');
{
  const NS = pure.NS;

  const a = NS.createRng(12345);
  const b = NS.createRng(12345);
  const sequenceA = Array.from({ length: 50 }, () => a.next());
  const sequenceB = Array.from({ length: 50 }, () => b.next());
  check('same seed gives the same sequence',
    JSON.stringify(sequenceA) === JSON.stringify(sequenceB));

  const c = NS.createRng(54321);
  const sequenceC = Array.from({ length: 50 }, () => c.next());
  check('a different seed gives a different sequence',
    JSON.stringify(sequenceA) !== JSON.stringify(sequenceC));

  check('values stay in [0, 1)', sequenceA.every((v) => v >= 0 && v < 1));
  check('values are not all identical', new Set(sequenceA).size > 40,
    `${new Set(sequenceA).size} distinct`);

  // Integer helpers
  const d = NS.createRng(7);
  const ints = Array.from({ length: 400 }, () => d.int(3, 9));
  check('int() respects its bounds', ints.every((v) => v >= 3 && v <= 9));
  check('int() reaches both ends', ints.includes(3) && ints.includes(9));
  check('int() returns whole numbers', ints.every((v) => Number.isInteger(v)));
  check('int(n, n) is always n', NS.createRng(1).int(5, 5) === 5);

  const e = NS.createRng(9);
  const belows = Array.from({ length: 200 }, () => e.below(4));
  check('below(n) stays under n', belows.every((v) => v >= 0 && v < 4));
  check('below(0) is 0, not NaN', NS.createRng(1).below(0) === 0);
  check('below(-1) is 0, not negative', NS.createRng(1).below(-1) === 0);

  check('pick() returns a member', ['a', 'b', 'c'].includes(NS.createRng(2).pick(['a', 'b', 'c'])));
  check('pick([]) is undefined', NS.createRng(2).pick([]) === undefined);

  // State round-trip
  const f = NS.createRng(99);
  f.next(); f.next(); f.next();
  const saved = f.getState();
  const expected = [f.next(), f.next()];
  f.setState(saved);
  check('state round-trips exactly',
    JSON.stringify([f.next(), f.next()]) === JSON.stringify(expected));
  check('getState is a uint32', Number.isInteger(saved) && saved >= 0 && saved <= 0xffffffff);

  const g1 = NS.createRng(31);
  g1.next();
  const clone = g1.clone();
  check('clone() continues from the same place', clone.next() === g1.next());

  // String seeds and the hash
  check('a string seed is accepted', Number.isFinite(NS.createRng('hello').next()));
  check('the same string seeds the same run',
    NS.createRng('x').next() === NS.createRng('x').next());
  check('different strings seed differently',
    NS.createRng('x').next() !== NS.createRng('y').next());
  check('hashString is stable', NS.hashString('abc') === NS.hashString('abc'));
  check('hashString separates inputs', NS.hashString('abc') !== NS.hashString('abd'));
  check('hashString returns a uint32', (() => {
    const h = NS.hashString('anything at all');
    return Number.isInteger(h) && h >= 0 && h <= 0xffffffff;
  })());
}

section('engine: the same seed replays the same run');
{
  const inputs = ['up', 'left', 'down', 'right', 'up', 'left'];

  function playOut(seed) {
    const t = makeEngine({ seed });
    const foods = [];
    // Subscribe before start(), so the opening snack is captured too
    t.engine.on('foodSpawned', () => {
      foods.push(`${t.engine.state.food.x},${t.engine.state.food.y},${t.engine.state.food.type}`);
    });
    t.engine.start();
    for (let i = 0; i < inputs.length; i += 1) {
      t.engine.queueTurn(inputs[i]);
      for (let n = 0; n < 6; n += 1) t.engine.tick();
    }
    return {
      fingerprint: t.engine.fingerprint(),
      score: t.engine.state.score,
      tick: t.engine.state.tick,
      snake: JSON.stringify(t.engine.state.snake),
      foods: foods.join(' '),
      rng: t.engine.getRngState(),
    };
  }

  const first = playOut(4242);
  const second = playOut(4242);
  const other = playOut(9999);

  check('same seed + same inputs: identical fingerprint',
    first.fingerprint === second.fingerprint, `${first.fingerprint} vs ${second.fingerprint}`);
  check('same seed + same inputs: identical score', first.score === second.score);
  check('same seed + same inputs: identical snake', first.snake === second.snake);
  check('same seed + same inputs: identical RNG state', first.rng === second.rng);
  check('a different seed produces a different run',
    first.fingerprint !== other.fingerprint, `${first.fingerprint} vs ${other.fingerprint}`);
  check('the food sequence is seeded', first.foods.length > 0 && first.foods === second.foods);
  check('a different seed gives a different food sequence', first.foods !== other.foods);

  // The fingerprint must ignore presentation-only state
  const t = makeEngine({ seed: 77 });
  t.engine.start();
  t.engine.tick();
  const before = t.engine.fingerprint();
  t.engine.state.lastEatAt = 123456;
  t.engine.state.diedAt = 999;
  t.engine.state.accumulator = 42;
  check('the fingerprint ignores presentation state', t.engine.fingerprint() === before);

  const moved = makeEngine({ seed: 77 });
  moved.engine.start();
  moved.engine.tick();
  moved.engine.tick();
  check('the fingerprint changes when the simulation does',
    moved.engine.fingerprint() !== before);
}

section('engine: tick() is the only thing that advances the game');
{
  const t = makeEngine({ seed: 5 });
  t.engine.start();
  check('tick starts at 0', t.engine.state.tick === 0, String(t.engine.state.tick));
  t.engine.tick();
  check('one tick advances the counter', t.engine.state.tick === 1);
  check('simulated time advances by exactly one step',
    t.engine.state.simTimeMs === t.engine.state.stepMs,
    `${t.engine.state.simTimeMs} vs ${t.engine.state.stepMs}`);
  check('tick() returns true while alive', t.engine.tick() === true);

  // Reaching the wall stops it
  const wall = makeEngine({ seed: 5 });
  wall.engine.start();
  wall.engine.queueTurn('up');
  let alive = true;
  for (let i = 0; i < 40 && alive; i += 1) alive = wall.engine.tick();
  check('tick() returns false once the run ends', alive === false);
  check('further ticks do nothing', wall.engine.tick() === false);

  // update() and tick() must agree
  const byUpdate = makeEngine({ seed: 8 });
  const byTick = makeEngine({ seed: 8 });
  byUpdate.engine.start();
  byTick.engine.start();
  byUpdate.engine.queueTurn('up');
  byTick.engine.queueTurn('up');
  byUpdate.run(5);
  for (let i = 0; i < 5; i += 1) byTick.engine.tick();
  check('update() and tick() reach the same state',
    byUpdate.engine.fingerprint() === byTick.engine.fingerprint(),
    `${byUpdate.engine.fingerprint()} vs ${byTick.engine.fingerprint()}`);

  // reset() rewinds the RNG, so a second run from one engine matches the first
  const rewound = makeEngine({ seed: 31337 });
  rewound.engine.start();
  for (let i = 0; i < 4; i += 1) rewound.engine.tick();
  const firstRun = rewound.engine.fingerprint();
  rewound.engine.start();
  for (let i = 0; i < 4; i += 1) rewound.engine.tick();
  check('reset() rewinds the RNG to the seed',
    rewound.engine.fingerprint() === firstRun, `${rewound.engine.fingerprint()} vs ${firstRun}`);
}

section('replay: recording');
{
  const NS = pure.NS;
  const t = makeEngine({ seed: 2024 });
  const recorder = NS.createRecorder(t.engine);

  t.engine.start();
  recorder.start();

  const script = [['up', 4], ['left', 3], ['down', 5], ['right', 2]];
  for (const [dir, ticks] of script) {
    if (t.engine.queueTurn(dir)) recorder.onTurn(dir);
    for (let i = 0; i < ticks; i += 1) t.engine.tick();
  }

  const replay = recorder.finish();

  check('the replay is versioned', replay.version === NS.REPLAY_VERSION);
  check('the replay carries the seed', replay.seed === t.engine.getSeed());
  check('the replay carries the configuration',
    replay.config.mode === 'classic' && replay.config.difficulty === 'normal' &&
    replay.config.gridSize === 20, JSON.stringify(replay.config));
  check('the replay captured the inputs', replay.inputs.length === script.length,
    `${replay.inputs.length} of ${script.length}`);
  check('inputs are tick-indexed', replay.inputs.every((i) => Number.isInteger(i.tick)));
  check('input ticks are non-decreasing',
    replay.inputs.every((input, i) => i === 0 || input.tick >= replay.inputs[i - 1].tick));
  check('inputs use directions, not key codes',
    replay.inputs.every((i) => ['up', 'down', 'left', 'right'].includes(i.dir)));
  check('the replay records its result',
    replay.result && typeof replay.result.fingerprint === 'string');
  check('the recorded result matches the live engine',
    replay.result.fingerprint === t.engine.fingerprint() &&
    replay.result.score === t.engine.state.score);
  check('the replay stores no rendering state',
    !('snake' in replay) && !('particles' in replay) && !('theme' in replay));
  check('the replay is compact', NS.serialiseReplay(replay).length < 600,
    `${NS.serialiseReplay(replay).length} bytes`);
}

section('replay: playback reproduces the run');
{
  const NS = pure.NS;

  /** Play a scripted run and hand back both the live result and its replay. */
  function recordRun(options) {
    const t = makeEngine(options);
    const recorder = NS.createRecorder(t.engine);
    t.engine.start();
    recorder.start();
    const script = [['up', 5], ['left', 4], ['down', 3], ['right', 6], ['up', 2]];
    for (const [dir, ticks] of script) {
      if (t.engine.queueTurn(dir)) recorder.onTurn(dir);
      for (let i = 0; i < ticks; i += 1) t.engine.tick();
    }
    return { replay: recorder.finish(), engine: t.engine };
  }

  const { replay, engine } = recordRun({ seed: 555 });
  const played = NS.createPlayback(replay).runToEnd();

  check('playback reproduces the fingerprint',
    played.fingerprint === replay.result.fingerprint,
    `${played.fingerprint} vs ${replay.result.fingerprint}`);
  check('playback reproduces the score', played.score === engine.state.score);
  check('playback reproduces the tick count', played.tick === engine.state.tick);
  check('playback reproduces the length', played.length === engine.state.snake.length);

  // Playing twice must land in the same place
  const again = NS.createPlayback(replay).runToEnd();
  check('playback is repeatable', again.fingerprint === played.fingerprint);

  // Playback uses the real engine, not a copy of the rules
  const playback = NS.createPlayback(replay);
  check('playback exposes a real engine',
    typeof playback.engine.tick === 'function' &&
    typeof playback.engine.queueTurn === 'function');
  check('playback starts at tick 0', playback.engine.state.tick === 0);
  playback.step();
  check('stepping playback advances one tick', playback.engine.state.tick === 1);

  // A run that ends in death replays the death
  const deadly = makeEngine({ seed: 4 });
  const deadlyRecorder = NS.createRecorder(deadly.engine);
  deadly.engine.start();
  deadlyRecorder.start();
  if (deadly.engine.queueTurn('up')) deadlyRecorder.onTurn('up');
  while (deadly.engine.tick()) { /* run into the wall */ }
  const deathReplay = deadlyRecorder.finish();
  const deathPlayed = NS.createPlayback(deathReplay).runToEnd();
  check('a fatal run replays its death',
    deathPlayed.cause === deathReplay.result.cause &&
    deathPlayed.fingerprint === deathReplay.result.fingerprint,
    `${deathPlayed.cause} vs ${deathReplay.result.cause}`);

  // Every mode round-trips
  for (const mode of ['classic', 'timeattack', 'survival', 'endless', 'daily']) {
    const run = recordRun({ seed: 808, mode });
    const verdict = NS.verifyReplay(run.replay);
    check(`${mode}: replay verifies`, verdict.ok, verdict.reason || '');
  }

  // Every difficulty round-trips
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const run = recordRun({ seed: 606, difficulty });
    const verdict = NS.verifyReplay(run.replay);
    check(`${difficulty}: replay verifies`, verdict.ok, verdict.reason || '');
  }
}

section('replay: verification and versioning');
{
  const NS = pure.NS;
  const t = makeEngine({ seed: 31415 });
  const recorder = NS.createRecorder(t.engine);
  t.engine.start();
  recorder.start();
  for (const dir of ['up', 'left', 'down']) {
    if (t.engine.queueTurn(dir)) recorder.onTurn(dir);
    for (let i = 0; i < 4; i += 1) t.engine.tick();
  }
  const good = recorder.finish();

  check('a genuine replay verifies', NS.verifyReplay(good).ok);

  const tamperedSeed = JSON.parse(JSON.stringify(good));
  tamperedSeed.seed += 1;
  check('a changed seed fails verification', NS.verifyReplay(tamperedSeed).ok === false);

  const tamperedScore = JSON.parse(JSON.stringify(good));
  tamperedScore.result.score += 100;
  const scoreVerdict = NS.verifyReplay(tamperedScore);
  check('an inflated score fails verification', scoreVerdict.ok === false);
  check('and the reason names what diverged',
    typeof scoreVerdict.reason === 'string' && scoreVerdict.reason.includes('score'),
    scoreVerdict.reason || '');

  // Shifting when a turn happens changes the whole path from there on
  const tamperedInputs = JSON.parse(JSON.stringify(good));
  tamperedInputs.inputs[0].tick += 2;
  check('a retimed input fails verification', NS.verifyReplay(tamperedInputs).ok === false);

  const droppedInput = JSON.parse(JSON.stringify(good));
  droppedInput.inputs.pop();
  check('a dropped input fails verification', NS.verifyReplay(droppedInput).ok === false);

  const tamperedFingerprint = JSON.parse(JSON.stringify(good));
  tamperedFingerprint.result.fingerprint = 'deadbeef';
  check('a forged fingerprint fails verification',
    NS.verifyReplay(tamperedFingerprint).ok === false);

  // Versioning
  const futureVersion = JSON.parse(JSON.stringify(good));
  futureVersion.version = NS.REPLAY_VERSION + 1;
  check('a future version is rejected', NS.isReplayPlayable(futureVersion) === false);
  check('and rejected with a reason mentioning the version',
    String(NS.validateReplay(futureVersion)).includes('version'),
    String(NS.validateReplay(futureVersion)));
  check('a future version never plays', NS.verifyReplay(futureVersion).ok === false);
  check('playback throws rather than guessing', (() => {
    try { NS.createPlayback(futureVersion); return false; } catch (e) { return true; }
  })());

  const noVersion = JSON.parse(JSON.stringify(good));
  delete noVersion.version;
  check('a version-less replay is rejected', NS.isReplayPlayable(noVersion) === false);

  // Malformed input
  for (const [label, value] of [
    ['null', null],
    ['a string', 'not a replay'],
    ['an empty object', {}],
    ['a number', 42],
    ['an array', []],
  ]) {
    check(`${label} is rejected safely`, NS.isReplayPlayable(value) === false);
  }

  const badMode = JSON.parse(JSON.stringify(good));
  badMode.config.mode = 'nonsense';
  check('an unknown mode is rejected', NS.isReplayPlayable(badMode) === false);

  const badDifficulty = JSON.parse(JSON.stringify(good));
  badDifficulty.config.difficulty = 'nonsense';
  check('an unknown difficulty is rejected', NS.isReplayPlayable(badDifficulty) === false);

  const badInput = JSON.parse(JSON.stringify(good));
  badInput.inputs = [{ tick: 3, dir: 'sideways' }];
  check('an impossible direction is rejected', NS.isReplayPlayable(badInput) === false);

  const negativeTick = JSON.parse(JSON.stringify(good));
  negativeTick.inputs = [{ tick: -5, dir: 'up' }];
  check('a negative tick is rejected', NS.isReplayPlayable(negativeTick) === false);

  // Serialisation round-trip
  const text = NS.serialiseReplay(good);
  const parsed = NS.parseReplay(text);
  check('a replay survives a JSON round-trip',
    parsed !== null && NS.verifyReplay(parsed).ok);
  check('parseReplay rejects broken JSON', NS.parseReplay('{ not json') === null);
  check('parseReplay rejects an empty string', NS.parseReplay('') === null);
  check('parseReplay rejects a non-string', NS.parseReplay(null) === null);
  check('parseReplay rejects valid JSON that is not a replay',
    NS.parseReplay('{"hello":"world"}') === null);

  // Divergence reporting
  check('an identical replay reports no divergence',
    NS.findDivergence(good, good) === null);
}

section('daily challenge: deterministic from the UTC date');
{
  const NS = pure.NS;

  check('a date maps to a stable seed',
    NS.dailySeed('2026-09-16') === NS.dailySeed('2026-09-16'));
  check('different dates map to different seeds',
    NS.dailySeed('2026-09-16') !== NS.dailySeed('2026-09-17'));
  check('the seed is a uint32', (() => {
    const s = NS.dailySeed('2026-09-16');
    return Number.isInteger(s) && s >= 0 && s <= 0xffffffff;
  })());

  // UTC, not local time
  const lateUtc = new Date(Date.UTC(2026, 8, 16, 23, 59, 59));
  const earlyUtc = new Date(Date.UTC(2026, 8, 16, 0, 0, 1));
  check('any time on a UTC day gives the same key',
    NS.dailyDateKey(lateUtc) === NS.dailyDateKey(earlyUtc));
  check('the key is YYYY-MM-DD', NS.dailyDateKey(lateUtc) === '2026-09-16',
    NS.dailyDateKey(lateUtc));
  check('crossing UTC midnight changes the challenge',
    NS.dailyDateKey(new Date(Date.UTC(2026, 8, 17, 0, 0, 1))) === '2026-09-17');
  check('months and days are zero-padded',
    NS.dailyDateKey(new Date(Date.UTC(2026, 0, 5))) === '2026-01-05');

  const challenge = NS.dailyChallenge(new Date(Date.UTC(2026, 8, 16)));
  check('the challenge names its date', challenge.date === '2026-09-16');
  check('the challenge carries a seed', challenge.seed === NS.dailySeed('2026-09-16'));
  check('the challenge uses the daily mode', challenge.mode === 'daily');
  check('difficulty is pinned so everyone plays the same board',
    challenge.difficulty === NS.DAILY_DIFFICULTY);

  check('the label is human-readable', NS.dailyLabel('2026-09-16') === '16 Sep 2026',
    NS.dailyLabel('2026-09-16'));
  check('a malformed date label degrades gracefully',
    typeof NS.dailyLabel('nonsense') === 'string');

  // The whole point: the same date produces the same board
  function firstFoodsFor(seed) {
    const t = makeEngine({ seed, mode: 'daily' });
    t.engine.start();
    const foods = [`${t.engine.state.food.x},${t.engine.state.food.y}`];
    for (let i = 0; i < 20; i += 1) t.engine.tick();
    foods.push(`${t.engine.state.food.x},${t.engine.state.food.y}`);
    return foods.join(' ');
  }
  const todaySeed = NS.dailySeed('2026-09-16');
  check("the same date lays out the same board",
    firstFoodsFor(todaySeed) === firstFoodsFor(todaySeed));
  check('a different date lays out a different board',
    firstFoodsFor(todaySeed) !== firstFoodsFor(NS.dailySeed('2026-09-17')));

  check('the daily mode exists in the mode table', Boolean(pure.NS.MODES.daily));
  check('the daily mode is flagged', pure.NS.MODES.daily.daily === true);
  check('daily.js never calls Math.random',
    !/Math\.random/.test(codeOf('js/core/daily.js')));
  check('rng.js is the only place gameplay randomness starts',
    !/Math\.random/.test(codeOf('js/core/engine.js')));
}

/* ========================================================================== *
 * H. Phase 2 through the browser layer — storage, ghost, daily UI
 * ========================================================================== */

section('persistence: best replay and daily results');
{
  const store = new Map();
  const app = boot({ store });
  const NS = app.ns;

  // Build a genuine replay by driving a real engine
  const engine = NS.createEngine({ seed: 123, mode: 'classic', difficulty: 'normal' });
  const recorder = NS.createRecorder(engine);
  engine.start();
  recorder.start();
  if (engine.queueTurn('up')) recorder.onTurn('up');
  for (let i = 0; i < 6; i += 1) engine.tick();
  const replay = recorder.finish();

  check('a fresh profile has no ghost', NS.loadBestReplay('classic') === null);
  check('a verified replay is stored', NS.saveBestReplay(replay) === true);
  check('and comes back', NS.loadBestReplay('classic') !== null);
  check('what comes back still verifies', NS.verifyReplay(NS.loadBestReplay('classic')).ok);
  check('it is stored under a namespaced key',
    store.has('noodle.replay.best.classic'), [...store.keys()].join(', '));

  // Only a better run replaces it
  const worse = JSON.parse(JSON.stringify(replay));
  worse.result.score = replay.result.score - 10;
  check('a worse run does not replace the best', NS.saveBestReplay(worse) === false);

  // A replay that cannot reproduce must never become a ghost
  const broken = JSON.parse(JSON.stringify(replay));
  broken.result.score = 999999;
  check('an unverifiable replay is refused', NS.saveBestReplay(broken) === false);
  check('a malformed replay is refused', NS.saveBestReplay({ version: 1 }) === false);
  check('null is refused', NS.saveBestReplay(null) === false);

  // Corrupt storage must never break loading
  store.set('noodle.replay.best.classic', '{ broken json');
  check('corrupt ghost JSON loads as no ghost', NS.loadBestReplay('classic') === null);
  store.set('noodle.replay.best.classic', JSON.stringify({ version: 999, seed: 1 }));
  check('an unsupported ghost version loads as no ghost',
    NS.loadBestReplay('classic') === null);
  store.set('noodle.replay.best.classic', JSON.stringify(replay));
  check('a mismatched difficulty is not used as a ghost',
    NS.loadBestReplay('classic', { difficulty: 'hard' }) === null);
  check('a matching configuration is used',
    NS.loadBestReplay('classic', { difficulty: 'normal', gridSize: 20 }) !== null);

  // Daily results
  check('no daily result on a fresh profile', NS.getDailyResult('2026-09-16') === null);
  check('a daily result saves', NS.saveDailyResult('2026-09-16', 120) === true);
  check('and reads back', NS.getDailyResult('2026-09-16').score === 120);
  check('it records completion', NS.getDailyResult('2026-09-16').completed === true);
  check('a better score replaces it', NS.saveDailyResult('2026-09-16', 200) === true);
  check('the best score is kept', NS.getDailyResult('2026-09-16').score === 200);
  check('a worse score does not replace it',
    NS.saveDailyResult('2026-09-16', 50) === false &&
    NS.getDailyResult('2026-09-16').score === 200);
  check('a second date is kept separately',
    NS.saveDailyResult('2026-09-17', 10) === true &&
    NS.getDailyResult('2026-09-16').score === 200);
  check('a malformed date is refused', NS.saveDailyResult('not-a-date', 10) === false);
  check('a non-numeric score is refused', NS.saveDailyResult('2026-09-18', NaN) === false);

  store.set('noodle.daily.v1', '{ broken');
  check('corrupt daily JSON reads as empty', Object.keys(NS.loadDailyResults()).length === 0);
  store.set('noodle.daily.v1', JSON.stringify({ 'bad-key': { score: 5 }, '2026-01-01': { score: 7 } }));
  const cleaned = NS.loadDailyResults();
  check('junk entries are dropped, good ones kept',
    cleaned['2026-01-01'] && !cleaned['bad-key'], Object.keys(cleaned).join(', '));
  store.set('noodle.daily.v1', JSON.stringify([1, 2, 3]));
  check('an array reads as empty', Object.keys(NS.loadDailyResults()).length === 0);
}

section('ghost: races the player without touching them');
{
  const store = new Map();
  const app = boot({ store });
  const NS = app.ns;

  // Record a ghost-worthy run
  const engine = NS.createEngine({ seed: 777, mode: 'classic', difficulty: 'normal' });
  const recorder = NS.createRecorder(engine);
  engine.start();
  recorder.start();
  if (engine.queueTurn('up')) recorder.onTurn('up');
  for (let i = 0; i < 5; i += 1) engine.tick();
  const replay = recorder.finish();

  const playback = NS.createPlayback(replay);
  check('the ghost is its own engine', playback.engine !== engine);
  check('the ghost starts at tick 0', playback.engine.state.tick === 0);

  const playerBefore = engine.fingerprint();
  for (let i = 0; i < 5; i += 1) playback.step();
  check('advancing the ghost leaves the player untouched',
    engine.fingerprint() === playerBefore);
  check('the ghost followed its replay',
    playback.engine.state.tick > 0 && playback.engine.fingerprint() === replay.result.fingerprint,
    `${playback.engine.fingerprint()} vs ${replay.result.fingerprint}`);

  check('the ghost stops when its replay ends', playback.done() === true);
  const restingTick = playback.engine.state.tick;
  playback.step();
  check('stepping a finished ghost does nothing',
    playback.engine.state.tick === restingTick);

  check('ghost and player keep separate RNG states', (() => {
    const fresh = NS.createPlayback(replay);
    fresh.step();
    return fresh.engine.getRngState() !== undefined;
  })());

  // Through the renderer: setGhost takes positions, never an engine
  const r2d = codeOf('js/render/renderer2d.js');
  const r3d = codeOf('js/render/renderer3d.js');
  check('both renderers accept a ghost',
    r2d.includes('setGhost(') && r3d.includes('setGhost('));
  check('neither renderer imports the replay module',
    !/createPlayback|createRecorder/.test(r2d) && !/createPlayback|createRecorder/.test(r3d));
  check('the ghost view is positions only',
    !/ghost\.engine/.test(r2d) && !/ghostView\.engine/.test(r3d));

  // A corrupt ghost must not stop the game from starting
  store.set('noodle.replay.best.classic', '{{{ garbage');
  let crashed = null;
  let survivor = null;
  try {
    survivor = boot({ store });
    survivor.click('btn-play');
    survivor.steps(5);
  } catch (error) { crashed = error; }
  check('a corrupt stored ghost does not break startup', !crashed, crashed && crashed.message);
  check('and the game still plays', survivor && survivor.state() === 'PLAYING',
    survivor ? survivor.state() : 'no boot');
}

section('daily challenge through the UI');
{
  const store = new Map();
  const app = boot({ store });
  pinFoodFor(app);

  app.pick('modes', 'daily');
  check('the daily mode can be selected', app.engine().state.mode.id === 'daily',
    app.engine().state.mode.id);
  check('the daily banner is shown', app.registry.get('menu-daily').hidden === false);
  check('the banner names a date',
    /\d{4}|\d+ \w+ \d{4}/.test(app.text('menu-daily-date')), app.text('menu-daily-date'));
  check('the difficulty picker is hidden for the daily board',
    app.containers['.difficulties'].hidden === true);

  app.click('btn-play');
  check('the daily challenge starts', app.state() === 'PLAYING', app.state());
  check('it is seeded from today, not at random',
    app.engine().getSeed() === app.ns.dailyChallenge().seed,
    `${app.engine().getSeed()} vs ${app.ns.dailyChallenge().seed}`);
  check('it is pinned to the daily difficulty',
    app.engine().state.difficulty.id === app.ns.DAILY_DIFFICULTY,
    app.engine().state.difficulty.id);

  // Two runs of today's challenge must lay out the same board
  const firstFood = JSON.stringify(app.engine().state.food);
  app.click('btn-menu');
  app.click('btn-play');
  check('replaying today gives the same board',
    JSON.stringify(app.engine().state.food) === firstFood,
    `${JSON.stringify(app.engine().state.food)} vs ${firstFood}`);

  // Non-daily modes stay random
  app.click('btn-menu');
  app.pick('modes', 'classic');
  app.click('btn-play');
  // Math.random is pinned to 0 elsewhere in this file so food placement is
  // predictable; seeds need real variation, so vary it just here.
  const pinnedRandom = Math.random;
  let spin = 0;
  Math.random = () => { spin += 0.37; return spin % 1; };
  app.click('btn-menu');
  app.click('btn-play');
  const seedA = app.engine().getSeed();
  app.click('btn-menu');
  app.click('btn-play');
  const seedB = app.engine().getSeed();
  Math.random = pinnedRandom;
  check('classic mode still gets a fresh seed each run',
    seedA !== seedB, `${seedA} vs ${seedB}`);
  check('the daily banner hides outside daily mode',
    app.registry.get('menu-daily').hidden === true);
  check('the difficulty picker comes back',
    app.containers['.difficulties'].hidden === false);
}

section('a full run records, stores and verifies');
{
  // Deliberately NOT pinned: this exercises the real pipeline, where food
  // comes from the seeded RNG and the replay must reproduce it exactly.
  const store = new Map();
  const app = boot({ store });

  app.click('btn-play');
  app.press('ArrowUp');
  for (let i = 0; i < 80 && app.state() === 'PLAYING'; i += 1) app.steps(1);
  check('the run ended on its own', app.state() === 'GAME_OVER', app.state());

  const stored = app.ns.loadBestReplay('classic', { difficulty: 'normal', gridSize: 20 });
  check('the finished run was stored as a replay', stored !== null);
  if (stored) {
    check('the stored replay carries the run seed',
      stored.seed === app.engine().getSeed(),
      `${stored.seed} vs ${app.engine().getSeed()}`);
    check('the stored replay captured the turn', stored.inputs.length === 1,
      String(stored.inputs.length));
    const verdict = app.ns.verifyReplay(stored);
    check('the stored replay reproduces the real run', verdict.ok, verdict.reason || '');
    check('replaying reaches the same score',
      verdict.actual && verdict.actual.score === stored.result.score,
      verdict.actual ? String(verdict.actual.score) : 'no result');
    check('replaying reaches the same death',
      verdict.actual && verdict.actual.cause === stored.result.cause,
      verdict.actual ? verdict.actual.cause : 'no result');
  }
}

section('renderers cannot influence the simulation');
{
  // Same seed, same inputs, through both renderers: the engine must agree.
  function runThrough(options) {
    const app = boot(Object.assign({ store: new Map() }, options));
    pinFoodFor(app);
    app.click('btn-play');
    app.engine().setSeed(1234);
    app.engine().start();
    app.press('ArrowUp');   app.steps(6);
    app.press('ArrowLeft'); app.steps(6);
    return {
      fingerprint: app.engine().fingerprint(),
      score: app.engine().state.score,
      renderer: app.game().renderer.id,
    };
  }

  const via2d = runThrough({});
  const via3d = runThrough({ webgl: true, withThree: true });

  check('the 2D path really used the Canvas renderer', via2d.renderer === '2d', via2d.renderer);
  check('the 3D path really used the Three.js renderer', via3d.renderer === '3d', via3d.renderer);
  check('both renderers produce an identical simulation',
    via2d.fingerprint === via3d.fingerprint,
    `2d ${via2d.fingerprint} vs 3d ${via3d.fingerprint}`);
  check('and an identical score', via2d.score === via3d.score);
}


/* ========================================================================== *
 * I. Mobile pass — small screens, portrait, landscape, touch targets
 * ========================================================================== */

section('mobile: the Phase 2 UI is covered at every breakpoint');
{
  const cssText = fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8');

  /** The body of a media query, so a rule can be checked inside it. */
  function mediaBlock(query) {
    const out = [];
    let index = 0;
    for (;;) {
      const at = cssText.indexOf(`@media ${query}`, index);
      if (at < 0) break;
      const open = cssText.indexOf('{', at);
      let depth = 0;
      let i = open;
      for (; i < cssText.length; i += 1) {
        if (cssText[i] === '{') depth += 1;
        else if (cssText[i] === '}') { depth -= 1; if (depth === 0) break; }
      }
      out.push(cssText.slice(open, i));
      index = i;
    }
    return out.join('\n');
  }

  const phone = mediaBlock('(max-width: 640px)');
  const shortPhone = mediaBlock('(max-width: 640px) and (max-height: 720px)');
  const landscape = mediaBlock('(orientation: landscape) and (max-height: 600px)');
  const coarse = mediaBlock('(pointer: coarse)');

  check('a phone breakpoint exists', phone.length > 0);
  check('a short-phone breakpoint exists', shortPhone.length > 0);
  check('a landscape breakpoint exists', landscape.length > 0);
  check('a coarse-pointer breakpoint exists', coarse.length > 0);

  // Every element added in Phase 2 must be sized for a phone
  for (const selector of ['.overlay__card--menu', '.chip', '.menu-daily',
    '.menu-ghost', '.menu-best', '.ghost-flag']) {
    check(`phone rules cover ${selector}`, phone.includes(selector), selector);
  }
  for (const selector of ['.overlay__card--menu', '.chip', '.menu-daily', '.menu-ghost']) {
    check(`landscape rules cover ${selector}`, landscape.includes(selector), selector);
  }

  // The menu card must actually be able to shrink
  check('the menu card scrolls rather than clipping',
    /\.overlay__card--menu \{[^}]*overflow-y: auto/.test(cssText));
  check('the menu card is height-capped to the board',
    /\.overlay__card--menu \{[^}]*max-height: 100%/.test(cssText));
  check('the blurb is dropped on phones to make room',
    /\.overlay__card--menu \.overlay__text \{ display: none; \}/.test(phone));
  check('and dropped in landscape too',
    /\.overlay__card--menu \.overlay__text \{ display: none; \}/.test(landscape));

  // Hiding the section headings must not cost the chip groups their name
  check('section headings are visually hidden, not removed',
    phone.includes('.menu-section__title') && /clip-path: inset\(50%\)/.test(phone),
    'headings appear to be display:none');
  check('the chip groups are still labelled in the markup', (() => {
    const html = fs.readFileSync(path.join(PROJECT, 'play.html'), 'utf8');
    return /class="chips modes"[^>]*aria-labelledby="modes-label"/.test(html) &&
      /class="chips difficulties"[^>]*aria-labelledby="difficulty-label"/.test(html);
  })());

  // Five modes have to fit without becoming a three-row stack
  check('mode chips go three-up on phones',
    /\.modes \.chip \{ flex: 1 1 30%; \}/.test(phone));
  check('six controls fit in a three-column grid',
    /\.controls \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/.test(phone));

  // These two keep the height budget below honest: if the CSS stops hiding
  // them, the budget model above is wrong and this catches it.
  check('the Daily note is dropped on phones',
    /\.menu-daily__note \{ display: none; \}/.test(phone));
  check('the ghost line is dropped on short phones (the in-game flag covers it)',
    /\.menu-ghost \{ display: none; \}/.test(shortPhone));
}

section('mobile: touch targets');
{
  const cssText = fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8');
  const coarseStart = cssText.indexOf('@media (pointer: coarse)');
  const coarse = cssText.slice(coarseStart, cssText.indexOf('}\n', cssText.indexOf('.nav__link', coarseStart)));

  /** Pull a min-height out of a coarse-pointer rule. */
  function minHeightFor(selector) {
    const rule = new RegExp(`\\${selector} \\{ min-height: (\\d+)px; \\}`);
    const found = coarse.match(rule);
    return found ? Number(found[1]) : 0;
  }

  check('control buttons reach 44px on touch', minHeightFor('.controls .btn') >= 44,
    String(minHeightFor('.controls .btn')));
  check('theme chips reach 44px on touch', minHeightFor('.theme-btn') >= 44,
    String(minHeightFor('.theme-btn')));
  check('d-pad buttons reach 44px on touch', minHeightFor('.dpad__btn') >= 44,
    String(minHeightFor('.dpad__btn')));
  check('menu chips reach at least 40px on touch', minHeightFor('.chip') >= 40,
    String(minHeightFor('.chip')));

  // The d-pad is the primary control: it must stay large at every phone size
  const dpadSizes = [...cssText.matchAll(/\.dpad \{[^}]*minmax\((\d+)px/g)].map((m) => Number(m[1]));
  check('the d-pad never drops below 48px per key',
    dpadSizes.length > 0 && dpadSizes.every((v) => v >= 48), dpadSizes.join(', '));
}

section('mobile: the menu fits the board');
{
  /*
   * A height budget, not a pixel-perfect layout. Each entry is the vertical
   * space a block takes at the phone breakpoint, read from style.css. The point
   * is to catch the menu growing past the board again, which is exactly what
   * happened when the Daily banner and ghost note were added.
   */
  function menuHeight({ daily, shortPhone }) {
    const pad = shortPhone ? 10 + 12 : 14 + 16;
    const kicker = shortPhone ? 22 : 24;
    const title = (shortPhone ? 6 : 8) + (shortPhone ? 22 : 26);
    const play = (shortPhone ? 10 : 12) + 50;          // min-height 44 + border
    const chipRow = shortPhone ? 38 : 40;
    const modes = (shortPhone ? 8 : 10) + chipRow * 2 + 6;   // 5 chips, 3-up
    const difficulty = daily ? 0 : (shortPhone ? 8 : 10) + chipRow;
    const best = (shortPhone ? 9 : 12) + 20;
    // The note is hidden on every phone, so the banner is label + date only
    const banner = daily ? (shortPhone ? 8 + 46 : 10 + 58) : 0;
    // The ghost line is hidden on short phones; the in-game flag replaces it
    const ghost = shortPhone ? 0 : 8 + 20;
    return pad + kicker + title + play + modes + difficulty + best + banner + ghost;
  }

  // Board height = min(100% of width, 70dvh)
  const boards = [
    { name: '390x844 (iPhone 12)', board: Math.min(390 - 20, 844 * 0.7), shortPhone: false },
    { name: '360x640 (small Android)', board: Math.min(360 - 20, 640 * 0.7), shortPhone: true },
    { name: '320x568 (iPhone SE)', board: Math.min(320 - 20, 568 * 0.7), shortPhone: true },
  ];

  for (const device of boards) {
    const usable = device.board - 28;            // overlay padding
    for (const daily of [false, true]) {
      const needed = menuHeight({ daily, shortPhone: device.shortPhone });
      const overflow = Math.max(0, Math.round(needed - usable));
      check(`${device.name}${daily ? ' (daily)' : ''}: menu overflows by < 40px`,
        overflow < 40, `${overflow}px over (needs ${Math.round(needed)}, has ${Math.round(usable)})`);
    }
  }

  /*
   * Landscape: the board is sized by height, so this is the tightest the
   * menu ever gets. Values read from the landscape block in style.css.
   */
  function landscapeMenuHeight(daily) {
    const pad = 10 + 12;
    const kicker = 20;
    const title = 4 + 20;
    const play = 12 + 50;
    const modes = 7 + 36 * 2 + 5;          // 5 chips, three-up
    const difficulty = daily ? 0 : 7 + 36;
    const best = 8 + 18;
    const banner = daily ? 7 + 46 : 0;     // note hidden
    return pad + kicker + title + play + modes + difficulty + best;
  }

  for (const device of [
    { name: '844x390 landscape', w: 844, h: 390 },
    { name: '740x360 landscape', w: 740, h: 360 },
  ]) {
    const board = Math.min(device.w * 0.58, device.h * 0.78);
    const usable = board - 20;
    for (const daily of [false, true]) {
      const needed = landscapeMenuHeight(daily) + (daily ? 53 : 0);
      const overflow = Math.max(0, Math.round(needed - usable));
      check(`${device.name}${daily ? ' (daily)' : ''}: menu overflows by < 40px`,
        overflow < 40, `${overflow}px over (needs ${needed}, has ${Math.round(usable)})`);
    }
  }

  check('the ghost line is dropped in landscape too',
    /.menu-ghost { display: none; }/.test(
      fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8')
        .slice(fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8')
          .indexOf('@media (orientation: landscape) and (max-height: 600px)'))));

  // The Play button must be reachable without scrolling at all
  for (const device of boards) {
    const pad = device.shortPhone ? 10 : 14;
    const kicker = device.shortPhone ? 22 : 24;
    const title = (device.shortPhone ? 6 : 8) + (device.shortPhone ? 22 : 26);
    const toPlayBottom = pad + kicker + title + (device.shortPhone ? 10 : 12) + 50;
    check(`${device.name}: Play is above the fold without scrolling`,
      toPlayBottom <= device.board - 28,
      `${Math.round(toPlayBottom)} vs ${Math.round(device.board - 28)}`);
  }
}

section('mobile: the ghost flag');
{
  const html = fs.readFileSync(path.join(PROJECT, 'play.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8');

  check('the ghost flag exists in the markup', /id="ghost-flag"/.test(html));
  check('it sits inside the board', (() => {
    const board = html.slice(html.indexOf('id="board-wrap"'), html.indexOf('</div>\n\n        <!-- ---'));
    return board.includes('ghost-flag');
  })() || html.indexOf('ghost-flag') > html.indexOf('id="board-wrap"'));
  check('it is decorative for screen readers',
    /id="ghost-flag" aria-hidden="true"|class="ghost-flag" id="ghost-flag" aria-hidden="true"/.test(html));
  check('it never intercepts taps', /\.ghost-flag \{[^}]*pointer-events: none/.test(cssText));
  check('it is hidden outside play',
    /body:not\(\[data-state="PLAYING"\]\) \.ghost-flag \{ opacity: 0; \}/.test(cssText));
  check('it has a phone size', /@media[^@]*\.ghost-flag \{[^}]*font-size: 0\.64rem/.test(cssText));

  // Behaviour: the flag follows whether a ghost is actually running
  const store = new Map();
  const app = boot({ store });
  const NS = app.ns;

  app.click('btn-play');
  app.steps(3);
  check('no flag when there is no ghost',
    app.registry.get('ghost-flag').classes.has('is-visible') === false);

  // Record a genuine run, store it, then start again
  const engine = NS.createEngine({ seed: 4242, mode: 'classic', difficulty: 'normal' });
  const rec = NS.createRecorder(engine);
  engine.start();
  rec.start();
  if (engine.queueTurn('up')) rec.onTurn('up');
  for (let i = 0; i < 6; i += 1) engine.tick();
  const saved = NS.saveBestReplay(rec.finish());
  check('a ghost-worthy replay was stored', saved === true);

  const second = boot({ store });
  second.click('btn-play');
  second.steps(2);
  check('the flag appears once a ghost is racing',
    second.registry.get('ghost-flag').classes.has('is-visible') === true,
    [...second.registry.get('ghost-flag').classes].join(' '));
  check('the ghost is actually rendered', second.game().renderer.id !== undefined);

  // It must go away when the ghost's replay runs out
  for (let i = 0; i < 40; i += 1) second.steps(1);
  check('the flag clears when the ghost finishes or the run ends',
    second.state() !== 'PLAYING' ||
    second.registry.get('ghost-flag').classes.has('is-visible') === false,
    `${second.state()}`);
}

section('mobile: 3D is cheaper on small touch screens');
{
  const code = codeOf('js/render/renderer3d.js');
  check('the renderer takes a low-power hint', /opts\.lowPower/.test(code));
  check('shadows are gated behind it', /const shadows = !reduced && !lowPower/.test(code));
  check('nothing still keys shadows off reduced-motion alone',
    !/castShadow = !reduced|shadowMap\.enabled = !reduced/.test(code));
  check('the shadow map shrinks without shadows',
    /mapSize\.set\(shadows \? 1024 : 512/.test(code));

  const mainCode = codeOf('js/main.js');
  check('main.js detects coarse pointers', /pointer: coarse/.test(mainCode));
  check('and only applies it to small screens', /innerWidth <= 640/.test(mainCode));
  check('the hints reach the 3D renderer',
    /createRenderer3D\(canvas, \{ reduced, lowPower, compact \}\)/.test(mainCode));

  // It must still build a working scene with the hint on
  const low = boot({ webgl: true, withThree: true, store: new Map() });
  check('3D still initialises', low.game().renderer.id === '3d', low.game().renderer.id);
  low.click('btn-play');
  low.frame(16);
  check('and still renders', (low.counts.glRenders || 0) > 0);
}

section('mobile: the game is playable with touch alone');
{
  const app = boot({ store: new Map() });

  // Everything needed to start and play must be reachable without a keyboard
  app.pick('modes', 'daily');
  check('a mode can be chosen by tapping', app.engine().state.mode.id === 'daily');
  app.pick('modes', 'classic');
  app.click('btn-play');
  check('the game starts from a tap', app.state() === 'PLAYING', app.state());

  for (const dir of ['up', 'left', 'down', 'right']) {
    app.tap(dir);
    app.steps(1);
  }
  check('all four d-pad keys steer', app.state() === 'PLAYING', app.state());

  app.click('btn-pause');
  check('pause is reachable by tap', app.state() === 'PAUSED', app.state());
  app.click('btn-pause');
  check('resume is reachable by tap', app.state() === 'PLAYING', app.state());
  app.click('btn-menu');
  check('the menu is reachable by tap', app.screen() === 'menu', app.screen());

  // The d-pad must not be disabled while playing
  app.click('btn-play');
  const pad = app.containers['.dpad'].children;
  check('the d-pad is enabled during play', pad.every((b) => b.disabled === false));
  app.press('ArrowUp');
  for (let i = 0; i < 80 && app.state() === 'PLAYING'; i += 1) app.steps(1);
  check('the d-pad is disabled after game over', pad.every((b) => b.disabled === true));
}



/* ========================================================================== *
 * J. 3D depth pass — camera framing, vertical undulation, instanced floor
 * ========================================================================== */

section('3D: camera framing');
{
  const code = codeOf('js/render/renderer3d.js');

  check('the camera angle is derived, not hardcoded',
    /ELEVATION_DEG/.test(code) && /Math\.sin\(elevation\)/.test(code));
  check('small viewports keep a higher angle',
    /const ELEVATION_DEG = compact \? 46 : 42;/.test(code));
  check('and a wider lens than before', /const FIELD_OF_VIEW = compact \? 58 : 60;/.test(code));
  check('the far plane grew with the distance', /0\.5, 140\)/.test(code));
  check('the follow drift was reduced for the lower angle',
    /const follow = reduced \? 0 : 0\.15;/.test(code));

  /*
   * The framing has to survive the follow drift. Recompute it here from the
   * same numbers the renderer uses: if someone lowers the camera further
   * without re-checking, the board would slide out of frame.
   */
  function framing(elevationDeg, fovDeg, distanceFactor) {
    const grid = 20;
    const half = grid / 2;
    const e = (elevationDeg * Math.PI) / 180;
    const d = grid * distanceFactor;
    const cam = { y: d * Math.sin(e), z: d * Math.cos(e) };
    const halfFov = (fovDeg / 2) * Math.PI / 180;

    // Widest thing in frame is the near edge of the board
    const rNear = Math.hypot(cam.y, half - cam.z);
    const halfWidthVisible = rNear * Math.tan(halfFov);

    const angle = (vy, vz) => Math.atan2(vy, -vz);
    const vertical = Math.abs(
      angle(-cam.y, -half - cam.z) - angle(-cam.y, half - cam.z)
    );

    const nearDist = Math.hypot(cam.y, half - cam.z);
    const farDist = Math.hypot(cam.y, -half - cam.z);

    return {
      horizontalSlack: halfWidthVisible - half,
      verticalSlack: (2 * halfFov - vertical) * 180 / Math.PI,
      perspective: farDist / nearDist,
      fill: (vertical / (2 * halfFov)) * 100,
    };
  }

  // The follow moves the look-at point by up to 0.15 * 10 cells
  const FOLLOW_DRIFT = 1.6;

  for (const [label, elev, fov, dist] of [
    ['desktop', 42, 60, 1.319],
    ['compact', 46, 58, 1.33],
  ]) {
    const f = framing(elev, fov, dist);
    check(`${label}: the board fits horizontally with room for the follow`,
      f.horizontalSlack >= FOLLOW_DRIFT,
      `${f.horizontalSlack.toFixed(2)} cells of slack, need ${FOLLOW_DRIFT}`);
    check(`${label}: the board fits vertically`, f.verticalSlack > 0,
      `${f.verticalSlack.toFixed(1)}deg spare`);
    check(`${label}: the board still fills a useful share of the frame`,
      f.fill >= 45, `${f.fill.toFixed(0)}%`);
  }

  /*
   * The previous framing (51.2 deg / 46 fov at grid*1.308) had NEGATIVE
   * horizontal slack: the near edge of the board was clipped, and the
   * follow drift pushed it further out. Both of those are fixed here, and
   * the new framing is measurably deeper as well.
   */
  const before = framing(51.2, 46, Math.hypot(1.02, 0.82));
  const desktop = framing(42, 60, 1.319);
  const compact = framing(46, 58, 1.33);

  check('the old framing really did clip the board', before.horizontalSlack < 0,
    `${before.horizontalSlack.toFixed(2)} cells`);
  check('the new desktop framing does not', desktop.horizontalSlack >= FOLLOW_DRIFT,
    `${desktop.horizontalSlack.toFixed(2)} cells`);
  check('nor the compact one', compact.horizontalSlack >= FOLLOW_DRIFT,
    `${compact.horizontalSlack.toFixed(2)} cells`);

  check('desktop perspective is stronger than before',
    desktop.perspective > before.perspective,
    `${desktop.perspective.toFixed(2)}x vs ${before.perspective.toFixed(2)}x`);
  check('compact perspective is stronger than before',
    compact.perspective > before.perspective,
    `${compact.perspective.toFixed(2)}x vs ${before.perspective.toFixed(2)}x`);
  check('desktop gets the deeper of the two',
    desktop.perspective > compact.perspective,
    `${desktop.perspective.toFixed(2)}x vs ${compact.perspective.toFixed(2)}x`);
}

section('3D: the noodle undulates vertically');
{
  const code = codeOf('js/render/renderer3d.js');

  check('segments lift off the floor', /const lift = reduced \? 0/.test(code));
  check('lift is one-sided, so nothing sinks through the floor',
    /Math\.sin\(phase\) \* 0\.5 \+ 0\.5/.test(code));
  check('each sample rests at its own radius',
    /radius \+ lift,/.test(code));
  check('sway is perpendicular to the spline, not fixed to one axis',
    /sideX = -dz \/ len/.test(code) && /sideZ = dx \/ len/.test(code));
  check('the body follows a spline, so corners round off',
    /new THREE\.CatmullRomCurve3/.test(code));
  check('and is sampled more finely than the grid',
    /SAMPLES_PER_CELL = [2-9]/.test(code));
  check('a wrap breaks the spline instead of drawing across the board',
    /emitRun\(runStart, i - 1\)/.test(code));
  check('the head eases toward the spline heading rather than snapping',
    /headYaw \+= delta \* ease/.test(code));
  check('and banks into the turn', /headBank \+=/.test(code));
  check('the old always-along-z wobble is gone', !/z \+ wobble \* 0\.15/.test(code));
  check('reduced motion flattens it', /const lift = reduced \? 0/.test(code) &&
    /const sway = reduced \? 0/.test(code));

  // The lift range must keep the body above the tile tops (y = 0)
  const RADIUS_NECK = 0.84 / 2;
  const RADIUS_TAIL = (0.84 - 0.42) / 2;
  for (const [label, radius] of [['neck', RADIUS_NECK], ['tail', RADIUS_TAIL]]) {
    const lowest = radius + 0;          // lift bottoms out at 0
    check(`${label} never sinks below the floor`, lowest - radius >= 0,
      `bottom at ${(lowest - radius).toFixed(2)}`);
  }
  const highest = RADIUS_NECK + 0.3 * 1.0;
  check('the body stays below the food at full lift', highest < 0.72 + 0.12,
    `${highest.toFixed(2)} vs food at ~0.72`);
}

section('3D: the floor is instanced geometry');
{
  const code = codeOf('js/render/renderer3d.js');

  check('the painted checker texture is gone', !/buildBoardTexture/.test(code));
  check('no CanvasTexture is created for the floor', !/CanvasTexture/.test(code));
  check('the floor is built from InstancedMesh',
    /new THREE\.InstancedMesh\(geo\.slab/.test(code));
  check('there are two, one per checker parity',
    /tilesLight = new THREE\.InstancedMesh/.test(code) &&
    /tilesDark = new THREE\.InstancedMesh/.test(code));
  check('instance matrices are uploaded once',
    /instanceMatrix\.needsUpdate = true/.test(code));
  check('tiles receive shadows but do not cast them',
    /tiles\.castShadow = false/.test(code) && /tiles\.receiveShadow = shadows/.test(code));
  check('dark tiles are physically recessed', /TILE_RECESS/.test(code));
  check('tiles are built once, not per frame',
    !/new THREE\.InstancedMesh/.test(code.slice(code.indexOf('function layoutSnake'))));
  check('a theme change is a material swap, not a rebuild',
    /tilesLight\.material = toon\(theme\.board1\)/.test(code));
  check('tiles are disposed', /tilesLight\.dispose\(\)/.test(code) &&
    /tilesDark\.dispose\(\)/.test(code));

  // Build the real scene and count what actually got created
  const app = boot({ webgl: true, withThree: true, store: new Map() });
  const THREE = app.THREE;
  check('three.js exposes InstancedMesh', typeof THREE.InstancedMesh === 'function');
  check('the 3D renderer initialised', app.game().renderer.id === '3d', app.game().renderer.id);

  app.click('btn-play');
  app.frame(16);
  check('a frame renders with the new floor', (app.counts.glRenders || 0) > 0);

  // 400 tiles must come from exactly two instanced meshes
  const instancedCount = (app.counts['THREE.InstancedMesh'] || 0);
  check('the scene survives 200 frames with the new geometry', (() => {
    let error = null;
    try { for (let i = 0; i < 200; i += 1) app.frame(16); } catch (e) { error = e; }
    return !error;
  })());

  // Theme swaps must not rebuild geometry
  for (const id of ['spicy', 'dessert', 'alien', 'noodle']) {
    app.pick('themes', id);
    app.frame(16);
  }
  check('four theme swaps do not break the floor', app.state() !== undefined);
  check('and the game still runs', app.game().renderer.id === '3d');
}

section('3D: compact framing on small screens');
{
  // The renderer must accept the flag and still build a working scene
  const compactApp = boot({ webgl: true, withThree: true, store: new Map() });
  check('3D builds with the compact hint available', compactApp.game().renderer.id === '3d');
  compactApp.click('btn-play');
  compactApp.frame(16);
  check('and renders', (compactApp.counts.glRenders || 0) > 0);

  const mainCode = codeOf('js/main.js');
  check('main.js decides compact from the viewport', /innerWidth <= 900/.test(mainCode));
  check('compact is separate from low power',
    /const compact = window\.innerWidth <= 900;/.test(mainCode) &&
    /pointer: coarse/.test(mainCode));
}



section('mobile: the landscape nudge');
{
  const html = fs.readFileSync(path.join(PROJECT, 'play.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(PROJECT, 'style.css'), 'utf8');
  const code = codeOf('js/orientation.js');

  check('the hint exists in the markup', /id="rotate-hint"/.test(html));
  check('it starts hidden', /class="rotate-hint" id="rotate-hint" hidden/.test(html));
  check('it offers a one-tap way to get there', /id="btn-fullscreen"/.test(html));
  check('it can be dismissed', /id="btn-rotate-dismiss"/.test(html));
  check('the dismiss button has an accessible name',
    /id="btn-rotate-dismiss" aria-label="[^"]+"/.test(html));

  check('it only shows on a phone-sized portrait touch screen',
    /@media \(max-width: 900px\) and \(orientation: portrait\) and \(pointer: coarse\)/.test(cssText));
  check('it is never shown in landscape',
    /@media \(orientation: landscape\)[^@]*\.rotate-hint \{ display: none !important; \}/.test(cssText));
  check('the stage makes room for it rather than overlapping',
    /"rotate"\s*"hud"\s*"board"/.test(cssText));
  check('its animation respects reduced motion',
    /prefers-reduced-motion[^@]*\.rotate-hint__icon \{ animation: none; \}/.test(cssText));
  check('its button is a real touch target', /\.rotate-hint__go \{[^}]*min-height: 40px/.test(cssText));

  // Behaviour: both browser calls are best-effort and must not throw
  check('fullscreen is requested defensively', /requestFullscreen \|\|/.test(code));
  check('the orientation lock is optional',
    /typeof orientation\.lock === 'function'/.test(code));
  check('a refused fullscreen is caught', /await request\.call\(root\);/.test(code) &&
    /catch \(error\)/.test(code));
  check('a refused lock is caught too',
    (code.match(/catch \(error\)/g) || []).length >= 2);
  check('the dismissal is remembered', /noodle\.rotateHint\.v1/.test(code));
  check('it never touches the engine or a renderer',
    !/createEngine|renderer|THREE/.test(code));

  // It must boot without a matchMedia that reports portrait
  const app = boot({ store: new Map() });
  check('the game boots with the nudge present', app.state() === 'READY', app.state());
  check('the hint stays hidden when the media query does not match',
    app.registry.get('rotate-hint').hidden === true);
  check('dismissing persists', (() => {
    const nudge = app.ns.createOrientationNudge();
    nudge.dismiss();
    return app.store.get('noodle.rotateHint.v1') === 'true';
  })());
}


/* ========================================================================== *
 * K. The jungle world
 * ========================================================================== */

section('jungle: the theme');
{
  const themes = pure.NS ? null : null;
  const app = boot({ store: new Map() });
  const T = app.ns.THEMES;

  check('a jungle theme exists', Boolean(T.jungle));
  check('it declares a world', T.jungle.world === 'jungle', String(T.jungle.world));
  check('the arcade themes do not', ['noodle', 'spicy', 'dessert', 'alien']
    .every((id) => T[id].world === undefined));
  check('it still has every palette key', ['ink', 'body', 'bodyDark', 'bodyLight',
    'belly', 'cheek', 'tongue', 'board1', 'board2', 'tile', 'accent', 'accent2', 'crumb']
    .every((k) => Boolean(T.jungle[k])));
  check('it has a name and emoji', Boolean(T.jungle.name) && Boolean(T.jungle.emoji));

  // Snake-vs-ground contrast still has to clear the accessibility floor
  function luminance(hex) {
    const raw = String(hex).replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const [r, gg, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  }
  const l1 = luminance(T.jungle.body);
  const l2 = luminance(T.jungle.board1);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  check('the snake reads against the forest floor', ratio >= 1.9, ratio.toFixed(2));

  check('it is the default theme', app.body.dataset.theme === 'jungle',
    app.body.dataset.theme);
  check('and has a picker chip', (() => {
    const html = fs.readFileSync(path.join(PROJECT, 'play.html'), 'utf8');
    return /data-theme="jungle"/.test(html) && /Jungle theme/.test(html);
  })());
}

section('jungle: it builds a real scene');
{
  const app = boot({ webgl: true, withThree: true, store: new Map() });
  check('the 3D renderer started', app.game().renderer.id === '3d', app.game().renderer.id);
  check('it started in the jungle', app.body.dataset.theme === 'jungle');

  app.click('btn-play');
  const before = app.counts.glRenders || 0;
  app.frame(16);
  check('the jungle renders', (app.counts.glRenders || 0) > before);

  let crashed = null;
  try { for (let i = 0; i < 240; i += 1) app.frame(16); } catch (e) { crashed = e; }
  check('240 jungle frames without throwing', !crashed, crashed && crashed.stack);

  // Switching worlds rebuilds geometry; switching palettes must not
  let swapError = null;
  try {
    app.pick('themes', 'noodle');       // jungle -> arcade
    app.frame(16);
    app.pick('themes', 'spicy');        // arcade -> arcade
    app.frame(16);
    app.pick('themes', 'jungle');       // arcade -> jungle
    app.frame(16);
    app.pick('themes', 'alien');        // jungle -> arcade
    app.frame(16);
  } catch (e) { swapError = e; }
  check('switching in and out of the jungle does not throw', !swapError,
    swapError && swapError.stack);
  check('the game survived the swaps', app.game().renderer.id === '3d');

  app.pick('themes', 'jungle');
  for (let i = 0; i < 60; i += 1) app.frame(16);
  check('still playable after returning to the jungle',
    app.state() === 'PLAYING' || app.state() === 'GAME_OVER', app.state());
}

section('jungle: how it is built');
{
  const code = codeOf('js/render/jungle.js');
  const renderer = codeOf('js/render/renderer3d.js');

  check('the world lives in its own module',
    fs.existsSync(path.join(PROJECT, 'js/render/jungle.js')));
  check('both pages load it', (() => {
    return ['play.html', 'index.html'].every((page) =>
      /src="js\/render\/jungle\.js"/.test(
        fs.readFileSync(path.join(PROJECT, page), 'utf8')));
  })());
  check('it is loaded before the renderer that uses it', (() => {
    const html = fs.readFileSync(path.join(PROJECT, 'play.html'), 'utf8');
    return html.indexOf('js/render/jungle.js') < html.indexOf('js/render/renderer3d.js');
  })());

  // Everything is generated, nothing is downloaded
  check('no image files are referenced', !/\.(png|jpg|jpeg|webp|gltf|glb|hdr)/i.test(code));
  check('textures are painted onto a canvas', /createElement\('canvas'\)/.test(code));
  check('and turned into CanvasTextures', /new THREE\.CanvasTexture/.test(code));
  check('the layout is deterministic, not random per load',
    /function seeded\(/.test(code) && !/Math\.random\(\)/.test(code));

  // Performance rules the rest of the renderer already follows
  check('scenery is instanced', (code.match(/new THREE\.InstancedMesh/g) || []).length >= 4,
    String((code.match(/new THREE\.InstancedMesh/g) || []).length));
  check('instance matrices are uploaded once',
    (code.match(/instanceMatrix\.needsUpdate/g) || []).length >= 4);
  check('it exposes no per-frame work', !/function update\(/.test(code));
  check('every geometry, material and texture is tracked for disposal',
    /geometries\.push/.test(code) && /materials\.push/.test(code) && /textures\.push/.test(code));
  check('dispose releases all three', /for \(const item of geometries\) item\.dispose\(\)/.test(code) &&
    /for \(const item of materials\) item\.dispose\(\)/.test(code) &&
    /for \(const item of textures\) item\.dispose\(\)/.test(code));

  // It must not reach into the game
  check('the jungle knows nothing about the engine',
    !/createEngine|engine\.|queueTurn/.test(code));
  check('nor about the DOM beyond making canvases',
    !/getElementById|querySelector|addEventListener/.test(code));

  // The renderer side
  check('the renderer branches on the world', /worldOf\(theme\) === 'jungle'/.test(renderer));
  check('a world change rebuilds, a palette change does not',
    /function rebuildArena\(\)/.test(renderer) &&
    /if \(worldOf\(theme\) !== builtWorld\)/.test(renderer));
  check('arcade lighting is restored when leaving the jungle',
    /function applyArcadeLighting\(\)/.test(renderer));
  check('the body wears the world-appropriate skin',
    /function activeSkin\(\)/.test(renderer) &&
    /bodyMesh\.material = activeSkin\(\)/.test(renderer));
  check('the jungle is disposed with the renderer',
    /if \(jungle\) jungle\.dispose\(\)/.test(renderer));
  check('the arcade board is still there for other themes',
    /function buildFloorTiles\(/.test(renderer));
}

section('jungle: the 2D fallback is unaffected');
{
  // The Canvas renderer has no notion of worlds; it must still take the theme
  const app = boot({ store: new Map() });     // no WebGL -> 2D
  check('2D is in use', app.game().renderer.id === '2d', app.game().renderer.id);
  check('with the jungle palette', app.body.dataset.theme === 'jungle');

  app.click('btn-play');
  let error = null;
  try { for (let i = 0; i < 120; i += 1) app.frame(16); } catch (e) { error = e; }
  check('2D renders the jungle palette without throwing', !error, error && error.message);
  check('canvas save/restore still balanced', (app.counts.__depth || 0) === 0,
    String(app.counts.__depth));

  const r2d = codeOf('js/render/renderer2d.js');
  check('the 2D renderer never mentions the jungle', !/jungle/i.test(r2d));
}


console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
if (failures) console.log(failedNames.map((f) => `  - ${f}`).join('\n'));
process.exit(failures === 0 ? 0 : 1);
