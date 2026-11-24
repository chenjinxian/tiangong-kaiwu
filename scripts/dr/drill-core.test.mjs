/**
 * Unit tests for the isolated DR drill harness pure logic.
 *
 * Run: node --test scripts/dr/drill-core.test.mjs
 *
 * No Docker, PowerShell, network, or live stack is touched. All fixtures are
 * synthetic; the two JSON files under scripts/dr/fixtures are examples that
 * are also validated here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAIN_PROJECT_NAME,
  DRILL_PROJECT_PREFIX,
  DRILL_CHECK_NAMES,
  DrillRefusedError,
  DrillUsageError,
  assessEmptyTarget,
  buildDrillEnvValues,
  buildDrillReport,
  buildRoundtripReport,
  compareProjectSnapshots,
  computeDrillPorts,
  drillWorkspaceFor,
  findReservedPortConflicts,
  isDrillProjectName,
  isMainProjectName,
  isPathInside,
  parseDotEnv,
  parseDrillArgs,
  serializeDotEnv,
  signAzureRequest,
  validateBackupManifest,
  validateDrillReport,
  verifyIsolation,
} from './drill-core.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const VALID_MANIFEST = JSON.parse(
  readFileSync(join(FIXTURES, 'backup-manifest.example.json'), 'utf8'),
);
const VALID_REPORT = JSON.parse(
  readFileSync(join(FIXTURES, 'drill-report.example.json'), 'utf8'),
);

function validArgs(overrides = []) {
  return [
    'create',
    '--drill-id', 'drill-test-001',
    '--project', DRILL_PROJECT_PREFIX,
    '--port-offset', '0',
    ...overrides,
  ];
}

function validMeta(overrides = {}) {
  const workspace = join(REPO_ROOT, '.drill', 'drill-test-001');
  const ports = computeDrillPorts(0);
  const projectName = DRILL_PROJECT_PREFIX;
  return {
    schemaVersion: 1,
    drillId: 'drill-test-001',
    projectName,
    portOffset: 0,
    ports,
    workspace,
    composeFile: join(workspace, 'docker-compose.yml'),
    envFile: join(workspace, '.env'),
    volumes: [
      `${projectName}-pgdata`,
      `${projectName}-redis-data`,
      `${projectName}-azurite-data`,
    ],
    network: `${projectName}-net`,
    createdAtUtc: '2026-11-24T00:00:00.000Z',
    sourceCommit: 'a'.repeat(40),
    repoRoot: REPO_ROOT,
    ...overrides,
  };
}

function fixtureStats() {
  const dump = Buffer.from('synthetic-postgres-dump\n');
  const azurite = Buffer.from('synthetic-azurite-volume\n');
  return {
    'postgres.dump': {
      bytes: dump.length,
      sha256: createHash('sha256').update(dump).digest('hex'),
    },
    'azurite-data.tar.gz': {
      bytes: azurite.length,
      sha256: createHash('sha256').update(azurite).digest('hex'),
    },
  };
}

/* ---------------------------------------------------------------- */
/* Project and port isolation                                       */
/* ---------------------------------------------------------------- */

test('project names: main is never a drill, drill prefix is required', () => {
  assert.equal(isMainProjectName('tiangong-kaiwu'), true);
  assert.equal(isMainProjectName(' Tiangong-Kaiwu '), true);
  assert.equal(isDrillProjectName('tiangong-kaiwu-drill'), true);
  assert.equal(isDrillProjectName('tiangong-kaiwu-drill-restore'), true);
  assert.equal(isDrillProjectName('tiangong-kaiwu-drill-prod'), true);
  assert.equal(isDrillProjectName('tiangong-kaiwu'), false);
  assert.equal(isDrillProjectName('tiangong-kaiwu-dri'), false);
  assert.equal(isDrillProjectName('tiangong-kaiwu-drill-'), false);
  assert.equal(isDrillProjectName('tiangong-kaiwu-drill-UPPER'), false);
  assert.equal(isDrillProjectName('other-drill'), false);
});

