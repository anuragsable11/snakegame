/**
 * Test environment for Hungry Noodle 3D.
 *
 * Three ways to boot:
 *   bootEngine()          config + engine only — pure rules, no DOM at all
 *   boot()                the whole game, WebGL absent (2D fallback path)
 *   boot({webgl: true})   the whole game with REAL three.js and a stubbed
 *                         WebGLRenderer, so the 3D scene graph is built for real
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/** Repo root, resolved from this file so the suite runs from any clone. */
const PROJECT = path.resolve(__dirname, '..');

/** The game page. index.html is the marketing landing page, play.html is the game. */
const GAME_PAGE = 'play.html';
const LANDING_PAGE = 'index.html';

const HTML = fs.readFileSync(path.join(PROJECT, GAME_PAGE), 'utf8');

function loadOrder() {
  const order = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  if (order.length === 0) throw new Error('no <script src> tags found in index.html');
  return order;
}

function matches(node, selector) {
  if (selector === 'button') return node.tagName === 'BUTTON';
  if (selector.startsWith('.')) return node.classes.has(selector.slice(1));
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector === '[data-direction]') return node.dataset.direction !== undefined;
  if (selector === '[data-theme]') return node.dataset.theme !== undefined;
  if (selector === '[data-value]') return node.dataset.value !== undefined;
  const dir = selector.match(/\[data-direction="([^"]+)"\]/);
  if (dir) return node.dataset.direction === dir[1];
  const theme = selector.match(/\[data-theme="([^"]+)"\]/);
  if (theme) return node.dataset.theme === theme[1];
  const value = selector.match(/\[data-value="([^"]+)"\]/);
  if (value) return node.dataset.value === value[1];
  return false;
}

class FakeElement {
  constructor(tagName = 'DIV', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classes = new Set();
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.offsetWidth = 100;
    this.offsetParent = {};
    this.width = 800;
    this.height = 800;
    const self = this;
    this.classList = {
      add: (c) => self.classes.add(c),
      remove: (c) => self.classes.delete(c),
      contains: (c) => self.classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !self.classes.has(c) : Boolean(force);
        if (on) self.classes.add(c); else self.classes.delete(c);
        return on;
      },
    };
  }
  append(child) { child.parent = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  getBoundingClientRect() { return { width: 400, height: 400, left: 0, top: 0 }; }
  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parent;
    }
    return null;
  }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelector(sel) { return this.descendants().find((n) => matches(n, sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter((n) => matches(n, sel)); }
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) {
      fn({ target: this, preventDefault() {}, ...event });
    }
  }
}

class FakeButton extends FakeElement {
  constructor(id) { super('BUTTON', id); }
}

class Path2D {
  moveTo() {} lineTo() {} arc() {} closePath() {}
  quadraticCurveTo() {} bezierCurveTo() {} rect() {} ellipse() {}
}

/* ------------------------------------------------------- canvas 2d stub */

const GRADIENT = { addColorStop() {} };

