/**
 * Tests for scripts/b3.1g-negative-matrix.mjs (G1 B3.1g).
 *
 * Dependency-free:
 *   node --test scripts/test/b3.1g-negative-matrix.test.mjs
 *
 * These tests prove the harness itself is honest:
 *   - the checked-in matrix validates against the real repos;
 *   - check-only mode never fabricates pass/fail;
 *   - duplicate ids, missing evidence files and missing reasons fail closed;
 *   - probe mode records exact statuses, redacts credentials and skips
 *     mutations unless explicitly allowed;
 *   - the CLI dry-run needs no secrets and reports all cells unproven.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MATRIX,
  applyCheckOnlyStatuses,
  defaultRoots,
  parseArgs,
  reportJson,
  reportMarkdown,
  runProbes,
  summarize,
  validateMatrix,
} from '../b3.1g-negative-matrix.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'b3.1g-negative-matrix.mjs');

function cloneMatrix() {
  return MATRIX.map((cell) => ({
    ...cell,
    evidence: cell.evidence?.map((evidence) => ({ ...evidence })),
    probe: cell.probe ? { ...cell.probe } : undefined,
  }));
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'b31g-harness-'));
}

test('checked-in matrix validates and covers every required surface/principal', () => {
  const cells = cloneMatrix();
  const { issues, warnings } = validateMatrix(cells, defaultRoots());

  assert.deepEqual(issues, []);
  // Missing private checkouts are warnings, never fabricated passes.
  assert.ok(Array.isArray(warnings));
  assert.ok(cells.length >= 60, `expected a broad matrix, got ${cells.length} cells`);
  for (const surface of ['hub', 'ms', 'bff', 'wa', 'storage', 'tile']) {
    assert.ok(cells.some((cell) => cell.surface === surface), `missing surface ${surface}`);
  }
  for (const principal of ['admin', 'editor', 'viewer', 'readonly', 'outsider', 'anonymous', 'service', 'api-key-only']) {
    assert.ok(cells.some((cell) => cell.principal === principal), `missing principal ${principal}`);
  }
});

test('check-only mode reports every cell unproven (no fabricated pass/fail)', () => {
  const cells = cloneMatrix();
  applyCheckOnlyStatuses(cells);
  const summary = summarize(cells);

  assert.equal(summary.cells, cells.length);
  assert.equal(summary.pass, 0);
  assert.equal(summary.fail, 0);
  assert.equal(summary.unproven, cells.length);
});

test('validation fails closed on duplicates, missing evidence, and missing reasons', () => {
  const root = tempDir();
  try {
    const base = {
      surface: 'hub',
      route: 'GET /x',
      principal: 'viewer',
      expected: 200,
      coverage: 'automated',
      evidence: [{ repo: 'hub', file: 'test/missing.spec.ts', test: 'does not exist' }],
    };
    const { issues } = validateMatrix(
      [
        { ...base, id: 'a.b' },
        { ...base, id: 'a.b' },
        {
          id: 'c.d',
          surface: 'ms',
          route: 'GET /y',
          principal: 'outsider',
          expected: 403,
          coverage: 'manual',
        },
        {
          id: 'e.f',
          surface: 'bff',
          route: 'GET /z',
          principal: 'anonymous',
          expected: 401,
          coverage: 'unproven',
        },
      ],
      { hub: root },
    );

    assert.ok(issues.some((issue) => issue.includes('duplicate cell id: a.b')));
    assert.ok(issues.some((issue) => issue.includes('evidence file missing')));
    assert.ok(issues.some((issue) => issue.includes('manual cell requires manualReason')));
    assert.ok(issues.some((issue) => issue.includes('unproven cell requires reason')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe mode records exact statuses, redacts credentials, and skips mutations', async () => {
  const secret = 'super-secret-token-value';
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, echo: secret }));
      return;
    }
    if (req.method === 'POST' && req.url === '/deny') {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'denied' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/wrong') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const config = {
    baseUrls: { hub: baseUrl },
    principals: {
      viewer: { headers: { Authorization: `Bearer ${secret}` } },
      anonymous: { headers: {} },
    },
    ids: { itwinA: '11111111-1111-4111-8111-111111111111' },
  };

  const cells = [
    {
      id: 'probe.get.ok',
      surface: 'hub',
      route: 'GET /ok',
      principal: 'viewer',
      expected: 200,
      coverage: 'automated',
      evidence: [],
      probe: { method: 'GET', path: '/ok', expect: [200] },
    },
    {
      id: 'probe.post.skipped',
      surface: 'hub',
      route: 'POST /deny',
      principal: 'viewer',
      expected: 403,
      coverage: 'automated',
      evidence: [],
      probe: { method: 'POST', path: '/deny', expect: [403], mutation: true },
    },
    {
      id: 'probe.get.wrong',
      surface: 'hub',
      route: 'GET /wrong',
      principal: 'anonymous',
      expected: 200,
      coverage: 'automated',
      evidence: [],
      probe: { method: 'GET', path: '/wrong', expect: [200] },
    },
  ];

  try {
    await runProbes(cells, config, {
      allowMutations: false,
      timeoutMs: 5_000,
    });

    assert.equal(cells[0].status, 'pass');
    assert.equal(cells[0].observed.response.status, 200);
    assert.match(cells[0].observed.response.bodySnippet, /\[redacted\]/);
    assert.ok(!JSON.stringify(cells[0]).includes(secret));

    assert.equal(cells[1].status, 'unproven');
    assert.match(cells[1].statusReason, /mutation probe skipped/);

    assert.equal(cells[2].status, 'fail');
    assert.equal(cells[2].observed.response.status, 500);
    assert.match(cells[2].statusReason, /expected 200/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('report serializers include every cell, status and blocker', () => {
  const cells = cloneMatrix();
  applyCheckOnlyStatuses(cells);
  const report = {
    schemaVersion: 1,
    matrix: 'B3.1g-negative-matrix',
    environment: {
      generatedAt: '2026-11-24T00:00:00.000Z',
      mode: 'check',
      node: process.version,
      platform: process.platform,
      hostname: 'test',
      repos: {},
    },
    validation: { ok: true, issues: [], warnings: [] },
    summary: summarize(cells),
    blockers: ['storage is unproven'],
    cells,
    testRuns: null,
  };

  const parsed = JSON.parse(reportJson(report));
  assert.equal(parsed.cells.length, cells.length);
  assert.ok(parsed.cells.every((cell) => ['pass', 'fail', 'unproven'].includes(cell.status)));

  const markdown = reportMarkdown(report);
  assert.match(markdown, /# B3.1g negative matrix report/);
  assert.match(markdown, /## Unproven cells/);
  assert.match(markdown, /storage is unproven/);
});

test('check mode needs no secrets: sanitized env still emits valid JSON', () => {
  const root = tempDir();
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    HOME: process.env.HOME,
  };
  try {
    const run = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--check',
        '--format',
        'json',
        '--ms-root',
        join(root, 'missing-ms'),
        '--hub-root',
        join(root, 'missing-hub'),
        '--wa-root',
        join(root, 'missing-wa'),
        '--bff-root',
        join(REPO_ROOT, 'services', 'bff'),
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', env, timeout: 60_000 },
    );

    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.validation.ok, true);
    assert.equal(report.summary.pass, 0);
    assert.equal(report.summary.fail, 0);
    assert.equal(report.summary.unproven, report.summary.cells);
    assert.ok(report.validation.warnings.some((warning) => warning.includes('reference not statically verified')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI parsing defaults to check and rejects unknown flags', () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.mode, 'check');
  assert.equal(parsed.runTests, false);
  assert.equal(parsed.format, 'markdown');
  assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
  assert.throws(() => parseArgs(['--format', 'xml']), /--format/);
  assert.throws(() => parseArgs(['--probe-config']), /requires a value/);
});

test('checked-in matrix JSON report has no secret-looking fields in check mode', () => {
  const cells = cloneMatrix();
  applyCheckOnlyStatuses(cells);
  const serialized = JSON.stringify(cells);
  // The matrix definition itself must not embed bearer tokens or credentials.
  // Header *names* in test titles/notes are fine; header assignments are not.
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._-]{20,}/);
  assert.doesNotMatch(serialized, /"X-API-Key"\s*:/i);
  assert.doesNotMatch(serialized, /"X-Service-Token"\s*:/i);
});
