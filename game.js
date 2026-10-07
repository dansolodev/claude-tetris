'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paletas por skin, indexadas por tipo de pieza: I, O, T, S, Z, J, L, N
const RETRO_COLORS = [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#5c9dff', '#ffb74d', '#9aa5b1'];
const NEON_COLORS = [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2b6bff', '#ff8c00', '#c0c8d0'];
const PASTEL_COLORS = [null, '#a8e6ef', '#fdf1a6', '#d9b8f0', '#b8e6b8', '#f7b2b7', '#aac8f5', '#fcd0a1', '#d3d8de'];
const PIXEL_COLORS = [null, '#3cbcfc', '#f8b800', '#9878f8', '#58d854', '#e40058', '#0058f8', '#f87858', '#a4a4a4'];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 10;
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'Space'];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');
const startLevelEl = document.getElementById('start-level');
const themeToggle = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const skinSelect = document.getElementById('skin-select');
const START_LEVEL_KEY = 'tetris-start-level';
const themeVars = { gridLine: '#22222e', blockHighlight: 'rgba(255,255,255,0.12)', blockBorder: 'transparent' };

let skin;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = clampLevel(parseInt(localStorage.getItem(START_LEVEL_KEY), 10) || 1);
// 'none' | 'pause' | 'controls' | 'gameover'
let overlayMode = 'none';
// Teclas pulsadas mientras el menú estaba abierto: se ignoran hasta soltarlas
// para que no muevan la pieza al reanudar.
const blockedKeys = new Set();

function clampLevel(n) {
  return Math.min(MAX_START_LEVEL, Math.max(1, n));
}

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  const styles = getComputedStyle(document.body);
  themeVars.gridLine = styles.getPropertyValue('--grid-line').trim();
  themeVars.blockHighlight = styles.getPropertyValue('--block-highlight').trim();
  themeVars.blockBorder = styles.getPropertyValue('--block-border').trim();
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = speedFor(level);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins: cada una aporta su paleta, fondo/grid opcionales y su función de bloque ----

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = themeVars.blockHighlight;
  context.fillRect(px + 1, py + 1, size - 2, 4);
  if (themeVars.blockBorder !== 'transparent') {
    context.strokeStyle = themeVars.blockBorder;
    context.lineWidth = 1;
    context.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
  }
}

function drawNeonBlock(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 6;
  context.fillStyle = color;
  context.globalAlpha *= 0.35;
  context.fillRect(px + 5, py + 5, size - 10, size - 10);
  context.shadowBlur = 0;
}

function drawPastelBlock(context, px, py, size, color) {
  const r = size * 0.25;
  roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  context.lineWidth = 1.5;
  context.stroke();
  // brillo suave arriba a la izquierda
  roundRectPath(context, px + 6, py + 5, size * 0.4, size * 0.18, size * 0.09);
  context.fillStyle = 'rgba(255, 255, 255, 0.55)';
  context.fill();
}

// Patrón 10×10 de "píxeles": 1 = luz, 2 = sombra
const PIXEL_PATTERN = [
  '1111111112',
  '1100000022',
  '1000000002',
  '1001100002',
  '1001000002',
  '1000000002',
  '1000000202',
  '1000002202',
  '1000000002',
  '2222222222',
];

function drawPixelBlock(context, px, py, size, color) {
  const u = size / 10;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const v = PIXEL_PATTERN[r][c];
      if (v === '0') continue;
      context.fillStyle = v === '1' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.35)';
      context.fillRect(Math.floor(px + c * u), Math.floor(py + r * u), Math.ceil(u), Math.ceil(u));
    }
  }
}

const SKINS = {
  retro:  { colors: RETRO_COLORS,  drawBlock: drawRetroBlock },
  neon:   { colors: NEON_COLORS,   drawBlock: drawNeonBlock,   gridLine: '#0d0d1a' },
  pastel: { colors: PASTEL_COLORS, drawBlock: drawPastelBlock },
  pixel:  { colors: PIXEL_COLORS,  drawBlock: drawPixelBlock },
};

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  document.body.dataset.skin = name;
  skinSelect.value = name;
  localStorage.setItem(SKIN_KEY, name);
  if (next) drawNext();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = skin.gridLine || themeVars.gridLine;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function showOverlay(mode) {
  overlayMode = mode;
  overlay.classList.toggle('hidden', mode === 'none');
  for (const el of overlay.querySelectorAll('[data-show]'))
    el.classList.toggle('hidden', !el.dataset.show.split(' ').includes(mode));
  if (mode === 'pause') {
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
  } else if (mode === 'controls') {
    overlayTitle.textContent = 'CONTROLES';
    overlayScore.textContent = '';
  } else if (mode === 'gameover') {
    overlayTitle.textContent = 'GAME OVER';
    overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  }
  const focusTarget = { pause: resumeBtn, controls: controlsBackBtn, gameover: restartBtn }[mode];
  if (focusTarget) focusTarget.focus();
  else if (document.activeElement && overlay.contains(document.activeElement)) document.activeElement.blur();
}

function renderStartLevel() {
  startLevelEl.textContent = startLevel;
  levelDownBtn.disabled = startLevel <= 1;
  levelUpBtn.disabled = startLevel >= MAX_START_LEVEL;
}

function changeStartLevel(delta) {
  startLevel = clampLevel(startLevel + delta);
  localStorage.setItem(START_LEVEL_KEY, startLevel);
  renderStartLevel();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  showOverlay('gameover');
}

function pause() {
  if (gameOver || paused) return;
  paused = true;
  cancelAnimationFrame(animId);
  showOverlay('pause');
}

function resume() {
  if (!paused) return;
  paused = false;
  showOverlay('none');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

// Navegación con teclado dentro del menú (↑/↓ entre botones, ←/→ en el selector de nivel).
function handleMenuKey(e) {
  const isToggle = e.code === 'KeyP' || e.code === 'Escape';
  if (isToggle && !e.repeat) {
    if (overlayMode === 'controls' && e.code === 'Escape') showOverlay('pause');
    else if (overlayMode !== 'gameover') resume();
    e.preventDefault();
    return;
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    const items = [...overlay.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const step = e.code === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
    e.preventDefault();
  } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && overlayMode !== 'controls') {
    changeStartLevel(e.code === 'ArrowRight' ? 1 : -1);
    const fallback = e.code === 'ArrowRight' ? levelDownBtn : levelUpBtn;
    if (document.activeElement.disabled) fallback.focus();
    e.preventDefault();
  } else if (e.code === 'Space' && !(document.activeElement instanceof HTMLButtonElement)) {
    e.preventDefault();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = speedFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
  next = randomPiece();
  spawn();
  updateHUD();
  showOverlay('none');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (overlayMode !== 'none') {
    blockedKeys.add(e.code);
    handleMenuKey(e);
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) pause(); return; }
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (blockedKeys.has(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => blockedKeys.delete(e.code));
window.addEventListener('blur', () => blockedKeys.clear());

restartBtn.addEventListener('click', init);
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resume);
controlsBtn.addEventListener('click', () => showOverlay('controls'));
controlsBackBtn.addEventListener('click', () => showOverlay('pause'));
levelDownBtn.addEventListener('click', () => changeStartLevel(-1));
levelUpBtn.addEventListener('click', () => changeStartLevel(1));
themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
  if (next) drawNext();
});
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  if (paused || gameOver) draw();
  skinSelect.blur(); // evita que las flechas del juego cambien la skin
});

renderStartLevel();
init();
