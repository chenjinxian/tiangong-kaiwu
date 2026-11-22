/**
 * Tests for scripts/release-manifest.mjs (G1 J3.1/J3.2).
 *
 * Dependency-free: run with `node --test scripts/release-manifest.test.mjs`.
 * All CLI checks spawn the real script. verify-runtime tests use 127.0.0.1
 * loopback HTTP servers only; no external network, docker, or gh calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
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
const SCRIPT = join(REPO_ROOT, 'scripts', 'release-manifest.mjs');
const EXAMPLE = join(REPO_ROOT, 'scripts', 'fixtures', 'release-manifest.example.json');

const SIXTY_FOUR_F = 'f'.repeat(64);

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function readExample() {
  return JSON.parse(readFileSync(EXAMPLE, 'utf8'));
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-manifest-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeJson(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

test('checked-in example verifies, including expected commit and contract', () => {
  const example = readExample();

  const plain = run(['verify', '--file', EXAMPLE]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /release manifest OK: backend-20261122/);
  assert.match(plain.stdout, /4 image\(s\)/);

  const withExpectations = run([
    'verify',
    '--file',
    EXAMPLE,
    '--expected-source-commit',
    example.sourceCommit,
    '--expected-contract-version',
    example.contractVersion,
  ]);
  assert.equal(withExpectations.status, 0, withExpectations.stderr);
});

test('build from JSON input is deterministic, normalizes digests, and round-trips', (t) => {
  const dir = tempDir(t);
  const input = readExample();
  delete input.schemaVersion; // build defaults schemaVersion to 1
  input.images = [...input.images].reverse();
  input.images[0].digest = SIXTY_FOUR_F; // bare 64-hex must become sha256:<hex>
  const inputPath = writeJson(dir, 'input.json', input);

  const first = run(['build', '--input', inputPath]);
  const second = run(['build', '--input', inputPath]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout, 'build output must be deterministic');

  const built = JSON.parse(first.stdout);
  assert.equal(built.schemaVersion, 1);
  assert.equal(built.builtAt, input.builtAt);
  assert.equal(built.sourceCommit, input.sourceCommit.toLowerCase());
  assert.equal(
    built.images.find((image) => image.name === 'ghcr.io/chenjinxian/luban-webhook-agent-public')
      .digest,
    `sha256:${SIXTY_FOUR_F}`,
  );

  const names = built.images.map((image) => image.name);
  assert.deepEqual(names, [...names].sort(), 'images must be sorted by name');

  const manifestPath = writeJson(dir, 'built.json', built);
  const verify = run([
    'verify',
    '--file',
    manifestPath,
    '--expected-source-commit',
    built.sourceCommit,
    '--expected-contract-version',
    built.contractVersion,
  ]);
  assert.equal(verify.status, 0, verify.stderr);
});

test('build from CLI flags produces a verifiable manifest', (t) => {
  const dir = tempDir(t);
  const outPath = join(dir, 'flags.json');

  const build = run([
    'build',
    '--tag',
    'backend-20261122',
    '--source-commit',
    'b92a2d8fa4cf4ba5e3a01415edd956ff3622adb8',
    '--built-at',
    '2026-11-22T00:00:00.000Z',
    '--contract-version',
    '1.85.0',
    '--image',
    'ghcr.io/chenjinxian/luban-web-public=1111111111111111111111111111111111111111111111111111111111111111',
    '--image',
    'ghcr.io/chenjinxian/luban-bff-public=sha256:2222222222222222222222222222222222222222222222222222222222222222',
    '--sbom-digest',
    SIXTY_FOUR_F,
    '--native-provenance',
    'native-provenance.json',
    '--native-provenance-sha256',
    SIXTY_FOUR_F,
    '--out',
    outPath,
  ]);
  assert.equal(build.status, 0, build.stderr);
  assert.match(build.stdout, /release manifest written/);

  const manifest = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.deepEqual(
    manifest.images.map((image) => image.name),
    [
      'ghcr.io/chenjinxian/luban-bff-public',
      'ghcr.io/chenjinxian/luban-web-public',
    ],
  );
  assert.equal(manifest.images[0].digest, `sha256:${'2'.repeat(64)}`);
  assert.equal(manifest.images[1].digest, `sha256:${'1'.repeat(64)}`);
  assert.equal(manifest.nativeProvenance.sha256, `sha256:${SIXTY_FOUR_F}`);
  assert.equal(manifest.sbomDigest, `sha256:${SIXTY_FOUR_F}`);

  const verify = run(['verify', '--file', outPath]);
  assert.equal(verify.status, 0, verify.stderr);
});

test('missing required fields fail with non-zero exit', (t) => {
  const dir = tempDir(t);

  const missingTag = readExample();
  delete missingTag.tag;
  const missingTagPath = writeJson(dir, 'missing-tag.json', missingTag);
  const build = run(['build', '--input', missingTagPath]);
  assert.equal(build.status, 1);
  assert.match(build.stderr, /tag: required/);

  const missingContract = readExample();
  delete missingContract.contractVersion;
  const missingContractPath = writeJson(dir, 'missing-contract.json', missingContract);
  const verify = run(['verify', '--file', missingContractPath]);
  assert.equal(verify.status, 1);
  assert.match(verify.stderr, /contractVersion: required/);
});

test('bad digests are rejected', (t) => {
  const dir = tempDir(t);
  const manifest = readExample();
  manifest.images[0].digest = 'sha256:not-a-digest';
  manifest.sbomDigest = '0123456789abcdef'; // too short
  const manifestPath = writeJson(dir, 'bad-digest.json', manifest);

  const result = run(['verify', '--file', manifestPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /images\[0\]\.digest: must be/);
  assert.match(result.stderr, /sbomDigest: must be/);
});

test('"latest" is rejected for the release tag and image references', (t) => {
  const dir = tempDir(t);

  const latestTag = readExample();
  latestTag.tag = 'Latest';
  const latestTagPath = writeJson(dir, 'latest-tag.json', latestTag);
  const tagResult = run(['verify', '--file', latestTagPath]);
  assert.equal(tagResult.status, 1);
  assert.match(tagResult.stderr, /tag: "latest" is not allowed/);

  const latestImage = readExample();
  latestImage.images[0].name = 'ghcr.io/chenjinxian/imodelhub-public:latest';
  const latestImagePath = writeJson(dir, 'latest-image.json', latestImage);
  const imageResult = run(['verify', '--file', latestImagePath]);
  assert.equal(imageResult.status, 1);
  assert.match(imageResult.stderr, /images\[0\]\.name: ":latest" is not allowed/);
});

test('expected source commit and contract version mismatches fail', (t) => {
  const dir = tempDir(t);
  const manifest = readExample();
  const manifestPath = writeJson(dir, 'manifest.json', manifest);

  const sourceResult = run([
    'verify',
    '--file',
    manifestPath,
    '--expected-source-commit',
    '0'.repeat(40),
  ]);
  assert.equal(sourceResult.status, 1);
  assert.match(sourceResult.stderr, /sourceCommit mismatch/);

  const contractResult = run([
    'verify',
    '--file',
    manifestPath,
    '--expected-contract-version',
    '9.9.9',
  ]);
  assert.equal(contractResult.status, 1);
  assert.match(contractResult.stderr, /contractVersion mismatch/);
});

// ---------------------------------------------------------------------------
// verify-runtime (G1 J3.2): loopback-only; all servers are 127.0.0.1.
// ---------------------------------------------------------------------------

function runAsync(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      cwd: REPO_ROOT,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ status: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function startLoopbackServer(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function closedLoopbackBaseUrl() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

function respondJson(body, status = 200) {
  return (_req, res) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(text);
  };
}

// Mirrors the operation path shape produced by the RPC protocol's OpenAPI
// description: the last segment is "<interfaceName>-<version>-<operation>".
const RPC_PATH_PREFIX =
  '/LubanCAD/v1.0/mode/{modeId}/context/{iTwinId}/imodel/{iModelId}/changeset/{changeSetId}';

function runtimeMetadata(version, extra = {}) {
  return {
    openapi: '3.0.0',
    info: { title: 'LubanCAD', version: 'v1.0' },
    paths: {
      [`${RPC_PATH_PREFIX}/LubanFeatureRpcInterface-${version}-startFeatureOp`]: {
        head: { responses: { 200: { description: 'Success' } } },
      },
      [`${RPC_PATH_PREFIX}/LubanRpcInterface-1.1.0-getConfiguration`]: {
        head: { responses: { 200: { description: 'Success' } } },
      },
    },
    ...extra,
  };
}

test('verify-runtime matches the manifest against loopback metadata', { timeout: 30000 }, async (t) => {
  const example = readExample();
  const seen = [];
  const baseUrl = await startLoopbackServer(t, (req, res) => {
    seen.push(req.url);
    respondJson(runtimeMetadata(example.contractVersion))(req, res);
  });

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release manifest runtime OK/);
  assert.ok(result.stdout.includes(`LubanFeatureRpcInterface ${example.contractVersion}`));
  assert.deepEqual(seen, ['/rpc/metadata']);

  // A full /rpc/metadata URL is accepted as-is.
  const fullUrl = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    `${baseUrl}/rpc/metadata`,
  ]);
  assert.equal(fullUrl.status, 0, fullUrl.stderr);
  assert.deepEqual(seen, ['/rpc/metadata', '/rpc/metadata']);
});

test('verify-runtime compares the selected interface', { timeout: 30000 }, async (t) => {
  const baseUrl = await startLoopbackServer(
    t,
    respondJson(runtimeMetadata(readExample().contractVersion)),
  );
  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
    '--interface',
    'LubanRpcInterface',
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contractVersion mismatch/);
  assert.match(result.stderr, /runtime LubanRpcInterface has 1\.1\.0/);
});

test('verify-runtime rejects a contract version mismatch without echoing the body', { timeout: 30000 }, async (t) => {
  const example = readExample();
  const canary = 'CANARY-do-not-print-8f3a';
  const baseUrl = await startLoopbackServer(
    t,
    respondJson(runtimeMetadata('9.9.9', { canary })),
  );

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contractVersion mismatch/);
  assert.match(result.stderr, new RegExp(`manifest has ${example.contractVersion.replace(/\./g, '\\.')}`));
  assert.match(result.stderr, /runtime LubanFeatureRpcInterface has 9\.9\.9/);

  const combined = `${result.stdout}${result.stderr}`;
  assert.ok(!combined.includes(canary), 'response body must not be echoed');
  assert.ok(!combined.includes('"openapi"'), 'response body must not be echoed');
});

test('verify-runtime treats metadata without the interface as a mismatch', { timeout: 30000 }, async (t) => {
  const baseUrl = await startLoopbackServer(
    t,
    respondJson({
      openapi: '3.0.0',
      info: { title: 'LubanCAD', version: 'v1.0' },
      paths: {
        [`${RPC_PATH_PREFIX}/LubanRpcInterface-1.1.0-getConfiguration`]: {},
      },
    }),
  );

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not expose LubanFeatureRpcInterface/);
});

test('verify-runtime rejects conflicting versions for one interface', { timeout: 30000 }, async (t) => {
  const metadata = runtimeMetadata('1.85.0');
  metadata.paths[`${RPC_PATH_PREFIX}/LubanFeatureRpcInterface-1.86.0-previewFeatureOp`] = {};
  const baseUrl = await startLoopbackServer(t, respondJson(metadata));

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /conflicting LubanFeatureRpcInterface versions/);
  assert.match(result.stderr, /1\.85\.0, 1\.86\.0/);
});

test('verify-runtime rejects malformed metadata JSON without echoing it', { timeout: 30000 }, async (t) => {
  const baseUrl = await startLoopbackServer(
    t,
    respondJson('{"openapi": "3.0.0", "paths": {'),
  );

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not valid JSON/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('openapi'));
});

test('verify-runtime treats HTTP errors as network failures', { timeout: 30000 }, async (t) => {
  const canary = 'CANARY-http-error-body';
  const baseUrl = await startLoopbackServer(t, respondJson({ canary }, 503));

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /HTTP 503/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(canary));
});

test('verify-runtime treats an unreachable runtime as a network failure', { timeout: 30000 }, async () => {
  const baseUrl = await closedLoopbackBaseUrl();

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read runtime metadata/);
});

test('verify-runtime honours --timeout-ms', { timeout: 30000 }, async (t) => {
  // Never writes a response, so the client must abort on its own timeout.
  const baseUrl = await startLoopbackServer(t, () => {});

  const result = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    baseUrl,
    '--timeout-ms',
    '300',
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /timed out after 300 ms/);
});

test('verify-runtime treats unreadable or non-JSON manifests as input-file failures', { timeout: 30000 }, async (t) => {
  const dir = tempDir(t);
  const badJsonPath = join(dir, 'bad.json');
  writeFileSync(badJsonPath, '{"tag":', 'utf8');

  const badJson = await runAsync([
    'verify-runtime',
    '--file',
    badJsonPath,
    '--base-url',
    'http://127.0.0.1:1',
  ]);
  assert.equal(badJson.status, 2);
  assert.match(badJson.stderr, /not valid JSON/);

  const missing = await runAsync([
    'verify-runtime',
    '--file',
    join(dir, 'missing.json'),
    '--base-url',
    'http://127.0.0.1:1',
  ]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read/);
});

test('verify-runtime rejects bad usage with exit code 2', { timeout: 30000 }, async () => {
  const missingUrl = await runAsync(['verify-runtime', '--file', EXAMPLE]);
  assert.equal(missingUrl.status, 2);
  assert.match(missingUrl.stderr, /--base-url/);

  const badUrl = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    'not a url',
  ]);
  assert.equal(badUrl.status, 2);
  assert.match(badUrl.stderr, /absolute http\(s\) URL/);

  const badProtocol = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    'ftp://127.0.0.1/rpc/metadata',
  ]);
  assert.equal(badProtocol.status, 2);
  assert.match(badProtocol.stderr, /http or https/);

  const badTimeout = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    'http://127.0.0.1:1',
    '--timeout-ms',
    '0',
  ]);
  assert.equal(badTimeout.status, 2);
  assert.match(badTimeout.stderr, /--timeout-ms/);

  const credentials = await runAsync([
    'verify-runtime',
    '--file',
    EXAMPLE,
    '--base-url',
    'http://user:secret@127.0.0.1:1',
  ]);
  assert.equal(credentials.status, 2);
  assert.match(credentials.stderr, /must not contain credentials/);
  assert.ok(!`${credentials.stdout}${credentials.stderr}`.includes('secret'));
});
