#!/usr/bin/env node
/**
 * Release hygiene checker (G1 J3.3).
 *
 * Read-only and dependency-free. It makes industrial release risks visible
 * before the release gate and fails closed on regressions:
 *
 *   images.pinned       Docker/compose/GHCR references must not float on
 *                       `:latest` (or omit a tag entirely); a digest is best.
 *   release.profile     docker-compose.release.yml must exist in release mode,
 *                       use only required RELEASE_*_IMAGE variables mapped in
 *                       deploy/release/release-profile.json, publish only the
 *                       edge port, avoid local builds, and require every secret
 *                       from a RELEASE_* variable with no default. The release
 *                       manifest must carry a digest for every mapped image.
 *   build.scripts       Release/build scripts must not hardcode host absolute
 *                       paths, rely on the native pnpm store fallback, use
 *                       `tsc --noCheck`, or install dependencies without a
 *                       frozen lockfile.
 *   contract.shipped    The shipped dist-backend Feature RPC interfaceVersion
 *                       must match the public source (for example 1.85.0 vs
 *                       1.64.0 is a failure).
 *   manifest.release    Release mode requires release-manifest.json with native
 *                       provenance; tag/source-commit/native-artifact digests
 *                       must be consistent and GHCR images referenced by the
 *                       release configs must have a manifest digest.
 *   secrets.defaults    Release configs must not ship default/well-known
 *                       secrets (weak password/JWT defaults, the Azurite
 *                       well-known account key, provider tokens).
 *
 * Modes:
 *   local    Developer run. scope=local waivers apply. A missing shipped
 *            dist-backend or release manifest is reported as skipped.
 *   ci       Public CI. Same waiver policy as local, intended for a clean
 *            checkout (no dist-backend/release manifest).
 *   release  Release gate. Local waivers are IGNORED. The shipped
 *            dist-backend tree, release compose/profile, and release
 *            manifest/native provenance are required, and manifest artifact
 *            digests are verified. The development compose (docker-compose.yml)
 *            and dev-only scripts (quickstart/generate-env/.env.example) are
 *            not release configs: they stay local/CI debt and cannot satisfy
 *            the release profile. Release artifact scripts, workflows, the
 *            release compose/profile, Dockerfiles, and the manifest remain in
 *            scope.
 *
 * Waivers are recorded in scripts/release-hygiene-waivers.json (or --waiver).
 * They only cover local/CI debt; release mode never applies them. Expired
 * waivers are reported and stop covering the violation.
 *
 * Usage:
 *   node scripts/check-release-hygiene.mjs [--mode local|ci|release]
 *     [--format text|json|markdown] [--root <dir>] [--waiver <file>]
 *     [--manifest <file>] [--expected-source-commit <sha>]
 *     [--expected-tag <tag>] [--verify-artifact-digests]
 *     [--no-verify-artifact-digests] [--fail-on-warnings]
 *     [--backend-root <private luban-backend checkout>]
 *
 * Exit codes: 0 = no unwaived errors, 1 = violations, 2 = usage/config error.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateManifest, canonicalizeDigest } from './release-manifest.mjs';
import {
  RELEASE_COMPOSE_PATHS,
  RELEASE_PROFILE_PATH,
  isReleaseComposePath,
  loadReleaseProfile,
  validateReleaseCompose,
} from './release-profile-lib.mjs';

export const SCHEMA_VERSION = 1;
export const DEFAULT_WAIVER_PATH = 'scripts/release-hygiene-waivers.json';
export const DEFAULT_MANIFEST_PATH = 'release-manifest.json';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CHECK_IDS = [
  'images.pinned',
  'release.profile',
  'build.scripts',
  'contract.shipped',
  'provenance.public',
  'manifest.release',
  'secrets.defaults',
];

const MODES = ['local', 'ci', 'release'];
const FORMATS = ['text', 'json', 'markdown'];

const SOURCE_CONTRACT_PATH =
  'luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts';
const SHIPPED_CONTRACT_CANDIDATES = [
  'dist-backend/modeling-server/node_modules/@luban-cad/shared/dist/rpc/LubanFeatureRpcInterface.js',
  'dist-backend/modeling-server/node_modules/@luban-cad/shared/dist/rpc/LubanFeatureRpcInterface.ts',
  'dist-backend/modeling-server/node_modules/@luban-cad/shared/src/rpc/LubanFeatureRpcInterface.ts',
];
const SHIPPED_NATIVE_PROVENANCE =
  'dist-backend/modeling-server/node_modules/@bentley/imodeljs-native/native-provenance.json';

// Files that participate in preparing or publishing release artifacts. Keep
// this list explicit: broad recursive scans of itwinjs-core/node_modules are
// slow and produce noise unrelated to the release pipeline.
const RELEASE_SCRIPT_CANDIDATES = [
  'scripts/fetch-backend.ps1',
  'scripts/rebuild-web.ps1',
  'scripts/make-deploy-bundle.ps1',
  'scripts/quickstart.ps1',
  'scripts/dedupe-artifact-deps.ps1',
  'scripts/generate-env.ps1',
  'scripts/start-ms-host.ps1',
];

const BUILD_SCRIPT_CANDIDATES = [
  'scripts/fetch-backend.ps1',
  'scripts/rebuild-web.ps1',
  'scripts/make-deploy-bundle.ps1',
  'scripts/quickstart.ps1',
  'scripts/dedupe-artifact-deps.ps1',
];

const DOCKERFILE_CANDIDATES = [
  'Dockerfile',
  'luban-cad/apps/web/Dockerfile',
  'services/bff/Dockerfile',
];

// Developer convenience scripts. They are audited in local/CI (with waivers)
// but are never part of the release artifact path: the release profile pulls
// published images by digest instead of generating a dev .env or quickstart.
const DEV_ONLY_SCRIPTS = new Set([
  'scripts/quickstart.ps1',
  'scripts/generate-env.ps1',
]);

function scriptCandidatesForMode(mode, candidates) {
  return mode === 'release'
    ? candidates.filter((rel) => !DEV_ONLY_SCRIPTS.has(rel))
    : candidates;
}

// Read-only audit targets for the private backend checkout. They are never
// present in public CI; a release owner can pass --backend-root locally to get
// the same release-hygiene findings without modifying the private repo.
const PRIVATE_RELEASE_SCRIPTS = [
  'scripts/build-ms-dist.ps1',
  'scripts/build-images.ps1',
  'scripts/publish.ps1',
];
const PRIVATE_WORKFLOW_CANDIDATES = ['.github/workflows/ci.yml'];

const AZURITE_WELL_KNOWN_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

const WEAK_SECRET_VALUES = new Set([
  'secret',
  'secrets',
  'password',
  'passwd',
  'changeme',
  'change-me',
  'change_me',
  'admin',
  'root',
  'test',
  'testing',
  'dev',
  'development',
  'default',
  'example',
  'sample',
  'postgres',
  'supersecret',
  'your-secret',
  'your_secret',
  'your-password',
  'your_password',
  '123456',
  '12345678',
  '123456789',
]);

const SENSITIVE_KEY_RE =
  /(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCOUNT[_-]?KEY|PRIVATE[_-]?KEY|SIGNING[_-]?KEY)/i;
// Keys that look sensitive because of TOKEN/KEY but carry a non-secret setting
// (TTL, expiry, URL, port, ...). Without this, AUTH_*_TOKEN_EXPIRES_IN = "30d"
// would be reported as a weak secret.
const NON_SECRET_KEY_RE =
  /(?:EXPIRES?|EXPIRATION|TTL|TIMEOUT|URL|URI|PORT|HOST|NAME|USERNAME|ENDPOINT|LIMIT|INTERVAL|MINUTES|SECONDS|CACHE|LENGTH|SIZE|COUNT|ENABLED|MODE)/i;

const PROVIDER_TOKEN_PATTERNS = [
  { label: 'github-pat', re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { label: 'github-fine-grained-pat', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    label: 'private-key',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  { label: 'openai-key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { label: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

const HOST_PATH_RE =
  /(?:[A-Za-z]:\\[^"'`\r\n;|]+|\\\\[A-Za-z0-9._-]+\\[^"'`\r\n;|]+|\/Users\/[^/\s"'`]+|\/home\/[^/\s"'`]+)/g;
// Non-global twin for `.test()`; a global RegExp carries lastIndex state.
const HOST_PATH_TEST_RE = new RegExp(HOST_PATH_RE.source);

const CONTRACT_VERSION_RE = /interfaceVersion\s*=\s*["']([^"']+)["']/;
const DIGEST_RE = /^(?:sha256:)?([0-9a-fA-F]{64})$/;
const COMMIT_RE = /^[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRelPath(root, absolutePath) {
  const rel = relative(root, absolutePath);
  if (rel === '') return '.';
  return rel.split(sep).join('/');
}

function readText(path) {
  try {
    // Windows-generated JSON/provenance files often carry a UTF-8 BOM.
    return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return undefined;
  }
}

function listFiles(dir, predicate, depth = 0) {
  if (!existsSync(dir) || depth > 2) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute, predicate, depth + 1));
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

function discoverComposeFiles(root) {
  const files = [];
  let rootEntries = [];
  try {
    rootEntries = readdirSync(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of rootEntries) {
    if (
      entry.isFile() &&
      /^(?:docker-)?compose(?:\.[A-Za-z0-9._-]+)?\.ya?ml$/i.test(entry.name)
    ) {
      files.push(join(root, entry.name));
    }
  }
  const deploy = join(root, 'deploy');
  if (existsSync(deploy) && statSync(deploy).isDirectory()) {
    files.push(
      ...listFiles(deploy, (name) => /\.ya?ml$/i.test(name)).filter((file) =>
        /(?:^|[\\/])(?:docker-)?compose(?:\.[A-Za-z0-9._-]+)?\.ya?ml$/i.test(
          file,
        ),
      ),
    );
  }
  return [...new Set(files)].sort();
}

function discoverWorkflowFiles(root) {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  return listFiles(dir, (name) => /\.ya?ml$/i.test(name), 0).sort();
}

function discoverDeployConfigFiles(root) {
  const dir = join(root, 'deploy');
  if (!existsSync(dir)) return [];
  return listFiles(dir, (name) =>
    /\.(?:conf|template|ya?ml|json|env|ini|txt)$/i.test(name),
  ).sort();
}

function existingPaths(root, candidates) {
  return candidates
    .map((rel) => ({ rel, absolute: join(root, rel) }))
    .filter(({ absolute }) => existsSync(absolute) && statSync(absolute).isFile());
}

function privatePaths(ctx, candidates) {
  if (ctx.backendRoot === undefined) return [];
  return candidates
    .map((rel) => ({
      rel: `backend/${rel.replace(/\\/g, '/')}`,
      absolute: join(ctx.backendRoot, rel),
    }))
    .filter(({ absolute }) => existsSync(absolute) && statSync(absolute).isFile());
}

function trimImageToken(token) {
  // Docker command lines can be followed by prose/punctuation; keep only the
  // characters that can appear in an image reference.
  const match = /^[A-Za-z0-9._:@/${}-]+/.exec(String(token ?? ''));
  return match === null ? String(token ?? '') : match[0];
}

function isRegistryApiRef(ref) {
  // Registry REST endpoints (https://ghcr.io/v2/..., /token, /manifests,
  // /blobs) are not deployable image references.
  return (
    /^https?:\/\//i.test(ref) ||
    /\/(?:v2|token|manifests|blobs)(?:\/|$|\?)/i.test(ref)
  );
}

function imageRefWithoutTag(ref) {
  let value = ref.trim().replace(/^["']|["']$/g, '');
  const digestAt = value.indexOf('@');
  if (digestAt >= 0) value = value.slice(0, digestAt);
  const lastSlash = value.lastIndexOf('/');
  const tail = value.slice(lastSlash + 1);
  const colon = tail.indexOf(':');
  if (colon >= 0) {
    return value.slice(0, lastSlash + 1) + tail.slice(0, colon);
  }
  return value;
}

/**
 * Classify one image reference. `allowUntagged` is used for prose lines in
 * build scripts where an un-tagged GHCR path may be documentation rather than
 * a deployable reference.
 */
