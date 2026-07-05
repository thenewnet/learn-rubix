// cube.js — Physical Rubik's cube model shared by the solver and the 3D renderer.
//
// Coordinate system (matches CSS 3D transforms: X right, Y down, Z toward viewer):
//   -y = U (Up, white)      +y = D (Down, yellow)
//   +x = R (Right, red)     -x = L (Left, orange)
//   +z = F (Front, green)   -z = B (Back, blue)
//
// Each cubie carries an integer position and an integer orientation matrix, so the
// exact same object drives both the logical solver and the visual renderer.

// ----- integer 3x3 matrix helpers -----------------------------------------

export function matVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function matMul(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i][k] * b[k][j];
      r[i][j] = s;
    }
  }
  return r;
}

function transpose(m) {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// Right-handed rotation matrices for ±90° about each axis.
const ROT = {
  x: { 1: [[1, 0, 0], [0, 0, -1], [0, 1, 0]], '-1': [[1, 0, 0], [0, 0, 1], [0, -1, 0]] },
  y: { 1: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], '-1': [[0, 0, -1], [0, 1, 0], [1, 0, 0]] },
  z: { 1: [[0, -1, 0], [1, 0, 0], [0, 0, 1]], '-1': [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] },
};

// ----- face definitions ----------------------------------------------------

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

// Each face: which axis, sign of the outer layer, and the clockwise-turn matrix
// (clockwise as seen from outside the cube looking in).
const FACES = {
  U: { axis: 'y', sign: -1, mat: ROT.y[1] },
  D: { axis: 'y', sign: 1, mat: ROT.y['-1'] },
  R: { axis: 'x', sign: 1, mat: ROT.x['-1'] },
  L: { axis: 'x', sign: -1, mat: ROT.x[1] },
  F: { axis: 'z', sign: 1, mat: ROT.z['-1'] },
  B: { axis: 'z', sign: -1, mat: ROT.z[1] },
};

export const FACE_LETTERS = ['U', 'D', 'R', 'L', 'F', 'B'];

// Color per home face (sticker color depends on which outer face the sticker sits on).
export const FACE_COLOR = { U: 'W', D: 'Y', R: 'R', L: 'O', F: 'G', B: 'B' };

// Outward unit normal of each face.
const FACE_NORMAL = {
  U: [0, -1, 0], D: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1],
};

