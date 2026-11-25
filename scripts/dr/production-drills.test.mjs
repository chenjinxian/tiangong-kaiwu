/**
 * Unit tests for provider-neutral production DR definitions and validators.
 *
 * Run: node --test scripts/dr/production-drills.test.mjs
 *
 * No Docker, database, object store, cloud API, or live stack is touched. All
 * inputs and observations are synthetic. The two fixtures are not-run evidence
 * templates; they contain placeholders only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCTION_EVIDENCE_KIND,
  PRODUCTION_PLAN_KIND,
  PRODUCTION_SCENARIO_IDS,
  PRODUCTION_SCENARIOS,
  ProductionDrillError,
  RPO_TARGET_SECONDS,
  RTO_TARGET_SECONDS,
  assessObjectVersionRestore,
  assessPitrRestore,
  buildProductionDrillPlan,
  buildProductionEvidenceTemplate,
  containsConcreteValue,
  getProductionScenario,
  isPlaceholder,
  measureRecovery,
  measureRto,
  productionDrillSummary,
  productionScenarioCatalog,
  runProductionPreflight,
  validateAllProductionScenarios,
  validateProductionDrillPlan,
  validateProductionEvidence,
  validateProductionInputs,
  validateProductionScenario,
} from './production-drills.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const RUNNER = fileURLToPath(new URL('./drill-runner.mjs', import.meta.url));

const PITR_TARGET = '2026-11-25T00:10:00.000Z';

const PITR_TEMPLATE = JSON.parse(
  readFileSync(join(FIXTURES, 'production-pitr-evidence.not-run.json'), 'utf8'),
);
const OBJECT_TEMPLATE = JSON.parse(
  readFileSync(join(FIXTURES, 'production-object-versioning-evidence.not-run.json'), 'utf8'),
);

/* ---------------------------------------------------------------- */
/* Scenario definitions and placeholder discipline                  */
/* ---------------------------------------------------------------- */

test('both production scenarios validate and remain non-executable definitions', () => {
  const validation = validateAllProductionScenarios();
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.deepEqual(PRODUCTION_SCENARIOS.map((scenario) => scenario.id), [...PRODUCTION_SCENARIO_IDS]);
  assert.equal(PRODUCTION_SCENARIOS.length, 2);
  for (const scenario of PRODUCTION_SCENARIOS) {
    assert.equal(scenario.plane, 'production');
    assert.equal(scenario.executableByIsolatedHarness, false);
    assert.ok(scenario.inputs.length >= 8);
    assert.ok(scenario.preflight.length >= 10);
    assert.ok(scenario.steps.length >= 8);
    assert.ok(scenario.hitlGates.length >= 4);
    assert.ok(scenario.cleanup.length >= 2);
    assert.ok(scenario.rollback.length >= 2);
    assert.ok(scenario.failureCriteria.length >= 5);
    assert.equal(scenario.rpo.targetSeconds, RPO_TARGET_SECONDS);
    assert.equal(scenario.rto.targetSeconds, RTO_TARGET_SECONDS);
  }
});

test('scenario templates contain placeholders only, never concrete endpoints/credentials', () => {
  for (const scenario of PRODUCTION_SCENARIOS) {
    for (const input of scenario.inputs) {
      assert.equal(isPlaceholder(input.template), true, `${scenario.id}.${input.name}`);
      assert.equal(containsConcreteValue(input.template), false, `${scenario.id}.${input.name}`);
      assert.doesNotMatch(input.template, /:\/\//);
      assert.doesNotMatch(input.template, /@/);
    }
  }
  assert.equal(containsConcreteValue('https://example.invalid'), true);
  assert.equal(containsConcreteValue('postgres://user:pass@host/db'), true);
  assert.equal(containsConcreteValue('AKIAABCDEFGHIJKLMNOP'), true);
  assert.equal(containsConcreteValue('10.0.0.12'), true);
  assert.equal(containsConcreteValue('<PG_PRIMARY_ENDPOINT>'), false);
  assert.equal(containsConcreteValue('production-class-isolated'), false);
});

test('definition validation rejects a non-placeholder input and executable flag', () => {
  const mutated = structuredClone(getProductionScenario('postgres-pitr'));
  mutated.inputs[0].template = 'https://db.example.invalid';
  mutated.executableByIsolatedHarness = true;
  const validation = validateProductionScenario(mutated);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('PLACEHOLDER')));
  assert.ok(validation.errors.some((error) => error.includes('executableByIsolatedHarness')));
});

