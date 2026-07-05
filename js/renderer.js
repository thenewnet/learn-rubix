// renderer.js — renders the physical cube model with CSS 3D transforms and
// animates face turns. No external libraries: every cubie is a real DOM element,
// so the animation stays crisp and the whole thing works offline.

import { animForToken, layersForToken, AXIS_TO_INDEX } from './cube.js';

const COLORS = {
  W: '#f7f7f7', // white  (U)
  Y: '#ffd500', // yellow (D)
  R: '#d0202a', // red    (R)
  O: '#ff5a1f', // orange (L)
  G: '#00a651', // green  (F)
  B: '#1f6fe0', // blue   (B)
};

// Outward directions of a small cube's six faces + their local CSS transform.
const FACE_DIRS = [
  { key: '+x', hn: [1, 0, 0], t: 'rotateY(90deg)' },
  { key: '-x', hn: [-1, 0, 0], t: 'rotateY(-90deg)' },
  { key: '+y', hn: [0, 1, 0], t: 'rotateX(-90deg)' },
  { key: '-y', hn: [0, -1, 0], t: 'rotateX(90deg)' },
  { key: '+z', hn: [0, 0, 1], t: '' },
  { key: '-z', hn: [0, 0, -1], t: 'rotateY(180deg)' },
];

function vecEq(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

export class Renderer {
  constructor(sceneEl) {
    this.scene = sceneEl;
    this.turntable = document.createElement('div');
    this.turntable.className = 'turntable';
    this.scene.appendChild(this.turntable);
    this.cube = null;
    this.els = new Map(); // cubie id -> element
    this.S = 96;
    this.rotX = -28;
    this.rotY = -38;
    this.animating = false;
    this._setupDrag();
    this._applyTurntable();
  }

  setCube(cube) {
    this.cube = cube;
    this._rebuild();
  }

  _rebuild() {
    this.turntable.innerHTML = '';
    this.els.clear();
    const n = this.cube.n;
    // Keep the overall cube a roughly constant on-screen size across sizes.
    this.S = Math.round(300 / n);
    const S = this.S;
    for (const cu of this.cube.cubies) {
      const el = document.createElement('div');
      el.className = 'cubie';
      el.style.width = S + 'px';
      el.style.height = S + 'px';
      el.style.marginLeft = -S / 2 + 'px';
      el.style.marginTop = -S / 2 + 'px';
      for (const dir of FACE_DIRS) {
        const face = document.createElement('div');
        face.className = 'facelet';
        face.style.width = S + 'px';
        face.style.height = S + 'px';
        face.style.transform = `${dir.t} translateZ(${S / 2}px)`;
        const sticker = cu.stickers.find((s) => vecEq(s.hn, dir.hn));
        if (sticker) {
          face.classList.add('sticker');
          face.style.setProperty('--c', COLORS[sticker.color]);
        }
        el.appendChild(face);
      }
      this.turntable.appendChild(el);
      this.els.set(cu.id, el);
    }
    this.render();
  }

  _matrix3d(o, pos) {
    const S = this.S;
    const tx = (pos[0] * S) / 2;
    const ty = (pos[1] * S) / 2;
    const tz = (pos[2] * S) / 2;
    // column-major 4x4 from the 3x3 orientation + translation
    return `matrix3d(${o[0][0]},${o[1][0]},${o[2][0]},0,` +
      `${o[0][1]},${o[1][1]},${o[2][1]},0,` +
      `${o[0][2]},${o[1][2]},${o[2][2]},0,` +
      `${tx},${ty},${tz},1)`;
  }

  render() {
    for (const cu of this.cube.cubies) {
      const el = this.els.get(cu.id);
      if (el) el.style.transform = this._matrix3d(cu.o, cu.pos);
    }
  }

  _applyTurntable() {
    this.turntable.style.transform =
      `translateZ(-40px) rotateX(${this.rotX}deg) rotateY(${this.rotY}deg)`;
  }

  _setupDrag() {
    let dragging = false, lx = 0, ly = 0;
    const down = (e) => {
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      lx = p.clientX; ly = p.clientY;
      this.scene.classList.add('grabbing');
    };
    const move = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - lx, dy = p.clientY - ly;
      lx = p.clientX; ly = p.clientY;
      this.rotY += dx * 0.4;
      this.rotX -= dy * 0.4;
      this.rotX = Math.max(-89, Math.min(89, this.rotX));
      this._applyTurntable();
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { dragging = false; this.scene.classList.remove('grabbing'); };
    this.scene.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    this.scene.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }

  // Animate a single move, then bake the result into the model. Returns a Promise.
  animateMove(token, duration = 450) {
    return new Promise((resolve) => {
      const { axis, deg } = animForToken(token);
      const { layers } = layersForToken(token, this.cube.n);
      const ai = AXIS_TO_INDEX[axis];
      const AX = axis.toUpperCase();
      const affected = this.cube.cubies.filter((cu) => layers.includes(cu.pos[ai]));
      const bases = affected.map((cu) => this._matrix3d(cu.o, cu.pos));

      if (duration <= 0) {
        this.cube.applyMove(token);
        this.render();
        resolve();
        return;
      }

      const start = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const angle = deg * ease(t);
        for (let i = 0; i < affected.length; i++) {
          const el = this.els.get(affected[i].id);
          el.style.transform = `rotate${AX}(${angle}deg) ${bases[i]}`;
        }
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.cube.applyMove(token);
          this.render();
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });
  }

  resetView() {
    this.rotX = -28; this.rotY = -38;
    this._applyTurntable();
  }
}

export { COLORS };
