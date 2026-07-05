// solver.js — produces a correct, animatable solution for the current cube.
//
// 3x3 cubes are solved with the real layer-by-layer method (js/lbl.js), which
// works from ANY valid state (including one reconstructed from a photo) and comes
// with human-readable phase labels for step-by-step learning.
//
// Other sizes are solved by inverting the recorded move history (always valid for
// states the app itself produced).

import { invertSequence, simplify } from './cube.js';
import { solveCube } from './lbl.js';

// Solve the given cube. `history` is only used as a fallback for non-3x3 sizes.
// Returns { moves, phases } where phases is [] when not applicable.
export function solve(cube, history) {
  if (cube.n === 3) {
    const { moves, phases, success } = solveCube(cube);
    if (success) return { moves, phases };
    // extremely defensive fallback (should not happen for valid states)
    return { moves: solveFromHistory(history), phases: [] };
  }
  return { moves: solveFromHistory(history), phases: [] };
}

export function solveFromHistory(history) {
  const net = simplify(history.slice());
  return simplify(invertSequence(net));
}