test('unknown scenario lookup fails closed', () => {
  assert.throws(() => getProductionScenario('drop-main-db'), ProductionDrillError);
});

/* ---------------------------------------------------------------- */
/* Inputs and plans                                                 */
/* ---------------------------------------------------------------- */

test('template inputs require placeholders; operator inputs require resolved values', () => {
  const templateInputs = Object.fromEntries(
    getProductionScenario('postgres-pitr').inputs.map((input) => [input.name, input.template]),
  );
  assert.equal(validateProductionInputs('postgres-pitr', templateInputs, { mode: 'template' }).ok, true);

  const concrete = { ...templateInputs, primaryEndpoint: 'https://db.example.invalid' };
  const concreteValidation = validateProductionInputs('postgres-pitr', concrete, { mode: 'template' });
  assert.equal(concreteValidation.ok, false);
  assert.ok(concreteValidation.errors.some((error) => error.includes('PLACEHOLDER')));

  const unresolvedOperator = validateProductionInputs('postgres-pitr', templateInputs, { mode: 'operator' });
  assert.equal(unresolvedOperator.ok, false);
  assert.ok(unresolvedOperator.errors.some((error) => error.includes('unresolved')));

  const missing = validateProductionInputs('postgres-pitr', {}, { mode: 'operator' });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.includes('missing required input')));

  const unknown = validateProductionInputs('postgres-pitr', { ...templateInputs, password: 'x' });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((error) => error.includes('unknown input')));
  assert.throws(
    () => validateProductionInputs('postgres-pitr', {}, { mode: 'execute' }),
    ProductionDrillError,
  );
});

test('production drill plans are placeholder-only and explicitly non-runnable here', () => {
  for (const scenarioId of PRODUCTION_SCENARIO_IDS) {
    const plan = buildProductionDrillPlan(scenarioId);
    assert.equal(plan.kind, PRODUCTION_PLAN_KIND);
    assert.equal(plan.scenario, scenarioId);
    assert.equal(plan.runnableHere, false);
    assert.equal(plan.hitlRequired, true);
    assert.equal(validateProductionDrillPlan(plan).ok, true);
    for (const input of plan.inputs) {
      assert.equal(isPlaceholder(input.placeholder), true);
    }
  }
  const inflated = structuredClone(buildProductionDrillPlan('postgres-pitr'));
  inflated.runnableHere = true;
  assert.equal(validateProductionDrillPlan(inflated).ok, false);
});

test('scenario catalog summary never claims execution or achieved targets', () => {
  const catalog = productionScenarioCatalog();
  assert.equal(catalog.length, 2);
  assert.ok(catalog.every((scenario) => scenario.executableByIsolatedHarness === false));
  const summary = productionDrillSummary();
  assert.equal(summary.executed, false);
  assert.equal(summary.targetsAchieved, false);
  assert.equal(summary.rpoTargetSeconds, RPO_TARGET_SECONDS);
  assert.equal(summary.rtoTargetSeconds, RTO_TARGET_SECONDS);
});

/* ---------------------------------------------------------------- */
/* Preflight failure cases                                          */
/* ---------------------------------------------------------------- */

function pitrFacts(overrides = {}) {
  return {
    walArchivingEnabled: true,
    baseBackupAvailable: true,
    requestedTargetUtc: PITR_TARGET,
    retentionWindowStartUtc: '2026-11-24T00:00:00.000Z',
    latestBaseBackupUtc: '2026-11-24T20:00:00.000Z',
    nowUtc: '2026-11-25T06:00:00.000Z',
    targetIsolated: true,
    targetIsMainStack: false,
    writersFrozen: true,
    secretSourceDeclared: true,
    pairedObjectManifestRef: 'private-paired-manifest-ref',
    expectedSchemaVersion: '20261125000000',
    capacityVerified: true,
    ...overrides,
  };
}

function objectFacts(overrides = {}) {
  return {
    versioningStatus: 'enabled',
    checksumManifestPresent: true,
    checksumAlgorithm: 'SHA-256',
    targetIsolated: true,
    targetIsMainStack: false,
    restoreTargetIsSource: false,
    writersFrozen: true,
    restoreSetDeclared: true,
    secretSourceDeclared: true,
    encryptionAtRestEnabled: true,
    capacityVerified: true,
    ...overrides,
  };
}