test('drill ports are high, deterministic and disjoint from main stack', () => {
  const ports = computeDrillPorts(0);
  assert.deepEqual(ports, {
    hub: 15400, ms: 15401, wa: 15402,
    azuriteBlob: 20500, azuriteQueue: 20501, azuriteTable: 20502,
  });
  assert.deepEqual(findReservedPortConflicts(ports), []);
  const offset = computeDrillPorts(3);
  assert.equal(offset.hub, 15700);
  assert.equal(offset.azuriteBlob, 20800);
  assert.deepEqual(findReservedPortConflicts(offset), []);
  assert.throws(() => computeDrillPorts(10), DrillUsageError);
  assert.throws(() => computeDrillPorts(-1), DrillUsageError);
  assert.throws(() => computeDrillPorts(1.5), DrillUsageError);
});

test('reserved-port detector catches main-stack collisions', () => {
  const conflicts = findReservedPortConflicts({ hub: 5400, safe: 15400 });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].name, 'hub');
  assert.equal(conflicts[0].reason, 'reserved-main-port');
});

test('workspace path must stay under .drill', () => {
  assert.equal(drillWorkspaceFor(REPO_ROOT, 'drill-test-001'),
    join(REPO_ROOT, '.drill', 'drill-test-001'));
  assert.throws(() => drillWorkspaceFor(REPO_ROOT, '../escape'), DrillUsageError);
  assert.throws(() => drillWorkspaceFor(REPO_ROOT, 'UPPER'), DrillUsageError);
  assert.equal(isPathInside(join(REPO_ROOT, '.drill', 'x'), join(REPO_ROOT, '.drill')), true);
  assert.equal(isPathInside(REPO_ROOT, join(REPO_ROOT, '.drill')), false);
});

/* ---------------------------------------------------------------- */
/* CLI parsing and refusal gates                                    */
/* ---------------------------------------------------------------- */

test('parse: help and valid create', () => {
  assert.equal(parseDrillArgs([], { repoRoot: REPO_ROOT }).command, 'help');
  assert.equal(parseDrillArgs(['--help'], { repoRoot: REPO_ROOT }).command, 'help');
  const parsed = parseDrillArgs(validArgs(), { repoRoot: REPO_ROOT });
  assert.equal(parsed.command, 'create');
  assert.equal(parsed.options.project, DRILL_PROJECT_PREFIX);
  assert.equal(parsed.options.portOffset, 0);
  assert.equal(parsed.options.drillId, 'drill-test-001');
  assert.equal(parsed.options.workspace, join(REPO_ROOT, '.drill', 'drill-test-001'));
  assert.deepEqual(parsed.options.ports, computeDrillPorts(0));
});

test('parse: unknown command/option and missing values are usage errors', () => {
  assert.throws(() => parseDrillArgs(['nope'], { repoRoot: REPO_ROOT }), DrillUsageError);
  assert.throws(() => parseDrillArgs(['create', '--nope'], { repoRoot: REPO_ROOT }), DrillUsageError);
  assert.throws(() => parseDrillArgs(['create', '--drill-id'], { repoRoot: REPO_ROOT }), DrillUsageError);
  assert.throws(() => parseDrillArgs(['create', '--drill-id', 'drill-x', '--format', 'yaml'],
    { repoRoot: REPO_ROOT }), DrillUsageError);
  assert.throws(() => parseDrillArgs(['create', '--drill-id', 'drill-x', '--port-offset', 'x'],
    { repoRoot: REPO_ROOT }), DrillUsageError);
});

test('parse: refuses the main project and any non-drill project', () => {
  for (const project of [MAIN_PROJECT_NAME, 'luban', 'tiangong-kaiwu-drill-PROD']) {
    assert.throws(
      () => parseDrillArgs(['create', '--drill-id', 'drill-test-001', '--project', project],
        { repoRoot: REPO_ROOT }),
      DrillRefusedError,
      `project ${project} must be refused`,
    );
  }
});

test('parse: refuses workspace outside <repo>/.drill', () => {
  assert.throws(
    () => parseDrillArgs(['preflight', '--workspace', REPO_ROOT], { repoRoot: REPO_ROOT }),
    DrillRefusedError,
  );
  assert.throws(
    () => parseDrillArgs(['preflight', '--workspace', join(REPO_ROOT, '..', 'outside')],
      { repoRoot: REPO_ROOT }),
    DrillRefusedError,
  );
});

test('parse: backup dir must stay under .drill unless explicitly allowed', () => {
  assert.throws(
    () => parseDrillArgs(
      ['verify-backup', '--drill-id', 'drill-test-001', '--backup-dir', 'D:\\stack-backups\\x'],
      { repoRoot: REPO_ROOT },
    ),
    DrillRefusedError,
  );
  const parsed = parseDrillArgs(
    ['verify-backup', '--drill-id', 'drill-test-001', '--backup-dir', 'D:\\stack-backups\\x',
      '--allow-external-backup'],
    { repoRoot: REPO_ROOT },
  );
  assert.equal(parsed.options.allowExternalBackup, true);
});

