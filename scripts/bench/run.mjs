#!/usr/bin/env node
/**
 * Cold-open benchmark runner.
 *
 * Usage:
 *   node scripts/bench/run.mjs --fixture <manifest.json> --out <dir> \
 *     --count 200 --arm baseline --mode cold --samples 5
 *
 * Every sample is a fresh Node process. In cold mode it also gets a fresh
 * local briefcase cache. The runner never writes to the Hub: it downloads
 * unassigned briefcases (briefcaseId 0) and verifies target/head identity
 * before and after the run.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv, parseCount, normalizeHubUrl, usage } from './lib/args.mjs';
import { BenchError, toBlocker } from './lib/errors.mjs';
import {
  collectEnvironment,
  loadRepoEnv,
  resolveAzureOverrides,
  resolveHubCredentials,
  resolveRepoRoot,
} from './lib/env.mjs';
import { ensureDir, makeTempDir, readJsonFile, removeDirSafe, writeJsonFile } from './lib/fsx.mjs';
import { HubClient } from './lib/hub.mjs';
import { loadManifest, validateManifest } from './lib/manifest.mjs';
import { resolveNativeRuntime } from './lib/native.mjs';
import { createReport, renderMarkdown, validateReport } from './lib/report.mjs';

const SCRIPT = 'run.mjs';
const SPEC = {
  fixture: { type: 'string', required: true, describe: 'fixture manifest JSON produced by prepare.mjs' },
  out: { type: 'string', required: true, describe: 'output directory for report.json/report.md' },
  count: { type: 'int', min: 1, max: 1000, describe: 'expected change count (200 or 1000)' },
  arm: { type: 'enum', values: ['baseline', 'checkpoint'], default: 'baseline', describe: 'download arm' },
  mode: { type: 'enum', values: ['cold', 'warm'], default: 'cold', describe: 'cold = fresh cache per sample; warm = reuse first sample cache' },
  samples: { type: 'int', min: 1, max: 50, default: 5, describe: 'number of measured opens' },
  'hub-url': { type: 'string', describe: 'Hub base URL (or BENCH_HUB_URL); required, never defaulted to the live stack' },
  'package-dir': { type: 'string', describe: 'directory with @itwin/core-backend + native addon (default dist-backend/modeling-server)' },
  'sample-timeout-ms': { type: 'int', min: 10_000, max: 7_200_000, default: 900_000, describe: 'per-sample hard timeout' },
  'max-minutes': { type: 'int', min: 1, max: 600, default: 60, describe: 'whole-run time budget' },
  'allow-remote': { type: 'boolean', default: false, describe: 'allow a non-loopback Hub (read-only run; never used by prepare create/cleanup)' },
  'run-id': { type: 'string', describe: 'stable run id; generated when omitted' },
};

const LIMITATIONS = [
  'Cold means a fresh OS process and (in cold mode) a fresh local briefcase cache per sample; OS page cache, DNS and network caches are not flushed.',
  'download.bytes is derived from Hub metadata (sealed changeset fileSize plus checkpoint size when the Hub exposes it) or, when the Hub projection omits the V2 checkpoint size, from the native downloaded checkpoint file size. It is not an OS socket counter; checkpoint internals may transfer a different number of bytes.',
  'firstTree/firstBodies/firstSketch are ECSql read probes executed on the opened briefcase; they are not the full UI tree, viewport renderer, or MS FeatureOp read path.',
  'firstSketch is measured only when the fixture contains the LubanCAD.Sketch schema; otherwise the phase is explicitly reported unsupported and no value is fabricated.',
  'Target values are Gate 0 decisions. This harness records evidence; it does not declare a build acceptable.',
];

async function main() {
  const argv = process.argv.slice(2);
  let args;
  try {
    args = parseArgv(argv, SPEC);
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    console.error(usage(SCRIPT, SPEC, { summary: 'Measure cold opens of a prepared benchmark iModel.' }));
    process.exitCode = blocker.code?.startsWith('ARG_') ? 3 : 1;
    return;
  }

  const repoRoot = resolveRepoRoot();
  loadRepoEnv(repoRoot);
  let hubUrl;
  try {
    const rawHub = args['hub-url'] ?? process.env.BENCH_HUB_URL;
    if (!rawHub) {
      throw new BenchError(
        'ARG_REQUIRED',
        '--hub-url or BENCH_HUB_URL is required (use the isolated stack URL, for example http://127.0.0.1:15400)',
        { exitCode: 3 },
      );
    }
    hubUrl = normalizeHubUrl(rawHub, { allowRemote: args['allow-remote'] === true });
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    console.error(usage(SCRIPT, SPEC, { summary: 'Measure cold opens of a prepared benchmark iModel.' }));
    process.exitCode = 3;
    return;
  }
  const packageDir = resolvePackageDir(repoRoot, args['package-dir']);
  const runId = args['run-id'] ?? makeRunId();
  const outDir = path.resolve(args.out);
  ensureDir(outDir);

  const manifest = loadManifest(args.fixture);
  const expectedCount = args.count === undefined ? undefined : parseCount(args.count);
  let manifestInfo;
  try {
    manifestInfo = validateManifest(manifest, { expectedCount });
  } catch (error) {
    const blocker = toBlocker(error);
    console.error(`${blocker.code}: ${blocker.message}`);
    process.exitCode = 3;
    return;
  }

  const fixture = fixtureBlock(manifest);
  const environment = collectEnvironment({ repoRoot, hubUrl, packageDir });
  const nativeProbe = toNativeProbe(resolveNativeRuntime(packageDir));
  const startedAt = new Date().toISOString();
  const command = [process.execPath, `scripts/bench/${SCRIPT}`, ...argv];

  if (!nativeProbe.available) {
    const report = createReport({
      runId,
      mode: args.mode,
      arm: args.arm,
      requestedSamples: args.samples,
      count: manifestInfo.count,
      command,
      environment,
      fixture,
      nativeProbe,
      samples: [],
      correctness: notEvaluated('native runtime unavailable'),
      blockers: [nativeProbe.blocker],
      notes: ['No open was attempted because the native driver is unavailable.'],
      limitations: LIMITATIONS,
      startedAt,
    });
    finishReport(outDir, report);
    process.exitCode = 2;
    return;
  }

  const credentials = resolveHubCredentials();
  const azure = resolveAzureOverrides();
  const hub = new HubClient({ baseUrl: hubUrl, apiKey: credentials.apiKey, token: credentials.token });
  let preflight;
  try {
    if (!credentials.token) await hub.login(credentials.email, credentials.password);
    preflight = await preflightHub(hub, { manifestInfo, arm: args.arm });
  } catch (error) {
    const blocker = toBlocker(error);
    const report = createReport({
      runId,
      mode: args.mode,
      arm: args.arm,
      requestedSamples: args.samples,
      count: manifestInfo.count,
      command,
      environment,
      fixture,
      nativeProbe,
      samples: [],
      correctness: notEvaluated(`preflight failed: ${blocker.message}`),
      blockers: [blocker],
      notes: ['No sample was attempted because Hub preflight failed.'],
      limitations: LIMITATIONS,
      startedAt,
    });
    finishReport(outDir, report);
    process.exitCode = 2;
    return;
  }

  const fixtureFailures = preflightMismatches(preflight, manifestInfo);
  if (fixtureFailures.length > 0) {
    const report = createReport({
      runId,
      mode: args.mode,
      arm: args.arm,
      requestedSamples: args.samples,
      count: manifestInfo.count,
      command,
      environment,
      fixture,
      nativeProbe,
      samples: [],
      correctness: correctnessBlock({
        failures: fixtureFailures,
        pass: false,
        targetUnchanged: false,
        headUnchanged: false,
        before: preflight.head,
        after: null,
        manifestInfo,
      }),
      blockers: [],
      notes: ['The Hub chain no longer matches the fixture. No sample was attempted.'],
      limitations: LIMITATIONS,
      startedAt,
    });
    finishReport(outDir, report);
    process.exitCode = 1;
    return;
  }

  const samples = [];
  const blockers = [];
  const notes = [];
  const failures = [];
  const started = Date.now();
  const warmCache = args.mode === 'warm' ? makeTempDir('tk-bench-warm-') : null;
  const samplesDir = ensureDir(path.join(outDir, 'samples'));

  try {
    for (let index = 1; index <= args.samples; index += 1) {
      if (Date.now() - started > args['max-minutes'] * 60_000) {
        blockers.push({
          code: 'RUN_TIME_BUDGET_EXCEEDED',
          message: `stopped after ${index - 1} sample(s) to respect --max-minutes ${args['max-minutes']}`,
          blocker: true,
        });
        break;
      }
      const cold = args.mode === 'cold' || index === 1;
      const cacheDir = args.mode === 'cold' ? makeTempDir('tk-bench-cold-') : warmCache;
      const requestFile = path.join(samplesDir, `sample-${index}.request.json`);
      const resultFile = path.join(samplesDir, `sample-${index}.result.json`);
      writeJsonFile(requestFile, {
        repoRoot,
        hubUrl,
        arm: args.arm,
        iTwinId: preflight.imodel.iTwinId,
        iModelId: preflight.imodel.id,
        target: { id: manifestInfo.target.id, index: manifestInfo.target.index },
        expectedHead: { id: manifestInfo.head.id, index: manifestInfo.head.index },
        checkpoint:
          args.arm === 'checkpoint'
            ? { id: manifestInfo.checkpoint.id, index: manifestInfo.checkpoint.index }
            : null,
        cacheDir,
        packageDir,
        cold,
        reuseDownloadedFile: args.mode === 'warm' && index > 1,
      });

      const child = await runSample({
        requestFile,
        resultFile,
        timeoutMs: args['sample-timeout-ms'],
        env: {
          ...process.env,
          ...(hub.token ? { BENCH_HUB_TOKEN: hub.token } : {}),
        },
      });
      const sample = toSample(index, cold, resultFile, child);
      samples.push(sample);
      notes.push(...(sample.notes ?? []));
      if (!sample.ok) {
        if (sample.blocked) {
          blockers.push({ code: sample.code ?? 'SAMPLE_BLOCKED', message: sample.message ?? 'sample blocked', blocker: true });
          if (args.mode === 'cold') removeDirSafe(cacheDir);
          break;
        }
        failures.push(`sample ${index}: ${sample.code ?? 'SAMPLE_FAILED'} ${sample.message ?? ''}`.trim());
      }
      const failedCheck = (sample.checks ?? []).find((check) => check.pass !== true);
      if (failedCheck) {
        failures.push(`sample ${index}: check ${failedCheck.name} failed (expected ${JSON.stringify(failedCheck.expected)}, actual ${JSON.stringify(failedCheck.actual)})`);
      }
      if (args.mode === 'cold') removeDirSafe(cacheDir);
    }
  } finally {
    if (warmCache) removeDirSafe(warmCache);
  }

  let afterHead = null;
  try {
    const after = await hub.getHead(preflight.imodel.id);
    afterHead = { id: after.id, index: after.index };
  } catch (error) {
    const blocker = toBlocker(error);
    failures.push(`post-run head query failed: ${blocker.message}`);
  }

  const targetUnchanged =
    samples.length > 0 &&
    samples.every((sample) =>
      (sample.checks ?? []).filter((check) => /^(hub|native)\.target\.matchesFixture$/.test(check.name)).every((check) => check.pass === true),
    );
  const headUnchanged =
    preflight.head.id === manifestInfo.head.id &&
    preflight.head.index === manifestInfo.head.index &&
    afterHead?.id === manifestInfo.head.id &&
    afterHead?.index === manifestInfo.head.index;
  if (!headUnchanged) {
    failures.push(
      `head identity changed: expected ${manifestInfo.head.id}@${manifestInfo.head.index}, ` +
        `before ${preflight.head.id}@${preflight.head.index}, after ${afterHead?.id ?? 'n/a'}@${afterHead?.index ?? 'n/a'}`,
    );
  }
  const pass =
    failures.length === 0 &&
    blockers.length === 0 &&
    samples.length === args.samples &&
    samples.every((sample) => sample.ok === true) &&
    targetUnchanged &&
    headUnchanged;

  const report = createReport({
    runId,
    mode: args.mode,
    arm: args.arm,
    requestedSamples: args.samples,
    count: manifestInfo.count,
    command,
    environment,
    fixture,
    nativeProbe,
    samples,
    correctness: correctnessBlock({
      failures,
      pass,
      targetUnchanged,
      headUnchanged,
      before: preflight.head,
      after: afterHead,
      manifestInfo,
    }),
    blockers,
    notes: dedupe([...notes, ...bytesNotes(samples, fixture)]),
    limitations: LIMITATIONS,
    startedAt,
  });
  finishReport(outDir, report);
  process.exitCode = report.verdict === 'pass' ? 0 : report.verdict === 'blocked' ? 2 : 1;
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

function toNativeProbe(probe) {
  if (probe.available) {
    return { available: true, packageDir: probe.packageDir, versions: probe.versions };
  }
  return { available: false, packageDir: probe.packageDir, blocker: probe.blocker };
}

function fixtureBlock(manifest) {
  return {
    fixtureId: manifest.fixtureId,
    changesetCount: manifest.changesetCount,
    head: manifest.head,
    target: manifest.target,
    checkpoint: manifest.checkpoint ?? { available: false },
    baseline: manifest.baseline ?? { checkpointIndex: 0 },
    source: manifest.source ?? null,
  };
}

async function preflightHub(hub, { manifestInfo, arm }) {
  const imodel = await hub.getImodel(readSourceImodelId(manifestInfo));
  const changesets = await hub.getAllChangesets(imodel.id);
  const head = changesets.length > 0
    ? { id: changesets[changesets.length - 1].id, index: changesets[changesets.length - 1].index }
    : { id: '', index: 0 };
  const targetEntry = changesets.find((entry) => entry.index === manifestInfo.target.index);
  const target = targetEntry ? { id: targetEntry.id, index: targetEntry.index } : null;
  let checkpoint = null;
  if (arm === 'baseline') {
    checkpoint = await hub.getCheckpoint(imodel.id, 0);
  } else {
    if (!manifestInfo.checkpoint?.available) {
      throw new BenchError(
        'CHECKPOINT_ARM_UNAVAILABLE',
        'fixture has no successful post-baseline checkpoint; rerun prepare after checkpoint generation is enabled',
      );
    }
    const found = await hub.getCheckpoint(imodel.id, manifestInfo.checkpoint.index);
    if (!found || found.changesetIndex !== manifestInfo.checkpoint.index || found.changesetId !== manifestInfo.checkpoint.id) {
      throw new BenchError(
        'CHECKPOINT_ARM_UNAVAILABLE',
        `Hub no longer exposes fixture checkpoint ${manifestInfo.checkpoint.id}@${manifestInfo.checkpoint.index}`,
      );
    }
    checkpoint = found;
  }
  if (arm === 'baseline' && !checkpoint) {
    throw new BenchError('BASELINE_CHECKPOINT_MISSING', 'Hub has no successful baseline checkpoint at index 0');
  }
  return { imodel, changesets, head, target, checkpoint };
}

function readSourceImodelId(manifestInfo) {
  const id = manifestInfo.manifest.source?.iModelId;
  if (!id) throw new BenchError('MANIFEST_INVALID', 'fixture source.iModelId is required to locate the benchmark iModel');
  return id;
}

function preflightMismatches(preflight, manifestInfo) {
  const failures = [];
  if (!preflight.target) {
    failures.push(`target changeset index ${manifestInfo.target.index} is not present in the Hub chain`);
  } else if (preflight.target.id !== manifestInfo.target.id || preflight.target.index !== manifestInfo.target.index) {
    failures.push(
      `target changed: expected ${manifestInfo.target.id}@${manifestInfo.target.index}, ` +
        `actual ${preflight.target.id}@${preflight.target.index}`,
    );
  }
  if (preflight.head.id !== manifestInfo.head.id || preflight.head.index !== manifestInfo.head.index) {
    failures.push(
      `head changed: expected ${manifestInfo.head.id}@${manifestInfo.head.index}, ` +
        `actual ${preflight.head.id}@${preflight.head.index}`,
    );
  }
  if (preflight.imodel.state !== 'initialized') {
    failures.push(`iModel state is ${preflight.imodel.state}, expected initialized`);
  }
  return failures;
}

function runSample({ requestFile, resultFile, timeoutMs, env }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(path.dirname(fileURLToPath(import.meta.url)), 'cold-open-runner.mjs'), '--request', requestFile, '--result', resultFile],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env },
    );
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-2_000_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000_000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, timedOut, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}

function toSample(index, cold, resultFile, child) {
  let raw;
  try {
    raw = existsSync(resultFile) ? readJsonFile(resultFile, { label: 'sample result' }) : undefined;
  } catch (error) {
    raw = undefined;
  }
  if (!raw) {
    const reason = child.timedOut
      ? 'sample timed out'
      : `sample produced no result file (exit ${child.code ?? 'n/a'}${child.signal ? `, signal ${child.signal}` : ''})`;
    return {
      index,
      cold,
      ok: false,
      blocked: true,
      code: child.timedOut ? 'SAMPLE_TIMEOUT' : 'SAMPLE_NO_RESULT',
      message: `${reason}: ${lastLine(child.stderr)}`,
      metrics: {},
      checks: [],
      details: {},
      notes: [],
    };
  }
  const metrics = {};
  for (const [name, value] of Object.entries(raw.metrics ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) metrics[name] = value;
  }
  return {
    index,
    cold,
    ok: raw.ok === true,
    blocked: raw.blocked === true,
    code: raw.code,
    message: raw.message,
    metrics,
    checks: Array.isArray(raw.checks) ? raw.checks : [],
    details: raw.details ?? {},
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

function lastLine(text) {
  const lines = String(text ?? '').trim().split(/\r?\n/).filter(Boolean);
  return lines.length === 0 ? '' : lines[lines.length - 1].slice(0, 500);
}

function correctnessBlock({ failures, pass, targetUnchanged, headUnchanged, before, after, manifestInfo }) {
  return {
    pass,
    targetUnchanged,
    headUnchanged,
    failures,
    before,
    after,
    expected: {
      headId: manifestInfo.head.id,
      headIndex: manifestInfo.head.index,
      targetId: manifestInfo.target.id,
      targetIndex: manifestInfo.target.index,
    },
  };
}

function notEvaluated(reason) {
  return {
    pass: false,
    targetUnchanged: undefined,
    headUnchanged: undefined,
    failures: [`not evaluated: ${reason}`],
    before: null,
    after: null,
  };
}

function bytesNotes(samples, fixture) {
  const first = samples.find((sample) => sample.details?.resolved);
  if (!first) return [];
  const resolved = first.details.resolved;
  if (resolved.bytesComplete) {
    return [
      `download.bytes = ${resolved.totalBytes} bytes (checkpoint ${resolved.checkpointBytes} + changesets ${resolved.changesetBytes}); source: ${resolved.bytesSource ?? 'hub-metadata'}.`,
    ];
  }
  return [
    `Hub did not expose the checkpoint size for this arm; download.bytes is omitted and download.changesetBytes (${resolved.changesetBytes}) is a lower bound.`,
  ];
}

function dedupe(values) {
  return [...new Set(values)];
}

function finishReport(outDir, report) {
  validateReport(report);
  const jsonPath = path.join(outDir, 'report.json');
  const mdPath = path.join(outDir, 'report.md');
  writeJsonFile(jsonPath, report);
  writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  const summary = report.metrics['hub.resolve.ms'];
  console.log(`report: ${jsonPath}`);
  console.log(`markdown: ${mdPath}`);
  console.log(`verdict: ${report.verdict.toUpperCase()}`);
  console.log(`samples: ${report.config.completedSamples}/${report.config.requestedSamples}`);
  if (summary) {
    console.log(`hub.resolve.ms p50=${summary.p50.toFixed(1)} p95=${summary.p95.toFixed(1)}`);
  }
  for (const blocker of report.blockers) console.log(`blocked: ${blocker.code}: ${blocker.message}`);
}

main().catch((error) => {
  const blocker = toBlocker(error);
  console.error(`${blocker.code}: ${blocker.message}`);
  process.exitCode = 1;
});
