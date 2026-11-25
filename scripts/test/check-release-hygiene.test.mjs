/**
 * Tests for scripts/check-release-hygiene.mjs.
 *
 * Dependency-free: run with
 *   node --test scripts/test/check-release-hygiene.test.mjs
 *
 * Every fixture is a synthetic repository under the OS temp directory. No
 * network, docker, gh, or real release artifacts are used. The tests cover
 * positive and negative fixtures for image pinning, build-script hygiene,
 * source/shipped contract skew, release manifests/provenance, weak secrets,
 * waiver scope/expiry, output formats, and CLI exit codes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-release-hygiene.mjs');
const SOURCE_CONTRACT =
  'luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts';
const SHIPPED_CONTRACT =
  'dist-backend/modeling-server/node_modules/@luban-cad/shared/dist/rpc/LubanFeatureRpcInterface.js';
const SHIPPED_PROVENANCE =
  'dist-backend/modeling-server/node_modules/@bentley/imodeljs-native/native-provenance.json';
const RELEASE_COMPOSE = 'docker-compose.release.yml';
const RELEASE_PROFILE = 'deploy/release/release-profile.json';
const CLEAN_RELEASE_COMPOSE = [
  'services:',
  '  app:',
  '    image: "${RELEASE_APP_IMAGE:?set RELEASE_APP_IMAGE to the pinned app image}"',
  '    pull_policy: always',
  '  nginx:',
  '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE to the pinned nginx image}"',
  '    pull_policy: always',
  '    ports:',
  '      - "${RELEASE_EDGE_BIND:-127.0.0.1}:${RELEASE_EDGE_PORT:-5301}:80"',
  '',
].join('\n');
const CLEAN_RELEASE_PROFILE = {
  schemaVersion: 1,
  images: {
    RELEASE_APP_IMAGE: 'ghcr.io/example/app',
    RELEASE_NGINX_IMAGE: 'docker.io/library/nginx',
  },
  requiredInputs: [],
};

function run(args, options = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-hygiene-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, text) {
  const absolute = join(root, rel);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text, 'utf8');
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

const SOURCE_TEXT = `export abstract class LubanFeatureRpcInterface {
  public static interfaceName = "LubanFeatureRpcInterface";
  public static interfaceVersion = "1.85.0";
}
`;
const SHIPPED_TEXT = `export class LubanFeatureRpcInterface {
    static interfaceName = "LubanFeatureRpcInterface";
    static interfaceVersion = "1.85.0";
}
`;
const PROVENANCE_TEXT = '{"nativeVersion":"5.15.5","fallbackRequired":false}\n';
const ARTIFACT_TEXT = 'synthetic-release-artifact\n';
const SBOM_EVIDENCE_TEXT = '{"spdxVersion":"SPDX-2.3","name":"synthetic"}\n';
const SIGNATURE_EVIDENCE_TEXT = 'synthetic-signature-bundle\n';
const PROVENANCE_EVIDENCE_TEXT = '{"_type":"synthetic-provenance"}\n';
const EVIDENCE_PATHS = {
  sbom: 'release/sbom/app.spdx.json',
  signature: 'release/sig/app.sig',
  provenance: 'release/prov/app.provenance.json',
};

function evidenceEntries() {
  return [
    {
      kind: 'sbom',
      path: EVIDENCE_PATHS.sbom,
      sha256: sha256(SBOM_EVIDENCE_TEXT),
    },
    {
      kind: 'signature',
      path: EVIDENCE_PATHS.signature,
      sha256: sha256(SIGNATURE_EVIDENCE_TEXT),
    },
    {
      kind: 'provenance',
      path: EVIDENCE_PATHS.provenance,
      sha256: sha256(PROVENANCE_EVIDENCE_TEXT),
    },
  ];
}

function baseManifest({ artifact = true, evidence = true } = {}) {
  return {
    schemaVersion: 1,
    tag: 'backend-20261124',
    sourceCommit: 'a'.repeat(40),
    builtAt: '2026-11-24T00:00:00.000Z',
    contractVersion: '1.85.0',
    images: [
      {
        name: 'ghcr.io/example/app',
        digest: `sha256:${'1'.repeat(64)}`,
      },
      {
        name: 'docker.io/library/nginx',
        digest: `sha256:${'3'.repeat(64)}`,
      },
    ],
    nativeProvenance: {
      path: 'native-provenance.json',
      sha256: sha256(PROVENANCE_TEXT),
    },
    ...(artifact
      ? {
          artifacts: [
            {
              path: 'dist-out/app.tgz',
              sha256: sha256(ARTIFACT_TEXT),
            },
          ],
        }
      : {}),
    ...(evidence ? { evidence: evidenceEntries() } : {}),
  };
}

// The repository release/build scripts reference these GHCR repositories.
// Release mode requires a manifest digest for every image a release config
// references, so the fixture manifest must cover them.
const RELEASE_SCRIPT_IMAGES = [
  'ghcr.io/chenjinxian/luban-web-public',
  'ghcr.io/chenjinxian/luban-bff-public',
  'ghcr.io/chenjinxian/imodelhub-public',
  'ghcr.io/chenjinxian/luban-webhook-agent-public',
];

function manifestWithScriptImages() {
  const manifest = baseManifest();
  manifest.images.push(
    ...RELEASE_SCRIPT_IMAGES.map((name, index) => ({
      name,
      digest: `sha256:${String(index + 4).repeat(64)}`,
    })),
  );
  return manifest;
}

/**
 * Build a minimal clean repository. Tests override one risk at a time.
 */