test('parse: restore/teardown require matching --confirm-project', () => {
  const restore = ['restore', '--drill-id', 'drill-test-001', '--backup-dir', 'backups/x'];
  assert.throws(() => parseDrillArgs(restore, { repoRoot: REPO_ROOT }), DrillRefusedError);
  assert.throws(
    () => parseDrillArgs([...restore, '--confirm-project', MAIN_PROJECT_NAME],
      { repoRoot: REPO_ROOT }),
    DrillRefusedError,
  );
  const parsed = parseDrillArgs([...restore, '--confirm-project', DRILL_PROJECT_PREFIX],
    { repoRoot: REPO_ROOT });
  assert.equal(parsed.command, 'restore');

  const teardown = ['teardown', '--drill-id', 'drill-test-001'];
  assert.throws(() => parseDrillArgs(teardown, { repoRoot: REPO_ROOT }), DrillRefusedError);
  assert.equal(
    parseDrillArgs([...teardown, '--confirm-project', DRILL_PROJECT_PREFIX],
      { repoRoot: REPO_ROOT }).command,
    'teardown',
  );
});

test('parse: roundtrip requires matching --confirm-project (HITL)', () => {
  const base = ['roundtrip', '--drill-id', 'drill-test-001'];
  assert.throws(() => parseDrillArgs(base, { repoRoot: REPO_ROOT }), DrillRefusedError);
  assert.equal(
    parseDrillArgs([...base, '--confirm-project', DRILL_PROJECT_PREFIX],
      { repoRoot: REPO_ROOT }).command,
    'roundtrip',
  );
});

test('parse: reset-target needs both allow flag and confirmation', () => {
  const base = ['reset-target', '--drill-id', 'drill-test-001'];
  assert.throws(() => parseDrillArgs(base, { repoRoot: REPO_ROOT }), DrillRefusedError);
  assert.throws(
    () => parseDrillArgs([...base, '--allow-drill-reset'], { repoRoot: REPO_ROOT }),
    DrillRefusedError,
  );
  const parsed = parseDrillArgs(
    [...base, '--allow-drill-reset', '--confirm-project', DRILL_PROJECT_PREFIX],
    { repoRoot: REPO_ROOT },
  );
  assert.equal(parsed.command, 'reset-target');
});

test('parse: fault-inject is opt-in, confirmed, acked and drill-only', () => {
  const base = [
    'fault-inject', '--drill-id', 'drill-test-001',
    '--scenario', 'delete-sentinel-blob',
  ];
  assert.throws(() => parseDrillArgs(base, { repoRoot: REPO_ROOT }), DrillRefusedError);
  assert.throws(
    () => parseDrillArgs([...base, '--allow-destructive'], { repoRoot: REPO_ROOT }),
    DrillRefusedError,
  );
  assert.throws(
    () => parseDrillArgs(
      [...base, '--allow-destructive', '--confirm-project', DRILL_PROJECT_PREFIX],
      { repoRoot: REPO_ROOT, env: {} },
    ),
    DrillRefusedError,
  );
  const parsed = parseDrillArgs(
    [...base, '--allow-destructive', '--confirm-project', DRILL_PROJECT_PREFIX],
    { repoRoot: REPO_ROOT, env: { DR_DRILL_DESTRUCTIVE_ACK: '1' } },
  );
  assert.equal(parsed.command, 'fault-inject');
  assert.equal(parsed.options.scenario, 'delete-sentinel-blob');
});

test('parse: strict-integrity and report-roundtrip options', () => {
  const strict = parseDrillArgs(
    ['verify', '--drill-id', 'drill-test-001', '--strict-integrity'],
    { repoRoot: REPO_ROOT },
  );
  assert.equal(strict.options.strictIntegrity, true);
  assert.throws(
    () => parseDrillArgs(
      ['report-roundtrip', '--drill-id', 'drill-test-001'],
      { repoRoot: REPO_ROOT },
    ),
    DrillUsageError,
  );
  const roundtrip = parseDrillArgs(
    ['report-roundtrip', '--drill-id', 'drill-test-001',
      '--source-workspace', '.drill/drill-test-000'],
    { repoRoot: REPO_ROOT },
  );
  assert.equal(roundtrip.command, 'report-roundtrip');
  assert.equal(roundtrip.options.sourceWorkspace, join(REPO_ROOT, '.drill', 'drill-test-000'));
});

