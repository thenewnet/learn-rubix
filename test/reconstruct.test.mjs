// Verify that reading a cube's facelets and rebuilding it round-trips exactly,
// and that reconstructed cubes are solvable. Also that validation rejects junk.
import { Cube, randomScramble, buildFromFacelets, validateFacelets, FACE_LETTERS } from '../js/cube.js';
import { solveCube } from '../js/lbl.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };

let seed = 31; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let allGood = true;
for (let i = 0; i < 400; i++) {
  const orig = new Cube(3); orig.applyMoves(randomScramble(3, 25, rng));
  const facelets = {}; for (const f of FACE_LETTERS) facelets[f] = orig.readFace(f);
  const rebuilt = buildFromFacelets(3, facelets);
  if (!rebuilt) { allGood = false; break; }
  for (const f of FACE_LETTERS) {
    const a = orig.readFace(f), b = rebuilt.readFace(f);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (a[r][c] !== b[r][c]) allGood = false;
  }
  if (!solveCube(rebuilt).success) allGood = false;
}
ok(allGood, '400 scrambles: read → rebuild round-trips and stays solvable');

// validation rejects wrong colour counts
{
  const c = new Cube(3); const fl = {}; for (const f of FACE_LETTERS) fl[f] = c.readFace(f);
  fl.U[0][0] = 'R';
  ok(validateFacelets(3, fl).ok === false, 'wrong colour counts are rejected');
}
// a genuinely solved scan validates
{
  const c = new Cube(3); const fl = {}; for (const f of FACE_LETTERS) fl[f] = c.readFace(f);
  ok(validateFacelets(3, fl).ok === true, 'a solved cube validates');
}

console.log(`reconstruct.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
