#!/usr/bin/env node
/**
 * Pure logic for the isolated DR drill harness (G1 E1/E2, Phase A).
 *
 * This module deliberately performs no I/O beyond path/timestamp parsing. The
 * runner (`drill-runner.mjs`) owns Docker/PowerShell/HTTP side effects; tests
 * import this file directly with synthetic fixtures.
 *
 * Hard rule encoded here: a drill may only target `tiangong-kaiwu-drill` or a
 * `tiangong-kaiwu-drill-*` project. The main stack project (`tiangong-kaiwu`)
 * is never a valid drill target, and destructive scenarios additionally need
 * both an explicit allow flag and a matching --confirm-project value.
 */

import { createHmac } from 'node:crypto';
import { isAbsolute, resolve, relative, basename } from 'node:path';

import { PRODUCTION_SCENARIO_IDS } from './production-drills.mjs';

export const MAIN_PROJECT_NAME = 'tiangong-kaiwu';
export const DRILL_PROJECT_PREFIX = 'tiangong-kaiwu-drill';
export const REPORT_KIND = 'tiangong-kaiwu-drill-report';
export const ROUNDTRIP_REPORT_KIND = 'tiangong-kaiwu-drill-roundtrip-report';
export const REPORT_SCHEMA_VERSION = 1;

export const EXIT_CODES = Object.freeze({
  OK: 0,
  DRILL_FAILED: 1,
  USAGE: 2,
  REFUSED: 3,
});

/**
 * Host ports owned by the main stack (and conventional backing services).
 * Drill port plans must be disjoint from this set.
 */
export const RESERVED_MAIN_PORTS = Object.freeze([
  5300, 5301, 5400, 5401, 5402, 5403, 5432, 6379, 1080,
  10500, 10501, 10502, 10000, 10001, 10002,
]);

export const DRILL_CHECK_NAMES = Object.freeze([
  'project-name',
  'drill-id',
  'workspace-location',
  'compose-file',
  'env-file',
  'volumes',
  'ports',
  'network',
  'not-main-compose',
  'not-main-env',
]);

export const DESTRUCTIVE_SCENARIOS = Object.freeze([
  'delete-sentinel-blob',
  'corrupt-sentinel-blob',
]);

/**
 * Isolated drill scenarios. These are the only scenarios this harness can
 * execute; production PITR/object-versioning drills live in
 * `production-drills.mjs` and are never listed here.
 */
export const ISOLATED_DRILL_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'S0',
    title: 'Read-only preflight and backup manifest verification',
    commands: Object.freeze(['preflight', 'verify-backup']),
    destructive: false,
    executedInPhaseA: true,
  }),
  Object.freeze({
    id: 'S1',
    title: 'Restore a verified backup into a proven-empty drill target',
    commands: Object.freeze(['create', 'restore', 'verify']),
    destructive: false,
    executedInPhaseA: true,
  }),
  Object.freeze({
    id: 'S2',
    title: 'Post-restore DB/blob/integrity verification and roundtrip report',
    commands: Object.freeze(['verify', 'report', 'report-roundtrip']),
    destructive: false,
    executedInPhaseA: true,
  }),
  Object.freeze({
    id: 'S3',
    title: 'Opt-in destructive fault injection (isolated drill project only)',
    commands: Object.freeze(['fault-inject', 'reset-target', 'restore']),
    destructive: true,
    executedInPhaseA: false,
  }),
  Object.freeze({
    id: 'S4',
    title: 'Scheduled/periodic repetition of S0-S2',
    commands: Object.freeze(['run', 'roundtrip', 'down']),
    destructive: false,
    executedInPhaseA: false,
  }),
]);

export function validateIsolatedScenarioCatalog(catalog = ISOLATED_DRILL_SCENARIOS) {
  const errors = [];
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return { ok: false, errors: ['isolated scenario catalog must be a non-empty array'] };
  }
  const ids = new Set();
  for (const scenario of catalog) {
    const id = String(scenario?.id ?? '');
    if (!/^S\d+$/.test(id)) errors.push(`invalid isolated scenario id: '${id}'`);
    if (ids.has(id)) errors.push(`duplicate isolated scenario: ${id}`);
    ids.add(id);
    if (PRODUCTION_SCENARIO_IDS.includes(id)) {
      errors.push(`production scenario '${id}' must not be listed in the isolated catalog`);
    }
    if (typeof scenario?.title !== 'string' || scenario.title.trim() === '') {
      errors.push(`${id}: title is required`);
    }
    if (!Array.isArray(scenario?.commands) || scenario.commands.length === 0) {
      errors.push(`${id}: commands must be a non-empty array`);
    } else {
      for (const command of scenario.commands) {
        if (!COMMANDS.includes(command)) errors.push(`${id}: unknown command '${command}'`);
      }
    }
    if (typeof scenario?.destructive !== 'boolean') errors.push(`${id}: destructive must be boolean`);
    if (typeof scenario?.executedInPhaseA !== 'boolean') errors.push(`${id}: executedInPhaseA must be boolean`);
    if (id === 'S3' && scenario.destructive !== true) errors.push('S3 must remain destructive');
    if (id === 'S4' && scenario.executedInPhaseA !== false) errors.push('S4 must remain unexecuted');
  }
  for (const expected of ['S0', 'S1', 'S2', 'S3', 'S4']) {
    if (!ids.has(expected)) errors.push(`missing isolated scenario: ${expected}`);
  }
  return { ok: errors.length === 0, errors };
}

export const NON_DESTRUCTIVE_COMMANDS = Object.freeze([
  'preflight', 'create', 'up', 'seed', 'backup', 'verify-backup',
  'restore', 'verify', 'scenarios', 'plan', 'report', 'report-roundtrip', 'down', 'run', 'roundtrip', 'help',
]);

export const COMMANDS = Object.freeze([
  ...NON_DESTRUCTIVE_COMMANDS,
  // Drill-only destructive commands. They are implemented but never executed
  // by the harness itself; each requires explicit operator gates.
  'reset-target', 'teardown', 'fault-inject',
]);

export class DrillUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DrillUsageError';
  }
}

