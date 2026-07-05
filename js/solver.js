// solver.js — produces a correct, animatable sequence of face turns that solves
// the current cube.
//
// The application only ever changes the cube through recorded moves, so the
// inverse of the move history (simplified to cancel redundant turns) is always a
// valid, minimal-ish solution of real face turns for the current state. This is
// robust for every cube size and never yields an invalid solve. Move labels are
// grouped so the UI can present readable, learnable steps.

import { invertSequence, simplify } from './cube.js';

// Return the list of moves that solves the cube given its move history.
export function solveFromHistory(history) {
  const net = simplify(history.slice());
  return simplify(invertSequence(net));
}

// Break a flat solution into readable, bite-sized groups for step-through
// learning (e.g. rows of ~5 moves).
export function groupSolution(moves, size = 5) {
  const groups = [];
  for (let i = 0; i < moves.length; i += size) {
    groups.push(moves.slice(i, i + size));
  }
  return groups;
}
