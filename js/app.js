// app.js — wires the model, renderer and solver into the UI: pick a size or scan
// a real cube from photos, then watch it solve itself one animated, labelled step
// at a time with manual or timed playback.

import { Cube, randomScramble, invertMove, moveName, FACE_MOVE_SET, FACE_LETTERS, FACE_COLOR, validateFacelets }
  from './cube.js';
import { Renderer, COLORS } from './renderer.js';
import { solve } from './solver.js';
import { detectGrid, sampleCornerHex, samplePoints, hexVertices, rotateGrid, autoFitHex } from './scan.js';

const $ = (s) => document.querySelector(s);

// Vietnamese names for the solver's phases (the solver keeps English keys).
const PHASES_VI = {
  'Bottom cross': 'Thập tự đáy',
  'Bottom corners': 'Góc tầng đáy',
  'Middle layer': 'Tầng giữa',
  'Top cross': 'Thập tự đỉnh',
  'Orient top corners': 'Xoay hướng góc đỉnh',
  'Place top corners': 'Đặt vị trí góc đỉnh',
  'Finish top edges': 'Hoàn tất cạnh đỉnh',
};

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
    this.setStatus('Kéo để xoay. Nhấn Xáo trộn, hoặc quét khối của bạn bằng ảnh.');
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
    this.setStatus(`Khối ${n}×${n}×${n} đã sẵn sàng.`);
  }

  async reset() {
    if (this.busy) return;
    this.playing = false;
    this.cube = new Cube(this.size);
    this.renderer.setCube(this.cube);
    this.history = []; this.solution = []; this.phases = []; this.playIndex = 0;
    this.refresh();
    this.setStatus('Đã đặt lại về khối đã giải.');
  }

  async scramble() {
    if (this.busy) return;
    this.playing = false;
    this.solution = []; this.phases = []; this.playIndex = 0;
    const seq = randomScramble(this.size, this.scrambleLength());
    this.lockControls(true); this.busy = true;
    this.setStatus('Đang xáo trộn…');
    for (const mv of seq) { await this.renderer.animateMove(mv, 120); this.history.push(mv); }
    this.busy = false; this.lockControls(false);
    this.refresh();
    this.setStatus('Đã xáo trộn! Nhấn Giải để xem các bước.');
  }

  solveCurrent() {
    if (this.busy) return;
    if (this.cube.isSolved()) { this.setStatus('Khối đã được giải rồi 🎉'); return; }
    this.setStatus('Đang tính lời giải…');
    // let the status paint before the (synchronous) solve
    setTimeout(() => {
      const { moves, phases } = solve(this.cube, this.history);
      if (!moves.length) { this.setStatus('Khối đã được giải rồi 🎉'); return; }
      this.solution = moves;
      this.phases = phases || [];
      this.playIndex = 0;
      this.refresh();
      const kind = this.phases.length ? 'Phương pháp cơ bản' : 'Lời giải';
      this.setStatus(`${kind}: ${moves.length} nước.${this.pace === 'manual' ? ' Nhấn Sau để đi từng bước.' : ' Đang chạy…'}`);
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
    if (this.cube.isSolved()) { this.history = []; this.setStatus('Đã giải xong! 🎉 Làm tốt lắm.'); }
    else this.setStatus('Tạm dừng.');
    this.refresh();
  }

  pause() { this.playing = false; }

  async _advance() {
    const mv = this.solution[this.playIndex];
    this.busy = true;
    this.setStatus(`Nước ${this.playIndex + 1}/${this.solution.length}: ${mv} — ${moveName(mv)}`);
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
    if (this.cube.isSolved()) { this.history = []; this.setStatus('Đã giải xong! 🎉'); this.refresh(); }
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
    this.setStatus(`Bạn vừa xoay ${token} — ${moveName(token)}`);
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
      if (idx >= p.start && idx < p.end) return `Bước ${i + 1}/${this.phases.length} — ${PHASES_VI[p.name] || p.name}`;
    }
    return this.playIndex >= this.solution.length ? 'Đã giải xong' : (PHASES_VI[this.phases[0].name] || this.phases[0].name);
  }

  refresh() {
    const play = $('#play');
    play.textContent = this.playing ? '❚❚ Dừng' : '► Chạy';
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
      list.innerHTML = '<span class="hint">Chưa có lời giải. Hãy Xáo trộn hoặc quét ảnh, rồi nhấn Giải.</span>';
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
    $('#scanMain').classList.remove('hidden');
    $('#alignView').classList.add('hidden');
    $('#scanModal').classList.remove('hidden');
  }

  closeScan() { $('#scanModal').classList.add('hidden'); }

  _buildScanUI() {
    // palette
    const pal = $('#palette');
    pal.innerHTML = '';
    for (const [letter, name] of [['W', 'Trắng'], ['Y', 'Vàng'], ['R', 'Đỏ'], ['O', 'Cam'], ['G', 'Xanh lá'], ['B', 'Xanh dương']]) {
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

      const tools = document.createElement('div');
      tools.className = 'scan-tools';
      const rot = document.createElement('button');
      rot.className = 'scan-rot'; rot.textContent = '⟲'; rot.title = 'Xoay cả mặt này';
      rot.addEventListener('click', () => {
        const g = rotateGrid(this.scanFacelets[face].slice(0, 3), 1);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.scanFacelets[face][r][c] = g[r][c];
        this._paintScan();
      });
      const photo = document.createElement('label');
      photo.className = 'scan-photo';
      photo.textContent = '📷';
      photo.title = 'Chụp riêng mặt này';
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.style.display = 'none';
      input.addEventListener('change', (e) => this._onPhoto(face, e.target.files[0]));
      photo.appendChild(input);
      tools.appendChild(rot); tools.appendChild(photo);
      wrap.appendChild(tools);

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
      $('#scanStatus').textContent = `Đã đọc mặt ${face} — kiểm tra và sửa lại màu nào chưa đúng.`;
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => { $('#scanStatus').textContent = 'Không đọc được ảnh này.'; };
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

  // ---- quick scan: two corner photos, three faces each --------------------

  QUICK_STEPS = [
    { faces: { top: 'U', left: 'F', right: 'R' }, hint: 'Ảnh 1/2 — cầm TRẮNG ở trên, XANH LÁ hướng vào bạn (dưới-trái), ĐỎ bên phải, rồi chụp góc. Sau đó chỉnh các chấm trùm lên 3 mặt.' },
    { faces: { top: 'D', left: 'L', right: 'B' }, hint: 'Ảnh 2/2 — lật sang góc đối diện: VÀNG ở trên, CAM ở dưới-trái, XANH DƯƠNG bên phải. Sau đó chỉnh các chấm trùm lên 3 mặt.' },
  ];

  startQuickScan() {
    this.quickStep = 0;
    this._showAlign();
  }

  _showAlign() {
    $('#scanMain').classList.add('hidden');
    $('#alignView').classList.remove('hidden');
    $('#alignHint').textContent = this.QUICK_STEPS[this.quickStep].hint;
    $('#alignRead').toggleAttribute('disabled', true);
    this.alignImg = null;
    this._dragKey = null; this._panning = false; this._pinch = null;
    const cv = $('#alignCanvas');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    $('#alignUpload').style.display = '';
    $('#alignFile').value = '';
    $('#alignZoom').value = 1; $('#alignRotate').value = 0;
  }

  _hideAlign() {
    $('#alignView').classList.add('hidden');
    $('#scanMain').classList.remove('hidden');
  }

  _loadAlignPhoto(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const size = 340;
      const src = document.createElement('canvas');
      src.width = size; src.height = size;
      this.alignSrc = src.getContext('2d', { willReadFrequently: true });
      this.alignImage = img;
      this.imgT = { scale: 1, angle: 0, tx: 0, ty: 0 }; // pan / zoom / rotate
      $('#alignZoom').value = 1; $('#alignRotate').value = 0;
      this.alignImg = true;
      this._drawSource();
      // try to locate the cube automatically; fall back to a centred frame
      const auto = autoFitHex(this.alignSrc, size);
      const v = auto || hexVertices({ cx: size / 2, cy: size / 2, R: size * 0.3 });
      this.handles = { T: v.T, UR: v.UR, LR: v.LR, Bo: v.Bo, LL: v.LL, UL: v.UL, Ce: v.Ce };
      $('#alignUpload').style.display = 'none';
      $('#alignRead').toggleAttribute('disabled', false);
      this._redrawAlign();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  // Draw the photo into the (offscreen) sampling canvas with the current
  // pan/zoom/rotate transform, so sampling reads exactly what the user sees.
  _drawSource() {
    const size = 340;
    const ctx = this.alignSrc;
    const img = this.alignImage;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0d16'; ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2 + this.imgT.tx, size / 2 + this.imgT.ty);
    ctx.rotate(this.imgT.angle);
    ctx.scale(this.imgT.scale, this.imgT.scale);
    const s0 = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * s0, h = img.naturalHeight * s0;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  _setZoom(v) { if (!this.alignImg) return; this.imgT.scale = v; this._drawSource(); this._redrawAlign(); }
  _setRotate(deg) { if (!this.alignImg) return; this.imgT.angle = deg * Math.PI / 180; this._drawSource(); this._redrawAlign(); }
  _resetPhoto() {
    if (!this.alignImg) return;
    this.imgT = { scale: 1, angle: 0, tx: 0, ty: 0 };
    $('#alignZoom').value = 1; $('#alignRotate').value = 0;
    this._drawSource();
    this._autoFit();
  }

  // Re-run automatic cube detection on the current (possibly zoomed) photo.
  _autoFit() {
    if (!this.alignImg) return;
    const auto = autoFitHex(this.alignSrc, 340);
    if (auto) { this.handles = auto; $('#scanStatus').textContent = ''; }
    else $('#alignHint').textContent = 'Không tự tìm được khối — hãy phóng to/kéo cho khối vừa khung rồi chỉnh các chấm.';
    this._redrawAlign();
  }

  _canvasXY(e) {
    const cv = $('#alignCanvas');
    const rect = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * cv.width / rect.width, y: (p.clientY - rect.top) * cv.height / rect.height };
  }

  _redrawAlign() {
    const cv = $('#alignCanvas');
    const ctx = cv.getContext('2d');
    ctx.drawImage(this.alignSrc.canvas, 0, 0);
    const h = this.handles;
    // rhombus edges
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    line(h.T, h.UR); line(h.UR, h.LR); line(h.LR, h.Bo); line(h.Bo, h.LL); line(h.LL, h.UL); line(h.UL, h.T);
    line(h.Ce, h.T); line(h.Ce, h.UR); line(h.Ce, h.LR); line(h.Ce, h.Bo); line(h.Ce, h.LL); line(h.Ce, h.UL);
    // sample dots
    const pts = samplePoints(h, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (const key of ['top', 'left', 'right']) for (const p of pts[key]) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
    // face labels
    const f = this.QUICK_STEPS[this.quickStep].faces;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center';
    const centroid = (arr) => arr.reduce((a, p) => [a[0] + p[0] / arr.length, a[1] + p[1] / arr.length], [0, 0]);
    ctx.fillText(f.top, ...centroid([h.UL, h.T, h.UR, h.Ce]));
    ctx.fillText(f.left, ...centroid([h.LL, h.UL, h.Ce, h.Bo]));
    ctx.fillText(f.right, ...centroid([h.Ce, h.UR, h.LR, h.Bo]));
    // handles
    for (const k of Object.keys(h)) {
      ctx.beginPath(); ctx.arc(h[k][0], h[k][1], 7, 0, 7);
      ctx.fillStyle = k === this._dragKey ? '#6c8cff' : 'rgba(255,255,255,0.9)';
      ctx.fill(); ctx.strokeStyle = '#14161f'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  _alignDown(e) {
    if (!this.alignImg) return;
    if (e.touches && e.touches.length === 2) { this._startPinch(e); return; }
    const { x, y } = this._canvasXY(e);
    let best = null, bd = 26 * 26; // grab a handle if close, else pan the photo
    for (const k of Object.keys(this.handles)) {
      const d = (this.handles[k][0] - x) ** 2 + (this.handles[k][1] - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best) { this._dragKey = best; this._panning = false; this._redrawAlign(); }
    else { this._dragKey = null; this._panning = true; this._panStart = { x, y, tx: this.imgT.tx, ty: this.imgT.ty }; }
  }

  _alignMove(e) {
    if (!this.alignImg) return;
    if (e.touches && e.touches.length === 2 && this._pinch) { this._updatePinch(e); return; }
    if (this._dragKey) {
      this.handles[this._dragKey] = [this._canvasXY(e).x, this._canvasXY(e).y];
      if (e.cancelable) e.preventDefault();
      this._redrawAlign();
    } else if (this._panning) {
      const { x, y } = this._canvasXY(e);
      this.imgT.tx = this._panStart.tx + (x - this._panStart.x);
      this.imgT.ty = this._panStart.ty + (y - this._panStart.y);
      if (e.cancelable) e.preventDefault();
      this._drawSource(); this._redrawAlign();
    }
  }

  _alignUp() {
    const was = this._dragKey;
    this._dragKey = null; this._panning = false; this._pinch = null;
    if (was) this._redrawAlign();
  }

  _startPinch(e) {
    const [a, b] = [e.touches[0], e.touches[1]];
    const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
    this._pinch = { d0: Math.hypot(dx, dy) || 1, ang0: Math.atan2(dy, dx), scale0: this.imgT.scale, angle0: this.imgT.angle };
    this._panning = false; this._dragKey = null;
  }

  _updatePinch(e) {
    const [a, b] = [e.touches[0], e.touches[1]];
    const dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
    const d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    this.imgT.scale = Math.max(0.4, Math.min(3, this._pinch.scale0 * d / this._pinch.d0));
    this.imgT.angle = this._pinch.angle0 + (ang - this._pinch.ang0);
    $('#alignZoom').value = this.imgT.scale;
    $('#alignRotate').value = Math.round(((this.imgT.angle * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
    if (e.cancelable) e.preventDefault();
    this._drawSource(); this._redrawAlign();
  }

  _readAlign() {
    if (!this.alignImg) return;
    let grids;
    try {
      grids = sampleCornerHex(this.alignSrc, this.handles, 3);
    } catch (err) {
      $('#scanStatus').textContent = 'Không đọc được ảnh — thử căn lại khung rồi bấm Đọc.';
      return;
    }
    const map = this.QUICK_STEPS[this.quickStep].faces;
    for (const [rhombus, face] of Object.entries(map)) {
      const g = grids[rhombus];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        if (r === 1 && c === 1) continue; // keep centres fixed
        this.scanFacelets[face][r][c] = g[r][c];
      }
    }
    this.quickStep++;
    if (this.quickStep < this.QUICK_STEPS.length) {
      this._showAlign();
    } else {
      this._hideAlign();
      this._paintScan();
      const card = document.querySelector('#scanModal .modal-card');
      if (card) card.scrollTop = 0;
      $('#scanStatus').textContent = '✓ Đã đọc 2 ảnh. Kiểm tra từng mặt (nút ⟲ để xoay cả mặt), sửa màu nếu cần, rồi nhấn Dựng & Giải.';
    }
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
    if (this.cube.isSolved()) { this.refresh(); this.setStatus('Khối đó đã được giải rồi 🎉'); return; }
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

    // quick scan (two corner photos)
    $('#quickScan').addEventListener('click', () => this.startQuickScan());
    $('#alignCancel').addEventListener('click', () => this._hideAlign());
    $('#alignRead').addEventListener('click', () => this._readAlign());
    $('#alignFile').addEventListener('change', (e) => this._loadAlignPhoto(e.target.files[0]));
    $('#alignZoom').addEventListener('input', (e) => this._setZoom(Number(e.target.value)));
    $('#alignRotate').addEventListener('input', (e) => this._setRotate(Number(e.target.value)));
    $('#alignReset').addEventListener('click', () => this._resetPhoto());
    $('#alignAuto').addEventListener('click', () => this._autoFit());
    const cv = $('#alignCanvas');
    cv.addEventListener('mousedown', (e) => this._alignDown(e));
    cv.addEventListener('touchstart', (e) => this._alignDown(e), { passive: true });
    window.addEventListener('mousemove', (e) => this._alignMove(e));
    window.addEventListener('touchmove', (e) => this._alignMove(e), { passive: false });
    window.addEventListener('mouseup', () => this._alignUp());
    window.addEventListener('touchend', () => this._alignUp());

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
