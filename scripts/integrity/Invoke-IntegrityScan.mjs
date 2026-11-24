#!/usr/bin/env node
/**
 * Read-only Hub integrity scan (G1 E8 skeleton).
 *
 * What it does:
 *  - Reads Hub ledger metadata from a configured, isolated Postgres (read-only
 *    transaction, SELECT only) or from a JSON snapshot.
 *  - Reads an object-store inventory from an Azure-compatible Blob endpoint
 *    (LIST/GET only), a local directory (read-only), or a JSON inventory.
 *  - Emits a JSON + Markdown report with changeset heads/chain roots, missing
 *    rows/blobs, size/hash mismatches, missing baselines/checkpoints, orphan
 *    blobs, and dangling references.
 *
 * What it never does:
 *  - No writes to Postgres or the object store, no migrations, no deletes, no
 *    repairs, no container restarts, no live-stack discovery.
 *
 * Exit codes:
 *   0 clean; 1 integrity findings; 2 usage/config error;
 *   3 scan incomplete (no errors found, but required checks were unverified).
 *
 * Usage: see docs/operations/INTEGRITY-SCAN.md.
 */

import { createHash, createHmac } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  EXIT_CODES,
  IntegrityInputError,
  collectReferencedBlobPaths,
  normalizeInventory,
  normalizeSnapshot,
  renderMarkdown,
  scanIntegrity,
} from './scan-core.mjs';

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

const DB_MODES = new Set(['snapshot', 'docker', 'psql']);
const BLOB_MODES = new Set(['snapshot', 'dir', 'azure']);
const HASH_MODES = new Set(['none', 'referenced', 'all']);
const FORMATS = new Set(['md', 'json']);
const MAX_PAGES = 10000;
const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const CHANGESET_FIELDS = {
  id: ['id', 'changesetId'],
  iModelId: ['iModelId'],
  index: ['index', 'changesetIndex'],
  parentId: ['parentId'],
  prevHash: ['prevHash'],
  chainHash: ['chainHash'],
  checksum: ['checksum', 'contentSha256'],
  fileSize: ['fileSize'],
  blobPath: ['filePath', 'blobPath', 'objectKey'],
  state: ['state'],
  deletedAt: ['deletedAt'],
  briefcaseId: ['briefcaseId'],
  createdAt: ['createdAt'],
};

const CHECKPOINT_FIELDS = {
  id: ['id', 'checkpointId'],
  iModelId: ['iModelId'],
  changesetId: ['changesetId'],
  changesetIndex: ['changesetIndex'],
  state: ['state'],
  fileSize: ['fileSize'],
  contentSha256: ['contentSha256'],
  dbName: ['dbName'],
  manifestPath: ['manifestPath'],
  deletedAt: ['deletedAt'],
};

const NAMED_VERSION_FIELDS = {
  id: ['id', 'namedVersionId'],
  name: ['name'],
  iModelId: ['iModelId'],
  changesetId: ['changesetId'],
  changesetIndex: ['changesetIndex'],
  state: ['state'],
  deletedAt: ['deletedAt'],
};

function normalizeKey(value) {
  return String(value).replace(/[_\s-]/g, '').toLowerCase();
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function assertSelectStatement(sql) {
  const stripped = String(sql)
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  if (!/^SELECT\b/i.test(stripped)) {
    throw new UsageError('refusing to run a non-SELECT statement in the integrity scan');
  }
  if (/;\s*\S/.test(stripped)) {
    throw new UsageError('refusing to run multi-statement SQL in the integrity scan');
  }
  if (/\bINTO\b/i.test(stripped) || /\bFOR\s+(UPDATE|SHARE)\b/i.test(stripped)) {
    throw new UsageError('refusing to run a potentially writing SELECT in the integrity scan');
  }
  return stripped;
}

export function buildReadOnlySql(selectSql, statementTimeoutMs) {
  const statement = assertSelectStatement(selectSql).replace(/;\s*$/, '');
  const timeout = Number.isInteger(statementTimeoutMs) && statementTimeoutMs > 0 ? statementTimeoutMs : 30000;
  return [
    'BEGIN TRANSACTION READ ONLY;',
    `SET LOCAL statement_timeout = ${timeout};`,
    // The SELECT must be terminated; otherwise PostgreSQL parses the following
    // COMMIT as part of the SELECT and fails with "syntax error at or near
    // COMMIT" (observed live against the drill Postgres on 2026-11-24).
    `${statement};`,
    'COMMIT;',
    '',
  ].join('\n');
}

function parseIntegerOption(value, name, { min = 0, allowZero = false } = {}) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || (allowZero ? number < min : number <= min)) {
    throw new UsageError(`${name} must be an integer ${allowZero ? `>= ${min}` : `> ${min}`}`);
  }
  return number;
}

function parseCommonOptions(argv) {
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        'db-mode': { type: 'string' },
        'db-snapshot': { type: 'string' },
        'docker-container': { type: 'string' },
        'psql-exe': { type: 'string', default: 'psql' },
        'db-host': { type: 'string' },
        'db-port': { type: 'string' },
        'db-user': { type: 'string' },
        'db-name': { type: 'string' },
        'db-schema': { type: 'string', default: 'public' },
        'statement-timeout-ms': { type: 'string' },
        'imodel-id': { type: 'string', multiple: true },

        'blob-mode': { type: 'string' },
        'blob-inventory': { type: 'string' },
        'blob-dir': { type: 'string' },
        'blob-endpoint': { type: 'string' },
        'blob-container': { type: 'string' },
        'blob-account': { type: 'string' },
        'blob-prefix': { type: 'string' },
        'blob-key-env': { type: 'string', default: 'AZURITE_ACCOUNT_KEY' },
        'blob-hash': { type: 'string', default: 'referenced' },
        'max-hash-bytes': { type: 'string', default: '0' },
        'orphan-prefix': { type: 'string', multiple: true },

        'baseline-path-template': { type: 'string' },
        'timeout-ms': { type: 'string', default: '120000' },
        label: { type: 'string' },
        'json-out': { type: 'string' },
        'md-out': { type: 'string' },
        format: { type: 'string', default: 'md' },
        'fail-on-warnings': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
    return parsed.values;
  } catch (error) {
    throw new UsageError(error.message);
  }
}

