# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris. Three files, no dependencies, no build step, no package.json:

- `index.html` — DOM structure: `#board` canvas (300×600, the game grid), `#next-canvas` (120×120, next-piece preview), score/lines/level panel, pause/game-over overlay.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — all game logic (~300 lines), a single top-level script with module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, etc.).

## Running / testing

No build or test tooling exists. To run the game, open `index.html` directly or serve the directory statically, e.g.:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. There is no lint or test command — verify changes by playing the game in a browser.

## Architecture

`game.js` is organized around a `requestAnimationFrame` loop (`loop()`) and a handful of pure-ish helper functions operating on shared module state:

- **Board model**: `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying the piece that occupies it.
- **Pieces**: `PIECES` holds the 7 tetromino shapes as square matrices. `randomPiece()` deep-copies a shape and centers it at spawn. Rotation (`rotateCW`) is a transpose + row-reverse of the shape matrix — there is no per-piece rotation state table (no SRS), just naive 90° matrix rotation.
- **Collision** (`collide`): checks a shape against board bounds and already-locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until one doesn't collide, else the rotation is discarded.
- **Locking** (`lockPiece` → `merge` + `clearLines` + `spawn`): merges the current piece into `board`, clears full rows (shifting the matrix, not recreating it), then spawns the next piece. If the newly spawned piece immediately collides, `endGame()` fires.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` indexed by lines-cleared-at-once, multiplied by `level`. Hard drop adds 2 pts/row dropped, soft drop 1 pt/row.
- **Leveling/speed**: level = `startLevel + floor(lines / 10)`; `dropInterval = speedFor(level)` = `max(100, 1000 - (level-1)*90)` ms. `startLevel` (1–`MAX_START_LEVEL`) is chosen in the pause/game-over menu and persisted in `localStorage`.
- **Rendering** (`draw`, `drawNext`, `drawBlock`, `drawGrid`): plain Canvas 2D, redrawn fully every frame. Ghost piece is drawn first at its projected landing row (`ghostY()`) with `globalAlpha = 0.2`, then the real piece on top.
- **Input / overlay**: a single `keydown` listener. While the overlay is open (`overlayMode` is `'start'`, `'pause'`, `'controls'` or `'gameover'`), keys go to `handleMenuKey` (↑/↓ move focus, ←/→ change start level, `P`/`Escape` resume) and never reach the game; every key pressed then is added to `blockedKeys` and ignored by the game until released, so held keys don't move the piece after resuming. In play, `P`/`Escape` pause; arrows, `KeyX` and `Space` move the piece. `showOverlay(mode)` shows the `#overlay` children whose `data-show` lists that mode. Keys typed into the high-score name input are ignored by the listener.
- **High scores**: top 5 (`MAX_HIGHSCORES`) stored in `localStorage` (`tetris-highscores`), shown on the start screen and on game over. If a finished game qualifies, `showRecordPrompt()` shows the name form; the record is saved on submit or when a new game starts (`commitPendingRecord()` in `init()`).
- **Skins**: `applySkin(name)` picks a palette and block-drawing function (Retro, Neon, Pastel, Pixel art) from the `#skin-select` dropdown, persisted in `localStorage` (`tetris-skin`).

When tuning game feel, the relevant constants are all at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, and the initial `dropInterval` set in `init()`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK` by `ROWS × BLOCK`).
