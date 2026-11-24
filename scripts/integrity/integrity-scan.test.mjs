/**
 * Focused tests for the read-only Hub integrity scan (G1 E8 skeleton).
 *
 * Run: node --test scripts/integrity/integrity-scan.test.mjs
 *
 * All fixtures are synthetic. No network, Docker, Postgres, or live stack is
 * touched. The CLI is exercised against temporary snapshot/inventory files and
 * a temporary blob directory only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXIT_CODES,
  computeChainRoot,
  normalizeInventory,
  normalizeSnapshot,
  renderMarkdown,
  scanIntegrity,
} from './scan-core.mjs';
import {
  SourceError,
  UsageError,
  assertSelectStatement,
  buildReadOnlySql,
  collectSnapshotFromPostgres,
  parseBlobListXml,
  runIntegrityScan,
  signAzureRequest,
} from './Invoke-IntegrityScan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'Invoke-IntegrityScan.mjs');

const IM = '11111111-1111-4111-8111-111111111111';
const ID1 = 'a'.repeat(40);
const ID2 = 'b'.repeat(40);
const ID3 = 'c'.repeat(40);
const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);

const CONTENT = {
  baseline: 'baseline-bytes',
  changeset1: 'changeset-one-bytes',
  changeset2: 'changeset-two-bytes',
  checkpoint1: 'checkpoint-one-bytes',
};

const BLOB = {
  baseline: `imodels/${IM}/baseline.bim`,
  changeset1: `imodels/${IM}/changesets/1.changeset`,
  changeset2: `imodels/${IM}/changesets/2.changeset`,
  checkpoint1: `imodels/${IM}/checkpoints/1.bim`,
};

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'integrity-scan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function snapshot(overrides = {}) {
  const base = {
    schemaVersion: 1,
    changesets: [
      {
        iModelId: IM,
        id: ID1,
        index: 1,
        parentId: null,
        prevHash: null,
        chainHash: H1,
        checksum: sha256(CONTENT.changeset1),
        fileSize: Buffer.byteLength(CONTENT.changeset1),
        blobPath: BLOB.changeset1,
        state: 'fileUploaded',
      },
      {
        iModelId: IM,
        id: ID2,
        index: 2,
        parentId: ID1,
        prevHash: H1,
        chainHash: H2,
        checksum: sha256(CONTENT.changeset2),
        fileSize: Buffer.byteLength(CONTENT.changeset2),
        blobPath: BLOB.changeset2,
        state: 'fileUploaded',
      },
    ],
    baselines: [
      {
        iModelId: IM,
        blobPath: BLOB.baseline,
        fileSize: Buffer.byteLength(CONTENT.baseline),
        sha256: sha256(CONTENT.baseline),
      },
    ],
    checkpoints: [
      {
        id: 'checkpoint-1',
        iModelId: IM,
        changesetId: ID1,
        changesetIndex: 1,
        state: 'successful',
        fileSize: Buffer.byteLength(CONTENT.checkpoint1),
        contentSha256: sha256(CONTENT.checkpoint1),
        blobPath: BLOB.checkpoint1,
      },
    ],
    namedVersions: [],
    imodels: [{ id: IM, name: 'sample', state: 'initialized', changesetCount: 2 }],
  };
  return normalizeSnapshot({ ...base, ...overrides });
}

function inventory(overrides = {}) {
  const blobs = [
    { name: BLOB.baseline, size: Buffer.byteLength(CONTENT.baseline), sha256: sha256(CONTENT.baseline) },
    { name: BLOB.changeset1, size: Buffer.byteLength(CONTENT.changeset1), sha256: sha256(CONTENT.changeset1) },
    { name: BLOB.changeset2, size: Buffer.byteLength(CONTENT.changeset2), sha256: sha256(CONTENT.changeset2) },
    { name: BLOB.checkpoint1, size: Buffer.byteLength(CONTENT.checkpoint1), sha256: sha256(CONTENT.checkpoint1) },
  ];
  return normalizeInventory({ schemaVersion: 1, blobs, ...overrides });
}

function scan(snap = snapshot(), inv = inventory(), options = {}) {
  return scanIntegrity(snap, inv, { orphanPrefixes: ['imodels/'], ...options });
}

function codes(report) {
  return report.findings.map((item) => item.code).sort();
}

function writeJsonFile(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeBlobTree(root) {
  for (const [key, text] of Object.entries(CONTENT)) {
    const relativePath = BLOB[key];
    const fullPath = join(root, ...relativePath.split('/'));
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, text, 'utf8');
  }
}

test('clean ledger + blobs reports CLEAN and a reproducible chain root', () => {
  const report = scan();
  assert.equal(report.result, 'CLEAN');
  assert.equal(report.exitCode, EXIT_CODES.OK);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.unverified.length, 0);
  assert.deepEqual(codes(report), []);
  assert.equal(report.chains.length, 1);
  assert.equal(report.chains[0].headIndex, 2);
  assert.equal(report.chains[0].headChangesetId, ID2);
  assert.equal(report.chains[0].committedCount, 2);
  const expectedRoot = createHash('sha256')
    .update(`1|${ID1}|${H1}\n2|${ID2}|${H2}\n\n`)
    .digest('hex');
  assert.equal(report.chains[0].chainRoot, expectedRoot);
  assert.equal(computeChainRoot([
    { index: 2, id: ID2, chainHash: H2 },
    { index: 1, id: ID1, chainHash: H1 },
  ]).root, expectedRoot);
});

test('missing changeset blob is an error', () => {
  const inv = inventory({ blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.changeset2) });
  const report = scan(snapshot(), inv);
  assert.equal(report.exitCode, EXIT_CODES.FINDINGS);
  assert.ok(codes(report).includes('missing-changeset-blob'));
  const finding = report.findings.find((item) => item.code === 'missing-changeset-blob');
  assert.equal(finding.changesetId, ID2);
  assert.equal(finding.blobPath, BLOB.changeset2);
});

test('blob size mismatch is an error with expected/actual sizes', () => {
  const inv = inventory({
    blobs: inventory().blobs.map((blob) =>
      blob.name === BLOB.changeset2 ? { ...blob, size: blob.size + 1 } : blob,
    ),
  });
  const report = scan(snapshot(), inv);
  assert.equal(report.exitCode, EXIT_CODES.FINDINGS);
  const finding = report.findings.find((item) => item.code === 'blob-size-mismatch');
  assert.ok(finding);
  assert.equal(finding.expected, Buffer.byteLength(CONTENT.changeset2));
  assert.equal(finding.actual, Buffer.byteLength(CONTENT.changeset2) + 1);
});

test('SHA-256 mismatch is an error with expected/actual digests', () => {
  const wrong = 'f'.repeat(64);
  const inv = inventory({
    blobs: inventory().blobs.map((blob) =>
      blob.name === BLOB.changeset2 ? { ...blob, sha256: wrong } : blob,
    ),
  });
  const report = scan(snapshot(), inv);
  assert.equal(report.exitCode, EXIT_CODES.FINDINGS);
  const finding = report.findings.find((item) => item.code === 'blob-sha256-mismatch');
  assert.ok(finding);
  assert.equal(finding.expected, sha256(CONTENT.changeset2));
  assert.equal(finding.actual, wrong);
});

test('orphan blob under a managed prefix is an error; absent prefix skips the check', () => {
  const orphanName = `imodels/${IM}/changesets/orphan.changeset`;
  const inv = inventory({
    blobs: [...inventory().blobs, { name: orphanName, size: 12, sha256: sha256('orphan-bytes') }],
  });
  const report = scan(snapshot(), inv);
  assert.equal(report.exitCode, EXIT_CODES.FINDINGS);
  const finding = report.findings.find((item) => item.code === 'orphan-blob');
  assert.ok(finding);
  assert.equal(finding.blobPath, orphanName);

  const skipped = scan(snapshot(), inv, { orphanPrefixes: [] });
  assert.equal(skipped.exitCode, EXIT_CODES.INCOMPLETE);
  assert.ok(skipped.unverified.some((item) => item.code === 'orphan-scan-skipped'));
});

test('dangling parent/changeset/checkpoint/Named Version rows are errors', () => {
  const snap = snapshot({
    changesets: [
      {
        iModelId: IM,
        id: ID2,
        index: 2,
        parentId: ID1,
        prevHash: H1,
        chainHash: H2,
        checksum: sha256(CONTENT.changeset2),
        fileSize: Buffer.byteLength(CONTENT.changeset2),
        blobPath: BLOB.changeset2,
        state: 'fileUploaded',
      },
    ],
    checkpoints: [
      {
        id: 'checkpoint-1',
        iModelId: IM,
        changesetId: ID1,
        changesetIndex: 1,
        state: 'successful',
        fileSize: Buffer.byteLength(CONTENT.checkpoint1),
        contentSha256: sha256(CONTENT.checkpoint1),
        blobPath: BLOB.checkpoint1,
      },
    ],
    namedVersions: [{ id: 'nv1', name: 'V1', iModelId: IM, changesetId: ID3 }],
  });
  const inv = inventory({
    blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.changeset1 && blob.name !== BLOB.baseline),
  });
  const report = scan(snap, inv);
  assert.equal(report.exitCode, EXIT_CODES.FINDINGS);
  const present = new Set(codes(report));
  for (const expected of [
    'missing-changeset',
    'dangling-parent',
    'checkpoint-target-missing',
    'dangling-named-version',
    'missing-baseline-blob',
  ]) {
    assert.ok(present.has(expected), `expected ${expected}, got ${[...present].join(', ')}`);
  }
});

test('Named Version without a successful checkpoint is reported as a warning', () => {
  const snap = snapshot({
    checkpoints: [],
    namedVersions: [{ id: 'nv1', name: 'V1', iModelId: IM, changesetId: ID2 }],
  });
  const inv = inventory({
    blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.checkpoint1),
  });
  const report = scan(snap, inv);
  assert.equal(report.exitCode, EXIT_CODES.OK);
  assert.ok(codes(report).includes('named-version-checkpoint-missing'));
});

test('missing baseline is an error when baseline inventory is known', () => {
  const snap = snapshot({ baselines: [] });
  const inv = inventory({ blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.baseline) });
  const report = scan(snap, inv);
  assert.equal(report.exitCode, EXIT_CODES.FINDINGS);
  assert.ok(codes(report).includes('missing-baseline'));
});

test('unknown/partial baseline inventory becomes unverified, not a false missing error', () => {
  const snap = snapshot({ baselines: [], baselinesKnown: false });
  const inv = inventory({ blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.baseline) });
  const report = scan(snap, inv);
  assert.equal(report.exitCode, EXIT_CODES.INCOMPLETE);
  assert.ok(!codes(report).includes('missing-baseline'));
  assert.ok(report.unverified.some((item) => item.code === 'baseline-not-mapped'));
});

test('waitingForFile row is a warning and can gate via failOnWarnings', () => {
  const snap = snapshot({
    changesets: [
      ...snapshot().changesets,
      {
        iModelId: IM,
        id: ID3,
        index: 3,
        parentId: ID2,
        prevHash: H2,
        chainHash: '3'.repeat(64),
        checksum: sha256('pending'),
        fileSize: 7,
        blobPath: `imodels/${IM}/changesets/3.changeset`,
        state: 'waitingForFile',
      },
    ],
  });
  const normal = scan(snap);
  assert.equal(normal.exitCode, EXIT_CODES.OK);
  assert.ok(normal.findings.some((item) => item.code === 'pending-changeset' && item.severity === 'warning'));

  const gated = scan(snap, inventory(), { failOnWarnings: true });
  assert.equal(gated.exitCode, EXIT_CODES.FINDINGS);
});

test('committed changeset without a blob reference is unverified (exit 3)', () => {
  const base = snapshot();
  const snap = snapshot({
    changesets: base.changesets.map((row) => (row.index === 2 ? { ...row, blobPath: null } : row)),
  });
  const inv = inventory({ blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.changeset2) });
  const report = scan(snap, inv, { orphanPrefixes: [] });
  assert.equal(report.exitCode, EXIT_CODES.INCOMPLETE);
  assert.ok(codes(report).includes('changeset-without-blob-reference'));
  assert.ok(report.unverified.some((item) => item.code === 'changeset-blob-unmapped'));
});

test('declared checksum without collected SHA-256 is unverified (exit 3)', () => {
  const inv = inventory({
    blobs: inventory().blobs.map(({ sha256: _sha256, ...blob }) => blob),
  });
  const report = scan(snapshot(), inv);
  assert.equal(report.exitCode, EXIT_CODES.INCOMPLETE);
  assert.ok(report.unverified.some((item) => item.code === 'sha256-not-collected'));
});

test('Markdown report includes result, chains, findings and limitations', () => {
  const inv = inventory({ blobs: inventory().blobs.filter((blob) => blob.name !== BLOB.changeset2) });
  const report = scan(snapshot(), inv);
  const markdown = renderMarkdown(report);
  assert.match(markdown, /# Hub integrity scan/);
  assert.match(markdown, /Result: \*\*FINDINGS\*\*/);
  assert.match(markdown, /missing-changeset-blob/);
  assert.match(markdown, /chain root/i);
  assert.match(markdown, /Does not prove backup restorability/);
});