export function classifyImageRef(rawRef, { allowUntagged = false } = {}) {
  let ref = String(rawRef ?? '').trim().replace(/^["']|["']$/g, '');
  ref = ref.replace(/[),.;]+$/g, '');
  if (!ref) return { kind: 'skip', ref };
  if (ref.startsWith('#')) return { kind: 'skip', ref };
  if (ref.includes('@sha256:')) {
    return {
      kind: /@sha256:[0-9a-fA-F]{64}$/.test(ref) ? 'ok' : 'invalid-digest',
      ref,
    };
  }

  if (ref.includes('${')) {
    const expressions = [...ref.matchAll(/\$\{([^}]*)\}/g)];
    if (expressions.length === 0) {
      return { kind: 'variable-unpinned', ref };
    }
    let hasLatestDefault = false;
    let hasUnpinnedVariable = false;
    for (const match of expressions) {
      const expression = match[1];
      let defaultValue = '';
      const colonDash = expression.indexOf(':-');
      if (colonDash >= 0) {
        defaultValue = expression.slice(colonDash + 2);
      } else {
        const dash = expression.indexOf('-');
        if (dash >= 0) defaultValue = expression.slice(dash + 1);
      }
      if (!defaultValue) {
        hasUnpinnedVariable = true;
      } else if (defaultValue.toLowerCase() === 'latest') {
        hasLatestDefault = true;
      }
    }
    if (hasLatestDefault) return { kind: 'latest', ref };
    if (hasUnpinnedVariable) return { kind: 'variable-unpinned', ref };
    return { kind: 'ok', ref };
  }

  const lastSlash = ref.lastIndexOf('/');
  const tail = ref.slice(lastSlash + 1);
  const colon = tail.lastIndexOf(':');
  if (colon < 0) {
    return { kind: allowUntagged ? 'skip' : 'missing-tag', ref };
  }
  const tag = tail.slice(colon + 1);
  if (!tag) return { kind: 'missing-tag', ref };
  if (tag.toLowerCase() === 'latest') return { kind: 'latest', ref };
  return { kind: 'ok', ref };
}

