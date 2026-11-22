#!/usr/bin/env node
/**
 * Release manifest builder/validator and runtime contract check (G1 J3.1/J3.2).
 *
 * This is a manifest builder/validator only. It is NOT the release gate and
 * does not replace scripts/release-gate.ps1 or scripts/verify-stack.ps1.
 *
 * Guarantees:
 *  - build/verify make no network access and no docker/gh invocation.
 *  - verify-runtime performs exactly one unauthenticated GET against the
 *    caller-supplied runtime endpoint (no auth headers, no secret reads).
 *  - Deterministic output for the same input (builtAt is the only defaulted
 *    non-deterministic field, and only when the caller does not supply it).
 *
 * Schema: docs/architecture/release-manifest.schema.json
 *
 * Usage:
 *   node scripts/release-manifest.mjs build --input <file> [--out <file>]
 *   node scripts/release-manifest.mjs build --tag <tag> --source-commit <sha>
 *     --contract-version <x.y.z> --image <name>=<digest> [--image ...]
 *     [--built-at <iso>] [--sbom-digest <digest>]
 *     [--native-provenance <path> --native-provenance-sha256 <digest>]
 *     [--out <file>]
 *   node scripts/release-manifest.mjs verify --file <manifest>
 *     [--expected-source-commit <sha>] [--expected-contract-version <x.y.z>]
 *   node scripts/release-manifest.mjs verify-runtime --file <manifest>
 *     --base-url <http(s)://host[:port][/prefix]> [--timeout-ms <1..60000>]
 *     [--interface <rpcInterfaceName>]
 *
 * Exit codes: 0 = OK (manifest valid / runtime contract matches),
 *   1 = invalid manifest schema or runtime metadata invalid/mismatched,
 *   2 = usage error, unreadable/non-JSON input file, or runtime
 *       network/HTTP failure.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const SCHEMA_VERSION = 1;

const DIGEST_RE = /^(?:sha256:)?([0-9a-fA-F]{64})$/;
const COMMIT_RE = /^[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?$/;
const CONTRACT_VERSION_RE = /^\d+\.\d+\.\d+$/;
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const MANIFEST_KEYS = [
  'schemaVersion',
  'tag',
  'sourceCommit',
  'builtAt',
  'contractVersion',
  'images',
  'sbomDigest',
  'nativeProvenance',
];
const IMAGE_KEYS = ['name', 'digest'];
const NATIVE_PROVENANCE_KEYS = ['path', 'sha256'];

const BUILD_ONLY_FLAGS = [
  'input',
  'out',
  'tag',
  'source-commit',
  'built-at',
  'image',
  'contract-version',
  'sbom-digest',
  'native-provenance',
  'native-provenance-sha256',
];
const VERIFY_ONLY_FLAGS = [
  'file',
  'expected-source-commit',
  'expected-contract-version',
];
const VERIFY_RUNTIME_ONLY_FLAGS = ['file', 'base-url', 'timeout-ms', 'interface'];

const DEFAULT_CONTRACT_INTERFACE = 'LubanFeatureRpcInterface';
const DEFAULT_RUNTIME_TIMEOUT_MS = 5000;
const MAX_RUNTIME_TIMEOUT_MS = 60000;
const MAX_METADATA_BYTES = 5 * 1024 * 1024;
const INTERFACE_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;
// Last path component of the runtime OpenAPI description, as produced by
// BentleyCloudRpcProtocol: "<interfaceName>-<interfaceVersion>-<operationName>".
const RPC_OPERATION_SEGMENT_RE = /^([^-]+)-(\d+\.\d+\.\d+)-(.+)$/;

export class ManifestValidationError extends Error {
  constructor(errors) {
    super('release manifest validation failed');
    this.name = 'ManifestValidationError';
    this.errors = errors;
  }
}

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown field`);
  }
}

function requireString(value, path, errors) {
  if (value === undefined) {
    errors.push(`${path}: required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push(`${path}: must be a string`);
    return undefined;
  }
  if (value.length === 0) {
    errors.push(`${path}: must not be empty`);
    return undefined;
  }
  return value;
}

export function canonicalizeDigest(value) {
  if (typeof value !== 'string') return value;
  const match = DIGEST_RE.exec(value);
  return match ? `sha256:${match[1].toLowerCase()}` : value;
}

function validateDigest(value, path, errors, { optional = false } = {}) {
  if (value === undefined) {
    if (!optional) errors.push(`${path}: required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push(`${path}: must be a string`);
    return undefined;
  }
  const match = DIGEST_RE.exec(value);
  if (!match) {
    errors.push(`${path}: must be "sha256:<64 hex>" or 64 hex characters`);
    return undefined;
  }
  return `sha256:${match[1].toLowerCase()}`;
}

function validateTag(value, path, errors) {
  const tag = requireString(value, path, errors);
  if (tag === undefined) return;
  if (!TAG_RE.test(tag)) {
    errors.push(`${path}: must start alphanumeric and contain only A-Z a-z 0-9 . _ -`);
  }
  if (tag.length > 128) {
    errors.push(`${path}: must be at most 128 characters`);
  }
  if (tag.toLowerCase() === 'latest') {
    errors.push(`${path}: "latest" is not allowed as a deployable tag`);
  }
}

function validateImages(value, errors) {
  if (!Array.isArray(value)) {
    errors.push('images: must be an array');
    return;
  }
  if (value.length === 0) {
    errors.push('images: must contain at least one image');
    return;
  }
  const seen = new Set();
  value.forEach((image, index) => {
    const path = `images[${index}]`;
    if (!isPlainObject(image)) {
      errors.push(`${path}: must be an object`);
      return;
    }
    checkKeys(image, IMAGE_KEYS, path, errors);
    const name = requireString(image.name, `${path}.name`, errors);
    if (name !== undefined) {
      if (/[\s@]/.test(name)) {
        errors.push(`${path}.name: must not contain whitespace or "@"`);
      }
      if (name.length > 512) {
        errors.push(`${path}.name: must be at most 512 characters`);
      }
      if (name.toLowerCase().endsWith(':latest')) {
        errors.push(`${path}.name: ":latest" is not allowed as a deployable tag`);
      }
      const key = name.toLowerCase();
      if (seen.has(key)) errors.push(`${path}.name: duplicate image name`);
      seen.add(key);
    }
    validateDigest(image.digest, `${path}.digest`, errors);
  });
}

/**
 * Validate a manifest object against the v1 contract.
 * Returns an array of human-readable errors; empty means valid.
 */
