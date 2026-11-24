#!/usr/bin/env node
/**
 * Internal one-sample cold-open runner.
 *
 * This process is spawned fresh by run.mjs for every sample. It:
 *   1. resolves the immutable target and head through the Hub REST API;
 *   2. computes the expected download payload from Hub metadata;
 *   3. (optionally) downloads/opens through the optional native driver;
 *   4. writes one JSON result file.
 *
 * It never writes to the Hub. Native briefcases are unassigned (briefcaseId 0)
 * and the local file is marked NoLocking before any pull/open.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgv } from './lib/args.mjs';
import { BenchError, toBlocker } from './lib/errors.mjs';
import { loadRepoEnv, resolveAzureOverrides, resolveHubCredentials } from './lib/env.mjs';
import { writeJsonFile } from './lib/fsx.mjs';
import { HubClient } from './lib/hub.mjs';
import { resolveNativeRuntime, runColdOpen, shutdownNativeHost, startNativeHost } from './lib/native.mjs';
import { redactSecrets } from './lib/report.mjs';

const SPEC = {
  request: { type: 'string', required: true, describe: 'request JSON file' },
  result: { type: 'string', required: true, describe: 'result JSON file' },
};

async function main() {
  const args = parseArgv(process.argv.slice(2), SPEC);
  const request = JSON.parse(readFileSync(args.request, 'utf8'));
  loadRepoEnv(request.repoRoot);
  const credentials = resolveHubCredentials();
  const azure = resolveAzureOverrides();

  const result = {
    ok: false,
    cold: request.cold !== false,
    blocked: false,
    metrics: {},
    checks: [],
    details: {},
    notes: [],
  };

  let hub;
  try {
    hub = new HubClient({ baseUrl: request.hubUrl, apiKey: credentials.apiKey, token: credentials.token });
    if (!credentials.token) await hub.login(credentials.email, credentials.password);

    const resolved = await resolveHubState(hub, request);
    mergeMetrics(result.metrics, resolved.metrics);
    result.details.resolved = resolved.details;
    result.checks.push(...resolved.checks);
    if (!resolved.checks.every((check) => check.pass)) {
      result.ok = false;
      result.blocked = false;
      result.code = 'FIXTURE_TARGET_MISMATCH';
      result.message = 'Hub state no longer matches the fixture manifest';
      return finish(args.result, result);
    }
  } catch (error) {
    const blocker = toBlocker(error);
    result.blocked = true;
    result.code = blocker.code;
    result.message = blocker.message;
    result.details.error = blocker.details;
    return finish(args.result, result);
  }

  if (request.native === false) {
    result.ok = true;
    result.notes.push('native phases intentionally skipped (--no-native requested by the parent)');
    return finish(args.result, result);
  }

  const native = resolveNativeRuntime(request.packageDir);
  if (!native.available) {
    result.blocked = true;
    result.code = native.blocker.code;
    result.message = native.blocker.message;
    result.details.nativeBlocker = native.blocker;
    return finish(args.result, result);
  }

  let hostStarted = false;
  try {
    if (request.reuseDownloadedFile && existsSync(path.join(request.cacheDir, 'cold.bim'))) {
      result.notes.push('reused the local briefcase file from a previous warm sample; download time is reported as 0');
    }
    await startNativeHost(native.runtime, {
      hubUrl: request.hubUrl,
      apiKey: credentials.apiKey,
      email: credentials.email,
      password: credentials.password,
      token: credentials.token ?? hub.token,
      cacheDir: request.cacheDir,
      azureEndpoint: azure.endpoint,
      azurePublicHost: azure.publicHost,
    });
    hostStarted = true;
    const nativeResult = await runColdOpen(native.runtime, {
      arm: request.arm,
      iTwinId: request.iTwinId,
      iModelId: request.iModelId,
      target: request.target,
      checkpoint: request.checkpoint,
      cacheDir: request.cacheDir,
      reuseDownloadedFile: request.reuseDownloadedFile === true,
    });
    mergeMetrics(result.metrics, nativeResult.metrics);
    mergeDownloadBytes(result, nativeResult, result.details.resolved);
    result.details.native = nativeResult.details;
    result.checks.push({
      name: 'native.target.matchesFixture',
      pass: nativeResult.ok === true,
      expected: request.target,
      actual: nativeResult.details?.target ?? null,
    });
    const sketch = nativeResult.details?.probes?.sketch;
    if (sketch && sketch.supported === false) {
      result.notes.push(sketch.reason ?? sketch.error ?? 'firstSketch probe unsupported');
    }
    result.ok = true;
    return finish(args.result, result);
  } catch (error) {
    const blocker = toBlocker(error);
    result.blocked = true;
    result.code = blocker.code;
    result.message = blocker.message;
    result.details.error = blocker.details;
    return finish(args.result, result);
  } finally {
    if (hostStarted) await shutdownNativeHost(native.runtime);
  }
}

async function resolveHubState(hub, request) {
  const started = performance.now();
  const imodel = await hub.getImodel(request.iModelId);
  const changesets = await hub.getAllChangesets(request.iModelId);
  const head = changesets.length > 0
    ? changesets[changesets.length - 1]
    : { id: '', index: 0, fileSize: 0 };

  const targetIndex = request.target.index;
  const targetEntry = changesets.find((entry) => entry.index === targetIndex);
  if (!targetEntry) {
    throw new BenchError('HUB_TARGET_NOT_FOUND', `target changeset index ${targetIndex} is not present in the Hub chain`);
  }

  let checkpoint;
  let baselineInfo;
  if (request.arm === 'baseline') {
    checkpoint = await hub.getCheckpoint(request.iModelId, 0);
    baselineInfo = await hub.getBaselineInfo(request.iModelId).catch(() => undefined);
  } else {
    checkpoint = await hub.getCheckpoint(request.iModelId, targetIndex);
    if (!checkpoint || checkpoint.changesetIndex === undefined) {
      throw new BenchError('CHECKPOINT_ARM_UNAVAILABLE', 'Hub has no successful checkpoint for the checkpoint arm');
    }
    if (checkpoint.changesetIndex === 0) {
      throw new BenchError(
        'CHECKPOINT_ARM_UNAVAILABLE',
        'the latest successful checkpoint is the baseline (index 0); no post-baseline checkpoint exists',
      );
    }
  }

  const checkpointIndex = checkpoint?.changesetIndex ?? 0;
  const applied = changesets.filter((entry) => entry.index > checkpointIndex && entry.index <= targetIndex);
  const changesetBytes = applied.reduce((sum, entry) => sum + (Number(entry.fileSize) || 0), 0);
  let checkpointBytes = null;
  if (Number.isFinite(Number(checkpoint?.fileSize)) && Number(checkpoint.fileSize) > 0) {
    checkpointBytes = Number(checkpoint.fileSize);
  } else if (request.arm === 'baseline' && Number.isFinite(Number(baselineInfo?.fileSize))) {
    checkpointBytes = Number(baselineInfo.fileSize);
  } else if (checkpoint?._links?.download?.href) {
    checkpointBytes = await hub.headContentLength(checkpoint._links.download.href);
  }
  const totalBytes = checkpointBytes === null ? changesetBytes : checkpointBytes + changesetBytes;

  const elapsed = performance.now() - started;
  const chainContiguous = changesets.every((entry, index) => entry.index === index + 1);
  const checks = [
    {
      name: 'hub.head.matchesFixture',
      pass: head.id === request.expectedHead.id && head.index === request.expectedHead.index,
      expected: request.expectedHead,
      actual: { id: head.id, index: head.index },
    },
    {
      name: 'hub.target.matchesFixture',
      pass: targetEntry.id === request.target.id && targetEntry.index === request.target.index,
      expected: request.target,
      actual: { id: targetEntry.id, index: targetEntry.index },
    },
    {
      name: 'hub.chain.contiguous',
      pass: chainContiguous,
      expected: `indexes 1..${changesets.length}`,
      actual: { count: changesets.length, firstIndex: changesets[0]?.index ?? null, lastIndex: head.index },
    },
  ];
  if (request.arm === 'checkpoint') {
    checks.push({
      name: 'hub.checkpoint.available',
      pass: Number.isInteger(checkpoint?.changesetIndex) && checkpoint.changesetIndex > 0,
      expected: 'successful checkpoint index > 0',
      actual: checkpoint?.changesetIndex ?? null,
    });
  }

  return {
    metrics: {
      'hub.resolve.ms': elapsed,
      'download.changesetBytes': changesetBytes,
      ...(checkpointBytes === null ? {} : { 'download.checkpointBytes': checkpointBytes }),
      ...(checkpointBytes === null ? {} : { 'download.bytes': totalBytes }),
    },
    checks,
    details: {
      imodel: { id: imodel.id, iTwinId: imodel.iTwinId, state: imodel.state, changesetCount: imodel.changesetCount },
      head: { id: head.id, index: head.index },
      target: { id: targetEntry.id, index: targetEntry.index },
      checkpoint: checkpoint
        ? { id: checkpoint.changesetId, index: checkpoint.changesetIndex, state: checkpoint.state }
        : null,
      changesetCount: changesets.length,
      changesetsToApply: applied.length,
      changesetBytes,
      checkpointBytes,
      totalBytes,
      bytesComplete: checkpointBytes !== null,
      bytesSource: checkpointBytes === null ? 'changeset-metadata-only' : 'hub-metadata',
    },
  };
}

function mergeMetrics(target, source) {
  for (const [name, value] of Object.entries(source ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) target[name] = value;
  }
}

/**
 * Some Hub projections do not expose a V2 checkpoint container size. In that
 * case use the native download's local checkpoint file size (a reproducible
 * proxy for the checkpoint payload) instead of inventing a number.
 */