function validateAndNormalize(raw) {
  if (raw.help) {
    return { help: true };
  }

  const dbSnapshot = raw['db-snapshot'] ? resolve(raw['db-snapshot']) : null;
  const blobInventory = raw['blob-inventory'] ? resolve(raw['blob-inventory']) : null;

  let dbMode = raw['db-mode'] ?? (dbSnapshot ? 'snapshot' : null);
  if (!dbMode) {
    throw new UsageError('configure a metadata source: --db-snapshot or --db-mode docker|psql');
  }
  if (!DB_MODES.has(dbMode)) throw new UsageError(`invalid --db-mode: ${dbMode}`);
  if (dbMode === 'snapshot' && !dbSnapshot) {
    throw new UsageError('--db-mode snapshot requires --db-snapshot <file>');
  }
  if (dbSnapshot && raw['db-mode'] && dbMode !== 'snapshot') {
    throw new UsageError('--db-snapshot cannot be combined with --db-mode docker|psql');
  }

  let blobMode = raw['blob-mode'] ?? (blobInventory ? 'snapshot' : null);
  if (!blobMode) {
    throw new UsageError('configure a blob source: --blob-inventory, --blob-dir, or --blob-mode azure');
  }
  if (!BLOB_MODES.has(blobMode)) throw new UsageError(`invalid --blob-mode: ${blobMode}`);
  if (blobMode === 'snapshot' && !blobInventory) {
    throw new UsageError('--blob-mode snapshot requires --blob-inventory <file>');
  }
  if (blobInventory && raw['blob-mode'] && blobMode !== 'snapshot') {
    throw new UsageError('--blob-inventory cannot be combined with --blob-mode dir|azure');
  }

  const db = {
    mode: dbMode,
    snapshotFile: dbSnapshot,
    dockerContainer: raw['docker-container'] ?? null,
    psqlExe: raw['psql-exe'],
    host: raw['db-host'] ?? null,
    port: raw['db-port'] ?? null,
    user: raw['db-user'] ?? null,
    name: raw['db-name'] ?? null,
    schema: raw['db-schema'] || 'public',
    statementTimeoutMs: parseIntegerOption(raw['statement-timeout-ms'], '--statement-timeout-ms', { min: 1000 }) ?? 30000,
    iModelIds: raw['imodel-id'] ?? [],
    baselinePathTemplate: raw['baseline-path-template'] ?? null,
  };

  if (db.mode === 'docker') {
    if (!db.dockerContainer) throw new UsageError('--db-mode docker requires --docker-container <container>');
    if (!db.user) throw new UsageError('--db-mode docker requires --db-user <role>');
    if (!db.name) throw new UsageError('--db-mode docker requires --db-name <database>');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(db.dockerContainer)) {
      throw new UsageError('--docker-container contains unsupported characters');
    }
  }
  if (db.mode === 'psql') {
    if (!db.name && !process.env.PGDATABASE) {
      throw new UsageError('--db-mode psql requires --db-name <database> (or PGDATABASE)');
    }
  }
  if (db.schema && !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(db.schema)) {
    throw new UsageError('--db-schema must be a simple SQL identifier');
  }
  for (const id of db.iModelIds) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
      throw new UsageError(`--imodel-id is not a supported identifier: ${id}`);
    }
  }

  const hashMode = raw['blob-hash'];
  if (!HASH_MODES.has(hashMode)) throw new UsageError('--blob-hash must be none, referenced, or all');
  const blob = {
    mode: blobMode,
    inventoryFile: blobInventory,
    dir: raw['blob-dir'] ? resolve(raw['blob-dir']) : null,
    endpoint: raw['blob-endpoint'] ?? null,
    container: raw['blob-container'] ?? null,
    account: raw['blob-account'] ?? null,
    prefix: raw['blob-prefix'] ?? '',
    keyEnv: raw['blob-key-env'],
    hashMode,
    maxHashBytes: parseIntegerOption(raw['max-hash-bytes'], '--max-hash-bytes', { min: 0, allowZero: true }) ?? 0,
    orphanPrefixes: raw['orphan-prefix'] ?? [],
  };
  if (blob.mode === 'dir') {
    if (!blob.dir) throw new UsageError('--blob-mode dir requires --blob-dir <directory>');
  }
  if (blob.mode === 'azure') {
    if (!blob.endpoint) throw new UsageError('--blob-mode azure requires --blob-endpoint <url>');
    if (!blob.container) throw new UsageError('--blob-mode azure requires --blob-container <name>');
    if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,61}$/.test(blob.container)) {
      throw new UsageError('--blob-container is not a valid Azure blob container name');
    }
    let endpointUrl;
    try {
      endpointUrl = new URL(blob.endpoint);
    } catch {
      throw new UsageError('--blob-endpoint is not a valid URL');
    }
    if (!['http:', 'https:'].includes(endpointUrl.protocol)) {
      throw new UsageError('--blob-endpoint must be http(s)');
    }
    if (!process.env[blob.keyEnv]) {
      throw new UsageError(`--blob-mode azure requires account key in environment variable ${blob.keyEnv} (never pass keys on the command line)`);
    }
  }

  const format = raw.format;
  if (!FORMATS.has(format)) throw new UsageError('--format must be md or json');
  const jsonOut = raw['json-out'] ? resolve(raw['json-out']) : null;
  const mdOut = raw['md-out'] ? resolve(raw['md-out']) : null;
  for (const [name, value] of [
    ['--json-out', jsonOut],
    ['--md-out', mdOut],
  ]) {
    if (!value) continue;
    if (value === REPO_ROOT) throw new UsageError(`${name} cannot be the repository root`);
    const gitDir = resolve(REPO_ROOT, '.git');
    if (value.toLowerCase().startsWith(`${gitDir.toLowerCase()}${sep}`)) {
      throw new UsageError(`${name} cannot be inside .git`);
    }
  }

  return {
    help: false,
    db,
    blob,
    orphanPrefixes: blob.orphanPrefixes,
    timeoutMs: parseIntegerOption(raw['timeout-ms'], '--timeout-ms', { min: 1000 }) ?? 120000,
    label: raw.label ?? null,
    jsonOut,
    mdOut,
    format,
    failOnWarnings: raw['fail-on-warnings'] === true,
  };
}