function makeContext(counts = {}) {
  const props = {};
  const stack = [];
  return new Proxy({}, {
    get(_t, key) {
      if (typeof key === 'symbol') return undefined;
      if (key === 'canvas') return { width: 800, height: 800 };
      if (key in props) return props[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient' ||
          key === 'createConicGradient' || key === 'createPattern') {
        return () => { counts[key] = (counts[key] || 0) + 1; return GRADIENT; };
      }
      if (key === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {
        counts[key] = (counts[key] || 0) + 1;
        if (key === 'save') {
          counts.__depth = (counts.__depth || 0) + 1;
          stack.push({ ...props });
        }
        if (key === 'restore') {
          counts.__depth = (counts.__depth || 0) - 1;
          if (counts.__depth < 0) counts.__underflow = true;
          const restored = stack.pop();
          if (restored) {
            for (const name of Object.keys(props)) delete props[name];
            Object.assign(props, restored);
          }
        }
        return undefined;
      };
    },
    set(_t, key, value) { props[key] = value; return true; },
    has() { return true; },
  });
}

/* -------------------------------------------------------- webgl stub */

function makeGLStub() {
  return new Proxy({}, {
    get(_t, key) {
      if (typeof key === 'symbol') return undefined;
      if (key === 'getExtension') return () => null;
      if (key === 'getParameter') return () => 4096;
      if (key === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
      if (key === 'getContextAttributes') return () => ({});
      return () => undefined;
    },
    has() { return true; },
  });
}

/* ------------------------------------------------------- web audio stub */

function makeParam() {
  const box = { value: 1 };
  return new Proxy(box, {
    get(t, key) {
      if (key === 'value') return t.value;
      if (typeof key === 'symbol') return undefined;
      return () => {};
    },
    set(t, key, value) { t[key] = value; return true; },
  });
}

function makeAudioNode(counts) {
  const props = {};
  return new Proxy({}, {
    get(_t, key) {
      if (typeof key === 'symbol') return undefined;
      if (key in props) return props[key];
      if (key === 'connect') return (node) => node;
      if (key === 'disconnect' || key === 'start' || key === 'stop') {
        return () => { counts[`audio.${key}`] = (counts[`audio.${key}`] || 0) + 1; };
      }
      if (key === 'getChannelData') return () => new Float32Array(2048);
      if (key === 'buffer' || key === 'onended') return null;
      return makeParam();
    },
    set(_t, key, value) { props[key] = value; return true; },
  });
}

function makeAudioContext(counts) {
  return class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.sampleRate = 44100;
      this.destination = makeAudioNode(counts);
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createBuffer(channels, length) {
      counts['audio.createBuffer'] = (counts['audio.createBuffer'] || 0) + 1;
      return { length, numberOfChannels: channels, sampleRate: 44100,
        getChannelData: () => new Float32Array(length) };
    }
    createGain() { return this._node('createGain'); }
    createOscillator() { return this._node('createOscillator'); }
    createBufferSource() { return this._node('createBufferSource'); }
    createBiquadFilter() { return this._node('createBiquadFilter'); }
    createDynamicsCompressor() { return this._node('createDynamicsCompressor'); }
    createStereoPanner() { return this._node('createStereoPanner'); }
    createDelay() { return this._node('createDelay'); }
    _node(name) {
      counts[`audio.${name}`] = (counts[`audio.${name}`] || 0) + 1;
      return makeAudioNode(counts);
    }
  };
}

/* ------------------------------------------------------------ sandbox */

function makeSandbox({ store, counts, webgl, clock, rafQueue, timers }) {
  const registry = new Map();
  const body = new FakeElement('BODY');

  const containers = {};
  function group(className, entries, attr) {
    const node = new FakeElement('DIV');
    node.classes.add(className);
    for (const value of entries) {
      const button = new FakeButton('');
      button.dataset[attr] = value;
      node.append(button);
    }
    containers['.' + className] = node;
    return node;
  }

  const dpad = group('dpad', ['up', 'left', 'down', 'right'], 'direction');
  const themes = group('themes', ['jungle', 'noodle', 'spicy', 'dessert', 'alien'], 'theme');
  const modes = group('modes', ['classic', 'timeattack', 'survival', 'endless', 'daily'], 'value');
  const difficulties = group('difficulties', ['easy', 'normal', 'hard'], 'value');
  const controls = new FakeElement('DIV');
  controls.classes.add('controls');
  containers['.controls'] = controls;

  const ids = [...HTML.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    registry.set(id, id.startsWith('btn') ? new FakeButton(id) : new FakeElement('DIV', id));
  }
  for (const id of ids.filter((i) => i.startsWith('btn'))) controls.append(registry.get(id));

  function makeCanvas(id) {
    const node = new FakeElement('CANVAS', id || '');
    node.getContext = (kind) => {
      if (kind === '2d') return makeContext(counts);
      if (!webgl) return null;
      counts.glContexts = (counts.glContexts || 0) + 1;
      return makeGLStub();
    };
    return node;
  }

  const boardCanvas = makeCanvas('board');
  registry.set('board', boardCanvas);

  const doc = {
    body,
    hidden: false,
    readyState: 'complete',
    activeElement: null,
    listeners: {},
    getElementById: (id) => registry.get(id) || null,
    querySelector: (sel) => containers[sel] || null,
    querySelectorAll: (sel) => (containers[sel] ? containers[sel].children : []),
    createElement: (tag) => (String(tag).toLowerCase() === 'canvas'
      ? makeCanvas('')
      : new FakeElement(tag || 'DIV')),
    createElementNS: (ns, tag) => new FakeElement(tag || 'DIV'),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    dispatch(type, event) {
      for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...event });
    },
  };

  FakeElement.prototype.focus = function focus() { doc.activeElement = this; };
  FakeElement.prototype.replaceWith = function replaceWith(node) {
    node.parent = this.parent;
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children[index] = node;
    }
    if (this.id) {
      node.id = this.id;
      registry.set(this.id, node);
    }
  };

  const win = {
    devicePixelRatio: 2,
    listeners: {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    requestAnimationFrame: (cb) => rafQueue.push(cb),
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    dispatch(type, event) {
      for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...event });
    },
    AudioContext: makeAudioContext(counts),
  };
  if (webgl) win.WebGLRenderingContext = function WebGLRenderingContext() {};

  const sandbox = {
    window: win,
    document: doc,
    performance: { now: () => clock.now },
    Path2D,
    Element: FakeElement,
    HTMLButtonElement: FakeButton,
    ResizeObserver: class { observe() {} disconnect() {} },
    console,
    Math,
    Float32Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    Int32Array,
    ArrayBuffer,
    Image: class {},
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : class {},
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  return { sandbox, registry, doc, win, body, containers, boardCanvas };
}

