// Runs the full test suite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const files = ['moves.test.mjs', 'solver.test.mjs'];
let failed = false;
for (const f of files) {
  const r = spawnSync(process.execPath, [here + f], { stdio: 'inherit' });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
