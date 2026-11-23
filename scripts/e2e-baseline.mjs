#!/usr/bin/env node
/**
 * Playwright JSON report -> deterministic e2e baseline summary (G1 J1.5).
 *
 * The baseline intentionally contains only stable identity/outcome data:
 * file, title, project, status, expectedStatus, retries. It never copies
 * timestamps, durations, error messages, stdout/stderr, attachments, trace
 * paths, screenshots or tokens, so a baseline can be archived as a release
 * asset without leaking runtime details.
 *
 * Input: the report produced by Playwright's JSON reporter, for example:
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=release/playwright-report.json \
 *     npx playwright test --reporter=json
 *
 * Usage:
 *   node scripts/e2e-baseline.mjs --input <report.json> [--out <baseline.json>]
 *     [--label <release-candidate-label>] [--fail-on-unexpected]
 *
 * Exit codes:
 *   0 = baseline summary produced (even when it honestly records failures)
 *   1 = --fail-on-unexpected and the report has failed/flaky tests or report errors
 *   2 = usage error or malformed/unreadable report
 *
 * This tool does not run Playwright and does not contact the stack.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const SCHEMA_VERSION = 1;
export const SOURCE_FORMAT = 'playwright-json';

const STATUS_PASSED = 'passed';
const STATUS_FAILED = 'failed';
const STATUS_SKIPPED = 'skipped';
const STATUS_FLAKY = 'flaky';
const NORMALIZED_STATUSES = new Set([
  STATUS_PASSED,
  STATUS_FAILED,
  STATUS_SKIPPED,
  STATUS_FLAKY,
]);

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireSingleLineString(value, path) {
  if (typeof value !== 'string') {
    throw new InputError(`${path}: must be a string`);
  }
  if (/[\r\n\0]/.test(value)) {
    throw new InputError(`${path}: must be a single-line string`);
  }
  return value;
}

function deriveStatus(test, results) {
  if (test.status === 'skipped') return STATUS_SKIPPED;
  if (test.status === 'flaky') return STATUS_FLAKY;
  if (test.status === 'unexpected') return STATUS_FAILED;
  if (test.status === 'expected') {
    // Playwright's "expected" outcome covers both normal passes and satisfied
    // test.fail() known-reds. The latter stay visible through expectedStatus
    // and are counted in totals.expectedFailures; they do not turn into
    // unexpected failures. An unexpected pass is reported by Playwright as
    // "unexpected" and therefore lands in the failed bucket.
    const allSkipped =
      results.length > 0 &&
      results.every((result) => result.status === 'skipped');
    return allSkipped ? STATUS_SKIPPED : STATUS_PASSED;
  }

  const passed = results.filter((result) => result.status === 'passed').length;
  const failed = results.filter(
    (result) =>
      result.status === 'failed' ||
      result.status === 'timedOut' ||
      result.status === 'interrupted',
  ).length;
  if (failed > 0 && passed > 0) return STATUS_FLAKY;
  if (failed > 0) return STATUS_FAILED;
  if (passed > 0) return STATUS_PASSED;
  return STATUS_SKIPPED;
}

function collectSuite(suite, inheritedFile, entries) {
  if (!isPlainObject(suite)) {
    throw new InputError('suites[]: must be an object');
  }
  if (suite.title !== undefined) requireSingleLineString(suite.title, 'suite.title');

  const file =
    suite.file !== undefined
      ? requireSingleLineString(suite.file, 'suite.file')
      : inheritedFile;

  if (suite.specs !== undefined && !Array.isArray(suite.specs)) {
    throw new InputError('suite.specs: must be an array');
  }
  for (const spec of suite.specs ?? []) {
    if (!isPlainObject(spec)) {
      throw new InputError('spec: must be an object');
    }
    const title = requireSingleLineString(spec.title, 'spec.title');
    const specFile =
      spec.file !== undefined
        ? requireSingleLineString(spec.file, 'spec.file')
        : file;
    if (specFile === undefined) {
      throw new InputError(`spec "${title}": no file was provided by the report`);
    }
    if (!Array.isArray(spec.tests)) {
      throw new InputError(`spec "${title}": tests must be an array`);
    }

    for (const test of spec.tests) {
      if (!isPlainObject(test)) {
        throw new InputError(`spec "${title}": test must be an object`);
      }
      if (!Array.isArray(test.results)) {
        throw new InputError(`spec "${title}": test.results must be an array`);
      }
      for (const result of test.results) {
        if (!isPlainObject(result)) {
          throw new InputError(`spec "${title}": result must be an object`);
        }
        if (result.status !== undefined && typeof result.status !== 'string') {
          throw new InputError(
            `spec "${title}": result.status must be a string`,
          );
        }
      }

      const status = deriveStatus(test, test.results);
      if (!NORMALIZED_STATUSES.has(status)) {
        throw new InputError(`spec "${title}": unsupported test status`);
      }
      const project =
        test.projectName === undefined
          ? ''
          : requireSingleLineString(test.projectName, 'test.projectName');
      const expectedStatus =
        test.expectedStatus === undefined
          ? ''
          : requireSingleLineString(test.expectedStatus, 'test.expectedStatus');

      entries.push({
        file: specFile,
        title,
        project,
        status,
        expectedStatus,
        retries: Math.max(0, test.results.length - 1),
      });
    }
  }

  if (suite.suites !== undefined && !Array.isArray(suite.suites)) {
    throw new InputError('suite.suites: must be an array');
  }
  for (const child of suite.suites ?? []) {
    collectSuite(child, file, entries);
  }
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareEntries(left, right) {
  return (
    compareStrings(left.file, right.file) ||
    compareStrings(left.title, right.title) ||
    compareStrings(left.project, right.project) ||
    compareStrings(left.status, right.status)
  );
}

/**
 * Convert a parsed Playwright JSON report into a deterministic baseline.
 * Throws InputError on malformed reports.
 */