test('parse: fault-inject rejects unknown scenarios even with gates', () => {
  assert.throws(
    () => parseDrillArgs(
      ['fault-inject', '--drill-id', 'drill-test-001', '--scenario', 'drop-main-db',
        '--allow-destructive', '--confirm-project', DRILL_PROJECT_PREFIX],
      { repoRoot: REPO_ROOT, env: { DR_DRILL_DESTRUCTIVE_ACK: '1' } },
    ),
    DrillUsageError,
  );
});

/* ---------------------------------------------------------------- */
/* Isolation verification                                           */
/* ---------------------------------------------------------------- */

test('isolation: valid drill workspace metadata passes all checks', () => {
  const result = verifyIsolation(validMeta(), { repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(result.checks.map((c) => c.name), [...DRILL_CHECK_NAMES]);
  assert.ok(result.checks.every((c) => c.ok));
});

test('isolation: drillId must match the workspace directory name', () => {
  const result = verifyIsolation(validMeta({ drillId: 'drill-other-999' }), { repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith('drill-id')));
});

test('isolation: main project is rejected', () => {
  const result = verifyIsolation(validMeta({ projectName: MAIN_PROJECT_NAME }), { repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith('project-name')));
});

test('isolation: root compose/env are rejected even if paths look absolute', () => {
  const meta = validMeta({
    composeFile: join(REPO_ROOT, 'docker-compose.yml'),
    envFile: join(REPO_ROOT, '.env'),
  });
  const result = verifyIsolation(meta, { repoRoot: REPO_ROOT });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith('compose-file')));
  assert.ok(result.errors.some((error) => error.startsWith('env-file')));
  assert.ok(result.errors.some((error) => error.startsWith('not-main-compose')));
  assert.ok(result.errors.some((error) => error.startsWith('not-main-env')));
});

test('isolation: volumes, network and ports must match the drill project plan', () => {
  const badVolumes = verifyIsolation(validMeta({
    volumes: ['tiangong-kaiwu_pgdata', 'tiangong-kaiwu_redis-data', 'tiangong-kaiwu_azurite-data'],
  }), { repoRoot: REPO_ROOT });
  assert.equal(badVolumes.ok, false);
  assert.ok(badVolumes.errors.some((error) => error.startsWith('volumes')));

  const badNetwork = verifyIsolation(validMeta({ network: 'tiangong-kaiwu_stack' }),
    { repoRoot: REPO_ROOT });
  assert.equal(badNetwork.ok, false);

  const badPorts = verifyIsolation(validMeta({ ports: { hub: 5400 } }), { repoRoot: REPO_ROOT });
  assert.equal(badPorts.ok, false);
  assert.ok(badPorts.errors.some((error) => error.startsWith('ports')));
});

/* ---------------------------------------------------------------- */
/* Backup manifest verification                                     */
/* ---------------------------------------------------------------- */

test('manifest: valid fixture with matching artifact stats passes', () => {
  const result = validateBackupManifest(VALID_MANIFEST, { artifactStats: fixtureStats() });
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.artifacts.length, 2);
  assert.ok(result.artifacts.every((artifact) => artifact.verified));
});

test('manifest: missing sidecar hash, wrong kind, missing artifact and unsafe path fail', () => {
  const wrongKind = validateBackupManifest({ ...VALID_MANIFEST, kind: 'something-else' });
  assert.equal(wrongKind.ok, false);

  const missingArtifact = validateBackupManifest({
    ...VALID_MANIFEST,
    artifacts: VALID_MANIFEST.artifacts.filter((artifact) => artifact.path !== 'postgres.dump'),
  });
  assert.equal(missingArtifact.ok, false);
  assert.ok(missingArtifact.errors.some((error) => error.includes('postgres.dump')));

  const unsafe = validateBackupManifest({
    ...VALID_MANIFEST,
    artifacts: [
      { path: '../escape', bytes: 1, sha256: 'a'.repeat(64) },
      ...VALID_MANIFEST.artifacts,
    ],
  });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.errors.some((error) => error.includes('unsafe')));

  const sidecar = validateBackupManifest(VALID_MANIFEST, {
    actualManifestSha256: 'a'.repeat(64),
    expectedManifestSha256: 'b'.repeat(64),
  });
  assert.equal(sidecar.ok, false);
  assert.ok(sidecar.errors.some((error) => error.includes('sidecar')));
});

