#!/usr/bin/env node
/**
 * Provider-neutral production DR drill definitions and pure validators.
 *
 * This module describes what a real production PostgreSQL PITR drill and a
 * real production object-storage versioning/restore drill must prove. It does
 * not select a provider, provision anything, execute commands, or contact a
 * database, object store, cloud API, or the main stack.
 *
 * Repository artifacts contain placeholders only (`<UPPER_SNAKE>`). Resolved
 * endpoints, account identifiers, credentials, object names, and results stay
 * in the private evidence system; they must never be committed to this repo.
 *
 * RPO/RTO targets are constraints, not achievements. No function in this file
 * turns a definition, a plan, or a template into evidence that a target or a
 * production disaster-recovery capability has been proven.
 */

export const PRODUCTION_DRILL_SCHEMA_VERSION = 1;
export const PRODUCTION_EVIDENCE_KIND = 'tiangong-kaiwu-production-dr-drill-evidence';
export const PRODUCTION_PLAN_KIND = 'tiangong-kaiwu-production-dr-drill-plan';
export const PRODUCTION_CATALOG_KIND = 'tiangong-kaiwu-production-dr-scenario-catalog';

export const RPO_TARGET_SECONDS = 300;
export const RTO_TARGET_SECONDS = 3600;

export const PLACEHOLDER_PATTERN = /^<[A-Z][A-Z0-9_]{1,63}>$/;

export const EVIDENCE_STATUSES = Object.freeze([
  'not-run', 'in-progress', 'passed', 'failed', 'incomplete',
]);

export const PRODUCTION_SCENARIO_IDS = Object.freeze([
  'postgres-pitr',
  'object-storage-versioning',
]);

const COMMON_LIMITATIONS = Object.freeze([
  'Definition/measurement logic only; no provider, environment, credential, or drill result is included.',
  'Structural validation only; it does not authenticate operators, witness real-world actions, or prove that a drill occurred.',
  'A single passing drill does not prove continuous RPO/RTO compliance or production readiness.',
  'PostgreSQL and object storage must be restored as a matched set; one-sided recovery is not disaster recovery.',
  'Dev Azurite volumes and pg_dump snapshots are not production PITR or object versioning.',
]);

const COMMON_ROLLBACK = Object.freeze([
  'Keep the pre-drill backup/base-backup and object-version manifest untouched; the drill must never delete source history.',
  'If verification fails, stop the isolated restore target, keep the evidence, and do not promote or serve it.',
  'If a restore target or endpoint was switched, re-point only after a documented owner decision and a new paired verification.',
  'Never roll back by deleting WAL archives, object versions, or the original backup set.',
]);

const COMMON_CLEANUP = Object.freeze([
  'Collect preflight, command output, timings, checksums, and sign-off into the private evidence vault references recorded by `evidenceRefs`.',
  'Delete only the isolated restore instance/bucket/prefix created for this drill; keep source backups and WAL/object versions.',
  'Remove temporary credentials through the approved secret manager and record revocation in the evidence.',
  'Record residual resources and their owner; do not hide leftover infrastructure inside a "passed" drill.',
]);

