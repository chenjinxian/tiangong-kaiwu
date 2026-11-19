#!/usr/bin/env node
/**
 * Generate docs/parity/capability-ledger.json and CAPABILITY-LEDGER.md.
 *
 * Usage: node scripts/parity/build-capability-ledger.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLedger, renderMarkdown } from './lib/capability-ledger.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const ledger = buildLedger(root);

writeFileSync(
  resolve(root, 'docs/parity/capability-ledger.json'),
  `${JSON.stringify(ledger, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  resolve(root, 'docs/parity/CAPABILITY-LEDGER.md'),
  renderMarkdown(ledger),
  'utf8',
);

console.log(
  `capability ledger: ${ledger.counts.total} rows ` +
  `(${Object.entries(ledger.counts.byStatus).map(([k, v]) => `${k}=${v}`).join(', ')})`,
);
