#!/usr/bin/env node
/**
 * Verify the public /examples catalog: input is sanitized, all entries are
 * strict/strict-oracle, and the generated artifact is up to date.
 *
 * Usage: node scripts/parity/verify-public-catalog.mjs
 */
import { INPUT_REL, OUTPUT_REL, readInput, renderCatalog, validateInput } from './public-catalog-lib.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const input = readInput(root);
const errors = validateInput(root, input);
if (errors.length > 0) {
  console.error(`public catalog FAILED (${errors.length} input errors):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
let current = '';
try {
  current = readFileSync(resolve(root, OUTPUT_REL), 'utf8');
} catch {
  console.error(`public catalog FAILED: generated artifact missing (${OUTPUT_REL})`);
  process.exit(1);
}
if (current !== renderCatalog(input)) {
  console.error('public catalog FAILED: artifact is stale or hand-edited (regenerate from the input)');
  process.exit(1);
}
console.log(
  `public catalog OK: ${input.entries.length} display entries ` +
  `(legacy=${input.legacy === false ? 'false' : 'true'}), ${INPUT_REL} -> ${OUTPUT_REL}; ` +
  'no private ids/paths/raw evidence',
);
