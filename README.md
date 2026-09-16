# 🍜 Hungry Noodle 3D

[![CI](https://github.com/anuragsable11/snakegame/actions/workflows/ci.yml/badge.svg)](https://github.com/anuragsable11/snakegame/actions/workflows/ci.yml)

A cartoon Snake game about a noodle with no self-control — rendered in 3D with
Three.js, with a 2D Canvas renderer as an automatic fallback.

Built with HTML5, CSS3 and vanilla JavaScript. No framework, no build step, no
backend, and **no image or audio files**: every 3D model is procedural geometry,
every 2D sprite is canvas paths, and every sound is synthesised at runtime.

---

## Overview

Two pages, both static:

| Page | What it is |
| --- | --- |
| `index.html` | Landing page. Runs a live autoplay demo of the real game in the hero. |
| `play.html` | The game itself. |

The interesting part isn't the game — it's the separation. A pure game engine
holds all the rules and knows nothing about pixels; two interchangeable
renderers draw it. That's what makes the engine testable in Node with no
browser, and what makes the WebGL→Canvas fallback a one-object swap.

It is also **deterministic**: a run is completely described by a seed, a
configuration and a list of tick-indexed inputs. That one property is what
makes replays, the best-run ghost and the Daily Challenge possible — and it
is enforced by the test suite, not just asserted in this README.

---

## Features

Everything listed here is implemented and covered by the test suite.

**Gameplay**
- Grid-based Snake on a 20 × 20 board with interpolated (non-jumping) motion
- **Five modes** — Classic, Time Attack, Survival, Endless, Daily Challenge
- **Three difficulties** that change real numbers, not labels (see table below)
- Eight creatures to hunt — beetle, cricket, spider, grub, frog, mouse,
  lizard and a speckled egg — chosen at random, never the same one twice running
- Score is `10 × current level`; hunger streaks show a combo chip
- Reverse moves blocked; turns buffered so fast inputs are never dropped
- Win condition: fill the entire board
- Per-mode high scores
- **Daily Challenge** — one board a day, seeded from the UTC date, identical
  for everyone, with your best local score per day
- **Best-run ghost** — your best run for a mode replays alongside you as a
  translucent racer

**Determinism**
- Seeded RNG (mulberry32); every gameplay-affecting random decision goes
  through it
- Tick-driven simulation — no gameplay decision reads a wall clock
- Replay recording, playback and verification, with a versioned format
- A stable state fingerprint for reproducibility checks

**Rendering**
- **Three.js renderer** — checkered arena, chunky walls, shadow-casting light,
  toon materials, a camera that eases toward the action, and a pooled
  `Points` particle system
- **Canvas 2D renderer** — the original hand-drawn look, used automatically when
  WebGL is unavailable, and switchable at any time with the 3D/2D button
- Six facial expressions (idle, hungry, eating, fast, hurt, dead) driven by
  shared logic, so the noodle behaves identically in both renderers
- Four themes that repaint the arena, the page chrome and the 3D materials

**Interface**
- Main menu with mode/difficulty pickers and the best score for that mode
- HUD: score, best, level/speed meter, streak chip, Time Attack clock
- Ready / paused / game-over cards
- Speech-bubble commentary with deliberate silence between jokes
- Responsive: single column on tablets, board-and-pad-together on phones,
  board-beside-controls in landscape

**Browser APIs**
- **Web Audio API** — all sound effects synthesised (no audio files)
- **Web Storage API** — high scores, theme, mode, difficulty, mute, renderer
  preference; every read falls back safely if the stored value is junk
- **Pointer Events** — d-pad and swipe-to-steer
- **ResizeObserver** — board sizing

---

## Technology

| Technology | Used for |
| --- | --- |
| HTML5 | Markup for both pages |
| CSS3 | Custom properties, theming, grid layout, responsive rules |
| JavaScript (ES2020) | Engine, UI, both renderers, audio, tests |
| Three.js r147 | The 3D renderer |
| Canvas 2D API | The fallback renderer and the 3D floor texture |
| Web Audio API | Procedural sound |
| Web Storage API | Scores and preferences |
| Node.js | Running the test suite |

No runtime npm dependencies. Three.js is **vendored** at `vendor/three.min.js`
— no CDN, no network request at runtime.

### Why Three.js r147 specifically

Three.js r150+ ships as ES modules only, and browsers refuse to load ES modules
over `file://`. r147 is the last release with a UMD build that loads from a
classic `<script>` tag, which keeps the game playable by simply opening the HTML
file. It has everything used here (`MeshToonMaterial`, `PCFSoftShadowMap`,
`Points`, `CapsuleGeometry`).

---

## Architecture

```
                    seed + config + inputs
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │           CORE SIMULATION               │
        │                                         │
        │   js/core/rng.js      seeded mulberry32 │
        │   js/core/engine.js   rules + tick()    │
        │                                         │
        │   no DOM · no renderer · no audio       │
        │   no wall clock · no storage            │
        └───────┬─────────────────────┬───────────┘
                │ state + fingerprint │ events
                │                     │
     ┌──────────┴──────────┐          │
     │  DETERMINISM LAYER  │          │
     │  js/core/replay.js  │          │
     │  js/core/daily.js   │          │
     │  persistence.js     │          │
     └──────────┬──────────┘          │
                │ ghost playback      │
                ▼                     ▼
        ┌───────────────────────────────────────┐
        │   js/main.js   wiring + rAF loop      │
        │   js/ui.js     DOM, HUD, menus, input │
        └──────────────────┬────────────────────┘
                           │ renderer contract
              ┌────────────┴────────────┐
              │                         │
     js/render/renderer3d.js   js/render/renderer2d.js
          (Three.js)                 (Canvas 2D)
              │                         │
             3D                        2D
```

**Engine → state → renderer.** `engine.update(deltaMs)` advances a fixed-timestep
simulation and emits events (`eat`, `level`, `death`, `wrap`, `close`, `idle`,
`reset`). Renderers read `engine.state` and `engine.alpha()` — how far through
the current step we are — and interpolate between grid cells so a 150 ms step
looks smooth. Renderers never write to engine state; the tests assert this.

Both renderers implement the same contract:

```js
mount()  setTheme(theme)  resize(size, dpr)  update(dt, now)  render(engine, now, dt)
onEat()  onLevel()  onDeath()  onRecord()  onReset()  dispose()
```

### Why the logic is separated from rendering

1. **It is testable without a browser.** The engine has no `document`, no
   canvas, no Three.js and no audio, so the whole rule set runs in Node. The
   test suite asserts this isolation by scanning the source.
2. **The fallback is trivial.** No WebGL? Construct the other renderer. The
   rules don't change, so behaviour can't drift between the two.
3. **Rules are verifiable in isolation.** Collision, scoring, levelling and
   mode behaviour are tested directly, not inferred from what's on screen.
4. **It makes deterministic replay possible.** A pure engine plus a seeded
   RNG is all a replay system needs — see below.

---

## Deterministic simulation

A run is completely described by three things:

```
seed  +  configuration  +  tick-indexed inputs   →   the entire run
```

Nothing else feeds in. To make that true:

- **All gameplay randomness comes from a seeded RNG** (`js/core/rng.js`,
  mulberry32). Food position, food type and obstacle placement all draw from it.
  `js/core/engine.js` contains no `Math.random()` at all — the test suite
  asserts that by scanning the source.
- **The simulation is tick-driven.** `engine.tick()` takes no arguments and
  reads no clock; it is the only thing that advances the game.
  `engine.update(deltaMs)` is just an accumulator over it for real-time play, so
  the browser render loop can keep using animation timing while the simulation
  stays reproducible.
- **No gameplay decision reads a wall clock.** Time-dependent rules use
  `state.simTimeMs`, which advances by exactly one `stepMs` per tick. That
  covers the hunger-streak window, the Time Attack countdown and the commentary
  cadence. Two wall-clock timestamps remain (`lastEatAt`, `diedAt`) purely to
  drive face and death animations, and they are deliberately excluded from the
  fingerprint.

Presentation randomness — particle scatter, screen shake, which joke appears —
still uses `Math.random()`. It cannot reach the simulation, so it does not
affect reproducibility.

### State fingerprint

`engine.canonicalState()` serialises the simulation in a **fixed field order** —
hand-built rather than `JSON.stringify`, because object key order is an
implementation detail. `engine.fingerprint()` hashes that with FNV-1a into eight
hex digits. It covers tick, status, mode, difficulty, grid size, seed, RNG
state, direction, score, snacks eaten, level, streak, death cause, time left,
the whole snake, the food and the obstacles.

This is a **reproducibility check, not an anti-cheat mechanism**. The data is
client-side and trivially editable.

---

## Replay system

A replay stores only what is needed to rebuild the run:

```json
{
  "version": 1,
  "seed": 123456,
  "config": { "mode": "classic", "difficulty": "normal", "gridSize": 20 },
  "inputs": [ { "tick": 12, "dir": "up" }, { "tick": 24, "dir": "right" } ],
  "result": { "tick": 356, "score": 840, "length": 27, "cause": "wall",
              "fingerprint": "94a7385a" }
}
```

No snapshots, no per-frame state, no rendering data. A 356-tick, 840-point run
with 54 turns serialises to about **1.5 KB**.

**Recording** (`createRecorder`) watches the live engine and writes down each
*accepted* turn, stamped with the tick it was accepted on. Rejected turns change
nothing, so they are not worth storing.

**Playback** (`createPlayback`) builds a fresh engine from the seed and config,
then applies the recorded inputs at the recorded ticks. It uses **the same
engine as the live game** — there is deliberately no second simulation
implementation, because a second implementation is a second set of bugs. The
caller decides *when* to advance; the seed and inputs decide *what happens*.

**Verification** (`verifyReplay`) replays a recording and compares the resulting
fingerprint, score, tick and length against what was recorded:

```js
const verdict = HungryNoodle.verifyReplay(replay);
// { ok: true,  reason: null }
// { ok: false, reason: "diverged: score" }
```

`findDivergence(a, b)` steps two playbacks side by side and reports the first
tick at which their fingerprints differ.

**Versioning.** Every replay carries `version`. Anything that is not the current
`REPLAY_VERSION` is rejected outright rather than interpreted — `createPlayback`
throws and `parseReplay` returns `null`. Malformed JSON, unknown modes, unknown
difficulties, impossible directions and negative ticks are all rejected the same
way.

---

## Ghost runs

Your best run for a mode is kept as replay data and raced against you:

```
best replay  →  deterministic playback  →  positions  →  renderer
```

The ghost is a **completely separate engine** with its own seed, RNG and state,
advanced on its own accumulator (a faster run has a shorter step, so it must
keep its own pace). It stops when its replay ends.

It cannot influence the game. Renderers receive a plain positions object through
the optional `setGhost(view)` contract method — never an engine — so there is no
path from drawing code back into a simulation. The ghost takes no part in
collision, scoring or RNG.

A replay is **verified before it is stored**, so a run that cannot reproduce
never becomes anybody's ghost. A ghost is only loaded when its configuration
matches the current one (and, for the Daily Challenge, the same seed).

---

## Daily Challenge

```
UTC date (YYYY-MM-DD)  →  FNV-1a hash  →  seed  →  identical board
```

`dailySeed('2026-09-16')` always returns the same number, so everyone playing on
that UTC date gets the same food sequence. **UTC, not local time**, so the
challenge flips at the same instant worldwide and cannot be re-rolled by
changing timezone.

Difficulty is pinned to Normal — a challenge that changed with a difficulty
setting would not be the same challenge. Your best score is stored per date.

Entirely client-side: the "same for everyone" property comes from the date being
the only input and the engine being deterministic. There is no server and no
online leaderboard.

### Storage keys

| Key | Contents |
| --- | --- |
| `noodle.replay.best.<mode>` | Best run for a mode, as replay JSON |
| `noodle.daily.v1` | `{ "YYYY-MM-DD": { score, completed } }`, capped at 60 days |
| `snake.highScore.v1` | Classic high score (kept from v1) |
| `noodle.high.<mode>` | High score for other modes |
| `noodle.theme.v1`, `noodle.mode.v1`, `noodle.difficulty.v1`, `noodle.renderer.v1`, `snake.muted.v1` | Preferences |

Every read is defensive: corrupt JSON, an unsupported replay version, a
mismatched configuration or junk entries all degrade to "no ghost" / "no result"
rather than throwing. The game never fails to start because of bad stored data,
and the test suite covers each of those cases.

---

## Game modes

| Mode | What changes |
| --- | --- |
| 🐍 Classic | Walls kill. Level caps at 10. |
| ⏱️ Time Attack | A countdown; each snack adds time. Time out ends the run. |
| 🧱 Survival | Bins are planted at the start and more appear as you eat. |
| ♾️ Endless | No walls — you wrap around. Speed keeps climbing. |
| 📅 Daily Challenge | Classic rules on a board seeded from today's UTC date. Difficulty pinned to Normal so it is the same challenge for everyone. |

## Difficulty

| | Easy 🍼 | Normal 🍜 | Hard 🌶️ |
| --- | --- | --- | --- |
| Step at level 1 | 185 ms | 150 ms | 118 ms |
| Speed ceiling | 104 ms | 66 ms | 50 ms |
| Shaved per level | 7 ms | 9 ms | 11 ms |
| Snacks per level | 5 | 4 | 3 |
| Survival: start bins / new bin every | 0 / — | 2 / 3 | 5 / 2 |
| Time Attack: clock / bonus | 75 s / +3 s | 60 s / +2 s | 45 s / +1.5 s |

---

## Testing

The suite boots the **real game modules** in Node against a stubbed
DOM / Canvas / Web Audio layer built on `node:vm`, driven by a fake clock. It
has no npm dependencies.

```bash
npm test
```

**794 checks, 794 passing** at the time of writing.

It runs three ways:

1. **Engine only** (`bootEngine`) — config, RNG, engine, replay and daily,
   with no DOM at all. Movement, turn buffering, wall/self/obstacle collision,
   eating, scoring, levelling, all three difficulties, all five modes, the win
   condition, pause, frame-rate independence, RNG determinism, replay
   record/playback/verify/versioning, and daily seed derivation.
2. **Whole game, WebGL absent** — the 2D fallback end to end through the real
   UI: menu, pickers, persistence, play, pause, keyboard, d-pad, themes,
   per-mode high scores, corrupt-storage recovery, 900 frames of stability.
3. **Whole game with the real `vendor/three.min.js`** and a stubbed
   `WebGLRenderer` — the actual scene graph (geometries, materials, the head
   rig, all eight food models, obstacles, particles) is constructed and laid out
   for 600+ frames, plus the 3D↔2D swap and disposal.

Plus determinism checks that are hard to fake: the same seed and inputs
produce an identical fingerprint while a different seed does not; the
fingerprint ignores presentation state but tracks simulation state;
`update()` and `tick()` reach the same place; tampered replays (retimed
input, dropped input, inflated score, forged fingerprint, changed seed) all
fail verification; and **the same seed and inputs produce an identical
simulation through the Three.js renderer and the Canvas renderer**, which is
the concrete proof that rendering cannot affect gameplay.

Plus static checks on both pages: no external URLs, no ES modules, no inline
script/style/handlers, every referenced script and stylesheet exists, every CSS
class is defined by a stylesheet the page actually links, responsive
breakpoints intact, and the engine source contains no rendering, audio,
storage or `Math.random()` code.

```bash
npm run test:watch   # re-runs on changes to js/, tests/ or play.html
```

Test files:

```
tests/
├── run.js      # the suite (all 392 checks)
├── env.js      # DOM / Canvas / Web Audio / WebGL stubs + vm sandbox
└── probe.js    # a recording 2D context for asserting on drawing routines
```

---

## CI

`.github/workflows/ci.yml` runs on every **push** and **pull request**:

1. Checkout
2. Set up Node (matrix: **18.x** and **22.x**) with npm caching
3. `npm ci`
4. `npm test`

The job fails if any check fails. There is no typecheck step yet — see Future
Improvements.

> The badge above goes live after this workflow is first pushed to GitHub.

---

## Controls

| Input | Action |
| --- | --- |
| `↑` `↓` `←` `→` / `W` `A` `S` `D` | Steer |
| `Space` / `Enter` | Play, pause, resume, play again |
| `P` | Pause / resume |
| `Esc` | Pause; from pause or game over, back to the menu |
| `R` | Restart |
| `M` | Mute / unmute |
| 3D / 2D button | Switch renderer (disabled without WebGL) |
| D-pad / swipe on the board | Steer on touch screens |

---

## Local development

No build step and no dependencies to install for the game itself.

```bash
git clone <this repo>
cd snakegame

# Play it — just open the file
start play.html          # Windows
open play.html           # macOS

# Or serve it (needed if you want the landing page at "/")
python -m http.server 8000
# or: npx serve .
```

For the tests:

```bash
npm ci      # creates nothing — there are no dependencies — but verifies the lockfile
npm test
```

---

## Project structure

```
snakegame/
├── index.html              # Landing page (autoplay demo in the hero)
├── play.html               # The game
├── style.css               # Shared design tokens, game UI, responsive rules
├── landing.css             # Landing-page layout only
├── vercel.json             # cleanUrls; static deploy, no build
├── package.json            # test scripts (no dependencies)
├── vendor/
│   └── three.min.js        # Three.js r147 UMD, vendored
├── js/
│   ├── config.js           # Rules, enums, food catalogue, safe storage wrapper
│   ├── core/
│   │   ├── rng.js          # Seeded mulberry32 + FNV-1a hashing
│   │   ├── engine.js       # THE ENGINE — pure rules, tick(), fingerprint
│   │   ├── replay.js       # Record, play back and verify runs
│   │   ├── daily.js        # UTC date -> deterministic seed
│   │   └── persistence.js  # Replay + daily storage (defensive reads)
│   ├── render/
│   │   ├── face.js         # Expression logic shared by both renderers
│   │   ├── renderer2d.js   # Canvas renderer
│   │   └── renderer3d.js   # Three.js renderer
│   ├── themes.js           # Four palettes + 2D backdrop
│   ├── art.js              # 2D canvas artwork
│   ├── particles.js        # 2D pooled particles
│   ├── banter.js           # Joke pools + cadence
│   ├── audio.js            # Procedural Web Audio
│   ├── ui.js               # Everything that touches the DOM
│   ├── main.js             # Bootstrap, wiring, animation loop
│   └── landing.js          # Autoplay demo for the landing page
├── tests/
│   ├── run.js
│   ├── env.js
│   └── probe.js
└── .github/workflows/ci.yml
```

---

## Browser support

Any browser supporting ES2020 (optional chaining, nullish coalescing) —
roughly Chrome/Edge 85+, Firefox 79+, Safari 14+.

- **WebGL** is optional. Without it the game runs the Canvas 2D renderer and
  says so in the live region.
- **`dvh` units** are used with a `vh` fallback, so older Safari degrades
  gracefully.
- Scripts are deliberately classic (not ES modules) so the game also runs from
  `file://`.

---

## Accessibility

Implemented and, where testable, asserted by the suite:

- Every control is a real `<button>` with an accessible name; toggles carry
  `aria-pressed`
- Visible `:focus-visible` rings; focus moves to the primary action when the
  pause and game-over cards appear
- A polite ARIA live region (`#announcer`) announces state changes, level-ups,
  theme and renderer changes, and final scores
- The canvas has a descriptive `aria-label` that is updated as you play
- The decorative speech bubble is `aria-hidden` so it never competes with the
  live region
- `prefers-reduced-motion` disables particles, shake, bobbing, blinking, camera
  follow and shadows, and reduces the particle pool
- All four themes clear a 3:1 contrast ratio between the noodle and its board
  (checked numerically in the test suite)
- State is never communicated by colour alone — the HUD, cards and live region
  all carry text

Not yet done: no full screen-reader pass, and no keyboard remapping.

---

## Performance

- **Fixed-timestep simulation with interpolated rendering.** Large deltas are
  clamped, so a backgrounded tab never runs dozens of steps at once.
- **Nothing is allocated per frame in the 3D renderer.** Geometries live in one
  table, materials in a cache keyed by colour; snake segments and obstacles come
  from pools and are hidden rather than destroyed; particles are a fixed
  `Float32Array` with swap-removal. The suite asserts no `new THREE.*Geometry`
  or `*Material` appears in per-frame code.
- **Device pixel ratio capped at 2** for WebGL, so 3× phones don't render nine
  times the pixels.
- **One shadow-casting light** with a 1024² map sized to the board (512² under
  reduced motion, where shadows are off).
- **`dispose()` actually disposes** every geometry, material, texture and the
  renderer, so toggling 3D↔2D repeatedly doesn't leak.
- **2D renderer:** backdrop pre-rendered once per resize/theme, no `shadowBlur`
  in the hot path, pooled particles.
- The only per-frame DOM write is the Time Attack clock, and only in that mode.

---

## Deployment

Static site on **Vercel** — no build command, no server, no backend.

`vercel.json` sets `cleanUrls`. The root URL serves `index.html` (the landing
page) by Vercel's default static behaviour, and the game is at `/play`.

> Note: this repo previously rewrote `/` → `/play.html`. That rewrite was
> removed because it made the landing page unreachable at the root. If you'd
> rather `/` go straight to the game, add the rewrite back to `vercel.json`.

---

## Future improvements

### Implemented

- Pure, renderer-independent game engine
- Three.js renderer + Canvas fallback behind one contract
- Four modes, three meaningful difficulties
- 392-check test suite runnable from a fresh clone
- GitHub Actions CI on push and pull request
- Per-mode high scores with corrupt-data recovery
- Procedural 3D models, 2D art and audio — zero asset files
- Seeded RNG; all gameplay randomness routed through it
- Tick-driven simulation with a stable state fingerprint
- Deterministic replay: record, play back, verify, versioned format
- Best-run ghost, stored locally as replay data and verified before use
- Daily Challenge seeded from the UTC date, with per-day local best

### Planned

- **PWA** — manifest, icons and a service worker for offline play
- **Replay sharing** — a replay is ~1.5 KB, so it could be exported as a code
  or a URL fragment for others to verify
- **Type checking** — `tsc --checkJs` with JSDoc types, no TypeScript rewrite
- **Performance HUD** — FPS/frame time/particle count behind a dev shortcut
- **Convert the runner to `node:test`** — the suite is currently a custom
  zero-dependency runner; the standard runner would give better reporting

---

## License

MIT