function stripScriptComments(text) {
  // Blank out <# ... #> blocks without changing line numbers.
  const withoutBlocks = text.replace(/<#[\s\S]*?#>/g, (match) =>
    match.replace(/[^\r\n]/g, ' '),
  );
  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => (/^\s*#/.test(line) ? '' : line))
    .join('\n');
}

function makeViolation(check, fields) {
  return {
    check,
    severity: fields.severity ?? 'error',
    file: fields.file,
    line: fields.line,
    subject: fields.subject,
    message: fields.message,
    hint: fields.hint,
  };
}

function scanComposeImages(ctx) {
  const violations = [];
  const skipped = [];
  const seen = new Set();
  const add = (file, line, subject, kind, message, severity = 'error') => {
    const key = `${file}:${subject}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(
      makeViolation('images.pinned', {
        file,
        line,
        subject,
        message,
        severity,
        hint:
          'Pin a release tag or @sha256 digest. A dev-only exception must be recorded in the waiver file; release mode ignores it.',
      }),
    );
  };

  const composeFiles = new Set(
    discoverComposeFiles(ctx.root).map((file) =>
      normalizeRelPath(ctx.root, file),
    ),
  );
  const imageFiles = [
    ...discoverComposeFiles(ctx.root),
    ...discoverWorkflowFiles(ctx.root),
  ];
  for (const file of imageFiles) {
    const text = readText(file);
    if (text === undefined) continue;
    const rel = normalizeRelPath(ctx.root, file);
    if (composeFiles.has(rel)) {
      if (isReleaseComposePath(rel)) {
        skipped.push({
          check: 'images.pinned',
          message: `${rel} is the release profile; pinned by release.profile plus the release manifest`,
        });
        continue;
      }
      if (ctx.mode === 'release') {
        skipped.push({
          check: 'images.pinned',
          message: `${rel} is a development compose file and is not a release config`,
        });
        continue;
      }
    }
    text.split(/\r?\n/).forEach((rawLine, index) => {
      const match = /^\s*image:\s*(.+?)\s*(?:#.*)?$/.exec(rawLine);
      if (!match) return;
      const rawRef = match[1].trim();
      if (rawRef.startsWith('build:') || rawRef.startsWith('.')) return;
      const result = classifyImageRef(rawRef);
      const line = index + 1;
      if (result.kind === 'latest') {
        add(
          rel,
          line,
          result.ref,
          'latest',
          'image reference uses the floating ":latest" tag',
        );
      } else if (result.kind === 'missing-tag') {
        add(
          rel,
          line,
          result.ref,
          'missing-tag',
          'image reference has no tag or digest (implicitly "latest")',
        );
      } else if (result.kind === 'variable-unpinned') {
        add(
          rel,
          line,
          result.ref,
          'variable-unpinned',
          'image tag comes from an environment variable with no pinned default',
          ctx.mode === 'release' ? 'error' : 'warning',
        );
      } else if (result.kind === 'invalid-digest') {
        add(
          rel,
          line,
          result.ref,
          'invalid-digest',
          'image digest is malformed (expected @sha256:<64 hex>)',
        );
      }
    });
  }

  for (const { rel, absolute } of existingPaths(ctx.root, DOCKERFILE_CANDIDATES)) {
    const text = readText(absolute);
    if (text === undefined) continue;
    text.split(/\r?\n/).forEach((rawLine, index) => {
      const match = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(rawLine);
      if (!match) return;
      const result = classifyImageRef(match[1]);
      if (result.kind === 'skip' || result.kind === 'ok') return;
      const message =
        result.kind === 'latest'
          ? 'Dockerfile FROM uses the floating ":latest" tag'
          : result.kind === 'invalid-digest'
            ? 'Dockerfile FROM digest is malformed (expected @sha256:<64 hex>)'
            : 'Dockerfile FROM has no tag or digest (implicitly "latest")';
      add(rel, index + 1, result.ref, result.kind, message);
    });
  }

  const scriptRefs = [
    /\bghcr\.io\/[A-Za-z0-9._:@/${}-]+/g,
    /\bmcr\.microsoft\.com\/[A-Za-z0-9._:@/${}-]+/g,
    /\btiangong-kaiwu-[A-Za-z0-9._-]+:latest\b/g,
  ];
  const dockerCommandRefs = [
    /\bdocker\s+(?:push|pull|tag)\s+["']?([^\s"'`]+)/g,
    /(?:-t|--tag)\s+["']?([^\s"'`]+)/g,
  ];
  const scriptFiles = [
    ...existingPaths(ctx.root, RELEASE_SCRIPT_CANDIDATES),
    ...privatePaths(ctx, PRIVATE_RELEASE_SCRIPTS),
  ];
  for (const { rel, absolute } of scriptFiles) {
    const text = readText(absolute);
    if (text === undefined) continue;
    const code = stripScriptComments(text);
    code.split(/\r?\n/).forEach((rawLine, index) => {
      const candidates = new Set();
      const forcedLatest = new Set();
      for (const re of scriptRefs) {
        for (const match of rawLine.matchAll(re)) {
          candidates.add(match[0]);
        }
      }
      // Catch `docker push registry/app:latest` and `-t app:latest` even when
      // the registry is not GHCR/MCR. The literal :latest is authoritative
      // even when the image name is a variable (`${IMAGE}:latest`).
      for (const re of dockerCommandRefs) {
        for (const match of rawLine.matchAll(re)) {
          const token = trimImageToken(match[1]);
          if (/:latest\b/i.test(token)) {
            candidates.add(token);
            forcedLatest.add(token);
          }
        }
      }
      for (const candidate of candidates) {
        const rawRef = candidate.replace(/[),.;]+$/g, '');
        if (rawRef.includes('{') && !rawRef.includes('${')) continue;
        if (isRegistryApiRef(rawRef)) continue;
        if (forcedLatest.has(candidate)) {
          add(
            rel,
            index + 1,
            rawRef,
            'latest',
            'release/build script pushes/builds a floating ":latest" image tag',
          );
          continue;
        }
        const result = classifyImageRef(rawRef, { allowUntagged: true });
        if (result.kind === 'skip' || result.kind === 'ok') continue;
        const message =
          result.kind === 'latest'
            ? 'release/build script references the floating ":latest" tag'
            : result.kind === 'missing-tag'
              ? 'release/build script references an un-tagged image'
              : result.kind === 'invalid-digest'
                ? 'release/build script image digest is malformed (expected @sha256:<64 hex>)'
                : 'release/build script image tag comes from an environment variable with no pinned default';
        add(
          rel,
          index + 1,
          result.ref,
          result.kind,
          message,
          result.kind === 'variable-unpinned' && ctx.mode !== 'release'
            ? 'warning'
            : 'error',
        );
      }
    });
  }

  return { violations, skipped };
}

function scanReleaseProfile(ctx) {
  const violations = [];
  const skipped = [];
  const notes = [];
  const seen = new Set();
  const add = ({
    file,
    line,
    subject,
    message,
    hint,
    severity = 'error',
  }) => {
    const key = `${file}:${subject}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(
      makeViolation('release.profile', {
        file,
        line,
        subject,
        message,
        severity,
        hint,
      }),
    );
  };

  // Validate every compose file the images.pinned check classifies as a
  // release profile, so a deploy/release/*compose*.yml cannot escape both
  // checks.
  const composeFiles = discoverComposeFiles(ctx.root)
    .map((absolute) => ({
      absolute,
      rel: normalizeRelPath(ctx.root, absolute),
    }))
    .filter(({ rel }) => isReleaseComposePath(rel));
  const profile = loadReleaseProfile(ctx.root);

  if (!profile.exists) {
    if (composeFiles.length > 0) {
      add({
        file: RELEASE_PROFILE_PATH,
        subject: 'profile-missing',
        message:
          'release compose exists but deploy/release/release-profile.json is missing',
        hint:
          'Declare the image variables and required inputs; the profile is the release input contract.',
      });
    }
  } else {
    profile.errors.forEach((message, index) => {
      add({
        file: profile.path,
        subject: `profile-invalid:${index}`,
        message,
        hint:
          'Fix the profile; it contains names only and must never contain secret values.',
      });
    });
  }

  if (composeFiles.length === 0) {
    if (ctx.mode === 'release') {
      add({
        file: RELEASE_COMPOSE_PATHS[0],
        subject: 'release-compose-missing',
        message:
          'release mode requires the release compose profile (docker-compose.release.yml)',
        hint:
          'Do not deploy the development compose in release mode; add/fix the release profile and pin every image through the release manifest.',
      });
    } else {
      skipped.push({
        check: 'release.profile',
        message:
          'release compose is not present; release profile checks skipped',
      });
    }
    return { violations, skipped, notes };
  }

  const profileValid = profile.exists && profile.errors.length === 0;
  for (const { rel, absolute } of composeFiles) {
    const text = readText(absolute);
    if (text === undefined) {
      add({
        file: rel,
        subject: 'release-compose-unreadable',
        message: 'cannot read the release compose file',
        hint: 'Check file permissions and encoding.',
      });
      continue;
    }
    const issues = validateReleaseCompose(text, profile.value, {
      mode: ctx.mode,
      profileValid,
    });
    for (const issue of issues) {
      add({
        file: rel,
        line: issue.line,
        subject: issue.subject,
        message: issue.message,
        hint: issue.hint,
        severity: issue.severity,
      });
    }
  }

  return { violations, skipped, notes };
}

function collectManifestImageNames(ctx) {
  const names = new Set();
  const addGhcrRef = (rawRef) => {
    const result = classifyImageRef(rawRef, { allowUntagged: false });
    if (result.kind === 'skip') return;
    const name = imageRefWithoutTag(result.ref);
    if (
      name.startsWith('ghcr.io/') &&
      !name.endsWith('/') &&
      name.split('/').length >= 3
    ) {
      names.add(name);
    }
  };

  // The release profile is the authoritative list of images the release stack
  // consumes. It covers both GHCR and infrastructure registries (Docker Hub,
  // MCR), so every one needs a manifest digest in release mode.
  const profile = loadReleaseProfile(ctx.root);
  if (isPlainObject(profile.value?.images)) {
    for (const imageName of Object.values(profile.value.images)) {
      const name = imageRefWithoutTag(String(imageName));
      if (name.includes('/') && !name.endsWith('/')) names.add(name);
    }
  }

  const composeFiles = new Set(
    discoverComposeFiles(ctx.root).map((file) =>
      normalizeRelPath(ctx.root, file),
    ),
  );
  const imageFiles = [
    ...discoverComposeFiles(ctx.root),
    ...discoverWorkflowFiles(ctx.root),
  ];
  for (const file of imageFiles) {
    const rel = normalizeRelPath(ctx.root, file);
    if (composeFiles.has(rel)) {
      // Release compose images are required variables resolved from this
      // manifest; dev compose is not a release config in release mode.
      if (isReleaseComposePath(rel)) continue;
      if (ctx.mode === 'release') continue;
    }
    const text = readText(file);
    if (text === undefined) continue;
    for (const rawLine of text.split(/\r?\n/)) {
      const match = /^\s*image:\s*(.+?)\s*(?:#.*)?$/.exec(rawLine);
      if (match) addGhcrRef(match[1].trim());
    }
  }
  for (const { absolute } of existingPaths(
    ctx.root,
    scriptCandidatesForMode(ctx.mode, RELEASE_SCRIPT_CANDIDATES),
  )) {
    const text = readText(absolute);
    if (text === undefined) continue;
    const code = stripScriptComments(text);
    for (const match of code.matchAll(/\bghcr\.io\/[A-Za-z0-9._:@/${}-]+/g)) {
      const ref = match[0].replace(/[),.;]+$/g, '');
      if (ref.includes('{') && !ref.includes('${')) continue;
      if (isRegistryApiRef(ref)) continue;
      addGhcrRef(ref);
    }
  }
  return [...names].sort();
}

function scanBuildScripts(ctx) {
  const violations = [];
  const skipped = [];
  const seen = new Set();
  const add = (file, line, subject, message, hint, severity = 'error') => {
    const key = `${file}:${subject}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(
      makeViolation('build.scripts', {
        file,
        line,
        subject,
        message,
        severity,
        hint,
      }),
    );
  };

  const candidates = [
    ...scriptCandidatesForMode(ctx.mode, BUILD_SCRIPT_CANDIDATES),
    ...discoverWorkflowFiles(ctx.root).map((file) =>
      normalizeRelPath(ctx.root, file),
    ),
  ];
  const files = [
    ...existingPaths(ctx.root, candidates),
    ...privatePaths(ctx, [
      ...PRIVATE_RELEASE_SCRIPTS,
      ...PRIVATE_WORKFLOW_CANDIDATES,
    ]),
  ];

  for (const { rel, absolute } of files) {
    const text = readText(absolute);
    if (text === undefined) continue;
    const code = stripScriptComments(text);
    const lines = code.split(/\r?\n/);

    lines.forEach((rawLine, index) => {
      const line = index + 1;
      for (const match of rawLine.matchAll(HOST_PATH_RE)) {
        const path = match[0].replace(/[),.;]+$/g, '');
        const offset = match.index ?? 0;
        // Avoid matching a drive-like fragment inside an identifier
        // (`link:...`, `Env:\...`). A genuine host path is preceded by
        // whitespace, a quote, an assignment operator, or starts the line.
        if (offset > 0 && /[A-Za-z0-9_]/.test(rawLine[offset - 1])) continue;
        add(
          rel,
          line,
          `host-path:${path}`,
          'release/build script hardcodes a host absolute path',
          'Derive paths from the script/repository root or accept them as a required parameter.',
        );
      }

      if (/\bAllowStoreNativeFallback\b/.test(rawLine)) {
        add(
          rel,
          line,
          'store-fallback:AllowStoreNativeFallback',
          'release/build script can silently fall back to the pnpm store native binary',
          'Build native from the pinned imodel-native checkout, or record an explicit release owner approval.',
        );
      }
      if (/\b(?:storePkg|storeDir)\b/.test(rawLine)) {
        add(
          rel,
          line,
          'store-fallback:store-package',
          'release/build script reads the native binary from the pnpm store',
          'Use the pinned native Delivery output and keep provenance tied to imodel-native HEAD.',
        );
      }
      if (/imodeljs-native@/.test(rawLine)) {
        add(
          rel,
          line,
          'store-fallback:imodeljs-native-store',
          'release/build script resolves imodeljs-native from a versioned store path',
          'Build the native library from the pinned source instead of a shared store.',
        );
      }

      if (/\btsc\b[^\r\n]*--noCheck\b/.test(rawLine)) {
        add(
          rel,
          line,
          'tsc-noCheck',
          'release/build script compiles with tsc --noCheck (type errors are not gated)',
          'Type-check the release source, or record an explicit exception with an owner and expiry.',
        );
      }

      if (/\bnpm\s+(?:install|i|add)\b/.test(rawLine)) {
        add(
          rel,
          line,
          'lockless-install:npm-install',
          'release/build script runs npm install without a frozen/locked install',
          'Use npm ci (with a committed lockfile) or a frozen pnpm lockfile install.',
        );
      }
      if (
        /\bpnpm(?:@\d+)?\s+(?:install|i|add)\b/.test(rawLine) &&
        !/--frozen-lockfile\b/.test(rawLine)
      ) {
        add(
          rel,
          line,
          'lockless-install:pnpm-install',
          'release/build script runs pnpm install/add without --frozen-lockfile',
          'Install release dependencies with --frozen-lockfile and a committed lockfile.',
        );
      }
    });
  }

  return { violations, skipped };
}