/* ---------------------------------------------------------------- boots */

/** Just the rules: config.js + core/engine.js. No DOM involved at all. */
function bootEngine(patch) {
  const store = new Map();
  const counts = {};
  const clock = { now: 0 };
  const parts = makeSandbox({ store, counts, webgl: false, clock, rafQueue: [], timers: [] });
  vm.createContext(parts.sandbox);
  // The engine's dependencies, in load order — no DOM modules among them.
  const ENGINE_FILES = [
    'js/config.js',
    'js/core/rng.js',
    'js/core/engine.js',
    'js/core/replay.js',
    'js/core/daily.js',
  ];
  for (const file of ENGINE_FILES) {
    let source = fs.readFileSync(path.join(PROJECT, file), 'utf8');
    if (patch) source = patch(source, file);
    vm.runInContext(source, parts.sandbox, { filename: file });
  }
  return { NS: parts.sandbox.window.HungryNoodle, clock };
}

/** The whole game, as the browser loads it. */
function boot(options = {}) {
  const store = options.store || new Map();
  const counts = {};
  const clock = { now: 0 };
  let rafQueue = [];
  const timers = [];
  const webgl = Boolean(options.webgl);

  const parts = makeSandbox({ store, counts, webgl, clock, rafQueue, timers });
  const { sandbox, registry, doc, win, body, containers } = parts;
  vm.createContext(sandbox);

  const order = options.files || loadOrder();
  const loaded = [];
  for (const file of order) {
    if (file.startsWith('vendor/') && !options.withThree) continue;
    const full = path.join(PROJECT, file);
    let source = fs.readFileSync(full, 'utf8');
    if (options.patch) source = options.patch(source, file);
    vm.runInContext(source, sandbox, { filename: file });
    loaded.push(file);

    // three.min.js is UMD: in this sandbox it lands on globalThis, but the game
    // reads window.THREE. Bridge it, then stub the one part that needs real GL.
    if (file.includes('three') && sandbox.THREE) {
      sandbox.window.THREE = sandbox.THREE;
      sandbox.THREE.WebGLRenderer = class FakeWebGLRenderer {
        constructor(params) {
          this.domElement = (params && params.canvas) || null;
          this.shadowMap = { enabled: false, type: 0 };
          this.outputEncoding = 0;
          counts.webglRenderers = (counts.webglRenderers || 0) + 1;
        }
        setPixelRatio(value) { counts.setPixelRatio = value; }
        setSize(w, h) { counts.lastSize = `${w}x${h}`; }
        render() { counts.glRenders = (counts.glRenders || 0) + 1; }
        dispose() { counts.glDisposes = (counts.glDisposes || 0) + 1; }
      };
    }
  }

  const api = {
    registry, doc, win, body, containers, store, counts, loaded, clock,
    ns: sandbox.window.HungryNoodle,
    THREE: sandbox.window.THREE,
    game: () => sandbox.window.HungryNoodle.game,
    engine: () => sandbox.window.HungryNoodle.game.engine,
    frame(ms) {
      clock.now += ms;
      const queued = rafQueue.splice(0);
      for (const cb of queued) cb(clock.now);
    },
    steps(n, ms = 150) { for (let i = 0; i < n; i += 1) api.frame(ms); },
    advance(ms) { clock.now += ms; },
    press(key) {
      win.dispatch('keydown', { key });
      if ((key === ' ' || key === 'Enter') && doc.activeElement instanceof FakeButton) {
        const button = doc.activeElement;
        button.dispatch('click');
        doc.dispatch('click', { target: button });
      }
    },
    click(id) {
      const button = registry.get(id);
      button.dispatch('click');
      doc.dispatch('click', { target: button });
    },
    tap(direction) {
      containers['.dpad'].querySelector(`[data-direction="${direction}"]`).dispatch('pointerdown');
    },
    pick(containerClass, value) {
      const node = containers['.' + containerClass];
      const button = node.querySelector(`[data-value="${value}"]`) ||
        node.querySelector(`[data-theme="${value}"]`);
      node.dispatch('click', { target: button });
    },
    state: () => body.dataset.state,
    screen: () => body.dataset.screen,
    text: (id) => String(registry.get(id).textContent),
    score: () => Number(registry.get('score').textContent),
    label: () => registry.get('board').getAttribute('aria-label'),
    flushTimers() { timers.splice(0).forEach((fn) => fn()); },
  };
  return api;
}

module.exports = { boot, bootEngine, FakeButton, FakeElement, HTML, PROJECT, loadOrder,
  GAME_PAGE, LANDING_PAGE };