function fixture(t, options = {}) {
  const root = tempDir(t);
  const compose =
    options.compose ??
    [
      'services:',
      '  app:',
      '    image: ghcr.io/example/app:backend-20261124',
      '  db:',
      '    image: postgres:17-alpine',
      '',
    ].join('\n');
  write(root, 'docker-compose.yml', compose);
  if (options.releaseCompose !== 'omit') {
    write(
      root,
      RELEASE_COMPOSE,
      options.releaseCompose ?? CLEAN_RELEASE_COMPOSE,
    );
  }
  if (options.releaseProfile !== 'omit') {
    const profile = options.releaseProfile ?? CLEAN_RELEASE_PROFILE;
    write(
      root,
      RELEASE_PROFILE,
      `${JSON.stringify(profile, null, 2)}\n`,
    );
  }
  write(root, 'scripts/rebuild-web.ps1', 'Write-Host "ok"\n');
  write(root, SOURCE_CONTRACT, options.sourceText ?? SOURCE_TEXT);
  if (options.shipped !== 'omit') {
    write(root, SHIPPED_CONTRACT, options.shippedText ?? SHIPPED_TEXT);
  }
  if (options.provenance !== 'omit') {
    write(
      root,
      'native-provenance.json',
      options.provenanceText ?? PROVENANCE_TEXT,
    );
  }
  if (options.shipped !== 'omit' && options.shippedProvenance !== 'omit') {
    write(
      root,
      SHIPPED_PROVENANCE,
      options.shippedProvenanceText ?? PROVENANCE_TEXT,
    );
  }
  if (options.artifact !== 'omit') {
    write(root, 'dist-out/app.tgz', ARTIFACT_TEXT);
  }
  if (options.evidenceFiles !== 'omit') {
    write(root, EVIDENCE_PATHS.sbom, options.sbomEvidence ?? SBOM_EVIDENCE_TEXT);
    write(
      root,
      EVIDENCE_PATHS.signature,
      options.signatureEvidence ?? SIGNATURE_EVIDENCE_TEXT,
    );
    write(
      root,
      EVIDENCE_PATHS.provenance,
      options.provenanceEvidence ?? PROVENANCE_EVIDENCE_TEXT,
    );
  }
  if (options.manifest !== 'omit') {
    write(
      root,
      'release-manifest.json',
      `${JSON.stringify(options.manifest ?? baseManifest(), null, 2)}\n`,
    );
  }
  if (options.waivers !== 'omit') {
    const waivers = options.waivers ?? {
      schemaVersion: 1,
      waivers: [],
    };
    const text =
      typeof waivers === 'string'
        ? waivers
        : `${JSON.stringify(waivers, null, 2)}\n`;
    write(root, 'scripts/release-hygiene-waivers.json', text);
  }
  return root;
}

function parseJson(result) {
  assert.equal(result.status, result.status, result.stderr);
  return JSON.parse(result.stdout);
}

const RELEASE_EXPECTED = [
  '--expected-source-commit',
  'a'.repeat(40),
  '--expected-tag',
  'backend-20261124',
];

test('clean fixture passes in local and release modes', (t) => {
  const root = fixture(t);

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  const localReport = parseJson(local);
  assert.equal(localReport.summary.ok, true);
  assert.equal(localReport.summary.errors, 0);
  assert.equal(localReport.summary.waived, 0);
  // The release compose is intentionally evaluated by release.profile, so
  // images.pinned reports it as skipped rather than scanning its variables.
  assert.equal(
    localReport.checks.find((c) => c.id === 'images.pinned').status,
    'skipped',
  );
  assert.equal(localReport.checks.find((c) => c.id === 'release.profile').status, 'ok');
  assert.equal(localReport.checks.find((c) => c.id === 'contract.shipped').status, 'ok');

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 0, release.stderr);
  const releaseReport = parseJson(release);
  assert.equal(releaseReport.summary.ok, true);
  assert.equal(releaseReport.summary.errors, 0);
});