export const PRODUCTION_SCENARIOS = Object.freeze([
  {
    id: 'postgres-pitr',
    plane: 'production',
    title: 'PostgreSQL PITR: restore a base backup and replay WAL to a requested target time',
    summary:
      'Restore the production-class PostgreSQL backup chain into an isolated instance, stop recovery at a ' +
      'requested timestamp, and verify schema/ledger/cross-store consistency before measuring RPO and RTO.',
    executableByIsolatedHarness: false,
    requires: [
      'postgres.wal-archiving-enabled',
      'postgres.base-backup-available',
      'postgres.pitr-retention-covers-target',
      'postgres.isolated-restore-instance',
      'object-store.paired-version-manifest',
    ],
    inputs: [
      { name: 'primaryEndpoint', template: '<PG_PRIMARY_ENDPOINT>', description: 'Read-only reference endpoint of the production-class source; never a credential.' },
      { name: 'databaseName', template: '<PG_DATABASE_NAME>', description: 'Database name to recover.' },
      { name: 'backupRepositoryRef', template: '<PG_BACKUP_REPOSITORY_REF>', description: 'Private reference to the base-backup/WAL repository; not a storage credential.' },
      { name: 'requestedTargetUtc', template: '<PITR_TARGET_UTC>', description: 'ISO-8601 recovery target used for this drill; must be inside retention.' },
      { name: 'restoreInstanceRef', template: '<RESTORE_INSTANCE_REF>', description: 'Private reference to the disposable isolated restore instance.' },
      { name: 'expectedSchemaVersion', template: '<EXPECTED_SCHEMA_VERSION>', description: 'Migration/schema version the restored DB must report.' },
      { name: 'lastAckedEditUtc', template: '<LAST_ACKED_EDIT_UTC>', description: 'Timestamp of the newest acknowledged edit used for the loss-window explanation.' },
      { name: 'pairedObjectManifestRef', template: '<PAIRED_OBJECT_MANIFEST_REF>', description: 'Private reference to the object versions aligned with the same recovery target.' },
      { name: 'secretSourceRef', template: '<SECRET_SOURCE_REF>', description: 'Approved secret-manager reference; credentials are never recorded in inputs or evidence.' },
      { name: 'evidenceVaultRef', template: '<EVIDENCE_VAULT_REF>', description: 'Private evidence-vault destination for command output and checksums.' },
    ],
    preflight: [
      { id: 'wal-archiving-enabled', description: 'Continuous WAL archiving/streaming is enabled and observable; pg_dump alone is insufficient.' },
      { id: 'base-backup-available', description: 'A completed base backup exists and its manifest/checksum can be verified.' },
      { id: 'pitr-target-present', description: 'A concrete ISO-8601 recovery target is declared; unresolved placeholders fail closed.' },
      { id: 'pitr-target-within-retention', description: 'The target and the latest base backup are inside the retained WAL/base-backup window and not in the future.' },
      { id: 'base-backup-before-target', description: 'At least one base backup precedes the requested target time.' },
      { id: 'target-isolated', description: 'The restore instance is disposable, isolated, and unrelated to the active main stack.' },
      { id: 'target-not-main-stack', description: 'The target is explicitly not the main stack; unknown values fail closed.' },
      { id: 'writers-frozen', description: 'Writers are frozen or fenced for the drill window; no user edits are accepted into the restore target.' },
      { id: 'secret-source-declared', description: 'Credentials come from an approved secret manager and are excluded from evidence.' },
      { id: 'paired-object-manifest-declared', description: 'An object-version manifest for the same recovery target is declared before DB recovery starts.' },
      { id: 'expected-schema-declared', description: 'The expected migration/schema version is recorded before recovery.' },
      { id: 'capacity-verified', description: 'Restore disk/WAL/temp capacity is verified for the full backup chain.' },
    ],
    steps: [
      { id: 'announce-window', description: 'Announce the drill window and HITL approvers; record UTC start for RTO.', destructive: false },
      { id: 'freeze-writers', description: 'Freeze/fence writers and record the newest acknowledged edit timestamp.', destructive: false },
      { id: 'capture-evidence', description: 'Capture DB/schema identifiers, backup-chain references, and the paired object manifest reference.', destructive: false },
      { id: 'choose-target', description: 'Record the exact recovery target timestamp and its retention justification.', destructive: false },
      { id: 'restore-base-backup', description: 'Restore the base backup into the disposable isolated instance.', destructive: true },
      { id: 'replay-wal', description: 'Configure recovery to the requested target and replay archived WAL; stop exactly at the target.', destructive: true },
      { id: 'open-read-only', description: 'Open the restored database read-only and keep the target isolated from user traffic.', destructive: false },
      { id: 'verify-schema-ledger', description: 'Verify migration/schema version, row counts, changeset chain/head, checkpoints, and Named Version mappings.', destructive: false },
      { id: 'cross-store-reconcile', description: 'Verify DB references against the paired object versions (size/SHA-256) for the same recovery target.', destructive: false },
      { id: 'business-acceptance', description: 'Run the business acceptance set (including a >=100-changeset document) and record failures.', destructive: false },
      { id: 'measure-signoff', description: 'Compute RPO/RTO from timestamps, record operator/witness sign-off, and list residuals.', destructive: false },
      { id: 'cleanup', description: 'Destroy only the disposable restore instance; keep source backups/WAL and evidence.', destructive: true },
    ],
    evidenceFields: [
      { path: 'environment.provider/region/environmentClass', description: 'Redacted labels only; no endpoints, account IDs, or credentials.' },
      { path: 'hitl.drillWindowApproved/restoreApproved/cleanupApproved', description: 'HITL gate outcomes with approver/witness and UTC time.' },
      { path: 'preflight[]', description: 'Every blocking preflight check with ok and a non-secret detail.' },
      { path: 'restore.backupRepositoryRef/baseBackupUtc/requestedTargetUtc/achievedRecoveryPointUtc', description: 'Base backup and WAL replay identity/timing; references only.' },
      { path: 'restore.walReplayComplete/readOnly', description: 'Whether WAL replay stopped at the requested target and the DB stayed read-only.' },
      { path: 'verification.schemaVersionObserved/ledgerVerificationPassed', description: 'Schema and ledger/checkpoint verification outcomes.' },
      { path: 'verification.crossStoreReconciliationPassed', description: 'DB rows matched the paired object version manifest.' },
      { path: 'rpo.requestedTargetUtc/achievedRecoveryPointUtc/measuredSeconds', description: 'Component RPO = requested target minus achieved recovery point.' },
      { path: 'rto.announcedAtUtc/verifiedAtUtc/measuredSeconds', description: 'RTO = drill announcement to technical + business verification sign-off.' },
      { path: 'claims.*', description: 'Capability/target claims; false unless the same evidence proves them.' },
      { path: 'cleanup.performed/residualResources', description: 'Cleanup outcome and leftover resources.' },
      { path: 'rollback.tested/notes', description: 'Rollback check result and owner notes.' },
    ],
    hitlGates: [
      'Written approval of the drill window by the Data/SRE owner, with a named witness.',
      'Written approval before restoring/replaying into the isolated target; never against the main stack.',
      'Written approval before deleting any drill-only resource; source backups/WAL/object versions are never deleted.',
      'Operator + witness sign-off of the evidence and claims before any target-achievement statement.',
    ],
    cleanup: [...COMMON_CLEANUP],
    rollback: [...COMMON_ROLLBACK],
    failureCriteria: [
      'No concrete PITR target time, or the target is outside the retained WAL/base-backup window.',
      'WAL replay is incomplete or the achieved recovery point is earlier/later than the requested target beyond tolerance.',
      'Schema/migration version, changeset chain/head, checkpoint, or Named Version verification fails.',
      'The paired object versions cannot be reconciled with the restored DB.',
      'The restore target is the main stack, is reachable by users, or is opened read-write.',
      'RPO/RTO are claimed without measured timestamps and complete evidence.',
      'Cleanup leaves the isolated target or temporary credentials behind, or deletes source history.',
    ],
    rpo: {
      targetSeconds: RPO_TARGET_SECONDS,
      scope: 'postgres-pitr-component',
      formula: 'requestedTargetUtc - achievedRecoveryPointUtc (seconds); combined production RPO also requires the object-store component.',
      note: 'The measured value is a component measurement from one drill, not an ongoing compliance statement.',
    },
    rto: {
      targetSeconds: RTO_TARGET_SECONDS,
      startsAt: 'drill announcement / recovery window start (UTC)',
      endsAt: 'technical + business verification sign-off (UTC)',
      note: 'Includes restore, WAL replay, verification, and HITL sign-off; not just process start-up.',
    },
  },
  {
    id: 'object-storage-versioning',
    plane: 'production',
    title: 'Object storage: versioned restore of a matched blob set with checksum verification',
    summary:
      'Restore a declared set of object versions into an isolated target, prove the store is versioned (not ' +
      'Azurite/single-volume), and verify version IDs, sizes, and SHA-256 against the DB/manifest before service.',
    executableByIsolatedHarness: false,
    requires: [
      'object-store.versioning-enabled',
      'object-store.per-version-read',
      'object-store.checksum-manifest',
      'object-store.isolated-restore-target',
      'postgres.paired-recovery-point',
    ],
    inputs: [
      { name: 'objectStoreEndpoint', template: '<OBJECT_STORE_ENDPOINT>', description: 'Provider-neutral endpoint reference; no credential or account key.' },
      { name: 'sourceBucket', template: '<SOURCE_BUCKET>', description: 'Production-class source container/bucket name.' },
      { name: 'restoreTargetBucket', template: '<RESTORE_TARGET_BUCKET>', description: 'Disposable isolated restore target; must differ from the source.' },
      { name: 'restoreSetManifestRef', template: '<OBJECT_RESTORE_SET_MANIFEST_REF>', description: 'Private manifest listing object versions, sizes, and SHA-256.' },
      { name: 'checksumAlgorithm', template: '<CHECKSUM_ALGORITHM>', description: 'Must resolve to SHA-256 for this drill.' },
      { name: 'requestedTargetUtc', template: '<OBJECT_RECOVERY_TARGET_UTC>', description: 'Recovery point shared with the paired PostgreSQL drill.' },
      { name: 'restoreInstanceRef', template: '<RESTORE_INSTANCE_REF>', description: 'Private reference to the isolated restore environment.' },
      { name: 'secretSourceRef', template: '<SECRET_SOURCE_REF>', description: 'Approved secret-manager reference; credentials are never recorded.' },
      { name: 'evidenceVaultRef', template: '<EVIDENCE_VAULT_REF>', description: 'Private evidence-vault destination for command output and checksums.' },
    ],
    preflight: [
      { id: 'versioning-status-enabled', description: 'Bucket/container versioning reports enabled; disabled/suspended/unknown fails closed.' },
      { id: 'versioning-not-suspended', description: 'Versioning is not suspended and per-version reads are available.' },
      { id: 'checksum-manifest-present', description: 'A manifest with expected version IDs, sizes, and SHA-256 exists.' },
      { id: 'checksum-algorithm-sha256', description: 'The drill checksum algorithm is SHA-256 (CRC/MD5 alone is insufficient).' },
      { id: 'target-isolated', description: 'The restore target is disposable, isolated, and unrelated to the active main stack.' },
      { id: 'target-not-main-stack', description: 'The target is explicitly not the main stack; unknown values fail closed.' },
      { id: 'source-target-separated', description: 'The restore target is not the source bucket/prefix; no in-place overwrite of history.' },
      { id: 'writers-frozen', description: 'Application writers are frozen/fenced for the drill window.' },
      { id: 'restore-set-declared', description: 'The exact object-version set is declared before any copy starts.' },
      { id: 'secret-source-declared', description: 'Credentials come from an approved secret manager and are excluded from evidence.' },
      { id: 'encryption-at-rest-enabled', description: 'The production-class store reports encryption at rest; a dev emulator cannot satisfy this.' },
      { id: 'capacity-verified', description: 'Restore-target capacity is verified for the declared object set.' },
    ],
    steps: [
      { id: 'announce-window', description: 'Announce the drill window and HITL approvers; record UTC start for RTO.', destructive: false },
      { id: 'freeze-writers', description: 'Freeze/fence writers and record the paired PostgreSQL recovery point.', destructive: false },
      { id: 'capture-version-manifest', description: 'Record object names, version IDs, sizes, SHA-256, and version timestamps for the matched set.', destructive: false },
      { id: 'verify-versioning', description: 'Confirm versioning is enabled and the declared versions are readable.', destructive: false },
      { id: 'restore-objects', description: 'Copy/restore the declared versions into the isolated target without overwriting the source.', destructive: true },
      { id: 'verify-object-set', description: 'Verify object count, version IDs, sizes, and SHA-256 for every declared object.', destructive: false },
      { id: 'verify-no-newer-version', description: 'Reject any selected version timestamped after the shared recovery target.', destructive: false },
      { id: 'cross-store-reconcile', description: 'Match DB references (changeset/baseline/checkpoint/tile) to the restored object versions.', destructive: false },
      { id: 'business-acceptance', description: 'Open sample documents and verify history/tile/baseline access from the restored set.', destructive: false },
      { id: 'measure-signoff', description: 'Compute component RPO/RTO, record operator/witness sign-off, and list residuals.', destructive: false },
      { id: 'cleanup', description: 'Delete only the isolated restore target; keep source object versions and evidence.', destructive: true },
    ],
    evidenceFields: [
      { path: 'environment.provider/region/environmentClass', description: 'Redacted labels only; no endpoints, account IDs, or credentials.' },
      { path: 'hitl.drillWindowApproved/restoreApproved/cleanupApproved', description: 'HITL gate outcomes with approver/witness and UTC time.' },
      { path: 'preflight[]', description: 'Every blocking preflight check, including versioning status and checksum algorithm.' },
      { path: 'restore.sourceBucket/restoreTargetBucket/restoreSetManifestRef', description: 'Source/target references; never credentials or resolved endpoints in the public repo.' },
      { path: 'restore.versioningStatus/restoreCompleted', description: 'Versioning status and whether every declared object was restored.' },
      { path: 'restore.objectsExpected/objectsRestored', description: 'Declared vs restored object counts; must match and be non-zero.' },
      { path: 'restore.newestRestoredVersionUtc', description: 'Newest selected object version timestamp for the component RPO.' },
      { path: 'verification.checksumsVerified/objectVersionIdsVerified', description: 'Size/SHA-256 and version-ID verification outcomes.' },
      { path: 'verification.crossStoreReconciliationPassed', description: 'DB references matched the restored object versions.' },
      { path: 'rpo.requestedTargetUtc/newestRestoredVersionUtc/measuredSeconds', description: 'Component RPO = requested target minus newest used object version time.' },
      { path: 'rto.announcedAtUtc/verifiedAtUtc/measuredSeconds', description: 'RTO = drill announcement to technical + business verification sign-off.' },
      { path: 'claims.*', description: 'Capability/target claims; false unless the same evidence proves them.' },
      { path: 'cleanup.performed/residualResources', description: 'Cleanup outcome and leftover resources.' },
      { path: 'rollback.tested/notes', description: 'Rollback check result and owner notes.' },
    ],
    hitlGates: [
      'Written approval of the drill window by the Data/SRE owner, with a named witness.',
      'Written approval before copying/restoring object versions into the isolated target; never in-place on the source.',
      'Written approval before deleting any drill-only bucket/prefix/resource; source object versions are never deleted.',
      'Operator + witness sign-off of the evidence and claims before any target-achievement statement.',
    ],
    cleanup: [...COMMON_CLEANUP],
    rollback: [...COMMON_ROLLBACK],
    failureCriteria: [
      'The store is unversioned, versioning is suspended/unknown, or per-version reads are unavailable.',
      'The target is the source bucket/prefix, the main stack, or otherwise not isolated.',
      'Any object is missing, has a different version ID, a different size, or a SHA-256 mismatch.',
      'Fewer objects are restored than declared, or the restore does not complete.',
      'A selected object version is timestamped after the shared recovery target.',
      'DB references cannot be reconciled with the restored object versions.',
      'RPO/RTO are claimed without measured timestamps and complete evidence.',
      'Cleanup deletes source versions or leaves the isolated target/temporary credentials behind.',
    ],
    rpo: {
      targetSeconds: RPO_TARGET_SECONDS,
      scope: 'object-store-component',
      formula: 'requestedTargetUtc - newestRestoredVersionUtc (seconds); combined production RPO also requires the PostgreSQL component.',
      note: 'The measured value is a component measurement from one drill, not an ongoing compliance statement.',
    },
    rto: {
      targetSeconds: RTO_TARGET_SECONDS,
      startsAt: 'drill announcement / recovery window start (UTC)',
      endsAt: 'technical + business verification sign-off (UTC)',
      note: 'Includes object copy/restore, checksum verification, cross-store reconciliation, and HITL sign-off.',
    },
  },
]);