function printHelp() {
  return `Read-only Hub integrity scan.

Metadata source (exactly one):
  --db-snapshot <file>               JSON snapshot (offline)
  --db-mode docker --docker-container <c> --db-user <u> --db-name <db>
  --db-mode psql [--db-host h] [--db-port p] --db-user <u> --db-name <db>
  Common: --db-schema public --statement-timeout-ms 30000 [--imodel-id <id> ...]
          [--baseline-path-template 'imodels/{iModelId}/baseline/{baselineFileName}']

Blob source (exactly one):
  --blob-inventory <file>            JSON inventory (offline)
  --blob-mode dir --blob-dir <dir>
  --blob-mode azure --blob-endpoint <url> --blob-container <name>
      [--blob-account <name>] [--blob-prefix <prefix>] [--blob-key-env AZURITE_ACCOUNT_KEY]
  Common: --blob-hash none|referenced|all (default referenced)
          --max-hash-bytes <n> (0 = no limit)
          --orphan-prefix <prefix> (repeatable; required for a complete scan)
          --timeout-ms <n> (DB process / Azure request timeout; default 120000)

Output:
  --format md|json (stdout; default md)  --json-out <file>  --md-out <file>
  --label <text>  --fail-on-warnings

Exit codes: 0 clean, 1 findings, 2 usage/config, 3 incomplete.
Passwords are read only from PGPASSWORD (for Postgres) and the key env var
(for Azure); they are never accepted as command-line arguments.
`;
}

// ---------------------------------------------------------------------------
// Read-only Postgres adapter
// ---------------------------------------------------------------------------

function psqlCommand(config) {
  if (config.mode === 'docker') {
    const args = ['exec', '-i'];
    if (process.env.PGPASSWORD !== undefined) args.push('-e', 'PGPASSWORD');
    args.push(config.dockerContainer, config.psqlExe);
    return { command: 'docker', args };
  }
  return { command: config.psqlExe, args: [] };
}