export function buildBaseline(report, { label } = {}) {
  if (!isPlainObject(report)) {
    throw new InputError('report: must be a JSON object');
  }
  if (!Array.isArray(report.suites)) {
    throw new InputError('report.suites: required array');
  }

  const entries = [];
  for (const suite of report.suites) {
    collectSuite(suite, undefined, entries);
  }
  entries.sort(compareEntries);

  const totals = {
    total: entries.length,
    passed: entries.filter((entry) => entry.status === STATUS_PASSED).length,
    failed: entries.filter((entry) => entry.status === STATUS_FAILED).length,
    skipped: entries.filter((entry) => entry.status === STATUS_SKIPPED).length,
    flaky: entries.filter((entry) => entry.status === STATUS_FLAKY).length,
    // Sub-count of passed entries that satisfied a registered test.fail()
    // known-red. Review these explicitly; they are not unexpected failures.
    expectedFailures: entries.filter(
      (entry) =>
        entry.status === STATUS_PASSED && entry.expectedStatus === 'failed',
    ).length,
  };

  const reportErrors = Array.isArray(report.errors) ? report.errors.length : 0;

  const baseline = {
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE_FORMAT,
  };
  if (label !== undefined) baseline.label = label;
  baseline.reportErrors = reportErrors;
  baseline.totals = totals;
  baseline.tests = entries;
  return baseline;
}

function readReport(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new InputError(`cannot read Playwright report: ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Do not echo parser messages: they can include report content.
    throw new InputError('Playwright report is not valid JSON');
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/e2e-baseline.mjs --input <report.json> [--out <baseline.json>]
    [--label <release-candidate-label>] [--fail-on-unexpected]

Converts a Playwright JSON report into a deterministic baseline summary (G1
J1.5). Output contains only file/title/project/status/expectedStatus/retries
and counts; timings, errors, attachments and tokens are never copied.
Satisfied test.fail() known-reds follow Playwright's "expected" outcome and are
counted in totals.expectedFailures (review them explicitly); unexpected tests,
flaky tests and report errors remain failures.

Generate the input report with Playwright's JSON reporter, for example:
  PLAYWRIGHT_JSON_OUTPUT_NAME=release/playwright-report.json \\
    npx playwright test --reporter=json

Exit codes: 0 = baseline produced (failures are recorded honestly),
1 = --fail-on-unexpected with failed/flaky tests or report errors,
2 = usage error or malformed/unreadable report.`);
}

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  input: { type: 'string' },
  out: { type: 'string' },
  label: { type: 'string' },
  'fail-on-unexpected': { type: 'boolean' },
};

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: OPTIONS,
    });
  } catch (error) {
    // Do not echo argv: an unknown option could carry a secret value.
    const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
    console.error(`e2e-baseline: invalid arguments${code}`);
    console.error('Run with --help for usage.');
    return 2;
  }

  const { values } = parsed;
  if (values.help) {
    printHelp();
    return 0;
  }

  try {
    if (values.input === undefined) {
      throw new InputError('--input <report.json> is required');
    }
    let label;
    if (values.label !== undefined) {
      requireSingleLineString(values.label, '--label');
      if (values.label.length > 200) {
        throw new InputError('--label: must be at most 200 characters');
      }
      label = values.label;
    }

    const report = readReport(values.input);
    const baseline = buildBaseline(report, { label });
    const text = `${JSON.stringify(baseline, null, 2)}\n`;

    if (values.out !== undefined) {
      try {
        writeFileSync(values.out, text, 'utf8');
      } catch {
        throw new InputError(`cannot write baseline: ${values.out}`);
      }
      console.log(
        `e2e baseline written: ${values.out} (${baseline.totals.total} tests: ` +
          `${baseline.totals.passed} passed, ${baseline.totals.failed} failed, ` +
          `${baseline.totals.skipped} skipped, ${baseline.totals.flaky} flaky)`,
      );
    } else {
      process.stdout.write(text);
    }

    if (
      values['fail-on-unexpected'] &&
      (baseline.totals.failed > 0 ||
        baseline.totals.flaky > 0 ||
        baseline.reportErrors > 0)
    ) {
      console.error(
        `e2e baseline FAILED: ${baseline.totals.failed} failed, ` +
          `${baseline.totals.flaky} flaky, ${baseline.reportErrors} report error(s)`,
      );
      return 1;
    }
    return 0;
  } catch (error) {
    if (error instanceof InputError) {
      console.error(`e2e-baseline: ${error.message}`);
      return 2;
    }
    console.error(`e2e-baseline: unexpected error (${error?.name ?? 'Error'})`);
    return 2;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