test(':latest and untagged compose images fail by default', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  mail:',
      '    image: maildev/maildev:latest',
      '  storage:',
      '    image: mcr.microsoft.com/azure-storage/azurite',
      '  bad-digest:',
      '    image: ghcr.io/example/app@sha256:deadbeef',
      '',
    ].join('\n'),
  });

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const messages = report.violations.map((v) => v.message).join('\n');
  assert.match(messages, /":latest"/);
  assert.match(messages, /no tag or digest/);
  assert.match(messages, /digest is malformed/);
  assert.equal(report.violations.filter((v) => v.check === 'images.pinned').length, 3);
});

test('CI workflow service images must be pinned', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  app:',
      '    image: ghcr.io/example/app:backend-20261124',
      '',
    ].join('\n'),
  });
  write(
    root,
    '.github/workflows/ci.yml',
    [
      'jobs:',
      '  test:',
      '    services:',
      '      db:',
      '        image: postgres:latest',
      '',
    ].join('\n'),
  );

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  assert.equal(
    report.violations.some(
      (v) =>
        v.check === 'images.pinned' &&
        v.file === '.github/workflows/ci.yml' &&
        v.subject === 'postgres:latest',
    ),
    true,
  );
});

test('image tag defaulting to latest inside ${...} fails', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  web:',
      '    image: ghcr.io/example/web:${WEB_TAG:-latest}',
      '',
    ].join('\n'),
  });

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  assert.equal(
    report.violations.some(
      (v) =>
        v.check === 'images.pinned' &&
        v.subject === 'ghcr.io/example/web:${WEB_TAG:-latest}',
    ),
    true,
  );
});

test('build-script host paths, tsc --noCheck, npm install and store fallback fail', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  app:',
      '    image: ghcr.io/example/app:backend-20261124',
      '',
    ].join('\n'),
  });
  write(
    root,
    'scripts/rebuild-web.ps1',
    [
      '$env:PATH = "C:\\Program Files\\Docker\\Docker\\resources\\bin;$env:PATH"',
      'corepack pnpm@10 exec tsc --noCheck',
      'npm install --legacy-peer-deps',
      'if ($AllowStoreNativeFallback) { Write-Host "store" }',
      '$storePkg = Get-Item "$Root\\itwinjs-core\\common\\temp\\node_modules\\.pnpm\\@bentley+imodeljs-native@1.0.0"',
      'docker push example.com/app:latest',
      '',
    ].join('\n'),
  );

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const subjects = report.violations
    .filter((v) => v.check === 'build.scripts')
    .map((v) => v.subject);
  assert.equal(
    subjects.some((subject) => subject.startsWith('host-path:C:\\Program')),
    true,
  );
  assert.equal(subjects.includes('tsc-noCheck'), true);
  assert.equal(subjects.includes('lockless-install:npm-install'), true);
  assert.equal(
    subjects.includes('store-fallback:AllowStoreNativeFallback'),
    true,
  );
  assert.equal(
    subjects.includes('store-fallback:imodeljs-native-store'),
    true,
  );
  assert.equal(
    report.violations.some(
      (v) =>
        v.check === 'images.pinned' &&
        v.subject === 'example.com/app:latest',
    ),
    true,
  );
});

test('shipped dist-backend contract skew is a failure', (t) => {
  const root = fixture(t, {
    shippedText: SHIPPED_TEXT.replace('1.85.0', '1.64.0'),
  });

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const mismatch = report.violations.find(
    (v) => v.check === 'contract.shipped',
  );
  assert.ok(mismatch);
  assert.match(mismatch.message, /1\.64\.0/);
  assert.match(mismatch.message, /1\.85\.0/);
});

test('shipped native provenance must not leak host paths or private evidence', (t) => {
  const leaked = `\uFEFF${JSON.stringify(
    {
      nativeVersion: '5.15.5',
      storePackagePath:
        'D:\\Github\\tiangong-kaiwu\\itwinjs-core\\common\\temp\\node_modules\\.pnpm\\@bentley+imodeljs-native@5.15.5',
      imodelNativeHead: 'f'.repeat(40),
      requiredTagCommit: 'e'.repeat(40),
    },
    null,
    2,
  )}\n`;
  const root = fixture(t, { shippedProvenanceText: leaked });

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  const localReport = parseJson(local);
  assert.equal(
    localReport.warnings.some(
      (v) => v.subject === 'native-provenance:host-path',
    ),
    true,
  );
  assert.equal(
    localReport.warnings.some(
      (v) => v.subject === 'native-provenance:private-evidence',
    ),
    true,
  );

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 1);
  const releaseReport = parseJson(release);
  assert.equal(
    releaseReport.violations.some(
      (v) => v.subject === 'native-provenance:host-path',
    ),
    true,
  );
  assert.equal(
    releaseReport.violations.some(
      (v) => v.subject === 'native-provenance:private-evidence',
    ),
    true,
  );
});

