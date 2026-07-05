// Runs the full test suite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const files = ['moves.test.mjs', 'solver.test.mjs', 'lbl.test.mjs', 'reconstruct.test.mjs'];
let failed = false;
for (const f of files) {
  const env = { ...process.env };
  if (f === 'lbl.test.mjs' && !env.LBL_TRIALS) env.LBL_TRIALS = '800';
  const r = spawnSync(process.execPath, [here + f], { stdio: 'inherit', env });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
