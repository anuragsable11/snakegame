# 🐍 Snake

A modern, neon-styled take on the classic arcade Snake game — built with nothing but
HTML5, CSS3, vanilla JavaScript and the Canvas API. No frameworks, no build step,
no backend, no dependencies. Open the file and play.

---

## Features

**Gameplay**
- Classic grid-based snake movement on a 20 × 20 board
- Smooth, interpolated motion — the snake glides between cells instead of jumping
- Food spawns on a random free cell; the snake grows with every bite
- Score system: each fruit is worth `10 × current level`
- 10 difficulty levels — every 4 fruits speeds the snake up, from 150 ms to 66 ms per move
- Wall collision and self collision both end the run
- Reverse-direction moves are blocked, and turns are buffered so fast inputs never get eaten
- Win condition: fill the entire board for a perfect run

**Interface**
- Four explicit game states — `READY`, `PLAYING`, `PAUSED`, `GAME_OVER` — each with its own overlay
- Live score, persistent high score, and a level/speed meter
- Start, Pause/Resume, Restart and Mute buttons that always match the current state
- Game Over card showing final score, best score, snake length, and a "New High Score!" badge
- Dark gaming interface with neon accents, hover effects, and subtle animations
- Fully responsive — the layout collapses to a single column and the board scales to any width

**Extras**
- High score saved to `localStorage`, so it survives a refresh
- Touch controls: an on-screen direction pad plus swipe-to-steer on the board itself
- Web Audio API sound effects generated in the browser — no audio files
- Particle burst when fruit is eaten, screen flash and shake on a crash
- Auto-pauses when you switch tabs or windows

**Accessibility**
- Every control is a real `<button>` with a label, reachable and operable by keyboard
- Visible focus rings on all interactive elements
- A polite ARIA live region announces state changes, level-ups and final scores
- The canvas carries a descriptive `aria-label` that updates with the game state
- High-contrast text, and full support for `prefers-reduced-motion`

---

## Technologies used

| Technology | Used for |
| --- | --- |
| HTML5 | Semantic page structure, overlays, controls |
| CSS3 | Custom properties, grid layout, animations, responsive design |
| Vanilla JavaScript (ES2020+) | All game logic, state machine, input handling |
| HTML5 Canvas API | Board, snake, food, and particle rendering |
| Web Audio API | Procedurally generated sound effects |
| localStorage | High score and mute preference persistence |

No libraries, no frameworks, no network requests.

---

## How to run

**Option 1 — just open it**

Double-click `index.html`, or drag it into any modern browser. Everything works
straight from the filesystem.

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
| `↑` `↓` `←` `→` | Steer the snake |
| `W` `A` `S` `D` | Steer the snake |
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
├── index.html    # Page structure: HUD, canvas, overlays, controls, side panel
├── style.css     # Design tokens, layout, components, responsive rules
├── script.js     # Game state machine, simulation, rendering, input, audio
└── README.md     # This file
```

There is no `assets/` folder: the snake logo and all button icons are inline SVG,
and every sound is synthesised at runtime, so the game needs no external files.

---

## How it works

The game runs a **fixed-timestep simulation with interpolated rendering**. A
`requestAnimationFrame` loop accumulates elapsed time and advances the snake one
cell each time it has banked a full step's worth (`150 ms` at level 1, down to
`66 ms` at level 10). Drawing happens every frame and interpolates each segment
between its previous and current cell, which is what makes fast play look smooth
rather than choppy.

A few details worth calling out:

- **Fatal moves are tested before they are applied**, so the snake is never drawn
  inside a wall or inside itself.
- **Turns are queued, at most one applied per step.** This is what prevents the
  classic bug where tapping up-then-left in the same tick folds the snake into
  its own neck.
- **Food is picked from the list of free cells**, not by retrying random spots, so
  spawning stays fast on a nearly-full board — and an empty list is the win condition.
- **The grid background is pre-rendered once per resize** into an offscreen canvas
  and blitted each frame, keeping the per-frame work to the snake and the fruit.