test('PITR preflight passes only with a resolved, retained, isolated target', () => {
  const ok = runProductionPreflight('postgres-pitr', pitrFacts());
  assert.equal(ok.ok, true, ok.errors.join('; '));

  const missingTarget = runProductionPreflight('postgres-pitr', pitrFacts({ requestedTargetUtc: undefined }));
  assert.equal(missingTarget.ok, false);
  assert.ok(missingTarget.errors.some((error) => error.startsWith('pitr-target-present')));

  const unresolvedTarget = runProductionPreflight('postgres-pitr', pitrFacts({ requestedTargetUtc: '<PITR_TARGET_UTC>' }));
  assert.equal(unresolvedTarget.ok, false);
  assert.ok(unresolvedTarget.errors.some((error) => error.startsWith('pitr-target-present')));

  const outsideRetention = runProductionPreflight(
    'postgres-pitr',
    pitrFacts({ retentionWindowStartUtc: '2026-11-25T01:00:00.000Z' }),
  );
  assert.equal(outsideRetention.ok, false);
  assert.ok(outsideRetention.errors.some((error) => error.startsWith('pitr-target-within-retention')));

  const targetInFuture = runProductionPreflight(
    'postgres-pitr',
    pitrFacts({ requestedTargetUtc: '2026-11-26T00:10:00.000Z' }),
  );
  assert.equal(targetInFuture.ok, false);
  assert.ok(targetInFuture.errors.some((error) => error.startsWith('pitr-target-within-retention')));

  const noBase = runProductionPreflight('postgres-pitr', pitrFacts({ baseBackupAvailable: false }));
  assert.equal(noBase.ok, false);
  assert.ok(noBase.errors.some((error) => error.startsWith('base-backup-available')));

  const mainStack = runProductionPreflight('postgres-pitr', pitrFacts({ targetIsMainStack: true }));
  assert.equal(mainStack.ok, false);
  assert.ok(mainStack.errors.some((error) => error.startsWith('target-not-main-stack')));

  const noWal = runProductionPreflight('postgres-pitr', pitrFacts({ walArchivingEnabled: false }));
  assert.equal(noWal.ok, false);
  assert.ok(noWal.errors.some((error) => error.startsWith('wal-archiving-enabled')));
});

test('object-store preflight refuses unversioned, suspended, in-place and non-SHA-256 stores', () => {
  const ok = runProductionPreflight('object-storage-versioning', objectFacts());
  assert.equal(ok.ok, true, ok.errors.join('; '));

  const unversioned = runProductionPreflight('object-storage-versioning', objectFacts({ versioningStatus: 'disabled' }));
  assert.equal(unversioned.ok, false);
  assert.ok(unversioned.errors.some((error) => error.startsWith('versioning-status-enabled')));

  const suspended = runProductionPreflight('object-storage-versioning', objectFacts({ versioningStatus: 'suspended' }));
  assert.equal(suspended.ok, false);
  assert.ok(suspended.errors.some((error) => error.startsWith('versioning-not-suspended')));

  const inPlace = runProductionPreflight('object-storage-versioning', objectFacts({ restoreTargetIsSource: true }));
  assert.equal(inPlace.ok, false);
  assert.ok(inPlace.errors.some((error) => error.startsWith('source-target-separated')));

  const md5 = runProductionPreflight('object-storage-versioning', objectFacts({ checksumAlgorithm: 'MD5' }));
  assert.equal(md5.ok, false);
  assert.ok(md5.errors.some((error) => error.startsWith('checksum-algorithm-sha256')));

  const mainStack = runProductionPreflight('object-storage-versioning', objectFacts({ targetIsMainStack: true }));
  assert.equal(mainStack.ok, false);
  assert.ok(mainStack.errors.some((error) => error.startsWith('target-not-main-stack')));
});

/* ---------------------------------------------------------------- */
/* Restore failure cases                                            */
/* ---------------------------------------------------------------- */

function pitrObservation(overrides = {}) {
  return {
    requestedTargetUtc: PITR_TARGET,
    baseBackupUtc: '2026-11-24T20:00:00.000Z',
    achievedRecoveryPointUtc: '2026-11-25T00:09:30.000Z',
    replayComplete: true,
    readOnly: true,
    schemaVersionObserved: '20261125000000',
    schemaVersionExpected: '20261125000000',
    ledgerVerificationPassed: true,
    pairedObjectManifestVerified: true,
    ...overrides,
  };
}

