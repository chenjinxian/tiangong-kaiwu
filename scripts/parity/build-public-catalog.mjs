#!/usr/bin/env node
/**
 * Generate the public /examples catalog from the sanitized input snapshot.
 *
 * Usage:
 *   node scripts/parity/build-public-catalog.mjs          # write generated file
 *   node scripts/parity/build-public-catalog.mjs --check  # verify only (CI)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INPUT_REL, OUTPUT_REL, readInput, renderCatalog, validateInput } from './public-catalog-lib.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const check = process.argv.includes('--check');
const input = readInput(root);
const errors = validateInput(root, input);
if (errors.length > 0) {
  console.error(`public catalog input INVALID (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
const rendered = renderCatalog(input);
const outputPath = resolve(root, OUTPUT_REL);
if (check) {
  let current = '';
  try { current = readFileSync(outputPath, 'utf8'); } catch { /* missing */ }
  if (current !== rendered) {
    console.error('public catalog STALE: regenerate with node scripts/parity/build-public-catalog.mjs');
    process.exit(1);
  }
  console.log(`public catalog OK (${input.entries.length} entries, ${INPUT_REL} -> ${OUTPUT_REL})`);
} else {
  writeFileSync(outputPath, rendered, 'utf8');
  console.log(`public catalog generated: ${input.entries.length} entries -> ${OUTPUT_REL}`);
}