function vecEq(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

// ----- Cube ----------------------------------------------------------------

export class Cube {
  constructor(n = 3) {
    this.n = n;
    this.max = n - 1; // outer-layer coordinate in the (2p-(n-1)) scale
    this.cubies = [];
    this._build();
  }

  _build() {
    const n = this.n, max = this.max;
    const coords = [];
    for (let p = 0; p < n; p++) coords.push(2 * p - (n - 1));
    let id = 0;
    for (const x of coords) {
      for (const y of coords) {
        for (const z of coords) {
          const onSurface = Math.abs(x) === max || Math.abs(y) === max || Math.abs(z) === max;
          if (!onSurface) continue; // interior cubies are never visible
          const stickers = [];
          if (x === max) stickers.push({ hn: [1, 0, 0], color: FACE_COLOR.R });
          if (x === -max) stickers.push({ hn: [-1, 0, 0], color: FACE_COLOR.L });
          if (y === max) stickers.push({ hn: [0, 1, 0], color: FACE_COLOR.D });
          if (y === -max) stickers.push({ hn: [0, -1, 0], color: FACE_COLOR.U });
          if (z === max) stickers.push({ hn: [0, 0, 1], color: FACE_COLOR.F });
          if (z === -max) stickers.push({ hn: [0, 0, -1], color: FACE_COLOR.B });
          this.cubies.push({ id: id++, pos: [x, y, z], o: I3, stickers, home: [x, y, z] });
        }
      }
    }
  }

  clone() {
    const c = new Cube(this.n);
    c.cubies = this.cubies.map((cu) => ({
      id: cu.id,
      pos: cu.pos.slice(),
      o: cu.o.map((r) => r.slice()),
      stickers: cu.stickers.map((s) => ({ hn: s.hn.slice(), color: s.color })),
      home: cu.home.slice(),
    }));
    return c;
  }

  // Apply a raw rotation to one layer.
  _rotateLayer(axis, layer, mat) {
    const ai = AXIS_INDEX[axis];
    for (const cu of this.cubies) {
      if (cu.pos[ai] === layer) {
        cu.pos = matVec(mat, cu.pos);
        cu.o = matMul(mat, cu.o);
      }
    }
  }

  // Apply a single named move token: e.g. "U", "U'", "U2", "R", "F2".
  // Wide moves ("Uw"/"u") turn every layer from the face inward except the far one.
  applyMove(token) {
    const m = /^([UDRLFB])(w)?('|2)?$/.exec(token);
    if (!m) throw new Error('bad move: ' + token);
    const face = m[1];
    const wide = !!m[2] && this.n > 2;
    const suffix = m[3] || '';
    const spec = FACES[face];
    let mat = spec.mat;
    if (suffix === "'") mat = transpose(mat);
    const times = suffix === '2' ? 2 : 1;

    const layers = [];
    const outer = spec.sign * this.max;
    layers.push(outer);
    if (wide) layers.push(spec.sign * (this.max - 2)); // include the next inner layer

    for (let t = 0; t < times; t++) {
      for (const layer of layers) this._rotateLayer(spec.axis, layer, mat);
    }
  }

  applyMoves(tokens) {
    for (const t of tokens) this.applyMove(t);
    return this;
  }

  // --- state queries -------------------------------------------------------

  cubieAt(pos) {
    for (const cu of this.cubies) if (vecEq(cu.pos, pos)) return cu;
    return null;
  }

  // Current outward normal of a sticker.
  stickerNormal(cu, s) { return matVec(cu.o, s.hn); }

  // Color shown on `face` (unit normal) of the cubie currently at `pos`.
  colorAt(pos, faceNormal) {
    const cu = this.cubieAt(pos);
    if (!cu) return null;
    for (const s of cu.stickers) {
      if (vecEq(this.stickerNormal(cu, s), faceNormal)) return s.color;
    }
    return null;
  }

  isSolved() {
    for (const cu of this.cubies) {
      for (const s of cu.stickers) {
        const n = this.stickerNormal(cu, s);
        // The sticker must face the home direction of its color.
        const want = FACE_NORMAL[colorFace(s.color)];
        // Only meaningful once the cubie is home, but checking every sticker faces
        // its color's home direction is equivalent to "solved".
        if (!vecEq(n, want)) return false;
      }
    }
    return true;
  }

  // Read a face as an n x n grid of color letters (row-major, human orientation).
  readFace(face) {
    const spec = FACES[face];
    const normal = FACE_NORMAL[face];
    const n = this.n, max = this.max;
    const coords = [];
    for (let p = 0; p < n; p++) coords.push(2 * p - (n - 1));
    // Choose in-plane row/col axes so the reading matches a standard unfolded net.
    const grid = [];
    const { rowAxis, rowDir, colAxis, colDir } = NET_ORIENT[face];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) {
        const pos = [0, 0, 0];
        pos[AXIS_INDEX[spec.axis]] = spec.sign * max;
        pos[AXIS_INDEX[rowAxis]] = rowDir * coords[r];
        pos[AXIS_INDEX[colAxis]] = colDir * coords[c];
        row.push(this.colorAt(pos, normal));
      }
      grid.push(row);
    }
    return grid;
  }
}

function colorFace(color) {
  for (const f of FACE_LETTERS) if (FACE_COLOR[f] === color) return f;
  return null;
}

// ----- render / animation helpers ------------------------------------------

function matEq(a, b) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (a[i][j] !== b[i][j]) return false;
  return true;
}