test('release mode requires the shipped dist-backend tree', (t) => {
  const root = fixture(t, { shipped: 'omit' });

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  const localReport = parseJson(local);
  assert.equal(
    localReport.skipped.some((s) => s.check === 'contract.shipped'),
    true,
  );

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 1);
  const releaseReport = parseJson(release);
  assert.equal(
    releaseReport.violations.some(
      (v) => v.subject === 'shipped-contract-missing',
    ),
    true,
  );
});

test('release mode requires release-manifest.json', (t) => {
  const root = fixture(t, { manifest: 'omit' });

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 1);
  const report = parseJson(release);
  assert.equal(
    report.violations.some((v) => v.subject === 'manifest-missing'),
    true,
  );
});

test('manifest native provenance is required and its digest is verified', (t) => {
  const withoutProvenance = baseManifest();
  delete withoutProvenance.nativeProvenance;
  const root = fixture(t, { manifest: withoutProvenance });

  const result = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  assert.equal(
    report.violations.some((v) => /nativeProvenance/.test(v.message)),
    true,
  );

  const tampered = baseManifest();
  tampered.nativeProvenance.sha256 = `sha256:${'0'.repeat(64)}`;
  const root2 = fixture(t, { manifest: tampered });
  const tamperedResult = run([
    '--root',
    root2,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(tamperedResult.status, 1);
  const tamperedReport = parseJson(tamperedResult);
  assert.equal(
    tamperedReport.violations.some(
      (v) => v.subject === 'provenance-digest-mismatch',
    ),
    true,
  );
});

test('release mode requires file-backed SBOM/signature/provenance evidence; local and CI stay policy-free', (t) => {
  const withoutEvidence = baseManifest({ evidence: false });
  const root = fixture(t, { manifest: withoutEvidence, evidenceFiles: 'omit' });

  // Backward compatibility: structural manifests without evidence[] remain
  // testable in local/CI mode (the release policy is not applied there).
  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  assert.equal(parseJson(local).summary.errors, 0);

  const ci = run(['--root', root, '--mode', 'ci', '--format', 'json']);
  assert.equal(ci.status, 0, ci.stderr);

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 1);
  const messages = parseJson(release)
    .violations.map((violation) => violation.message)
    .join('\n');
  assert.match(messages, /requires at least one "sbom" entry/);
  assert.match(
    messages,
    /requires at least one "signature" or "attestation" entry/,
  );
  assert.match(messages, /requires at least one "provenance" entry/);
});

test('release mode re-hashes evidence files and fails closed on tampering or missing files', (t) => {
  const tamperedRoot = fixture(t, { sbomEvidence: 'tampered-sbom-bytes' });
  const tampered = run([
    '--root',
    tamperedRoot,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(tampered.status, 1);
  const tamperedReport = parseJson(tampered);
  assert.equal(
    tamperedReport.violations.some(
      (violation) => violation.subject === 'evidence-digest-mismatch:0',
    ),
    true,
  );
  assert.equal(
    tamperedReport.violations.some((violation) =>
      /evidence\[0\] \(sbom\) digest mismatch/.test(violation.message),
    ),
    true,
  );

  const missingRoot = fixture(t, { evidenceFiles: 'omit' });
  const missing = run([
    '--root',
    missingRoot,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(missing.status, 1);
  assert.equal(
    parseJson(missing).violations.some(
      (violation) => violation.subject === 'evidence-missing:0',
    ),
    true,
  );

  // Local mode does not re-hash artifact/evidence bytes by default, so the
  // same fixture remains usable for development-time structural checks.
  const local = run([
    '--root',
    missingRoot,
    '--mode',
    'local',
    '--format',
    'json',
  ]);
  assert.equal(local.status, 0, local.stderr);

  const escaped = baseManifest();
  escaped.evidence[0].path = '../outside-repo.spdx.json';
  const escapedRoot = fixture(t, { manifest: escaped });
  const escapedResult = run([
    '--root',
    escapedRoot,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(escapedResult.status, 1);
  assert.equal(
    parseJson(escapedResult).violations.some(
      (violation) => violation.subject === 'evidence-path-escape:0',
    ),
    true,
  );
});

test('manifest tag and source commit must match the release expectation', (t) => {
  const root = fixture(t);
  const tagResult = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    '--expected-source-commit',
    'a'.repeat(40),
    '--expected-tag',
    'backend-20990101',
  ]);
  assert.equal(tagResult.status, 1);
  const tagReport = parseJson(tagResult);
  assert.equal(
    tagReport.violations.some((v) => v.subject === 'tag-mismatch'),
    true,
  );

  const commitResult = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    '--expected-source-commit',
    'b'.repeat(40),
  ]);
  assert.equal(commitResult.status, 1);
  const commitReport = parseJson(commitResult);
  assert.equal(
    commitReport.violations.some((v) =>
      /sourceCommit mismatch/.test(v.message),
    ),
    true,
  );
});

test('manifest tag must match the newest backend tgz', (t) => {
  const root = fixture(t);
  const artifactDir = join(root, 'dist-backend');
  const matching = join(
    artifactDir,
    'modeling-server-win-x64-backend-20261124.tgz',
  );
  write(root, 'dist-backend/modeling-server-win-x64-backend-20261124.tgz', 'x');

  const ok = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(ok.status, 0, ok.stderr);

  const stale = join(
    artifactDir,
    'modeling-server-win-x64-backend-20990101.tgz',
  );
  write(root, 'dist-backend/modeling-server-win-x64-backend-20990101.tgz', 'y');
  utimesSync(matching, new Date('2026-11-24T00:00:00Z'), new Date('2026-11-24T00:00:00Z'));
  utimesSync(stale, new Date('2099-01-01T00:00:00Z'), new Date('2099-01-01T00:00:00Z'));

  const bad = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(bad.status, 1);
  const report = parseJson(bad);
  assert.equal(
    report.violations.some((v) => v.subject === 'artifact-tag-mismatch'),
    true,
  );
});

test('GHCR images referenced by the release config need manifest digests', (t) => {
  const manifest = baseManifest();
  manifest.images = [
    {
      name: 'ghcr.io/example/other',
      digest: `sha256:${'2'.repeat(64)}`,
    },
  ];
  const root = fixture(t, { manifest });

  const result = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  assert.equal(
    report.violations.some(
      (v) => v.subject === 'image-missing-digest:ghcr.io/example/app',
    ),
    true,
  );
});

test('release mode requires the release compose profile', (t) => {
  const root = fixture(t, { releaseCompose: 'omit', releaseProfile: 'omit' });

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  const localReport = parseJson(local);
  assert.equal(
    localReport.skipped.some((s) => s.check === 'release.profile'),
    true,
  );

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 1);
  const report = parseJson(release);
  assert.equal(
    report.violations.some((v) => v.subject === 'release-compose-missing'),
    true,
  );
});

test('release compose images must be required mapped variables', (t) => {
  const root = fixture(t, {
    releaseCompose: [
      'services:',
      '  app:',
      '    image: ghcr.io/example/app:latest',
      '    pull_policy: always',
      '  db:',
      '    image: "${RELEASE_DB_IMAGE:?set RELEASE_DB_IMAGE}"',
      '    pull_policy: always',
      '  web:',
      '    image: "${RELEASE_WEB_IMAGE:-ghcr.io/example/app:latest}"',
      '    pull_policy: always',
      '  nginx:',
      '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE}"',
      '    pull_policy: always',
      '    ports:',
      '      - "127.0.0.1:5301:80"',
      '',
    ].join('\n'),
  });

  const result = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const subjects = report.violations.map((v) => v.subject);
  assert.equal(subjects.includes('image-literal:app'), true);
  assert.equal(subjects.includes('image-var-unmapped:RELEASE_DB_IMAGE'), true);
  assert.equal(subjects.includes('image-not-required:web'), true);
});

test('release compose secrets must be required from RELEASE_ variables', (t) => {
  const root = fixture(t, {
    releaseCompose: [
      'services:',
      '  app:',
      '    image: "${RELEASE_APP_IMAGE:?set RELEASE_APP_IMAGE}"',
      '    pull_policy: always',
      '    environment:',
      '      POSTGRES_PASSWORD: secret',
      '      AUTH_JWT_SECRET: "${HUB_JWT_SECRET:?set HUB_JWT_SECRET}"',
      '      SEED_ADMIN_PASSWORD: "${RELEASE_ADMIN_PASSWORD:-admin}"',
      '  nginx:',
      '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE}"',
      '    pull_policy: always',
      '    ports:',
      '      - "127.0.0.1:5301:80"',
      '',
    ].join('\n'),
  });

  const result = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const subjects = report.violations.map((v) => v.subject);
  assert.equal(
    subjects.includes('secret-not-required:POSTGRES_PASSWORD'),
    true,
  );
  assert.equal(
    subjects.includes('secret-not-required:AUTH_JWT_SECRET'),
    true,
  );
  assert.equal(
    subjects.includes('secret-not-required:SEED_ADMIN_PASSWORD'),
    true,
  );
  assert.doesNotMatch(result.stdout, /POSTGRES_PASSWORD:\s*secret/);
  assert.doesNotMatch(result.stdout, /RELEASE_ADMIN_PASSWORD:-admin/);
});

test('release compose only publishes the edge and never builds locally', (t) => {
  const root = fixture(t, {
    releaseCompose: [
      'services:',
      '  app:',
      '    image: "${RELEASE_APP_IMAGE:?set RELEASE_APP_IMAGE}"',
      '    pull_policy: always',
      '    build: .',
      '  db:',
      '    image: "${RELEASE_APP_IMAGE:?set RELEASE_APP_IMAGE}"',
      '    pull_policy: always',
      '    ports:',
      '      - "5432:5432"',
      '  nginx:',
      '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE}"',
      '    pull_policy: always',
      '    ports:',
      '      - "5301:80"',
      '',
    ].join('\n'),
  });

  const result = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const subjects = report.violations.map((v) => v.subject);
  assert.equal(subjects.includes('build-section:app'), true);
  assert.equal(subjects.includes('non-edge-ports:db'), true);
  assert.equal(subjects.includes('port-bind:nginx'), true);
});

test('release required inputs must be declared in the profile', (t) => {
  const releaseCompose = [
    'services:',
    '  app:',
    '    image: "${RELEASE_APP_IMAGE:?set RELEASE_APP_IMAGE}"',
    '    pull_policy: always',
    '  nginx:',
    '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE}"',
    '    pull_policy: always',
    '    environment:',
    '      MS_UPSTREAM: "${RELEASE_MS_UPSTREAM:?set RELEASE_MS_UPSTREAM}"',
    '    ports:',
    '      - "127.0.0.1:5301:80"',
    '',
  ].join('\n');

  const undeclared = fixture(t, { releaseCompose });
  const bad = run([
    '--root',
    undeclared,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(bad.status, 1);
  assert.equal(
    parseJson(bad).violations.some(
      (v) => v.subject === 'input-undeclared:RELEASE_MS_UPSTREAM',
    ),
    true,
  );

  const declared = fixture(t, {
    releaseCompose,
    releaseProfile: {
      ...CLEAN_RELEASE_PROFILE,
      requiredInputs: ['RELEASE_MS_UPSTREAM'],
    },
  });
  const good = run([
    '--root',
    declared,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(good.status, 0, good.stderr);
});

test('release mode excludes development compose and dev-only scripts', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  mail:',
      '    image: maildev/maildev:latest',
      '  db:',
      '    image: postgres:17-alpine',
      '    environment:',
      '      POSTGRES_PASSWORD: ${HUB_DATABASE_PASSWORD:-changeme}',
      '',
    ].join('\n'),
  });
  write(
    root,
    'scripts/generate-env.ps1',
    "AZURITE_ACCOUNT_KEY=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==\n",
  );
  write(
    root,
    'scripts/quickstart.ps1',
    '$env:PATH = "C:\\Program Files\\Docker\\Docker\\resources\\bin;$env:PATH"\n',
  );

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 1);
  const localReport = parseJson(local);
  assert.equal(
    localReport.violations.some((v) => v.file === 'docker-compose.yml'),
    true,
  );
  assert.equal(
    localReport.violations.some((v) => v.file === 'scripts/generate-env.ps1'),
    true,
  );
  assert.equal(
    localReport.violations.some((v) => v.file === 'scripts/quickstart.ps1'),
    true,
  );

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 0, release.stderr);
  const releaseReport = parseJson(release);
  for (const file of [
    'docker-compose.yml',
    'scripts/generate-env.ps1',
    'scripts/quickstart.ps1',
  ]) {
    assert.equal(
      releaseReport.violations.some((v) => v.file === file),
      false,
      `${file} must not be a release config`,
    );
  }
});