test('manifest: tampered bytes or hashes are detected', () => {
  const stats = fixtureStats();
  stats['postgres.dump'] = { ...stats['postgres.dump'], sha256: 'c'.repeat(64) };
  const result = validateBackupManifest(VALID_MANIFEST, { artifactStats: stats });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('postgres.dump') && error.includes('SHA-256')));
});

test('manifest: missing artifact file or sidecar fails closed', () => {
  const stats = fixtureStats();
  delete stats['azurite-data.tar.gz'];
  const missingFile = validateBackupManifest(VALID_MANIFEST, { artifactStats: stats });
  assert.equal(missingFile.ok, false);
  assert.ok(missingFile.errors.some((error) => error.includes('azurite-data.tar.gz') && error.includes('missing')));

  const missingSidecar = validateBackupManifest(VALID_MANIFEST, {
    artifactStats: fixtureStats(), requireSidecar: true,
  });
  assert.equal(missingSidecar.ok, false);
  assert.ok(missingSidecar.errors.some((error) => error.includes('sidecar')));
});

/* ---------------------------------------------------------------- */
/* Empty target and main-project snapshots                          */
/* ---------------------------------------------------------------- */

test('empty-target assessment refuses non-empty or unreadable targets', () => {
  assert.deepEqual(assessEmptyTarget({
    userTableCount: 0, azuriteVolumeEntries: 0, runningWriters: [],
  }), { empty: true, reasons: [] });

  const dirty = assessEmptyTarget({
    userTableCount: 4, azuriteVolumeEntries: 2, runningWriters: ['imodelhub'],
  });
  assert.equal(dirty.empty, false);
  assert.equal(dirty.reasons.length, 3);

  const unreadable = assessEmptyTarget({
    userTableCount: null, azuriteVolumeEntries: Number.NaN, runningWriters: null,
  });
  assert.equal(unreadable.empty, false);
});

test('main-project snapshot comparison detects added/removed containers', () => {
  const before = ['id1|tiangong-kaiwu-postgres-1|running', 'id2|tiangong-kaiwu-azurite-1|running'];
  assert.deepEqual(compareProjectSnapshots(before, [...before]), {
    unchanged: true, added: [], removed: [], beforeCount: 2, afterCount: 2,
  });
  const removed = compareProjectSnapshots(before, [before[0]]);
  assert.equal(removed.unchanged, false);
  assert.equal(removed.removed.length, 1);
  assert.equal(removed.removed[0], before[1]);
  const added = compareProjectSnapshots(before, [...before, 'id3|new|running']);
  assert.equal(added.unchanged, false);
  assert.equal(added.added.length, 1);
});

/* ---------------------------------------------------------------- */
/* Drill env and Azure signing                                      */
/* ---------------------------------------------------------------- */

function secrets() {
  return {
    adminEmail: 'admin@example.com',
    adminPassword: 'p'.repeat(20),
    imodelhubApiKey: 'a'.repeat(32),
    backendApiKey: 'b'.repeat(32),
    csrfSecret: 'c'.repeat(32),
    webhookSecret: 'd'.repeat(32),
    authJwtSecret: 'e'.repeat(32),
    authRefreshSecret: 'f'.repeat(32),
    authForgotSecret: 'g'.repeat(32),
    authConfirmEmailSecret: 'h'.repeat(32),
    dbPassword: 'i'.repeat(20),
  };
}

test('drill env uses drill project, high ports and independent secrets', () => {
  const values = buildDrillEnvValues({
    projectName: DRILL_PROJECT_PREFIX,
    drillId: 'drill-test-001',
    ports: computeDrillPorts(0),
    secrets: secrets(),
  });
  assert.equal(values.COMPOSE_PROJECT_NAME, DRILL_PROJECT_PREFIX);
  assert.equal(values.PORT, '15401');
  assert.equal(values.IMODELHUB_URL, 'http://127.0.0.1:15400');
  assert.equal(values.HUB_DATABASE_USERNAME, 'drill');
  assert.equal(values.IMODELHUB_ADMIN_PASSWORD, secrets().adminPassword);
  assert.throws(
    () => buildDrillEnvValues({
      projectName: MAIN_PROJECT_NAME,
      drillId: 'drill-test-001',
      ports: computeDrillPorts(0),
      secrets: secrets(),
    }),
    DrillRefusedError,
  );
});