function readContractVersion(text) {
  const match = CONTRACT_VERSION_RE.exec(text);
  return match ? match[1] : undefined;
}

function scanShippedContract(ctx) {
  const violations = [];
  const skipped = [];
  const sourceAbsolute = join(ctx.root, SOURCE_CONTRACT_PATH);
  const sourceText = readText(sourceAbsolute);
  if (sourceText === undefined) {
    violations.push(
      makeViolation('contract.shipped', {
        file: SOURCE_CONTRACT_PATH,
        subject: 'source-contract-missing',
        message: 'cannot read the source Feature RPC contract',
        severity: ctx.mode === 'release' ? 'error' : 'warning',
        hint: 'Build the public shared package first; release mode treats a missing source contract as a failure.',
      }),
    );
    return { violations, skipped, sourceVersion: undefined };
  }
  const sourceVersion = readContractVersion(sourceText);
  if (sourceVersion === undefined) {
    violations.push(
      makeViolation('contract.shipped', {
        file: SOURCE_CONTRACT_PATH,
        subject: 'source-contract-unparseable',
        message: 'source Feature RPC contract has no static interfaceVersion',
        severity: ctx.mode === 'release' ? 'error' : 'warning',
        hint: 'Keep `public static interfaceVersion = "x.y.z"` in LubanFeatureRpcInterface.',
      }),
    );
    return { violations, skipped, sourceVersion: undefined };
  }

  const shipped = SHIPPED_CONTRACT_CANDIDATES.find((rel) =>
    existsSync(join(ctx.root, rel)),
  );
  if (shipped === undefined) {
    if (ctx.mode === 'release') {
      violations.push(
        makeViolation('contract.shipped', {
          file: 'dist-backend',
          subject: 'shipped-contract-missing',
          message:
            'release mode requires an unpacked dist-backend modeling-server tree',
          hint: 'Run scripts/fetch-backend.ps1 (or unpack the release tgz) before the release gate.',
        }),
      );
    } else {
      skipped.push({
        check: 'contract.shipped',
        message:
          'dist-backend is not present; source vs shipped contract check skipped in non-release mode',
      });
    }
    return { violations, skipped, sourceVersion };
  }

  const shippedText = readText(join(ctx.root, shipped));
  const shippedVersion = shippedText && readContractVersion(shippedText);
  if (!shippedVersion) {
    violations.push(
      makeViolation('contract.shipped', {
        file: shipped,
        subject: 'shipped-contract-unparseable',
        message:
          'shipped dist-backend Feature RPC contract has no static interfaceVersion',
        hint: 'Rebuild the backend artifact from the public shared package and republish it.',
      }),
    );
    return { violations, skipped, sourceVersion };
  }

  if (sourceVersion !== shippedVersion) {
    violations.push(
      makeViolation('contract.shipped', {
        file: shipped,
        subject: `mismatch:${sourceVersion}->${shippedVersion}`,
        message: `shipped dist-backend Feature RPC contract is ${shippedVersion}, source is ${sourceVersion}`,
        hint:
          'Republish modeling-server from a backend build that consumes the current public shared package; do not ship a stale contract.',
      }),
    );
  }

  return { violations, skipped, sourceVersion };
}

