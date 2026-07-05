// Verify the layer-by-layer solver solves arbitrary valid states.
import { Cube, randomScramble } from '../js/cube.js';
import { solveCube } from '../js/lbl.js';

const N = Number(process.env.LBL_TRIALS || 3000);
let seed = 20260705;
const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

let fails = 0, maxLen = 0, totalLen = 0;
const failStates = [];
for (let i = 0; i < N; i++) {
  const c = new Cube(3);
  const scr = randomScramble(3, 25, rng);
  c.applyMoves(scr);
  const { moves, success } = solveCube(c);
  // apply solution to a fresh copy of the scrambled cube
  const check = new Cube(3);
  check.applyMoves(scr);
  check.applyMoves(moves);
  const ok = success && check.isSolved();
  if (!ok) { fails++; if (failStates.length < 5) failStates.push(scr.join(' ')); }
  maxLen = Math.max(maxLen, moves.length);
  totalLen += moves.length;
}

console.log(`lbl.test: ${N - fails}/${N} solved | avg ${Math.round(totalLen / N)} moves | max ${maxLen}`);
if (fails) {
  console.error(`  FAILURES: ${fails}`);
  for (const s of failStates) console.error('   scramble:', s);
  process.exit(1);
}
