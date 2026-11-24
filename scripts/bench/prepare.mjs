#!/usr/bin/env node
/**
 * Benchmark fixture preparation and validation.
 *
 * Commands:
 *   validate  validate an existing fixture manifest (and optionally its files)
 *   create    create an isolated iTwin/iModel, wait for the real baseline,
 *             generate real native changesets, and write a fixture manifest
 *   cleanup   delete only the resources recorded in a prepare state file
 *
 * `create` refuses non-loopback Hubs and requires --yes. It never generates
 * fake changeset files: if the native driver or the baseline is unavailable,
 * it fails closed with a clear blocker.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  assertBenchResourceName,
  assertNotLiveStackUrl,
  ensureExplicitYes,
  normalizeHubUrl,
  parseArgv,
  parseCount,
  usage,
} from './lib/args.mjs';
import { BenchError, toBlocker } from './lib/errors.mjs';
import {
  collectEnvironment,
  collectGitInfo,
  loadRepoEnv,
  resolveAzureOverrides,
  resolveHubCredentials,
  resolveRepoRoot,
} from './lib/env.mjs';
import { ensureDir, readJsonFile, writeJsonFile } from './lib/fsx.mjs';
import { HubClient } from './lib/hub.mjs';
import {
  buildManifestFromHub,
  loadManifest,
  validateManifest,
  verifyManifestFiles,
} from './lib/manifest.mjs';
import {
  generateChangesets,
  resolveNativeRuntime,
  shutdownNativeHost,
  startNativeHost,
} from './lib/native.mjs';

const SCRIPT = 'prepare.mjs';
const COMMANDS = ['validate', 'create', 'cleanup'];

const VALIDATE_SPEC = {
  manifest: { type: 'string', required: true, describe: 'fixture manifest JSON' },
  count: { type: 'int', min: 1, max: 1000, describe: 'expected change count (200 or 1000)' },
  'bundle-dir': { type: 'string', describe: 'fixture bundle directory for file verification' },
  'verify-files': { type: 'boolean', default: false, describe: 'verify referenced baseline/changeset files' },
  'require-hashes': { type: 'boolean', default: false, describe: 'require sha256 for every changeset' },
};

const CREATE_SPEC = {
  count: { type: 'int', required: true, min: 1, max: 1000, describe: '200 or 1000' },
  out: { type: 'string', required: true, describe: 'output directory (manifest + state + report)' },
  'hub-url': { type: 'string', describe: 'explicit isolated loopback Hub URL (required; live ports 5400/5401/5402/5301 are refused)' },
  'package-dir': { type: 'string', describe: 'directory with @itwin/core-backend + native addon' },
  'max-minutes': { type: 'int', min: 1, max: 600, default: 60, describe: 'changeset generation budget' },
  'wait-minutes': { type: 'int', min: 1, max: 60, default: 10, describe: 'baseline initialization budget' },
  'target-index': { type: 'int', min: 1, max: 1000, describe: 'benchmark an earlier changeset (default: head)' },
  'verify-downloads': { type: 'boolean', default: false, describe: 'download and hash every sealed changeset' },
  yes: { type: 'boolean', default: false, describe: 'confirm creation of isolated Hub resources' },
  'run-id': { type: 'string', describe: 'stable run id; generated when omitted' },
};

const CLEANUP_SPEC = {
  state: { type: 'string', required: true, describe: 'run-state.json written by create' },
  'hub-url': { type: 'string', describe: 'override the state Hub URL (must remain loopback)' },
  yes: { type: 'boolean', default: false, describe: 'confirm deletion of the recorded resources' },
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === undefined) {
    printAllUsage();
    process.exitCode = command === undefined ? 3 : 0;
    return;
  }
  if (!COMMANDS.includes(command)) {
    console.error(`unknown command "${command}"`);
    printAllUsage();
    process.exitCode = 3;
    return;
  }

  if (command === 'validate') return runValidate(rest);
  if (command === 'create') return runCreate(rest);
  return runCleanup(rest);
}

async function runValidate(argv) {
  let args;
  try {
    args = parseArgv(argv, VALIDATE_SPEC);
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    console.error(usage(SCRIPT, VALIDATE_SPEC, { summary: 'Validate a benchmark fixture manifest.' }));
    process.exitCode = 3;
    return;
  }
  try {
    const expectedCount = args.count === undefined ? undefined : parseCount(args.count);
    const manifest = loadManifest(args.manifest);
    const info = validateManifest(manifest, {
      expectedCount,
      requireHashes: args['require-hashes'] === true,
    });
    let files;
    if (args['verify-files']) {
      if (!args['bundle-dir']) {
        throw new BenchError('ARG_REQUIRED', '--verify-files requires --bundle-dir', { exitCode: 3 });
      }
      files = await verifyManifestFiles(manifest, { bundleDir: args['bundle-dir'] });
    }
    console.log(JSON.stringify({
      ok: true,
      fixtureId: manifest.fixtureId,
      changesetCount: info.count,
      target: info.target,
      head: info.head,
      checkpoint: info.checkpoint,
      files: files ?? null,
    }, null, 2));
    process.exitCode = 0;
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    process.exitCode = blocker.code?.startsWith('ARG_') ? 3 : 1;
  }
}

async function runCreate(argv) {
  const repoRoot = resolveRepoRoot();
  loadRepoEnv(repoRoot);
  let args;
  try {
    args = parseArgv(argv, CREATE_SPEC);
    args.count = parseCount(args.count);
    ensureExplicitYes(args.yes, 'create isolated Hub resources');
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    console.error(usage(SCRIPT, CREATE_SPEC, { summary: 'Create a real benchmark fixture in an isolated stack.' }));
    process.exitCode = 3;
    return;
  }

  let hubUrl;
  try {
    const rawHub = args['hub-url'] ?? process.env.BENCH_HUB_URL;
    if (!rawHub) {
      throw new BenchError(
        'ARG_REQUIRED',
        '--hub-url or BENCH_HUB_URL is required for create (use the isolated stack URL, for example http://127.0.0.1:15400)',
        { exitCode: 3 },
      );
    }
    hubUrl = assertNotLiveStackUrl(normalizeHubUrl(rawHub, { allowRemote: false }));
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    process.exitCode = 3;
    return;
  }
  const packageDir = resolvePackageDir(repoRoot, args['package-dir']);
  const outDir = ensureDir(path.resolve(args.out));
  const runId = args['run-id'] ?? makeRunId();
  const stateFile = path.join(outDir, 'run-state.json');
  const reportFile = path.join(outDir, 'prepare-report.json');
  const startedAt = new Date().toISOString();
  const environment = collectEnvironment({ repoRoot, hubUrl, packageDir });
  const nativeProbe = resolveNativeRuntime(packageDir);
  const state = {
    benchmark: true,
    schemaVersion: 'bench.cold-open.state.v1',
    runId,
    createdAt: startedAt,
    hubUrl,
    status: 'initializing',
    count: args.count,
    resources: {
      itwin: { id: null, name: assertBenchResourceName(`bench-${runId}`, { kind: 'iTwin' }) },
      imodel: { id: null, name: `bench-cold-open-${args.count}` },
    },
  };

  if (!nativeProbe.available) {
    writeJsonFile(reportFile, {
      schemaVersion: 'bench.cold-open.prepare.v1',
      ok: false,
      blocked: true,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      environment,
      native: nativeProbe,
      blocker: nativeProbe.blocker,
      resources: state.resources,
    });
    console.error(`${nativeProbe.blocker.code}: ${nativeProbe.blocker.message}`);
    process.exitCode = 2;
    return;
  }

  const credentials = resolveHubCredentials();
  const azure = resolveAzureOverrides();
  const hub = new HubClient({ baseUrl: hubUrl, apiKey: credentials.apiKey, token: credentials.token });
  const timings = {};
  let hostStarted = false;
  try {
    if (!credentials.token) await hub.login(credentials.email, credentials.password);
    let t0 = performance.now();
    const itwin = await hub.createItwin(state.resources.itwin.name);
    timings.createItwinMs = performance.now() - t0;
    state.resources.itwin.id = itwin.id;
    state.status = 'itwin-created';
    writeJsonFile(stateFile, state);

    t0 = performance.now();
    const imodel = await hub.createImodel({ iTwinId: itwin.id, name: state.resources.imodel.name });
    timings.createImodelMs = performance.now() - t0;
    state.resources.imodel.id = imodel.id;
    state.status = 'imodel-created';
    writeJsonFile(stateFile, state);

    t0 = performance.now();
    await hub.waitForImodelInitialized(imodel.id, {
      timeoutMs: args['wait-minutes'] * 60_000,
      onProgress: ({ state: baselineState }) => {
        console.error(`[prepare] baseline state: ${baselineState}`);
      },
    });
    timings.baselineMs = performance.now() - t0;
    state.status = 'baseline-initialized';
    writeJsonFile(stateFile, state);

    const existingHead = await hub.getHead(imodel.id);
    t0 = performance.now();
    await startNativeHost(nativeProbe.runtime, {
      hubUrl,
      apiKey: credentials.apiKey,
      email: credentials.email,
      password: credentials.password,
      token: credentials.token ?? hub.token,
      cacheDir: path.join(outDir, 'native-cache'),
      azureEndpoint: azure.endpoint,
      azurePublicHost: azure.publicHost,
    });
    hostStarted = true;
    const generated = await generateChangesets(nativeProbe.runtime, {
      iTwinId: itwin.id,
      iModelId: imodel.id,
      count: args.count,
      cacheDir: path.join(outDir, 'native-cache'),
      maxMinutes: args['max-minutes'],
      asOfChangesetId: existingHead.index > 0 ? existingHead.id : undefined,
      log: (message) => console.error(`[prepare:native] ${message}`),
      progress: ({ headIndex }) => {
        if (headIndex % 10 === 0 || headIndex === args.count) {
          console.error(`[prepare] changeset ${headIndex}/${args.count}`);
        }
      },
    });
    timings.generateMs = performance.now() - t0;
    state.status = 'changesets-generated';
    state.head = { id: generated.headId, index: generated.headIndex };
    writeJsonFile(stateFile, state);

    const changesets = await hub.getAllChangesets(imodel.id);
    if (changesets.length !== args.count) {
      throw new BenchError(
        'PREPARE_COUNT_MISMATCH',
        `Hub reports ${changesets.length} changesets, expected ${args.count}`,
      );
    }
    const head = changesets[changesets.length - 1];
    const targetIndex = args['target-index'] ?? head.index;
    if (targetIndex < 1 || targetIndex > head.index) {
      throw new BenchError('ARG_INVALID', `--target-index ${targetIndex} is outside 1..${head.index}`, { exitCode: 3 });
    }
    const targetEntry = changesets.find((entry) => entry.index === targetIndex);
    if (!targetEntry) {
      throw new BenchError('PREPARE_COUNT_MISMATCH', `target changeset index ${targetIndex} is missing from the Hub chain`);
    }

    const baselineInfo = await hub.getBaselineInfo(imodel.id).catch(() => undefined);
    const checkpointResponse = await hub.getCheckpoint(imodel.id, head.index);
    const checkpoint = normalizeCheckpoint(checkpointResponse);
    const manifest = buildManifestFromHub({
      fixtureId: `bench-${runId}`,
      changesets,
      target: { id: targetEntry.id, index: targetEntry.index },
      checkpoint,
      baselineFileSize: Number.isFinite(Number(baselineInfo?.fileSize)) ? Number(baselineInfo.fileSize) : undefined,
      source: {
        hubUrl,
        iTwinId: itwin.id,
        iModelId: imodel.id,
        generatedBy: 'scripts/bench/prepare.mjs',
        runId,
      },
      repository: collectGitInfo(repoRoot),
    });
    validateManifest(manifest);

    if (args['verify-downloads']) {
      await addVerifiedHashes(hub, changesets, manifest);
      validateManifest(manifest, { requireHashes: false });
    }

    const manifestFile = path.join(outDir, 'manifest.json');
    writeJsonFile(manifestFile, manifest);
    state.status = 'prepared';
    state.manifest = manifestFile;
    state.checkpoint = checkpoint;
    writeJsonFile(stateFile, state);

    writeJsonFile(reportFile, {
      schemaVersion: 'bench.cold-open.prepare.v1',
      ok: true,
      blocked: false,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      environment,
      native: { available: true, packageDir: nativeProbe.packageDir, versions: nativeProbe.versions },
      resources: state.resources,
      count: args.count,
      target: manifest.target,
      head: manifest.head,
      checkpoint,
      timings,
      manifest: manifestFile,
      stateFile,
      notes: checkpoint.available
        ? []
        : ['No post-baseline checkpoint is available. The checkpoint arm will fail closed until checkpoint generation is enabled and a successful checkpoint exists.'],
    });
    console.log(JSON.stringify({
      ok: true,
      runId,
      iTwinId: itwin.id,
      iModelId: imodel.id,
      changesetCount: manifest.changesetCount,
      target: manifest.target,
      head: manifest.head,
      checkpoint,
      manifest: manifestFile,
      state: stateFile,
      timings,
    }, null, 2));
    process.exitCode = 0;
  } catch (error) {
    const blocker = toBlocker(error);
    state.status = 'failed';
    state.error = blocker;
    try {
      writeJsonFile(stateFile, state);
    } catch {
      // State writing is best effort on failure.
    }
    writeJsonFile(reportFile, {
      schemaVersion: 'bench.cold-open.prepare.v1',
      ok: false,
      blocked: blocker.blocker === true,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      environment,
      native: nativeProbe.available
        ? { available: true, packageDir: nativeProbe.packageDir, versions: nativeProbe.versions }
        : nativeProbe,
      blocker,
      resources: state.resources,
      timings,
      stateFile,
    });
    console.error(`${blocker.code}: ${blocker.message}`);
    console.error(`resources (if created) must be cleaned up with: node scripts/bench/prepare.mjs cleanup --state "${stateFile}" --yes`);
    process.exitCode = blocker.blocker === true ? 2 : 1;
  } finally {
    if (hostStarted) await shutdownNativeHost(nativeProbe.runtime);
  }
}

async function runCleanup(argv) {
  const repoRoot = resolveRepoRoot();
  loadRepoEnv(repoRoot);
  let args;
  try {
    args = parseArgv(argv, CLEANUP_SPEC);
    ensureExplicitYes(args.yes, 'delete recorded Hub resources');
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    console.error(usage(SCRIPT, CLEANUP_SPEC, { summary: 'Delete only the resources recorded by prepare create.' }));
    process.exitCode = 3;
    return;
  }

  let state;
  try {
    state = readJsonFile(args.state, { label: 'prepare state' });
    if (state?.benchmark !== true || state.schemaVersion !== 'bench.cold-open.state.v1') {
      throw new BenchError('ARG_UNSAFE_RESOURCE', 'state file is not a benchmark prepare state');
    }
    assertBenchResourceName(state.resources?.itwin?.name, { kind: 'iTwin' });
    const expectedImodelName = state.resources?.imodel?.name;
    if (!/^bench-cold-open-\d+$/.test(String(expectedImodelName))) {
      throw new BenchError('ARG_UNSAFE_RESOURCE', `refusing to delete iModel "${expectedImodelName}"`);
    }
    if (!state.resources?.itwin?.id) {
      throw new BenchError('ARG_UNSAFE_RESOURCE', 'state file does not contain an iTwin id');
    }
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    process.exitCode = 3;
    return;
  }

  let hubUrl;
  try {
    hubUrl = assertNotLiveStackUrl(normalizeHubUrl(args['hub-url'] ?? state.hubUrl, { allowRemote: false }));
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    process.exitCode = 3;
    return;
  }
  const credentials = resolveHubCredentials();
  const hub = new HubClient({ baseUrl: hubUrl, apiKey: credentials.apiKey, token: credentials.token });
  const report = {
    schemaVersion: 'bench.cold-open.cleanup.v1',
    startedAt: new Date().toISOString(),
    hubUrl,
    runId: state.runId,
    resources: state.resources,
    deleted: {},
    errors: [],
  };
  try {
    if (!credentials.token) await hub.login(credentials.email, credentials.password);
    const imodelId = state.resources?.imodel?.id;
    if (!imodelId) {
      report.deleted.imodel = 'not-created';
    } else {
      try {
        await hub.deleteImodel(imodelId);
        report.deleted.imodel = true;
      } catch (error) {
        const blocker = toBlocker(error);
        if (blocker.details?.status === 404) report.deleted.imodel = 'already-missing';
        else {
          report.deleted.imodel = false;
          report.errors.push(blocker);
        }
      }
    }
    if (report.deleted.imodel !== false) {
      try {
        await hub.deleteItwin(state.resources.itwin.id);
        report.deleted.itwin = true;
      } catch (error) {
        const blocker = toBlocker(error);
        if (blocker.details?.status === 404) report.deleted.itwin = 'already-missing';
        else {
          report.deleted.itwin = false;
          report.errors.push(blocker);
        }
      }
    }
    state.status = report.errors.length === 0 ? 'deleted' : 'cleanup-partial';
    writeJsonFile(args.state, state);
    writeJsonFile(path.join(path.dirname(path.resolve(args.state)), 'cleanup-report.json'), {
      ...report,
      finishedAt: new Date().toISOString(),
      ok: report.errors.length === 0,
    });
    if (report.errors.length > 0) {
      console.error(JSON.stringify(report.errors, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, deleted: report.deleted }, null, 2));
      process.exitCode = 0;
    }
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    process.exitCode = 2;
  }
}

function normalizeCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.state !== 'successful' || !Number.isInteger(checkpoint.changesetIndex)) {
    return { available: false };
  }
  if (checkpoint.changesetIndex <= 0 || typeof checkpoint.changesetId !== 'string') {
    return { available: false };
  }
  return {
    available: true,
    id: checkpoint.changesetId,
    index: checkpoint.changesetIndex,
    ...(Number.isFinite(Number(checkpoint.fileSize)) ? { fileSize: Number(checkpoint.fileSize) } : {}),
  };
}

async function addVerifiedHashes(hub, changesets, manifest) {
  for (const entry of changesets) {
    const url = entry?._links?.download?.href;
    if (!url) continue;
    const downloaded = await hub.downloadBytes(url);
    if (entry.fileSize !== undefined && downloaded.bytes !== entry.fileSize) {
      throw new BenchError(
        'FIXTURE_HASH_MISMATCH',
        `changeset ${entry.index} downloaded ${downloaded.bytes} bytes, Hub metadata says ${entry.fileSize}`,
      );
    }
    const target = manifest.changesets.find((item) => item.index === entry.index);
    if (target) target.sha256 = downloaded.sha256;
  }
}

function resolvePackageDir(repoRoot, explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.BENCH_NATIVE_PACKAGE_DIR) return path.resolve(process.env.BENCH_NATIVE_PACKAGE_DIR);
  const fallback = path.join(repoRoot, 'dist-backend', 'modeling-server');
  return existsSync(path.join(fallback, 'package.json')) ? fallback : null;
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').toLowerCase();
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${random}`;
}

function printAllUsage() {
  console.error(usage(`${SCRIPT} <validate|create|cleanup>`, {}, {
    summary: 'Prepare and validate reproducible cold-open benchmark fixtures.',
  }));
  console.error('');
  console.error('Commands: validate, create, cleanup');
  console.error('Run `node scripts/bench/prepare.mjs <command> --help` for command-specific usage (or read docs/operations/COLD-OPEN-BENCHMARK.md).');
}

main().catch((error) => {
  const blocker = toBlocker(error);
  console.error(`${blocker.code}: ${blocker.message}`);
  process.exitCode = 1;
});
