#!/usr/bin/env node
/**
 * Run a corpus batch through the real-stack Playwright driver.
 *
 * The batch file is produced by the private parity tooling (tri-state registry /
 * work queue). This wrapper validates its outer shape, wires ONSHAPE_BATCH_FILE /
 * BATCH_REPORT_FILE, and shells out to `apps/web` Playwright. It does not create
 * iModels itself or bypass the web app; the spec does the real work.
 *
 * Usage:
 *   node scripts/parity/run-batch.mjs --batch <batch.json> [--out <report.jsonl>]
 *                                     [--grep <regex>]
 *
 * Prerequisites: dev stack (web :5300 + modeling-server :5401 + imodelhub), e2e
 * hooks enabled (VITE_E2E_HOOKS=true, VITE_B_MODEL_ENABLED=true) or Playwright's
 * webServer will start one. Onshape parity data must be present at ONSHAPE_PARITY_DATA
 * (default D:\Github\onshape-parity-data). The batch report contains per-entry
 * volumes/errors and is meant for the private repo.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const root = fileURLToPath(new URL('../..', import.meta.url));
const batchArg = arg('--batch');
if (!batchArg) {
  console.error('usage: node scripts/parity/run-batch.mjs --batch <batch.json> [--out <report.jsonl>] [--grep <regex>]');
  process.exit(2);
}
const batchPath = resolve(process.cwd(), batchArg);
if (!existsSync(batchPath)) {
  console.error(`batch file not found: ${batchPath}`);
  process.exit(2);
}
let batch;
try {
  batch = JSON.parse(readFileSync(batchPath, 'utf8'));
} catch (error) {
  console.error(`batch file invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
if (!batch || batch.schemaVersion !== 1 || typeof batch.name !== 'string' || !Array.isArray(batch.entries) || batch.entries.length === 0) {
  console.error('batch file invalid: expected { schemaVersion:1, name, entries:[...] }');
  process.exit(2);
}
const reportPath = resolve(
  process.cwd(),
  arg('--out', batchPath.replace(/\.json$/i, '') + '.report.jsonl'),
);
if (existsSync(reportPath)) {
  // Append rows are timestamped; keep prior runs instead of silently overwriting.
  console.log(`[run-batch] appending report: ${reportPath}`);
} else {
  appendFileSync(reportPath, '', 'utf8');
}

const grep = arg('--grep');
const webRoot = resolve(root, 'luban-cad/apps/web');
const playwrightArgs = ['pnpm@10', 'exec', 'playwright', 'test', 'e2e/examples/corpus/batch.spec.ts', '--reporter=line'];
if (grep) playwrightArgs.push('--grep', grep);

console.log(`[run-batch] ${batch.name}: ${batch.entries.length} entries`);
console.log(`[run-batch] batch=${batchPath}`);
console.log(`[run-batch] report=${reportPath}`);
const result = spawnSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', playwrightArgs, {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    ONSHAPE_BATCH_FILE: batchPath,
    BATCH_REPORT_FILE: reportPath,
  },
  shell: false,
});

let passed = 0;
let failed = 0;
try {
  for (const line of readFileSync(reportPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.status === 'passed') passed++;
    else if (row.status === 'failed') failed++;
  }
} catch {
  // Report parsing is advisory; the Playwright exit code is authoritative.
}
console.log(`[run-batch] playwright exit=${result.status ?? 'null'} (passed rows=${passed}, failed rows=${failed})`);
process.exit(result.status ?? 1);
