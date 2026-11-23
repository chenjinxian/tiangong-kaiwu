#!/usr/bin/env node
/**
 * Cross-repo contract freeze gate (G1 J1.2).
 *
 * Freezes the public `@luban-cad/shared` RPC contract at:
 *   - each interface's `static interfaceVersion` string; and
 *   - a deterministic hash of the interface source file's exported surface.
 *
 * The gate is read-only: it parses public TypeScript sources with the
 * workspace's existing TypeScript dependency. No network, npm registry,
 * docker, gh, or native toolchain access.
 *
 * Hash input (HASH_NORMALIZATION = "typescript-exported-declarations-token-stream/v1"):
 *   1. Parse one .ts source file (no type checking, no dependency resolution).
 *   2. Keep top-level exported declarations in source order: declarations with
 *      an `export` modifier plus `export ... from` declarations.
 *   3. Tokenize each declaration's source text with the TypeScript scanner
 *      (`skipTrivia = true`). Comments and whitespace are not part of the
 *      input; string/template/regular-expression token text is preserved.
 *   4. Join all tokens with the ASCII Unit Separator U+001F and hash the UTF-8
 *      bytes with SHA-256. The manifest stores "sha256:<lowercase hex>".
 *
 * Consequences: comment/JSDoc/formatting-only edits do not change the hash;
 * changes to fields, types, method signatures, exported constants, or the
 * exported declaration set do.
 *
 * Usage:
 *   node scripts/check-contract-freeze.mjs [--manifest <file>] [--root <dir>]
 *   node scripts/check-contract-freeze.mjs --update [--manifest <file>] [--root <dir>]
 *
 * Defaults: --manifest <root>/docs/architecture/contract-freeze.json,
 *           --root is the repository root containing this script.
 *
 * Exit codes:
 *   0 = frozen versions and hashes match the source
 *   1 = drift (version/hash changed without a manifest update)
 *   2 = usage/configuration error (missing/unreadable/invalid manifest or
 *       source, TypeScript parser unavailable)
 *
 * Intentional contract changes: bump the shared interface version, run
 * `--update`, and ship the manifest change with the paired backend/web PRs.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const SCHEMA_VERSION = 1;
export const HASH_ALGORITHM = 'sha256';
export const HASH_NORMALIZATION =
  'typescript-exported-declarations-token-stream/v1';
export const REQUIRED_INTERFACE = 'LubanFeatureRpcInterface';

const TOKEN_SEPARATOR = '\u001f';
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = 'docs/architecture/contract-freeze.json';
const DEFAULT_DESCRIPTION =
  'Frozen @luban-cad/shared cross-repo RPC contract surface (G1 J1.2). Update only with a version bump and paired backend/web release.';

const MANIFEST_KEYS = [
  'schemaVersion',
  'description',
  'hashAlgorithm',
  'hashNormalization',
  'contracts',
];
const CONTRACT_KEYS = [
  'id',
  'package',
  'interfaceName',
  'source',
  'interfaceVersion',
  'sourceHash',
  'note',
];

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
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

/**
 * Validate the manifest's structure (not its current hash values). Returns a
 * list of human-readable errors; an empty list means the manifest is usable.
 */