test('dotenv parser/serializer round-trips quoted and comment values', () => {
  const parsed = parseDotEnv([
    '# comment',
    'A=plain',
    'B="quoted value"',
    "C='single quoted'",
    'D=value # trailing comment',
    'EMPTY=',
  ].join('\n'));
  assert.deepEqual(parsed, {
    A: 'plain', B: 'quoted value', C: 'single quoted', D: 'value', EMPTY: '',
  });
  const text = serializeDotEnv({ B: 'two words', A: 'one' });
  assert.match(text, /A=one/);
  assert.match(text, /B=two words/);
  assert.throws(() => serializeDotEnv({ A: 'line1\nline2' }), DrillUsageError);
});

test('Azure SharedKey signing is deterministic and body-sensitive', () => {
  const url = new URL('http://127.0.0.1:20500/devstoreaccount1/imodelhub/drill-seed/x.txt');
  const fixed = { 'x-ms-date': 'Mon, 24 Nov 2026 12:00:00 GMT' };
  const key = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
  const put = signAzureRequest({
    method: 'PUT', url, account: 'devstoreaccount1', keyBase64: key,
    headers: { ...fixed, 'x-ms-blob-type': 'BlockBlob' },
    contentLength: 5, contentType: 'text/plain',
  });
  assert.match(put.Authorization, /^SharedKey devstoreaccount1:[A-Za-z0-9+/=]+$/);
  assert.equal(put['x-ms-date'], fixed['x-ms-date']);

  const same = signAzureRequest({
    method: 'PUT', url, account: 'devstoreaccount1', keyBase64: key,
    headers: { ...fixed, 'x-ms-blob-type': 'BlockBlob' },
    contentLength: 5, contentType: 'text/plain',
  });
  assert.equal(put.Authorization, same.Authorization);

  const differentLength = signAzureRequest({
    method: 'PUT', url, account: 'devstoreaccount1', keyBase64: key,
    headers: { ...fixed, 'x-ms-blob-type': 'BlockBlob' },
    contentLength: 6, contentType: 'text/plain',
  });
  assert.notEqual(put.Authorization, differentLength.Authorization);

  // Independent canonicalization check for the exact string-to-sign.
  const expectedString =
    ['PUT', '', '', '5', '', 'text/plain', '', '', '', '', '', ''].join('\n') +
    '\n' +
    `x-ms-blob-type:BlockBlob\nx-ms-date:${fixed['x-ms-date']}\nx-ms-version:2021-12-02\n` +
    // Azure SDK/Azurite path-style canonicalization doubles the account segment.
    '/devstoreaccount1/devstoreaccount1/imodelhub/drill-seed/x.txt';
  const expectedSignature = createHmac('sha256', Buffer.from(key, 'base64'))
    .update(expectedString, 'utf8').digest('base64');
  assert.equal(put.Authorization, `SharedKey devstoreaccount1:${expectedSignature}`);

  const get = signAzureRequest({
    method: 'GET', url, account: 'devstoreaccount1', keyBase64: key,
    headers: fixed,
  });
  assert.notEqual(get.Authorization, put.Authorization);
});

/* ---------------------------------------------------------------- */
/* Report schema and measurement honesty                            */
/* ---------------------------------------------------------------- */

function stateWithRestore() {
  const meta = validMeta();
  return {
    meta,
    state: {
      phases: [
        { name: 'backup', status: 'passed', startedAtUtc: '2026-11-24T12:00:00.000Z',
          finishedAtUtc: '2026-11-24T12:01:00.000Z', durationMs: 60000 },
        { name: 'restore', status: 'passed', startedAtUtc: '2026-11-24T12:10:00.000Z',
          finishedAtUtc: '2026-11-24T12:12:00.000Z', durationMs: 120000 },
        { name: 'verify', status: 'passed', startedAtUtc: '2026-11-24T12:12:00.000Z',
          finishedAtUtc: '2026-11-24T12:13:00.000Z', durationMs: 60000 },
      ],
      backup: {
        backupId: 'backup-20261124-120000',
        createdAtUtc: '2026-11-24T12:00:30.000Z',
        manifestVerified: true,
        consistencyMode: 'quiesced',
        artifacts: [],
      },
      restore: {
        status: 'passed',
        targetWasEmpty: true,
        startedAtUtc: '2026-11-24T12:10:00.000Z',
        finishedAtUtc: '2026-11-24T12:12:00.000Z',
        durationMs: 120000,
      },
      verification: {
        status: 'passed',
        startedAtUtc: '2026-11-24T12:12:00.000Z',
        finishedAtUtc: '2026-11-24T12:13:00.000Z',
        stack: { passed: true },
        blob: { verified: true },
        integrity: { exitCode: 0, result: 'CLEAN' },
        checks: [],
      },
      mainProjectUntouched: true,
    },
  };
}