function scanPublicProvenance(ctx) {
  const violations = [];
  const skipped = [];
  const absolute = join(ctx.root, SHIPPED_NATIVE_PROVENANCE);
  if (!existsSync(absolute)) {
    if (ctx.mode === 'release' && existsSync(join(ctx.root, 'dist-backend'))) {
      violations.push(
        makeViolation('provenance.public', {
          file: SHIPPED_NATIVE_PROVENANCE,
          subject: 'shipped-provenance-missing',
          message:
            'shipped dist-backend is missing native-provenance.json (release evidence cannot be audited)',
          hint:
            'Emit a provenance record for the shipped native binary; keep private build details in the private release record.',
        }),
      );
    } else {
      skipped.push({
        check: 'provenance.public',
        message:
          'shipped native provenance is not present; public-boundary check skipped',
      });
    }
    return { violations, skipped };
  }

  const text = readText(absolute);
  if (text === undefined) {
    violations.push(
      makeViolation('provenance.public', {
        file: SHIPPED_NATIVE_PROVENANCE,
        subject: 'shipped-provenance-unreadable',
        message: 'cannot read shipped native-provenance.json',
      }),
    );
    return { violations, skipped };
  }
  let provenance;
  try {
    provenance = JSON.parse(text);
  } catch {
    violations.push(
      makeViolation('provenance.public', {
        file: SHIPPED_NATIVE_PROVENANCE,
        subject: 'shipped-provenance-invalid-json',
        message: 'shipped native-provenance.json is not valid JSON',
      }),
    );
    return { violations, skipped };
  }

  const severity = ctx.mode === 'release' ? 'error' : 'warning';
  if (
    isPlainObject(provenance) &&
    typeof provenance.storePackagePath === 'string' &&
    HOST_PATH_TEST_RE.test(provenance.storePackagePath)
  ) {
    violations.push(
      makeViolation('provenance.public', {
        file: SHIPPED_NATIVE_PROVENANCE,
        subject: 'native-provenance:host-path',
        message:
          'shipped native provenance exposes a host absolute store path',
        severity,
        hint:
          'Publish a sanitized provenance record (version/digest/tag); keep host paths and private build logs in the private release record.',
      }),
    );
  }

  const privateEvidence = [
    'storePackagePath',
    'imodelNativeHead',
    'imodelNativeDescribe',
    'requiredTagCommit',
    'storeDevbuildMtime',
  ].filter(
    (key) => isPlainObject(provenance) && provenance[key] !== undefined,
  );
  if (privateEvidence.length > 0) {
    violations.push(
      makeViolation('provenance.public', {
        file: SHIPPED_NATIVE_PROVENANCE,
        subject: 'native-provenance:private-evidence',
        message:
          'shipped native provenance exposes private native build evidence ' +
          `(${privateEvidence.join(', ')})`,
        severity,
        hint:
          'Split public artifact provenance from the private release record; the public boundary must not expose private repo commits or host paths.',
      }),
    );
  }

  return { violations, skipped };
}

function gitHead(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    return COMMIT_RE.test(out) ? out : undefined;
  } catch {
    return undefined;
  }
}

function gitExactTag(root) {
  try {
    const out = execFileSync(
      'git',
      ['-C', root, 'describe', '--tags', '--exact-match', 'HEAD'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      },
    ).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function newestBackendArtifactTag(root) {
  const dir = join(root, 'dist-backend');
  if (!existsSync(dir)) return undefined;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const artifacts = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = /^modeling-server-win-x64-(.+)\.tgz$/.exec(entry.name);
      if (match === null) return undefined;
      try {
        return {
          tag: match[1],
          mtimeMs: statSync(join(dir, entry.name)).mtimeMs,
        };
      } catch {
        return undefined;
      }
    })
    .filter((artifact) => artifact !== undefined)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return artifacts.length === 0 ? undefined : artifacts[0].tag;
}

function resolveWithinRoot(root, relPath) {
  const absolute = resolve(root, relPath);
  const rel = relative(root, absolute);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return undefined;
  }
  return absolute;
}

function scanManifestFile(ctx) {
  const violations = [];
  const skipped = [];
  const notes = [];
  const manifestAbsolute = ctx.manifestPath;
  if (!existsSync(manifestAbsolute)) {
    if (ctx.mode === 'release') {
      violations.push(
        makeViolation('manifest.release', {
          file: normalizeRelPath(ctx.root, manifestAbsolute),
          subject: 'manifest-missing',
          message:
            'release gate requires release-manifest.json (with native provenance)',
          hint:
            'Generate and archive a real manifest from registry digests and artifact bytes; do not hand-write placeholder digests.',
        }),
      );
    } else {
      skipped.push({
        check: 'manifest.release',
        message: 'release manifest is not present; manifest checks skipped',
      });
    }
    return { violations, skipped, notes };
  }

  const manifestRel = normalizeRelPath(ctx.root, manifestAbsolute);
  const text = readText(manifestAbsolute);
  if (text === undefined) {
    violations.push(
      makeViolation('manifest.release', {
        file: manifestRel,
        subject: 'manifest-unreadable',
        message: 'cannot read the release manifest',
      }),
    );
    return { violations, skipped, notes };
  }
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    violations.push(
      makeViolation('manifest.release', {
        file: manifestRel,
        subject: 'manifest-invalid-json',
        message: 'release manifest is not valid JSON',
      }),
    );
    return { violations, skipped, notes };
  }

  let expectedSourceCommit = ctx.expectedSourceCommit;
  if (expectedSourceCommit === undefined && ctx.mode === 'release') {
    expectedSourceCommit = gitHead(ctx.root);
    if (expectedSourceCommit === undefined) {
      violations.push(
        makeViolation('manifest.release', {
          file: manifestRel,
          subject: 'source-commit-unverified',
          message:
            'release mode cannot resolve git HEAD to verify manifest sourceCommit',
          severity: 'warning',
          hint: 'Run the release gate from a full git checkout or pass --expected-source-commit.',
        }),
      );
    }
  }

  const errors = validateManifest(manifest, {
    expectedSourceCommit,
    expectedContractVersion: ctx.sourceVersion,
    requireNativeProvenance: ctx.mode === 'release',
  });
  for (const error of errors) {
    violations.push(
      makeViolation('manifest.release', {
        file: manifestRel,
        subject: 'manifest-invalid',
        message: error,
        hint:
          'Fix the manifest or regenerate it from real build/registry outputs. Release mode does not waive manifest errors.',
      }),
    );
  }

  let expectedTag = ctx.expectedTag;
  if (expectedTag === undefined && ctx.mode === 'release') {
    expectedTag = gitExactTag(ctx.root);
    if (expectedTag === undefined) {
      violations.push(
        makeViolation('manifest.release', {
          file: manifestRel,
          subject: 'tag-unverified',
          message:
            'release mode cannot resolve an exact git tag to verify the manifest tag',
          severity: 'warning',
          hint: 'Run the release gate at the tagged release commit or pass --expected-tag.',
        }),
      );
    }
  }
  if (
    expectedTag !== undefined &&
    typeof manifest.tag === 'string' &&
    manifest.tag !== expectedTag
  ) {
    violations.push(
      makeViolation('manifest.release', {
        file: manifestRel,
        subject: 'tag-mismatch',
        message: `manifest tag is "${manifest.tag}", expected "${expectedTag}"`,
      }),
    );
  }

  const artifactTag = newestBackendArtifactTag(ctx.root);
  if (
    artifactTag !== undefined &&
    typeof manifest.tag === 'string' &&
    manifest.tag !== artifactTag
  ) {
    violations.push(
      makeViolation('manifest.release', {
        file: manifestRel,
        subject: 'artifact-tag-mismatch',
        message: `manifest tag is "${manifest.tag}", newest backend artifact is "${artifactTag}"`,
        severity: ctx.mode === 'release' ? 'error' : 'warning',
        hint:
          'Build/place the tgz for the manifest tag before running the release gate; do not mix artifacts from different releases.',
      }),
    );
  }

  if (isPlainObject(manifest.nativeProvenance)) {
    const declaredPath = manifest.nativeProvenance.path;
    const declaredDigest = canonicalizeDigest(manifest.nativeProvenance.sha256);
    if (typeof declaredPath === 'string') {
      if (isAbsolute(declaredPath)) {
        violations.push(
          makeViolation('manifest.release', {
            file: manifestRel,
            subject: 'provenance-absolute-path',
            message:
              'nativeProvenance.path is an absolute host path; release manifests must be reproducible',
          }),
        );
      } else {
        const absolute = resolveWithinRoot(ctx.root, declaredPath);
        if (absolute === undefined) {
          violations.push(
            makeViolation('manifest.release', {
              file: manifestRel,
              subject: 'provenance-path-escape',
              message:
                'nativeProvenance.path escapes the repository root',
            }),
          );
        } else if (!existsSync(absolute)) {
          violations.push(
            makeViolation('manifest.release', {
              file: manifestRel,
              subject: 'provenance-missing-file',
              message: `nativeProvenance file is missing: ${declaredPath}`,
            }),
          );
        } else if (
          DIGEST_RE.test(String(manifest.nativeProvenance.sha256 ?? ''))
        ) {
          // Invalid digest format is already reported by validateManifest().
          const actual = sha256File(absolute);
          if (actual !== declaredDigest) {
            violations.push(
              makeViolation('manifest.release', {
                file: manifestRel,
                subject: 'provenance-digest-mismatch',
                message: `nativeProvenance digest mismatch (declared ${declaredDigest}, actual ${actual})`,
              }),
            );
          }
        }
      }
    }
  }

  if (ctx.verifyArtifactDigests && Array.isArray(manifest.artifacts)) {
    manifest.artifacts.forEach((artifact, index) => {
      if (!isPlainObject(artifact) || typeof artifact.path !== 'string') return;
      const declaredDigest = canonicalizeDigest(artifact.sha256);
      if (!DIGEST_RE.test(String(artifact.sha256 ?? ''))) return;
      if (isAbsolute(artifact.path)) {
        violations.push(
          makeViolation('manifest.release', {
            file: manifestRel,
            subject: `artifact-absolute-path:${index}`,
            message: `artifacts[${index}].path is an absolute host path`,
          }),
        );
        return;
      }
      const absolute = resolveWithinRoot(ctx.root, artifact.path);
      if (absolute === undefined) {
        violations.push(
          makeViolation('manifest.release', {
            file: manifestRel,
            subject: `artifact-path-escape:${index}`,
            message: `artifacts[${index}].path escapes the repository root`,
          }),
        );
        return;
      }
      if (!existsSync(absolute)) {
        violations.push(
          makeViolation('manifest.release', {
            file: manifestRel,
            subject: `artifact-missing:${index}`,
            message: `artifacts[${index}] file is missing: ${artifact.path}`,
          }),
        );
        return;
      }
      const actual = sha256File(absolute);
      if (actual !== declaredDigest) {
        violations.push(
          makeViolation('manifest.release', {
            file: manifestRel,
            subject: `artifact-digest-mismatch:${index}`,
            message: `artifacts[${index}] digest mismatch (declared ${declaredDigest}, actual ${actual})`,
          }),
        );
      }
    });
  } else if (ctx.mode === 'release') {
    if (Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0) {
      notes.push(
        'artifact digests were not re-hashed (enable --verify-artifact-digests)',
      );
    } else {
      violations.push(
        makeViolation('manifest.release', {
          file: manifestRel,
          subject: 'artifacts-missing',
          message:
            'manifest declares no release artifacts; the backend tgz/deploy bundle cannot be traced',
          severity: 'warning',
          hint:
            'Declare the released artifact paths and SHA-256 values; verify with --verify-artifact-digests.',
        }),
      );
    }
  }

  const manifestImageNames = new Set();
  if (Array.isArray(manifest.images)) {
    for (const image of manifest.images) {
      if (isPlainObject(image) && typeof image.name === 'string') {
        manifestImageNames.add(imageRefWithoutTag(image.name));
      }
    }
  }
  const referencedImages = collectManifestImageNames(ctx);
  for (const name of referencedImages) {
    if (!manifestImageNames.has(name)) {
      violations.push(
        makeViolation('manifest.release', {
          file: manifestRel,
          subject: `image-missing-digest:${name}`,
          message: `release config references ${name} but the manifest has no digest for it`,
          severity: ctx.mode === 'release' ? 'error' : 'warning',
          hint:
            'Collect the registry digest for every image used by the release profile and add it to images[].',
        }),
      );
    }
  }
  for (const name of manifestImageNames) {
    if (!referencedImages.includes(name)) {
      violations.push(
        makeViolation('manifest.release', {
          file: manifestRel,
          subject: `image-not-referenced:${name}`,
          message: `manifest lists ${name} but no release profile/script references it`,
          severity: 'warning',
          hint:
            'Check for a typo or a removed service; an unreferenced digest is usually a stale manifest.',
        }),
      );
    }
  }

  return { violations, skipped, notes };
}

