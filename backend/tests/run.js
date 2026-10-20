// Portable test runner (works on Node 18+ and Windows): finds *.test.js files and runs them with the built-in test runner.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const scope = process.argv[2]; // "unit" | "integration" | undefined
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.test.js') ? [p] : [];
});
const files = walk(scope ? path.join(root, scope) : root);
if (!files.length) { console.error('No test files found'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