test('--backend-root audits private release scripts read-only', (t) => {
  const root = fixture(t);
  const backend = tempDir(t);
  write(
    backend,
    'scripts/build-ms-dist.ps1',
    [
      "[string]$KaiwuRoot = 'D:\\Github\\tiangong-kaiwu'",
      'npm install --legacy-peer-deps',
      'corepack pnpm@10 exec tsc --noCheck',
      'if ($AllowStoreNativeFallback) { Write-Host "store" }',
      '$storePkg = Get-Item "$KaiwuRoot\\itwinjs-core\\common\\temp\\node_modules\\.pnpm\\@bentley+imodeljs-native@5.15.5"',
      '',
    ].join('\n'),
  );
  write(
    backend,
    'scripts/build-images.ps1',
    'docker build -t "ghcr.io/example/app:latest" .\n',
  );
  write(
    backend,
    'scripts/publish.ps1',
    'docker push "${image}:latest"\n',
  );
  write(
    backend,
    '.github/workflows/ci.yml',
    'run: corepack pnpm@10 install --no-frozen-lockfile\n',
  );

  const result = run([
    '--root',
    root,
    '--mode',
    'local',
    '--format',
    'json',
    '--backend-root',
    backend,
  ]);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const privateViolations = report.violations.filter((v) =>
    v.file.startsWith('backend/'),
  );
  const has = (file, subject) =>
    privateViolations.some((v) => v.file === file && v.subject === subject);

  assert.equal(
    privateViolations.some(
      (v) =>
        v.file === 'backend/scripts/build-ms-dist.ps1' &&
        v.subject.startsWith('host-path:D:\\Github'),
    ),
    true,
  );
  assert.equal(has('backend/scripts/build-ms-dist.ps1', 'tsc-noCheck'), true);
  assert.equal(
    has('backend/scripts/build-ms-dist.ps1', 'lockless-install:npm-install'),
    true,
  );
  assert.equal(
    has(
      'backend/scripts/build-ms-dist.ps1',
      'store-fallback:AllowStoreNativeFallback',
    ),
    true,
  );
  assert.equal(
    has('backend/scripts/build-images.ps1', 'ghcr.io/example/app:latest'),
    true,
  );
  assert.equal(
    has('backend/scripts/publish.ps1', '${image}:latest'),
    true,
  );
  assert.equal(
    has(
      'backend/.github/workflows/ci.yml',
      'lockless-install:pnpm-install',
    ),
    true,
  );
});