function objectObservation(overrides = {}) {
  const expectedObjects = [
    {
      name: 'imodels/<IMODEL_ID>/baseline.bim',
      versionId: 'version-baseline',
      bytes: 12,
      sha256: 'a'.repeat(64),
      versionTimestampUtc: '2026-11-25T00:08:00.000Z',
    },
    {
      name: 'imodels/<IMODEL_ID>/changesets/1.changeset',
      versionId: 'version-cs-1',
      bytes: 20,
      sha256: 'b'.repeat(64),
      versionTimestampUtc: '2026-11-25T00:09:00.000Z',
    },
  ];
  return {
    versioningStatus: 'enabled',
    checksumAlgorithm: 'sha256',
    restoreCompleted: true,
    requestedTargetUtc: PITR_TARGET,
    expectedObjects,
    actualObjects: structuredClone(expectedObjects),
    ...overrides,
  };
}

test('PITR restore fails on missing target, incomplete WAL replay and early stop', () => {
  const ok = assessPitrRestore(pitrObservation());
  assert.equal(ok.ok, true, ok.errors.map((error) => error.code).join(', '));

  const missingTarget = assessPitrRestore(pitrObservation({ requestedTargetUtc: null }));
  assert.equal(missingTarget.ok, false);
  assert.ok(missingTarget.errors.some((error) => error.code === 'pitr-target-missing'));

  const unresolvedTarget = assessPitrRestore(pitrObservation({ requestedTargetUtc: '<PITR_TARGET_UTC>' }));
  assert.equal(unresolvedTarget.ok, false);
  assert.ok(unresolvedTarget.errors.some((error) => error.code === 'pitr-target-missing'));

  const noReplay = assessPitrRestore(pitrObservation({ replayComplete: false }));
  assert.equal(noReplay.ok, false);
  assert.ok(noReplay.errors.some((error) => error.code === 'wal-replay-incomplete'));

  const early = assessPitrRestore(pitrObservation({ achievedRecoveryPointUtc: '2026-11-25T00:05:00.000Z' }));
  assert.equal(early.ok, false);
  assert.ok(early.errors.some((error) => error.code === 'pitr-target-not-reached'));

  const late = assessPitrRestore(pitrObservation({ achievedRecoveryPointUtc: '2026-11-25T00:15:00.000Z' }));
  assert.equal(late.ok, false);
  assert.ok(late.errors.some((error) => error.code === 'pitr-target-overshot'));

  const readWrite = assessPitrRestore(pitrObservation({ readOnly: false }));
  assert.equal(readWrite.ok, false);
  assert.ok(readWrite.errors.some((error) => error.code === 'restore-not-read-only'));

  const schemaDrift = assessPitrRestore(pitrObservation({ schemaVersionObserved: '20261124000000' }));
  assert.equal(schemaDrift.ok, false);
  assert.ok(schemaDrift.errors.some((error) => error.code === 'schema-version-mismatch'));

  const noPairedObjects = assessPitrRestore(pitrObservation({ pairedObjectManifestVerified: false }));
  assert.equal(noPairedObjects.ok, false);
  assert.ok(noPairedObjects.errors.some((error) => error.code === 'paired-object-verification-failed'));
});

test('object restore refuses unversioned stores and detects incomplete restores', () => {
  const ok = assessObjectVersionRestore(objectObservation());
  assert.equal(ok.ok, true, ok.errors.map((error) => error.code).join(', '));

  const unversioned = assessObjectVersionRestore(objectObservation({ versioningStatus: 'disabled' }));
  assert.equal(unversioned.ok, false);
  assert.ok(unversioned.errors.some((error) => error.code === 'object-versioning-disabled'));

  const suspended = assessObjectVersionRestore(objectObservation({ versioningStatus: 'suspended' }));
  assert.equal(suspended.ok, false);
  assert.ok(suspended.errors.some((error) => error.code === 'object-versioning-disabled'));

  const incomplete = assessObjectVersionRestore(objectObservation({ restoreCompleted: false }));
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.errors.some((error) => error.code === 'restore-incomplete'));

  const actual = objectObservation().actualObjects;
  const partial = assessObjectVersionRestore(objectObservation({ actualObjects: [actual[0]] }));
  assert.equal(partial.ok, false);
  assert.ok(partial.errors.some((error) => error.code === 'object-missing'));

  const noVersionId = assessObjectVersionRestore(objectObservation({
    expectedObjects: objectObservation().expectedObjects.map((object) => ({ ...object, versionId: null })),
  }));
  assert.equal(noVersionId.ok, false);
  assert.ok(noVersionId.errors.some((error) => error.code === 'expected-version-missing'));
});