// Which axis a token turns about, and the signed CSS degrees for the animation.
// A positive value is a right-hand rotation about the +axis (matches CSS rotate<Axis>).
export function animForToken(token) {
  const face = token[0];
  const spec = FACES[face];
  const baseSign = matEq(spec.mat, ROT[spec.axis][1]) ? 1 : -1;
  let deg;
  if (token.endsWith('2')) deg = 180 * baseSign;
  else if (token.endsWith("'")) deg = -90 * baseSign;
  else deg = 90 * baseSign;
  return { axis: spec.axis, deg };
}

// The layer coordinate(s) a token affects, for the current cube size.
export function layersForToken(token, n) {
  const face = token[0];
  const wide = token.includes('w') && n > 2;
  const spec = FACES[face];
  const max = n - 1;
  const layers = [spec.sign * max];
  if (wide) layers.push(spec.sign * (max - 2));
  return { axis: spec.axis, layers };
}

export const AXIS_TO_INDEX = AXIS_INDEX;

// Human-readable name for a move token (for the step list / tooltips).
export function moveName(token) {
  const face = token[0];
  const names = { U: 'Up', D: 'Down', R: 'Right', L: 'Left', F: 'Front', B: 'Back' };
  let dir = 'clockwise';
  if (token.endsWith("'")) dir = 'counter-clockwise';
  else if (token.endsWith('2')) dir = '180°';
  return `${names[face]} ${dir}`;
}

// Row/column axis orientation for each face when unfolding into a 2D net.
const NET_ORIENT = {
  U: { rowAxis: 'z', rowDir: -1, colAxis: 'x', colDir: 1 },
  D: { rowAxis: 'z', rowDir: 1, colAxis: 'x', colDir: 1 },
  F: { rowAxis: 'y', rowDir: -1, colAxis: 'x', colDir: 1 },
  B: { rowAxis: 'y', rowDir: -1, colAxis: 'x', colDir: -1 },
  L: { rowAxis: 'y', rowDir: -1, colAxis: 'z', colDir: -1 },
  R: { rowAxis: 'y', rowDir: -1, colAxis: 'z', colDir: 1 },
};

// ----- move utilities ------------------------------------------------------

export const FACE_MOVE_SET = ['U', 'D', 'R', 'L', 'F', 'B'];
const SUFFIXES = ['', "'", '2'];

export function invertMove(token) {
  if (token.endsWith('2')) return token;
  if (token.endsWith("'")) return token.slice(0, -1);
  return token + "'";
}

export function invertSequence(tokens) {
  return tokens.slice().reverse().map(invertMove);
}

// Simplify a sequence: combine consecutive same-face turns and drop no-ops.
export function simplify(tokens) {
  const out = tokens.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      if (!a || !b) continue;
      const fa = a[0], fb = b[0];
      if (fa === fb && !a.includes('w') && !b.includes('w')) {
        const amt = (t) => (t.endsWith('2') ? 2 : t.endsWith("'") ? 3 : 1);
        let total = (amt(a) + amt(b)) % 4;
        out.splice(i, 2, ...(total === 0 ? [] : [fa + (total === 1 ? '' : total === 2 ? '2' : "'")]));
        changed = true;
        break;
      }
    }
  }
  return out.filter(Boolean);
}

// A random scramble of `count` moves with no immediate same-face repeats.
// Cubes larger than 3 also mix in wide turns so the inner slices get scrambled.
export function randomScramble(n, count, rng = Math.random) {
  const seq = [];
  let last = null;
  for (let i = 0; i < count; i++) {
    let face;
    do { face = FACE_MOVE_SET[Math.floor(rng() * 6)]; } while (face === last);
    last = face;
    const wide = n >= 4 && rng() < 0.35 ? 'w' : '';
    const suf = SUFFIXES[Math.floor(rng() * 3)];
    seq.push(face + wide + suf);
  }
  return seq;
}
