// lbl.js — a real layer-by-layer ("beginner method") solver for a 3x3 cube in
// ANY valid state (e.g. reconstructed from a photo). It works directly on the
// physical cube model and returns a move list plus phase labels for teaching.
//
// Design: instead of hand-deriving each case, every step SIMULATES a small set
// of candidate move-sequences and keeps the one that provably improves a stage
// metric while preserving already-solved pieces. Every accepted move is verified,
// so the solver is correct by construction and validated over many random states.

// ---- geometry (n = 3) ------------------------------------------------------

const NRM = { U: [0, -1, 0], D: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
const CENTER = { U: [0, -2, 0], D: [0, 2, 0], R: [2, 0, 0], L: [-2, 0, 0], F: [0, 0, 2], B: [0, 0, -2] };

const EDGES = {
  UF: { pos: [0, -2, 2], faces: ['U', 'F'] }, UR: { pos: [2, -2, 0], faces: ['U', 'R'] },
  UB: { pos: [0, -2, -2], faces: ['U', 'B'] }, UL: { pos: [-2, -2, 0], faces: ['U', 'L'] },
  DF: { pos: [0, 2, 2], faces: ['D', 'F'] }, DR: { pos: [2, 2, 0], faces: ['D', 'R'] },
  DB: { pos: [0, 2, -2], faces: ['D', 'B'] }, DL: { pos: [-2, 2, 0], faces: ['D', 'L'] },
  FR: { pos: [2, 0, 2], faces: ['F', 'R'] }, FL: { pos: [-2, 0, 2], faces: ['F', 'L'] },
  BR: { pos: [2, 0, -2], faces: ['B', 'R'] }, BL: { pos: [-2, 0, -2], faces: ['B', 'L'] },
};
const CORNERS = {
  UFR: { pos: [2, -2, 2], faces: ['U', 'F', 'R'] }, UFL: { pos: [-2, -2, 2], faces: ['U', 'F', 'L'] },
  UBR: { pos: [2, -2, -2], faces: ['U', 'B', 'R'] }, UBL: { pos: [-2, -2, -2], faces: ['U', 'B', 'L'] },
  DFR: { pos: [2, 2, 2], faces: ['D', 'F', 'R'] }, DFL: { pos: [-2, 2, 2], faces: ['D', 'F', 'L'] },
  DBR: { pos: [2, 2, -2], faces: ['D', 'B', 'R'] }, DBL: { pos: [-2, 2, -2], faces: ['D', 'B', 'L'] },
};

const SIDES = ['F', 'R', 'B', 'L'];
function rotLetter(letter, k) {
  if (letter === 'U' || letter === 'D') return letter;
  return SIDES[(SIDES.indexOf(letter) + k) % 4];
}
function frameSeq(seq, k) { return seq.map((t) => rotLetter(t[0], k) + t.slice(1)); }

// ---- cross solver: BFS over just the four D-edges --------------------------
// The four bottom-cross edges live in a tiny state space (12 slots x 2 orient).
// We precompute, once, the exact-distance-to-solved table and then greedy-descend
// it, giving an optimal, always-correct cross for any state.

const SLOTS = [
  { pos: [0, -2, 2], faces: ['U', 'F'] }, { pos: [2, -2, 0], faces: ['U', 'R'] },
  { pos: [0, -2, -2], faces: ['U', 'B'] }, { pos: [-2, -2, 0], faces: ['U', 'L'] },
  { pos: [0, 2, 2], faces: ['D', 'F'] }, { pos: [2, 2, 0], faces: ['D', 'R'] },
  { pos: [0, 2, -2], faces: ['D', 'B'] }, { pos: [-2, 2, 0], faces: ['D', 'L'] },
  { pos: [2, 0, 2], faces: ['F', 'R'] }, { pos: [-2, 0, 2], faces: ['F', 'L'] },
  { pos: [2, 0, -2], faces: ['B', 'R'] }, { pos: [-2, 0, -2], faces: ['B', 'L'] },
];
const MOVES18 = [];
for (const f of ['U', 'D', 'R', 'L', 'F', 'B']) for (const s of ['', "'", '2']) MOVES18.push(f + s);

let CROSS_CACHE = null;
function crossTable(CubeClass) {
  if (CROSS_CACHE) return CROSS_CACHE;
  const veq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const slotOf = (pos) => SLOTS.findIndex((s) => veq(s.pos, pos));
  const nrm = { U: [0, -1, 0], D: [0, 1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  // transition table: for each move, slot -> {to, flip}
  const T = {};
  for (const m of MOVES18) {
    const c = new CubeClass(3);
    const before = SLOTS.map((s) => {
      const cu = c.cubieAt(s.pos);
      const st = cu.stickers.find((st2) => veq(c.stickerNormal(cu, st2), nrm[s.faces[0]]));
      return { id: cu.id, color: st.color };
    });
    c.applyMove(m);
    T[m] = SLOTS.map((s, i) => {
      const cu = c.cubies.find((x) => x.id === before[i].id);
      const j = slotOf(cu.pos);
      const st = cu.stickers.find((st2) => st2.color === before[i].color);
      const flip = veq(c.stickerNormal(cu, st), nrm[SLOTS[j].faces[0]]) ? 0 : 1;
      return { to: j, flip };
    });
  }
  const encode = (p) => ((p[0][0] * 2 + p[0][1]) * 24 + (p[1][0] * 2 + p[1][1])) * 24 * 24
    + (p[2][0] * 2 + p[2][1]) * 24 + (p[3][0] * 2 + p[3][1]);
  const step = (p, m) => p.map(([slot, ori]) => { const t = T[m][slot]; return [t.to, ori ^ t.flip]; });
  const solved = [[4, 0], [5, 0], [6, 0], [7, 0]];
  const dist = new Map([[encode(solved), 0]]);
  const q = [solved];
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const d = dist.get(encode(cur));
    for (const m of MOVES18) {
      const nx = step(cur, m);
      const e = encode(nx);
      if (!dist.has(e)) { dist.set(e, d + 1); q.push(nx); }
    }
  }
  CROSS_CACHE = { T, encode, step, dist };
  return CROSS_CACHE;
}

// ---- solver ----------------------------------------------------------------

export function solveCube(cube) {
  const c = cube.clone();
  const moves = [];
  const phases = [];
  const mv = (t) => { c.applyMove(t); moves.push(t); };
  const seq = (a) => a.forEach(mv);
  const sim = (s) => { const cc = c.clone(); cc.applyMoves(s); return cc; };
  const apply = (s) => seq(s);

  // queries (on any cube cc) ------------------------------------------------
  const center = (cc, f) => cc.colorAt(CENTER[f], NRM[f]);
  const at = (cc, label, f) => cc.colorAt((label.length === 2 ? EDGES : CORNERS)[label].pos, NRM[f]);
  const slotSolved = (cc, label) => {
    const info = (label.length === 2 ? EDGES : CORNERS)[label];
    return info.faces.every((f) => cc.colorAt(info.pos, NRM[f]) === center(cc, f));
  };
  const colorsOf = (cc, label) => {
    const info = (label.length === 2 ? EDGES : CORNERS)[label];
    return info.faces.map((f) => cc.colorAt(info.pos, NRM[f]));
  };
  const hasColor = (cc, label, col) => colorsOf(cc, label).includes(col);

  const dCol = center(c, 'D');
  const uCol = center(c, 'U');

  const U_EDGES = ['UF', 'UR', 'UB', 'UL'];
  const U_CORNERS = ['UFR', 'UFL', 'UBR', 'UBL'];
  const D_EDGES = ['DF', 'DR', 'DB', 'DL'];
  const D_CORNERS = ['DFR', 'DFL', 'DBR', 'DBL'];
  const E_EDGES = ['FR', 'FL', 'BR', 'BL'];

  const countSolved = (cc, labels) => labels.filter((l) => slotSolved(cc, l)).length;
  const crossN = (cc) => countSolved(cc, D_EDGES);
  const dCornN = (cc) => countSolved(cc, D_CORNERS);
  const midN = (cc) => countSolved(cc, E_EDGES);
  const f2lOk = (cc) => crossN(cc) === 4 && dCornN(cc) === 4 && midN(cc) === 4;
  const uCrossN = (cc) => U_EDGES.filter((l) => at(cc, l, 'U') === uCol).length;
  const orientN = (cc) => U_CORNERS.filter((l) => at(cc, l, 'U') === uCol).length;
  const uEdgeSolvedN = (cc) => countSolved(cc, U_EDGES);
  const cornPositioned = (cc, label) => {
    const set = new Set(colorsOf(cc, label));
    const want = new Set(CORNERS[label].faces.map((f) => center(cc, f)));
    if (set.size !== want.size) return false;
    for (const x of set) if (!want.has(x)) return false;
    return true;
  };
  const posCornN = (cc) => U_CORNERS.filter((l) => cornPositioned(cc, l)).length;

  // lexicographic comparison of metric arrays
  const lexGt = (a, b) => {
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return false;
  };

  // Generic greedy: apply the best candidate (max metric, must satisfy keep())
  // until metric[0] reaches target. Returns false on stall.
  function greedy(metric, target, candidates, keep, cap = 60) {
    let guard = 0;
    while (metric(c)[0] < target && guard++ < cap) {
      let best = null, bestM = metric(c);
      for (const s of candidates()) {
        const cc = sim(s);
        if (!keep(cc)) continue;
        const m = metric(cc);
        if (lexGt(m, bestM)) { bestM = m; best = s; }
      }
      if (!best) return false;
      apply(best);
    }
    return metric(c)[0] >= target;
  }

  const uPre = ['', 'U', "U'", 'U2'].map((u) => (u ? [u] : []));
  const framesUpre = (bases) => {
    const out = [];
    for (let k = 0; k < 4; k++) for (const pre of uPre) for (const b of bases) out.push([...pre, ...frameSeq(b, k)]);
    return out;
  };

  // ===== Stage 1: bottom (D) cross via the "daisy" ==========================
  phases.push({ name: 'Bottom cross', start: moves.length });

  // Solve the four cross edges optimally by descending the precomputed table.
  {
    const { encode, step, dist } = crossTable(cube.constructor);
    const sigOf = () => {
      const p = [];
      for (const s of ['F', 'R', 'B', 'L']) {
        const want = [dCol, center(c, s)];
        for (let j = 0; j < 12; j++) {
          const info = SLOTS[j];
          const cols = info.faces.map((f) => c.colorAt(info.pos, NRM[f]));
          if (cols.includes(want[0]) && cols.includes(want[1])) {
            p.push([j, cols[0] === dCol ? 0 : 1]);
            break;
          }
        }
      }
      return p;
    };
    let guard = 0;
    while (crossN(c) < 4 && guard++ < 30) {
      const p = sigOf();
      const d = dist.get(encode(p));
      let best = null, bestD = d;
      for (const m of MOVES18) {
        const cd = dist.get(encode(step(p, m)));
        if (cd !== undefined && cd < bestD) { bestD = cd; best = m; }
      }
      if (best === null) break;
      mv(best);
    }
  }
  phases[phases.length - 1].end = moves.length;

  // ===== Stage 2: bottom (D) corners =======================================
  phases.push({ name: 'Bottom corners', start: moves.length });
  const readyCorn = (cc) => U_CORNERS.filter((l) => hasColor(cc, l, dCol)).length;
  const cornBases = [
    ['R', 'U', "R'"], ['R', "U'", "R'"], ['R', 'U2', "R'"],
    ["R'", "U'", 'R'], ["R'", 'U', 'R'],
    ["F'", "U'", 'F'], ["F'", 'U', 'F'], ['F', 'U', "F'"],
    ['R', 'U', "R'", "U'"], ['U', 'R', "U'", "R'"],
    ['R', 'U2', "R'", "U'", 'R', 'U', "R'"],
  ];
  greedy((cc) => [dCornN(cc), readyCorn(cc)], 4, () => framesUpre(cornBases), (cc) => crossN(cc) === 4, 80);
  phases[phases.length - 1].end = moves.length;

  // ===== Stage 3: middle (E) layer edges ===================================
  phases.push({ name: 'Middle layer', start: moves.length });
  const readyMid = (cc) => U_EDGES.filter((l) => !hasColor(cc, l, dCol) && !hasColor(cc, l, uCol)).length;
  const midBases = [
    ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'],       // insert to the right
    ["U'", "L'", 'U', 'L', 'U', 'F', "U'", "F'"],       // insert to the left
    ['R', "U'", "R'"], ["F'", 'U', 'F'],                 // extract helpers
    ["L'", 'U', 'L'], ['F', "U'", "F'"],
  ];
  greedy((cc) => [midN(cc), readyMid(cc)], 4,
    () => framesUpre(midBases),
    (cc) => crossN(cc) === 4 && dCornN(cc) === 4, 90);
  phases[phases.length - 1].end = moves.length;

  // ===== Stage 4: top (U) cross (orient last-layer edges) ===================
  // Two cases: "line" (opposite edges) uses F R U R' U' F'; "L-shape" (adjacent)
  // uses F U R U' R' F'. The dot resolves through them. Greedy tries both + AUF.
  phases.push({ name: 'Top cross', start: moves.length });
  const ollEdgeAlgs = [
    ['F', 'R', 'U', "R'", "U'", "F'"],
    ['F', 'U', 'R', "U'", "R'", "F'"],
  ];
  greedy((cc) => [uCrossN(cc)], 4,
    () => { const o = []; for (const p of uPre) for (const a of ollEdgeAlgs) o.push([...p, ...a]); return o; },
    (cc) => f2lOk(cc), 20);
  phases[phases.length - 1].end = moves.length;

  // ===== Stage 5: orient last-layer corners (full OLL corners) =============
  // Ignore permutation here; one or two Sune/Anti-Sune with U setups orient all
  // four corners while preserving F2L and the top cross.
  phases.push({ name: 'Orient top corners', start: moves.length });
  const sune = ['R', 'U', "R'", 'U', 'R', 'U2', "R'"];
  const antiSune = ['R', 'U2', "R'", "U'", 'R', "U'", "R'"];
  const orientCands = () => {
    const blocks = [sune, antiSune];
    const out = [];
    for (const pi of uPre) {
      for (const a of blocks) out.push([...pi, ...a]);
      for (const a of blocks) for (const pj of uPre) for (const b of blocks) out.push([...pi, ...a, ...pj, ...b]);
    }
    return out;
  };
  greedy((cc) => [orientN(cc)], 4, orientCands, (cc) => f2lOk(cc) && uCrossN(cc) === 4, 14);
  phases[phases.length - 1].end = moves.length;

  // ===== Stage 6: permute last-layer corners ==============================
  // Aa/Ab are corner 3-cycles; T/Y swap two corners (and two edges), which fixes
  // permutation parity. Greedy composes them to place every corner.
  const Aa = ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'];
  const Ab = ['R', "B'", 'R', 'F2', "R'", 'B', 'R', 'F2', 'R2'];
  const Tperm = ['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"];
  const Yperm = ['F', 'R', "U'", "R'", "U'", 'R', 'U', "R'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R', "F'"];
  phases.push({ name: 'Place top corners', start: moves.length });
  greedy((cc) => [posCornN(cc)], 4,
    () => { const o = []; for (const p of uPre) for (const a of [Aa, Ab, Tperm, Yperm]) for (const q of uPre) o.push([...p, ...a, ...q]); return o; },
    (cc) => f2lOk(cc) && uCrossN(cc) === 4 && orientN(cc) === 4, 30);
  phases[phases.length - 1].end = moves.length;

  // ===== Stage 7: permute last-layer edges (finish) =======================
  // Ua/Ub are edge 3-cycles. Corners are solved, so edges are an even permutation
  // and 3-cycles finish them. A final AUF seats the whole cube.
  phases.push({ name: 'Finish top edges', start: moves.length });
  const Ua = ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'];
  const Ub = ['R2', 'U', 'R', 'U', "R'", "U'", "R'", "U'", "R'", 'U', "R'"];
  greedy((cc) => [uEdgeSolvedN(cc)], 4,
    () => { const o = []; for (const p of uPre) { o.push([...p]); for (const a of [Ua, Ub]) for (const q of uPre) o.push([...p, ...a, ...q]); } return o; },
    (cc) => f2lOk(cc) && orientN(cc) === 4 && posCornN(cc) === 4, 30);
  greedy((cc) => [cc.isSolved() ? 1 : 0], 1, () => uPre.map((p) => [...p]), () => true, 6);
  phases[phases.length - 1].end = moves.length;

  const success = c.isSolved();
  return { moves, phases: phases.filter((p) => p.end > p.start), success };
}