test('object restore detects version, size and checksum mismatches', () => {
  const base = objectObservation();

  const wrongVersion = structuredClone(base);
  wrongVersion.actualObjects[1].versionId = 'version-other';
  const versionResult = assessObjectVersionRestore(wrongVersion);
  assert.equal(versionResult.ok, false);
  assert.ok(versionResult.errors.some((error) => error.code === 'object-version-mismatch'));

  const wrongSize = structuredClone(base);
  wrongSize.actualObjects[0].bytes += 1;
  const sizeResult = assessObjectVersionRestore(wrongSize);
  assert.equal(sizeResult.ok, false);
  assert.ok(sizeResult.errors.some((error) => error.code === 'object-size-mismatch'));

  const wrongChecksum = structuredClone(base);
  wrongChecksum.actualObjects[0].sha256 = 'c'.repeat(64);
  const checksumResult = assessObjectVersionRestore(wrongChecksum);
  assert.equal(checksumResult.ok, false);
  assert.ok(checksumResult.errors.some((error) => error.code === 'object-checksum-mismatch'));

  const afterTarget = structuredClone(base);
  afterTarget.actualObjects[0].versionTimestampUtc = '2026-11-25T00:20:00.000Z';
  const afterTargetResult = assessObjectVersionRestore({
    ...afterTarget,
    expectedObjects: afterTarget.expectedObjects.map((object, index) => ({
      ...object,
      versionTimestampUtc: afterTarget.actualObjects[index].versionTimestampUtc,
    })),
  });
  assert.equal(afterTargetResult.ok, false);
  assert.ok(afterTargetResult.errors.some((error) => error.code === 'object-version-after-target'));
});

/* ---------------------------------------------------------------- */
/* RPO/RTO measurement                                              */
/* ---------------------------------------------------------------- */

test('RPO combines the worse of PITR and object-store component gaps', () => {
  const measure = measureRecovery({
    requestedTargetUtc: PITR_TARGET,
    pitrRecoveredAtUtc: '2026-11-25T00:09:30.000Z',
    newestObjectVersionAtUtc: '2026-11-25T00:08:00.000Z',
  });
  assert.equal(measure.pitrGapSeconds, 30);
  assert.equal(measure.objectGapSeconds, 120);
  assert.equal(measure.combinedRpoSeconds, 120);

  const missing = measureRecovery({ requestedTargetUtc: PITR_TARGET });
  assert.equal(missing.pitrGapSeconds, null);
  assert.equal(missing.objectGapSeconds, null);
  assert.equal(missing.combinedRpoSeconds, null);

  const overshoot = measureRecovery({
    requestedTargetUtc: PITR_TARGET,
    pitrRecoveredAtUtc: '2026-11-25T00:12:00.000Z',
    newestObjectVersionAtUtc: '2026-11-25T00:11:00.000Z',
  });
  assert.equal(overshoot.pitrGapSeconds, 0);
  assert.equal(overshoot.objectGapSeconds, 0);
  assert.equal(overshoot.combinedRpoSeconds, 0);
});

test('RTO is announcement-to-verification and needs both timestamps', () => {
  assert.deepEqual(
    measureRto({ announcedAtUtc: '2026-11-25T00:15:00.000Z', verifiedAtUtc: '2026-11-25T00:45:00.000Z' }),
    { measuredSeconds: 1800 },
  );
  assert.deepEqual(measureRto({ announcedAtUtc: PITR_TARGET }), { measuredSeconds: null });
});

/* ---------------------------------------------------------------- */
/* Evidence templates, passed evidence, and claim inflation         */
/* ---------------------------------------------------------------- */