function isWeakSecretValue(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  if (normalized === '') return false;
  if (/^[$<{]/.test(normalized)) return false;
  if (WEAK_SECRET_VALUES.has(normalized)) return true;
  // Short numeric values are never acceptable secrets. Do not use a generic
  // length rule here: PowerShell generator statements such as
  // `'AUTH_JWT_SECRET' = New-Hex 32` would otherwise be false positives.
  if (/^\d{1,7}$/.test(normalized)) return true;
  // Common weak words with an optional numeric suffix (dev123, admin1, ...),
  // and short all-lowercase literals. `New-Hex` is deliberately not matched.
  if (/^(?:dev|test|admin|root|pass|pwd|secret)[-_]?\d*$/i.test(normalized)) {
    return true;
  }
  if (/^[a-z]{1,7}$/.test(normalized)) return true;
  return false;
}

function scanSecrets(ctx) {
  const violations = [];
  const skipped = [];
  const seen = new Set();
  const add = (file, line, subject, message, hint) => {
    const key = `${file}:${subject}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push(
      makeViolation('secrets.defaults', {
        file,
        line,
        subject,
        message,
        hint,
      }),
    );
  };

  const composeFiles = discoverComposeFiles(ctx.root).filter((file) => {
    if (ctx.mode !== 'release') return true;
    // In release mode only the release profile is a release config; the dev
    // stack's local secrets/defaults stay a local/CI waiver concern.
    return isReleaseComposePath(normalizeRelPath(ctx.root, file));
  });
  const files = [
    ...composeFiles,
    ...discoverDeployConfigFiles(ctx.root),
    ...discoverWorkflowFiles(ctx.root),
    ...existingPaths(
      ctx.root,
      scriptCandidatesForMode(ctx.mode, RELEASE_SCRIPT_CANDIDATES),
    ).map(({ absolute }) => absolute),
    ...existingPaths(ctx.root, DOCKERFILE_CANDIDATES).map(
      ({ absolute }) => absolute,
    ),
  ];
  if (ctx.backendRoot !== undefined) {
    files.push(
      ...privatePaths(ctx, PRIVATE_RELEASE_SCRIPTS).map(
        ({ absolute }) => absolute,
      ),
    );
  }
  if (ctx.mode !== 'release') {
    const envExample = join(ctx.root, '.env.example');
    if (existsSync(envExample)) files.push(envExample);
  }

  for (const absolute of [...new Set(files)]) {
    const text = readText(absolute);
    if (text === undefined) continue;
    const rel = normalizeRelPath(ctx.root, absolute);
    text.split(/\r?\n/).forEach((rawLine, index) => {
      if (/^\s*#/.test(rawLine)) return;
      const line = index + 1;

      if (rawLine.includes(AZURITE_WELL_KNOWN_KEY)) {
        add(
          rel,
          line,
          'well-known:storage-account-key',
          'well-known Azurite development account key is used as a default',
          'Use a real secret from the deployment secret store; local Azurite defaults must be waived or overridden at deploy time.',
        );
      }

      for (const match of rawLine.matchAll(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-|-|\?)([^}]*)\}/g,
      )) {
        const key = match[1];
        const operator = match[2];
        const value = match[3];
        if (operator === '?') continue;
        if (
          SENSITIVE_KEY_RE.test(key) &&
          !NON_SECRET_KEY_RE.test(key) &&
          isWeakSecretValue(value) &&
          !value.includes(AZURITE_WELL_KNOWN_KEY)
        ) {
          add(
            rel,
            line,
            `weak-default:${key.toUpperCase()}`,
            `weak default secret for ${key}`,
            'Require the secret to be supplied by the environment/secret store; remove the fallback default.',
          );
        }
      }

      // Match assignments anywhere in the line so Dockerfile `ENV KEY=value`
      // and YAML `- KEY: value` forms are covered, not just column 0.
      for (const assignment of rawLine.matchAll(
        /(?:^|[\s"'-])([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*["']?([^"'\s#]+)/g,
      )) {
        const key = assignment[1];
        const value = assignment[2];
        if (
          SENSITIVE_KEY_RE.test(key) &&
          !NON_SECRET_KEY_RE.test(key) &&
          !value.startsWith('$') &&
          !value.includes(AZURITE_WELL_KNOWN_KEY) &&
          isWeakSecretValue(value)
        ) {
          add(
            rel,
            line,
            `weak-default:${key.toUpperCase()}`,
            `weak default secret for ${key}`,
            'Require the secret to be supplied by the environment/secret store; remove the fallback default.',
          );
        }
      }

      for (const pattern of PROVIDER_TOKEN_PATTERNS) {
        if (pattern.re.test(rawLine)) {
          add(
            rel,
            line,
            `provider-token:${pattern.label}`,
            `release config appears to contain a ${pattern.label} credential`,
            'Remove the credential, rotate it, and load it from the secret store at deploy time.',
          );
        }
      }
    });
  }

  return { violations, skipped };
}

function waiverApplies(waiver, mode) {
  // Release mode is deliberately strict: dev/local waivers never apply.
  return mode !== 'release' && waiver.scope === 'local';
}

export function validateWaivers(value) {
  const errors = [];
  if (!isPlainObject(value)) return ['waiver file: must be a JSON object'];
  for (const key of Object.keys(value)) {
    if (!['schemaVersion', 'description', 'waivers'].includes(key)) {
      errors.push(`waiver file.${key}: unknown field`);
    }
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion: must be ${SCHEMA_VERSION}`);
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    errors.push('description: must be a string');
  }
  if (!Array.isArray(value.waivers)) {
    errors.push('waivers: must be an array');
    return errors;
  }
  const ids = new Set();
  value.waivers.forEach((waiver, index) => {
    const path = `waivers[${index}]`;
    if (!isPlainObject(waiver)) {
      errors.push(`${path}: must be an object`);
      return;
    }
    for (const key of Object.keys(waiver)) {
      if (
        ![
          'id',
          'check',
          'file',
          'subject',
          'reason',
          'scope',
          'expires',
        ].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    if (typeof waiver.id !== 'string' || waiver.id.trim() === '') {
      errors.push(`${path}.id: required non-empty string`);
    } else if (ids.has(waiver.id)) {
      errors.push(`${path}.id: duplicate id`);
    } else {
      ids.add(waiver.id);
    }
    if (waiver.check !== undefined && !CHECK_IDS.includes(waiver.check)) {
      errors.push(
        `${path}.check: must be one of ${CHECK_IDS.join(', ')}`,
      );
    }
    if (waiver.file === undefined) {
      errors.push(`${path}.file: required (scope each waiver to one file)`);
    } else if (typeof waiver.file !== 'string' || waiver.file === '') {
      errors.push(`${path}.file: must be a non-empty string`);
    } else if (isAbsolute(waiver.file) || waiver.file.includes('..')) {
      errors.push(`${path}.file: must be repository-relative without ".."`);
    }
    if (waiver.subject !== undefined) {
      if (typeof waiver.subject !== 'string') {
        errors.push(`${path}.subject: must be a string`);
      } else if (
        waiver.subject.includes(AZURITE_WELL_KNOWN_KEY) ||
        PROVIDER_TOKEN_PATTERNS.some((pattern) =>
          pattern.re.test(waiver.subject),
        )
      ) {
        errors.push(
          `${path}.subject: must not contain secret material (the waiver file is public)`,
        );
      }
    }
    if (typeof waiver.reason !== 'string' || waiver.reason.trim() === '') {
      errors.push(`${path}.reason: required non-empty string`);
    }
    if (waiver.scope !== undefined && waiver.scope !== 'local') {
      errors.push(
        `${path}.scope: only "local" is supported (release mode never waives)`,
      );
    }
    if (waiver.expires === undefined) {
      errors.push(`${path}.expires: required (waivers must expire)`);
    } else if (
      typeof waiver.expires !== 'string' ||
      !ISO_DATE_RE.test(waiver.expires) ||
      Number.isNaN(Date.parse(`${waiver.expires}T00:00:00Z`))
    ) {
      errors.push(`${path}.expires: must be a YYYY-MM-DD date`);
    }
  });
  return errors;
}

export function loadWaivers(waiverPath, { explicit = false } = {}) {
  if (!existsSync(waiverPath)) {
    if (explicit) {
      throw new ConfigError(`waiver file not found: ${waiverPath}`);
    }
    return [];
  }
  const text = readText(waiverPath);
  if (text === undefined) {
    throw new ConfigError(`cannot read waiver file: ${waiverPath}`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ConfigError(`waiver file is not valid JSON: ${waiverPath}`);
  }
  const errors = validateWaivers(value);
  if (errors.length > 0) {
    throw new ConfigError(
      `waiver file is invalid (${errors.length} error(s)):\n` +
        errors.map((error) => `  - ${error}`).join('\n'),
    );
  }
  return value.waivers.map((waiver) => ({
    id: waiver.id,
    check: waiver.check,
    file: waiver.file,
    subject: waiver.subject,
    reason: waiver.reason,
    scope: waiver.scope ?? 'local',
    expires: waiver.expires,
  }));
}

function waiverMatches(waiver, violation) {
  if (waiver.check !== undefined && waiver.check !== violation.check) {
    return false;
  }
  if (waiver.file !== undefined && waiver.file !== violation.file) {
    return false;
  }
  if (waiver.subject !== undefined && waiver.subject !== violation.subject) {
    return false;
  }
  return true;
}

function waiverIsExpired(waiver, now) {
  if (waiver.expires === undefined) return false;
  const expiresAt = Date.parse(`${waiver.expires}T23:59:59Z`);
  return expiresAt < now.getTime();
}

function checkStatus(checkId, violations, waived, skipped, notes) {
  const errors = violations.filter(
    (violation) =>
      violation.check === checkId && violation.severity === 'error',
  );
  const warnings = violations.filter(
    (violation) =>
      violation.check === checkId && violation.severity !== 'error',
  );
  const waivedCount = waived.filter(
    (violation) => violation.check === checkId,
  ).length;
  const skippedItems = skipped.filter((item) => item.check === checkId);
  let status = 'ok';
  if (errors.length > 0) status = 'failed';
  else if (warnings.length > 0) status = 'warning';
  else if (waivedCount > 0) status = 'waived';
  else if (skippedItems.length > 0) status = 'skipped';
  return {
    id: checkId,
    status,
    errors: errors.length,
    warnings: warnings.length,
    waived: waivedCount,
    skipped: skippedItems.length,
    notes: notes.filter((note) => note.check === checkId).map((note) => note.message),
  };
}

/**
 * Run all checks. Exported for tests and CI wrappers.
 */
export function runChecks(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT);
  const mode = options.mode ?? 'local';
  if (!MODES.includes(mode)) {
    throw new ConfigError(`--mode must be one of ${MODES.join(', ')}`);
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const manifestPath = resolve(
    root,
    options.manifestPath ?? DEFAULT_MANIFEST_PATH,
  );
  const waiverPath = resolve(
    root,
    options.waiverPath ?? DEFAULT_WAIVER_PATH,
  );
  const waivers = loadWaivers(waiverPath, {
    explicit: options.waiverExplicit === true,
  });

  let backendRoot;
  if (options.backendRoot !== undefined) {
    backendRoot = resolve(options.backendRoot);
    if (!existsSync(backendRoot) || !statSync(backendRoot).isDirectory()) {
      throw new ConfigError(
        `--backend-root is not a directory: ${options.backendRoot}`,
      );
    }
  }

  const ctx = {
    root,
    backendRoot,
    mode,
    now,
    manifestPath,
    expectedSourceCommit: options.expectedSourceCommit,
    expectedTag: options.expectedTag,
    verifyArtifactDigests:
      options.verifyArtifactDigests ?? mode === 'release',
  };

  const images = scanComposeImages(ctx);
  const releaseProfile = scanReleaseProfile(ctx);
  const build = scanBuildScripts(ctx);
  const contract = scanShippedContract(ctx);
  ctx.sourceVersion = contract.sourceVersion;
  const provenance = scanPublicProvenance(ctx);
  const manifest = scanManifestFile(ctx);
  const secrets = scanSecrets(ctx);

  const allViolations = [
    ...images.violations,
    ...releaseProfile.violations,
    ...build.violations,
    ...contract.violations,
    ...provenance.violations,
    ...manifest.violations,
    ...secrets.violations,
  ];
  const skipped = [
    ...images.skipped,
    ...releaseProfile.skipped,
    ...build.skipped,
    ...contract.skipped,
    ...provenance.skipped,
    ...manifest.skipped,
    ...secrets.skipped,
  ];
  const notes = [...manifest.notes.map((message) => ({ check: 'manifest.release', message }))];

  const waived = [];
  const violations = [];
  const applicableWaivers = waivers.filter((waiver) =>
    waiverApplies(waiver, mode),
  );
  for (const violation of allViolations) {
    const match = applicableWaivers.find((waiver) =>
      waiverMatches(waiver, violation),
    );
    if (match !== undefined && !waiverIsExpired(match, now)) {
      waived.push({
        ...violation,
        waiver: {
          id: match.id,
          reason: match.reason,
          expires: match.expires,
        },
      });
    } else {
      violations.push(violation);
    }
  }

  if (mode !== 'release') {
    for (const waiver of applicableWaivers) {
      if (waiverIsExpired(waiver, now)) {
        violations.push(
          makeViolation('waivers.expired', {
            severity: 'warning',
            file: normalizeRelPath(root, waiverPath),
            subject: `expired:${waiver.id}`,
            message: `waiver "${waiver.id}" expired on ${waiver.expires} and no longer covers its violations`,
            hint: 'Remove the debt or extend the waiver with a new owner-approved expiry.',
          }),
        );
      }
    }
  }

  const errors = violations.filter((violation) => violation.severity === 'error');
  const warnings = violations.filter(
    (violation) => violation.severity !== 'error',
  );
  const checkIds = [...CHECK_IDS, 'waivers.expired'];
  const checks = checkIds.map((checkId) =>
    checkStatus(checkId, violations, waived, skipped, notes),
  );
  const ok =
    errors.length === 0 &&
    (!options.failOnWarnings || warnings.length === 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    tool: 'check-release-hygiene',
    mode,
    root,
    generatedAt: now.toISOString(),
    manifest: normalizeRelPath(root, manifestPath),
    waiverFile: normalizeRelPath(root, waiverPath),
    waivedIgnoredInRelease: mode === 'release' ? waivers.length : 0,
    summary: {
      ok,
      errors: errors.length,
      warnings: warnings.length,
      waived: waived.length,
      skipped: skipped.length,
    },
    checks,
    violations: errors,
    warnings,
    waived,
    skipped,
    notes,
  };
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function formatReport(report, format = 'text') {
  if (format === 'json') {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  if (format === 'markdown') {
    const lines = [];
    lines.push('# Release hygiene');
    lines.push('');
    lines.push(`- Mode: \`${report.mode}\``);
    lines.push(
      `- Result: **${report.summary.ok ? 'PASS' : 'FAIL'}** ` +
        `(${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ` +
        `${report.summary.waived} waived, ${report.summary.skipped} skipped)`,
    );
    lines.push(`- Manifest: \`${report.manifest}\``);
    if (report.waivedIgnoredInRelease > 0) {
      lines.push(
        `- Note: release mode ignored ${report.waivedIgnoredInRelease} local waiver(s).`,
      );
    }
    lines.push('');
    lines.push('## Violations');
    lines.push('');
    if (report.violations.length === 0 && report.warnings.length === 0) {
      lines.push('None.');
    } else {
      lines.push('| Check | File | Line | Severity | Subject | Detail |');
      lines.push('|---|---|---|---|---|---|');
      for (const violation of [...report.violations, ...report.warnings]) {
        lines.push(
          `| ${escapeMarkdown(violation.check)} | ${escapeMarkdown(violation.file)} | ` +
            `${violation.line ?? ''} | ${escapeMarkdown(violation.severity)} | ` +
            `${escapeMarkdown(violation.subject)} | ` +
            `${escapeMarkdown(violation.message)} |`,
        );
      }
    }
    if (report.waived.length > 0) {
      lines.push('');
      lines.push('## Waived (local/CI only; release mode ignores)');
      lines.push('');
      lines.push('| Check | File | Subject | Waiver | Expires |');
      lines.push('|---|---|---|---|---|');
      for (const item of report.waived) {
        lines.push(
          `| ${escapeMarkdown(item.check)} | ${escapeMarkdown(item.file)} | ` +
            `${escapeMarkdown(item.subject)} | ${escapeMarkdown(item.waiver.id)} | ` +
            `${escapeMarkdown(item.waiver.expires ?? 'none')} |`,
        );
      }
    }
    lines.push('');
    lines.push('## Checks');
    lines.push('');
    lines.push('| Check | Status | Errors | Warnings | Waived | Skipped |');
    lines.push('|---|---|---|---|---|---|');
    for (const check of report.checks) {
      lines.push(
        `| ${check.id} | ${check.status} | ${check.errors} | ${check.warnings} | ` +
          `${check.waived} | ${check.skipped} |`,
      );
    }
    for (const skip of report.skipped) {
      lines.push('');
      lines.push(`- skipped ${skip.check}: ${skip.message}`);
    }
    return `${lines.join('\n')}\n`;
  }

  const lines = [];
  lines.push(`== Release hygiene (mode=${report.mode}) ==`);
  for (const violation of report.violations) {
    lines.push(
      `[FAIL] ${violation.check} ${violation.file}${violation.line ? `:${violation.line}` : ''} ${violation.message}`,
    );
  }
  for (const warning of report.warnings) {
    lines.push(
      `[WARN] ${warning.check} ${warning.file}${warning.line ? `:${warning.line}` : ''} ${warning.message}`,
    );
  }
  for (const waived of report.waived) {
    lines.push(
      `[WAIVED] ${waived.check} ${waived.file}${waived.line ? `:${waived.line}` : ''} ${waived.message} (waiver ${waived.waiver.id})`,
    );
  }
  for (const skip of report.skipped) {
    lines.push(`[SKIP] ${skip.check}: ${skip.message}`);
  }
  for (const note of report.notes) {
    lines.push(`[NOTE] ${note.check}: ${note.message}`);
  }
  if (report.waivedIgnoredInRelease > 0) {
    lines.push(
      `[NOTE] release mode ignored ${report.waivedIgnoredInRelease} local waiver(s)`,
    );
  }
  lines.push('');
  lines.push(
    `result: ${report.summary.ok ? 'PASS' : 'FAIL'} ` +
      `errors=${report.summary.errors} warnings=${report.summary.warnings} ` +
      `waived=${report.summary.waived} skipped=${report.summary.skipped}`,
  );
  return `${lines.join('\n')}\n`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-release-hygiene.mjs [--mode local|ci|release]
    [--format text|json|markdown] [--root <dir>] [--waiver <file>]
    [--manifest <file>] [--expected-source-commit <sha>]
    [--expected-tag <tag>] [--verify-artifact-digests]
    [--no-verify-artifact-digests] [--fail-on-warnings]
    [--backend-root <private luban-backend checkout>]

Checks Docker/compose/GHCR pinning, the release compose/profile
(docker-compose.release.yml + deploy/release/release-profile.json), release/build
script reproducibility, source vs shipped dist-backend Feature RPC contract,
release manifest/provenance consistency, and default/well-known secrets.
--backend-root additionally scans the private backend build/publish scripts
read-only (never present in public CI).

Modes: local/ci apply scope=local waivers from
scripts/release-hygiene-waivers.json and audit the development compose/dev
scripts. Release mode ignores all waivers, requires an unpacked dist-backend
plus release-manifest.json with native provenance, and requires the release
compose/profile; it does not treat the development compose or dev-only scripts
as release configs. Artifact digests are re-hashed in release mode by default.

Exit codes: 0 = pass, 1 = violations, 2 = usage/config error.`);
}

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  root: { type: 'string' },
  mode: { type: 'string' },
  format: { type: 'string' },
  waiver: { type: 'string' },
  manifest: { type: 'string' },
  'expected-source-commit': { type: 'string' },
  'expected-tag': { type: 'string' },
  'verify-artifact-digests': { type: 'boolean' },
  'no-verify-artifact-digests': { type: 'boolean' },
  'fail-on-warnings': { type: 'boolean' },
  'backend-root': { type: 'string' },
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
    const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
    console.error(`release-hygiene: invalid arguments${code}`);
    console.error('Run with --help for usage.');
    return 2;
  }

  const { values } = parsed;
  if (values.help) {
    printHelp();
    return 0;
  }

  const format = values.format ?? 'text';
  if (!FORMATS.includes(format)) {
    console.error(
      `release-hygiene: --format must be one of ${FORMATS.join(', ')}`,
    );
    return 2;
  }
  if (
    values['verify-artifact-digests'] &&
    values['no-verify-artifact-digests']
  ) {
    console.error(
      'release-hygiene: --verify-artifact-digests and --no-verify-artifact-digests are mutually exclusive',
    );
    return 2;
  }

  const explicitWaiver = values.waiver !== undefined;
  const root = resolve(values.root ?? REPO_ROOT);
  try {
    const verifyArtifactDigests = values['verify-artifact-digests']
      ? true
      : values['no-verify-artifact-digests']
        ? false
        : undefined;
    const report = runChecks({
      root,
      mode: values.mode ?? 'local',
      manifestPath: values.manifest,
      waiverPath: values.waiver,
      waiverExplicit: explicitWaiver,
      expectedSourceCommit: values['expected-source-commit'],
      expectedTag: values['expected-tag'],
      verifyArtifactDigests,
      failOnWarnings: values['fail-on-warnings'] === true,
      backendRoot: values['backend-root'],
    });
    process.stdout.write(formatReport(report, format));
    return report.summary.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`release-hygiene: ${error.message}`);
      return 2;
    }
    console.error(
      `release-hygiene: unexpected error (${error?.name ?? 'Error'})`,
    );
    return 2;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
