#!/usr/bin/env node
/**
 * Verify capability ledger freshness and invariants.
 *
 * Usage: node scripts/parity/verify-capability-ledger.mjs
 * Exit code: 0 = clean, 1 = errors.
 */
import { fileURLToPath } from 'node:url';
import { verifyLedger } from './lib/capability-ledger.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const errors = verifyLedger(root);

if (errors.length > 0) {
  console.error(`capability ledger FAILED (${errors.length} error(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('capability ledger OK');
