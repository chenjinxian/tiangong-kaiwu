/**
 * Tests for the release image/profile renderer.
 *
 *   node --test scripts/test/release-images.test.mjs
 *
 * All fixtures are synthetic repositories under the OS temp directory. The
 * renderer is deterministic, reads only local files, and never calls
 * docker/gh or the network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
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
  loadReleaseProfile,
  parseReleaseCompose,
  validateReleaseCompose,
} from '../release-profile-lib.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'render-release-images.mjs');
const PROFILE = {
  schemaVersion: 1,
  images: {
    RELEASE_APP_IMAGE: 'ghcr.io/example/app',
    RELEASE_NGINX_IMAGE: 'docker.io/library/nginx',
  },
  requiredInputs: [],
};
const COMPOSE = [
  'services:',
  '  app:',
  '    image: "${RELEASE_APP_IMAGE:?set RELEASE_APP_IMAGE}"',
  '    pull_policy: always',
  '  nginx:',
  '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE}"',
  '    pull_policy: always',
  '    ports:',
  '      - "${RELEASE_EDGE_BIND:-127.0.0.1}:${RELEASE_EDGE_PORT:-5301}:80"',
  '',
].join('\n');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-images-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, text) {
  const absolute = join(root, rel);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text, 'utf8');
}

function manifest() {
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
  };
}

function fixture(t, options = {}) {
  const root = tempDir(t);
  write(
    root,
    'release-manifest.json',
    `${JSON.stringify(options.manifest ?? manifest(), null, 2)}\n`,
  );
  write(
    root,
    'deploy/release/release-profile.json',
    `${JSON.stringify(options.profile ?? PROFILE, null, 2)}\n`,
  );
  write(
    root,
    'docker-compose.release.yml',
    options.compose ?? COMPOSE,
  );
  return root;
}

test('repository release profile and compose are consistent', () => {
  const profile = loadReleaseProfile(REPO_ROOT);
  assert.equal(profile.exists, true);
  assert.deepEqual(profile.errors, []);

  const composeText = readFileSync(
    join(REPO_ROOT, 'docker-compose.release.yml'),
    'utf8',
  );
  const issues = validateReleaseCompose(composeText, profile.value, {
    mode: 'release',
    profileValid: true,
  });
  assert.deepEqual(
    issues.filter((issue) => issue.severity === 'error'),
    [],
  );
});

test('release compose covers the development service topology', () => {
  // Keep the release profile in sync with the dev stack by making any new
  // service an explicit release decision. maildev is deliberately dev-only
  // (release uses an explicit SMTP relay).
  const devOnlyServices = new Set(['maildev']);
  const dev = parseReleaseCompose(
    readFileSync(join(REPO_ROOT, 'docker-compose.yml'), 'utf8'),
  );
  const release = parseReleaseCompose(
    readFileSync(join(REPO_ROOT, 'docker-compose.release.yml'), 'utf8'),
  );
  const releaseNames = new Set(release.services.map((service) => service.name));
  for (const service of dev.services) {
    if (devOnlyServices.has(service.name)) continue;
    assert.equal(
      releaseNames.has(service.name),
      true,
      `release compose is missing development service "${service.name}"`,
    );
  }
});

test('renders deterministic pinned image env from the manifest', (t) => {
  const root = fixture(t);

  const check = run(['--root', root, '--check']);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /2 image\(s\) resolved/);

  const out = run(['--root', root, '--out', 'deploy/release/release-images.env']);
  assert.equal(out.status, 0, out.stderr);
  const envFile = readFileSync(
    join(root, 'deploy/release/release-images.env'),
    'utf8',
  );
  assert.match(
    envFile,
    new RegExp(
      `^RELEASE_APP_IMAGE=ghcr\\.io/example/app@sha256:${'1'.repeat(64)}$`,
      'm',
    ),
  );
  assert.match(
    envFile,
    new RegExp(
      `^RELEASE_NGINX_IMAGE=docker\\.io/library/nginx@sha256:${'3'.repeat(64)}$`,
      'm',
    ),
  );
  assert.ok(
    envFile.indexOf('RELEASE_APP_IMAGE') <
      envFile.indexOf('RELEASE_NGINX_IMAGE'),
  );
  assert.doesNotMatch(envFile, /PASSWORD|SECRET|TOKEN|API_KEY/);

  const again = run([
    '--root',
    root,
    '--out',
    'deploy/release/release-images-2.env',
  ]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(
    readFileSync(join(root, 'deploy/release/release-images-2.env'), 'utf8'),
    envFile,
  );
});

test('fails closed when a mapped image has no manifest digest', (t) => {
  const incomplete = manifest();
  incomplete.images = incomplete.images.filter(
    (image) => image.name !== 'docker.io/library/nginx',
  );
  const root = fixture(t, { manifest: incomplete });

  const result = run(['--root', root, '--check']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /docker\.io\/library\/nginx/);
  assert.match(result.stderr, /missing from the release manifest/);
});

test('fails closed on an invalid manifest digest', (t) => {
  const invalid = manifest();
  invalid.images[0].digest = `sha256:${'z'.repeat(64)}`;
  const root = fixture(t, { manifest: invalid });

  const result = run(['--root', root, '--check']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release manifest is invalid/);
});

test('fails closed on release compose policy violations', (t) => {
  const root = fixture(t, {
    compose: [
      'services:',
      '  app:',
      '    image: ghcr.io/example/app:latest',
      '    pull_policy: always',
      '  nginx:',
      '    image: "${RELEASE_NGINX_IMAGE:?set RELEASE_NGINX_IMAGE}"',
      '    pull_policy: always',
      '    ports:',
      '      - "127.0.0.1:5301:80"',
      '',
    ].join('\n'),
  });

  const result = run(['--root', root, '--check']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release compose error: image-literal:app/);
});

test('fails closed on an unmapped release image variable', (t) => {
  const profile = structuredClone(PROFILE);
  delete profile.images.RELEASE_NGINX_IMAGE;
  const root = fixture(t, { profile });

  const result = run(['--root', root, '--check']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /image-var-unmapped:RELEASE_NGINX_IMAGE/);
});

test('missing profile and missing compose fail closed', (t) => {
  const noProfile = fixture(t);
  rmSync(join(noProfile, 'deploy/release/release-profile.json'));
  const profileResult = run(['--root', noProfile, '--check']);
  assert.equal(profileResult.status, 1);
  assert.match(profileResult.stderr, /release profile not found/);

  const noCompose = fixture(t);
  rmSync(join(noCompose, 'docker-compose.release.yml'));
  const composeResult = run(['--root', noCompose, '--check']);
  assert.equal(composeResult.status, 2);
  assert.match(composeResult.stderr, /release compose not found/);
});

test('check mode writes nothing and usage errors exit 2', (t) => {
  const root = fixture(t);
  const check = run([
    '--root',
    root,
    '--check',
    '--out',
    'deploy/release/release-images.env',
  ]);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(
    existsSync(join(root, 'deploy/release/release-images.env')),
    false,
  );

  const usage = run(['--unknown']);
  assert.equal(usage.status, 2);
});

test('the generated env never contains secret-like lines', (t) => {
  const root = fixture(t);
  const result = run(['--root', root]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout
    .split(/\r?\n/)
    .filter((line) => line !== '' && !line.startsWith('#'));
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(line, /^RELEASE_[A-Z0-9_]+_IMAGE=[a-z0-9./-]+@sha256:[0-9a-f]{64}$/);
  }
});
