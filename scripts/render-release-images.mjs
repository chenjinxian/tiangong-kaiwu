#!/usr/bin/env node
/**
 * Render the release compose image environment from release-manifest.json.
 *
 * The release compose is a template: every `image:` is exactly
 * `${RELEASE_*_IMAGE:?message}`. This tool resolves those variables to
 * `<name>@sha256:<digest>` using the manifest, so the manifest is the single
 * source of registry digests. It never invents digests, never reads secrets,
 * never calls docker/gh, and never accesses the network.
 *
 * It also validates the release profile and compose policy, so a typo in the
 * compose (unmapped image, literal image, non-edge port, defaulted secret)
 * fails here before an operator starts the stack.
 *
 * Usage:
 *   node scripts/render-release-images.mjs [--root <dir>]
 *     [--manifest release-manifest.json]
 *     [--profile deploy/release/release-profile.json]
 *     [--compose docker-compose.release.yml]
 *     [--out deploy/release/release-images.env] [--check]
 *
 * Exit codes: 0 = OK, 1 = invalid manifest/profile/compose or missing image,
 * 2 = usage error / unreadable input.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  RELEASE_COMPOSE_PATHS,
  RELEASE_PROFILE_PATH,
  loadReleaseProfile,
  renderReleaseImageEnv,
  validateReleaseCompose,
} from './release-profile-lib.mjs';
import { validateManifest } from './release-manifest.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = 'release-manifest.json';
const DEFAULT_COMPOSE = RELEASE_COMPOSE_PATHS[0];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function resolveFrom(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  } catch {
    throw new UsageError(`cannot read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`${path} is not valid JSON`);
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/render-release-images.mjs [--root <dir>]
    [--manifest <file>] [--profile <file>] [--compose <file>]
    [--out <file>] [--check]

Resolves every RELEASE_*_IMAGE variable in the release compose from
release-manifest.json and validates the release profile/compose policy.
--check validates only and writes nothing. Without --out the env lines are
printed to stdout.

Exit codes: 0 = OK, 1 = invalid manifest/profile/compose, 2 = usage error.`);
}

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        root: { type: 'string' },
        manifest: { type: 'string' },
        profile: { type: 'string' },
        compose: { type: 'string' },
        out: { type: 'string' },
        check: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      allowPositionals: false,
      strict: true,
    });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const values = parsed.values;
  if (values.help) {
    printHelp();
    return 0;
  }

  const root = resolve(values.root ?? REPO_ROOT);
  const manifestPath = resolveFrom(root, values.manifest ?? DEFAULT_MANIFEST);
  const profilePath = resolveFrom(root, values.profile ?? RELEASE_PROFILE_PATH);
  const composePath = resolveFrom(root, values.compose ?? DEFAULT_COMPOSE);

  if (!existsSync(composePath)) {
    throw new UsageError(
      `release compose not found: ${composePath} (release profile is required)`,
    );
  }

  const manifest = readJson(manifestPath);
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) {
    console.error('release manifest is invalid:');
    for (const error of manifestErrors) console.error(`  - ${error}`);
    return 1;
  }

  const profile = loadReleaseProfile(root, values.profile ?? RELEASE_PROFILE_PATH);
  if (!profile.exists) {
    console.error(`release profile not found: ${profilePath}`);
    return 1;
  }
  if (profile.errors.length > 0) {
    console.error('release profile is invalid:');
    for (const error of profile.errors) console.error(`  - ${error}`);
    return 1;
  }

  let composeText;
  try {
    composeText = readFileSync(composePath, 'utf8').replace(/^﻿/, '');
  } catch {
    throw new UsageError(`cannot read ${composePath}`);
  }
  const composeIssues = validateReleaseCompose(composeText, profile.value, {
    mode: 'release',
    profileValid: true,
  });
  for (const issue of composeIssues) {
    if (issue.severity === 'error') {
      console.error(
        `release compose error: ${issue.subject}: ${issue.message}` +
          (issue.line ? ` (line ${issue.line})` : ''),
      );
    } else {
      console.error(
        `release compose warning: ${issue.subject}: ${issue.message}`,
      );
    }
  }
  if (composeIssues.some((issue) => issue.severity === 'error')) return 1;

  const rendered = renderReleaseImageEnv(manifest, profile.value);
  if (rendered.errors.length > 0) {
    console.error('cannot resolve release images:');
    for (const error of rendered.errors) console.error(`  - ${error}`);
    return 1;
  }

  const header = [
    '# Generated by scripts/render-release-images.mjs. Do not edit.',
    `# Source manifest: ${values.manifest ?? DEFAULT_MANIFEST}`,
    '# Image references only. Never put secrets in this file.',
  ];
  const content = `${[...header, ...rendered.lines].join('\n')}\n`;

  if (values.check) {
    console.log(
      `release images OK: ${rendered.images.length} image(s) resolved from ${values.manifest ?? DEFAULT_MANIFEST}`,
    );
    return 0;
  }
  if (values.out !== undefined) {
    const outPath = resolveFrom(root, values.out);
    try {
      writeFileSync(outPath, content, 'utf8');
    } catch {
      throw new UsageError(`cannot write ${outPath}`);
    }
    console.log(`wrote ${values.out} (${rendered.images.length} image(s))`);
  } else {
    process.stdout.write(content);
  }
  return 0;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`error: ${error.message}`);
      process.exitCode = 2;
    } else {
      console.error(`error: ${error?.stack ?? error}`);
      process.exitCode = 2;
    }
  }
}
