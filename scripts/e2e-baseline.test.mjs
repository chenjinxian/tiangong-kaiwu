/**
 * Tests for scripts/e2e-baseline.mjs (G1 J1.5).
 *
 * Dependency-free: run with `node --test scripts/e2e-baseline.test.mjs`.
 * Uses the tiny committed report fixture; no browser, stack, or network access.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'e2e-baseline.mjs');
const FIXTURE = join(
  REPO_ROOT,
  'scripts',
  'fixtures',
  'playwright-report.example.json',
);

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-baseline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('converts the fixture into a deterministic sorted baseline', () => {
  const first = run(['--input', FIXTURE]);
  const second = run(['--input', FIXTURE]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout, 'output must be deterministic');

  const baseline = JSON.parse(first.stdout);
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.source, 'playwright-json');
  assert.equal(baseline.label, undefined);
  assert.equal(baseline.reportErrors, 0);
  assert.deepEqual(baseline.totals, {
    total: 6,
    passed: 3,
    failed: 1,
    skipped: 1,
    flaky: 1,
    expectedFailures: 1,
  });

  assert.deepEqual(
    baseline.tests.map((entry) => `${entry.file} :: ${entry.title} :: ${entry.status}`),
    [
      'e2e/example.spec.ts :: fails with a secret-looking body :: failed',
      'e2e/example.spec.ts :: is a registered known-red :: passed',
      'e2e/example.spec.ts :: is skipped :: skipped',
      'e2e/example.spec.ts :: passes cleanly :: passed',
      'e2e/example.spec.ts :: passes on retry :: flaky',
      'e2e/other.spec.ts :: passes too :: passed',
    ],
  );
  const flaky = baseline.tests.find((entry) => entry.title === 'passes on retry');
  assert.equal(flaky.retries, 1);
  assert.equal(flaky.expectedStatus, 'passed');
  assert.equal(flaky.project, 'chromium');

  // A satisfied test.fail() known-red follows Playwright's "expected" outcome,
  // is flagged via expectedStatus, and is counted separately for review.
  const knownRed = baseline.tests.find(
    (entry) => entry.title === 'is a registered known-red',
  );
  assert.equal(knownRed.status, 'passed');
  assert.equal(knownRed.expectedStatus, 'failed');

  // Never copy timings, error bodies, attachments, screenshots or trace paths.
  const text = first.stdout;
  for (const forbidden of [
    'CANARY-error-body-do-not-copy',
    'registered known-red: blocked-kernel',
    'secret-screenshot',
    'test-results',
    '"duration"',
    'startTime',
    '"attachments"',
  ]) {
    assert.ok(!text.includes(forbidden), `baseline must not include ${forbidden}`);
  }
});

test('--out writes the same summary and --label is preserved', (t) => {
  const dir = tempDir(t);
  const outPath = join(dir, 'baseline.json');
  const result = run([
    '--input',
    FIXTURE,
    '--out',
    outPath,
    '--label',
    'backend-20261123-candidate',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /e2e baseline written/);
  assert.match(result.stdout, /6 tests: 3 passed, 1 failed, 1 skipped, 1 flaky/);

  const baseline = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(baseline.label, 'backend-20261123-candidate');
  const stdoutOnly = run(['--input', FIXTURE, '--label', 'backend-20261123-candidate']);
  assert.equal(readFileSync(outPath, 'utf8'), stdoutOnly.stdout);
});

test('--fail-on-unexpected turns failed/flaky results into a gate failure', (t) => {
  const result = run(['--input', FIXTURE, '--fail-on-unexpected']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /e2e baseline FAILED: 1 failed, 1 flaky/);

  const dir = tempDir(t);
  const cleanPath = join(dir, 'clean-report.json');
  writeFileSync(
    cleanPath,
    JSON.stringify({
      suites: [
        {
          title: 'clean.spec.ts',
          file: 'e2e/clean.spec.ts',
          specs: [
            {
              title: 'passes',
              tests: [
                {
                  projectName: 'chromium',
                  status: 'expected',
                  results: [{ status: 'passed' }],
                },
              ],
            },
          ],
        },
      ],
      errors: [],
    }),
    'utf8',
  );
  const clean = run([
    '--input',
    cleanPath,
    '--fail-on-unexpected',
  ]);
  assert.equal(clean.status, 0, clean.stderr);

  // An unexpected pass of a test.fail() known-red is a real failure: the
  // known-red must be reviewed and removed.
  const unexpectedPassPath = join(dir, 'unexpected-pass.json');
  writeFileSync(
    unexpectedPassPath,
    JSON.stringify({
      suites: [
        {
          title: 'known-red.spec.ts',
          file: 'e2e/known-red.spec.ts',
          specs: [
            {
              title: 'fixed but still marked fail',
              tests: [
                {
                  projectName: 'chromium',
                  status: 'unexpected',
                  expectedStatus: 'failed',
                  results: [{ status: 'passed' }],
                },
              ],
            },
          ],
        },
      ],
      errors: [],
    }),
    'utf8',
  );
  const unexpectedPass = run([
    '--input',
    unexpectedPassPath,
    '--fail-on-unexpected',
  ]);
  assert.equal(unexpectedPass.status, 1);
  assert.match(unexpectedPass.stderr, /1 failed/);
  const unexpectedBaseline = run(['--input', unexpectedPassPath]);
  assert.equal(unexpectedBaseline.status, 0);
  assert.equal(
    JSON.parse(unexpectedBaseline.stdout).tests[0].status,
    'failed',
  );
});

test('malformed reports and usage errors fail closed with exit 2', (t) => {
  const missingInput = run([]);
  assert.equal(missingInput.status, 2);
  assert.match(missingInput.stderr, /--input/);

  const unknownFlag = run(['--input', FIXTURE, '--tag', 'x']);
  assert.equal(unknownFlag.status, 2);
  assert.match(unknownFlag.stderr, /invalid arguments/);

  const dir = tempDir(t);
  const badJsonPath = join(dir, 'bad.json');
  writeFileSync(badJsonPath, '{"suites":', 'utf8');
  const badJson = run(['--input', badJsonPath]);
  assert.equal(badJson.status, 2);
  assert.match(badJson.stderr, /not valid JSON/);

  const noSuitesPath = join(dir, 'no-suites.json');
  writeFileSync(noSuitesPath, JSON.stringify({ stats: {} }), 'utf8');
  const noSuites = run(['--input', noSuitesPath]);
  assert.equal(noSuites.status, 2);
  assert.match(noSuites.stderr, /report\.suites/);

  const badTestPath = join(dir, 'bad-test.json');
  writeFileSync(
    badTestPath,
    JSON.stringify({
      suites: [
        {
          title: 'x.spec.ts',
          file: 'e2e/x.spec.ts',
          specs: [{ title: 'broken', tests: [{ status: 'expected' }] }],
        },
      ],
    }),
    'utf8',
  );
  const badTest = run(['--input', badTestPath]);
  assert.equal(badTest.status, 2);
  assert.match(badTest.stderr, /test\.results must be an array/);

  const badLabel = run(['--input', FIXTURE, '--label', 'line1\nline2']);
  assert.equal(badLabel.status, 2);
  assert.match(badLabel.stderr, /single-line/);
});

test('missing report file is an input failure', () => {
  const result = run(['--input', join(REPO_ROOT, 'scripts', 'nope.json')]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read Playwright report/);
});