test('weak default and well-known secrets fail without echoing values', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  db:',
      '    image: postgres:17-alpine',
      '    environment:',
      '      POSTGRES_PASSWORD: ${HUB_DATABASE_PASSWORD:-changeme}',
      '  storage:',
      '    image: mcr.microsoft.com/azure-storage/azurite',
      '    environment:',
      '      AZURITE_ACCOUNT_KEY: Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
      '',
    ].join('\n'),
  });
  write(
    root,
    'luban-cad/apps/web/Dockerfile',
    'FROM node:22-alpine\nENV AUTH_JWT_SECRET=changeme\n',
  );

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  const secrets = report.violations.filter(
    (v) => v.check === 'secrets.defaults',
  );
  assert.equal(secrets.length, 3);
  assert.equal(
    secrets.some((v) => v.subject === 'weak-default:HUB_DATABASE_PASSWORD'),
    true,
  );
  assert.equal(
    secrets.some((v) => v.subject === 'weak-default:AUTH_JWT_SECRET'),
    true,
  );
  assert.equal(
    secrets.some((v) => v.subject === 'well-known:storage-account-key'),
    true,
  );
  assert.doesNotMatch(result.stdout, /changeme/);
  assert.doesNotMatch(
    result.stdout,
    /Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/,
  );
});

