#!/usr/bin/env node
/**
 * Isolated DR drill runner (G1 E1/E2, Phase A).
 *
 * Safety model:
 *  - Every command works in a disposable workspace under <repo>/.drill/<drillId>.
 *  - The workspace carries its own .env, docker-compose.yml (copied from
 *    scripts/dr/docker-compose.drill.yml) and copies of the stock
 *    backup-stack.ps1 / restore-stack.ps1 scripts.
 *  - The compose project must be tiangong-kaiwu-drill or tiangong-kaiwu-drill-*;
 *    the main project tiangong-kaiwu is refused before any Docker call.
 *  - `restore` and `teardown` require an exact --confirm-project HITL gate.
 *  - Destructive fault injection additionally requires --allow-destructive,
 *    a matching --confirm-project, and DR_DRILL_DESTRUCTIVE_ACK=1. This runner
 *    implements the command but never invokes it on its own.
 *
 * Non-destructive commands: preflight, create, up, seed, backup, verify-backup,
 * restore (into a proven-empty drill target), verify, report, run, roundtrip,
 * down.
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  MAIN_PROJECT_NAME,
  DRILL_PROJECT_PREFIX,
  DrillRefusedError,
  DrillUsageError,
  EXIT_CODES,
  assessEmptyTarget,
  buildDrillEnvValues,
  buildDrillReport,
  buildRoundtripReport,
  compareProjectSnapshots,
  computeDrillPorts,
  isDrillProjectName,
  isPathInside,
  parseDotEnv,
  parseDrillArgs,
  serializeDotEnv,
  signAzureRequest,
  validateBackupManifest,
  validateDrillReport,
  verifyIsolation,
} from './drill-core.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DRILL_ROOT = join(REPO_ROOT, '.drill');
const COMPOSE_TEMPLATE = join(REPO_ROOT, 'scripts', 'dr', 'docker-compose.drill.yml');
const BACKUP_SCRIPT = join(REPO_ROOT, 'scripts', 'backup-stack.ps1');
const RESTORE_SCRIPT = join(REPO_ROOT, 'scripts', 'restore-stack.ps1');
const INTEGRITY_SCRIPT = join(REPO_ROOT, 'scripts', 'integrity', 'Invoke-IntegrityScan.mjs');
const META_FILE = 'drill-meta.json';
const STATE_FILE = 'state.json';
const COMPOSE_FILE = 'docker-compose.yml';
const ENV_FILE = '.env';
const AZURITE_KEY =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const SERVICES = ['postgres', 'redis', 'maildev', 'azurite', 'imodelhub', 'webhook-agent'];

class RunnerError extends Error {
  constructor(message, exitCode = EXIT_CODES.DRILL_FAILED, details = undefined) {
    super(message);
    this.name = 'RunnerError';
    this.exitCode = exitCode;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/* Tiny utilities                                                      */
/* ------------------------------------------------------------------ */

const log = (message) => process.stdout.write(`${message}\n`);
const logStep = (message) => process.stdout.write(`\n== ${message} ==\n`);

function nowIso() {
  return new Date().toISOString();
}

function stampUtc() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJsonAtomic(path, value) {
  ensureDir(dirname(path));
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}

function writeTextAtomic(path, text, mode = undefined) {
  ensureDir(dirname(path));
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, text, { encoding: 'utf8', mode });
  renameSync(temp, path);
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fileSize(path) {
  return statSync(path).size;
}

function tail(text, lines = 12) {
  return String(text ?? '').trim().split(/\r?\n/).slice(-lines).join(' | ');
}

function firstLine(text) {
  return String(text ?? '').trim().split(/\r?\n/)[0] ?? '';
}

function isWindows() {
  return process.platform === 'win32';
}

function powershellExe() {
  return isWindows() ? 'powershell.exe' : 'pwsh';
}

function gitHead() {
  const result = run('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { timeoutMs: 15000 });
  return result.status === 0 ? String(result.stdout).trim() : 'unknown';
}

function phaseStart(name) {
  return { name, startedAtUtc: nowIso(), startedMs: Date.now() };
}

function recordPhase(state, marker, status, details = {}, error = null) {
  const phase = {
    name: marker.name,
    status,
    startedAtUtc: marker.startedAtUtc,
    finishedAtUtc: nowIso(),
    durationMs: Date.now() - marker.startedMs,
    details: details ?? {},
  };
  if (error) phase.error = String(error.message ?? error);
  const phases = Array.isArray(state.phases) ? state.phases.filter((p) => p.name !== marker.name) : [];
  phases.push(phase);
  state.phases = phases;
  return phase;
}

/* ------------------------------------------------------------------ */
/* Process execution                                                   */
/* ------------------------------------------------------------------ */

function run(command, args, { cwd = REPO_ROOT, env = process.env, timeoutMs = 120000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.error && result.status === null ? -1 : result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}

function mustRun(command, args, options, what) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new RunnerError(
      `${what} failed (exit ${result.status}): ${tail(result.stderr || result.stdout)}`,
      EXIT_CODES.DRILL_FAILED,
    );
  }
  return result;
}

function docker(args, options = {}) {
  return run('docker', args, { timeoutMs: 120000, ...options });
}

function mustDocker(args, options, what) {
  return mustRun('docker', args, { timeoutMs: 120000, ...options }, what);
}

function assertDockerAvailable() {
  const result = docker(['version', '--format', '{{.Server.Version}}']);
  if (result.status !== 0) {
    throw new RunnerError(
      `Docker daemon is not reachable: ${tail(result.stderr || result.stdout)}`,
      EXIT_CODES.DRILL_FAILED,
    );
  }
  return String(result.stdout).trim();
}

function runPowerShell(scriptPath, scriptArgs, { timeoutMs = 30 * 60 * 1000 } = {}) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...scriptArgs];
  return run(powershellExe(), args, { timeoutMs });
}

/* ------------------------------------------------------------------ */
/* Workspace/meta/state management                                     */
/* ------------------------------------------------------------------ */

function workspacePaths(workspace) {
  return {
    workspace,
    metaPath: join(workspace, META_FILE),
    statePath: join(workspace, STATE_FILE),
    composePath: join(workspace, COMPOSE_FILE),
    envPath: join(workspace, ENV_FILE),
    backupScript: join(workspace, 'scripts', 'backup-stack.ps1'),
    restoreScript: join(workspace, 'scripts', 'restore-stack.ps1'),
    backupsDir: join(workspace, 'backups'),
    evidenceDir: join(workspace, 'evidence'),
  };
}

function loadMeta(workspace, expected = null) {
  const paths = workspacePaths(workspace);
  if (!existsSync(paths.metaPath)) {
    throw new RunnerError(
      `drill workspace is not initialized: ${workspace} (run the create command first)`,
      EXIT_CODES.USAGE,
    );
  }
  const meta = readJson(paths.metaPath);
  const isolation = verifyIsolation(meta, { repoRoot: REPO_ROOT });
  if (!isolation.ok) {
    throw new DrillRefusedError(
      `workspace isolation check failed; refusing Docker operations:\n  ${isolation.errors.join('\n  ')}`,
      'isolation-failed',
    );
  }
  if (expected?.project && expected.project !== meta.projectName) {
    throw new DrillRefusedError(
      `--project '${expected.project}' does not match workspace project '${meta.projectName}'; ` +
        'pass the drill project that owns this workspace',
      'project-mismatch',
    );
  }
  if (expected?.portOffset !== undefined && Number(expected.portOffset) !== Number(meta.portOffset)) {
    throw new DrillRefusedError(
      `--port-offset ${expected.portOffset} does not match workspace port offset ${meta.portOffset}; ` +
        'pass the offset recorded in drill-meta.json',
      'port-offset-mismatch',
    );
  }
  return meta;
}

function loadState(workspace) {
  const paths = workspacePaths(workspace);
  if (!existsSync(paths.statePath)) {
    return {
      schemaVersion: 1,
      createdAtUtc: nowIso(),
      phases: [],
      backup: null,
      restore: null,
      verification: null,
    };
  }
  return readJson(paths.statePath);
}

function saveState(workspace, state) {
  writeJsonAtomic(workspacePaths(workspace).statePath, state);
}

function loadEnv(workspace) {
  const envPath = workspacePaths(workspace).envPath;
  if (!existsSync(envPath)) {
    throw new RunnerError(`drill env file is missing: ${envPath}`, EXIT_CODES.USAGE);
  }
  return parseDotEnv(readFileSync(envPath, 'utf8'));
}