function runReadOnlyQuery(config, selectSql, spawnSyncImpl) {
  const { command, args } = psqlCommand(config);
  const psqlArgs = [
    '-X',
    '-q',
    '-A',
    '-t',
    '-F',
    '\t',
    '-w',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  if (config.mode === 'psql') {
    if (config.host) psqlArgs.push('-h', config.host);
    if (config.port) psqlArgs.push('-p', String(config.port));
    if (config.user) psqlArgs.push('-U', config.user);
    if (config.name) psqlArgs.push('-d', config.name);
  } else {
    if (config.host) psqlArgs.push('-h', config.host);
    if (config.port) psqlArgs.push('-p', String(config.port));
    if (config.user) psqlArgs.push('-U', config.user);
    if (config.name) psqlArgs.push('-d', config.name);
  }
  psqlArgs.push('-f', '-');

  const sql = buildReadOnlySql(selectSql, config.statementTimeoutMs);
  const result = spawnSyncImpl(command, [...args, ...psqlArgs], {
    input: sql,
    encoding: 'utf8',
    timeout: config.timeoutMs,
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT ?? '10' },
  });

  if (result.error) {
    const code = result.error.code ? ` (${result.error.code})` : '';
    throw new SourceError(`read-only Postgres query could not run${code}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = sanitizePsqlError(result.stderr || result.stdout || '');
    throw new SourceError(`read-only Postgres query failed (exit ${result.status}): ${detail}`);
  }
  return result.stdout;
}

function sanitizePsqlError(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-12)
    .join(' | ')
    .slice(0, 2000);
}

function discoverTables(config, spawnSyncImpl) {
  const sql = `SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('changesets', 'checkpoints', 'named_versions', 'namedversions', 'imodels')
ORDER BY table_schema, table_name, ordinal_position`;
  const output = runReadOnlyQuery(config, sql, spawnSyncImpl);
  const rows = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [schema, table, column] = line.split('\t');
    if (!schema || !table || !column) continue;
    rows.push({ schema, table, column });
  }
  if (rows.length === 0) {
    throw new SourceError('no Hub ledger tables found; check --db-schema and the target database');
  }
  return rows;
}

function resolveTable(rows, candidates, schema) {
  const matches = [];
  for (const row of rows) {
    if (candidates.includes(row.table.toLowerCase())) {
      matches.push(row);
    }
  }
  if (matches.length === 0) return null;
  const inSchema = matches.filter((row) => row.schema === schema);
  const pool = inSchema.length > 0 ? inSchema : matches;
  const schemas = [...new Set(pool.map((row) => row.schema))];
  if (schemas.length > 1) {
    throw new SourceError(
      `table ${candidates.join('/')} exists in multiple schemas (${schemas.join(', ')}); pass --db-schema explicitly`,
    );
  }
  const tableName = pool[0].table;
  return {
    schema: pool[0].schema,
    table: tableName,
    columns: pool.map((row) => row.column),
  };
}

function columnLookup(columns) {
  const map = new Map();
  for (const column of columns) map.set(normalizeKey(column), column);
  return (candidates) => {
    for (const candidate of candidates) {
      const actual = map.get(normalizeKey(candidate));
      if (actual) return actual;
    }
    return null;
  };
}

function buildSelectList(fieldDefs, lookup) {
  const expressions = [];
  for (const [canonical, candidates] of Object.entries(fieldDefs)) {
    const actual = lookup(candidates);
    if (actual) expressions.push(`${quoteIdent(actual)} AS ${quoteIdent(canonical)}`);
  }
  return expressions;
}

function imodelSelectList(columns) {
  const expressions = [];
  for (const column of columns) {
    const key = normalizeKey(column);
    if (/password|secret|token|api.?key/i.test(column)) continue;
    const allowed =
      /^(id|name|state|status|changesetcount|changesetscount|filesize|createdat|updatedat|deletedat)$/.test(key) ||
      /baseline/.test(key);
    if (allowed) expressions.push(`${quoteIdent(column)} AS ${quoteIdent(column)}`);
  }
  return expressions;
}

function iModelFilterSql(table, columns, lookup, imodelIds, candidates = CHANGESET_FIELDS.iModelId) {
  if (imodelIds.length === 0) return '';
  const actual =
    lookup(candidates) ??
    columns.find((column) => candidates.some((candidate) => normalizeKey(column) === normalizeKey(candidate)));
  if (!actual) return '';
  const literals = imodelIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  return ` WHERE ${quoteIdent(actual)}::text = ANY (ARRAY[${literals}]::text[])`;
}

function queryJsonRows(config, { schema, table, selectExpressions, whereSql = '' }, spawnSyncImpl) {
  if (selectExpressions.length === 0) {
    throw new SourceError(`no usable columns found for ${schema}.${table}`);
  }
  const sql = `SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text
FROM (
  SELECT ${selectExpressions.join(', ')}
  FROM ${quoteIdent(schema)}.${quoteIdent(table)}${whereSql}
) t`;
  const output = runReadOnlyQuery(config, sql, spawnSyncImpl);
  // psql may print command tags (BEGIN/SET/COMMIT) even in tuples-only mode.
  // The JSON aggregate is one line, so parse the last JSON-looking line.
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('[') || line.startsWith('{'));
  for (const line of lines.reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  throw new SourceError(`could not parse ${schema}.${table} query output as JSON`);
}

function applyBaselineTemplate(template, { iModelId, fileName }) {
  if (!template) return null;
  return template
    .replace(/\{iModelId\}/g, iModelId)
    .replace(/\{baselineFileName\}/g, fileName ?? '')
    .replace(/\{baselineFile\}/g, fileName ?? '');
}

function valueByKey(row, candidates) {
  for (const candidate of candidates) {
    const key = Object.keys(row).find((candidateKey) => normalizeKey(candidateKey) === normalizeKey(candidate));
    if (key !== undefined && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function mapIModels(rows) {
  const unmapped = [];
  let baselineMapped = 0;
  const imodels = rows.map((row) => {
    const keys = Object.keys(row);
    const valueFor = (key) => row[key];
    const id = valueByKey(row, ['id', 'iModelId']);
    const changesetCountKey = keys.find((key) =>
      /^(changesetcount|changesetscount|changeset_count)$/i.test(key),
    );
    const baselinePathKey = keys.find(
      (key) => /baseline/i.test(key) && /(path|key|blob|uri|url)/i.test(key),
    );
    const baselineNameKey = keys.find(
      (key) =>
        /baseline/i.test(key) &&
        /(name|file)/i.test(key) &&
        !/(size|path)/i.test(key) &&
        !/id$/i.test(key),
    );
    const baselineSizeKey =
      keys.find((key) => /baseline/i.test(key) && /(size|byte)/i.test(key)) ??
      keys.find((key) => /^filesize$/i.test(key));
    const baselineShaKey = keys.find(
      (key) => /baseline/i.test(key) && /(sha|checksum|hash)/i.test(key),
    );
    const baselineFileIdKey = keys.find((key) => /baseline/i.test(key) && /id$/i.test(key));

    if (id === undefined || id === null || id === '') {
      unmapped.push({ area: 'imodels', detail: 'imodels row has no id; skipped' });
      return null;
    }

    const baseline = {};
    if (baselinePathKey && valueFor(baselinePathKey)) {
      baseline.blobPath = String(valueFor(baselinePathKey));
    }
    const fileName = baselineNameKey ? valueFor(baselineNameKey) : null;
    if (!baseline.blobPath && fileName && String(fileName).includes('/')) {
      baseline.blobPath = String(fileName);
    }
    if (baselineSizeKey && valueFor(baselineSizeKey) !== null && valueFor(baselineSizeKey) !== undefined) {
      const size = Number(valueFor(baselineSizeKey));
      if (Number.isInteger(size) && size >= 0) baseline.fileSize = size;
    }
    if (baselineShaKey && valueFor(baselineShaKey)) {
      baseline.sha256 = String(valueFor(baselineShaKey));
    }
    if (Object.keys(baseline).length > 0) {
      baselineMapped += 1;
    } else if (baselineFileIdKey) {
      unmapped.push({
        area: 'baseline',
        detail:
          'imodels has a baseline file identifier but no storage path/name mapped; supply --baseline-path-template or extend the adapter',
      });
    }
    return {
      id: String(id),
      name: valueByKey(row, ['name']) ?? null,
      state: valueByKey(row, ['state', 'status']) ?? null,
      changesetCount:
        changesetCountKey && valueFor(changesetCountKey) !== null
          ? Number(valueFor(changesetCountKey))
          : null,
      deletedAt: valueByKey(row, ['deletedAt']) ?? null,
      baseline: baseline.blobPath || baseline.fileSize !== undefined || baseline.sha256
        ? baseline
        : null,
      baselineFileName: fileName ? String(fileName) : null,
    };
  }).filter(Boolean);

  return { imodels, baselineMapped, unmapped };
}

export function collectSnapshotFromPostgres(config, spawnSyncImpl) {
  if (typeof spawnSyncImpl !== 'function') {
    throw new UsageError('internal error: spawnSync implementation is required');
  }
  const discovery = discoverTables(config, spawnSyncImpl);
  const changesetTable = resolveTable(discovery, ['changesets'], config.schema);
  if (!changesetTable) {
    throw new SourceError('required table "changesets" was not found in the configured schema');
  }
  const checkpointTable = resolveTable(discovery, ['checkpoints'], config.schema);
  const namedVersionTable = resolveTable(discovery, ['named_versions', 'namedversions'], config.schema);
  const imodelTable = resolveTable(discovery, ['imodels'], config.schema);

  const unmapped = [];
  const changesetLookup = columnLookup(changesetTable.columns);
  const changesetSelect = buildSelectList(CHANGESET_FIELDS, changesetLookup);
  if (!changesetLookup(['filePath', 'blobPath', 'objectKey'])) {
    unmapped.push({
      area: 'changesets',
      detail: 'changesets has no filePath/blobPath column; changeset blob references cannot be mapped',
    });
  }
  const changesetRows = queryJsonRows(
    config,
    {
      ...changesetTable,
      selectExpressions: changesetSelect,
      whereSql: iModelFilterSql(changesetTable, changesetTable.columns, changesetLookup, config.iModelIds),
    },
    spawnSyncImpl,
  );

  let checkpointRows;
  if (checkpointTable) {
    const lookup = columnLookup(checkpointTable.columns);
    checkpointRows = queryJsonRows(
      config,
      {
        ...checkpointTable,
        selectExpressions: buildSelectList(CHECKPOINT_FIELDS, lookup),
        whereSql: iModelFilterSql(checkpointTable, checkpointTable.columns, lookup, config.iModelIds),
      },
      spawnSyncImpl,
    );
    for (const row of checkpointRows) {
      if (row.dbName && !String(row.dbName).includes('/')) row.dbName = null;
      if (row.manifestPath && !String(row.manifestPath).includes('/')) row.manifestPath = null;
    }
  } else {
    unmapped.push({ area: 'checkpoints', detail: 'checkpoints table was not found' });
  }

  let namedVersionRows;
  if (namedVersionTable) {
    const lookup = columnLookup(namedVersionTable.columns);
    namedVersionRows = queryJsonRows(
      config,
      {
        ...namedVersionTable,
        selectExpressions: buildSelectList(NAMED_VERSION_FIELDS, lookup),
        whereSql: iModelFilterSql(namedVersionTable, namedVersionTable.columns, lookup, config.iModelIds),
      },
      spawnSyncImpl,
    );
    if (!lookup(['changesetId', 'changesetIndex'])) {
      unmapped.push({
        area: 'namedVersions',
        detail: 'named_versions has no changesetId/changesetIndex column; Named Version targets cannot be mapped',
      });
    }
  } else {
    unmapped.push({ area: 'namedVersions', detail: 'named_versions table was not found' });
  }

  let imodels;
  let baselines;
  let baselinesKnown = true;
  if (imodelTable) {
    const expressions = imodelSelectList(imodelTable.columns);
    const rows = queryJsonRows(
      config,
      {
        ...imodelTable,
        selectExpressions: expressions,
        whereSql: iModelFilterSql(
          imodelTable,
          imodelTable.columns,
          columnLookup(imodelTable.columns),
          config.iModelIds,
          ['id', 'iModelId'],
        ),
      },
      spawnSyncImpl,
    );
    const mapped = mapIModels(rows);
    imodels = mapped.imodels.map(({ baselineFileName, ...iModel }) => {
      if (!iModel.baseline && baselineFileName && config.baselinePathTemplate) {
        const templatePath = applyBaselineTemplate(config.baselinePathTemplate, {
          iModelId: iModel.id,
          fileName: baselineFileName,
        });
        if (templatePath) {
          iModel.baseline = { blobPath: templatePath };
          mapped.baselineMapped += 1;
          return iModel;
        }
      }
      return iModel;
    });
    unmapped.push(...mapped.unmapped);
    const withBaseline = imodels.filter((iModel) => iModel.baseline?.blobPath);
    baselines = withBaseline.length > 0
      ? withBaseline.map((iModel) => ({ iModelId: iModel.id, ...iModel.baseline }))
      : [];
    if (withBaseline.length !== imodels.length && imodels.length > 0) {
      baselinesKnown = false;
      unmapped.push({
        area: 'baseline',
        detail: 'baseline mapping is partial; missing baselines are reported as unverified, not missing',
      });
    }
  } else {
    unmapped.push({ area: 'imodels', detail: 'imodels table was not found' });
    baselinesKnown = false;
  }

  return normalizeSnapshot({
    schemaVersion: 1,
    source: {
      kind: 'postgres',
      mode: config.mode,
      database: config.name ?? process.env.PGDATABASE ?? null,
      schema: config.schema,
      container: config.dockerContainer ?? null,
      user: config.user ?? process.env.PGUSER ?? null,
      imodelFilter: config.iModelIds,
      readOnlyTransaction: true,
    },
    changesets: changesetRows,
    baselines,
    baselinesKnown,
    checkpoints: checkpointRows,
    namedVersions: namedVersionRows,
    imodels,
    unmapped,
  });
}

// ---------------------------------------------------------------------------
// Blob inventory adapters
// ---------------------------------------------------------------------------

async function hashFile(path, { maxHashBytes }) {
  if (existsSync(path) && maxHashBytes > 0 && lstatSync(path).size > maxHashBytes) {
    return { skipped: true, reason: `file exceeds --max-hash-bytes (${maxHashBytes})` };
  }
  return new Promise((resolvePromise, reject) => {
    const sha256 = createHash('sha256');
    const sha1 = createHash('sha1');
    let bytes = 0;
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      sha256.update(chunk);
      sha1.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolvePromise({ sha256: sha256.digest('hex'), sha1: sha1.digest('hex'), bytes }));
  });
}

function walkDirectory(root) {
  const files = [];
  const stack = [{ dir: root, prefix: '' }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop();
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push({ dir: fullPath, prefix: name });
      else if (entry.isFile()) files.push({ fullPath, name });
    }
  }
  files.sort((left, right) => left.name.localeCompare(right.name));
  return files;
}

export async function collectBlobInventory(options) {
  if (options.mode === 'snapshot') {
    if (!existsSync(options.inventoryFile)) {
      throw new SourceError(`blob inventory file not found: ${options.inventoryFile}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(stripBom(readFileSync(options.inventoryFile, 'utf8')));
    } catch (error) {
      throw new UsageError(`blob inventory is not valid JSON: ${error.message}`);
    }
    try {
      return normalizeInventory(parsed);
    } catch (error) {
      if (error instanceof IntegrityInputError) {
        throw new UsageError(`invalid blob inventory: ${error.message}`);
      }
      throw error;
    }
  }

  if (options.mode === 'dir') {
    if (!existsSync(options.dir)) throw new SourceError(`blob directory not found: ${options.dir}`);
    const files = walkDirectory(options.dir);
    const refs = options.referencedNames ?? new Set();
    const blobs = [];
    for (const file of files) {
      const stat = lstatSync(file.fullPath);
      if (!stat.isFile()) continue;
      const blob = { name: file.name, size: stat.size };
      const shouldHash =
        options.hashMode === 'all' ||
        (options.hashMode === 'referenced' && refs.has(file.name));
      if (shouldHash) {
        const hashed = await hashFile(file.fullPath, { maxHashBytes: options.maxHashBytes });
        if (!hashed.skipped) {
          blob.sha256 = hashed.sha256;
          blob.sha1 = hashed.sha1;
        }
      }
      blobs.push(blob);
    }
    return normalizeInventory({
      schemaVersion: 1,
      source: { kind: 'directory', root: options.dir },
      complete: true,
      hashMode: options.hashMode,
      managedPrefixes: options.orphanPrefixes,
      blobs,
    });
  }

  if (options.mode === 'azure') {
    return collectAzureBlobInventory(options);
  }

  throw new UsageError(`unsupported blob mode: ${options.mode}`);
}

