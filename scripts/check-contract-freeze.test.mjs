/**
 * Tests for scripts/check-contract-freeze.mjs (G1 J1.2).
 *
 * Dependency-free: run with `node --test scripts/check-contract-freeze.test.mjs`.
 * Synthetic TypeScript fixtures prove version bumps, exported-surface changes,
 * manifest tampering and missing sources fail closed, while comment/format-only
 * edits do not. No network access. The real-repository case uses the workspace
 * TypeScript install and the committed docs/architecture/contract-freeze.json.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-contract-freeze.mjs');
const SOURCE_REL = 'rpc/LubanFeatureRpcInterface.ts';

function run(args, options = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'contract-freeze-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const SOURCE = `// Synthetic fixture for the contract freeze gate.
export type FeatureMode = "add" | "remove";

export interface FeatureInput {
  kind: FeatureMode;
  value: number;
}

export abstract class LubanFeatureRpcInterface {
  public static interfaceName = "LubanFeatureRpcInterface";
  public static interfaceVersion = "1.85.0";

  public async applyFeatureOp(_input: FeatureInput): Promise<void> {
    return this.forward(arguments);
  }
}

export const FEATURE_LIMIT = 10;
`;

function manifestTemplate() {
  return {
    schemaVersion: 1,
    description: 'Synthetic contract freeze fixture.',
    hashAlgorithm: 'sha256',
    hashNormalization: 'typescript-exported-declarations-token-stream/v1',
    contracts: [
      {
        id: '@luban-cad/shared:LubanFeatureRpcInterface',
        package: '@luban-cad/shared',
        interfaceName: 'LubanFeatureRpcInterface',
        source: SOURCE_REL,
        interfaceVersion: '1.85.0',
        sourceHash: `sha256:${'0'.repeat(64)}`,
        note: 'fixture',
      },
    ],
  };
}

function writeFixture(t) {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'rpc'), { recursive: true });
  writeFileSync(join(dir, SOURCE_REL), SOURCE, 'utf8');
  const manifestPath = join(dir, 'contract-freeze.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifestTemplate(), null, 2)}\n`,
    'utf8',
  );
  return { dir, manifestPath };
}

function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('--update computes the real version/hash and the gate then passes', (t) => {
  const { dir, manifestPath } = writeFixture(t);

  const update = run([
    '--update',
    '--root',
    dir,
    '--manifest',
    manifestPath,
  ]);
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /contract freeze updated/);

  const manifest = readManifest(manifestPath);
  assert.equal(manifest.contracts[0].interfaceVersion, '1.85.0');
  assert.match(manifest.contracts[0].sourceHash, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(manifest.contracts[0].sourceHash, `sha256:${'0'.repeat(64)}`);

  const check = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /contract freeze OK/);
  assert.match(check.stdout, /LubanFeatureRpcInterface 1\.85\.0/);
});

test('comment and formatting-only edits are not drift', (t) => {
  const { dir, manifestPath } = writeFixture(t);
  assert.equal(
    run(['--update', '--root', dir, '--manifest', manifestPath]).status,
    0,
  );

  // Same tokens, different comments/whitespace/line breaks.
  const reformatted = `/**
 * Synthetic fixture for the contract freeze gate.
 * This JSDoc and the inline comments below must not affect the hash.
 */
export type FeatureMode = "add" | "remove";

export interface FeatureInput
{
    // A field comment.
    kind: FeatureMode;
    value: number;
}
export abstract class LubanFeatureRpcInterface
{
  /* static version */
  public static interfaceName = "LubanFeatureRpcInterface";
  public static interfaceVersion = "1.85.0";
  public async applyFeatureOp(_input: FeatureInput): Promise<void>
  {
    return this.forward(arguments);
  }
}
export const FEATURE_LIMIT = 10;
`;
  writeFileSync(join(dir, SOURCE_REL), reformatted, 'utf8');

  const check = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /contract freeze OK/);
});

test('interfaceVersion bump fails closed without a manifest update', (t) => {
  const { dir, manifestPath } = writeFixture(t);
  assert.equal(
    run(['--update', '--root', dir, '--manifest', manifestPath]).status,
    0,
  );

  writeFileSync(
    join(dir, SOURCE_REL),
    SOURCE.replace('"1.85.0"', '"1.86.0"'),
    'utf8',
  );

  const check = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /LubanFeatureRpcInterface\.interfaceVersion/);
  assert.match(check.stderr, /manifest 1\.85\.0, source 1\.86\.0/);
  assert.match(check.stderr, /sourceHash/);
  assert.match(check.stderr, /--update/);
});

test('exported type change fails closed without a manifest update', (t) => {
  const { dir, manifestPath } = writeFixture(t);
  assert.equal(
    run(['--update', '--root', dir, '--manifest', manifestPath]).status,
    0,
  );

  writeFileSync(
    join(dir, SOURCE_REL),
    SOURCE.replace('  value: number;', '  value: number;\n  extra?: string;'),
    'utf8',
  );

  const check = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /sourceHash/);
  assert.doesNotMatch(check.stderr, /interfaceVersion/);
});

test('manifest hash tampering fails closed', (t) => {
  const { dir, manifestPath } = writeFixture(t);
  assert.equal(
    run(['--update', '--root', dir, '--manifest', manifestPath]).status,
    0,
  );

  const manifest = readManifest(manifestPath);
  manifest.contracts[0].sourceHash = `sha256:${'0'.repeat(64)}`;
  writeJson(manifestPath, manifest);

  const check = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /sourceHash/);
  assert.match(check.stderr, /manifest sha256:0{64}/);
});

test('missing source and manifest are configuration failures (exit 2)', (t) => {
  const { dir, manifestPath } = writeFixture(t);
  assert.equal(
    run(['--update', '--root', dir, '--manifest', manifestPath]).status,
    0,
  );

  unlinkSync(join(dir, SOURCE_REL));
  const missingSource = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(missingSource.status, 2);
  assert.match(missingSource.stderr, /cannot read contract source/);

  const missingManifest = run([
    '--root',
    dir,
    '--manifest',
    join(dir, 'nope.json'),
  ]);
  assert.equal(missingManifest.status, 2);
  assert.match(missingManifest.stderr, /cannot read contract freeze manifest/);
});

test('invalid manifests fail closed with actionable diagnostics', (t) => {
  const { dir, manifestPath } = writeFixture(t);

  writeFileSync(manifestPath, '{"schemaVersion": 1,', 'utf8');
  const badJson = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(badJson.status, 2);
  assert.match(badJson.stderr, /not valid JSON/);

  const noFeature = manifestTemplate();
  noFeature.contracts[0].interfaceName = 'SomeOtherInterface';
  writeJson(manifestPath, noFeature);
  const missingFeature = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(missingFeature.status, 2);
  assert.match(
    missingFeature.stderr,
    /must include LubanFeatureRpcInterface/,
  );

  const escaping = manifestTemplate();
  escaping.contracts[0].source = '../outside.ts';
  writeJson(manifestPath, escaping);
  const escape = run(['--root', dir, '--manifest', manifestPath]);
  assert.equal(escape.status, 2);
  assert.match(escape.stderr, /repository-relative POSIX path/);
});

test('real repository contract matches the committed freeze manifest', () => {
  const check = run([]);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /contract freeze OK/);
  assert.match(check.stdout, /LubanFeatureRpcInterface 1\.85\.0/);
  assert.match(check.stdout, /LubanRpcInterface 1\.1\.0/);
});