export class DrillRefusedError extends Error {
  constructor(message, code = 'refused') {
    super(message);
    this.name = 'DrillRefusedError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Project name and port isolation                                    */
/* ------------------------------------------------------------------ */

export function isMainProjectName(name) {
  return String(name ?? '').trim().toLowerCase() === MAIN_PROJECT_NAME;
}

export function isDrillProjectName(name) {
  const value = String(name ?? '').trim();
  return /^tiangong-kaiwu-drill(?:-[a-z0-9][a-z0-9-]{0,30})?$/.test(value);
}

export function assertDrillProjectName(name) {
  if (isMainProjectName(name)) {
    throw new DrillRefusedError(
      `refusing to target the main compose project '${MAIN_PROJECT_NAME}'; ` +
        `drill targets must be '${DRILL_PROJECT_PREFIX}' or '${DRILL_PROJECT_PREFIX}-<suffix>'`,
      'main-project',
    );
  }
  if (!isDrillProjectName(name)) {
    throw new DrillRefusedError(
      `invalid drill project name '${name}'; expected '${DRILL_PROJECT_PREFIX}' or ` +
        `'${DRILL_PROJECT_PREFIX}-<lowercase-suffix>'`,
      'invalid-project',
    );
  }
  return name;
}

/**
 * Drill ports live in a high, disjoint block so a same-host drill can never
 * bind a main-stack port. `offset` (0..9) lets a source and a restore target
 * run concurrently (offset 0 and 1) without sharing ports or volumes.
 */
export function computeDrillPorts(offset = 0) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 9) {
    throw new DrillUsageError('port offset must be an integer between 0 and 9');
  }
  const shift = offset * 100;
  return {
    hub: 15400 + shift,
    ms: 15401 + shift,
    wa: 15402 + shift,
    azuriteBlob: 20500 + shift,
    azuriteQueue: 20501 + shift,
    azuriteTable: 20502 + shift,
  };
}

export function findReservedPortConflicts(ports) {
  const reserved = new Set(RESERVED_MAIN_PORTS);
  const conflicts = [];
  for (const [name, port] of Object.entries(ports ?? {})) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      conflicts.push({ name, port, reason: 'invalid-port' });
    } else if (reserved.has(port)) {
      conflicts.push({ name, port, reason: 'reserved-main-port' });
    }
  }
  return conflicts;
}

/* ------------------------------------------------------------------ */
/* Path isolation                                                     */
/* ------------------------------------------------------------------ */

export function resolveFrom(base, value) {
  if (!value) return null;
  return isAbsolute(value) ? resolve(value) : resolve(base, value);
}

export function isPathInside(child, parent) {
  const childResolved = resolve(child);
  const parentResolved = resolve(parent);
  const rel = relative(parentResolved, childResolved);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => {
    let out = resolve(value).replace(/[\\/]+$/, '');
    if (process.platform === 'win32') out = out.toLowerCase();
    return out;
  };
  return normalize(left) === normalize(right);
}

export function drillWorkspaceFor(repoRoot, drillId) {
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(String(drillId ?? ''))) {
    throw new DrillUsageError(
      'drill id must be 3..64 lowercase letters/digits/hyphens and start with a letter or digit',
    );
  }
  return resolve(repoRoot, '.drill', drillId);
}

/* ------------------------------------------------------------------ */
/* CLI argument parsing/validation                                    */
/* ------------------------------------------------------------------ */

const OPTION_SPECS = {
  'drill-id': { type: 'string' },
  workspace: { type: 'string' },
  project: { type: 'string' },
  'port-offset': { type: 'string' },
  'backup-dir': { type: 'string' },
  'source-workspace': { type: 'string' },
  'env-template': { type: 'string' },
  'confirm-project': { type: 'string' },
  'allow-destructive': { type: 'boolean' },
  'allow-drill-reset': { type: 'boolean' },
  'allow-external-backup': { type: 'boolean' },
  'delete-workspace': { type: 'boolean' },
  'skip-integrity': { type: 'boolean' },
  'strict-integrity': { type: 'boolean' },
  'timeout-sec': { type: 'string' },
  report: { type: 'string' },
  scenario: { type: 'string' },
  format: { type: 'string' },
};

function needsValue(command) {
  return !['help'].includes(command);
}

/**
 * Parse and validate argv. Pure: no Docker, no filesystem writes.
 *
 * @param {string[]} argv
 * @param {{repoRoot:string, env?:NodeJS.ProcessEnv}} context
 */