test('local waivers cover development compose debt; release mode excludes it', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  mail:',
      '    image: maildev/maildev:latest',
      '',
    ].join('\n'),
    waivers: {
      schemaVersion: 1,
      waivers: [
        {
          id: 'dev-maildev',
          check: 'images.pinned',
          file: 'docker-compose.yml',
          subject: 'maildev/maildev:latest',
          scope: 'local',
          reason: 'development SMTP sink',
          expires: '2099-12-31',
        },
      ],
    },
  });

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  const localReport = parseJson(local);
  assert.equal(localReport.summary.waived, 1);
  assert.equal(localReport.summary.errors, 0);

  const ci = run(['--root', root, '--mode', 'ci', '--format', 'json']);
  assert.equal(ci.status, 0, ci.stderr);

  // The dev compose is not a release config. Release mode audits the release
  // profile instead and reports the dev compose as skipped, so waiving dev
  // debt never masks a release-profile violation.
  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 0, release.stderr);
  const releaseReport = parseJson(release);
  assert.equal(releaseReport.summary.waived, 0);
  assert.equal(
    releaseReport.skipped.some(
      (s) =>
        s.check === 'images.pinned' && /docker-compose\.yml/.test(s.message),
    ),
    true,
  );
});

test('release mode ignores waivers on release artifact scripts', (t) => {
  const root = fixture(t);
  write(
    root,
    'scripts/rebuild-web.ps1',
    'docker push example.com/app:latest\n',
  );
  write(
    root,
    'scripts/release-hygiene-waivers.json',
    `${JSON.stringify(
      {
        schemaVersion: 1,
        waivers: [
          {
            id: 'dev-rebuild-push',
            check: 'images.pinned',
            file: 'scripts/rebuild-web.ps1',
            subject: 'example.com/app:latest',
            scope: 'local',
            reason: 'local publish helper',
            expires: '2099-12-31',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const local = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(local.status, 0, local.stderr);
  const localReport = parseJson(local);
  assert.equal(localReport.summary.waived, 1);

  const release = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(release.status, 1);
  const releaseReport = parseJson(release);
  assert.equal(releaseReport.summary.waived, 0);
  assert.equal(
    releaseReport.violations.some(
      (v) => v.subject === 'example.com/app:latest',
    ),
    true,
  );
});

test('repository release/build scripts pass release image pinning', (t) => {
  // Guard the real scripts, not a synthetic approximation: release mode scans
  // rebuild-web.ps1 and make-deploy-bundle.ps1, and any literal floating tag
  // (including one only printed to the release owner) blocks the gate.
  const root = fixture(t, { manifest: manifestWithScriptImages() });
  for (const rel of [
    'scripts/rebuild-web.ps1',
    'scripts/make-deploy-bundle.ps1',
  ]) {
    write(root, rel, readFileSync(join(REPO_ROOT, rel), 'utf8'));
  }

  const result = run([
    '--root',
    root,
    '--mode',
    'release',
    '--format',
    'json',
    ...RELEASE_EXPECTED,
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = parseJson(result);
  assert.equal(
    report.violations.some((v) => v.check === 'images.pinned'),
    false,
  );
  assert.equal(
    report.warnings.some((v) => v.check === 'images.pinned'),
    false,
  );
});

test('expired waivers stop covering violations', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  mail:',
      '    image: maildev/maildev:latest',
      '',
    ].join('\n'),
    waivers: {
      schemaVersion: 1,
      waivers: [
        {
          id: 'expired-maildev',
          check: 'images.pinned',
          file: 'docker-compose.yml',
          subject: 'maildev/maildev:latest',
          scope: 'local',
          reason: 'expired test waiver',
          expires: '2020-01-01',
        },
      ],
    },
  });

  const result = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(result.status, 1);
  const report = parseJson(result);
  assert.equal(report.summary.waived, 0);
  assert.equal(
    report.violations.some((v) => v.subject === 'maildev/maildev:latest'),
    true,
  );
  assert.equal(
    report.warnings.some((v) => v.check === 'waivers.expired'),
    true,
  );
});

test('invalid waiver files are configuration errors (exit 2)', (t) => {
  const root = fixture(t, {
    waivers: {
      schemaVersion: 1,
      waivers: [
        {
          id: 'bad-scope',
          check: 'images.pinned',
          reason: 'release waivers are not allowed',
          scope: 'release',
        },
      ],
    },
  });

  const result = run(['--root', root, '--mode', 'local']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only "local" is supported/);
});

test('waiver subjects must not contain secret material', (t) => {
  const root = fixture(t, {
    waivers: {
      schemaVersion: 1,
      waivers: [
        {
          id: 'leaky-waiver',
          check: 'secrets.defaults',
          file: 'docker-compose.yml',
          subject: `ghp_${'a'.repeat(24)}`,
          reason: 'accidentally recorded a token',
          scope: 'local',
          expires: '2099-12-31',
        },
      ],
    },
  });

  const result = run(['--root', root, '--mode', 'local']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must not contain secret material/);
});

test('markdown and text output expose the same verdict', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  mail:',
      '    image: maildev/maildev:latest',
      '',
    ].join('\n'),
  });

  const markdown = run([
    '--root',
    root,
    '--mode',
    'local',
    '--format',
    'markdown',
  ]);
  assert.equal(markdown.status, 1);
  assert.match(markdown.stdout, /^# Release hygiene/m);
  assert.match(markdown.stdout, /## Violations/);
  assert.match(markdown.stdout, /maildev\/maildev:latest/);

  const text = run(['--root', root, '--mode', 'local', '--format', 'text']);
  assert.equal(text.status, 1);
  assert.match(text.stdout, /\[FAIL\] images\.pinned/);
  assert.match(text.stdout, /result: FAIL/);
});

test('--fail-on-warnings turns an unpinned variable into a failure', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  app:',
      '    image: ghcr.io/example/app:${APP_TAG}',
      '',
    ].join('\n'),
  });

  const normal = run(['--root', root, '--mode', 'local', '--format', 'json']);
  assert.equal(normal.status, 0, normal.stderr);
  const normalReport = parseJson(normal);
  assert.equal(normalReport.summary.warnings, 1);
  assert.equal(normalReport.summary.ok, true);

  const strict = run([
    '--root',
    root,
    '--mode',
    'local',
    '--format',
    'json',
    '--fail-on-warnings',
  ]);
  assert.equal(strict.status, 1);
  const strictReport = parseJson(strict);
  assert.equal(strictReport.summary.ok, false);
});
