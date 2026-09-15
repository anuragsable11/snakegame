# 🍜 Hungry Noodle

A goofy cartoon Snake game about a noodle with no self-control. Built with
nothing but HTML5, CSS3, vanilla JavaScript and the Canvas API — no frameworks,
no build step, no backend, no dependencies, no image or audio files. Every
pixel of art is drawn with canvas paths and every sound is synthesised in the
browser. Open the file and play.

---

## Features

**Gameplay**
- Classic grid-based snake movement on a 20 × 20 board
- Smooth, interpolated motion — the noodle glides between cells instead of jumping
- Eight cartoon snacks — 🍕 pizza, 🍔 burger, 🍩 donut, 🍌 banana, 🌮 taco,
  🍟 fries, 🍎 apple, 🍰 cake — picked at random, never the same one twice running
- Score: each snack is worth `10 × current level`
- 10 difficulty levels — every 4 snacks speeds him up, from 150 ms to 66 ms per move
- Hunger streaks: eat again quickly and a `x3` chip appears, raising the chomp pitch
- Wall collision and self collision both end the run
- Reverse-direction moves are blocked, and turns are buffered so fast inputs never get eaten
- Win condition: fill the entire board for a perfect run

**The noodle**
- A tapering, wobbling cartoon body with a belly highlight and a flicking tail
- A swallow-bulge travels down his body every time he eats something
- Big expressive eyes whose pupils track the direction he's travelling, and lean
  toward whatever food is nearby
- Six facial expressions driven by the game state:
  - 🙂 `idle` — content, small smile
  - 👀 `hungry` — eyes wide, licking his lip, drooling (food within 4 cells)
  - 😋 `eating` — happy squeezed eyes, mid-chomp, puffed cheeks
  - 😳 `fast` — startled, tiny pupils, speed lines (level 7+)
  - 😖 `hurt` — the moment of impact
  - 💀 `dead` — X eyes, tongue lolling out

**Juice**
- Food bobs, tilts and pops in with an overshoot; a ghost of it bursts when eaten
- Floating `+10` score numbers
- Five particle effects: food crumbs, level-up sparkles, dust puffs,
  high-score confetti, and a death splat
- Screen shake and a red flash on a crash
- A speech bubble of running commentary — over 90 lines across tiered pools,
  which escalate from "YUM!" to "ABSOLUTE UNIT 🐍" as the run gets absurd.
  It deliberately stays quiet most of the time, which is what keeps it funny.

**Interface**
- Four game states — `READY`, `PLAYING`, `PAUSED`, `GAME_OVER` — each with its own card
- Sticker-style cartoon UI: chunky borders, hard offset shadows, buttons that
  physically press into the page
- Live score, persistent high score, a level/speed meter and a streak chip
- Four themes — 🍜 Hungry Noodle, 🌶️ Spicy, 🍩 Dessert Monster, 👽 Alien — which
  repaint both the board and the whole page, and persist between visits
- Fully responsive: the layout collapses to one column and the board scales to any width

**Extras**
- High score, mute and theme preference all saved to `localStorage`
- Touch controls: an on-screen direction pad plus swipe-to-steer on the board
- Procedural Web Audio sound effects, including a comedy burp every seventh snack
- Auto-pauses when you switch tabs or windows

**Accessibility**
- Every control is a real `<button>` with a label, reachable and operable by keyboard
- Visible focus rings on all interactive elements
- A polite ARIA live region announces state changes, level-ups and final scores
- The canvas carries a descriptive `aria-label` that updates as you play
- The speech bubble is `aria-hidden` so it never competes with the live region
- All four themes clear a 3:1 contrast floor between the noodle and its board
- Full `prefers-reduced-motion` support: particles, shake, bobbing, blinking and
  every CSS animation switch off

---

## Technologies used

| Technology | Used for |
| --- | --- |
| HTML5 | Semantic page structure, overlays, controls |
| CSS3 | Custom properties, grid layout, theming, animation |
| Vanilla JavaScript (ES2020+) | Game logic, state machine, input, all artwork |
| HTML5 Canvas API | Board, noodle, food, particles |
| Web Audio API | Procedurally generated sound effects |
| localStorage | High score, mute and theme persistence |

No libraries, no frameworks, no network requests.

---

## How to run

**Option 1 — just open it**

Double-click `play.html`, or drag it into any modern browser. Everything works
straight from the filesystem — the scripts are deliberately classic `<script>`
tags rather than ES modules, because browsers block module loading over `file://`.

**Option 2 — local web server** (recommended if you plan to edit files)

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .
```

Then visit <http://localhost:8000>.

Works in any current version of Chrome, Edge, Firefox or Safari.

---

## Controls

| Input | Action |
| --- | --- |
| `↑` `↓` `←` `→` | Steer the noodle |
| `W` `A` `S` `D` | Steer the noodle |
| `Space` / `Enter` | Start, pause, resume, or play again |
| `P` | Pause or resume |
| `Esc` | Pause |
| `R` | Restart the run |
| `M` | Mute or unmute sound |
| On-screen D-pad | Steer (touch devices) |
| Swipe on the board | Steer (touch devices) |

Pressing any direction key on the ready screen starts the game immediately.

---

## Project structure

```
snakegame/
├── play.html         # Page structure: HUD, canvas, overlays, controls, themes
├── style.css         # Design tokens, theming, layout, components, responsive rules
├── js/
│   ├── config.js     # Rules, enums, storage wrapper, easing helpers
│   ├── themes.js     # Four palettes + the board backdrop renderer
│   ├── art.js        # All cartoon artwork: 8 foods, the noodle's face and body
│   ├── particles.js  # Pooled particle system
│   ├── banter.js     # The joke pools and the cadence logic
│   ├── audio.js      # Procedural Web Audio sound effects
│   └── game.js       # State machine, simulation, renderer, input, UI
└── README.md
```

There is no `assets/` folder: the logo and button icons are inline SVG, the game
art is canvas paths, and the sounds are synthesised — so the game needs no
external files at all.

The modules are loaded in that order by plain `<script>` tags and each attaches
itself to one `HungryNoodle` global. `game.js` is the only one that touches the
DOM or holds state; everything else is pure.

---

## How it works

The game runs a **fixed-timestep simulation with interpolated rendering**. A
`requestAnimationFrame` loop accumulates elapsed time and advances the noodle one
cell each time it has banked a full step's worth (`150 ms` at level 1, down to
`66 ms` at level 10). Drawing happens every frame and interpolates each segment
between its previous and current cell, which is what makes fast play look smooth
rather than choppy.

A few details worth calling out:

- **Fatal moves are tested before they are applied**, so the noodle is never drawn
  inside a wall or inside itself.
- **Turns are queued, at most one applied per step.** This is what prevents the
  classic bug where tapping up-then-left in the same tick folds the snake into
  its own neck.
- **Food is picked from the list of free cells**, not by retrying random spots, so
  spawning stays fast on a nearly-full board — and an empty list is the win condition.
- **The board background is pre-rendered once per resize** (and per theme change)
  into an offscreen canvas and blitted each frame, keeping per-frame work to the
  noodle, the snack and the particles.
- **The particle pool is allocated once and reused**, with a hard cap and
  swap-removal, so a long run never allocates or drowns the renderer.
- **No `shadowBlur` anywhere in the hot path** — every soft shadow is a cheap
  offset shape instead, which is what keeps it at 60fps.