function mergeDownloadBytes(result, nativeResult, resolved) {
  if (!resolved || typeof resolved !== 'object') return;
  const existing = result.metrics['download.checkpointBytes'];
  if (typeof existing === 'number' && existing > 0) return;
  const size = nativeResult.details?.checkpointFileSize;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return;
  const localCache = nativeResult.details?.downloadSource === 'local-cache';
  if (localCache) {
    result.metrics['download.changesetBytes'] = 0;
    resolved.changesetBytes = 0;
  }
  const changesetBytes = Number(resolved.changesetBytes) || 0;
  const totalBytes = localCache ? size : size + changesetBytes;
  result.metrics['download.checkpointBytes'] = size;
  result.metrics['download.bytes'] = totalBytes;
  resolved.checkpointBytes = size;
  resolved.totalBytes = totalBytes;
  resolved.bytesComplete = true;
  resolved.bytesSource = localCache ? 'local-cache-file-size' : 'native-local-checkpoint-file';
  result.notes.push(
    localCache
      ? `download.bytes is the local cached briefcase size (${size} bytes); no network download occurred in this warm sample.`
      : `download.bytes uses the native checkpoint file size (${size} bytes) because the Hub projection did not expose it.`,
  );
}

function finish(resultFile, result) {
  writeJsonFile(resultFile, redactSecrets(result));
  process.exitCode = 0;
}

main().catch((error) => {
  const blocker = toBlocker(error, 'RUNNER_FATAL');
  try {
    const args = parseArgv(process.argv.slice(2), SPEC);
    writeJsonFile(args.result, redactSecrets({
      ok: false,
      cold: true,
      blocked: true,
      metrics: {},
      checks: [],
      details: {},
      notes: [],
      code: blocker.code,
      message: blocker.message,
    }));
  } catch {
    // Nothing else can be done; the parent will report a missing result file.
  }
  console.error(`[cold-open-runner] ${blocker.code}: ${blocker.message}`);
  process.exitCode = 2;
});
