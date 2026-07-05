// app.js — wires the model, renderer and solver into the UI: pick a size or scan
// a real cube from photos, then watch it solve itself one animated, labelled step
// at a time with manual or timed playback.

import { Cube, randomScramble, invertMove, moveName, FACE_MOVE_SET, FACE_LETTERS, FACE_COLOR, validateFacelets }
  from './cube.js';
import { Renderer, COLORS } from './renderer.js';
import { solve } from './solver.js';
import { detectGrid } from './scan.js';

const $ = (s) => document.querySelector(s);

class App {
  constructor() {
    this.size = 3;
    this.cube = new Cube(this.size);
    this.renderer = new Renderer($('#scene'));
    this.renderer.setCube(this.cube);

    this.history = [];
    this.solution = [];
    this.phases = [];
    this.playIndex = 0;
    this.playing = false;
    this.busy = false;
    this.pace = $('#pace').value;

    this._bindUI();
    this._buildNet();
    this.refresh();
    this.setStatus('Drag to rotate. Scramble, or scan your own cube with a photo.');
  }

  // ---- helpers ------------------------------------------------------------

  duration() {
    if (this.pace === 'manual') return 340;
    return Math.max(200, Math.min(620, Math.round(Number(this.pace) * 0.4)));
  }

  scrambleLength() { return this.size <= 2 ? 11 : this.size === 3 ? 22 : 34; }
  setStatus(msg) { $('#status').textContent = msg; }
  sleep(ms) {
    return new Promise((res) => {
      if (ms <= 0) return res();
      const start = performance.now();
      const tick = () => {
        if (!this.playing || performance.now() - start >= ms) return res();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  lockControls(v) {
    for (const id of ['scramble', 'solve', 'reset', 'size', 'scan']) {
      const el = document.getElementById(id);
      if (el) el.toggleAttribute('disabled', v);
    }
  }

  // ---- core actions -------------------------------------------------------

  async setSize(n) {
    if (this.busy) return;
    this.playing = false;
    this.size = n;
    this.cube = new Cube(n);
    this.renderer.setCube(this.cube);
    this.history = []; this.solution = []; this.phases = []; this.playIndex = 0;
    this._buildNet();
    this.refresh();
    this.setStatus(`${n}×${n}×${n} cube ready.`);
  }

  async reset() {
    if (this.busy) return;
    this.playing = false;
    this.cube = new Cube(this.size);
    this.renderer.setCube(this.cube);
    this.history = []; this.solution = []; this.phases = []; this.playIndex = 0;
    this.refresh();
    this.setStatus('Reset to a solved cube.');
  }

  async scramble() {
    if (this.busy) return;
    this.playing = false;
    this.solution = []; this.phases = []; this.playIndex = 0;
    const seq = randomScramble(this.size, this.scrambleLength());
    this.lockControls(true); this.busy = true;
    this.setStatus('Scrambling…');
    for (const mv of seq) { await this.renderer.animateMove(mv, 120); this.history.push(mv); }
    this.busy = false; this.lockControls(false);
    this.refresh();
    this.setStatus('Scrambled! Press Solve to learn the steps.');
  }

  solveCurrent() {
    if (this.busy) return;
    if (this.cube.isSolved()) { this.setStatus('The cube is already solved 🎉'); return; }
    this.setStatus('Working out the solution…');
    // let the status paint before the (synchronous) solve
    setTimeout(() => {
      const { moves, phases } = solve(this.cube, this.history);
      if (!moves.length) { this.setStatus('The cube is already solved 🎉'); return; }
      this.solution = moves;
      this.phases = phases || [];
      this.playIndex = 0;
      this.refresh();
      const kind = this.phases.length ? 'beginner method' : 'solution';
      this.setStatus(`${kind}: ${moves.length} moves.${this.pace === 'manual' ? ' Press Next.' : ' Playing…'}`);
      if (this.pace !== 'manual') this.play();
    }, 20);
  }

  async play() {
    if (this.busy || this.pace === 'manual' || !this.solution.length) return;
    if (this.playIndex >= this.solution.length) return;
    const dwell = Number(this.pace);
    this.playing = true;
    this.refresh();
    while (this.playing && this.playIndex < this.solution.length) {
      await this._advance();
      if (this.playing && this.playIndex < this.solution.length) await this.sleep(dwell);
    }
    this.playing = false;
    if (this.cube.isSolved()) { this.history = []; this.setStatus('Solved! 🎉 Well done.'); }
    else this.setStatus('Paused.');
    this.refresh();
  }

  pause() { this.playing = false; }

  async _advance() {
    const mv = this.solution[this.playIndex];
    this.busy = true;
    this.setStatus(`Move ${this.playIndex + 1}/${this.solution.length}: ${mv} — ${moveName(mv)}`);
    await this.renderer.animateMove(mv, this.duration());
    this.history.push(mv);
    this.playIndex++;
    this.busy = false;
    this.refresh();
  }

  async _retreat() {
    const mv = this.solution[this.playIndex - 1];
    this.busy = true;
    await this.renderer.animateMove(invertMove(mv), this.duration());
    this.history.pop();
    this.playIndex--;
    this.busy = false;
    this.refresh();
  }

  async stepForward() {
    if (this.busy || this.playIndex >= this.solution.length) return;
    this.playing = false;
    await this._advance();
    if (this.cube.isSolved()) { this.history = []; this.setStatus('Solved! 🎉'); this.refresh(); }
  }

  async stepBack() {
    if (this.busy || this.playIndex <= 0) return;
    this.playing = false;
    await this._retreat();
  }

  async manualMove(token) {
    if (this.busy || this.playing) return;
    this.solution = []; this.phases = []; this.playIndex = 0;
    this.busy = true;
    await this.renderer.animateMove(token, this.duration());
    this.history.push(token);
    if (this.cube.isSolved()) this.history = [];
    this.busy = false;
    this.refresh();
    this.setStatus(`You turned ${token} — ${moveName(token)}`);
  }

  async jumpTo(i) {
    if (this.busy) return;
    this.playing = false;
    while (this.playIndex < i && !this.busy) await this._advance();
    while (this.playIndex > i && !this.busy) await this._retreat();
  }

  // ---- UI rendering -------------------------------------------------------

  currentPhase() {
    if (!this.phases.length) return '';
    const idx = Math.min(this.playIndex, this.solution.length - 1);
    for (let i = 0; i < this.phases.length; i++) {
      const p = this.phases[i];
      if (idx >= p.start && idx < p.end) return `Step ${i + 1}/${this.phases.length} — ${p.name}`;
    }
    return this.playIndex >= this.solution.length ? 'Solved' : this.phases[0].name;
  }

  refresh() {
    const play = $('#play');
    play.textContent = this.playing ? '❚❚ Pause' : '► Play';
    const manual = this.pace === 'manual';
    play.toggleAttribute('disabled', this.solution.length === 0 || manual);
    play.style.opacity = manual ? 0.5 : '';
    $('#stepBack').toggleAttribute('disabled', this.busy || this.playIndex <= 0);
    $('#stepFwd').toggleAttribute('disabled', this.busy || this.playIndex >= this.solution.length);

    const total = this.solution.length;
    $('#progress').textContent = total ? `${this.playIndex} / ${total}` : '—';
    $('#bar').style.width = total ? `${(this.playIndex / total) * 100}%` : '0%';
    $('#phase').textContent = this.currentPhase();

    const list = $('#moves');
    if (total === 0) {
      list.innerHTML = '<span class="hint">No solution yet. Scramble or scan, then Solve.</span>';
    } else {
      list.innerHTML = '';
      this.solution.forEach((mv, i) => {
        const chip = document.createElement('button');
        chip.className = 'chip' + (i < this.playIndex ? ' done' : '') + (i === this.playIndex ? ' current' : '');
        chip.textContent = mv;
        chip.title = moveName(mv);
        chip.addEventListener('click', () => this.jumpTo(i));
        list.appendChild(chip);
      });
      const cur = list.querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    this._paintNet();
  }

  // ---- 2D net (read-only, in the side panel) ------------------------------

  _buildNet() {
    const net = $('#net');
    net.innerHTML = '';
    const layout = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
    net.style.setProperty('--n', this.size);
    this.netCells = {};
    for (const [face, [cx, cy]] of Object.entries(layout)) {
      const f = document.createElement('div');
      f.className = 'netface';
      f.style.gridColumn = cx + 1; f.style.gridRow = cy + 1;
      const cells = [];
      for (let i = 0; i < this.size * this.size; i++) {
        const c = document.createElement('div'); c.className = 'netcell'; f.appendChild(c); cells.push(c);
      }
      net.appendChild(f);
      this.netCells[face] = cells;
    }
  }

  _paintNet() {
    if (!this.netCells) return;
    for (const face of FACE_LETTERS) {
      const grid = this.cube.readFace(face);
      const cells = this.netCells[face];
      let k = 0;
      for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) cells[k++].style.background = COLORS[grid[r][c]] || '#222';
    }
  }

  // ---- scan modal ---------------------------------------------------------

  openScan() {
    if (this.busy) return;
    this.brush = 'R';
    this.scanFacelets = {};
    for (const f of FACE_LETTERS) {
      const g = [];
      for (let r = 0; r < 3; r++) { g.push([null, null, null]); }
      g[1][1] = FACE_COLOR[f]; // fixed centre
      this.scanFacelets[f] = g;
    }
    this._buildScanUI();
    $('#scanStatus').textContent = '';
    $('#scanModal').classList.remove('hidden');
  }

  closeScan() { $('#scanModal').classList.add('hidden'); }

  _buildScanUI() {
    // palette
    const pal = $('#palette');
    pal.innerHTML = '';
    for (const [letter, name] of [['W', 'White'], ['Y', 'Yellow'], ['R', 'Red'], ['O', 'Orange'], ['G', 'Green'], ['B', 'Blue']]) {
      const b = document.createElement('button');
      b.className = 'swatch' + (letter === this.brush ? ' active' : '');
      b.style.background = COLORS[letter];
      b.title = name;
      b.addEventListener('click', () => {
        this.brush = letter;
        pal.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
        b.classList.add('active');
      });
      pal.appendChild(b);
    }

    // net of editable faces
    const net = $('#scanNet');
    net.innerHTML = '';
    const layout = { U: [2, 1], L: [1, 2], F: [2, 2], R: [3, 2], B: [4, 2], D: [2, 3] };
    for (const [face, [cx, cy]] of Object.entries(layout)) {
      const wrap = document.createElement('div');
      wrap.className = 'scan-face';
      wrap.style.gridColumn = cx; wrap.style.gridRow = cy;

      const label = document.createElement('div');
      label.className = 'scan-face-label';
      label.textContent = face;
      wrap.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'scan-grid';
      const cells = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const cell = document.createElement('button');
        cell.className = 'scan-cell';
        const isCenter = r === 1 && c === 1;
        if (isCenter) cell.classList.add('center');
        else cell.addEventListener('click', () => { this.scanFacelets[face][r][c] = this.brush; this._paintScan(); });
        grid.appendChild(cell);
        cells.push(cell);
      }
      wrap.appendChild(grid);
      this.scanFacelets[face]._cells = cells;

      // photo button
      const photo = document.createElement('label');
      photo.className = 'scan-photo';
      photo.innerHTML = '📷 Photo';
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
      input.style.display = 'none';
      input.addEventListener('change', (e) => this._onPhoto(face, e.target.files[0]));
      photo.appendChild(input);
      wrap.appendChild(photo);

      net.appendChild(wrap);
    }
    this._paintScan();
  }

  _onPhoto(face, file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const grid = detectGrid(img, 3);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue; // keep centre fixed
        this.scanFacelets[face][r][c] = grid[r][c];
      }
      this._paintScan();
      $('#scanStatus').textContent = `Read the ${face} face — check the colours and fix any that look wrong.`;
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => { $('#scanStatus').textContent = 'Could not read that image.'; };
    img.src = URL.createObjectURL(file);
  }

  _paintScan() {
    for (const f of FACE_LETTERS) {
      const cells = this.scanFacelets[f]._cells;
      if (!cells) continue;
      let k = 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const col = this.scanFacelets[f][r][c];
        cells[k].style.background = col ? COLORS[col] : 'transparent';
        cells[k].classList.toggle('empty', !col);
        k++;
      }
    }
  }

  clearScan() {
    for (const f of FACE_LETTERS) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if (!(r === 1 && c === 1)) this.scanFacelets[f][r][c] = null;
    }
    this._paintScan();
    $('#scanStatus').textContent = '';
  }