function passingPitrEvidence() {
  const evidence = structuredClone(PITR_TEMPLATE);
  evidence.status = 'passed';
  evidence.drillId = 'drill-prod-001';
  evidence.operator = 'data-owner';
  evidence.witness = 'sre-witness';
  evidence.startedAtUtc = '2026-11-25T00:00:00.000Z';
  evidence.finishedAtUtc = '2026-11-25T00:40:00.000Z';
  evidence.environment = {
    provider: 'managed-postgres',
    region: 'region-a',
    environmentClass: 'production-class-isolated',
    isolated: true,
    isMainStack: false,
  };
  evidence.hitl = {
    drillWindowApproved: true,
    restoreApproved: true,
    cleanupApproved: true,
    approvedBy: 'data-owner',
    witness: 'sre-witness',
    approvedAtUtc: '2026-11-24T23:00:00.000Z',
  };
  evidence.preflight = getProductionScenario('postgres-pitr').preflight.map((check) => ({
    id: check.id, ok: true, detail: 'synthetic test value',
  }));
  evidence.restore = {
    backupRepositoryRef: 'private-backup-ref',
    baseBackupUtc: '2026-11-24T20:00:00.000Z',
    requestedTargetUtc: PITR_TARGET,
    achievedRecoveryPointUtc: '2026-11-25T00:09:30.000Z',
    walReplayComplete: true,
    readOnly: true,
    pairedObjectManifestRef: 'private-object-manifest-ref',
  };
  evidence.verification = {
    passed: true,
    schemaVersionObserved: '20261125000000',
    schemaVersionExpected: '20261125000000',
    ledgerVerificationPassed: true,
    crossStoreReconciliationPassed: true,
    pitrVerified: true,
    checksumsVerified: null,
    objectVersionIdsVerified: null,
    errors: [],
  };
  evidence.rpo = {
    ...evidence.rpo,
    requestedTargetUtc: PITR_TARGET,
    lastAckedEditUtc: '2026-11-25T00:09:00.000Z',
    achievedRecoveryPointUtc: '2026-11-25T00:09:30.000Z',
    measuredSeconds: 30,
    withinTargetThisRun: true,
    evidenceComplete: true,
    targetAchieved: true,
  };
  evidence.rto = {
    ...evidence.rto,
    announcedAtUtc: '2026-11-25T00:15:00.000Z',
    verifiedAtUtc: '2026-11-25T00:45:00.000Z',
    measuredSeconds: 1800,
    withinTargetThisRun: true,
    evidenceComplete: true,
    targetAchieved: true,
  };
  evidence.claims = {
    ...evidence.claims,
    pitrProven: true,
    rpoTargetAchieved: true,
    rtoTargetAchieved: true,
  };
  evidence.cleanup = { performed: true, residualResources: [], evidenceRef: 'private-evidence-ref' };
  evidence.rollback = { tested: true, notes: 'no endpoint switch was performed' };
  evidence.evidenceRefs = ['private-evidence-ref'];
  return evidence;
}

function passingObjectEvidence() {
  const evidence = structuredClone(OBJECT_TEMPLATE);
  evidence.status = 'passed';
  evidence.drillId = 'drill-prod-002';
  evidence.operator = 'data-owner';
  evidence.witness = 'sre-witness';
  evidence.startedAtUtc = '2026-11-25T00:00:00.000Z';
  evidence.finishedAtUtc = '2026-11-25T00:40:00.000Z';
  evidence.environment = {
    provider: 'managed-object-store',
    region: 'region-a',
    environmentClass: 'production-class-isolated',
    isolated: true,
    isMainStack: false,
  };
  evidence.hitl = {
    drillWindowApproved: true,
    restoreApproved: true,
    cleanupApproved: true,
    approvedBy: 'data-owner',
    witness: 'sre-witness',
    approvedAtUtc: '2026-11-24T23:00:00.000Z',
  };
  evidence.preflight = getProductionScenario('object-storage-versioning').preflight.map((check) => ({
    id: check.id, ok: true, detail: 'synthetic test value',
  }));
  evidence.restore = {
    sourceBucket: 'source-container-ref',
    restoreTargetBucket: 'restore-container-ref',
    restoreSetManifestRef: 'private-object-manifest-ref',
    versioningStatus: 'enabled',
    restoreCompleted: true,
    objectsExpected: 4,
    objectsRestored: 4,
    newestRestoredVersionUtc: '2026-11-25T00:08:00.000Z',
  };
  evidence.verification = {
    passed: true,
    schemaVersionObserved: null,
    schemaVersionExpected: null,
    ledgerVerificationPassed: null,
    crossStoreReconciliationPassed: true,
    pitrVerified: null,
    checksumsVerified: true,
    objectVersionIdsVerified: true,
    errors: [],
  };
  evidence.rpo = {
    ...evidence.rpo,
    requestedTargetUtc: PITR_TARGET,
    newestUsedObjectVersionUtc: '2026-11-25T00:08:00.000Z',
    measuredSeconds: 120,
    withinTargetThisRun: true,
    evidenceComplete: true,
    targetAchieved: true,
  };
  evidence.rto = {
    ...evidence.rto,
    announcedAtUtc: '2026-11-25T00:15:00.000Z',
    verifiedAtUtc: '2026-11-25T00:45:00.000Z',
    measuredSeconds: 1800,
    withinTargetThisRun: true,
    evidenceComplete: true,
    targetAchieved: true,
  };
  evidence.claims = {
    ...evidence.claims,
    objectVersioningProven: true,
    rpoTargetAchieved: true,
    rtoTargetAchieved: true,
  };
  evidence.cleanup = { performed: true, residualResources: [], evidenceRef: 'private-evidence-ref' };
  evidence.rollback = { tested: true, notes: 'no endpoint switch was performed' };
  evidence.evidenceRefs = ['private-evidence-ref'];
  return evidence;
}

