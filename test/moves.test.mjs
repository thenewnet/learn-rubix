// Sanity tests for the move engine.
import { Cube, invertSequence, randomScramble } from '../js/cube.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  FAIL:', msg); } }

// A fresh cube is solved.
ok(new Cube(3).isSolved(), 'fresh 3x3 is solved');
ok(new Cube(2).isSolved(), 'fresh 2x2 is solved');

// Every base move to the 4th power is identity.
for (const f of ['U', 'D', 'R', 'L', 'F', 'B']) {
  const c = new Cube(3);
  for (let i = 0; i < 4; i++) c.applyMove(f);
  ok(c.isSolved(), `${f} x4 == identity`);
}

// Move then inverse is identity.
for (const f of ['U', 'D', 'R', 'L', 'F', 'B']) {
  const c = new Cube(3);
  c.applyMove(f); c.applyMove(f + "'");
  ok(c.isSolved(), `${f} ${f}' == identity`);
  const c2 = new Cube(3);
  c2.applyMove(f + '2'); c2.applyMove(f + '2');
  ok(c2.isSolved(), `${f}2 ${f}2 == identity`);
}

// "Sexy move" R U R' U' repeated 6 times returns to solved.
{
  const c = new Cube(3);
  for (let i = 0; i < 6; i++) c.applyMoves(['R', 'U', "R'", "U'"]);
  ok(c.isSolved(), 'sexy move x6 == identity');
}

// A single U should move the front-top edge to the right-top edge (real face turn).
{
  const c = new Cube(3);
  // front-top edge sticker facing F is green at pos (0,-2,2)
  const before = c.colorAt([0, -2, 2], [0, 0, 1]);
  c.applyMove('U');
  const afterRight = c.colorAt([2, -2, 0], [1, 0, 0]); // now facing R
  ok(before === 'G' && afterRight === 'G', 'U carries front-top green sticker toward the right face');
}

// Scramble then exact inverse returns to solved (any size).
for (const n of [2, 3, 4, 5]) {
  let seed = 12345 + n;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const c = new Cube(n);
  const scr = randomScramble(n, 30, rng);
  c.applyMoves(scr);
  ok(!c.isSolved() || n === 1, `${n}x${n} scramble disturbs the cube`);
  c.applyMoves(invertSequence(scr));
  ok(c.isSolved(), `${n}x${n} scramble + inverse == solved`);
}

console.log(`moves.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