function baseMeta({ workspace, drillId, projectName, portOffset, envTemplate }) {
  const ports = computeDrillPorts(portOffset);
  return {
    schemaVersion: 1,
    drillId,
    projectName,
    portOffset,
    ports,
    workspace,
    composeFile: workspacePaths(workspace).composePath,
    envFile: workspacePaths(workspace).envPath,
    volumes: [
      `${projectName}-pgdata`,
      `${projectName}-redis-data`,
      `${projectName}-azurite-data`,
    ],
    network: `${projectName}-net`,
    createdAtUtc: nowIso(),
    sourceCommit: gitHead(),
    repoRoot: REPO_ROOT,
    envTemplate: envTemplate ?? null,
    toolHashes: {},
  };
}

function generateSecrets(overrides = {}) {
  return {
    adminEmail: overrides.IMODELHUB_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: overrides.IMODELHUB_ADMIN_PASSWORD || randomHex(16),
    imodelhubApiKey: overrides.IMODELHUB_API_KEY || randomHex(32),
    backendApiKey: overrides.BACKEND_API_KEY || randomHex(32),
    csrfSecret: overrides.CSRF_SECRET || randomHex(32),
    webhookSecret: overrides.WEBHOOK_SECRET || randomHex(32),
    authJwtSecret: overrides.AUTH_JWT_SECRET || randomHex(32),
    authRefreshSecret: overrides.AUTH_REFRESH_SECRET || randomHex(32),
    authForgotSecret: overrides.AUTH_FORGOT_SECRET || randomHex(32),
    authConfirmEmailSecret: overrides.AUTH_CONFIRM_EMAIL_SECRET || randomHex(32),
    dbPassword: overrides.HUB_DATABASE_PASSWORD || randomHex(16),
  };
}

function copyScript(source, destination) {
  ensureDir(dirname(destination));
  copyFileSync(source, destination);
}

function createWorkspace({ workspace, drillId, projectName, portOffset, envTemplate }) {
  assertDrillProjectNameSafe(projectName);
  const paths = workspacePaths(workspace);
  if (existsSync(paths.metaPath)) {
    throw new RunnerError(`drill workspace already exists: ${workspace}`, EXIT_CODES.USAGE);
  }
  if (existsSync(workspace) && readdirSync(workspace).length > 0) {
    throw new RunnerError(`refusing to initialize non-empty directory: ${workspace}`, EXIT_CODES.USAGE);
  }

  let templateEnv = {};
  if (envTemplate) {
    const templateMeta = loadMeta(envTemplate);
    if (resolve(templateMeta.workspace) !== resolve(envTemplate)) {
      throw new DrillRefusedError('env template workspace metadata does not match its path', 'bad-template');
    }
    templateEnv = loadEnv(envTemplate);
  }

  const ports = computeDrillPorts(portOffset);
  const secrets = generateSecrets(templateEnv);
  const envValues = {
    // Keep drill-safe long-tail values from the template (if any), then
    // overwrite every project/port/identity value below.
    ...templateEnv,
    ...buildDrillEnvValues({ projectName, drillId, ports, secrets }),
    AZURITE_ACCOUNT_KEY: AZURITE_KEY,
  };
  delete envValues.DRILL_TEMPLATE_WORKSPACE;
  envValues.DRILL_TEMPLATE_WORKSPACE = envTemplate ? resolve(envTemplate) : '';

  ensureDir(paths.workspace);
  ensureDir(paths.backupsDir);
  ensureDir(paths.evidenceDir);
  ensureDir(join(paths.workspace, 'scripts'));
  writeTextAtomic(paths.envPath, serializeDotEnv(envValues), 0o600);
  copyFileSync(COMPOSE_TEMPLATE, paths.composePath);
  copyScript(BACKUP_SCRIPT, paths.backupScript);
  copyScript(RESTORE_SCRIPT, paths.restoreScript);

  const meta = baseMeta({ workspace, drillId, projectName, portOffset, envTemplate });
  meta.toolHashes = {
    compose: sha256File(paths.composePath),
    backupScript: sha256File(paths.backupScript),
    restoreScript: sha256File(paths.restoreScript),
    integrityScan: sha256File(INTEGRITY_SCRIPT),
    runner: sha256File(fileURLToPath(import.meta.url)),
    core: sha256File(join(REPO_ROOT, 'scripts', 'dr', 'drill-core.mjs')),
  };
  writeJsonAtomic(paths.metaPath, meta);

  const state = {
    schemaVersion: 1,
    drillId,
    projectName,
    createdAtUtc: meta.createdAtUtc,
    phases: [],
    backup: null,
    restore: null,
    verification: null,
    seed: null,
    rpoInput: { lastPushedEditAtUtc: null },
    mainProjectUntouched: null,
    mainProjectSnapshot: null,
  };
  saveState(workspace, state);

  // Ensure drill artifacts can never be committed even if the root .gitignore
  // is changed later.
  ensureDir(DRILL_ROOT);
  writeTextAtomic(join(DRILL_ROOT, '.gitignore'), '*\n!.gitignore\n');
  return { meta, state };
}

