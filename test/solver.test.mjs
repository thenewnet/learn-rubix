// End-to-end: a scramble followed by the computed solution must solve the cube,
// for every supported size and many random scrambles.
import { Cube, randomScramble } from '../js/cube.js';
import { solveFromHistory } from '../js/solver.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } }

for (const n of [2, 3, 4, 5]) {
  let seed = 987 + n * 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let solvedAll = true;
  let maxLen = 0;
  const trials = 400;
  for (let i = 0; i < trials; i++) {
    const c = new Cube(n);
    const history = randomScramble(n, 25 + (i % 15), rng);
    c.applyMoves(history);
    const sol = solveFromHistory(history);
    maxLen = Math.max(maxLen, sol.length);
    c.applyMoves(sol);
    if (!c.isSolved()) { solvedAll = false; break; }
  }
  ok(solvedAll, `${n}x${n}: ${trials} random scrambles all solved`);
  ok(maxLen <= 25 + 14, `${n}x${n}: solutions stay simplified (max ${maxLen})`);
}

// Already-solved cube -> empty solution.
ok(solveFromHistory([]).length === 0, 'no history -> empty solution');
// A move and its inverse -> empty solution.
ok(solveFromHistory(['R', "R'"]).length === 0, 'R R\' cancels to empty');
// Redundant same-face turns collapse.
ok(solveFromHistory(['U', 'U', 'U']).length === 1, 'U U U simplifies to one turn');

console.log(`solver.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