test('report: measured RPO/RTO are populated, but targets are never claimed', () => {
  const { meta, state } = stateWithRestore();
  const report = buildDrillReport({
    meta, state, generatedAtUtc: '2026-11-24T12:14:00.000Z',
  });
  const validation = validateDrillReport(report);
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.equal(report.rpo.measuredSeconds, 570); // 12:00:30 -> 12:10:00
  assert.equal(report.rto.measuredSeconds, 180); // 12:10:00 -> 12:13:00
  assert.equal(report.rpo.targetAchievedClaim, false);
  assert.equal(report.rto.targetAchievedClaim, false);
  assert.equal(report.claims.rpoTargetAchieved, false);
  assert.equal(report.claims.rtoTargetAchieved, false);
  assert.equal(report.claims.restoreIntoEmptyDrillCompleted, true);
  assert.equal(report.claims.postRestoreHubApiVerified, true);
  assert.equal(report.claims.postRestoreBlobSentinelVerified, true);
  assert.equal(report.claims.integrityScanClean, true);
  assert.equal(report.isolation.projectName, DRILL_PROJECT_PREFIX);
  assert.equal(report.isolation.verified, true);
});

test('report: partial integrity still measures RTO at DB/blob verification', () => {
  const { meta, state } = stateWithRestore();
  state.verification = {
    ...state.verification,
    status: 'partial',
    stackVerifiedAtUtc: '2026-11-24T12:12:40.000Z',
    finishedAtUtc: '2026-11-24T12:13:20.000Z',
    integrity: { exitCode: 1, result: 'FINDINGS' },
  };
  const report = buildDrillReport({ meta, state });
  assert.equal(report.rto.measuredSeconds, 160); // 12:10:00 -> 12:12:40
  assert.equal(report.claims.restoreIntoEmptyDrillCompleted, true);
  assert.equal(report.claims.postRestoreHubApiVerified, true);
  assert.equal(report.claims.integrityScanClean, false);
  assert.equal(report.claims.rtoTargetAchieved, false);
  assert.equal(report.rto.targetAchievedClaim, false);
});

test('report: no restore/verification evidence means null timings, not fake values', () => {
  const meta = validMeta();
  const report = buildDrillReport({ meta, state: { phases: [] } });
  assert.equal(report.rpo.measuredSeconds, null);
  assert.equal(report.rto.measuredSeconds, null);
  assert.equal(report.claims.restoreIntoEmptyDrillCompleted, false);
  assert.equal(report.claims.backupManifestVerified, false);
});

test('report: schema rejects target-achieved claims and main-project targets', () => {
  const { meta, state } = stateWithRestore();
  const report = buildDrillReport({ meta, state });
  const inflated = structuredClone(report);
  inflated.claims.rpoTargetAchieved = true;
  assert.equal(validateDrillReport(inflated).ok, false);

  const main = structuredClone(report);
  main.isolation.projectName = MAIN_PROJECT_NAME;
  assert.equal(validateDrillReport(main).ok, false);
});

test('report: static example fixture validates', () => {
  const validation = validateDrillReport(VALID_REPORT);
  assert.equal(validation.ok, true, validation.errors.join('; '));
});

test('roundtrip report aggregates source/target without upgrading claims', () => {
  const { meta, state } = stateWithRestore();
  const source = buildDrillReport({ meta, state });
  const target = buildDrillReport({ meta, state });
  const roundtrip = buildRoundtripReport({ source, target });
  assert.equal(roundtrip.claims.backupVerified, true);
  assert.equal(roundtrip.claims.emptyTargetRestoreCompleted, true);
  assert.equal(roundtrip.claims.rpoTargetAchieved, false);
  assert.equal(roundtrip.claims.rtoTargetAchieved, false);
  assert.equal(roundtrip.claims.productionDisasterRecoveryProven, false);
  assert.equal(roundtrip.validationErrors, undefined);
});