test('not-run fixtures match generated templates and validate without claims', () => {
  assert.deepEqual(PITR_TEMPLATE, buildProductionEvidenceTemplate('postgres-pitr'));
  assert.deepEqual(OBJECT_TEMPLATE, buildProductionEvidenceTemplate('object-storage-versioning'));
  for (const evidence of [PITR_TEMPLATE, OBJECT_TEMPLATE]) {
    assert.equal(evidence.kind, PRODUCTION_EVIDENCE_KIND);
    assert.equal(evidence.status, 'not-run');
    assert.equal(validateProductionEvidence(evidence).ok, true);
    for (const claim of Object.values(evidence.claims)) assert.equal(claim, false);
  }
});

test('a complete synthetic passing drill validates, including target claims', () => {
  const pitrValidation = validateProductionEvidence(passingPitrEvidence());
  assert.equal(pitrValidation.ok, true, pitrValidation.errors.join('; '));
  const objectValidation = validateProductionEvidence(passingObjectEvidence());
  assert.equal(objectValidation.ok, true, objectValidation.errors.join('; '));
});

test('evidence cannot claim targets on a non-passed drill', () => {
  for (const template of [structuredClone(PITR_TEMPLATE), structuredClone(OBJECT_TEMPLATE)]) {
    template.claims.rpoTargetAchieved = true;
    const validation = validateProductionEvidence(template);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes('rpoTargetAchieved')));
  }
});

test('evidence cannot inflate combined production DR from one scenario', () => {
  const evidence = passingPitrEvidence();
  evidence.claims.productionDisasterRecoveryProven = true;
  const validation = validateProductionEvidence(evidence);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('productionDisasterRecoveryProven')));
});

test('passed evidence needs complete verification, cleanup and measurements', () => {
  const noCleanup = passingPitrEvidence();
  noCleanup.cleanup.performed = false;
  assert.equal(validateProductionEvidence(noCleanup).ok, false);

  const noSchemaExpected = passingPitrEvidence();
  noSchemaExpected.verification.schemaVersionExpected = null;
  assert.equal(validateProductionEvidence(noSchemaExpected).ok, false);

  const incompleteReplay = passingPitrEvidence();
  incompleteReplay.restore.walReplayComplete = false;
  assert.equal(validateProductionEvidence(incompleteReplay).ok, false);

  const noPitrVerification = passingPitrEvidence();
  noPitrVerification.verification.pitrVerified = false;
  const pitrClaimValidation = validateProductionEvidence(noPitrVerification);
  assert.equal(pitrClaimValidation.ok, false);
  assert.ok(pitrClaimValidation.errors.some((error) => error.includes('pitrVerified')));

  const inflatedRto = passingPitrEvidence();
  inflatedRto.rto.measuredSeconds = 10;
  assert.equal(validateProductionEvidence(inflatedRto).ok, false);

  const inflatedRpo = passingPitrEvidence();
  inflatedRpo.rpo.measuredSeconds = 400;
  assert.equal(validateProductionEvidence(inflatedRpo).ok, false);

  const noLastAcked = passingPitrEvidence();
  noLastAcked.rpo.lastAckedEditUtc = null;
  assert.equal(validateProductionEvidence(noLastAcked).ok, false);

  const unresolved = passingPitrEvidence();
  unresolved.environment.provider = '<PROVIDER>';
  assert.equal(validateProductionEvidence(unresolved).ok, false);

  const noEvidenceRefs = passingPitrEvidence();
  noEvidenceRefs.evidenceRefs = [];
  assert.equal(validateProductionEvidence(noEvidenceRefs).ok, false);

  const unresolvedEvidenceRef = passingPitrEvidence();
  unresolvedEvidenceRef.evidenceRefs = ['<EVIDENCE_VAULT_REF>'];
  assert.equal(validateProductionEvidence(unresolvedEvidenceRef).ok, false);
});