test('read-only SQL guard accepts SELECT only and wraps it in a read-only transaction', () => {
  assert.equal(assertSelectStatement('SELECT 1'), 'SELECT 1');
  assert.throws(() => assertSelectStatement('DELETE FROM changesets'), /non-SELECT/);
  assert.throws(() => assertSelectStatement('SELECT 1; SELECT 2'), /multi-statement/);
  assert.throws(() => assertSelectStatement("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x"), /non-SELECT/);
  assert.throws(() => assertSelectStatement('SELECT * INTO copy FROM changesets'), /potentially writing/);
  assert.throws(() => assertSelectStatement('SELECT * FROM changesets FOR UPDATE'), /potentially writing/);
  const sql = buildReadOnlySql('SELECT 1', 5000);
  assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /SET LOCAL statement_timeout = 5000;/);
  assert.match(sql, /SELECT 1/);
  assert.match(sql, /COMMIT;/);
});

test('Azure list XML parsing decodes names and pagination marker', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults ContainerName="imodelhub">
  <Blobs>
    <Blob>
      <Name>imodels/a&amp;b/changesets/1</Name>
      <Properties>
        <Last-Modified>Tue, 24 Nov 2026 00:00:00 GMT</Last-Modified>
        <Content-Length>42</Content-Length>
        <Content-MD5>YWJjZA==</Content-MD5>
      </Properties>
    </Blob>
  </Blobs>
  <NextMarker>page-2</NextMarker>
</EnumerationResults>`;
  const parsed = parseBlobListXml(xml);
  assert.equal(parsed.blobs.length, 1);
  assert.equal(parsed.blobs[0].name, 'imodels/a&b/changesets/1');
  assert.equal(parsed.blobs[0].size, 42);
  assert.equal(parsed.blobs[0].md5, 'YWJjZA==');
  assert.equal(parsed.nextMarker, 'page-2');
});

test('Azure SharedKey signature follows the documented canonical form', () => {
  const url = new URL('http://127.0.0.1:10500/devstoreaccount1/imodelhub?restype=container&comp=list');
  const key = Buffer.from('test-key').toString('base64');
  const signed = signAzureRequest({
    method: 'GET',
    url,
    account: 'devstoreaccount1',
    keyBase64: key,
    headers: {},
  });
  assert.match(signed.Authorization, /^SharedKey devstoreaccount1:.+/);
  assert.equal(signed['x-ms-version'], '2021-12-02');
  const canonicalHeaders = `x-ms-date:${signed['x-ms-date']}\nx-ms-version:2021-12-02\n`;
  const expected = createHmac('sha256', Buffer.from(key, 'base64'))
    .update([
      'GET',
      ...Array(11).fill(''),
      canonicalHeaders,
      '/devstoreaccount1/imodelhub\ncomp:list\nrestype:container',
    ].join('\n'))
    .digest('base64');
  assert.equal(signed.Authorization, `SharedKey devstoreaccount1:${expected}`);
});

test('CLI snapshot mode writes JSON + Markdown and exits 0', async (t) => {
  const dir = tempDir(t);
  const snapPath = join(dir, 'snapshot.json');
  const invPath = join(dir, 'inventory.json');
  const jsonOut = join(dir, 'out', 'report.json');
  const mdOut = join(dir, 'out', 'report.md');
  writeJsonFile(snapPath, {
    schemaVersion: 1,
    changesets: snapshot().changesets,
    baselines: snapshot().baselines,
    checkpoints: snapshot().checkpoints,
    namedVersions: [],
    imodels: snapshot().imodels,
  });
  writeJsonFile(invPath, { schemaVersion: 1, blobs: inventory().blobs, managedPrefixes: ['imodels/'] });

  const result = await runIntegrityScan(
    [
      '--db-snapshot', snapPath,
      '--blob-inventory', invPath,
      '--orphan-prefix', 'imodels/',
      '--json-out', jsonOut,
      '--md-out', mdOut,
    ],
    { spawnSync },
  );
  assert.equal(result.exitCode, EXIT_CODES.OK);
  const json = JSON.parse(readFileSync(jsonOut, 'utf8'));
  assert.equal(json.result, 'CLEAN');
  assert.match(readFileSync(mdOut, 'utf8'), /Result: \*\*CLEAN\*\*/);
});

test('CLI directory blob mode hashes actual bytes and detects a corrupted file', async (t) => {
  const dir = tempDir(t);
  const blobDir = join(dir, 'blobs');
  writeBlobTree(blobDir);
  const snapPath = join(dir, 'snapshot.json');
  writeJsonFile(snapPath, {
    schemaVersion: 1,
    changesets: snapshot().changesets,
    baselines: snapshot().baselines,
    checkpoints: snapshot().checkpoints,
    namedVersions: [],
    imodels: snapshot().imodels,
  });

  const clean = await runIntegrityScan(
    [
      '--db-snapshot', snapPath,
      '--blob-mode', 'dir',
      '--blob-dir', blobDir,
      '--blob-hash', 'referenced',
      '--orphan-prefix', 'imodels/',
      '--format', 'json',
    ],
    { spawnSync },
  );
  assert.equal(clean.exitCode, EXIT_CODES.OK);
  assert.equal(clean.report.summary.blobs, 4);

  writeFileSync(join(blobDir, ...BLOB.changeset2.split('/')), 'tampered-bytes', 'utf8');
  const corrupt = await runIntegrityScan(
    [
      '--db-snapshot', snapPath,
      '--blob-mode', 'dir',
      '--blob-dir', blobDir,
      '--blob-hash', 'referenced',
      '--orphan-prefix', 'imodels/',
      '--json-out', join(dir, 'corrupt.json'),
    ],
    { spawnSync },
  );
  assert.equal(corrupt.exitCode, EXIT_CODES.FINDINGS);
  assert.ok(corrupt.report.findings.some((item) => item.code === 'blob-sha256-mismatch'));
});

test('CLI process exits with documented codes and never prompts', (t) => {
  const dir = tempDir(t);
  const snapPath = join(dir, 'snapshot.json');
  const invPath = join(dir, 'inventory.json');
  writeJsonFile(snapPath, {
    schemaVersion: 1,
    changesets: snapshot().changesets,
    baselines: snapshot().baselines,
    checkpoints: snapshot().checkpoints,
    namedVersions: [],
    imodels: snapshot().imodels,
  });
  writeJsonFile(invPath, { schemaVersion: 1, blobs: inventory().blobs, managedPrefixes: ['imodels/'] });

  const ok = spawnSync(
    process.execPath,
    [CLI, '--db-snapshot', snapPath, '--blob-inventory', invPath, '--orphan-prefix', 'imodels/', '--format', 'json'],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).result, 'CLEAN');

  const usage = spawnSync(process.execPath, [CLI], { encoding: 'utf8', timeout: 30000 });
  assert.equal(usage.status, EXIT_CODES.USAGE);
  assert.match(usage.stderr, /configure a metadata source/);

  const missingKey = spawnSync(
    process.execPath,
    [CLI, '--db-snapshot', snapPath, '--blob-mode', 'azure', '--blob-endpoint', 'http://127.0.0.1:1', '--blob-container', 'imodelhub', '--blob-key-env', 'INTEGRITY_TEST_MISSING_KEY'],
    { encoding: 'utf8', timeout: 30000, env: { ...process.env, INTEGRITY_TEST_MISSING_KEY: '' } },
  );
  assert.equal(missingKey.status, EXIT_CODES.USAGE);
  assert.match(missingKey.stderr, /account key/i);
});

test('explicit iModel filter with no matching metadata is incomplete, not clean', async (t) => {
  const dir = tempDir(t);
  const snapPath = join(dir, 'snapshot.json');
  writeJsonFile(snapPath, {
    schemaVersion: 1,
    changesets: snapshot().changesets,
    baselines: snapshot().baselines,
    checkpoints: snapshot().checkpoints,
    namedVersions: [],
    imodels: snapshot().imodels,
  });
  await assert.rejects(
    runIntegrityScan(
      [
        '--db-snapshot', snapPath,
        '--blob-inventory', join(dir, 'inventory.json'),
        '--imodel-id', '99999999-9999-4999-8999-999999999999',
      ],
      { spawnSync },
    ),
    (error) => error instanceof SourceError && /not found in the scanned metadata/.test(error.message),
  );
});

test('invalid snapshot is a usage error (exit 2) and does not fabricate a report', async (t) => {
  const dir = tempDir(t);
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"schemaVersion":1,"changesets":"not-an-array"}', 'utf8');
  await assert.rejects(
    runIntegrityScan(
      ['--db-snapshot', bad, '--blob-inventory', join(dir, 'missing.json')],
      { spawnSync },
    ),
    (error) => error instanceof UsageError && /invalid DB snapshot/.test(error.message),
  );
});

test('Azure mode requires an explicit key environment variable before any network access', async (t) => {
  const dir = tempDir(t);
  const snapPath = join(dir, 'snapshot.json');
  writeJsonFile(snapPath, {
    schemaVersion: 1,
    changesets: snapshot().changesets,
    baselines: snapshot().baselines,
    checkpoints: snapshot().checkpoints,
    namedVersions: [],
    imodels: snapshot().imodels,
  });
  await assert.rejects(
    runIntegrityScan(
      [
        '--db-snapshot', snapPath,
        '--blob-mode', 'azure',
        '--blob-endpoint', 'http://127.0.0.1:1',
        '--blob-container', 'imodelhub',
        '--blob-key-env', 'INTEGRITY_TEST_MISSING_KEY',
      ],
      { spawnSync },
    ),
    (error) => error instanceof UsageError && /account key/i.test(error.message),
  );
});

test('Azure mode lists and hashes blobs using read-only GET requests only', async (t) => {
  const dir = tempDir(t);
  const snapPath = join(dir, 'snapshot.json');
  writeJsonFile(snapPath, {
    schemaVersion: 1,
    changesets: snapshot().changesets,
    baselines: snapshot().baselines,
    checkpoints: snapshot().checkpoints,
    namedVersions: [],
    imodels: snapshot().imodels,
  });

  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('read-only test server');
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/devstoreaccount1/imodelhub') {
      const blobXml = Object.entries(BLOB)
        .map(([key, name]) => `<Blob><Name>${name}</Name><Properties><Content-Length>${Buffer.byteLength(CONTENT[key])}</Content-Length></Properties></Blob>`)
        .join('');
      res.setHeader('content-type', 'application/xml');
      res.end(`<?xml version="1.0"?><EnumerationResults><Blobs>${blobXml}</Blobs><NextMarker></NextMarker></EnumerationResults>`);
      return;
    }
    const prefix = '/devstoreaccount1/imodelhub/';
    const name = decodeURIComponent(url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '');
    const key = Object.keys(BLOB).find((candidate) => BLOB[candidate] === name);
    if (!key) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.end(CONTENT[key]);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });

  const previousKey = process.env.INTEGRITY_TEST_AZURE_KEY;
  process.env.INTEGRITY_TEST_AZURE_KEY = Buffer.from('test-key').toString('base64');
  t.after(() => {
    if (previousKey === undefined) delete process.env.INTEGRITY_TEST_AZURE_KEY;
    else process.env.INTEGRITY_TEST_AZURE_KEY = previousKey;
  });

  const { port } = server.address();
  const result = await runIntegrityScan(
    [
      '--db-snapshot', snapPath,
      '--blob-mode', 'azure',
      '--blob-endpoint', `http://127.0.0.1:${port}/devstoreaccount1`,
      '--blob-container', 'imodelhub',
      '--blob-prefix', 'imodels/',
      '--blob-key-env', 'INTEGRITY_TEST_AZURE_KEY',
      '--blob-hash', 'referenced',
      '--orphan-prefix', 'imodels/',
    ],
    { spawnSync },
  );
  assert.equal(result.exitCode, EXIT_CODES.OK, JSON.stringify({ findings: result.report.findings, unverified: result.report.unverified }));
  assert.equal(result.report.summary.blobs, 4);
  assert.ok(requests.length >= 5);
  assert.ok(requests.every((request) => request.method === 'GET'));
  assert.ok(requests.every((request) => /^SharedKey devstoreaccount1:/.test(request.authorization)));
});