function inferAccount(endpointUrl, explicit) {
  if (explicit) return explicit;
  if (process.env.AZURITE_ACCOUNT_NAME) return process.env.AZURITE_ACCOUNT_NAME;
  const pathSegments = endpointUrl.pathname.split('/').filter(Boolean);
  if (pathSegments.length > 0) return pathSegments[pathSegments.length - 1];
  return endpointUrl.hostname.split('.')[0];
}

function canonicalizedResource(account, endpointUrl) {
  const path = endpointUrl.pathname.replace(/\/+$/, '');
  // The Azure SDK always prepends the account name to the URL path. For
  // path-style Azurite endpoints (http://host:port/account/...) this yields
  // /account/account/..., which is what Azurite's SharedKey check expects.
  // (Verified against azure-storage-blob 12.34.0 against a live Azurite.)
  return `/${account}${path}`;
}

export function signAzureRequest({ method, url, account, keyBase64, headers }) {
  const requestHeaders = { ...headers };
  requestHeaders['x-ms-date'] = new Date().toUTCString();
  requestHeaders['x-ms-version'] = requestHeaders['x-ms-version'] ?? '2021-12-02';

  const canonicalHeaders = Object.keys(requestHeaders)
    .filter((name) => name.toLowerCase().startsWith('x-ms-'))
    .map((name) => [name.toLowerCase(), String(requestHeaders[name]).trim()])
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');

  const query = [...url.searchParams.entries()]
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, value]) => `${name}:${value}`)
    .join('\n');

  const canonicalResource = `${canonicalizedResource(account, url)}${query ? `\n${query}` : ''}`;
  // SDK-equivalent composition: fixed fields + one newline + canonicalized
  // headers (newline terminated) + canonicalized resource. Joining the header
  // and resource blocks as extra array elements inserts a blank line and
  // breaks SharedKey signatures (verified against azure-storage-blob 12.34.0).
  const fixedFields = [
    method.toUpperCase(),
    '', // Content-Encoding
    '', // Content-Language
    '', // Content-Length
    '', // Content-MD5
    '', // Content-Type
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

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/g, '&');
}