export class ProductionDrillError extends Error {
  constructor(message, code = 'invalid-production-drill') {
    super(message);
    this.name = 'ProductionDrillError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Placeholders and concrete-value guards                             */
/* ------------------------------------------------------------------ */

export function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERN.test(value.trim());
}

/**
 * Heuristic guard for values that look like a real endpoint, credential, or
 * account identifier. Used to keep repository artifacts placeholder-only.
 */
export function containsConcreteValue(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length === 0) return false;
  return [
    /^[a-z][a-z0-9+.-]*:\/\//i, // any URL/scheme (http, s3, postgres, vault, ...)
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // email-shaped
    /\bAKIA[0-9A-Z]{16}\b/, // long-lived access-key shape
    /-----BEGIN [A-Z ]+-----/, // PEM material
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/, // IPv4 literal
    /^[A-Za-z0-9+/]{40,}={0,2}$/, // long base64-ish secret
  ].some((pattern) => pattern.test(text));
}

function utcMs(value) {
  if (typeof value !== 'string' || value.trim() === '' || isPlaceholder(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function roundSeconds(ms) {
  if (ms === null) return null;
  return Math.round((ms / 1000) * 1000) / 1000;
}

function normalizeAlgorithm(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ------------------------------------------------------------------ */
/* Scenario lookup and definition validation                          */
/* ------------------------------------------------------------------ */

export function getProductionScenario(scenarioId) {
  const scenario = PRODUCTION_SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (!scenario) {
    throw new ProductionDrillError(
      `unknown production drill scenario '${scenarioId}'; expected one of: ${PRODUCTION_SCENARIO_IDS.join(', ')}`,
      'unknown-scenario',
    );
  }
  return scenario;
}

export function validateProductionScenario(scenario) {
  const errors = [];
  const add = (message) => errors.push(message);
  if (!scenario || typeof scenario !== 'object') {
    return { ok: false, errors: ['scenario is not an object'] };
  }
  if (!PRODUCTION_SCENARIO_IDS.includes(scenario.id)) add(`unsupported scenario id: ${scenario.id}`);
  if (scenario.plane !== 'production') add(`${scenario.id}: plane must be 'production'`);
  if (scenario.executableByIsolatedHarness !== false) {
    add(`${scenario.id}: executableByIsolatedHarness must be false (definitions are not an executor)`);
  }
  for (const field of ['title', 'summary']) {
    if (typeof scenario[field] !== 'string' || scenario[field].trim() === '') {
      add(`${scenario.id}: ${field} is required`);
    }
  }
  for (const field of ['inputs', 'preflight', 'steps', 'evidenceFields', 'hitlGates', 'cleanup', 'rollback', 'failureCriteria', 'requires']) {
    if (!Array.isArray(scenario[field]) || scenario[field].length === 0) {
      add(`${scenario.id}: ${field} must be a non-empty array`);
    }
  }

  const inputNames = new Set();
  for (const input of scenario.inputs ?? []) {
    if (!input || typeof input.name !== 'string' || input.name.trim() === '') {
      add(`${scenario.id}: every input needs a name`);
      continue;
    }
    if (inputNames.has(input.name)) add(`${scenario.id}: duplicate input '${input.name}'`);
    inputNames.add(input.name);
    if (!isPlaceholder(input.template)) {
      add(`${scenario.id}.${input.name}: template must be a <PLACEHOLDER>, got '${input.template}'`);
    }
    if (containsConcreteValue(input.template)) {
      add(`${scenario.id}.${input.name}: template looks like a concrete endpoint/credential`);
    }
    if (typeof input.description !== 'string' || input.description.trim() === '') {
      add(`${scenario.id}.${input.name}: description is required`);
    }
  }

  for (const field of ['preflight', 'steps']) {
    const ids = new Set();
    for (const item of scenario[field] ?? []) {
      if (!item || typeof item.id !== 'string' || item.id.trim() === '') {
        add(`${scenario.id}: every ${field} entry needs an id`);
        continue;
      }
      if (ids.has(item.id)) add(`${scenario.id}: duplicate ${field} id '${item.id}'`);
      ids.add(item.id);
      if (typeof item.description !== 'string' || item.description.trim() === '') {
        add(`${scenario.id}.${field}.${item.id}: description is required`);
      }
    }
  }
  for (const field of ['evidenceFields']) {
    for (const item of scenario[field] ?? []) {
      if (!item || typeof item.path !== 'string' || item.path.trim() === '') {
        add(`${scenario.id}: every evidenceFields entry needs a path`);
      }
    }
  }
  for (const gate of scenario.hitlGates ?? []) {
    if (typeof gate !== 'string' || gate.trim() === '' || !/approv|sign-off|witness/i.test(gate)) {
      add(`${scenario.id}: HITL gates must describe approval/sign-off with a witness`);
    }
  }
  if (scenario.rpo?.targetSeconds !== RPO_TARGET_SECONDS) {
    add(`${scenario.id}: rpo.targetSeconds must be ${RPO_TARGET_SECONDS}`);
  }
  if (scenario.rto?.targetSeconds !== RTO_TARGET_SECONDS) {
    add(`${scenario.id}: rto.targetSeconds must be ${RTO_TARGET_SECONDS}`);
  }
  for (const field of ['rpo', 'rto']) {
    if (typeof scenario[field]?.note !== 'string' || scenario[field].note.trim() === '') {
      add(`${scenario.id}: ${field}.note is required`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateAllProductionScenarios(catalog = PRODUCTION_SCENARIOS) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return { ok: false, errors: ['production scenario catalog must be a non-empty array'] };
  }
  for (const scenario of catalog) {
    if (ids.has(scenario?.id)) errors.push(`duplicate production scenario: ${scenario.id}`);
    ids.add(scenario?.id);
    const validation = validateProductionScenario(scenario);
    for (const error of validation.errors) errors.push(error);
  }
  for (const id of PRODUCTION_SCENARIO_IDS) {
    if (!ids.has(id)) errors.push(`missing production scenario: ${id}`);
  }
  return { ok: errors.length === 0, errors };
}

export function productionScenarioCatalog() {
  const validation = validateAllProductionScenarios();
  if (!validation.ok) {
    throw new ProductionDrillError(
      `production scenario catalog is internally inconsistent: ${validation.errors.join('; ')}`,
      'invalid-catalog',
    );
  }
  return PRODUCTION_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    plane: scenario.plane,
    executableByIsolatedHarness: false,
    requires: [...scenario.requires],
    inputPlaceholders: scenario.inputs.map((input) => input.template),
    hitlGateCount: scenario.hitlGates.length,
    rpoTargetSeconds: scenario.rpo.targetSeconds,
    rtoTargetSeconds: scenario.rto.targetSeconds,
  }));
}

/* ------------------------------------------------------------------ */
/* Inputs and plans                                                   */
/* ------------------------------------------------------------------ */

/**
 * Validate scenario inputs. `mode: 'template'` is for repository artifacts and
 * requires placeholders. `mode: 'operator'` requires resolved private
 * references (not placeholders); actual credentials are supplied to tooling by
 * the secret manager and are never embedded in inputs or evidence.
 */
export function validateProductionInputs(scenarioId, inputs = {}, { mode = 'template' } = {}) {
  const scenario = getProductionScenario(scenarioId);
  const errors = [];
  const known = new Map(scenario.inputs.map((input) => [input.name, input]));
  if (!['template', 'operator'].includes(mode)) {
    throw new ProductionDrillError("mode must be 'template' or 'operator'", 'invalid-mode');
  }
  for (const [name, value] of Object.entries(inputs ?? {})) {
    if (!known.has(name)) {
      errors.push(`unknown input '${name}' for scenario '${scenarioId}'`);
      continue;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`input '${name}' must be a non-empty string`);
      continue;
    }
    if (mode === 'template' && !isPlaceholder(value)) {
      errors.push(`input '${name}' must remain a <PLACEHOLDER> in repository artifacts`);
    }
    if (mode === 'operator' && isPlaceholder(value)) {
      errors.push(`input '${name}' is unresolved (${value}); resolve it in the private runbook`);
    }
  }
  if (mode === 'operator') {
    for (const input of scenario.inputs) {
      if (!(input.name in (inputs ?? {}))) {
        errors.push(`missing required input '${input.name}' (${input.template})`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function buildProductionDrillPlan(scenarioId) {
  const scenario = getProductionScenario(scenarioId);
  const validation = validateProductionScenario(scenario);
  if (!validation.ok) {
    throw new ProductionDrillError(
      `scenario '${scenarioId}' is invalid: ${validation.errors.join('; ')}`,
      'invalid-scenario',
    );
  }
  const plan = {
    schemaVersion: PRODUCTION_DRILL_SCHEMA_VERSION,
    kind: PRODUCTION_PLAN_KIND,
    scenario: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    plane: scenario.plane,
    executableByIsolatedHarness: false,
    runnableHere: false,
    hitlRequired: true,
    prerequisites: [...scenario.requires],
    inputs: scenario.inputs.map((input) => ({
      name: input.name,
      placeholder: input.template,
      description: input.description,
    })),
    preflight: scenario.preflight.map((check) => ({ id: check.id, description: check.description })),
    steps: scenario.steps.map((step) => ({
      id: step.id,
      description: step.description,
      destructive: step.destructive === true,
    })),
    evidenceFields: scenario.evidenceFields.map((field) => ({ ...field })),
    hitlGates: [...scenario.hitlGates],
    cleanup: [...scenario.cleanup],
    rollback: [...scenario.rollback],
    failureCriteria: [...scenario.failureCriteria],
    rpo: { ...scenario.rpo },
    rto: { ...scenario.rto },
    limitations: [...COMMON_LIMITATIONS],
  };
  const planValidation = validateProductionDrillPlan(plan);
  if (!planValidation.ok) {
    throw new ProductionDrillError(
      `internally inconsistent production drill plan: ${planValidation.errors.join('; ')}`,
      'invalid-plan',
    );
  }
  return plan;
}

export function validateProductionDrillPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return { ok: false, errors: ['plan is not an object'] };
  if (plan.schemaVersion !== PRODUCTION_DRILL_SCHEMA_VERSION) errors.push('schemaVersion must be 1');
  if (plan.kind !== PRODUCTION_PLAN_KIND) errors.push(`kind must be '${PRODUCTION_PLAN_KIND}'`);
  if (!PRODUCTION_SCENARIO_IDS.includes(plan.scenario)) errors.push(`unsupported scenario: ${plan.scenario}`);
  if (plan.executableByIsolatedHarness !== false) {
    errors.push('executableByIsolatedHarness must be false');
  }
  if (plan.runnableHere !== false) errors.push('runnableHere must be false; this repository defines but does not execute production drills');
  if (plan.hitlRequired !== true) errors.push('hitlRequired must be true');
  if (!Array.isArray(plan.inputs) || plan.inputs.length === 0) errors.push('inputs must be a non-empty array');
  for (const input of plan.inputs ?? []) {
    if (!isPlaceholder(input?.placeholder)) {
      errors.push(`input ${input?.name ?? '?'}: placeholder must be <UPPER_SNAKE>`);
    }
  }
  for (const field of ['preflight', 'steps', 'evidenceFields', 'hitlGates', 'cleanup', 'rollback', 'failureCriteria']) {
    if (!Array.isArray(plan[field]) || plan[field].length === 0) errors.push(`${field} must be a non-empty array`);
  }
  if (plan.rpo?.targetSeconds !== RPO_TARGET_SECONDS) errors.push(`rpo.targetSeconds must be ${RPO_TARGET_SECONDS}`);
  if (plan.rto?.targetSeconds !== RTO_TARGET_SECONDS) errors.push(`rto.targetSeconds must be ${RTO_TARGET_SECONDS}`);
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Preflight (pure over declared facts)                               */
/* ------------------------------------------------------------------ */

function preflightCheck(checks, id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), blocking: true, detail: String(detail) });
}

/**
 * Evaluate a production preflight from explicitly supplied capability facts.
 * Unknown or missing facts fail closed: every check must be explicitly true.
 */
export function runProductionPreflight(scenarioId, facts = {}) {
  getProductionScenario(scenarioId);
  const checks = [];

  if (scenarioId === 'postgres-pitr') {
    const requested = utcMs(facts.requestedTargetUtc);
    const retentionStart = utcMs(facts.retentionWindowStartUtc);
    const latestBase = utcMs(facts.latestBaseBackupUtc);
    const now = utcMs(facts.nowUtc);
    preflightCheck(checks, 'wal-archiving-enabled', facts.walArchivingEnabled === true,
      'continuous WAL archiving is enabled');
    preflightCheck(checks, 'base-backup-available', facts.baseBackupAvailable === true,
      'a completed base backup is available');
    preflightCheck(checks, 'pitr-target-present', requested !== null,
      requested !== null ? `${facts.requestedTargetUtc}` : 'missing or unresolved PITR target time');
    preflightCheck(checks, 'pitr-target-within-retention',
      requested !== null && retentionStart !== null && requested >= retentionStart && (now === null || requested <= now),
      requested === null ? 'no target to compare with retention'
        : `target=${facts.requestedTargetUtc} retentionStart=${facts.retentionWindowStartUtc ?? 'missing'}` +
          (now === null ? '' : ` now=${facts.nowUtc}`));
    preflightCheck(checks, 'base-backup-before-target',
      requested !== null && latestBase !== null && latestBase <= requested,
      `latestBaseBackup=${facts.latestBaseBackupUtc ?? 'missing'}`);
    preflightCheck(checks, 'target-isolated', facts.targetIsolated === true,
      'restore instance is disposable and isolated');
    preflightCheck(checks, 'target-not-main-stack', facts.targetIsMainStack === false,
      'restore instance is explicitly not the main stack');
    preflightCheck(checks, 'writers-frozen', facts.writersFrozen === true,
      'writers are frozen/fenced for the drill window');
    preflightCheck(checks, 'secret-source-declared', facts.secretSourceDeclared === true,
      'credentials are sourced from an approved secret manager');
    preflightCheck(checks, 'paired-object-manifest-declared',
      typeof facts.pairedObjectManifestRef === 'string' && facts.pairedObjectManifestRef.trim() !== '' &&
        !isPlaceholder(facts.pairedObjectManifestRef),
      'paired object-version manifest reference is resolved');
    preflightCheck(checks, 'expected-schema-declared',
      typeof facts.expectedSchemaVersion === 'string' && facts.expectedSchemaVersion.trim() !== '' &&
        !isPlaceholder(facts.expectedSchemaVersion),
      'expected migration/schema version is declared');
    preflightCheck(checks, 'capacity-verified', facts.capacityVerified === true,
      'restore capacity is verified');
  } else {
    const versioning = String(facts.versioningStatus ?? '').toLowerCase();
    preflightCheck(checks, 'versioning-status-enabled', versioning === 'enabled',
      `versioningStatus=${facts.versioningStatus ?? 'missing'}`);
    preflightCheck(checks, 'versioning-not-suspended', versioning !== 'suspended',
      `versioningStatus=${facts.versioningStatus ?? 'missing'}`);
    preflightCheck(checks, 'checksum-manifest-present', facts.checksumManifestPresent === true,
      'a checksum/version manifest is available');
    preflightCheck(checks, 'checksum-algorithm-sha256',
      normalizeAlgorithm(facts.checksumAlgorithm) === 'sha256',
      `checksumAlgorithm=${facts.checksumAlgorithm ?? 'missing'}`);
    preflightCheck(checks, 'target-isolated', facts.targetIsolated === true,
      'restore target is disposable and isolated');
    preflightCheck(checks, 'target-not-main-stack', facts.targetIsMainStack === false,
      'restore target is explicitly not the main stack');
    preflightCheck(checks, 'source-target-separated', facts.restoreTargetIsSource === false,
      'restore target is not the source container/prefix');
    preflightCheck(checks, 'writers-frozen', facts.writersFrozen === true,
      'writers are frozen/fenced for the drill window');
    preflightCheck(checks, 'restore-set-declared', facts.restoreSetDeclared === true,
      'the exact object-version set is declared');
    preflightCheck(checks, 'secret-source-declared', facts.secretSourceDeclared === true,
      'credentials are sourced from an approved secret manager');
    preflightCheck(checks, 'encryption-at-rest-enabled', facts.encryptionAtRestEnabled === true,
      'the production-class store reports encryption at rest');
    preflightCheck(checks, 'capacity-verified', facts.capacityVerified === true,
      'restore-target capacity is verified');
  }

  const errors = checks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`);
  return { scenarioId, ok: errors.length === 0, checks, errors };
}

/* ------------------------------------------------------------------ */
/* Restore assessment (pure over declared observations)               */
/* ------------------------------------------------------------------ */

/**
 * Assess a PostgreSQL PITR restore. Missing target, incomplete WAL replay,
 * early/late stop, read-write target, schema drift, or an unverified paired
 * object manifest all fail closed.
 */
export function assessPitrRestore(input = {}) {
  const errors = [];
  const add = (code, detail) => errors.push({ code, detail });
  const toleranceSeconds = Number.isFinite(input.toleranceSeconds) ? Number(input.toleranceSeconds) : 60;
  const requested = utcMs(input.requestedTargetUtc);
  const base = utcMs(input.baseBackupUtc);
  const achieved = utcMs(input.achievedRecoveryPointUtc);

  if (requested === null) add('pitr-target-missing', 'no concrete requested target time');
  if (base === null) add('base-backup-missing', 'no concrete base-backup time');
  if (requested !== null && base !== null && base > requested) {
    add('base-backup-after-target', 'the base backup starts after the requested recovery target');
  }
  if (input.replayComplete !== true) add('wal-replay-incomplete', 'WAL replay did not complete to the target');
  if (requested !== null && achieved === null) add('recovery-point-missing', 'no achieved recovery point was recorded');
  if (requested !== null && achieved !== null) {
    const earlyMs = requested - achieved;
    const lateMs = achieved - requested;
    if (earlyMs > toleranceSeconds * 1000) {
      add('pitr-target-not-reached', `recovery stopped ${roundSeconds(earlyMs)}s before the requested target`);
    }
    if (lateMs > toleranceSeconds * 1000) {
      add('pitr-target-overshot', `recovery stopped ${roundSeconds(lateMs)}s after the requested target`);
    }
  }
  if (input.readOnly !== true) add('restore-not-read-only', 'the restored database was not kept read-only');
  if (!input.schemaVersionObserved || !input.schemaVersionExpected) {
    add('schema-version-unverified', 'observed/expected schema versions were not both recorded');
  } else if (input.schemaVersionObserved !== input.schemaVersionExpected) {
    add('schema-version-mismatch', `observed=${input.schemaVersionObserved} expected=${input.schemaVersionExpected}`);
  }
  if (input.ledgerVerificationPassed !== true) add('ledger-verification-failed', 'changeset/checkpoint verification failed or was not run');
  if (input.pairedObjectManifestVerified !== true) add('paired-object-verification-failed', 'the paired object-version manifest was not verified');
  return { ok: errors.length === 0, errors };
}

/**
 * Assess a versioned object restore. Unversioned/suspended stores, missing
 * objects, version mismatches, size/SHA-256 mismatches, objects selected after
 * the recovery target, and incomplete restores all fail closed.
 */
export function assessObjectVersionRestore(input = {}) {
  const errors = [];
  const add = (code, detail) => errors.push({ code, detail });
  const versioning = String(input.versioningStatus ?? '').toLowerCase();
  if (versioning !== 'enabled') {
    add('object-versioning-disabled', `versioningStatus=${input.versioningStatus ?? 'missing'}; unversioned/suspended/unknown stores are refused`);
  }
  if (normalizeAlgorithm(input.checksumAlgorithm) !== 'sha256') {
    add('unsupported-checksum-algorithm', `checksumAlgorithm=${input.checksumAlgorithm ?? 'missing'}; SHA-256 is required`);
  }
  if (input.restoreCompleted !== true) add('restore-incomplete', 'the object restore did not complete');
  const expected = Array.isArray(input.expectedObjects) ? input.expectedObjects : [];
  const actual = Array.isArray(input.actualObjects) ? input.actualObjects : [];
  if (expected.length === 0) add('restore-set-empty', 'the declared object-version set is empty');
  const requested = utcMs(input.requestedTargetUtc);
  const toleranceSeconds = Number.isFinite(input.toleranceSeconds) ? Number(input.toleranceSeconds) : 60;
  const actualByName = new Map();
  for (const object of actual) {
    if (object && typeof object.name === 'string') actualByName.set(object.name, object);
  }
  for (const object of expected) {
    const name = typeof object?.name === 'string' ? object.name : '';
    if (name === '') {
      add('invalid-expected-object', 'an expected object has no name');
      continue;
    }
    if (!object.versionId) add('expected-version-missing', `${name}: expected object has no version ID`);
    if (!Number.isInteger(object.bytes) || object.bytes < 0) {
      add('expected-size-missing', `${name}: expected object has no non-negative byte size`);
    }
    if (typeof object.sha256 !== 'string' || object.sha256.trim() === '') {
      add('expected-checksum-missing', `${name}: expected object has no SHA-256`);
    }
    const found = actualByName.get(name);
    if (!found) {
      add('object-missing', `${name}: object is absent from the restore target`);
      continue;
    }
    if (!found.versionId) add('object-not-versioned', `${name}: restored object reports no version ID`);
    if (object.versionId && found.versionId !== object.versionId) {
      add('object-version-mismatch', `${name}: expected version ${object.versionId}, restored ${found.versionId}`);
    }
    if (Number.isInteger(object.bytes) && found.bytes !== object.bytes) {
      add('object-size-mismatch', `${name}: expected ${object.bytes} bytes, restored ${found.bytes}`);
    }
    if (typeof object.sha256 === 'string' && object.sha256.trim() !== '' &&
      String(found.sha256 ?? '').toLowerCase() !== object.sha256.toLowerCase()) {
      add('object-checksum-mismatch', `${name}: SHA-256 differs from the manifest`);
    }
    if (!found.sha256) add('object-checksum-missing', `${name}: restored object has no SHA-256 to verify`);
    if (requested !== null && object.versionTimestampUtc) {
      const versionMs = utcMs(object.versionTimestampUtc);
      if (versionMs !== null && versionMs > requested + toleranceSeconds * 1000) {
        add('object-version-after-target', `${name}: version is timestamped after the shared recovery target`);
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    expectedCount: expected.length,
    actualCount: actual.length,
  };
}

/* ------------------------------------------------------------------ */
/* Measurements                                                       */
/* ------------------------------------------------------------------ */

/**
 * Component RPO from a shared recovery target. The loss window is clamped at
 * zero; a recovery point later than the target is an overshoot and must be
 * rejected by assessPitrRestore/assessObjectVersionRestore instead of being
 * hidden behind a negative number.
 */
export function measureRecovery({ requestedTargetUtc, pitrRecoveredAtUtc, newestObjectVersionAtUtc } = {}) {
  const requested = utcMs(requestedTargetUtc);
  const pitr = utcMs(pitrRecoveredAtUtc);
  const object = utcMs(newestObjectVersionAtUtc);
  // The loss window is never negative. A recovery point later than the target
  // is an overshoot, which assessPitrRestore reports as a failure instead of
  // hiding it behind a negative RPO.
  const pitrGapSeconds = requested === null || pitr === null ? null : Math.max(0, roundSeconds(requested - pitr));
  const objectGapSeconds = requested === null || object === null ? null : Math.max(0, roundSeconds(requested - object));
  const combinedRpoSeconds = pitrGapSeconds === null || objectGapSeconds === null
    ? null
    : Math.max(pitrGapSeconds, objectGapSeconds);
  return { pitrGapSeconds, objectGapSeconds, combinedRpoSeconds };
}

export function measureRto({ announcedAtUtc, verifiedAtUtc } = {}) {
  const announced = utcMs(announcedAtUtc);
  const verified = utcMs(verifiedAtUtc);
  if (announced === null || verified === null) return { measuredSeconds: null };
  return { measuredSeconds: roundSeconds(verified - announced) };
}

/* ------------------------------------------------------------------ */
/* Evidence template and validation                                   */
/* ------------------------------------------------------------------ */

export function buildProductionEvidenceTemplate(scenarioId) {
  const scenario = getProductionScenario(scenarioId);
  const isPitr = scenario.id === 'postgres-pitr';
  return {
    schemaVersion: PRODUCTION_DRILL_SCHEMA_VERSION,
    kind: PRODUCTION_EVIDENCE_KIND,
    scenario: scenario.id,
    title: scenario.title,
    status: 'not-run',
    drillId: null,
    operator: null,
    witness: null,
    startedAtUtc: null,
    finishedAtUtc: null,
    environment: {
      provider: '<PROVIDER>',
      region: '<REGION>',
      environmentClass: '<ENVIRONMENT_CLASS>',
      isolated: null,
      isMainStack: null,
    },
    hitl: {
      drillWindowApproved: false,
      restoreApproved: false,
      cleanupApproved: false,
      approvedBy: null,
      witness: null,
      approvedAtUtc: null,
    },
    preflight: scenario.preflight.map((check) => ({ id: check.id, ok: null, detail: 'not evaluated' })),
    restore: isPitr
      ? {
          backupRepositoryRef: '<PG_BACKUP_REPOSITORY_REF>',
          baseBackupUtc: null,
          requestedTargetUtc: '<PITR_TARGET_UTC>',
          achievedRecoveryPointUtc: null,
          walReplayComplete: null,
          readOnly: null,
          pairedObjectManifestRef: '<PAIRED_OBJECT_MANIFEST_REF>',
        }
      : {
          sourceBucket: '<SOURCE_BUCKET>',
          restoreTargetBucket: '<RESTORE_TARGET_BUCKET>',
          restoreSetManifestRef: '<OBJECT_RESTORE_SET_MANIFEST_REF>',
          versioningStatus: '<OBJECT_VERSIONING_STATUS>',
          restoreCompleted: null,
          objectsExpected: null,
          objectsRestored: null,
          newestRestoredVersionUtc: null,
        },
    verification: {
      passed: null,
      schemaVersionObserved: null,
      schemaVersionExpected: null,
      ledgerVerificationPassed: null,
      crossStoreReconciliationPassed: null,
      pitrVerified: null,
      checksumsVerified: null,
      objectVersionIdsVerified: null,
      errors: [],
    },
    rpo: {
      scope: scenario.rpo.scope,
      targetSeconds: RPO_TARGET_SECONDS,
      requestedTargetUtc: null,
      lastAckedEditUtc: null,
      achievedRecoveryPointUtc: null,
      newestUsedObjectVersionUtc: null,
      measuredSeconds: null,
      withinTargetThisRun: null,
      evidenceComplete: false,
      targetAchieved: false,
      note: scenario.rpo.note,
    },
    rto: {
      targetSeconds: RTO_TARGET_SECONDS,
      announcedAtUtc: null,
      verifiedAtUtc: null,
      measuredSeconds: null,
      withinTargetThisRun: null,
      evidenceComplete: false,
      targetAchieved: false,
      note: scenario.rto.note,
    },
    claims: {
      pitrProven: false,
      objectVersioningProven: false,
      rpoTargetAchieved: false,
      rtoTargetAchieved: false,
      productionDisasterRecoveryProven: false,
    },
    cleanup: { performed: false, residualResources: [], evidenceRef: null },
    rollback: { tested: false, notes: null },
    evidenceRefs: [],
    limitations: [...COMMON_LIMITATIONS],
  };
}

function hasResolvedLabel(value) {
  return typeof value === 'string' && value.trim() !== '' && !isPlaceholder(value) && !containsConcreteValue(value);
}

function isResolvedReference(value) {
  return typeof value === 'string' && value.trim() !== '' && !isPlaceholder(value) && !/[\r\n]/.test(value);
}

/**
 * Validate production drill evidence. A template validates as `not-run`.
 * Target/capability claims can only be true on passing evidence that contains
 * the matching measurements and verification outcomes; a single scenario can
 * never prove combined production disaster recovery.
 */
export function validateProductionEvidence(evidence) {
  const errors = [];
  const add = (message) => errors.push(message);
  if (!evidence || typeof evidence !== 'object') return { ok: false, errors: ['evidence is not an object'] };
  if (evidence.schemaVersion !== PRODUCTION_DRILL_SCHEMA_VERSION) add('schemaVersion must be 1');
  if (evidence.kind !== PRODUCTION_EVIDENCE_KIND) add(`kind must be '${PRODUCTION_EVIDENCE_KIND}'`);
  if (!PRODUCTION_SCENARIO_IDS.includes(evidence.scenario)) add(`unsupported scenario: ${evidence.scenario}`);
  if (!EVIDENCE_STATUSES.includes(evidence.status)) add(`invalid status: ${evidence.status}`);
  if (!evidence.environment || typeof evidence.environment !== 'object') add('environment is required');
  if (!evidence.claims || typeof evidence.claims !== 'object') add('claims are required');
  if (!evidence.rpo || !evidence.rto) add('rpo and rto are required');
  if (evidence.claims?.productionDisasterRecoveryProven !== false) {
    add('claims.productionDisasterRecoveryProven must be false; a single scenario cannot prove combined DR');
  }

  const status = evidence.status;
  const passed = status === 'passed';
  if (!passed) {
    for (const claim of ['pitrProven', 'objectVersioningProven', 'rpoTargetAchieved', 'rtoTargetAchieved']) {
      if (evidence.claims?.[claim] !== false) add(`claims.${claim} must be false unless status is 'passed'`);
    }
    if (evidence.rpo?.targetAchieved === true) add('rpo.targetAchieved must be false unless status is passed');
    if (evidence.rto?.targetAchieved === true) add('rto.targetAchieved must be false unless status is passed');
    return { ok: errors.length === 0, errors };
  }

  // Passing evidence must be complete, isolated, and HITL-approved.
  if (!hasResolvedLabel(evidence.drillId)) add('drillId must be resolved for passed evidence');
  if (!hasResolvedLabel(evidence.operator) || !hasResolvedLabel(evidence.witness)) {
    add('operator and witness must be resolved for passed evidence');
  }
  if (utcMs(evidence.startedAtUtc) === null || utcMs(evidence.finishedAtUtc) === null) {
    add('startedAtUtc and finishedAtUtc are required for passed evidence');
  }
  if (!hasResolvedLabel(evidence.environment?.provider) ||
    !hasResolvedLabel(evidence.environment?.region) ||
    !hasResolvedLabel(evidence.environment?.environmentClass)) {
    add('environment provider/region/environmentClass must be resolved, redacted labels');
  }
  if (evidence.environment?.isolated !== true) add('environment.isolated must be true');
  if (evidence.environment?.isMainStack !== false) add('environment.isMainStack must be false');
  for (const gate of ['drillWindowApproved', 'restoreApproved', 'cleanupApproved']) {
    if (evidence.hitl?.[gate] !== true) add(`hitl.${gate} must be true for passed evidence`);
  }
  if (!hasResolvedLabel(evidence.hitl?.approvedBy) || !hasResolvedLabel(evidence.hitl?.witness)) {
    add('hitl.approvedBy and hitl.witness must be resolved for passed evidence');
  }
  if (utcMs(evidence.hitl?.approvedAtUtc) === null) add('hitl.approvedAtUtc is required for passed evidence');
  if (!Array.isArray(evidence.preflight) || evidence.preflight.length === 0) {
    add('preflight must be a non-empty array');
  } else {
    for (const check of evidence.preflight) {
      if (check?.ok !== true) add(`preflight.${check?.id ?? '?'} must be true`);
    }
  }
  if (evidence.verification?.passed !== true) add('verification.passed must be true');
  if (!Array.isArray(evidence.verification?.errors)) {
    add('verification.errors must be an array');
  } else if (evidence.verification.errors.length > 0) {
    add('verification.errors must be empty for passed evidence');
  }
  if (evidence.cleanup?.performed !== true) add('cleanup.performed must be true for passed evidence');
  if (!Array.isArray(evidence.cleanup?.residualResources)) add('cleanup.residualResources must be an array');
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length === 0) {
    add('evidenceRefs must record at least one private evidence reference');
  } else {
    for (const reference of evidence.evidenceRefs) {
      if (!isResolvedReference(reference)) {
        add(`evidenceRefs entry must be a resolved private reference: '${reference}'`);
      }
    }
  }

  const rpoTarget = RPO_TARGET_SECONDS;
  const rtoTarget = RTO_TARGET_SECONDS;
  if (evidence.rpo?.targetSeconds !== rpoTarget) add(`rpo.targetSeconds must be ${rpoTarget}`);
  if (evidence.rto?.targetSeconds !== rtoTarget) add(`rto.targetSeconds must be ${rtoTarget}`);
  if (utcMs(evidence.rto?.announcedAtUtc) === null || utcMs(evidence.rto?.verifiedAtUtc) === null) {
    add('rto announcedAtUtc/verifiedAtUtc are required for passed evidence');
  }
  const rtoMeasure = measureRto({
    announcedAtUtc: evidence.rto?.announcedAtUtc,
    verifiedAtUtc: evidence.rto?.verifiedAtUtc,
  });
  if (rtoMeasure.measuredSeconds === null) {
    add('rto.measuredSeconds could not be computed from timestamps');
  } else if (rtoMeasure.measuredSeconds < 0) {
    add('rto.measuredSeconds must not be negative; verification precedes announcement');
  } else if (evidence.rto?.measuredSeconds !== rtoMeasure.measuredSeconds) {
    add(`rto.measuredSeconds must equal verifiedAtUtc - announcedAtUtc (${rtoMeasure.measuredSeconds})`);
  } else {
    const within = rtoMeasure.measuredSeconds <= rtoTarget;
    if (evidence.rto?.withinTargetThisRun !== within) add('rto.withinTargetThisRun must match measuredSeconds <= targetSeconds');
    if (evidence.rto?.targetAchieved !== within) add('rto.targetAchieved must match the measured RTO');
  }

  const scenario = evidence.scenario;
  if (scenario === 'postgres-pitr') {
    const restore = evidence.restore ?? {};
    if (restore.walReplayComplete !== true) add('restore.walReplayComplete must be true');
    if (restore.readOnly !== true) add('restore.readOnly must be true');
    if (restore.requestedTargetUtc !== evidence.rpo?.requestedTargetUtc) {
      add('rpo.requestedTargetUtc must match restore.requestedTargetUtc');
    }
    if (restore.achievedRecoveryPointUtc !== evidence.rpo?.achievedRecoveryPointUtc) {
      add('rpo.achievedRecoveryPointUtc must match restore.achievedRecoveryPointUtc');
    }
    const lastAckedMs = utcMs(evidence.rpo?.lastAckedEditUtc);
    const requestedMs = utcMs(evidence.rpo?.requestedTargetUtc);
    if (lastAckedMs === null) {
      add('rpo.lastAckedEditUtc is required for passed PITR evidence');
    } else if (requestedMs !== null && lastAckedMs > requestedMs + 60 * 1000) {
      add('last-acked-edit-after-target: the last acknowledged edit is later than the recovery target');
    }
    const restitution = assessPitrRestore({
      requestedTargetUtc: restore.requestedTargetUtc,
      baseBackupUtc: restore.baseBackupUtc,
      achievedRecoveryPointUtc: restore.achievedRecoveryPointUtc,
      replayComplete: restore.walReplayComplete,
      readOnly: restore.readOnly,
      schemaVersionObserved: evidence.verification?.schemaVersionObserved,
      schemaVersionExpected: restore.expectedSchemaVersion ?? evidence.verification?.schemaVersionExpected,
      ledgerVerificationPassed: evidence.verification?.ledgerVerificationPassed,
      pairedObjectManifestVerified: evidence.verification?.crossStoreReconciliationPassed,
      toleranceSeconds: 60,
    });
    for (const error of restitution.errors) add(`restore assessment: ${error.code}: ${error.detail}`);
    const measure = measureRecovery({
      requestedTargetUtc: evidence.rpo?.requestedTargetUtc,
      pitrRecoveredAtUtc: evidence.rpo?.achievedRecoveryPointUtc,
    });
    if (measure.pitrGapSeconds === null) {
      add('rpo.measuredSeconds could not be computed for PITR');
    } else if (evidence.rpo?.measuredSeconds !== measure.pitrGapSeconds) {
      add(`rpo.measuredSeconds must equal requestedTargetUtc - achievedRecoveryPointUtc (${measure.pitrGapSeconds})`);
    }
    if (evidence.claims?.pitrProven === true && evidence.verification?.pitrVerified !== true) {
      add('claims.pitrProven requires verification.pitrVerified=true');
    }
    if (evidence.claims?.objectVersioningProven !== false) {
      add('claims.objectVersioningProven must be false in postgres-pitr evidence');
    }
  } else {
    const restore = evidence.restore ?? {};
    if (String(restore.versioningStatus ?? '').toLowerCase() !== 'enabled') {
      add('restore.versioningStatus must be enabled');
    }
    if (restore.restoreCompleted !== true) add('restore.restoreCompleted must be true');
    if (!Number.isInteger(restore.objectsExpected) || restore.objectsExpected <= 0) {
      add('restore.objectsExpected must be a positive integer');
    }
    if (restore.objectsExpected !== restore.objectsRestored) {
      add('restore.objectsRestored must equal restore.objectsExpected');
    }
    if (evidence.verification?.checksumsVerified !== true) add('verification.checksumsVerified must be true');
    if (evidence.verification?.objectVersionIdsVerified !== true) {
      add('verification.objectVersionIdsVerified must be true');
    }
    if (evidence.verification?.crossStoreReconciliationPassed !== true) {
      add('verification.crossStoreReconciliationPassed must be true');
    }
    if (restore.newestRestoredVersionUtc !== evidence.rpo?.newestUsedObjectVersionUtc) {
      add('rpo.newestUsedObjectVersionUtc must match restore.newestRestoredVersionUtc');
    }
    const requestedMs = utcMs(evidence.rpo?.requestedTargetUtc);
    const newestVersionMs = utcMs(evidence.rpo?.newestUsedObjectVersionUtc);
    if (requestedMs === null || newestVersionMs === null) {
      add('rpo.requestedTargetUtc and rpo.newestUsedObjectVersionUtc are required for passed evidence');
    } else if (newestVersionMs > requestedMs + 60 * 1000) {
      add('object-version-after-target: the newest used object version is later than the shared recovery target');
    }
    const measure = measureRecovery({
      requestedTargetUtc: evidence.rpo?.requestedTargetUtc,
      newestObjectVersionAtUtc: evidence.rpo?.newestUsedObjectVersionUtc,
    });
    if (measure.objectGapSeconds === null) {
      add('rpo.measuredSeconds could not be computed for the object-store component');
    } else if (evidence.rpo?.measuredSeconds !== measure.objectGapSeconds) {
      add(`rpo.measuredSeconds must equal requestedTargetUtc - newestUsedObjectVersionUtc (${measure.objectGapSeconds})`);
    }
    if (evidence.claims?.objectVersioningProven === true && evidence.verification?.checksumsVerified !== true) {
      add('claims.objectVersioningProven requires verification.checksumsVerified=true');
    }
    if (evidence.claims?.pitrProven !== false) {
      add('claims.pitrProven must be false in object-storage-versioning evidence');
    }
  }

  const rpoMeasured = evidence.rpo?.measuredSeconds;
  if (typeof rpoMeasured !== 'number' || rpoMeasured < 0) {
    add('rpo.measuredSeconds must be a non-negative number for passed evidence');
  } else {
    const within = rpoMeasured <= rpoTarget;
    if (evidence.rpo?.withinTargetThisRun !== within) add('rpo.withinTargetThisRun must match measuredSeconds <= targetSeconds');
    if (evidence.rpo?.targetAchieved !== within) add('rpo.targetAchieved must match the measured RPO');
  }
  if (evidence.rpo?.evidenceComplete !== true) add('rpo.evidenceComplete must be true for passed evidence');
  if (evidence.rto?.evidenceComplete !== true) add('rto.evidenceComplete must be true for passed evidence');
  if (evidence.claims?.rpoTargetAchieved === true) {
    if (typeof rpoMeasured !== 'number' || rpoMeasured > rpoTarget) {
      add('claims.rpoTargetAchieved cannot be true when the measured RPO exceeds the target');
    }
  }
  if (evidence.claims?.rtoTargetAchieved === true) {
    if (typeof evidence.rto?.measuredSeconds !== 'number' || evidence.rto.measuredSeconds > rtoTarget) {
      add('claims.rtoTargetAchieved cannot be true when the measured RTO exceeds the target');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function productionDrillSummary() {
  return {
    kind: PRODUCTION_CATALOG_KIND,
    scenarios: productionScenarioCatalog(),
    rpoTargetSeconds: RPO_TARGET_SECONDS,
    rtoTargetSeconds: RTO_TARGET_SECONDS,
    executed: false,
    targetsAchieved: false,
    note:
      'Definitions only. No production provider, endpoint, credential, or drill result is included, ' +
      'and no RPO/RTO target is claimed. See docs/operations/PRODUCTION-DR-DRILL.md.',
  };
}