export function parseDrillArgs(argv, context = {}) {
  const repoRoot = resolve(context.repoRoot ?? process.cwd());
  const env = context.env ?? process.env;
  const args = [...argv];

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    return { command: 'help', options: {}, warnings: [] };
  }

  const command = args.shift();
  if (!COMMANDS.includes(command)) {
    throw new DrillUsageError(
      `unknown command '${command}'; expected one of: ${COMMANDS.join(', ')}`,
    );
  }

  const options = {
    project: DRILL_PROJECT_PREFIX,
    portOffset: 0,
    format: 'text',
    timeoutSec: 180,
    skipIntegrity: false,
    strictIntegrity: false,
  };
  const seen = new Set();

  while (args.length > 0) {
    const token = args.shift();
    if (token === '--help' || token === '-h') {
      return { command: 'help', options: {}, warnings: [] };
    }
    if (!token.startsWith('--')) {
      throw new DrillUsageError(`unexpected positional argument '${token}'`);
    }
    const eq = token.indexOf('=');
    const name = (eq >= 0 ? token.slice(2, eq) : token.slice(2));
    const spec = OPTION_SPECS[name];
    if (!spec) throw new DrillUsageError(`unknown option '--${name}'`);
    if (seen.has(name)) throw new DrillUsageError(`duplicate option '--${name}'`);
    seen.add(name);

    let value;
    if (spec.type === 'boolean') {
      if (eq >= 0) throw new DrillUsageError(`--${name} does not take a value`);
      value = true;
    } else {
      if (eq >= 0) {
        value = token.slice(eq + 1);
      } else {
        if (!needsValue(command) || args.length === 0 || args[0].startsWith('--')) {
          throw new DrillUsageError(`--${name} requires a value`);
        }
        value = args.shift();
      }
      if (value === '') throw new DrillUsageError(`--${name} must not be empty`);
    }

    switch (name) {
      case 'drill-id': options.drillId = value; break;
      case 'workspace': options.workspace = value; break;
      case 'project': options.project = value; break;
      case 'port-offset': options.portOffsetRaw = value; break;
      case 'backup-dir': options.backupDir = value; break;
      case 'source-workspace': options.sourceWorkspace = value; break;
      case 'env-template': options.envTemplate = value; break;
      case 'confirm-project': options.confirmProject = value; break;
      case 'allow-destructive': options.allowDestructive = true; break;
      case 'allow-drill-reset': options.allowDrillReset = true; break;
      case 'allow-external-backup': options.allowExternalBackup = true; break;
      case 'delete-workspace': options.deleteWorkspace = true; break;
      case 'skip-integrity': options.skipIntegrity = true; break;
      case 'strict-integrity': options.strictIntegrity = true; break;
      case 'timeout-sec': options.timeoutSecRaw = value; break;
      case 'report': options.report = value; break;
      case 'scenario': options.scenario = value; break;
      case 'format': options.format = value; break;
      default: throw new DrillUsageError(`unhandled option '--${name}'`);
    }
  }

  if (!['text', 'json'].includes(options.format)) {
    throw new DrillUsageError("--format must be 'text' or 'json'");
  }
  if (options.portOffsetRaw !== undefined) {
    if (!/^\d+$/.test(options.portOffsetRaw)) {
      throw new DrillUsageError('--port-offset must be an integer between 0 and 9');
    }
    options.portOffset = Number(options.portOffsetRaw);
  }
  delete options.portOffsetRaw;
  assertDrillProjectName(options.project);

  if (options.timeoutSecRaw !== undefined) {
    if (!/^\d+$/.test(options.timeoutSecRaw) || Number(options.timeoutSecRaw) < 10) {
      throw new DrillUsageError('--timeout-sec must be an integer >= 10');
    }
    options.timeoutSec = Number(options.timeoutSecRaw);
  }
  delete options.timeoutSecRaw;

  options.ports = computeDrillPorts(options.portOffset);
  const portConflicts = findReservedPortConflicts(options.ports);
  if (portConflicts.length > 0) {
    throw new DrillRefusedError(
      `drill port plan overlaps reserved main-stack ports: ${portConflicts
        .map((c) => `${c.name}=${c.port}`).join(', ')}`,
      'port-conflict',
    );
  }

  if (options.workspace) {
    options.workspace = resolve(repoRoot, options.workspace);
  } else if (options.drillId) {
    options.workspace = drillWorkspaceFor(repoRoot, options.drillId);
  } else {
    options.workspace = null;
  }

  if (options.workspace) {
    assertWorkspaceInsideDrillRoot(options.workspace, repoRoot);
    if (!options.drillId) options.drillId = basename(options.workspace);
  }

  if (options.sourceWorkspace) {
    options.sourceWorkspace = resolve(repoRoot, options.sourceWorkspace);
    assertWorkspaceInsideDrillRoot(options.sourceWorkspace, repoRoot);
  }
  if (options.envTemplate) {
    options.envTemplate = resolve(repoRoot, options.envTemplate);
    assertWorkspaceInsideDrillRoot(options.envTemplate, repoRoot);
  }

  if (options.backupDir) {
    options.backupDir = resolve(options.workspace ?? repoRoot, options.backupDir);
    if (!isPathInside(options.backupDir, resolve(repoRoot, '.drill')) && !options.allowExternalBackup) {
      throw new DrillRefusedError(
        'backup directory must live under <repo>/.drill; pass --allow-external-backup only for a ' +
          'previously copied, non-production drill backup set',
        'external-backup',
      );
    }
  }

  if (options.confirmProject !== undefined && options.confirmProject !== options.project) {
    throw new DrillRefusedError(
      `--confirm-project '${options.confirmProject}' does not match drill project '${options.project}'; ` +
        'refusing to continue',
      'confirm-mismatch',
    );
  }

  // HITL gates. These are intentionally checked here so no command handler can
  // forget them.
  if (command === 'restore' && options.confirmProject !== options.project) {
    throw new DrillRefusedError(
      'restore is destructive to the drill target and requires ' +
        `--confirm-project ${options.project} (HITL gate)`,
      'hitl-required',
    );
  }
  if (command === 'roundtrip' && options.confirmProject !== options.project) {
    throw new DrillRefusedError(
      'roundtrip creates a second drill target and restores into it; it requires ' +
        `--confirm-project ${options.project} (HITL gate)`,
      'hitl-required',
    );
  }
  if (command === 'teardown' && options.confirmProject !== options.project) {
    throw new DrillRefusedError(
      'teardown deletes drill volumes and requires ' +
        `--confirm-project ${options.project} (HITL gate)`,
      'hitl-required',
    );
  }
  if (command === 'reset-target') {
    if (!options.allowDrillReset) {
      throw new DrillRefusedError(
        'reset-target deletes all drill volumes; re-run with --allow-drill-reset ' +
          `and --confirm-project ${options.project}`,
        'destructive-not-allowed',
      );
    }
    if (options.confirmProject !== options.project) {
      throw new DrillRefusedError(
        `reset-target requires --confirm-project ${options.project}`,
        'hitl-required',
      );
    }
  }
  if (command === 'plan') {
    if (!options.scenario) {
      throw new DrillUsageError(
        `plan requires --scenario <production-scenario>; expected one of: ${PRODUCTION_SCENARIO_IDS.join(', ')}`,
      );
    }
    if (!PRODUCTION_SCENARIO_IDS.includes(options.scenario)) {
      throw new DrillUsageError(
        `--scenario for plan must be one of: ${PRODUCTION_SCENARIO_IDS.join(', ')}`,
      );
    }
  }
  if (command === 'fault-inject') {
    if (!options.scenario || !DESTRUCTIVE_SCENARIOS.includes(options.scenario)) {
      throw new DrillUsageError(
        `--scenario must be one of: ${DESTRUCTIVE_SCENARIOS.join(', ')}`,
      );
    }
    if (!options.allowDestructive) {
      throw new DrillRefusedError(
        'fault-inject is destructive and is disabled by default; re-run with ' +
          '--allow-destructive --confirm-project <drill-project> only after written approval',
        'destructive-not-allowed',
      );
    }
    if (options.confirmProject !== options.project) {
      throw new DrillRefusedError(
        `fault-inject requires --confirm-project ${options.project}`,
        'hitl-required',
      );
    }
    if (env.DR_DRILL_DESTRUCTIVE_ACK !== '1') {
      throw new DrillRefusedError(
        'fault-inject additionally requires DR_DRILL_DESTRUCTIVE_ACK=1 in the operator environment',
        'destructive-ack-missing',
      );
    }
  }

  // Command-specific requirements.
  if (['up', 'seed', 'backup', 'verify-backup', 'restore', 'verify', 'report',
    'report-roundtrip', 'down', 'teardown', 'reset-target', 'fault-inject', 'run',
    'roundtrip', 'preflight']
    .includes(command) && !options.workspace) {
    throw new DrillUsageError(
      `command '${command}' requires --workspace or --drill-id`,
    );
  }
  if (command === 'restore' && !options.backupDir) {
    throw new DrillUsageError('restore requires --backup-dir <backup-directory>');
  }
  if (command === 'report-roundtrip' && !options.sourceWorkspace) {
    throw new DrillUsageError('report-roundtrip requires --source-workspace <source-drill-workspace>');
  }
  if (command === 'create' && !options.workspace) {
    throw new DrillUsageError('create requires --drill-id <id> (or --workspace)');
  }

  return { command, options, warnings: [] };
}

