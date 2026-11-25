/**
 * Tests for the release-manifest evidence contract (G1 release plane).
 *
 *   node --test scripts/test/release-evidence.test.mjs
 *
 * Evidence entries reference local SBOM/signature/attestation/provenance
 * files. These tests only prove the local-file contract: declared paths,
 * canonical digests, and actual file bytes. They do not claim that any SBOM,
 * signature, attestation, or provenance statement is cryptographically valid
 * or release-ready. No network, docker, gh, or real release artifacts are used.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'release-manifest.mjs');
const SOURCE_COMMIT = 'b92a2d8fa4cf4ba5e3a01415edd956ff3622adb8';

const SBOM_TEXT = '{"spdxVersion":"SPDX-2.3","name":"synthetic-app"}\n';
const SIGNATURE_TEXT = 'synthetic-signature-bundle\n';
const ATTESTATION_TEXT = 'synthetic-in-toto-attestation\n';
const PROVENANCE_TEXT = '{"_type":"synthetic-provenance"}\n';
const ARTIFACT_TEXT = 'synthetic-release-artifact\n';
const NATIVE_TEXT = '{"nativeVersion":"synthetic"}\n';

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-evidence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, text) {
  const absolute = join(root, rel);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text, 'utf8');
  return absolute;
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function baseManifest() {
  return {
    schemaVersion: 1,
    tag: 'backend-20261125',
    sourceCommit: SOURCE_COMMIT,
    builtAt: '2026-11-25T00:00:00.000Z',
    contractVersion: '1.85.0',
    images: [
      {
        name: 'ghcr.io/chenjinxian/luban-web-public',
        digest: `sha256:${'1'.repeat(64)}`,
      },
    ],
  };
}

function evidenceEntry(kind, path, text) {
  return { kind, path, sha256: sha256(text) };
}

function writeReleaseFixture(root) {
  const sbom = write(root, 'release/sbom/app.spdx.json', SBOM_TEXT);
  const signature = write(root, 'release/sig/app.sig', SIGNATURE_TEXT);
  const provenance = write(root, 'release/prov/app.provenance.json', PROVENANCE_TEXT);
  return {
    sbom,
    signature,
    provenance,
    entries: [
      evidenceEntry('sbom', sbom, SBOM_TEXT),
      evidenceEntry('signature', signature, SIGNATURE_TEXT),
      evidenceEntry('provenance', provenance, PROVENANCE_TEXT),
    ],
  };
}

function buildWithEvidence(root, entries) {
  const out = join(root, 'release-manifest.json');
  const args = [
    'build',
    '--tag',
    'backend-20261125',
    '--source-commit',
    SOURCE_COMMIT,
    '--built-at',
    '2026-11-25T00:00:00.000Z',
    '--contract-version',
    '1.85.0',
    '--image',
    `ghcr.io/chenjinxian/luban-web-public=sha256:${'1'.repeat(64)}`,
    '--out',
    out,
  ];
  for (const entry of entries) {
    args.push('--evidence', `${entry.kind}=${entry.path}`);
  }
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  return { out, manifest: JSON.parse(readFileSync(out, 'utf8')) };
}

test('build --evidence hashes actual local bytes and sorts deterministically', (t) => {
  const root = tempDir(t);
  const { entries } = writeReleaseFixture(root);
  // Deliberately pass the entries out of canonical order.
  const shuffled = [entries[1], entries[2], entries[0]];
  const first = buildWithEvidence(root, shuffled);
  const second = buildWithEvidence(root, shuffled);

  assert.deepEqual(
    first.manifest.evidence.map((entry) => entry.kind),
    ['provenance', 'sbom', 'signature'],
    'evidence must be sorted by kind then path',
  );
  const expectedByKind = {
    sbom: SBOM_TEXT,
    signature: SIGNATURE_TEXT,
    provenance: PROVENANCE_TEXT,
  };
  for (const entry of first.manifest.evidence) {
    assert.match(entry.sha256, /^sha256:[0-9a-f]{64}$/);
    assert.equal(entry.sha256, sha256(expectedByKind[entry.kind]));
  }
  assert.equal(
    readFileSync(first.out, 'utf8'),
    readFileSync(second.out, 'utf8'),
    'the same evidence input must produce byte-identical manifests',
  );
});

test('build --input canonicalizes evidence digests and sorts entries', (t) => {
  const root = tempDir(t);
  const input = baseManifest();
  input.evidence = [
    { kind: 'signature', path: 'b.sig', sha256: '2'.repeat(64) },
    { kind: 'sbom', path: 'a.spdx.json', sha256: `sha256:${'A'.repeat(64)}` },
    { kind: 'provenance', path: 'c.prov.json', sha256: '3'.repeat(64) },
  ];
  const inputPath = write(
    root,
    'input.json',
    `${JSON.stringify(input, null, 2)}\n`,
  );
  const result = run(['build', '--input', inputPath]);
  assert.equal(result.status, 0, result.stderr);
  const built = JSON.parse(result.stdout);

  assert.deepEqual(
    built.evidence.map((entry) => entry.kind),
    ['provenance', 'sbom', 'signature'],
  );
  assert.equal(
    built.evidence.find((entry) => entry.kind === 'sbom').sha256,
    `sha256:${'a'.repeat(64)}`,
  );
  assert.equal(
    built.evidence.find((entry) => entry.kind === 'signature').sha256,
    `sha256:${'2'.repeat(64)}`,
  );
});

test('verify-files re-hashes evidence and fails closed on tampering and missing files', (t) => {
  const root = tempDir(t);
  const { entries, sbom } = writeReleaseFixture(root);
  const { out } = buildWithEvidence(root, entries);

  const ok = run([
    'verify-files',
    '--file',
    out,
    '--root',
    root,
    '--require-release-evidence',
  ]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /release manifest files OK: 3 file\(s\)/);
  assert.match(ok.stdout, /evidence\[0\] \(provenance\)/);
  assert.match(ok.stdout, /evidence\[1\] \(sbom\)/);
  assert.match(ok.stdout, /evidence\[2\] \(signature\)/);

  writeFileSync(sbom, 'tampered-sbom-bytes', 'utf8');
  const tampered = run([
    'verify-files',
    '--file',
    out,
    '--root',
    root,
    '--require-release-evidence',
  ]);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /evidence\[1\] \(sbom\).*digest mismatch/);
  assert.match(tampered.stderr, new RegExp(sha256(SBOM_TEXT)));
  assert.match(tampered.stderr, new RegExp(sha256('tampered-sbom-bytes')));

  rmSync(sbom);
  const missing = run(['verify-files', '--file', out, '--root', root]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /evidence\[1\] \(sbom\).*cannot read file/);
});

test('--require-release-evidence fails closed but plain verify stays backward compatible', (t) => {
  const root = tempDir(t);
  const { entries } = writeReleaseFixture(root);
  const plain = join(root, 'plain.json');
  writeFileSync(plain, `${JSON.stringify(baseManifest(), null, 2)}\n`, 'utf8');

  const withoutPolicy = run(['verify', '--file', plain]);
  assert.equal(withoutPolicy.status, 0, withoutPolicy.stderr);

  const noEvidence = run([
    'verify',
    '--file',
    plain,
    '--require-release-evidence',
  ]);
  assert.equal(noEvidence.status, 1);
  assert.match(noEvidence.stderr, /requires at least one "sbom" entry/);
  assert.match(
    noEvidence.stderr,
    /requires at least one "signature" or "attestation" entry/,
  );
  assert.match(noEvidence.stderr, /requires at least one "provenance" entry/);

  const sbomOnly = baseManifest();
  sbomOnly.evidence = [entries[0]];
  const sbomOnlyPath = join(root, 'sbom-only.json');
  writeFileSync(
    sbomOnlyPath,
    `${JSON.stringify(sbomOnly, null, 2)}\n`,
    'utf8',
  );
  const partial = run([
    'verify',
    '--file',
    sbomOnlyPath,
    '--require-release-evidence',
  ]);
  assert.equal(partial.status, 1);
  assert.doesNotMatch(partial.stderr, /requires at least one "sbom" entry/);
  assert.match(
    partial.stderr,
    /requires at least one "signature" or "attestation" entry/,
  );
  assert.match(partial.stderr, /requires at least one "provenance" entry/);

  // An attestation satisfies the signature/attestation requirement.
  const attestation = write(root, 'release/att/app.att', ATTESTATION_TEXT);
  const complete = baseManifest();
  complete.evidence = [
    entries[0],
    evidenceEntry('attestation', attestation, ATTESTATION_TEXT),
    entries[2],
  ];
  const completePath = join(root, 'complete.json');
  writeFileSync(
    completePath,
    `${JSON.stringify(complete, null, 2)}\n`,
    'utf8',
  );
  const passes = run([
    'verify',
    '--file',
    completePath,
    '--require-release-evidence',
  ]);
  assert.equal(passes.status, 0, passes.stderr);
});

test('evidence validation rejects unknown kinds, unknown fields, duplicates, empty arrays, and bad digests', (t) => {
  const root = tempDir(t);
  const { entries } = writeReleaseFixture(root);

  const unknownKind = baseManifest();
  unknownKind.evidence = [{ ...entries[0], kind: 'receipt' }];
  const unknownKindPath = write(
    root,
    'unknown-kind.json',
    `${JSON.stringify(unknownKind, null, 2)}\n`,
  );
  const unknownKindResult = run(['verify', '--file', unknownKindPath]);
  assert.equal(unknownKindResult.status, 1);
  assert.match(
    unknownKindResult.stderr,
    /evidence\[0\]\.kind: must be one of sbom, signature, attestation, provenance/,
  );

  const unknownField = baseManifest();
  unknownField.evidence = [{ ...entries[0], extra: true }];
  const unknownFieldPath = write(
    root,
    'unknown-field.json',
    `${JSON.stringify(unknownField, null, 2)}\n`,
  );
  const unknownFieldResult = run(['verify', '--file', unknownFieldPath]);
  assert.equal(unknownFieldResult.status, 1);
  assert.match(unknownFieldResult.stderr, /evidence\[0\]\.extra: unknown field/);

  const duplicate = baseManifest();
  duplicate.evidence = [entries[0], entries[0]];
  const duplicatePath = write(
    root,
    'duplicate.json',
    `${JSON.stringify(duplicate, null, 2)}\n`,
  );
  const duplicateResult = run(['verify', '--file', duplicatePath]);
  assert.equal(duplicateResult.status, 1);
  assert.match(duplicateResult.stderr, /duplicate evidence path/);

  const empty = baseManifest();
  empty.evidence = [];
  const emptyPath = write(
    root,
    'empty.json',
    `${JSON.stringify(empty, null, 2)}\n`,
  );
  const emptyResult = run(['verify', '--file', emptyPath]);
  assert.equal(emptyResult.status, 1);
  assert.match(
    emptyResult.stderr,
    /evidence: must contain at least one entry when present/,
  );

  const badDigest = baseManifest();
  badDigest.evidence = [{ ...entries[0], sha256: '0123456789abcdef' }];
  const badDigestPath = write(
    root,
    'bad-digest.json',
    `${JSON.stringify(badDigest, null, 2)}\n`,
  );
  const badDigestResult = run(['verify', '--file', badDigestPath]);
  assert.equal(badDigestResult.status, 1);
  assert.match(badDigestResult.stderr, /evidence\[0\]\.sha256: must be/);
});

test('build --evidence usage errors fail with exit code 2', (t) => {
  const root = tempDir(t);
  const args = [
    'build',
    '--tag',
    'backend-20261125',
    '--source-commit',
    SOURCE_COMMIT,
    '--contract-version',
    '1.85.0',
    '--image',
    `ghcr.io/chenjinxian/luban-web-public=sha256:${'1'.repeat(64)}`,
  ];

  const noSeparator = run([...args, '--evidence', 'sbom']);
  assert.equal(noSeparator.status, 2);
  assert.match(noSeparator.stderr, /--evidence must be <kind>=<path>/);

  const badKind = run([...args, '--evidence', `receipt=${join(root, 'x')}`]);
  assert.equal(badKind.status, 2);
  assert.match(badKind.stderr, /kind must be one of/);

  const missingFile = run([
    ...args,
    '--evidence',
    `sbom=${join(root, 'missing.spdx.json')}`,
  ]);
  assert.equal(missingFile.status, 2);
  assert.match(missingFile.stderr, /cannot read evidence file/);

  const input = join(root, 'input.json');
  writeFileSync(input, `${JSON.stringify(baseManifest(), null, 2)}\n`, 'utf8');
  const mixed = run(['build', '--input', input, '--evidence', 'sbom=x']);
  assert.equal(mixed.status, 2);
  assert.match(mixed.stderr, /cannot be combined with field flags/);
});

test('verify-files counts native provenance, artifacts, and evidence together', (t) => {
  const root = tempDir(t);
  const { entries } = writeReleaseFixture(root);
  const artifact = write(root, 'dist-out/app.tgz', ARTIFACT_TEXT);
  const native = write(root, 'native-provenance.json', NATIVE_TEXT);

  const manifest = baseManifest();
  manifest.nativeProvenance = {
    path: native,
    sha256: sha256(NATIVE_TEXT),
  };
  manifest.artifacts = [{ path: artifact, sha256: sha256(ARTIFACT_TEXT) }];
  manifest.evidence = entries;
  const manifestPath = join(root, 'all.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const result = run([
    'verify-files',
    '--file',
    manifestPath,
    '--root',
    root,
    '--require-release-evidence',
    '--require-native-provenance',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release manifest files OK: 5 file\(s\)/);
  assert.match(result.stdout, /nativeProvenance/);
  assert.match(result.stdout, /artifacts\[0\]/);
  assert.match(result.stdout, /evidence\[1\] \(signature\)/);
});

test('release evidence policy can be enforced by verify-files before hashing', (t) => {
  const root = tempDir(t);
  const artifact = write(root, 'dist-out/app.tgz', ARTIFACT_TEXT);
  const manifest = baseManifest();
  manifest.artifacts = [{ path: artifact, sha256: sha256(ARTIFACT_TEXT) }];
  const manifestPath = join(root, 'artifact-only.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const plain = run(['verify-files', '--file', manifestPath, '--root', root]);
  assert.equal(plain.status, 0, plain.stderr);

  const policy = run([
    'verify-files',
    '--file',
    manifestPath,
    '--root',
    root,
    '--require-release-evidence',
  ]);
  assert.equal(policy.status, 1);
  assert.match(policy.stderr, /requires at least one "sbom" entry/);
});
