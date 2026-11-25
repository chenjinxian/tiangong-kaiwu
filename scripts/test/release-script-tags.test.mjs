/**
 * Release/build script tag-profile tests.
 *
 *   node --test scripts/test/release-script-tags.test.mjs
 *
 * Two deterministic layers:
 *   - Static: the checked-in scripts contain no literal floating image tag in
 *     executable lines (the release hygiene scanner is line/literal based), and
 *     expose explicit release-tag inputs.
 *   - Behaviour: `-PlanOnly` runs the real PowerShell parameter validation
 *     without Docker, files, network or a build. It proves that floating tags
 *     are rejected and immutable tags/digests are accepted. These cases are
 *     skipped when no PowerShell executable is available; the static layer is
 *     always enforced (including on the Linux CI runner).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REBUILD = join(REPO_ROOT, 'scripts', 'rebuild-web.ps1');
const BUNDLE = join(REPO_ROOT, 'scripts', 'make-deploy-bundle.ps1');
const IMMUTABLE_TAG = 'backend-20261124';
const DIGEST = `sha256:${'a'.repeat(64)}`;

/** Same comment stripping as scripts/check-release-hygiene.mjs. */
function stripScriptComments(text) {
  const withoutBlocks = text.replace(/<#[\s\S]*?#>/g, (match) =>
    match.replace(/[^\r\n]/g, ' '),
  );
  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => (/^\s*#/.test(line) ? '' : line))
    .join('\n');
}

function executableCode(rel) {
  return stripScriptComments(readFileSync(join(REPO_ROOT, rel), 'utf8'));
}

function findPowerShell() {
  const candidates =
    process.platform === 'win32'
      ? ['powershell', 'pwsh']
      : ['pwsh', 'powershell'];
  for (const command of candidates) {
    const probe = spawnSync(
      command,
      ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'],
      { encoding: 'utf8' },
    );
    if (probe.status === 0) return command;
  }
  return undefined;
}

const POWERSHELL = findPowerShell();

function runScript(script, args) {
  const prefix =
    POWERSHELL === 'powershell'
      ? ['-ExecutionPolicy', 'Bypass']
      : [];
  return spawnSync(
    POWERSHELL,
    [...prefix, '-NoProfile', '-File', script, ...args],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
}

test('release/build scripts have no literal floating image tag in code', () => {
  for (const rel of [
    'scripts/rebuild-web.ps1',
    'scripts/make-deploy-bundle.ps1',
  ]) {
    assert.doesNotMatch(executableCode(rel), /:latest\b/i, rel);
  }

  // The local compatibility alias stays configurable, but publication needs
  // an owner-provided immutable reference.
  const rebuild = executableCode('scripts/rebuild-web.ps1');
  assert.match(rebuild, /\[string\]\$LocalTag\s*=\s*'latest'/);
  assert.match(rebuild, /\[string\]\$ReleaseTag\s*=\s*''/);
  assert.match(rebuild, /\$Value\s+-ieq\s+'latest'/);

  const bundle = executableCode('scripts/make-deploy-bundle.ps1');
  assert.match(bundle, /\[string\]\$ImageTag\s*=\s*''/);
  assert.match(bundle, /\[switch\]\$LocalDev/);
  assert.match(bundle, /if \(-not \$LocalDev\)/);
  assert.match(bundle, /\$ImageTag\s+-ieq\s+'latest'/);
});

test('rebuild-web plan rejects latest and accepts immutable tag/digest', (t) => {
  if (POWERSHELL === undefined) {
    t.skip('PowerShell is not available');
    return;
  }

  const rejected = runScript(REBUILD, ['-PlanOnly', '-ReleaseTag', 'latest']);
  assert.notEqual(rejected.status, 0);
  assert.doesNotMatch(rejected.stdout, /release ref =/);

  const tagged = runScript(REBUILD, [
    '-PlanOnly',
    '-ReleaseTag',
    IMMUTABLE_TAG,
  ]);
  assert.equal(tagged.status, 0, tagged.stderr || tagged.stdout);
  assert.match(
    tagged.stdout,
    /release ref = ghcr\.io\/chenjinxian\/luban-web-public:backend-20261124/,
  );

  const pinned = runScript(REBUILD, ['-PlanOnly', '-ReleaseTag', DIGEST]);
  assert.equal(pinned.status, 0, pinned.stderr || pinned.stdout);
  assert.match(
    pinned.stdout,
    /release ref = ghcr\.io\/chenjinxian\/luban-web-public@sha256:a{64}/,
  );

  // Without a release reference the script must not pretend to publish.
  const localOnly = runScript(REBUILD, ['-PlanOnly']);
  assert.equal(localOnly.status, 0, localOnly.stderr || localOnly.stdout);
  assert.match(
    localOnly.stdout,
    /plan: local compat tag = tiangong-kaiwu-web:latest/,
  );
  assert.doesNotMatch(localOnly.stdout, /release ref =/);
});

test('deploy bundle defaults to release posture and only LocalDev allows latest', (t) => {
  if (POWERSHELL === undefined) {
    t.skip('PowerShell is not available');
    return;
  }

  const missing = runScript(BUNDLE, [
    '-PlanOnly',
    '-Tag',
    IMMUTABLE_TAG,
  ]);
  assert.notEqual(missing.status, 0);

  // Release posture is the default: latest is rejected without -LocalDev.
  const latestRelease = runScript(BUNDLE, [
    '-PlanOnly',
    '-Tag',
    IMMUTABLE_TAG,
    '-ImageTag',
    'latest',
  ]);
  assert.notEqual(latestRelease.status, 0);

  const explicitDev = runScript(BUNDLE, [
    '-PlanOnly',
    '-Tag',
    IMMUTABLE_TAG,
    '-ImageTag',
    'latest',
    '-LocalDev',
  ]);
  assert.equal(explicitDev.status, 0, explicitDev.stderr || explicitDev.stdout);
  assert.match(explicitDev.stdout, /image tag = latest/);
  assert.match(explicitDev.stdout, /localDev = True/);

  // Release posture also requires an explicit tag (no date default).
  const implicitReleaseTag = runScript(BUNDLE, [
    '-PlanOnly',
    '-ImageTag',
    IMMUTABLE_TAG,
  ]);
  assert.notEqual(implicitReleaseTag.status, 0);

  const released = runScript(BUNDLE, [
    '-PlanOnly',
    '-Tag',
    IMMUTABLE_TAG,
    '-ImageTag',
    IMMUTABLE_TAG,
  ]);
  assert.equal(released.status, 0, released.stderr || released.stdout);
  assert.match(released.stdout, /image tag = backend-20261124/);
  assert.match(released.stdout, /localDev = False/);

  // A shared digest cannot pin four different repositories; fail closed.
  const digestLike = runScript(BUNDLE, [
    '-PlanOnly',
    '-Tag',
    IMMUTABLE_TAG,
    '-ImageTag',
    DIGEST,
  ]);
  assert.notEqual(digestLike.status, 0);
});