function assertWorkspaceInsideDrillRoot(workspace, repoRoot) {
  const drillRoot = resolve(repoRoot, '.drill');
  if (!isPathInside(workspace, drillRoot)) {
    throw new DrillRefusedError(
      `workspace '${workspace}' is outside ${drillRoot}; drill workspaces must live under <repo>/.drill`,
      'workspace-outside-drill-root',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Isolation verification against a workspace metadata file           */
/* ------------------------------------------------------------------ */

/**
 * Verify a drill workspace metadata object before any Docker operation.
 *
 * @param {object} meta
 * @param {{repoRoot:string}} context
 * @returns {{ok:boolean, checks:Array<{name:string,ok:boolean,detail:string}>, errors:string[]}}
 */
export function verifyIsolation(meta, context = {}) {
  const repoRoot = resolve(context.repoRoot ?? process.cwd());
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail) });

  const projectName = String(meta?.projectName ?? '');
  const projectOk = isDrillProjectName(projectName) && !isMainProjectName(projectName);
  add('project-name', projectOk,
    projectOk ? projectName : `invalid drill project: '${projectName}'`);

  const workspace = meta?.workspace ? resolve(meta.workspace) : null;
  const drillRoot = resolve(repoRoot, '.drill');
  add('drill-id',
    Boolean(meta?.drillId) && Boolean(workspace) && basename(workspace) === meta.drillId,
    workspace ? `drillId=${meta?.drillId ?? 'missing'} basename=${basename(workspace)}` : 'missing workspace');
  add('workspace-location', workspace && isPathInside(workspace, drillRoot),
    workspace ? `${workspace} (drill root ${drillRoot})` : 'missing workspace');

  const expectedCompose = workspace ? resolve(workspace, 'docker-compose.yml') : null;
  add('compose-file', Boolean(expectedCompose) && samePath(meta?.composeFile, expectedCompose),
    String(meta?.composeFile ?? 'missing composeFile'));

  const expectedEnv = workspace ? resolve(workspace, '.env') : null;
  add('env-file', Boolean(expectedEnv) && samePath(meta?.envFile, expectedEnv),
    String(meta?.envFile ?? 'missing envFile'));

  const expectedVolumeSuffixes = ['pgdata', 'redis-data', 'azurite-data'];
  const volumes = Array.isArray(meta?.volumes) ? meta.volumes : [];
  const volumesOk = volumes.length === expectedVolumeSuffixes.length &&
    expectedVolumeSuffixes.every((suffix) => {
      const expected = `${projectName}-${suffix}`;
      return volumes.some((name) => samePathName(name, expected));
    });
  add('volumes', volumesOk, volumes.join(', ') || 'missing volumes');

  const expectedPorts = (() => {
    try { return computeDrillPorts(Number(meta?.portOffset ?? 0)); } catch { return null; }
  })();
  const ports = meta?.ports ?? {};
  const portsOk = Boolean(expectedPorts) &&
    Object.entries(expectedPorts).every(([name, port]) => ports[name] === port) &&
    findReservedPortConflicts(ports).length === 0;
  add('ports', portsOk,
    JSON.stringify(expectedPorts) + ` (actual ${JSON.stringify(ports)})`);

  const networkExpected = `${projectName}-net`;
  add('network', samePathName(meta?.network, networkExpected), String(meta?.network ?? 'missing'));

  add('not-main-compose',
    Boolean(meta?.composeFile) && !samePath(meta.composeFile, resolve(repoRoot, 'docker-compose.yml')),
    'compose file must not be the repository root docker-compose.yml');
  add('not-main-env',
    Boolean(meta?.envFile) && !samePath(meta.envFile, resolve(repoRoot, '.env')),
    'env file must not be the repository root .env');

  const errors = checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`);
  return { ok: errors.length === 0, checks, errors };
}

function samePathName(left, right) {
  if (!left || !right) return false;
  if (process.platform === 'win32') {
    return String(left).toLowerCase() === String(right).toLowerCase();
  }
  return String(left) === String(right);
}

/* ------------------------------------------------------------------ */
/* Backup manifest verification (pure over supplied stats)            */
/* ------------------------------------------------------------------ */

const ARTIFACT_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Validate a backup manifest and (optionally) the caller-supplied file stats.
 *
 * @param {object} manifest parsed manifest.json
 * @param {{
 *   artifactStats?: Record<string,{bytes:number,sha256:string}>,
 *   actualManifestSha256?: string,
 *   expectedManifestSha256?: string,
 *   requiredArtifacts?: string[]
 * }} options
 */
export function validateBackupManifest(manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const required = options.requiredArtifacts ?? ['postgres.dump', 'azurite-data.tar.gz'];
  const artifacts = [];

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest is not an object'], warnings, artifacts };
  }
  if (manifest.kind !== 'tiangong-kaiwu-baseline-backup') {
    errors.push(`manifest.kind is '${manifest.kind}', expected 'tiangong-kaiwu-baseline-backup'`);
  }
  if (Number(manifest.schemaVersion) !== 1) {
    errors.push(`unsupported manifest.schemaVersion: ${manifest.schemaVersion}`);
  }
  if (typeof manifest.backupId !== 'string' || manifest.backupId.length === 0) {
    errors.push('manifest.backupId is missing');
  }
  if (manifest.createdAtUtc && Number.isNaN(Date.parse(manifest.createdAtUtc))) {
    errors.push(`manifest.createdAtUtc is not a valid timestamp: ${manifest.createdAtUtc}`);
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    errors.push('manifest.artifacts is empty');
  }

  const declared = new Map();
  for (const artifact of Array.isArray(manifest.artifacts) ? manifest.artifacts : []) {
    const rel = String(artifact?.path ?? '').replaceAll('\\', '/');
    const stat = options.artifactStats?.[rel];
    const record = {
      path: rel,
      declaredBytes: Number(artifact?.bytes),
      declaredSha256: String(artifact?.sha256 ?? '').toLowerCase(),
      actualBytes: stat?.bytes ?? null,
      actualSha256: stat?.sha256 ? String(stat.sha256).toLowerCase() : null,
      verified: false,
    };
    if (!ARTIFACT_PATH_RE.test(rel)) {
      errors.push(`artifact path is unsafe: '${artifact?.path}'`);
    } else if (declared.has(rel)) {
      errors.push(`duplicate artifact path: ${rel}`);
    } else {
      declared.set(rel, artifact);
    }
    if (!Number.isInteger(record.declaredBytes) || record.declaredBytes <= 0) {
      errors.push(`artifact ${rel}: declared bytes must be a positive integer`);
    }
    if (!SHA256_RE.test(record.declaredSha256)) {
      errors.push(`artifact ${rel}: declared SHA-256 is not 64 lowercase hex chars`);
    }
    if (options.artifactStats !== undefined) {
      if (!stat) {
        errors.push(`artifact ${rel}: file is missing from the backup directory`);
      } else if (stat.bytes !== record.declaredBytes) {
        errors.push(`artifact ${rel}: size mismatch (manifest=${record.declaredBytes}, actual=${stat.bytes})`);
      } else if (String(stat.sha256 ?? '').toLowerCase() !== record.declaredSha256) {
        errors.push(`artifact ${rel}: SHA-256 mismatch`);
      } else {
        record.verified = true;
      }
    }
    artifacts.push(record);
  }

  for (const name of required) {
    if (!declared.has(name)) errors.push(`manifest is missing required artifact: ${name}`);
  }

  if (manifest.restoreOrder !== undefined) {
    const order = Array.isArray(manifest.restoreOrder) ? manifest.restoreOrder.join('|') : '';
    if (order !== 'postgres.dump|azurite-data.tar.gz') {
      errors.push(`unsupported manifest.restoreOrder: ${order || '(empty)'}`);
    }
  } else {
    warnings.push('manifest.restoreOrder is missing; using the fixed DB-then-object order');
  }

  if (manifest.consistency?.mode && !['quiesced', 'online-best-effort', 'unknown'].includes(manifest.consistency.mode)) {
    warnings.push(`unrecognized consistency.mode: ${manifest.consistency.mode}`);
  }
  if (!manifest.consistency?.mode) {
    warnings.push('manifest.consistency.mode is missing');
  }

  if (options.expectedManifestSha256) {
    const expected = String(options.expectedManifestSha256).toLowerCase();
    const actual = String(options.actualManifestSha256 ?? '').toLowerCase();
    if (!SHA256_RE.test(expected)) {
      errors.push('manifest.sha256 sidecar is not a valid SHA-256');
    } else if (actual && expected !== actual) {
      errors.push(`manifest.json SHA-256 mismatch (sidecar=${expected}, actual=${actual})`);
    }
  } else if (options.requireSidecar) {
    errors.push('manifest.sha256 sidecar is missing');
  }

  return { ok: errors.length === 0, errors, warnings, artifacts };
}

/* ------------------------------------------------------------------ */
/* Empty-target and main-project snapshots                            */
/* ------------------------------------------------------------------ */

/**
 * Pure assessment of whether a restore target is still empty/unused.
 */
export function assessEmptyTarget({ userTableCount, azuriteVolumeEntries, runningWriters } = {}) {
  const reasons = [];
  if (!Number.isInteger(userTableCount) || userTableCount < 0) {
    reasons.push('could not determine target Postgres user-table count');
  } else if (userTableCount > 0) {
    reasons.push(`target Postgres already has ${userTableCount} user tables`);
  }
  if (!Number.isInteger(azuriteVolumeEntries) || azuriteVolumeEntries < 0) {
    reasons.push('could not determine target Azurite volume entry count');
  } else if (azuriteVolumeEntries > 0) {
    reasons.push(`target Azurite volume is non-empty (${azuriteVolumeEntries} entries)`);
  }
  const writers = Array.isArray(runningWriters) ? runningWriters.filter(Boolean) : [];
  if (writers.length > 0) {
    reasons.push(`target writers are still running: ${writers.join(', ')}`);
  }
  return { empty: reasons.length === 0, reasons };
}

/**
 * Compare before/after snapshots of the main compose project. Snapshots are
 * arrays of canonical strings (id|name|state|image) produced by the runner.
 */
export function compareProjectSnapshots(before = [], after = []) {
  const beforeSet = new Set(before.map(String));
  const afterSet = new Set(after.map(String));
  const added = [...afterSet].filter((line) => !beforeSet.has(line)).sort();
  const removed = [...beforeSet].filter((line) => !afterSet.has(line)).sort();
  return {
    unchanged: added.length === 0 && removed.length === 0,
    added,
    removed,
    beforeCount: beforeSet.size,
    afterCount: afterSet.size,
  };
}

/* ------------------------------------------------------------------ */
/* Report construction/validation                                     */
/* ------------------------------------------------------------------ */

const PHASE_STATUSES = new Set(['passed', 'failed', 'partial', 'skipped']);

function phaseDuration(phases, name) {
  const phase = phases.find((item) => item.name === name);
  return phase && Number.isFinite(phase.durationMs) ? phase.durationMs : null;
}

function secondsBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round(((end - start) / 1000) * 1000) / 1000);
}

/**
 * Build the drill report from workspace state. All RPO/RTO values are
 * measurements (or null); target-achievement claims are always false.
 */
export function buildDrillReport({ meta, state, generatedAtUtc = new Date().toISOString() }) {
  const phases = Array.isArray(state?.phases) ? state.phases : [];
  const backup = state?.backup ?? null;
  const restore = state?.restore ?? null;
  const verification = state?.verification ?? null;
  const isolation = verifyIsolation(meta, { repoRoot: meta?.repoRoot ?? process.cwd() });

  const rpoMeasuredSeconds = secondsBetween(backup?.createdAtUtc, restore?.startedAtUtc);
  const lastPushedEditAtUtc = state?.rpoInput?.lastPushedEditAtUtc ?? null;
  const trueRpoSeconds = secondsBetween(lastPushedEditAtUtc, backup?.createdAtUtc);
  // RTO stops when the DB/blob verification passes. The integrity scan may
  // finish later (and may be partial for a minimal seed); it does not gate the
  // measured restore-to-usable time.
  const stackVerifiedAtUtc = verification?.stackVerifiedAtUtc ??
    (verification?.status === 'passed' ? verification?.finishedAtUtc : null);
  const rtoMeasuredSeconds =
    restore?.startedAtUtc && stackVerifiedAtUtc && verification?.stack?.passed === true
      ? secondsBetween(restore.startedAtUtc, stackVerifiedAtUtc)
      : null;

  const backupVerified = Boolean(backup?.manifestVerified ?? backup?.verified);
  const restorePassed = restore?.status === 'passed' && restore?.targetWasEmpty === true;
  const stackVerified = verification?.stack?.passed === true;
  const blobVerified = verification?.blob?.verified === true;
  const integrityExitCode = verification?.integrity?.exitCode;
  const integrityClean = integrityExitCode === 0;
  const faultInjection = state?.faultInjection;

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    kind: REPORT_KIND,
    tool: 'scripts/dr/drill-runner.mjs',
    generatedAtUtc,
    drillId: meta?.drillId ?? null,
    sourceCommit: meta?.sourceCommit ?? 'unknown',
    isolation: {
      projectName: meta?.projectName ?? null,
      mainProjectName: MAIN_PROJECT_NAME,
      portOffset: meta?.portOffset ?? null,
      ports: meta?.ports ?? null,
      volumes: meta?.volumes ?? [],
      network: meta?.network ?? null,
      workspace: meta?.workspace ?? null,
      verified: isolation.ok,
      checks: isolation.checks,
      mainProjectUntouched: state?.mainProjectUntouched ?? null,
      mainProjectSnapshot: state?.mainProjectSnapshot ?? null,
    },
    phases: phases.map((phase) => ({
      name: phase.name,
      status: phase.status,
      startedAtUtc: phase.startedAtUtc ?? null,
      finishedAtUtc: phase.finishedAtUtc ?? null,
      durationMs: Number.isFinite(phase.durationMs) ? phase.durationMs : null,
      details: phase.details ?? {},
    })),
    backup: backup
      ? {
          backupId: backup.backupId ?? null,
          backupDir: backup.backupDir ?? null,
          createdAtUtc: backup.createdAtUtc ?? null,
          consistencyMode: backup.consistencyMode ?? null,
          manifestSha256: backup.manifestSha256 ?? null,
          manifestVerified: backupVerified,
          artifacts: backup.artifacts ?? [],
        }
      : null,
    restore: restore
      ? {
          status: restore.status ?? null,
          targetWasEmpty: restore.targetWasEmpty ?? null,
          backupId: restore.backupId ?? null,
          startedAtUtc: restore.startedAtUtc ?? null,
          finishedAtUtc: restore.finishedAtUtc ?? null,
          durationMs: restore.durationMs ?? null,
          command: restore.command ?? null,
        }
      : null,
    verification: verification
      ? {
          status: verification.status ?? null,
          startedAtUtc: verification.startedAtUtc ?? null,
          stackVerifiedAtUtc: verification.stackVerifiedAtUtc ?? null,
          finishedAtUtc: verification.finishedAtUtc ?? null,
          stack: verification.stack ?? null,
          blob: verification.blob ?? null,
          integrity: verification.integrity ?? null,
          checks: verification.checks ?? [],
        }
      : null,
    timings: {
      createMs: phaseDuration(phases, 'create'),
      upMs: phaseDuration(phases, 'up'),
      seedMs: phaseDuration(phases, 'seed'),
      backupMs: phaseDuration(phases, 'backup'),
      verifyBackupMs: phaseDuration(phases, 'verify-backup'),
      restoreMs: phaseDuration(phases, 'restore'),
      verifyMs: phaseDuration(phases, 'verify'),
      downMs: phaseDuration(phases, 'down'),
      totalPhaseMs: phases.reduce((sum, phase) => sum + (Number(phase.durationMs) || 0), 0),
    },
    rpo: {
      measurement: 'backup-age-at-restore-start',
      backupCreatedAtUtc: backup?.createdAtUtc ?? null,
      restoreStartedAtUtc: restore?.startedAtUtc ?? null,
      measuredSeconds: rpoMeasuredSeconds,
      lastPushedEditAtUtc,
      trueRpoSeconds,
      targetSeconds: 300,
      withinTargetThisRun: rpoMeasuredSeconds === null ? null : rpoMeasuredSeconds <= 300,
      targetAchievedClaim: false,
      note:
        'measuredSeconds is the age of this backup set when the drill restore started. ' +
        'It is not a production RPO measurement and does not prove RPO<=5m. ' +
        'trueRpoSeconds is populated only when the operator supplies lastPushedEditAtUtc.',
    },
    rto: {
      measurement: 'restore-start-to-drill-db-and-blob-verification-pass',
      restoreStartedAtUtc: restore?.startedAtUtc ?? null,
      stackVerifiedAtUtc,
      verificationFinishedAtUtc: verification?.finishedAtUtc ?? null,
      measuredSeconds: rtoMeasuredSeconds,
      targetSeconds: 3600,
      withinTargetThisRun: rtoMeasuredSeconds === null ? null : rtoMeasuredSeconds <= 3600,
      targetAchievedClaim: false,
      note:
        'single-drill restore timing only; excludes production change windows, HA/failover, ' +
        'business sign-off, and the unbacked Redis/briefcase surfaces. Does not prove RTO<=1h.',
    },
    claims: {
      drillHarnessExecuted: phases.length > 0,
      backupManifestVerified: backupVerified,
      restoreIntoEmptyDrillCompleted: restorePassed,
      postRestoreHubApiVerified: stackVerified,
      postRestoreBlobSentinelVerified: blobVerified,
      integrityScanClean: integrityClean,
      destructiveFaultInjectionExercised: Boolean(faultInjection?.executed),
      rpoTargetAchieved: false,
      rtoTargetAchieved: false,
      productionDisasterRecoveryProven: false,
      redisQueueRecoveryProven: false,
    },
    limitations: [
      'drill-only evidence; no production HA/PITR claim',
      'PostgreSQL + Azurite volume only; Redis, briefcase caches, host files and images are not restored',
      'Azurite is a development object store; production requires versioned/replicated object storage',
      'single run does not establish continuous RPO/RTO compliance',
      'integrity scan exit 3 means partial verification, not clean',
    ],
  };

  const validation = validateDrillReport(report);
  if (!validation.ok) {
    throw new DrillUsageError(`internally inconsistent drill report: ${validation.errors.join('; ')}`);
  }
  return report;
}

export function validateDrillReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') return { ok: false, errors: ['report is not an object'] };
  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
  if (report.kind !== REPORT_KIND) errors.push(`kind must be '${REPORT_KIND}'`);
  if (!report.drillId) errors.push('drillId is required');
  if (!report.isolation || typeof report.isolation.verified !== 'boolean') {
    errors.push('isolation.verified must be boolean');
  }
  if (report.isolation?.projectName && !isDrillProjectName(report.isolation.projectName)) {
    errors.push(`isolation.projectName is not a drill project: ${report.isolation.projectName}`);
  }
  if (report.isolation?.projectName === MAIN_PROJECT_NAME) {
    errors.push('report targets the main project');
  }
  if (!Array.isArray(report.phases)) {
    errors.push('phases must be an array');
  } else {
    for (const phase of report.phases) {
      if (!PHASE_STATUSES.has(phase.status)) {
        errors.push(`phase ${phase.name}: invalid status '${phase.status}'`);
      }
    }
  }
  if (!report.timings || typeof report.timings !== 'object') errors.push('timings is required');
  for (const key of ['rpo', 'rto', 'claims', 'limitations']) {
    if (!report[key] || typeof report[key] !== 'object') errors.push(`${key} is required`);
  }
  for (const key of ['measuredSeconds', 'trueRpoSeconds']) {
    const value = report.rpo?.[key];
    if (value !== null && !(typeof value === 'number' && value >= 0)) {
      errors.push(`rpo.${key} must be a non-negative number or null`);
    }
  }
  if (report.rto?.measuredSeconds !== null &&
    !(typeof report.rto?.measuredSeconds === 'number' && report.rto.measuredSeconds >= 0)) {
    errors.push('rto.measuredSeconds must be a non-negative number or null');
  }
  if (report.claims?.rpoTargetAchieved !== false) {
    errors.push('claims.rpoTargetAchieved must be false (a single drill cannot prove the target)');
  }
  if (report.claims?.rtoTargetAchieved !== false) {
    errors.push('claims.rtoTargetAchieved must be false (a single drill cannot prove the target)');
  }
  if (report.claims?.productionDisasterRecoveryProven !== false) {
    errors.push('claims.productionDisasterRecoveryProven must be false');
  }
  if (report.claims?.redisQueueRecoveryProven !== false) {
    errors.push('claims.redisQueueRecoveryProven must be false');
  }
  return { ok: errors.length === 0, errors };
}

export function buildRoundtripReport({ source, target, generatedAtUtc = new Date().toISOString() }) {
  const sourceValidation = validateDrillReport(source);
  const targetValidation = validateDrillReport(target);
  const errors = [
    ...sourceValidation.errors.map((error) => `source: ${error}`),
    ...targetValidation.errors.map((error) => `target: ${error}`),
  ];
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    kind: ROUNDTRIP_REPORT_KIND,
    tool: 'scripts/dr/drill-runner.mjs',
    generatedAtUtc,
    sourceDrillId: source?.drillId ?? null,
    targetDrillId: target?.drillId ?? null,
    source,
    target,
    claims: {
      backupVerified: source?.claims?.backupManifestVerified === true,
      emptyTargetRestoreCompleted: target?.claims?.restoreIntoEmptyDrillCompleted === true,
      postRestoreHubApiVerified: target?.claims?.postRestoreHubApiVerified === true,
      postRestoreBlobSentinelVerified: target?.claims?.postRestoreBlobSentinelVerified === true,
      integrityScanClean: target?.claims?.integrityScanClean === true,
      rpoTargetAchieved: false,
      rtoTargetAchieved: false,
      productionDisasterRecoveryProven: false,
    },
    limitations: [
      'roundtrip evidence covers one backup set restored into one disposable drill target',
      'RPO/RTO measurements are drill timings only and do not establish targets',
      'fault-injection scenarios were not exercised unless explicitly recorded',
    ],
  };
  if (errors.length > 0) {
    report.validationErrors = errors;
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                 */
/* ------------------------------------------------------------------ */

/** Minimal .env parser (KEY=VALUE, comments, optional quotes). */
export function parseDotEnv(text) {
  const map = {};
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^"(.*)"\s*$/.test(value)) value = value.replace(/^"(.*)"\s*$/, '$1');
    else if (/^'(.*)'\s*$/.test(value)) value = value.replace(/^'(.*)'\s*$/, '$1');
    else value = value.replace(/\s+#.*$/, '').trim();
    map[match[1]] = value;
  }
  return map;
}

export function serializeDotEnv(map) {
  const lines = ['# generated by scripts/dr/drill-runner.mjs (drill-only; never commit)'];
  for (const key of Object.keys(map).sort()) {
    const value = String(map[key] ?? '');
    if (/[\r\n]/.test(value)) throw new DrillUsageError(`env value for ${key} contains a newline`);
    lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Build the drill env map. Secrets are generated by the runner; this function
 * only guarantees project/port isolation and refuses a main-project name.
 */
export function buildDrillEnvValues({ projectName, drillId, ports, secrets }) {
  assertDrillProjectName(projectName);
  const requireSecret = (key) => {
    const value = secrets?.[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new DrillUsageError(`missing generated secret: ${key}`);
    }
    return value;
  };
  return {
    COMPOSE_PROJECT_NAME: projectName,
    DRILL_PROJECT_NAME: projectName,
    DRILL_ID: drillId,
    DRILL_HUB_PORT: String(ports.hub),
    DRILL_MS_PORT: String(ports.ms),
    DRILL_WA_PORT: String(ports.wa),
    DRILL_AZURITE_BLOB_PORT: String(ports.azuriteBlob),
    DRILL_AZURITE_QUEUE_PORT: String(ports.azuriteQueue),
    DRILL_AZURITE_TABLE_PORT: String(ports.azuriteTable),
    PORT: String(ports.ms),
    IMODELHUB_URL: `http://127.0.0.1:${ports.hub}`,
    MODELING_SERVER_URL: `http://127.0.0.1:${ports.ms}`,
    WA_MODELING_SERVER_URL: `http://host.docker.internal:${ports.ms}`,
    AZURITE_HOST: `127.0.0.1:${ports.azuriteBlob}`,
    AZURE_BLOB_ENDPOINT: 'http://azurite:10000/devstoreaccount1',
    AZURE_BLOB_PUBLIC_HOST: `127.0.0.1:${ports.azuriteBlob}`,
    FRONTEND_URL: `http://127.0.0.1:${ports.hub}`,
    HUB_ALLOWED_ORIGINS: `http://127.0.0.1:${ports.hub}`,
    MS_UPSTREAM: `host.docker.internal:${ports.ms}`,
    BFF_UPSTREAM: `host.docker.internal:${ports.ms}`,
    BFF_ALLOWED_ORIGINS: `http://127.0.0.1:${ports.hub}`,
    HUB_UPSTREAM: 'imodelhub:4000',
    IMODELHUB_ADMIN_EMAIL: requireSecret('adminEmail'),
    IMODELHUB_ADMIN_PASSWORD: requireSecret('adminPassword'),
    IMODELHUB_API_KEY: requireSecret('imodelhubApiKey'),
    BACKEND_API_KEY: requireSecret('backendApiKey'),
    CSRF_SECRET: requireSecret('csrfSecret'),
    WEBHOOK_SECRET: requireSecret('webhookSecret'),
    AUTH_JWT_SECRET: requireSecret('authJwtSecret'),
    AUTH_REFRESH_SECRET: requireSecret('authRefreshSecret'),
    AUTH_FORGOT_SECRET: requireSecret('authForgotSecret'),
    AUTH_CONFIRM_EMAIL_SECRET: requireSecret('authConfirmEmailSecret'),
    HUB_DATABASE_USERNAME: 'drill',
    HUB_DATABASE_PASSWORD: requireSecret('dbPassword'),
    HUB_DATABASE_NAME: 'api',
    AZURITE_ACCOUNT_NAME: 'devstoreaccount1',
    AZURITE_ACCOUNT_KEY:
      'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
  };
}