function assertDrillProjectNameSafe(projectName) {
  if (projectName === MAIN_PROJECT_NAME) {
    throw new DrillRefusedError(
      `refusing to initialize a drill workspace for the main project '${MAIN_PROJECT_NAME}'`,
      'main-project',
    );
  }
  if (!isDrillProjectName(projectName)) {
    throw new DrillRefusedError(
      `project '${projectName}' is not a drill project ('${DRILL_PROJECT_PREFIX}' prefix required)`,
      'invalid-project',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Docker compose helpers                                              */
/* ------------------------------------------------------------------ */

function compose(workspace, meta, args, { timeoutMs = 180000 } = {}) {
  return docker([
    'compose',
    '--project-name', meta.projectName,
    '--env-file', workspacePaths(workspace).envPath,
    '-f', workspacePaths(workspace).composePath,
    ...args,
  ], { cwd: workspace, timeoutMs });
}

function mustCompose(workspace, meta, args, what, options = {}) {
  const result = compose(workspace, meta, args, options);
  if (result.status !== 0) {
    throw new RunnerError(
      `${what} failed (exit ${result.status}): ${tail(result.stderr || result.stdout)}`,
      EXIT_CODES.DRILL_FAILED,
    );
  }
  return result;
}

function serviceContainerId(workspace, meta, service) {
  const result = compose(workspace, meta, ['ps', '-q', service]);
  if (result.status !== 0) return null;
  const ids = String(result.stdout).split(/\r?\n/).map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{12,64}$/.test(line));
  return ids.length === 1 ? ids[0] : null;
}

function runningServices(workspace, meta) {
  const result = compose(workspace, meta, ['ps', '--services']);
  if (result.status !== 0) return [];
  return String(result.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runningContainerIdsForProject(projectName) {
  const result = docker([
    'ps', '--filter', `label=com.docker.compose.project=${projectName}`,
    '--format', '{{.ID}}',
  ]);
  if (result.status !== 0) return new Set();
  return new Set(String(result.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function assertPortsFreeOrOwned(meta) {
  const result = docker(['ps', '--format', '{{.ID}}|{{.Names}}|{{.Ports}}']);
  if (result.status !== 0) {
    throw new RunnerError(`cannot list docker containers: ${tail(result.stderr)}`);
  }
  const owned = runningContainerIdsForProject(meta.projectName);
  const wanted = Object.entries(meta.ports);
  const conflicts = [];
  for (const line of String(result.stdout).split(/\r?\n/).filter(Boolean)) {
    const [id, name, portsText] = line.split('|');
    if (owned.has(id)) continue;
    for (const [label, port] of wanted) {
      const pattern = new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::\\]):${port}->`);
      if (pattern.test(portsText ?? '')) {
        conflicts.push(`${label}:${port} is published by ${name}`);
      }
    }
  }
  if (conflicts.length > 0) {
    throw new DrillRefusedError(
      `drill ports are already in use by another project: ${conflicts.join('; ')}`,
      'port-in-use',
    );
  }
}

function snapshotMainProject() {
  const containers = docker([
    'ps', '-a', '--filter', `label=com.docker.compose.project=${MAIN_PROJECT_NAME}`,
    '--format', '{{.ID}}|{{.Names}}|{{.State}}|{{.Image}}',
  ]);
  const volumes = docker([
    'volume', 'ls', '--filter', `label=com.docker.compose.project=${MAIN_PROJECT_NAME}`,
    '--format', '{{.Name}}',
  ]);
  return {
    containers: String(containers.stdout ?? '').split(/\r?\n/).filter(Boolean).sort(),
    volumes: String(volumes.stdout ?? '').split(/\r?\n/).filter(Boolean).sort(),
  };
}

function assertMainProjectUntouched(before, operation) {
  const after = snapshotMainProject();
  const containerDiff = compareProjectSnapshots(before?.containers, after.containers);
  const volumeDiff = compareProjectSnapshots(before?.volumes, after.volumes);
  if (!containerDiff.unchanged || !volumeDiff.unchanged) {
    throw new DrillRefusedError(
      `main project '${MAIN_PROJECT_NAME}' changed during ${operation}; aborting and requiring human review`,
      'main-project-changed',
    );
  }
  return {
    antes: before,
    after,
    containers: containerDiff,
    volumes: volumeDiff,
  };
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

async function fetchText(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

async function fetchJson(url, options = {}) {
  const result = await fetchText(url, options);
  let json = null;
  try { json = JSON.parse(result.text); } catch { /* non-JSON */ }
  return { ...result, json };
}

async function waitFor(label, fn, timeoutMs, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  throw new RunnerError(
    `timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${label}` +
      (lastError ? `: ${lastError.message}` : ''),
  );
}

async function waitForHub(meta, timeoutMs = 180000) {
  const url = `http://127.0.0.1:${meta.ports.hub}/health`;
  return waitFor('HUB health', async () => {
    const result = await fetchText(url, { timeoutMs: 5000 });
    return result.status === 200 ? { status: result.status } : null;
  }, timeoutMs);
}

async function waitForPostgres(workspace, meta, env, timeoutMs = 120000) {
  return waitFor('Postgres readiness', async () => {
    const result = compose(workspace, meta, [
      'exec', '-T', 'postgres',
      'pg_isready', '-U', env.HUB_DATABASE_USERNAME, '-d', env.HUB_DATABASE_NAME,
    ], { timeoutMs: 10000 });
    return result.status === 0;
  }, timeoutMs);
}

async function hubLogin(meta, env) {
  const url = `http://127.0.0.1:${meta.ports.hub}/auth/email/login`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = await fetchJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: env.IMODELHUB_ADMIN_EMAIL,
        password: env.IMODELHUB_ADMIN_PASSWORD,
      }),
      timeoutMs: 15000,
    });
    if (result.status === 200 && result.json?.token) return result.json.token;
    if (result.status === 429 && attempt < 6) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
      continue;
    }
    throw new RunnerError(
      `HUB login failed (HTTP ${result.status}); the drill HUB admin seed does not match ` +
        `the workspace .env (do not print or copy secrets into logs)`,
    );
  }
  throw new RunnerError('HUB login failed after retries');
}

/* ------------------------------------------------------------------ */
/* Azure seed/verify helpers                                           */
/* ------------------------------------------------------------------ */

function azureEndpoint(meta) {
  return `http://127.0.0.1:${meta.ports.azuriteBlob}/devstoreaccount1`;
}

async function azureRequest(meta, env, { method, container = 'imodelhub', blobName = '', query = '', body = null, contentType = '' }) {
  const base = azureEndpoint(meta);
  const path = `/${container}${blobName ? `/${blobName.split('/').map(encodeURIComponent).join('/')}` : ''}`;
  const url = new URL(`${base}${path}${query}`);
  const buffer = body == null ? null : Buffer.from(body);
  const headers = signAzureRequest({
    method,
    url,
    account: 'devstoreaccount1',
    keyBase64: env.AZURITE_ACCOUNT_KEY || AZURITE_KEY,
    headers: {
      ...(buffer ? { 'x-ms-blob-type': 'BlockBlob' } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    contentLength: buffer ? buffer.length : 0,
    contentType,
  });
  const response = await fetch(url, {
    method,
    headers,
    body: buffer ?? undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = response.status === 200 || response.status === 201 ? '' : await response.text();
  return { status: response.status, text };
}

async function ensureAzuriteContainer(meta, env) {
  const result = await azureRequest(meta, env, {
    method: 'PUT',
    query: '?restype=container',
    contentType: '',
  });
  if (![201, 202, 409].includes(result.status)) {
    throw new RunnerError(`Azurite container create failed (HTTP ${result.status}): ${tail(result.text)}`);
  }
}

async function getSentinel(meta, env, blobName) {
  const base = azureEndpoint(meta);
  const url = new URL(`${base}/imodelhub/${blobName.split('/').map(encodeURIComponent).join('/')}`);
  const headers = signAzureRequest({
    method: 'GET', url, account: 'devstoreaccount1',
    keyBase64: env.AZURITE_ACCOUNT_KEY || AZURITE_KEY, headers: {},
  });
  const response = await fetch(url, {
    method: 'GET', headers, signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 200) {
    return { status: response.status, bytes: null, sha256: null };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, bytes: buffer.length, sha256: sha256Buffer(buffer) };
}

/* ------------------------------------------------------------------ */
/* Commands                                                           */
/* ------------------------------------------------------------------ */

async function commandPreflight(options) {
  assertDockerAvailable();
  const meta = loadMeta(options.workspace, options);
  const isolation = verifyIsolation(meta, { repoRoot: REPO_ROOT });
  if (!isolation.ok) {
    throw new DrillRefusedError(`isolation failed: ${isolation.errors.join('; ')}`, 'isolation-failed');
  }
  assertPortsFreeOrOwned(meta);
  const main = snapshotMainProject();
  const env = loadEnv(options.workspace);
  const detail = {
    docker: true,
    projectName: meta.projectName,
    ports: meta.ports,
    mainProjectContainers: main.containers.length,
    mainProjectVolumes: main.volumes.length,
    hasSeed: Boolean(loadState(options.workspace).seed),
    envKeys: Object.keys(env).length,
  };
  log(`preflight OK: ${meta.projectName} ports ${JSON.stringify(meta.ports)}`);
  log(`main project '${MAIN_PROJECT_NAME}' containers=${main.containers.length} volumes=${main.volumes.length}`);
  return detail;
}

async function commandCreate(options) {
  const drillId = options.drillId ?? `drill-${stampUtc()}`;
  const workspace = options.workspace ?? join(DRILL_ROOT, drillId);
  const projectName = options.project ?? DRILL_PROJECT_PREFIX;
  const portOffset = options.portOffset ?? 0;
  const mainBefore = snapshotMainProject();
  const marker = phaseStart('create');
  const { meta } = createWorkspace({
    workspace, drillId, projectName, portOffset, envTemplate: options.envTemplate,
  });
  const state = loadState(workspace);
  recordPhase(state, marker, 'passed', {
    projectName, portOffset, envTemplate: options.envTemplate ?? null,
  });
  // create only writes under .drill, but still prove the main project did not
  // change (and initializes the before/after snapshot evidence).
  state.mainProjectSnapshot = assertMainProjectUntouched(mainBefore, 'create');
  state.mainProjectUntouched = true;
  saveState(workspace, state);
  log(`created drill workspace: ${workspace}`);
  log(`project: ${projectName}; ports: ${JSON.stringify(meta.ports)}`);
  log('no secrets are printed; .env is drill-only and never committed');
  return { workspace, meta, state };
}

async function commandUp(options) {
  assertDockerAvailable();
  const meta = loadMeta(options.workspace, options);
  assertPortsFreeOrOwned(meta);
  const mainBefore = snapshotMainProject();
  const state = loadState(options.workspace);
  const marker = phaseStart('up');
  try {
    mustCompose(options.workspace, meta, ['up', '-d', ...SERVICES], 'docker compose up');
    await waitForHub(meta, options.timeoutSec * 1000);
    const env = loadEnv(options.workspace);
    await waitForPostgres(options.workspace, meta, env, Math.min(120000, options.timeoutSec * 1000));
    const wa = await fetchText(`http://127.0.0.1:${meta.ports.wa}/health`, { timeoutMs: 5000 })
      .then((r) => r.status === 200).catch(() => false);
    const azurite = await fetchText(`http://127.0.0.1:${meta.ports.azuriteBlob}/`, { timeoutMs: 5000 })
      .then((r) => r.status >= 100).catch(() => false);
    const mainAfter = assertMainProjectUntouched(mainBefore, 'up');
    state.mainProjectSnapshot = mainAfter;
    state.mainProjectUntouched = true;
    recordPhase(state, marker, 'passed', {
      hubHealthy: true, waHealthy: wa, azuriteReachable: azurite,
    });
    saveState(options.workspace, state);
    log(`drill stack up: ${meta.projectName} (hub :${meta.ports.hub}, azurite :${meta.ports.azuriteBlob})`);
    log(`WA health=${wa}; azurite reachable=${azurite}; main project untouched=${mainAfter.containers.unchanged && mainAfter.volumes.unchanged}`);
  } catch (error) {
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

async function commandSeed(options) {
  const meta = loadMeta(options.workspace, options);
  const env = loadEnv(options.workspace);
  await waitForHub(meta, Math.min(60000, options.timeoutSec * 1000));
  const state = loadState(options.workspace);
  const marker = phaseStart('seed');
  try {
    const token = await hubLogin(meta, env);
    const authHeaders = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    const seedName = `drill-${stampUtc()}-${randomHex(3)}`;
    const itwinResult = await fetchJson(`http://127.0.0.1:${meta.ports.hub}/itwins`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ displayName: seedName, subClass: 'Project' }),
      timeoutMs: 30000,
    });
    const itwinId = itwinResult.json?.iTwin?.id;
    if (![200, 201].includes(itwinResult.status) || !itwinId) {
      throw new RunnerError(
        `HUB create iTwin failed (HTTP ${itwinResult.status}): ${tail(itwinResult.text, 3)}`,
      );
    }

    const imodelResult = await fetchJson(`http://127.0.0.1:${meta.ports.hub}/imodels`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ iTwinId: itwinId, name: `${seedName}-imodel` }),
      timeoutMs: 30000,
    });
    const imodelId = imodelResult.json?.iModel?.id;
    if (![200, 201].includes(imodelResult.status) || !imodelId) {
      throw new RunnerError(
        `HUB create iModel failed (HTTP ${imodelResult.status}): ${tail(imodelResult.text, 3)}`,
      );
    }

    await ensureAzuriteContainer(meta, env);
    const blobName = `drill-seed/${meta.drillId}.txt`;
    const seedBody = Buffer.from(
      `drillId=${meta.drillId}\ncreatedAtUtc=${nowIso()}\nnonce=${randomHex(8)}\n`,
    );
    const put = await azureRequest(meta, env, {
      method: 'PUT', blobName, body: seedBody, contentType: 'text/plain; charset=utf-8',
    });
    if (put.status !== 201) {
      throw new RunnerError(`Azurite sentinel PUT failed (HTTP ${put.status}): ${tail(put.text)}`);
    }
    const fetched = await getSentinel(meta, env, blobName);
    if (fetched.status !== 200 || fetched.sha256 !== sha256Buffer(seedBody)) {
      throw new RunnerError(
        `Azurite sentinel read-back failed (HTTP ${fetched.status}); object storage seed is not durable`,
      );
    }

    state.seed = {
      itwinId,
      imodelId,
      imodelName: `${seedName}-imodel`,
      itwinName: seedName,
      imodelState: imodelResult.json?.iModel?.state ?? null,
      hubBaseUrl: `http://127.0.0.1:${meta.ports.hub}`,
      blob: {
        container: 'imodelhub',
        name: blobName,
        bytes: seedBody.length,
        sha256: sha256Buffer(seedBody),
      },
      seededAtUtc: nowIso(),
      note: 'minimal seed via existing HUB REST + Azurite REST; no production data',
    };
    recordPhase(state, marker, 'passed', {
      itwinId, imodelId, imodelState: state.seed.imodelState,
      blobName, blobBytes: seedBody.length,
    });
    saveState(options.workspace, state);
    log(`seed OK: iTwin ${itwinId}, iModel ${imodelId}, sentinel ${blobName} (${seedBody.length} bytes)`);
    log(`iModel state after create: ${state.seed.imodelState ?? 'unknown'} (baseline generation is out of Phase A scope)`);
  } catch (error) {
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

async function commandBackup(options) {
  const meta = loadMeta(options.workspace, options);
  const state = loadState(options.workspace);
  if (!state.seed) {
    log('WARN: backup without a recorded seed; object-store proof will be weaker');
  }
  assertPortsFreeOrOwned(meta);
  const mainBefore = snapshotMainProject();
  const marker = phaseStart('backup');
  try {
    // Quiesce drill writers so the DB dump and Azurite tar are a matched pair.
    mustCompose(options.workspace, meta, ['stop', 'webhook-agent', 'imodelhub', 'azurite'], 'stop drill writers');
    const result = runPowerShell(workspacePaths(options.workspace).backupScript, [
      '-BackupRoot', workspacePaths(options.workspace).backupsDir,
    ], { timeoutMs: 60 * 60 * 1000 });
    if (result.status !== 0) {
      throw new RunnerError(
        `drill backup script failed (exit ${result.status}): ${tail(result.stderr || result.stdout)}`,
      );
    }
    const match = /BACKUP OK:\s*(.+)\s*$/m.exec(result.stdout);
    let backupDir = match ? match[1].trim() : null;
    if (!backupDir || !existsSync(join(backupDir, 'manifest.json'))) {
      const candidates = existsSync(workspacePaths(options.workspace).backupsDir)
        ? readdirSync(workspacePaths(options.workspace).backupsDir)
          .filter((name) => name.startsWith('backup-'))
          .map((name) => join(workspacePaths(options.workspace).backupsDir, name))
          .filter((path) => existsSync(join(path, 'manifest.json')))
          .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
        : [];
      backupDir = candidates[0] ?? null;
    }
    if (!backupDir) {
      throw new RunnerError('backup script reported success but no manifest.json was found');
    }
    const manifestPath = join(backupDir, 'manifest.json');
    const manifest = readJson(manifestPath);
    const manifestSha256 = sha256File(manifestPath);
    const sidecarPath = join(backupDir, 'manifest.sha256');
    const sidecar = existsSync(sidecarPath)
      ? String(readFileSync(sidecarPath, 'utf8')).trim().split(/\s+/)[0].toLowerCase()
      : null;
    const artifacts = (manifest.artifacts ?? []).map((artifact) => {
      const rel = String(artifact.path ?? '').replaceAll('\\', '/');
      const filePath = join(backupDir, rel.replaceAll('/', '\\'));
      return {
        path: rel,
        declaredBytes: artifact.bytes ?? null,
        declaredSha256: String(artifact.sha256 ?? '').toLowerCase(),
        actualBytes: existsSync(filePath) ? fileSize(filePath) : null,
        actualSha256: existsSync(filePath) ? sha256File(filePath) : null,
      };
    });
    state.backup = {
      backupId: manifest.backupId ?? null,
      backupDir,
      createdAtUtc: manifest.createdAtUtc ?? null,
      consistencyMode: manifest.consistency?.mode ?? null,
      manifestPath,
      manifestSha256,
      manifestSidecarSha256: sidecar,
      manifestVerified: false,
      artifacts,
      capturedAtUtc: nowIso(),
    };
    const mainAfter = assertMainProjectUntouched(mainBefore, 'backup');
    state.mainProjectSnapshot = mainAfter;
    state.mainProjectUntouched = true;
    recordPhase(state, marker, 'passed', {
      backupId: state.backup.backupId,
      consistencyMode: state.backup.consistencyMode,
      manifestSha256,
    });
    saveState(options.workspace, state);
    log(`backup OK: ${backupDir}`);
    log(`backupId=${state.backup.backupId}; consistency=${state.backup.consistencyMode}; manifest sha256=${manifestSha256}`);
  } catch (error) {
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

function loadManifestForVerification(workspace, options) {
  const state = loadState(workspace);
  const backupDir = options.backupDir ?? state.backup?.backupDir;
  if (!backupDir) throw new DrillUsageError('no backup directory recorded; run backup first or pass --backup-dir');
  const manifestPath = join(backupDir, 'manifest.json');
  const sidecarPath = join(backupDir, 'manifest.sha256');
  if (!existsSync(manifestPath)) throw new RunnerError(`backup manifest is missing: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  const actualManifestSha256 = sha256File(manifestPath);
  const expectedManifestSha256 = existsSync(sidecarPath)
    ? String(readFileSync(sidecarPath, 'utf8')).trim().split(/\s+/)[0].toLowerCase()
    : null;
  const artifactStats = {};
  for (const artifact of manifest.artifacts ?? []) {
    const rel = String(artifact.path ?? '').replaceAll('\\', '/');
    const full = join(backupDir, rel.replaceAll('/', '\\'));
    artifactStats[rel] = existsSync(full)
      ? { bytes: fileSize(full), sha256: sha256File(full) }
      : null;
  }
  const validation = validateBackupManifest(manifest, {
    artifactStats,
    actualManifestSha256,
    expectedManifestSha256,
    requireSidecar: true,
  });
  return { state, backupDir, manifest, validation, actualManifestSha256, expectedManifestSha256 };
}

async function commandVerifyBackup(options) {
  const meta = loadMeta(options.workspace, options);
  const state = loadState(options.workspace);
  const marker = phaseStart('verify-backup');
  try {
    const { backupDir, manifest, validation, actualManifestSha256, expectedManifestSha256 } =
      loadManifestForVerification(options.workspace, options);
    if (state.backup && resolve(state.backup.backupDir) !== resolve(backupDir)) {
      state.backup = { ...state.backup, backupDir };
    }
    state.backup = {
      ...(state.backup ?? {}),
      backupId: manifest.backupId ?? state.backup?.backupId ?? null,
      backupDir,
      createdAtUtc: manifest.createdAtUtc ?? state.backup?.createdAtUtc ?? null,
      consistencyMode: manifest.consistency?.mode ?? state.backup?.consistencyMode ?? null,
      manifestSha256: actualManifestSha256,
      manifestSidecarSha256: expectedManifestSha256,
      manifestVerified: validation.ok,
      artifacts: validation.artifacts,
      verifiedAtUtc: nowIso(),
    };
    recordPhase(state, marker, validation.ok ? 'passed' : 'failed', {
      errors: validation.errors,
      warnings: validation.warnings,
      manifestSha256: actualManifestSha256,
    });
    saveState(options.workspace, state);
    if (!validation.ok) {
      throw new RunnerError(`backup verification failed: ${validation.errors.join('; ')}`);
    }
    log(`backup manifest verified: ${backupDir}`);
    log(`manifest sha256=${actualManifestSha256}; artifacts=${validation.artifacts.length}`);
    for (const warning of validation.warnings) log(`WARN: ${warning}`);
    return { backupDir, manifest, validation };
  } catch (error) {
    if (!state.phases?.some((phase) => phase.name === marker.name && phase.status === 'failed')) {
      recordPhase(state, marker, 'failed', {}, error);
      saveState(options.workspace, state);
    }
    throw error;
  }
}

async function commandRestore(options) {
  assertDockerAvailable();
  const meta = loadMeta(options.workspace, options);
  const env = loadEnv(options.workspace);
  const state = loadState(options.workspace);
  const mainBefore = snapshotMainProject();
  const marker = phaseStart('restore');

  // Validate the backup set before touching the target.
  const { backupDir, manifest, validation, actualManifestSha256, expectedManifestSha256 } =
    loadManifestForVerification(options.workspace, options);
  if (!validation.ok) {
    throw new RunnerError(`refusing restore: backup verification failed: ${validation.errors.join('; ')}`);
  }

  // Import non-secret seed metadata from the source workspace so post-restore
  // verification knows which HUB rows/blob to check.
  let sourceBackup = null;
  if (options.sourceWorkspace) {
    const sourceMeta = loadMeta(options.sourceWorkspace);
    const sourceState = loadState(options.sourceWorkspace);
    const sourceEnv = loadEnv(options.sourceWorkspace);
    sourceBackup = sourceState.backup ?? null;
    if (!sourceState.seed) {
      throw new RunnerError(`source workspace has no seed metadata: ${options.sourceWorkspace}`);
    }
    if (sourceEnv.IMODELHUB_ADMIN_PASSWORD !== env.IMODELHUB_ADMIN_PASSWORD) {
      throw new DrillRefusedError(
        'target .env admin password does not match the source drill .env; create the target with ' +
          '--env-template <source-workspace> so post-restore HUB login is possible',
        'env-template-mismatch',
      );
    }
    state.seed = sourceState.seed;
    state.sourceWorkspace = sourceMeta.workspace;
    state.rpoInput = sourceState.rpoInput ?? { lastPushedEditAtUtc: null };
  }

  // Record the backup set in the target state as well, so the target report
  // can compute RPO and state the manifest was verified before any write.
  state.backup = sourceBackup
    ? sourceBackup
    : {
        backupId: manifest.backupId ?? null,
        backupDir,
        createdAtUtc: manifest.createdAtUtc ?? null,
        consistencyMode: manifest.consistency?.mode ?? null,
        manifestPath: join(backupDir, 'manifest.json'),
        manifestSha256: actualManifestSha256,
        manifestSidecarSha256: expectedManifestSha256,
        manifestVerified: true,
        artifacts: validation.artifacts,
        verifiedAtUtc: nowIso(),
      };
  state.backup = { ...state.backup, backupDir, manifestVerified: true };

  try {
    // Prepare an empty target: Postgres running, Azurite container created but
    // stopped, its named volume never initialized by a running Azurite.
    mustCompose(options.workspace, meta, ['up', '-d', 'postgres'], 'start target Postgres');
    await waitForPostgres(options.workspace, meta, env, 120000);
    const azuriteRunning = runningServices(options.workspace, meta).includes('azurite');
    if (azuriteRunning) {
      throw new DrillRefusedError(
        'target Azurite is running; this runner will not stop or overwrite a running drill target. ' +
          'Use a freshly created drill workspace instead.',
        'target-not-empty',
      );
    }
    mustCompose(options.workspace, meta, ['create', 'azurite'], 'create target Azurite container');

    const tableResult = compose(options.workspace, meta, [
      'exec', '-T', '-e', 'PGPASSWORD', 'postgres',
      'psql', '--username', env.HUB_DATABASE_USERNAME, '--dbname', env.HUB_DATABASE_NAME,
      '--no-password', '--tuples-only', '--no-align',
      '--command', "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');",
    ], { timeoutMs: 30000 });
    const tableText = firstLine(tableResult.stdout);
    const userTableCount = /^\d+$/.test(tableText) ? Number(tableText) : null;

    const volumeName = meta.volumes.find((name) => name.endsWith('-azurite-data'));
    const volumeResult = docker([
      'run', '--rm', '-v', `${volumeName}:/data:ro`, 'alpine:3.20',
      'sh', '-c', 'ls -A /data | wc -l',
    ]);
    const volumeText = firstLine(volumeResult.stdout);
    const azuriteVolumeEntries = /^\d+$/.test(volumeText) ? Number(volumeText) : null;

    const running = runningServices(options.workspace, meta);
    const writers = running.filter((service) => ['imodelhub', 'webhook-agent', 'azurite'].includes(service));
    const empty = assessEmptyTarget({ userTableCount, azuriteVolumeEntries, runningWriters: writers });
    if (!empty.empty) {
      throw new DrillRefusedError(
        `refusing restore: drill target is not empty:\n  - ${empty.reasons.join('\n  - ')}`,
        'target-not-empty',
      );
    }

    // From here on, restore-stack.ps1 overwrites only the proven-empty drill
    // target. -Confirm is the HITL gate; -Force is deliberately never passed.
    state.restore = {
      status: 'running',
      targetWasEmpty: true,
      backupId: manifest.backupId ?? null,
      startedAtUtc: nowIso(),
      command: `powershell -File <workspace>/scripts/restore-stack.ps1 -BackupDir <drill-backup> -Confirm`,
      tableCountBefore: userTableCount,
      volumeEntriesBefore: azuriteVolumeEntries,
    };
    saveState(options.workspace, state);

    const result = runPowerShell(workspacePaths(options.workspace).restoreScript, [
      '-BackupDir', backupDir, '-Confirm',
    ], { timeoutMs: 60 * 60 * 1000 });
    if (result.status !== 0) {
      throw new RunnerError(
        `drill restore script failed (exit ${result.status}): ${tail(result.stderr || result.stdout, 20)}`,
      );
    }
    const finishedAtUtc = nowIso();
    state.restore = {
      ...state.restore,
      status: 'passed',
      finishedAtUtc,
      durationMs: Date.parse(finishedAtUtc) - Date.parse(state.restore.startedAtUtc),
      backupDir,
    };

    mustCompose(options.workspace, meta, ['up', '-d', ...SERVICES], 'start restored drill stack');
    await waitForHub(meta, 180000);
    await waitForPostgres(options.workspace, meta, env, 120000);

    const mainAfter = assertMainProjectUntouched(mainBefore, 'restore');
    state.mainProjectSnapshot = mainAfter;
    state.mainProjectUntouched = true;
    recordPhase(state, marker, 'passed', {
      backupId: state.restore.backupId,
      targetWasEmpty: true,
      durationMs: state.restore.durationMs,
    });
    saveState(options.workspace, state);
    log(`restore OK into empty drill target: ${meta.projectName}`);
    log(`backupId=${state.restore.backupId}; restore duration=${state.restore.durationMs}ms; main project untouched=true`);
  } catch (error) {
    if (state.restore?.status === 'running') {
      state.restore = { ...state.restore, status: 'failed', finishedAtUtc: nowIso(), error: String(error.message) };
    }
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

async function commandVerify(options) {
  const meta = loadMeta(options.workspace, options);
  const env = loadEnv(options.workspace);
  const state = loadState(options.workspace);
  const marker = phaseStart('verify');
  const checks = [];
  const addCheck = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), detail: String(detail) });
    log(`  [${ok ? 'OK' : 'FAIL'}] ${name}: ${detail}`);
  };

  try {
    if (!state.seed) {
      throw new RunnerError(
        'no seed metadata in this workspace; run seed (source) or restore with --source-workspace (target)',
      );
    }
    await waitForHub(meta, Math.min(120000, options.timeoutSec * 1000));
    addCheck('hub-health', true, `HTTP 200 on :${meta.ports.hub}/health`);

    const token = await hubLogin(meta, env);
    addCheck('hub-login', true, `admin ${env.IMODELHUB_ADMIN_EMAIL}`);

    const imodel = await fetchJson(
      `http://127.0.0.1:${meta.ports.hub}/imodels/${state.seed.imodelId}`,
      { headers: { authorization: `Bearer ${token}` }, timeoutMs: 30000 },
    );
    const imodelOk = imodel.status === 200 && imodel.json?.iModel?.id === state.seed.imodelId;
    addCheck('seeded-imodel-row', imodelOk,
      `GET /imodels/${state.seed.imodelId} -> HTTP ${imodel.status}, state=${imodel.json?.iModel?.state ?? 'n/a'}`);
    if (!imodelOk) throw new RunnerError('restored drill HUB does not contain the seeded iModel row');

    const sentinel = await getSentinel(meta, env, state.seed.blob.name);
    const blobOk = sentinel.status === 200 && sentinel.sha256 === state.seed.blob.sha256;
    addCheck('seeded-blob-sentinel', blobOk,
      `GET ${state.seed.blob.name} -> HTTP ${sentinel.status}, bytes=${sentinel.bytes}, sha256=${sentinel.sha256}`);
    if (!blobOk) throw new RunnerError('restored drill Azurite does not contain the seeded sentinel blob');
    const stackVerifiedAtUtc = nowIso();

    let integrity = { skipped: true };
    if (!options.skipIntegrity) {
      integrity = runIntegrityScan(options.workspace, meta, env, state);
      const status = integrity.exitCode === 0 ? 'CLEAN'
        : integrity.exitCode === 3 ? 'PARTIAL'
          : integrity.exitCode === 1 ? 'FINDINGS'
            : integrity.exitCode === 2 ? 'USAGE-ERROR' : 'ERROR';
      addCheck('integrity-scan', integrity.exitCode === 0,
        `exit ${integrity.exitCode} (${status}) result=${integrity.result ?? 'unknown'} ` +
        `errors=${integrity.summary?.errors ?? '?'} unverified=${integrity.unverifiedCount ?? '?'}` +
        (integrity.exitCode === 1
          ? ' — minimal Phase A seed has no MS-generated baseline/checkpoint content; see report'
          : ''));
      integrity.scopeNote =
        'Phase A seed creates an iTwin/iModel via HUB REST without a modeling-server baseline. ' +
        'Ledger findings such as invalid-checkpoint/baseline-blob-unmapped are expected for this ' +
        'minimal seed and are not caused by the restore path. Use --strict-integrity only when the ' +
        'source was produced by a full-stack drill with baseline generation.';
    } else {
      addCheck('integrity-scan', true, 'skipped by --skip-integrity (not evidence of cleanliness)');
    }

    const stackPassed = checks
      .filter((check) => check.name !== 'integrity-scan')
      .every((check) => check.ok);
    // Stack + sentinel blob prove the DB/object-store restore. A minimal seed
    // cannot produce a clean ledger scan (no MS baseline), so integrity
    // findings make the run "partial" unless the operator opts into strict.
    const verificationStatus = !stackPassed ? 'failed'
      : integrity.skipped || integrity.exitCode === 0 ? 'passed'
        : integrity.exitCode === 3 || integrity.exitCode === 1 ? 'partial' : 'failed';
    state.verification = {
      status: verificationStatus,
      startedAtUtc: marker.startedAtUtc,
      stackVerifiedAtUtc,
      finishedAtUtc: nowIso(),
      stack: {
        passed: stackPassed,
        checks: checks.filter((check) => check.name !== 'integrity-scan'),
      },
      blob: {
        verified: blobOk,
        name: state.seed.blob.name,
        bytes: sentinel.bytes,
        sha256: sentinel.sha256,
      },
      integrity,
      checks,
    };
    recordPhase(state, marker, verificationStatus, {
      integrityExitCode: integrity.exitCode ?? null,
      integrityResult: integrity.result ?? null,
      skipIntegrity: Boolean(options.skipIntegrity),
    });
    saveState(options.workspace, state);
    if (verificationStatus === 'failed') {
      throw new RunnerError(
        `post-restore verification failed: ${checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`,
      );
    }
    if (options.strictIntegrity && !integrity.skipped && integrity.exitCode !== 0) {
      throw new RunnerError(
        `strict integrity gate failed: scan exit ${integrity.exitCode} (${integrity.result ?? 'unknown'}); ` +
          'the partial verification state was recorded',
      );
    }
    log(`verification ${verificationStatus}: hub row + blob sentinel passed; integrity exit ${integrity.exitCode ?? 'skipped'}`);
    return state.verification;
  } catch (error) {
    if (!state.verification) {
      state.verification = {
        status: 'failed', startedAtUtc: marker.startedAtUtc, finishedAtUtc: nowIso(),
        stack: { passed: false, checks }, blob: { verified: false }, integrity: null, checks,
      };
    }
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

function runIntegrityScan(workspace, meta, env, state) {
  const postgresId = serviceContainerId(workspace, meta, 'postgres');
  if (!postgresId) {
    return {
      exitCode: null, result: 'ERROR', summary: {},
      error: 'could not resolve drill postgres container id', unverifiedCount: null,
    };
  }
  const evidenceDir = workspacePaths(workspace).evidenceDir;
  ensureDir(evidenceDir);
  const stamp = stampUtc();
  const jsonPath = join(evidenceDir, `integrity-${stamp}.json`);
  const mdPath = join(evidenceDir, `integrity-${stamp}.md`);
  const args = [
    INTEGRITY_SCRIPT,
    '--db-mode', 'docker',
    '--docker-container', postgresId,
    '--db-user', env.HUB_DATABASE_USERNAME,
    '--db-name', env.HUB_DATABASE_NAME,
    '--db-schema', 'public',
    '--blob-mode', 'azure',
    '--blob-endpoint', azureEndpoint(meta),
    '--blob-container', 'imodelhub',
    '--blob-prefix', 'imodels/',
    '--orphan-prefix', 'imodels/',
    '--format', 'json',
    '--json-out', jsonPath,
    '--md-out', mdPath,
  ];
  const result = run(process.execPath, args, {
    env: { ...process.env, PGPASSWORD: env.HUB_DATABASE_PASSWORD, AZURITE_ACCOUNT_KEY: env.AZURITE_ACCOUNT_KEY },
    timeoutMs: 5 * 60 * 1000,
  });
  let report = null;
  if (existsSync(jsonPath)) {
    try { report = readJson(jsonPath); } catch { /* leave null */ }
  }
  return {
    exitCode: result.status,
    result: report?.result ?? (result.status === 0 ? 'CLEAN' : null),
    summary: report?.summary ?? {},
    unverifiedCount: Array.isArray(report?.unverified) ? report.unverified.length : null,
    jsonPath,
    mdPath,
    jsonSha256: existsSync(jsonPath) ? sha256File(jsonPath) : null,
    mdSha256: existsSync(mdPath) ? sha256File(mdPath) : null,
    stderrTail: result.status === 0 ? null : tail(result.stderr || result.stdout, 6),
  };
}

async function commandReport(options) {
  const meta = loadMeta(options.workspace, options);
  const state = loadState(options.workspace);
  const report = buildDrillReport({ meta, state });
  const validation = validateDrillReport(report);
  if (!validation.ok) {
    throw new RunnerError(`report is invalid: ${validation.errors.join('; ')}`);
  }
  const evidenceDir = workspacePaths(options.workspace).evidenceDir;
  ensureDir(evidenceDir);
  const reportPath = options.report
    ? resolve(options.workspace, options.report)
    : join(evidenceDir, 'drill-report.json');
  if (!isPathInside(reportPath, DRILL_ROOT)) {
    throw new DrillRefusedError(
      `report path must stay under ${DRILL_ROOT}: ${reportPath}`,
      'report-outside-drill-root',
    );
  }
  writeJsonAtomic(reportPath, report);
  writeTextAtomic(`${reportPath}.sha256`, `${sha256File(reportPath)}  ${reportPath.split(/[\\/]/).pop()}\n`);
  log(`report written: ${reportPath}`);
  log(`claims: backupVerified=${report.claims.backupManifestVerified} restore=${report.claims.restoreIntoEmptyDrillCompleted} ` +
    `hub=${report.claims.postRestoreHubApiVerified} blob=${report.claims.postRestoreBlobSentinelVerified} ` +
    `integrityClean=${report.claims.integrityScanClean}`);
  log(`RPO measuredSeconds=${report.rpo.measuredSeconds ?? 'null'} (target claim=false); ` +
    `RTO measuredSeconds=${report.rto.measuredSeconds ?? 'null'} (target claim=false)`);
  if (options.format === 'json') process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function commandReportRoundtrip(options) {
  const sourceWorkspace = options.sourceWorkspace;
  const targetWorkspace = options.workspace;
  if (!sourceWorkspace) throw new DrillUsageError('report-roundtrip requires --source-workspace');
  const sourceMeta = loadMeta(sourceWorkspace);
  const sourceState = loadState(sourceWorkspace);
  const targetMeta = loadMeta(targetWorkspace, options);
  const targetState = loadState(targetWorkspace);
  const sourceReport = buildDrillReport({ meta: sourceMeta, state: sourceState });
  const targetReport = buildDrillReport({ meta: targetMeta, state: targetState });
  const roundtrip = buildRoundtripReport({ source: sourceReport, target: targetReport });
  const sourcePath = join(workspacePaths(sourceWorkspace).evidenceDir, 'drill-roundtrip-report.json');
  const targetPath = join(workspacePaths(targetWorkspace).evidenceDir, 'drill-roundtrip-report.json');
  writeJsonAtomic(sourcePath, roundtrip);
  writeTextAtomic(`${sourcePath}.sha256`, `${sha256File(sourcePath)}  drill-roundtrip-report.json\n`);
  writeJsonAtomic(targetPath, roundtrip);
  writeTextAtomic(`${targetPath}.sha256`, `${sha256File(targetPath)}  drill-roundtrip-report.json\n`);
  log(`roundtrip report written: ${sourcePath}`);
  log(`claims: backupVerified=${roundtrip.claims.backupVerified} restore=${roundtrip.claims.emptyTargetRestoreCompleted} ` +
    `hub=${roundtrip.claims.postRestoreHubApiVerified} blob=${roundtrip.claims.postRestoreBlobSentinelVerified} ` +
    `integrityClean=${roundtrip.claims.integrityScanClean}`);
  log('RPO/RTO target claims remain false; see the per-drill reports for measured values.');
  if (options.format === 'json') process.stdout.write(`${JSON.stringify(roundtrip, null, 2)}\n`);
  return roundtrip;
}

async function commandDown(options) {
  assertDockerAvailable();
  const meta = loadMeta(options.workspace, options);
  const mainBefore = snapshotMainProject();
  const state = loadState(options.workspace);
  const marker = phaseStart('down');
  try {
    mustCompose(options.workspace, meta, ['down'], 'docker compose down (drill only, volumes kept)');
    const mainAfter = assertMainProjectUntouched(mainBefore, 'down');
    state.mainProjectSnapshot = mainAfter;
    state.mainProjectUntouched = true;
    recordPhase(state, marker, 'passed', { volumes: 'kept' });
    saveState(options.workspace, state);
    log(`drill stack stopped (${meta.projectName}); volumes kept for evidence/restore`);
  } catch (error) {
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

async function commandTeardown(options) {
  assertDockerAvailable();
  const meta = loadMeta(options.workspace, options);
  const mainBefore = snapshotMainProject();
  const state = loadState(options.workspace);
  const marker = phaseStart('teardown');
  try {
    // parseDrillArgs already enforced --confirm-project <drill project>.
    mustCompose(options.workspace, meta, ['down', '-v'], 'docker compose down -v (drill only)');
    if (options.deleteWorkspace) {
      const stillRunning = runningContainerIdsForProject(meta.projectName);
      if (stillRunning.size > 0) {
        throw new RunnerError('refusing to delete workspace while drill containers still exist');
      }
      // Remove only this drill workspace; evidence should already be copied.
      rmSync(options.workspace, { recursive: true, force: true });
    }
    const mainAfter = assertMainProjectUntouched(mainBefore, 'teardown');
    if (!options.deleteWorkspace) {
      state.mainProjectSnapshot = mainAfter;
      state.mainProjectUntouched = true;
      recordPhase(state, marker, 'passed', { volumes: 'deleted', workspace: 'kept' });
      saveState(options.workspace, state);
    }
    log(`drill project removed (${meta.projectName}); volumes deleted; workspace ` +
      `${options.deleteWorkspace ? 'deleted' : 'kept'}; main project untouched`);
  } catch (error) {
    if (existsSync(workspacePaths(options.workspace).statePath)) {
      recordPhase(state, marker, 'failed', {}, error);
      saveState(options.workspace, state);
    }
    throw error;
  }
}

async function commandResetTarget(options) {
  assertDockerAvailable();
  const meta = loadMeta(options.workspace, options);
  const mainBefore = snapshotMainProject();
  const state = loadState(options.workspace);
  const marker = phaseStart('reset-target');
  try {
    // parseDrillArgs enforced --allow-drill-reset + --confirm-project.
    mustCompose(options.workspace, meta, ['down', '-v'], 'docker compose down -v (drill target only)');
    const mainAfter = assertMainProjectUntouched(mainBefore, 'reset-target');
    state.mainProjectSnapshot = mainAfter;
    state.mainProjectUntouched = true;
    state.restore = null;
    state.verification = null;
    recordPhase(state, marker, 'passed', { volumes: 'deleted; target is empty' });
    saveState(options.workspace, state);
    log(`drill target reset: ${meta.projectName} (volumes deleted; main project untouched)`);
  } catch (error) {
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

async function commandFaultInject(options) {
  const meta = loadMeta(options.workspace, options);
  const env = loadEnv(options.workspace);
  const state = loadState(options.workspace);
  if (!state.seed?.blob?.name) {
    throw new RunnerError('fault-inject requires seed metadata (sentinel blob)');
  }
  // parseDrillArgs enforced --allow-destructive, --confirm-project, scenario,
  // and DR_DRILL_DESTRUCTIVE_ACK=1.
  const marker = phaseStart('fault-inject');
  try {
    if (options.scenario === 'delete-sentinel-blob') {
      const base = azureEndpoint(meta);
      const url = new URL(`${base}/imodelhub/${state.seed.blob.name.split('/').map(encodeURIComponent).join('/')}`);
      const headers = signAzureRequest({
        method: 'DELETE', url, account: 'devstoreaccount1',
        keyBase64: env.AZURITE_ACCOUNT_KEY || AZURITE_KEY, headers: {},
      });
      const response = await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) });
      if (![200, 202, 204].includes(response.status)) {
        throw new RunnerError(`sentinel DELETE failed (HTTP ${response.status})`);
      }
    } else if (options.scenario === 'corrupt-sentinel-blob') {
      const put = await azureRequest(meta, env, {
        method: 'PUT',
        blobName: state.seed.blob.name,
        body: Buffer.from('drill-fault-injection-corrupted\n'),
        contentType: 'text/plain; charset=utf-8',
      });
      if (put.status !== 201) throw new RunnerError(`sentinel overwrite failed (HTTP ${put.status})`);
    } else {
      throw new DrillUsageError(`unsupported scenario: ${options.scenario}`);
    }
    state.faultInjection = {
      executed: true,
      scenario: options.scenario,
      target: state.seed.blob.name,
      executedAtUtc: nowIso(),
      nextSteps: 'run verify to observe detection, then reset-target + restore from the same backup',
    };
    recordPhase(state, marker, 'passed', { scenario: options.scenario, target: state.seed.blob.name });
    saveState(options.workspace, state);
    log(`fault injected (drill only): ${options.scenario} on ${state.seed.blob.name}`);
    log('This was an opt-in destructive drill step. Run verify to observe detection, then reset-target + restore.');
  } catch (error) {
    recordPhase(state, marker, 'failed', {}, error);
    saveState(options.workspace, state);
    throw error;
  }
}

async function commandRun(options) {
  let workspace = options.workspace;
  if (!existsSync(workspacePaths(workspace).metaPath)) {
    ({ workspace } = await commandCreate(options));
  }
  const withWorkspace = { ...options, workspace };
  await commandUp(withWorkspace);
  await commandSeed(withWorkspace);
  await commandBackup(withWorkspace);
  await commandVerifyBackup(withWorkspace);
  return commandReport(withWorkspace);
}

async function commandRoundtrip(options) {
  // Source: the workspace named by --workspace/--drill-id.
  let sourceWorkspace = options.workspace;
  if (!existsSync(workspacePaths(sourceWorkspace).metaPath)) {
    await commandCreate(options);
  }
  const sourceMeta = loadMeta(sourceWorkspace, options);
  const sourceWithWorkspace = { ...options, workspace: sourceWorkspace };
  await commandUp(sourceWithWorkspace);
  await commandSeed(sourceWithWorkspace);
  await commandBackup(sourceWithWorkspace);
  await commandVerifyBackup(sourceWithWorkspace);
  const sourceState = loadState(sourceWorkspace);
  const sourceReport = buildDrillReport({ meta: sourceMeta, state: sourceState });

  // Target: a second, freshly created drill workspace/project. Port offset +1
  // keeps both stacks (and the source) up simultaneously without collisions.
  const targetOffset = Number(sourceMeta.portOffset) + 1;
  if (targetOffset > 9) {
    throw new DrillUsageError('roundtrip requires source port offset <= 8');
  }
  const targetDrillId = `${sourceMeta.drillId}-restore`;
  const targetWorkspace = join(DRILL_ROOT, targetDrillId);
  const targetProject = `${sourceMeta.projectName}-restore`;
  if (!isDrillProjectName(targetProject)) {
    throw new DrillRefusedError(`derived target project is not a drill project: ${targetProject}`);
  }
  if (!existsSync(workspacePaths(targetWorkspace).metaPath)) {
    createWorkspace({
      workspace: targetWorkspace,
      drillId: targetDrillId,
      projectName: targetProject,
      portOffset: targetOffset,
      envTemplate: sourceWorkspace,
    });
  }
  const targetOptions = {
    ...options,
    workspace: targetWorkspace,
    drillId: targetDrillId,
    project: targetProject,
    portOffset: targetOffset,
    backupDir: sourceState.backup.backupDir,
    sourceWorkspace,
    confirmProject: targetProject,
    envTemplate: sourceWorkspace,
  };
  await commandRestore(targetOptions);
  await commandVerify(targetOptions);
  const targetMeta = loadMeta(targetWorkspace, targetOptions);
  const targetState = loadState(targetWorkspace);
  const targetReport = buildDrillReport({ meta: targetMeta, state: targetState });

  const roundtrip = buildRoundtripReport({ source: sourceReport, target: targetReport });
  const roundtripPath = join(workspacePaths(sourceWorkspace).evidenceDir, 'drill-roundtrip-report.json');
  writeJsonAtomic(roundtripPath, roundtrip);
  writeTextAtomic(`${roundtripPath}.sha256`, `${sha256File(roundtripPath)}  drill-roundtrip-report.json\n`);
  writeJsonAtomic(join(workspacePaths(targetWorkspace).evidenceDir, 'drill-roundtrip-report.json'), roundtrip);

  await commandReport(sourceWithWorkspace);
  await commandReport(targetOptions);
  log(`roundtrip report written: ${roundtripPath}`);
  log('Both drill stacks were left running for evidence; stop with `down` and remove with guarded `teardown` after review.');
  return roundtrip;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                */
/* ------------------------------------------------------------------ */

function printHelp() {
  process.stdout.write(`DR drill runner (Phase A, isolated)

Usage:
  node scripts/dr/drill-runner.mjs <command> --drill-id <id> [options]

Non-destructive:
  preflight      Verify isolation, Docker, ports and workspace (read-only)
  create         Create .drill/<id> with an isolated .env, compose and script copies
  up             Start the minimal drill stack (postgres/redis/maildev/azurite/hub/WA)
  seed           Seed a minimal iTwin+iModel via HUB REST and a sentinel blob via Azurite REST
  backup         Run the copied backup-stack.ps1 against the drill workspace
  verify-backup  Verify manifest.sha256 and every artifact size/SHA-256
  restore        Restore a verified backup into a proven-empty drill target (HITL)
  verify         Post-restore HUB row + blob sentinel + read-only integrity scan
  report         Write evidence/drill-report.json (RPO/RTO measurements, no target claims)
  report-roundtrip  Combine source + target reports into one roundtrip report
  down           Stop drill containers; keep volumes
  run            create(if needed) -> up -> seed -> backup -> verify-backup -> report
  roundtrip      run source, then restore+verify into a second empty drill project
                 (requires --confirm-project <source drill project>)

Drill-only destructive (never executed automatically):
  reset-target   --allow-drill-reset --confirm-project <drill-project>
  teardown       --confirm-project <drill-project> [--delete-workspace]
  fault-inject   --scenario delete-sentinel-blob|corrupt-sentinel-blob
                 --allow-destructive --confirm-project <drill-project>
                 and DR_DRILL_DESTRUCTIVE_ACK=1 in the operator environment

Common options:
  --project <name>            drill project (default tiangong-kaiwu-drill)
  --port-offset <0..9>        high-port slot (default 0)
  --env-template <workspace>  copy drill secrets from a source drill workspace
  --source-workspace <ws>     import seed metadata for post-restore verification
  --backup-dir <path>         drill backup set (must stay under <repo>/.drill)
  --timeout-sec <n>           health wait (default 180)
  --skip-integrity            skip the integrity scan (never proves cleanliness)
  --strict-integrity          fail the verify phase unless the scan exits 0
  --report <path>             report path under <repo>/.drill
  --format text|json          stdout format for report
  -h, --help

Main project '${MAIN_PROJECT_NAME}' is always refused as a drill target.
`);
}

async function main(argv) {
  const parsed = parseDrillArgs(argv, { repoRoot: REPO_ROOT });
  if (parsed.command === 'help') {
    printHelp();
    return EXIT_CODES.OK;
  }
  const { command, options } = parsed;
  logStep(`drill ${command}`);
  switch (command) {
    case 'preflight': await commandPreflight(options); break;
    case 'create': await commandCreate(options); break;
    case 'up': await commandUp(options); break;
    case 'seed': await commandSeed(options); break;
    case 'backup': await commandBackup(options); break;
    case 'verify-backup': await commandVerifyBackup(options); break;
    case 'restore': await commandRestore(options); break;
    case 'verify': await commandVerify(options); break;
    case 'report': await commandReport(options); break;
    case 'report-roundtrip': await commandReportRoundtrip(options); break;
    case 'down': await commandDown(options); break;
    case 'teardown': await commandTeardown(options); break;
    case 'reset-target': await commandResetTarget(options); break;
    case 'fault-inject': await commandFaultInject(options); break;
    case 'run': await commandRun(options); break;
    case 'roundtrip': await commandRoundtrip(options); break;
    default: throw new DrillUsageError(`unhandled command: ${command}`);
  }
  return EXIT_CODES.OK;
}

const isMain = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      if (error instanceof DrillUsageError) {
        process.stderr.write(`drill usage error: ${error.message}\n`);
        process.exitCode = EXIT_CODES.USAGE;
      } else if (error instanceof DrillRefusedError) {
        process.stderr.write(`drill refused [${error.code}]: ${error.message}\n`);
        process.exitCode = EXIT_CODES.REFUSED;
      } else if (error instanceof RunnerError) {
        process.stderr.write(`drill failed: ${error.message}\n`);
        process.exitCode = error.exitCode ?? EXIT_CODES.DRILL_FAILED;
      } else {
        process.stderr.write(`drill failed: ${error?.stack ?? error}\n`);
        process.exitCode = EXIT_CODES.DRILL_FAILED;
      }
    },
  );
}