test('Postgres adapter issues only read-only SELECT queries and maps Hub rows', () => {
  const discovery = [
    ['public', 'changesets', 'id'],
    ['public', 'changesets', 'iModelId'],
    ['public', 'changesets', 'index'],
    ['public', 'changesets', 'parentId'],
    ['public', 'changesets', 'prevHash'],
    ['public', 'changesets', 'chainHash'],
    ['public', 'changesets', 'checksum'],
    ['public', 'changesets', 'fileSize'],
    ['public', 'changesets', 'filePath'],
    ['public', 'changesets', 'state'],
    ['public', 'changesets', 'deletedAt'],
    ['public', 'checkpoints', 'id'],
    ['public', 'checkpoints', 'iModelId'],
    ['public', 'checkpoints', 'changesetId'],
    ['public', 'checkpoints', 'changesetIndex'],
    ['public', 'checkpoints', 'state'],
    ['public', 'checkpoints', 'fileSize'],
    ['public', 'checkpoints', 'contentSha256'],
    ['public', 'checkpoints', 'dbName'],
    ['public', 'checkpoints', 'manifestPath'],
    ['public', 'checkpoints', 'deletedAt'],
    ['public', 'named_versions', 'id'],
    ['public', 'named_versions', 'name'],
    ['public', 'named_versions', 'iModelId'],
    ['public', 'named_versions', 'changesetId'],
    ['public', 'named_versions', 'changesetIndex'],
    ['public', 'named_versions', 'deletedAt'],
    ['public', 'imodels', 'id'],
    ['public', 'imodels', 'name'],
    ['public', 'imodels', 'state'],
    ['public', 'imodels', 'changesetCount'],
    ['public', 'imodels', 'baselineFileName'],
  ].map(([schema, table, column]) => `${schema}\t${table}\t${column}`).join('\n');

  const changesetRows = snapshot().changesets.map((row) => ({ ...row }));
  // The live SQL projection maps checkpoint content by dbName, not a synthetic blobPath.
  const checkpointRows = snapshot().checkpoints.map(({ blobPath: _blobPath, ...row }) => ({
    ...row,
    dbName: BLOB.checkpoint1,
  }));
  const imodelRows = [
    { id: IM, name: 'sample', state: 'initialized', changesetCount: 2, baselineFileName: 'baseline.bim' },
  ];

  const calls = [];
  const fakeSpawn = (command, args, opts) => {
    const sql = opts.input;
    calls.push({ command, args, sql });
    if (sql.includes('information_schema.columns')) {
      return { status: 0, stdout: `${discovery}\n`, stderr: '' };
    }
    if (sql.includes('"public"."changesets"')) {
      return { status: 0, stdout: JSON.stringify(changesetRows), stderr: '' };
    }
    if (sql.includes('"public"."checkpoints"')) {
      return { status: 0, stdout: JSON.stringify(checkpointRows), stderr: '' };
    }
    if (sql.includes('"public"."named_versions"')) {
      return { status: 0, stdout: '[]', stderr: '' };
    }
    if (sql.includes('"public"."imodels"')) {
      return { status: 0, stdout: JSON.stringify(imodelRows), stderr: '' };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };

  const config = {
    mode: 'docker',
    dockerContainer: 'tiangong-kaiwu-drill-postgres-1',
    psqlExe: 'psql',
    host: null,
    port: null,
    user: 'root',
    name: 'api',
    schema: 'public',
    statementTimeoutMs: 5000,
    iModelIds: [IM],
    baselinePathTemplate: 'imodels/{iModelId}/baseline/{baselineFileName}',
    timeoutMs: 30000,
  };
  const liveSnapshot = collectSnapshotFromPostgres(config, fakeSpawn);
  assert.equal(liveSnapshot.changesets.length, 2);
  assert.equal(liveSnapshot.checkpoints.length, 1);
  assert.equal(liveSnapshot.namedVersions.length, 0);
  assert.equal(liveSnapshot.imodels.length, 1);
  assert.equal(liveSnapshot.baselines.length, 1);
  assert.equal(liveSnapshot.baselines[0].blobPath, `imodels/${IM}/baseline/baseline.bim`);
  assert.equal(liveSnapshot.source.readOnlyTransaction, true);

  const dataCalls = calls.filter((call) => !call.sql.includes('information_schema.columns'));
  assert.ok(dataCalls.length >= 4);
  for (const call of dataCalls) {
    assert.match(call.sql, /^BEGIN TRANSACTION READ ONLY;/);
    assert.doesNotMatch(call.sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/);
    assert.match(call.sql, /SELECT/);
    assert.match(call.sql, /WHERE "(?:iModelId|id)"::text = ANY \(ARRAY\['11111111-1111-4111-8111-111111111111'\]::text\[\]\)/);
  }

  const liveInventory = normalizeInventory({
    blobs: [
      { name: `imodels/${IM}/baseline/baseline.bim`, size: Buffer.byteLength(CONTENT.baseline), sha256: sha256(CONTENT.baseline) },
      { name: BLOB.changeset1, size: Buffer.byteLength(CONTENT.changeset1), sha256: sha256(CONTENT.changeset1) },
      { name: BLOB.changeset2, size: Buffer.byteLength(CONTENT.changeset2), sha256: sha256(CONTENT.changeset2) },
      { name: BLOB.checkpoint1, size: Buffer.byteLength(CONTENT.checkpoint1), sha256: sha256(CONTENT.checkpoint1) },
    ],
  });
  const report = scanIntegrity(liveSnapshot, liveInventory, { orphanPrefixes: ['imodels/'] });
  assert.equal(report.result, 'CLEAN', JSON.stringify({ findings: report.findings, unverified: report.unverified }));
});