/**
 * Sign an Azure Blob REST request with SharedKey (Azurite-compatible).
 * Mirrors the canonicalization used by scripts/integrity/Invoke-IntegrityScan.mjs,
 * with explicit Content-Length/Content-Type support for the seed PUT.
 */
export function signAzureRequest({ method, url, account, keyBase64, headers = {}, contentLength = 0, contentType = '' }) {
  const parsed = url instanceof URL ? url : new URL(url);
  const requestHeaders = { ...headers };
  requestHeaders['x-ms-date'] = requestHeaders['x-ms-date'] ?? new Date().toUTCString();
  requestHeaders['x-ms-version'] = requestHeaders['x-ms-version'] ?? '2021-12-02';

  const canonicalHeaders = Object.keys(requestHeaders)
    .filter((name) => name.toLowerCase().startsWith('x-ms-'))
    .map((name) => [name.toLowerCase(), String(requestHeaders[name]).trim()])
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');

  const query = [...parsed.searchParams.entries()]
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, value]) => `${name}:${value}`)
    .join('\n');

  const path = parsed.pathname.replace(/\/+$/, '');
  // Azure SDK always prepends the account to the URL path. For path-style
  // Azurite endpoints (http://host:port/account/...) this intentionally yields
  // /account/account/..., which is what the emulator's SharedKey check expects.
  const canonicalResource = `/${account}${path}${query ? `\n${query}` : ''}`;
  // SDK-equivalent composition: the 12 fixed fields joined by newlines, one
  // trailing newline, then canonicalized headers (each already newline
  // terminated) followed immediately by the canonicalized resource. Do not
  // join canonicalHeaders/canonicalResource as array elements: that inserts an
  // extra blank line and breaks every SharedKey signature.
  const fixedFields = [
    method.toUpperCase(),
    '', // Content-Encoding
    '', // Content-Language
    contentLength > 0 ? String(contentLength) : '',
    '', // Content-MD5
    contentType,
    '', // Date
    '', // If-Modified-Since
    '', // If-Match
    '', // If-None-Match
    '', // If-Unmodified-Since
    '', // Range
  ].join('\n');
  const stringToSign = `${fixedFields}\n${canonicalHeaders}${canonicalResource}`;

  const signature = createHmac('sha256', Buffer.from(keyBase64, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
  return { ...requestHeaders, Authorization: `SharedKey ${account}:${signature}` };
}
