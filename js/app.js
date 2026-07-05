// app.js — wires the model, renderer and solver into a small, modern UI:
// pick a size, scramble, then watch the cube solve itself one animated turn at a
// time with full play / pause / step controls, a live move list and a 2D net.

import { Cube, randomScramble, invertMove, moveName, FACE_MOVE_SET } from './cube.js';
import { Renderer, COLORS } from './renderer.js';
import { solveFromHistory } from './solver.js';

const $ = (sel) => document.querySelector(sel);

class App {
  constructor() {
    this.size = 3;
    this.cube = new Cube(this.size);
    this.renderer = new Renderer($('#scene'));
    this.renderer.setCube(this.cube);

    this.history = [];      // moves applied since the last solved state
    this.solution = [];     // planned solve moves (fixed while playing)
    this.playIndex = 0;     // how many solution moves have been played
    this.playing = false;
    this.busy = false;

    this._bindUI();
    this._buildNet();
    this.refresh();
    this.setStatus('Drag to rotate. Press Scramble to begin.');
  }

  // ---- helpers ------------------------------------------------------------

  duration() {
    const s = Number($('#speed').value); // 1..10
    return Math.round(760 - s * 62);      // ~700ms slow .. ~140ms fast
  }

  scrambleLength() {
    return this.size <= 2 ? 11 : this.size === 3 ? 22 : 34;
  }

  setStatus(msg) { $('#status').textContent = msg; }

  lock(v) {
    this.busy = v;
    for (const id of ['scramble', 'solve', 'reset', 'size', 'stepBack', 'play', 'stepFwd']) {
      const el = document.getElementById(id);
      if (el) el.toggleAttribute('disabled', v && id !== 'play');
    }
  }

  // ---- core actions -------------------------------------------------------

  async setSize(n) {
    if (this.busy) return;
    this.playing = false;
    this.size = n;
    this.cube = new Cube(n);
    this.renderer.setCube(this.cube);
    this.history = []; this.solution = []; this.playIndex = 0;
    this._buildNet();
    this.refresh();
    this.setStatus(`${n}×${n}×${n} cube ready.`);
  }

  async reset() {
    if (this.busy) return;
    this.playing = false;
    this.cube = new Cube(this.size);
    this.renderer.setCube(this.cube);
    this.history = []; this.solution = []; this.playIndex = 0;
    this.refresh();
    this.setStatus('Reset to a solved cube.');
  }

  async scramble() {
    if (this.busy) return;
    this.playing = false;
    this.solution = []; this.playIndex = 0;
    const seq = randomScramble(this.size, this.scrambleLength());
    this.lock(true);
    this.setStatus('Scrambling…');
    for (const mv of seq) {
      await this.renderer.animateMove(mv, 120);
      this.history.push(mv);
    }
    this.lock(false);
    this.refresh();
    this.setStatus('Scrambled! Press Solve to learn the steps.');
  }

  solve() {
    if (this.busy) return;
    const sol = solveFromHistory(this.history);
    if (sol.length === 0) { this.setStatus('The cube is already solved 🎉'); return; }
    this.solution = sol;
    this.playIndex = 0;
    this.refresh();
    this.setStatus(`Solution found in ${sol.length} moves. Playing…`);
    this.play();
  }

  async play() {
    if (this.busy || this.solution.length === 0) return;
    if (this.playIndex >= this.solution.length) return;
    this.playing = true;
    this.refresh();
    while (this.playing && this.playIndex < this.solution.length) {
      await this._advance();
    }
    this.playing = false;
    if (this.cube.isSolved()) { this.history = []; this.setStatus('Solved! 🎉 Nicely done.'); }
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
    this.solution = []; this.playIndex = 0;
    this.busy = true;
    await this.renderer.animateMove(token, this.duration());
    this.history.push(token);
    if (this.cube.isSolved()) this.history = [];
    this.busy = false;
    this.refresh();
    this.setStatus(`You turned ${token} — ${moveName(token)}`);
  }

  // ---- UI rendering -------------------------------------------------------

  refresh() {
    // playback buttons
    const play = $('#play');
    play.textContent = this.playing ? '❚❚ Pause' : '► Play';
    $('#stepBack').toggleAttribute('disabled', this.busy || this.playIndex <= 0);
    $('#stepFwd').toggleAttribute('disabled', this.busy || this.playIndex >= this.solution.length);
    play.toggleAttribute('disabled', this.solution.length === 0);

    // progress
    const total = this.solution.length;
    $('#progress').textContent = total ? `${this.playIndex} / ${total}` : '—';
    const bar = $('#bar');
    bar.style.width = total ? `${(this.playIndex / total) * 100}%` : '0%';

    // move list
    const list = $('#moves');
    if (total === 0) {
      list.innerHTML = '<span class="hint">No solution yet. Scramble, then Solve.</span>';
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
    }

    this._paintNet();
  }

  async jumpTo(i) {
    if (this.busy) return;
    this.playing = false;
    while (this.playIndex < i && !this.busy) await this._advance();
    while (this.playIndex > i && !this.busy) await this._retreat();
  }

  // ---- 2D net -------------------------------------------------------------

  _buildNet() {
    const net = $('#net');
    net.innerHTML = '';
    // cross layout positions (col,row) in a 4x3 grid of faces
    const layout = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
    net.style.setProperty('--n', this.size);
    this.netCells = {};
    for (const [face, [cx, cy]] of Object.entries(layout)) {
      const f = document.createElement('div');
      f.className = 'netface';
      f.style.gridColumn = cx + 1;
      f.style.gridRow = cy + 1;
      const cells = [];
      for (let i = 0; i < this.size * this.size; i++) {
        const c = document.createElement('div');
        c.className = 'netcell';
        f.appendChild(c);
        cells.push(c);
      }
      net.appendChild(f);
      this.netCells[face] = cells;
    }
  }

  _paintNet() {
    if (!this.netCells) return;
    for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
      const grid = this.cube.readFace(face);
      const cells = this.netCells[face];
      let k = 0;
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          cells[k++].style.background = COLORS[grid[r][c]] || '#222';
        }
      }
    }
  }

  // ---- input --------------------------------------------------------------

  _bindUI() {
    $('#scramble').addEventListener('click', () => this.scramble());
    $('#solve').addEventListener('click', () => this.solve());
    $('#reset').addEventListener('click', () => this.reset());
    $('#play').addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    $('#stepBack').addEventListener('click', () => this.stepBack());
    $('#stepFwd').addEventListener('click', () => this.stepForward());
    $('#resetView').addEventListener('click', () => this.renderer.resetView());
    $('#size').addEventListener('change', (e) => this.setSize(Number(e.target.value)));

    // keyboard: U R F D L B (+ shift for counter-clockwise, +alt/2 for double)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key.toUpperCase();
      if (FACE_MOVE_SET.includes(k)) {
        let tok = k;
        if (e.shiftKey) tok += "'";
        this.manualMove(tok);
      } else if (e.key === ' ') {
        e.preventDefault();
        this.playing ? this.pause() : (this.solution.length ? this.play() : this.scramble());
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