  scanSolve() {
    const facelets = {};
    for (const f of FACE_LETTERS) facelets[f] = this.scanFacelets[f].map((row) => row.slice());
    const res = validateFacelets(3, facelets);
    if (!res.ok) { $('#scanStatus').textContent = '⚠ ' + res.reason; return; }
    // reconstruct and solve
    this.size = 3; $('#size').value = '3';
    this.cube = res.cube;
    this.renderer.setCube(this.cube);
    this.history = []; this.solution = []; this.phases = []; this.playIndex = 0;
    this._buildNet();
    this.closeScan();
    if (this.cube.isSolved()) { this.refresh(); this.setStatus('That cube is already solved 🎉'); return; }
    this.refresh();
    this.solveCurrent();
  }

  // ---- input --------------------------------------------------------------

  _bindUI() {
    $('#scramble').addEventListener('click', () => this.scramble());
    $('#solve').addEventListener('click', () => this.solveCurrent());
    $('#reset').addEventListener('click', () => this.reset());
    $('#play').addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    $('#stepBack').addEventListener('click', () => this.stepBack());
    $('#stepFwd').addEventListener('click', () => this.stepForward());
    $('#resetView').addEventListener('click', () => this.renderer.resetView());
    $('#size').addEventListener('change', (e) => this.setSize(Number(e.target.value)));
    $('#pace').addEventListener('change', (e) => { this.pace = e.target.value; this.refresh(); });

    $('#scan').addEventListener('click', () => this.openScan());
    $('#scanClose').addEventListener('click', () => this.closeScan());
    $('#scanClear').addEventListener('click', () => this.clearScan());
    $('#scanSolve').addEventListener('click', () => this.scanSolve());
    $('#scanModal').addEventListener('click', (e) => { if (e.target.id === 'scanModal') this.closeScan(); });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (!$('#scanModal').classList.contains('hidden')) return;
      const k = e.key.toUpperCase();
      if (FACE_MOVE_SET.includes(k)) this.manualMove(k + (e.shiftKey ? "'" : ''));
      else if (e.key === 'ArrowRight') this.stepForward();
      else if (e.key === 'ArrowLeft') this.stepBack();
      else if (e.key === ' ') {
        e.preventDefault();
        this.playing ? this.pause() : (this.solution.length ? this.play() : this.scramble());
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
