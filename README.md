# Learn Rubix 🧊

A tiny, modern web app for **learning to solve the Rubik's cube**. Scramble the
cube, press **Solve**, and watch it solve itself one animated turn at a time — so
you can follow (and learn) every move.

![Learn Rubix](assets/preview.png)

## Features

- **Animated 3D cube** rendered with pure CSS 3D transforms — no libraries, works
  fully offline. Drag to rotate and look at any face.
- **Configurable size** — 2×2, 3×3, 4×4 and 5×5 from the settings dropdown.
- **Step-by-step solving** with play / pause, previous / next, a scrubbable move
  list, and an adjustable speed. Click any move in the list to jump to it.
- **Live 2D unfolded map** that stays in sync with the 3D cube.
- **Keyboard turns** — press `U R F D L B` to turn a face (`Shift` for
  counter-clockwise) to practise the notation yourself.

## How it works

The cube is a single physical model: every cubie carries an integer position and
an integer orientation matrix, and that *same* model drives both the solver logic
and the 3D renderer, so they can never drift out of sync.

Because the app only ever changes the cube through recorded moves, the inverse of
the (simplified) move history is always a valid, redundancy-free sequence of real
face turns that returns the cube to solved — the exact steps you watch animate.
This is correct for every cube size and never produces an invalid solution.

## Run it

Modern browsers block ES modules over `file://`, so serve the folder over http:

```bash
npm start          # serves at http://localhost:8000
# or: python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

```bash
npm test
```

Covers the move engine (every turn is a real face turn, `move⁴ = identity`,
inverses, the "sexy move" identity) and end-to-end solving (1600 random scrambles
across all sizes each solve back to a solved cube).

## Project layout

```
index.html        markup + layout
styles.css        modern dark UI
js/cube.js        physical cube model, moves, scramble, net reader
js/renderer.js    CSS-3D rendering + animated face turns
js/solver.js      solution generation
js/app.js         UI, playback controls, settings, keyboard
serve.mjs         tiny static server
test/             node test suite
```

## Controls

| Action | How |
| --- | --- |
| Rotate the view | drag the cube |
| Turn a face | click **Scramble/Solve** or press `U R F D L B` (`Shift` = prime) |
| Play / pause solve | **Play** button or `Space` |
| Step through | **◀ / ▶** buttons, or click a move chip |
| Change size | the **Cube** dropdown |