function xmlTag(block, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return match ? decodeXml(match[1]) : null;
}

export function parseBlobListXml(xml) {
  const blobs = [];
  const blobRe = /<Blob(?:\s[^>]*)?>([\s\S]*?)<\/Blob>/g;
  let match;
  while ((match = blobRe.exec(xml)) !== null) {
    const block = match[1];
    const name = xmlTag(block, 'Name');
    let propertiesBlock = block;
    const propertiesMatch = /<Properties(?:\s[^>]*)?>([\s\S]*?)<\/Properties>/i.exec(block);
    if (propertiesMatch) propertiesBlock = propertiesMatch[1];
    const sizeText = xmlTag(propertiesBlock, 'Content-Length');
    const size = sizeText === null ? null : Number(sizeText);
    blobs.push({
      name,
      size,
      md5: xmlTag(propertiesBlock, 'Content-MD5'),
      lastModified: xmlTag(propertiesBlock, 'Last-Modified'),
    });
  }
  const nextMarker = xmlTag(xml, 'NextMarker');
  return { blobs, nextMarker: nextMarker && nextMarker.trim() !== '' ? nextMarker : null };
}

function blobUrl(endpointUrl, container, blobName) {
  const basePath = endpointUrl.pathname.replace(/\/+$/, '');
  const encodedName = blobName.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return new URL(`${endpointUrl.origin}${basePath}/${container}/${encodedName}`);
}