test('object evidence cannot pass on an unversioned or incomplete restore', () => {
  const unversioned = passingObjectEvidence();
  unversioned.restore.versioningStatus = 'suspended';
  assert.equal(validateProductionEvidence(unversioned).ok, false);

  const incomplete = passingObjectEvidence();
  incomplete.restore.objectsRestored = 3;
  assert.equal(validateProductionEvidence(incomplete).ok, false);

  const unverifiedChecksums = passingObjectEvidence();
  unverifiedChecksums.verification.checksumsVerified = false;
  assert.equal(validateProductionEvidence(unverifiedChecksums).ok, false);

  const wrongScenarioClaim = passingObjectEvidence();
  wrongScenarioClaim.claims.pitrProven = true;
  assert.equal(validateProductionEvidence(wrongScenarioClaim).ok, false);

  const inflatedRpo = passingObjectEvidence();
  inflatedRpo.rpo.measuredSeconds = 0; // timestamps imply 120s
  assert.equal(validateProductionEvidence(inflatedRpo).ok, false);

  const afterTarget = passingObjectEvidence();
  afterTarget.restore.newestRestoredVersionUtc = '2026-11-25T00:20:00.000Z';
  afterTarget.rpo.newestUsedObjectVersionUtc = '2026-11-25T00:20:00.000Z';
  afterTarget.rpo.measuredSeconds = 0;
  const afterTargetValidation = validateProductionEvidence(afterTarget);
  assert.equal(afterTargetValidation.ok, false);
  assert.ok(afterTargetValidation.errors.some((error) => error.includes('object-version-after-target')));
});

test('the passing-evidence helpers are synthetic and are not repository artifacts', () => {
  // Guard against accidentally committing a "passed" evidence fixture: the
  // fixture files on disk must remain not-run templates.
  assert.equal(PITR_TEMPLATE.status, 'not-run');
  assert.equal(OBJECT_TEMPLATE.status, 'not-run');
  assert.equal(passingPitrEvidence().status, 'passed');
  assert.equal(validateProductionEvidence({
    ...passingPitrEvidence(),
    drillId: null,
  }).ok, false);
});

/* ---------------------------------------------------------------- */
/* Isolated harness integration (no Docker)                         */
/* ---------------------------------------------------------------- */

function runRunner(args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
}

test('runner scenarios command exposes isolated and production catalogs without Docker', () => {
  const result = runRunner(['scenarios', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const catalog = JSON.parse(result.stdout);
  assert.equal(catalog.isolated.scenarios.length >= 5, true);
  assert.ok(catalog.isolated.scenarios.some((scenario) => scenario.id === 'S3' && scenario.destructive === true));
  assert.ok(catalog.isolated.scenarios.some((scenario) => scenario.id === 'S4' && scenario.executedInPhaseA === false));
  assert.equal(catalog.production.harnessExecutable, false);
  assert.deepEqual(
    catalog.production.scenarios.map((scenario) => scenario.id),
    [...PRODUCTION_SCENARIO_IDS],
  );
});

test('runner plan command prints a non-runnable placeholder plan', () => {
  const result = runRunner(['plan', '--scenario', 'postgres-pitr', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.kind, PRODUCTION_PLAN_KIND);
  assert.equal(plan.scenario, 'postgres-pitr');
  assert.equal(plan.runnableHere, false);
  assert.ok(plan.inputs.every((input) => isPlaceholder(input.placeholder)));

  const unknown = runRunner(['plan', '--scenario', 'delete-sentinel-blob']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /production drill scenario|scenario for plan/);
});