export function validateManifest(
  value,
  { expectedSourceCommit, expectedContractVersion } = {},
) {
  const errors = [];
  if (!isPlainObject(value)) return ['manifest: must be a JSON object'];

  checkKeys(value, MANIFEST_KEYS, 'manifest', errors);

  if (value.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion: must be ${SCHEMA_VERSION}`);
  }
  validateTag(value.tag, 'tag', errors);

  const sourceCommit = requireString(value.sourceCommit, 'sourceCommit', errors);
  if (sourceCommit !== undefined && !COMMIT_RE.test(sourceCommit)) {
    errors.push('sourceCommit: must be a 40-hex or 64-hex git commit');
  }

  const builtAt = requireString(value.builtAt, 'builtAt', errors);
  if (
    builtAt !== undefined &&
    (!ISO_DATETIME_RE.test(builtAt) || Number.isNaN(Date.parse(builtAt)))
  ) {
    errors.push('builtAt: must be an ISO-8601 date-time with a timezone');
  }

  const contractVersion = requireString(
    value.contractVersion,
    'contractVersion',
    errors,
  );
  if (contractVersion !== undefined && !CONTRACT_VERSION_RE.test(contractVersion)) {
    errors.push('contractVersion: must be MAJOR.MINOR.PATCH');
  }

  validateImages(value.images, errors);

  if (value.sbomDigest !== undefined) {
    validateDigest(value.sbomDigest, 'sbomDigest', errors, { optional: true });
  }

  if (value.nativeProvenance !== undefined) {
    const native = value.nativeProvenance;
    if (!isPlainObject(native)) {
      errors.push('nativeProvenance: must be an object');
    } else {
      checkKeys(native, NATIVE_PROVENANCE_KEYS, 'nativeProvenance', errors);
      const nativePath = requireString(
        native.path,
        'nativeProvenance.path',
        errors,
      );
      if (nativePath !== undefined && /[\r\n]/.test(nativePath)) {
        errors.push('nativeProvenance.path: must be a single-line path');
      }
      validateDigest(native.sha256, 'nativeProvenance.sha256', errors);
    }
  }

  if (expectedSourceCommit !== undefined) {
    if (!COMMIT_RE.test(expectedSourceCommit)) {
      errors.push('--expected-source-commit: must be a 40-hex or 64-hex git commit');
    } else if (
      typeof value.sourceCommit === 'string' &&
      value.sourceCommit.toLowerCase() !== expectedSourceCommit.toLowerCase()
    ) {
      errors.push(
        `sourceCommit mismatch: manifest has ${value.sourceCommit}, expected ${expectedSourceCommit}`,
      );
    }
  }

  if (expectedContractVersion !== undefined) {
    if (!CONTRACT_VERSION_RE.test(expectedContractVersion)) {
      errors.push('--expected-contract-version: must be MAJOR.MINOR.PATCH');
    } else if (
      typeof value.contractVersion === 'string' &&
      value.contractVersion !== expectedContractVersion
    ) {
      errors.push(
        `contractVersion mismatch: manifest has ${value.contractVersion}, expected ${expectedContractVersion}`,
      );
    }
  }

  return errors;
}

function canonicalizeImages(value) {
  if (!Array.isArray(value)) return value;
  return value
    .map((image) =>
      isPlainObject(image)
        ? { ...image, digest: canonicalizeDigest(image.digest) }
        : image,
    )
    .sort((a, b) => {
      const aName = isPlainObject(a) && typeof a.name === 'string' ? a.name : '';
      const bName = isPlainObject(b) && typeof b.name === 'string' ? b.name : '';
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      return 0;
    });
}

/**
 * Normalize a build input into a canonical manifest and validate it.
 * Input keys are the manifest keys; schemaVersion and builtAt are optional.
 * Throws ManifestValidationError when the input is invalid.
 */
export function buildManifest(raw, { now = () => new Date().toISOString() } = {}) {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(['input: must be a JSON object']);
  }

  const unknown = [];
  checkKeys(raw, MANIFEST_KEYS, 'input', unknown);
  if (unknown.length > 0) throw new ManifestValidationError(unknown);

  const manifest = {
    schemaVersion: raw.schemaVersion === undefined ? SCHEMA_VERSION : raw.schemaVersion,
    tag: raw.tag,
    sourceCommit:
      typeof raw.sourceCommit === 'string'
        ? raw.sourceCommit.toLowerCase()
        : raw.sourceCommit,
    builtAt: raw.builtAt === undefined ? now() : raw.builtAt,
    contractVersion: raw.contractVersion,
    images: canonicalizeImages(raw.images),
  };

  if (raw.sbomDigest !== undefined) {
    manifest.sbomDigest = canonicalizeDigest(raw.sbomDigest);
  }
  if (raw.nativeProvenance !== undefined) {
    manifest.nativeProvenance = isPlainObject(raw.nativeProvenance)
      ? {
          ...raw.nativeProvenance,
          path: raw.nativeProvenance.path,
          sha256: canonicalizeDigest(raw.nativeProvenance.sha256),
        }
      : raw.nativeProvenance;
  }

  const errors = validateManifest(manifest);
  if (errors.length > 0) throw new ManifestValidationError(errors);
  return manifest;
}

function readJsonFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new UsageError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Do not echo parser messages: they can include input content.
    throw new UsageError(`${path} is not valid JSON`);
  }
}

function flagWasSet(values, key) {
  return values[key] !== undefined;
}

function rejectFlags(values, allowed, command) {
  for (const key of Object.keys(values)) {
    if (key === 'help') continue;
    if (!allowed.includes(key)) {
      throw new UsageError(`--${key} is not valid for "${command}"`);
    }
  }
}

function parseImageSpec(spec) {
  const separator = spec.indexOf('=');
  if (separator <= 0 || separator === spec.length - 1) {
    throw new UsageError('--image must be <name>=<digest>');
  }
  return { name: spec.slice(0, separator), digest: spec.slice(separator + 1) };
}

function inputFromFlags(values) {
  const images = (values.image ?? []).map(parseImageSpec);
  if (images.length === 0) {
    throw new UsageError('build requires at least one --image <name>=<digest>');
  }

  const nativePath = values['native-provenance'];
  const nativeSha = values['native-provenance-sha256'];
  if ((nativePath === undefined) !== (nativeSha === undefined)) {
    throw new UsageError(
      '--native-provenance and --native-provenance-sha256 must be provided together',
    );
  }

  return {
    tag: values.tag,
    sourceCommit: values['source-commit'],
    builtAt: values['built-at'],
    contractVersion: values['contract-version'],
    images,
    sbomDigest: values['sbom-digest'],
    nativeProvenance:
      nativePath === undefined
        ? undefined
        : { path: nativePath, sha256: nativeSha },
  };
}

function reportValidationErrors(errors) {
  console.error(`release manifest FAILED (${errors.length} error(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
}

function runBuild(values) {
  rejectFlags(values, BUILD_ONLY_FLAGS, 'build');

  const hasInput = values.input !== undefined;
  const hasDataFlags = [
    'tag',
    'source-commit',
    'built-at',
    'image',
    'contract-version',
    'sbom-digest',
    'native-provenance',
    'native-provenance-sha256',
  ].some((key) => flagWasSet(values, key));

  if (hasInput && hasDataFlags) {
    throw new UsageError('--input cannot be combined with field flags');
  }

  let raw;
  if (hasInput) {
    raw = readJsonFile(values.input);
  } else {
    for (const key of ['tag', 'source-commit', 'contract-version']) {
      if (!flagWasSet(values, key)) {
        throw new UsageError(
          `build requires --input or --${key}, --source-commit and --contract-version`,
        );
      }
    }
    raw = inputFromFlags(values);
  }

  const manifest = buildManifest(raw);
  const text = `${JSON.stringify(manifest, null, 2)}\n`;

  if (values.out !== undefined) {
    try {
      writeFileSync(values.out, text, 'utf8');
    } catch {
      throw new UsageError(`cannot write ${values.out}`);
    }
    console.log(`release manifest written: ${values.out}`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

function runVerify(values) {
  rejectFlags(values, VERIFY_ONLY_FLAGS, 'verify');

  if (values.file === undefined) {
    throw new UsageError('verify requires --file <manifest>');
  }

  const manifest = readJsonFile(values.file);
  const errors = validateManifest(manifest, {
    expectedSourceCommit: values['expected-source-commit'],
    expectedContractVersion: values['expected-contract-version'],
  });

  if (errors.length > 0) {
    reportValidationErrors(errors);
    return 1;
  }

  console.log(
    `release manifest OK: ${manifest.tag} (${manifest.images.length} image(s), ` +
      `source ${manifest.sourceCommit.slice(0, 12)}, contract ${manifest.contractVersion})`,
  );
  return 0;
}

function normalizeRuntimeEndpoint(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError('--base-url must be an absolute http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError('--base-url must use http or https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new UsageError('--base-url must not contain credentials');
  }

  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/rpc/metadata')) pathname = `${pathname}/rpc/metadata`;
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  url.pathname = pathname;
  url.hash = '';

  return {
    endpoint: url.toString(),
    // Display without query/hash so URL-embedded tokens are never echoed.
    display: `${url.origin}${pathname}`,
  };
}

function parseTimeout(raw) {
  if (raw === undefined) return DEFAULT_RUNTIME_TIMEOUT_MS;
  if (!/^\d+$/.test(raw)) {
    throw new UsageError('--timeout-ms must be a positive integer');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_RUNTIME_TIMEOUT_MS) {
    throw new UsageError(`--timeout-ms must be between 1 and ${MAX_RUNTIME_TIMEOUT_MS}`);
  }
  return value;
}

function parseInterfaceName(raw) {
  if (raw === undefined) return DEFAULT_CONTRACT_INTERFACE;
  if (!INTERFACE_NAME_RE.test(raw)) {
    throw new UsageError('--interface must be an RPC interface name');
  }
  return raw;
}

/**
 * Fetch runtime RPC metadata once. Never throws and never returns the raw
 * response body; callers decide how to report the outcome.
 *
 * Returns:
 *  - { kind: "ok", metadata }
 *  - { kind: "invalid", reason }  (malformed/oversized JSON; exit 1)
 *  - { kind: "network", reason }  (timeout/non-2xx/transport; exit 2)
 */
async function fetchRuntimeMetadata(endpoint, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { kind: 'network', reason: `HTTP ${response.status}` };
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_METADATA_BYTES) {
      await response.body?.cancel().catch(() => {});
      return { kind: 'invalid', reason: 'response exceeds size limit' };
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_METADATA_BYTES) {
      return { kind: 'invalid', reason: 'response exceeds size limit' };
    }

    try {
      return { kind: 'ok', metadata: JSON.parse(text) };
    } catch {
      // Do not echo parser messages: they can include response content.
      return { kind: 'invalid', reason: 'response is not valid JSON' };
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return { kind: 'network', reason: `timed out after ${timeoutMs} ms` };
    }
    // Only the code/name is reported; transport messages may embed the URL.
    const code = error?.cause?.code ?? error?.code ?? error?.name ?? 'network error';
    return { kind: 'network', reason: `transport error (${String(code)})` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the runtime version for one RPC interface from the OpenAPI
 * description served by the modeling server's /rpc/metadata endpoint.
 * The version lives in the last path component of each operation path.
 */
function readRuntimeContractVersion(metadata, interfaceName) {
  if (!isPlainObject(metadata)) {
    return { kind: 'invalid', reason: 'metadata is not a JSON object' };
  }
  if (!isPlainObject(metadata.paths)) {
    return { kind: 'invalid', reason: 'metadata has no paths object' };
  }

  const versionsByInterface = new Map();
  let operationCount = 0;
  for (const path of Object.keys(metadata.paths)) {
    const segment = path.slice(path.lastIndexOf('/') + 1);
    const match = RPC_OPERATION_SEGMENT_RE.exec(segment);
    if (match === null) continue;
    operationCount += 1;
    const [, name, version] = match;
    if (!versionsByInterface.has(name)) versionsByInterface.set(name, new Set());
    versionsByInterface.get(name).add(version);
  }

  if (operationCount === 0) {
    return { kind: 'invalid', reason: 'metadata has no RPC operations' };
  }

  const found = versionsByInterface.get(interfaceName);
  if (found === undefined) {
    return {
      kind: 'mismatch',
      reason: `runtime metadata does not expose ${interfaceName}`,
    };
  }
  if (found.size > 1) {
    const versions = [...found].sort().join(', ');
    return {
      kind: 'invalid',
      reason: `runtime reports conflicting ${interfaceName} versions (${versions})`,
    };
  }
  return { kind: 'ok', version: [...found][0] };
}

function reportRuntimeFailure(detail) {
  console.error('release manifest runtime FAILED:');
  console.error(`  - ${detail}`);
}

async function runVerifyRuntime(values) {
  rejectFlags(values, VERIFY_RUNTIME_ONLY_FLAGS, 'verify-runtime');

  if (values.file === undefined) {
    throw new UsageError('verify-runtime requires --file <manifest>');
  }
  if (values['base-url'] === undefined) {
    throw new UsageError(
      'verify-runtime requires --base-url <http(s)://host[:port][/prefix]>',
    );
  }

  const { endpoint, display } = normalizeRuntimeEndpoint(values['base-url']);
  const timeoutMs = parseTimeout(values['timeout-ms']);
  const interfaceName = parseInterfaceName(values.interface);

  const manifest = readJsonFile(values.file);
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    reportValidationErrors(errors);
    return 1;
  }

  const fetched = await fetchRuntimeMetadata(endpoint, timeoutMs);
  if (fetched.kind === 'network') {
    console.error(
      `release-manifest: cannot read runtime metadata from ${display}: ${fetched.reason}`,
    );
    return 2;
  }
  if (fetched.kind === 'invalid') {
    reportRuntimeFailure(`${fetched.reason} (${display})`);
    return 1;
  }

  const contract = readRuntimeContractVersion(fetched.metadata, interfaceName);
  if (contract.kind === 'invalid') {
    reportRuntimeFailure(`${contract.reason} (${display})`);
    return 1;
  }
  if (contract.kind === 'mismatch') {
    reportRuntimeFailure(`${contract.reason} (${display})`);
    return 1;
  }
  if (contract.version !== manifest.contractVersion) {
    reportRuntimeFailure(
      `contractVersion mismatch: manifest has ${manifest.contractVersion}, ` +
        `runtime ${interfaceName} has ${contract.version} (${display})`,
    );
    return 1;
  }

  console.log(
    `release manifest runtime OK: ${interfaceName} ${contract.version} ` +
      `matches manifest ${manifest.tag} at ${display}`,
  );
  return 0;
}

function printHelp() {
  console.log(`Usage:
  node scripts/release-manifest.mjs build --input <file> [--out <file>]
  node scripts/release-manifest.mjs build --tag <tag> --source-commit <sha>
    --contract-version <x.y.z> --image <name>=<digest> [--image ...]
    [--built-at <iso>] [--sbom-digest <digest>]
    [--native-provenance <path> --native-provenance-sha256 <digest>]
    [--out <file>]
  node scripts/release-manifest.mjs verify --file <manifest>
    [--expected-source-commit <sha>] [--expected-contract-version <x.y.z>]
  node scripts/release-manifest.mjs verify-runtime --file <manifest>
    --base-url <http(s)://host[:port][/prefix]> [--timeout-ms <1..60000>]
    [--interface <rpcInterfaceName>]

Manifest builder/validator plus runtime contract reconciliation (G1 J3.1/J3.2);
not a release gate. Schema: docs/architecture/release-manifest.schema.json
verify-runtime issues one unauthenticated GET to <base-url>/rpc/metadata and
compares the runtime interfaceVersion with the manifest contractVersion.
No docker or gh calls are made.

Exit codes: 0 = OK, 1 = invalid manifest schema/metadata or version mismatch,
2 = usage error, unreadable/non-JSON input file, or network/HTTP failure.`);
}

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  input: { type: 'string' },
  out: { type: 'string' },
  file: { type: 'string' },
  tag: { type: 'string' },
  'source-commit': { type: 'string' },
  'built-at': { type: 'string' },
  image: { type: 'string', multiple: true },
  'contract-version': { type: 'string' },
  'sbom-digest': { type: 'string' },
  'native-provenance': { type: 'string' },
  'native-provenance-sha256': { type: 'string' },
  'expected-source-commit': { type: 'string' },
  'expected-contract-version': { type: 'string' },
  'base-url': { type: 'string' },
  'timeout-ms': { type: 'string' },
  interface: { type: 'string' },
};

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: OPTIONS,
    });
  } catch (error) {
    // Do not echo argv: an unknown option could carry a secret value.
    const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
    console.error(`release-manifest: invalid arguments${code}`);
    console.error('Run with --help for usage.');
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printHelp();
    return 0;
  }

  try {
    if (positionals.length !== 1) {
      throw new UsageError(
        'expected exactly one command: build, verify, or verify-runtime',
      );
    }
    const [command] = positionals;
    if (command === 'build') return runBuild(values);
    if (command === 'verify') return runVerify(values);
    if (command === 'verify-runtime') return await runVerifyRuntime(values);
    throw new UsageError(
      `unknown command "${command}" (expected build, verify, or verify-runtime)`,
    );
  } catch (error) {
    if (error instanceof ManifestValidationError) {
      reportValidationErrors(error.errors);
      return 1;
    }
    if (error instanceof UsageError) {
      console.error(`release-manifest: ${error.message}`);
      console.error('Run with --help for usage.');
      return 2;
    }
    console.error(`release-manifest: unexpected error (${error?.name ?? 'Error'})`);
    return 2;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`release-manifest: unexpected error (${error?.name ?? 'Error'})`);
      process.exitCode = 2;
    },
  );
}