function azureRequest({ endpointUrl, account, keyBase64, url, timeoutMs, headers = {} }) {
  return new Promise((resolvePromise, reject) => {
    const signedHeaders = signAzureRequest({
      method: 'GET',
      url,
      account,
      keyBase64,
      headers,
    });
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(
      url,
      {
        method: 'GET',
        headers: signedHeaders,
      },
      (res) => {
        if (res.statusCode !== 200) {
          const chunks = [];
          let size = 0;
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size <= 8192) chunks.push(chunk);
          });
          res.on('end', () => {
            reject(
              new SourceError(
                `Azure blob GET ${url.pathname} returned HTTP ${res.statusCode}: ${Buffer.concat(chunks)
                  .toString('utf8')
                  .replace(/\s+/g, ' ')
                  .slice(0, 500)}`,
              ),
            );
          });
          return;
        }
        resolvePromise(res);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Azure blob request timed out after ${timeoutMs} ms`));
    });
    req.on('error', (error) => reject(new SourceError(`Azure blob request failed: ${error.message}`)));
    req.end();
  });
}

async function readResponseText(res) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('error', reject);
    res.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
  });
}

async function collectAzureBlobInventory(options) {
  const endpointUrl = new URL(options.endpoint);
  const account = inferAccount(endpointUrl, options.account);
  const keyBase64 = process.env[options.keyEnv];
  if (!keyBase64) throw new UsageError(`missing account key in ${options.keyEnv}`);

  const basePath = endpointUrl.pathname.replace(/\/+$/, '');
  const listUrl = new URL(`${endpointUrl.origin}${basePath}/${options.container}`);
  listUrl.searchParams.set('restype', 'container');
  listUrl.searchParams.set('comp', 'list');
  if (options.prefix) listUrl.searchParams.set('prefix', options.prefix);

  const listed = [];
  let marker = null;
  let pages = 0;
  do {
    const pageUrl = new URL(listUrl);
    if (marker) pageUrl.searchParams.set('marker', marker);
    const res = await azureRequest({
      endpointUrl,
      account,
      keyBase64,
      url: pageUrl,
      timeoutMs: options.timeoutMs,
    });
    const xml = await readResponseText(res);
    const page = parseBlobListXml(xml);
    listed.push(...page.blobs);
    marker = page.nextMarker;
    pages += 1;
    if (pages > MAX_PAGES) {
      throw new SourceError(`blob listing exceeded ${MAX_PAGES} pages; narrow --blob-prefix`);
    }
  } while (marker);

  const refs = options.referencedNames ?? new Set();
  const blobs = [];
  const hashQueue = [];
  for (const item of listed) {
    if (!item.name || item.size === null || !Number.isInteger(item.size)) {
      throw new SourceError('Azure blob listing returned a blob without name/size');
    }
    const blob = { name: item.name, size: item.size, md5: item.md5, lastModified: item.lastModified };
    const shouldHash =
      options.hashMode === 'all' ||
      (options.hashMode === 'referenced' && refs.has(item.name));
    if (shouldHash && !(options.maxHashBytes > 0 && item.size > options.maxHashBytes)) {
      hashQueue.push(blob);
    }
    blobs.push(blob);
  }

  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < hashQueue.length) {
      const blob = hashQueue[cursor++];
      const url = blobUrl(endpointUrl, options.container, blob.name);
      const res = await azureRequest({
        endpointUrl,
        account,
        keyBase64,
        url,
        timeoutMs: options.timeoutMs,
      });
      const sha256 = createHash('sha256');
      const sha1 = createHash('sha1');
      await new Promise((resolvePromise, reject) => {
        res.on('data', (chunk) => {
          sha256.update(chunk);
          sha1.update(chunk);
        });
        res.on('error', reject);
        res.on('end', resolvePromise);
      });
      blob.sha256 = sha256.digest('hex');
      blob.sha1 = sha1.digest('hex');
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, hashQueue.length) }, worker));

  return normalizeInventory({
    schemaVersion: 1,
    source: {
      kind: 'azure-blob',
      endpoint: options.endpoint,
      container: options.container,
      account,
      prefix: options.prefix,
      pages,
    },
    complete: true,
    hashMode: options.hashMode,
    managedPrefixes: options.orphanPrefixes,
    blobs,
  });
}

// ---------------------------------------------------------------------------
// CLI orchestration
// ---------------------------------------------------------------------------

function filterSnapshot(snapshot, iModelIds) {
  if (!iModelIds || iModelIds.length === 0) return snapshot;
  const set = new Set(iModelIds);
  return {
    ...snapshot,
    changesets: snapshot.changesets.filter((row) => set.has(row.iModelId)),
    baselines: snapshot.baselines === undefined
      ? undefined
      : snapshot.baselines.filter((row) => set.has(row.iModelId)),
    checkpoints: snapshot.checkpoints === undefined
      ? undefined
      : snapshot.checkpoints.filter((row) => set.has(row.iModelId)),
    namedVersions: snapshot.namedVersions === undefined
      ? undefined
      : snapshot.namedVersions.filter((row) => set.has(row.iModelId)),
    imodels: snapshot.imodels === undefined
      ? undefined
      : snapshot.imodels.filter((row) => set.has(row.id)),
  };
}

function assertRequestedIModels(snapshot, requested) {
  if (!requested || requested.length === 0) return;
  const known = new Set();
  for (const iModel of snapshot.imodels ?? []) known.add(iModel.id);
  for (const changeset of snapshot.changesets) known.add(changeset.iModelId);
  for (const baseline of snapshot.baselines ?? []) known.add(baseline.iModelId);
  for (const checkpoint of snapshot.checkpoints ?? []) known.add(checkpoint.iModelId);
  for (const version of snapshot.namedVersions ?? []) known.add(version.iModelId);
  const missing = requested.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new SourceError(
      `requested iModel id(s) were not found in the scanned metadata: ${missing.join(', ')}`,
    );
  }
}

function loadSnapshot(options, spawnSyncImpl) {
  if (options.db.mode === 'snapshot') {
    if (!existsSync(options.db.snapshotFile)) {
      throw new SourceError(`DB snapshot file not found: ${options.db.snapshotFile}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(stripBom(readFileSync(options.db.snapshotFile, 'utf8')));
    } catch (error) {
      throw new SourceError(`DB snapshot is not valid JSON: ${error.message}`);
    }
    let snapshot;
    try {
      snapshot = filterSnapshot(normalizeSnapshot(parsed), options.db.iModelIds);
    } catch (error) {
      if (error instanceof IntegrityInputError) {
        throw new UsageError(`invalid DB snapshot: ${error.message}`);
      }
      throw error;
    }
    assertRequestedIModels(snapshot, options.db.iModelIds);
    return snapshot;
  }

  const liveConfig = {
    ...options.db,
    timeoutMs: options.timeoutMs,
  };
  const snapshot = collectSnapshotFromPostgres(liveConfig, spawnSyncImpl);
  assertRequestedIModels(snapshot, options.db.iModelIds);
  return snapshot;
}