export function validateFreezeManifest(value) {
  const errors = [];
  if (!isPlainObject(value)) return ['manifest: must be a JSON object'];

  checkKeys(value, MANIFEST_KEYS, 'manifest', errors);

  if (value.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion: must be ${SCHEMA_VERSION}`);
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    errors.push('description: must be a string');
  }
  if (value.hashAlgorithm !== HASH_ALGORITHM) {
    errors.push(`hashAlgorithm: must be "${HASH_ALGORITHM}"`);
  }
  if (value.hashNormalization !== HASH_NORMALIZATION) {
    errors.push(
      `hashNormalization: must be "${HASH_NORMALIZATION}" (do not silently change the hash recipe)`,
    );
  }

  if (!Array.isArray(value.contracts)) {
    errors.push('contracts: must be an array');
    return errors;
  }
  if (value.contracts.length === 0) {
    errors.push('contracts: must contain at least one contract');
    return errors;
  }

  const ids = new Set();
  const interfaces = new Set();
  value.contracts.forEach((contract, index) => {
    const path = `contracts[${index}]`;
    if (!isPlainObject(contract)) {
      errors.push(`${path}: must be an object`);
      return;
    }
    checkKeys(contract, CONTRACT_KEYS, path, errors);

    const id = requireString(contract.id, `${path}.id`, errors);
    if (id !== undefined) {
      if (ids.has(id)) errors.push(`${path}.id: duplicate id`);
      ids.add(id);
    }
    requireString(contract.package, `${path}.package`, errors);

    const interfaceName = requireString(
      contract.interfaceName,
      `${path}.interfaceName`,
      errors,
    );
    if (interfaceName !== undefined) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(interfaceName)) {
        errors.push(`${path}.interfaceName: must be a TypeScript identifier`);
      }
      if (interfaces.has(interfaceName)) {
        errors.push(`${path}.interfaceName: duplicate interface`);
      }
      interfaces.add(interfaceName);
    }

    const source = requireString(contract.source, `${path}.source`, errors);
    if (source !== undefined) {
      const segments = source.split('/');
      if (
        isAbsolute(source) ||
        source.includes('\\') ||
        segments.includes('..')
      ) {
        errors.push(
          `${path}.source: must be a repository-relative POSIX path without ".."`,
        );
      }
    }

    const version = requireString(
      contract.interfaceVersion,
      `${path}.interfaceVersion`,
      errors,
    );
    if (version !== undefined && !VERSION_RE.test(version)) {
      errors.push(`${path}.interfaceVersion: must be MAJOR.MINOR.PATCH`);
    }

    const sourceHash = requireString(
      contract.sourceHash,
      `${path}.sourceHash`,
      errors,
    );
    if (sourceHash !== undefined && !HASH_RE.test(sourceHash)) {
      errors.push(`${path}.sourceHash: must be "sha256:<64 lowercase hex>"`);
    }

    if (contract.note !== undefined && typeof contract.note !== 'string') {
      errors.push(`${path}.note: must be a string`);
    }
  });

  if (!interfaces.has(REQUIRED_INTERFACE)) {
    errors.push(
      `contracts: must include ${REQUIRED_INTERFACE} (the cross-repo Feature RPC contract)`,
    );
  }

  return errors;
}

function resolveWithinRoot(root, relativePath) {
  const absolute = resolve(root, relativePath);
  const rel = relative(root, absolute);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new ConfigError(
      `manifest source escapes the repository root: ${relativePath}`,
    );
  }
  return absolute;
}

function loadTypeScript(root) {
  const candidates = [
    join(root, 'luban-cad', 'packages', 'shared', 'package.json'),
    join(REPO_ROOT, 'luban-cad', 'packages', 'shared', 'package.json'),
    join(root, 'luban-cad', 'package.json'),
    join(REPO_ROOT, 'luban-cad', 'package.json'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const require = createRequire(candidate);
      return require('typescript');
    } catch {
      // Try the next candidate: the workspace layout can differ between a
      // local checkout and a hoisted CI install.
    }
  }
  throw new ConfigError(
    'cannot resolve the TypeScript parser (expected luban-cad/packages/shared/node_modules/typescript; run the workspace install first)',
  );
}

function collectExportedSurface(ts, sourceFile) {
  const declarations = [];
  for (const statement of sourceFile.statements) {
    const isExportDeclaration =
      ts.isExportDeclaration(statement) || ts.isExportAssignment(statement);
    const hasExportModifier =
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) ?? false;
    if (!isExportDeclaration && !hasExportModifier) continue;

    const text = sourceFile.text.slice(
      statement.getStart(sourceFile),
      statement.getEnd(),
    );
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      /* skipTrivia */ true,
      ts.LanguageVariant.Standard,
      text,
    );
    const tokens = [];
    for (
      let kind = scanner.scan();
      kind !== ts.SyntaxKind.EndOfFileToken;
      kind = scanner.scan()
    ) {
      tokens.push(scanner.getTokenText());
    }
    declarations.push(tokens.join(TOKEN_SEPARATOR));
  }
  return declarations.join('\n');
}

function extractInterfaceVersion(ts, sourceFile, interfaceName) {
  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    if (statement.name?.text !== interfaceName) continue;
    for (const member of statement.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!ts.isIdentifier(member.name)) continue;
      if (member.name.text !== 'interfaceVersion') continue;
      const isStatic =
        member.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
        ) ?? false;
      if (!isStatic) continue;
      const initializer = member.initializer;
      if (initializer !== undefined && ts.isStringLiteral(initializer)) {
        return initializer.text;
      }
    }
  }
  return undefined;
}

function computeContract(ts, root, contract) {
  const absolute = resolveWithinRoot(root, contract.source);
  let text;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch {
    throw new ConfigError(`cannot read contract source: ${contract.source}`);
  }

  const sourceFile = ts.createSourceFile(
    absolute,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const actualVersion = extractInterfaceVersion(
    ts,
    sourceFile,
    contract.interfaceName,
  );
  if (actualVersion === undefined) {
    throw new ConfigError(
      `${contract.source}: interface ${contract.interfaceName} has no string ` +
        'literal `static interfaceVersion`',
    );
  }

  const surface = collectExportedSurface(ts, sourceFile);
  const sourceHash = `sha256:${createHash('sha256')
    .update(surface, 'utf8')
    .digest('hex')}`;

  return { interfaceVersion: actualVersion, sourceHash };
}

function readManifest(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(`cannot read contract freeze manifest: ${path}`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    // Do not echo parser messages: they can include input content.
    throw new ConfigError(
      `contract freeze manifest is not valid JSON: ${path}`,
    );
  }
  const errors = validateFreezeManifest(value);
  if (errors.length > 0) {
    throw new ConfigError(
      `contract freeze manifest is invalid (${errors.length} error(s)):\n` +
        errors.map((error) => `  - ${error}`).join('\n'),
    );
  }
  return value;
}

function reportDrift(errors) {
  console.error(`contract freeze FAILED (${errors.length} drift item(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error(
    'If the change is intentional: bump the shared interface version, run ' +
      '`node scripts/check-contract-freeze.mjs --update`, and ship the manifest ' +
      'change with the paired backend/web release.',
  );
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function runCheck(values) {
  const root = values.root === undefined ? REPO_ROOT : resolve(values.root);
  const manifestPath =
    values.manifest === undefined
      ? join(root, DEFAULT_MANIFEST)
      : resolve(values.manifest);

  const manifest = readManifest(manifestPath);
  const ts = loadTypeScript(root);

  const errors = [];
  const results = [];
  for (const contract of manifest.contracts) {
    const actual = computeContract(ts, root, contract);
    if (actual.interfaceVersion !== contract.interfaceVersion) {
      errors.push(
        `${contract.interfaceName}.interfaceVersion: manifest ` +
          `${contract.interfaceVersion}, source ${actual.interfaceVersion}`,
      );
    }
    if (actual.sourceHash !== contract.sourceHash) {
      errors.push(
        `${contract.interfaceName}.sourceHash: manifest ` +
          `${contract.sourceHash}, source ${actual.sourceHash}`,
      );
    }
    results.push({ contract, actual });
  }

  if (values.update) {
    const updated = {
      schemaVersion: SCHEMA_VERSION,
      description:
        typeof manifest.description === 'string' &&
        manifest.description.length > 0
          ? manifest.description
          : DEFAULT_DESCRIPTION,
      hashAlgorithm: HASH_ALGORITHM,
      hashNormalization: HASH_NORMALIZATION,
      contracts: [...results]
        .sort((a, b) => compareStrings(a.contract.id, b.contract.id))
        .map(({ contract, actual }) => ({
          id: contract.id,
          package: contract.package,
          interfaceName: contract.interfaceName,
          source: contract.source,
          interfaceVersion: actual.interfaceVersion,
          sourceHash: actual.sourceHash,
          ...(contract.note === undefined ? {} : { note: contract.note }),
        })),
    };
    try {
      writeFileSync(
        manifestPath,
        `${JSON.stringify(updated, null, 2)}\n`,
        'utf8',
      );
    } catch {
      throw new ConfigError(
        `cannot write contract freeze manifest: ${manifestPath}`,
      );
    }
    console.log(`contract freeze updated: ${manifestPath}`);
    return 0;
  }

  if (errors.length > 0) {
    reportDrift(errors);
    return 1;
  }

  const summary = results
    .map(
      ({ contract }) =>
        `${contract.interfaceName} ${contract.interfaceVersion} (${contract.sourceHash.slice(0, 19)}...)`,
    )
    .join(', ');
  console.log(`contract freeze OK: ${summary}`);
  return 0;
}

function printHelp() {
  console.log(`Usage:
  node scripts/check-contract-freeze.mjs [--manifest <file>] [--root <dir>]
  node scripts/check-contract-freeze.mjs --update [--manifest <file>] [--root <dir>]

Freezes @luban-cad/shared RPC interfaceVersion values and a deterministic hash
of each interface source file's exported surface (G1 J1.2).

Hash recipe: ${HASH_NORMALIZATION}. Comments and formatting are ignored;
exported types, fields, signatures and constants are covered. See the script
header and docs/architecture/INTERFACE-FREEZE-MATRIX.md.

Exit codes: 0 = frozen contract matches, 1 = drift, 2 = usage/configuration
error (missing/invalid manifest or source, TypeScript parser unavailable).

Intentional change: bump the interface version, run --update, and ship the
manifest with the paired backend/web PRs. --update never runs in CI.`);
}

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  manifest: { type: 'string' },
  root: { type: 'string' },
  update: { type: 'boolean' },
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
    // Do not echo argv: an unknown option could carry a secret value.
    const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
    console.error(`contract-freeze: invalid arguments${code}`);
    console.error('Run with --help for usage.');
    return 2;
  }

  const { values } = parsed;
  if (values.help) {
    printHelp();
    return 0;
  }

  try {
    return runCheck(values);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`contract-freeze: ${error.message}`);
      return 2;
    }
    console.error(
      `contract-freeze: unexpected error (${error?.name ?? 'Error'})`,
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