async function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, text, 'utf8');
    renameSync(temporary, path);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  }
}

export async function runIntegrityScan(argv = process.argv.slice(2), dependencies = {}) {
  const spawnSyncImpl = dependencies.spawnSync;
  const raw = parseCommonOptions(argv);
  const options = validateAndNormalize(raw);
  if (options.help) return { help: printHelp(), exitCode: 0 };

  const snapshot = loadSnapshot(options, spawnSyncImpl);
  const referencedNames = collectReferencedBlobPaths(snapshot);
  const inventory = await collectBlobInventory({
    ...options.blob,
    referencedNames,
    orphanPrefixes: options.orphanPrefixes,
    timeoutMs: options.timeoutMs,
  });

  const report = scanIntegrity(snapshot, inventory, {
    generatedAt: new Date().toISOString(),
    mode: `${options.db.mode}+${options.blob.mode}`,
    orphanPrefixes: options.orphanPrefixes,
    failOnWarnings: options.failOnWarnings,
    source: {
      metadata: snapshot.source,
      blobs: inventory.source,
    },
    target: {
      label: options.label,
      database: options.db.mode === 'snapshot'
        ? options.db.snapshotFile
        : `${options.db.name ?? process.env.PGDATABASE ?? '(database)'} @ ${options.db.dockerContainer ?? options.db.host ?? 'local psql'}`,
      objectStore: options.blob.mode === 'snapshot'
        ? options.blob.inventoryFile
        : options.blob.mode === 'dir'
          ? options.blob.dir
          : `${options.blob.endpoint}/${options.blob.container}${options.blob.prefix ? `/${options.blob.prefix}` : ''}`,
    },
  });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderMarkdown(report);
  let wroteFile = false;

  if (options.jsonOut) {
    await writeAtomic(options.jsonOut, json);
    wroteFile = true;
  }
  if (options.mdOut) {
    await writeAtomic(options.mdOut, markdown);
    wroteFile = true;
  }

  let stdout = '';
  if (!options.jsonOut && options.format === 'json') stdout += json;
  if (!options.mdOut && options.format === 'md') stdout += markdown;
  if (wroteFile && stdout === '') {
    stdout =
      `integrity scan: ${report.result} (exit ${report.exitCode}); ` +
      `errors=${report.summary.errors} warnings=${report.summary.warnings} unverified=${report.unverified.length}\n`;
  }

  return {
    exitCode: report.exitCode,
    report,
    stdout,
    json,
    markdown,
  };
}

async function main() {
  try {
    const result = await runIntegrityScan(process.argv.slice(2), {
      spawnSync: (await import('node:child_process')).spawnSync,
    });
    if (result.help) {
      process.stdout.write(result.help);
      return;
    }
    if (result.stdout) process.stdout.write(result.stdout);
    process.exitCode = result.exitCode;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`integrity scan usage error: ${error.message}\n`);
      process.exitCode = EXIT_CODES.USAGE;
    } else if (error instanceof SourceError || error instanceof IntegrityInputError) {
      process.stderr.write(`integrity scan source error: ${error.message}\n`);
      process.exitCode = EXIT_CODES.INCOMPLETE;
    } else {
      process.stderr.write(`integrity scan failed: ${error.message}\n`);
      if (process.env.INTEGRITY_SCAN_DEBUG === '1' && error.stack) {
        process.stderr.write(`${error.stack}\n`);
      }
      process.exitCode = EXIT_CODES.INCOMPLETE;
    }
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entry && import.meta.url === entry) {
  main();
}
