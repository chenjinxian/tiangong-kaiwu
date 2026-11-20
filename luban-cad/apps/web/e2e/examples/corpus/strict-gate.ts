/**
 * Opt-in four-dimension strict gate for Onshape scenario replay (2026-11-21).
 *
 * The legacy replay runner asserts scenario feature-type order, persisted tree
 * order, zero feature statuses and sorted body volumes. The strict definition
 * (plan §1.2 / §11 / A6) additionally requires:
 *
 * - `featureTree`: tree types/order/names (and status=0) match the Onshape oracle;
 * - `sketches`: sketch constraint multiset + solver DOF/status match the oracle;
 * - `bodies`: per-body pairing by volume+centroid; body count exact; volume
 *   relative tolerance 0.5% by default (<=1% only when the oracle body carries a
 *   recorded `hardToleranceReason`); centroid distance <= 0.05 mm;
 * - `persistence`: push + cold reopen and undo/redo, supplied by the runner as
 *   interface hooks with real data (never fabricated here).
 *
 * Every dimension reports `pass` / `fail` / `not-checked` with explicit reasons.
 * Missing oracle data is never treated as a pass: `evaluateStrictGate` only returns
 * `ok: true` when all four dimensions pass.
 */
import enPartStudio from '../../../src/common/i18n/locales/en/part-studio.json' with { type: 'json' };
import { featureDisplayType } from '../../../src/modules/part-studio/internal/feature-naming.js';
import { compareBodies, type BodyOracle, type BodySample } from './compare-bodies.js';

export type StrictGateMode = 'four-dim';
export type StrictDimensionName = 'featureTree' | 'sketches' | 'bodies' | 'persistence';
export type StrictDimensionStatus = 'pass' | 'fail' | 'not-checked';

export interface StrictDimensionResult {
  dimension: StrictDimensionName;
  /** True only when `status === 'pass'`; `not-checked` is never a pass. */
  ok: boolean;
  status: StrictDimensionStatus;
  reasons: string[];
  details?: Record<string, unknown>;
}

/** Env/options parser: only the documented `four-dim` value enables the gate. */
export function parseStrictGateMode(value: string | undefined): StrictGateMode | undefined {
  return value === 'four-dim' ? 'four-dim' : undefined;
}

export function formatStrictDimension(result: StrictDimensionResult): string {
  return `${result.dimension}: ${result.status}${result.reasons.length > 0 ? ` — ${result.reasons.join('; ')}` : ''}`;
}

function result(
  dimension: StrictDimensionName,
  status: StrictDimensionStatus,
  reasons: string[] = [],
  details?: Record<string, unknown>,
): StrictDimensionResult {
  return { dimension, ok: status === 'pass', status, reasons, ...(details !== undefined ? { details } : {}) };
}

function pass(dimension: StrictDimensionName, details?: Record<string, unknown>): StrictDimensionResult {
  return result(dimension, 'pass', [], details);
}

function fail(dimension: StrictDimensionName, reasons: string[], details?: Record<string, unknown>): StrictDimensionResult {
  return result(dimension, 'fail', reasons.length > 0 ? reasons : ['unknown failure'], details);
}

function notChecked(dimension: StrictDimensionName, reasons: string[], details?: Record<string, unknown>): StrictDimensionResult {
  return result(dimension, 'not-checked', reasons.length > 0 ? reasons : ['oracle data unavailable'], details);
}

// ---------------------------------------------------------------------------
// Dimension 1: feature tree types / order / names
// ---------------------------------------------------------------------------

export interface FeatureTreeRowSample {
  featureType: string;
  /** User-renamed feature name persisted on the row (`FeatureTreeEntry.name`). */
  name?: string;
  status?: number;
  suppressed?: boolean;
  params?: unknown;
  /** Backend tree order key; product tree display order is ascending orderKey. */
  orderKey?: number;
}

export interface ExpectedFeatureTreeEntry {
  /** Scenario/Onshape logical feature type (e.g. `extrude`). */
  type?: string;
  /** Onshape feature name (e.g. `Sketch 1`, or a custom name). */
  name?: string;
}

/** Plain strings are names; object entries may carry type and/or name. */
export type ExpectedFeatureTree = readonly (string | ExpectedFeatureTreeEntry)[];

export interface FeatureTreeGateOptions {
  /**
   * Optional caller-specific type aliases. Default is empty: the gate compares
   * product `featureType` values (including `faceExtrude`) exactly. Callers that
   * deliberately treat a product type as a scenario type must opt in explicitly.
   */
  typeAliases?: Readonly<Record<string, string>>;
  /** Require every actual row to have status 0 (default true). */
  requireZeroStatus?: boolean;
}

/** English tree labels, same source as the product i18n (`tree.featureTypes`). */
const FEATURE_TYPE_LABELS: Readonly<Record<string, string>> = enPartStudio.tree.featureTypes;

/**
 * Same display type and label as `mapFeatureEntries`/`featureDisplayType`:
 * circular body patterns project to `patternCircular`; every other feature keeps
 * its `featureType`. Labels come from the English product locale; unknown types
 * fall back to the raw feature type (product i18n fallback).
 */
function displayNameParts(row: FeatureTreeRowSample): { key: string; label: string } {
  const displayType = featureDisplayType(row);
  return { key: displayType, label: FEATURE_TYPE_LABELS[displayType] ?? displayType };
}

/**
 * Compare persisted tree rows against an Onshape tree oracle.
 *
 * Display order and naming reproduce the product (`mapFeatureEntries`): rows are
 * sorted ascending by `orderKey` when every row carries one, names count per
 * `featureDisplayType`, a non-empty persisted `name` wins, and otherwise the
 * English product label + per-display-type sequence is used.
 */
export function compareFeatureTree(
  actual: readonly FeatureTreeRowSample[],
  expected: ExpectedFeatureTree | undefined,
  options: FeatureTreeGateOptions = {},
  expectedError?: string,
): StrictDimensionResult {
  if (expectedError !== undefined) return fail('featureTree', [expectedError]);
  if (expected === undefined || expected.length === 0)
    return notChecked('featureTree', ['scenario has no feature-tree oracle (expected.featureTree)']);

  const requireZeroStatus = options.requireZeroStatus ?? true;
  const aliases = options.typeAliases ?? {};
  const orderedByKey = actual.length > 0
    && actual.every((row) => typeof row.orderKey === 'number' && Number.isFinite(row.orderKey));
  const orderedActual = orderedByKey
    ? [...actual].sort((a, b) => (a.orderKey as number) - (b.orderKey as number))
    : [...actual];
  const reasons: string[] = [];
  const counters = new Map<string, number>();
  const rows = Math.max(orderedActual.length, expected.length);

  if (orderedActual.length !== expected.length)
    reasons.push(`tree length mismatch: actual=${orderedActual.length} expected=${expected.length}`);

  for (let index = 0; index < rows; index++) {
    const row = orderedActual[index];
    const exp = expected[index];
    if (row === undefined) {
      reasons.push(`tree[${index}]: missing actual row`);
      continue;
    }
    if (exp === undefined) {
      reasons.push(`tree[${index}]: unexpected actual row ${row.featureType}`);
      continue;
    }
    const expRecord = typeof exp === 'string' ? undefined : exp;
    if (typeof exp !== 'string' && expRecord === undefined) {
      reasons.push(`tree[${index}]: invalid expected entry`);
      continue;
    }
    const expName = typeof exp === 'string' ? exp : exp.name;
    const expType = expRecord?.type;
    // Counters advance for every actual row, even when the oracle entry omits a name,
    // so later default names keep the same sequence as the product tree.
    const parts = displayNameParts(row);
    const seq = (counters.get(parts.key) ?? 0) + 1;
    counters.set(parts.key, seq);
    const actualName = row.name !== undefined && row.name.trim() !== ''
      ? row.name
      : `${parts.label} ${seq}`;
    if (expName !== undefined && (typeof expName !== 'string' || expName.length === 0)) {
      reasons.push(`tree[${index}]: invalid expected name`);
    } else if (expName !== undefined && actualName !== expName) {
      reasons.push(`tree[${index}]: name actual="${actualName}" expected="${expName}"`);
    }
    if (expType !== undefined) {
      if (typeof expType !== 'string' || expType.length === 0) {
        reasons.push(`tree[${index}]: invalid expected type`);
      } else {
        const actualType = aliases[row.featureType] ?? row.featureType;
        if (actualType !== expType)
          reasons.push(`tree[${index}]: type actual="${actualType}" expected="${expType}"`);
      }
    }
    if (requireZeroStatus && row.status !== undefined && row.status !== 0)
      reasons.push(`tree[${index}]: ${row.featureType} status=${row.status} (strict requires 0)`);
  }

  const details = {
    actualLength: orderedActual.length,
    expectedLength: expected.length,
    requireZeroStatus,
    orderedByOrderKey: orderedByKey,
  };
  return reasons.length > 0 ? fail('featureTree', reasons, details) : pass('featureTree', details);
}

// ---------------------------------------------------------------------------
// Dimension 2: sketch constraints + DOF/status
// ---------------------------------------------------------------------------

export interface SketchConstraintSample {
  kind: string;
  driven?: boolean;
}

export interface SketchActualSample {
  /** Scenario sketch feature name (the oracle key). */
  sketch: string;
  constraints: readonly SketchConstraintSample[];
  dof: number;
  status: string;
  failedConstraintIds?: readonly number[];
}

export interface SketchOracleSample {
  /** Scenario sketch feature name (e.g. `Sketch 1`). */
  sketch: string;
  /** Expected constraint kinds (multiset, order-independent). */
  constraintKinds?: readonly string[];
  /** Expected visible constraint count (checked in addition when provided). */
  constraintCount?: number;
  dof?: number;
  /** Expected solver status (`ok`, `underconstrained`, `conflicting`, `failed`). */
  status?: string;
}

export type SketchOracle = readonly SketchOracleSample[];

function constraintCounts(constraints: readonly SketchConstraintSample[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const constraint of constraints)
    counts.set(constraint.kind, (counts.get(constraint.kind) ?? 0) + 1);
  return counts;
}

function compareConstraintKinds(
  actual: readonly SketchConstraintSample[],
  expected: readonly string[],
): string[] {
  const reasons: string[] = [];
  const actualCounts = constraintCounts(actual);
  const expectedCounts = new Map<string, number>();
  for (const kind of expected) expectedCounts.set(kind, (expectedCounts.get(kind) ?? 0) + 1);
  // 用 Array.from 收集键集：e2e tsconfig 之外（如编辑器默认 target）不支持
  // Map/Set 迭代器展开，避免同一文件在不同 target 下出现伪红。
  const kinds = new Set<string>(Array.from(actualCounts.keys()).concat(Array.from(expectedCounts.keys())));
  for (const kind of Array.from(kinds).sort()) {
    const actualCount = actualCounts.get(kind) ?? 0;
    const expectedCount = expectedCounts.get(kind) ?? 0;
    if (actualCount !== expectedCount)
      reasons.push(`constraint "${kind}" count actual=${actualCount} expected=${expectedCount}`);
  }
  return reasons;
}

/**
 * Compare per-sketch constraint/DOF/status against an oracle. The oracle is
 * optional: absent/empty returns `not-checked`. Partial oracle entries (missing
 * DOF/status/constraints) also return `not-checked` after evaluating every field
 * that is present; a mismatch in any present field is a `fail`.
 */
export function compareSketches(
  actual: readonly SketchActualSample[],
  oracle: SketchOracle | undefined,
  oracleError?: string,
): StrictDimensionResult {
  if (oracleError !== undefined) return fail('sketches', [oracleError]);
  if (oracle === undefined || oracle.length === 0)
    return notChecked('sketches', ['scenario has no sketch constraint/DOF oracle (expected.sketches)']);

  const reasons: string[] = [];
  const missing: string[] = [];
  const actualBySketch = new Map(actual.map((sample) => [sample.sketch, sample]));
  const covered = new Set<string>();

  for (const entry of oracle) {
    if (typeof entry.sketch !== 'string' || entry.sketch.length === 0) {
      reasons.push('sketch oracle entry has no sketch name');
      continue;
    }
    const sample = actualBySketch.get(entry.sketch);
    if (sample === undefined) {
      reasons.push(`sketch "${entry.sketch}": actual sketch not read`);
      continue;
    }
    covered.add(entry.sketch);
    let fields = 0;
    if (entry.constraintKinds !== undefined) {
      fields++;
      reasons.push(...compareConstraintKinds(sample.constraints, entry.constraintKinds)
        .map((reason) => `sketch "${entry.sketch}": ${reason}`));
    }
    if (entry.constraintCount !== undefined) {
      fields++;
      if (!Number.isInteger(entry.constraintCount) || entry.constraintCount < 0) {
        reasons.push(`sketch "${entry.sketch}": invalid oracle constraintCount`);
      } else if (sample.constraints.length !== entry.constraintCount) {
        reasons.push(
          `sketch "${entry.sketch}": constraint count actual=${sample.constraints.length} expected=${entry.constraintCount}`,
        );
      }
    }
    if (entry.dof !== undefined) {
      fields++;
      if (!Number.isInteger(entry.dof) || entry.dof < 0) {
        reasons.push(`sketch "${entry.sketch}": invalid oracle dof`);
      } else if (sample.dof !== entry.dof) {
        reasons.push(`sketch "${entry.sketch}": dof actual=${sample.dof} expected=${entry.dof}`);
      }
    }
    if (entry.status !== undefined) {
      fields++;
      if (typeof entry.status !== 'string') {
        reasons.push(`sketch "${entry.sketch}": invalid oracle status`);
      } else if (sample.status !== entry.status) {
        reasons.push(`sketch "${entry.sketch}": status actual="${sample.status}" expected="${entry.status}"`);
      }
    }
    if (fields === 0) missing.push(`sketch "${entry.sketch}": oracle has no constraint/DOF/status fields`);
    for (const field of ['constraintKinds', 'dof', 'status'] as const) {
      if (entry[field] === undefined) missing.push(`sketch "${entry.sketch}": oracle lacks ${field}`);
    }
  }

  for (const sample of actual) {
    if (!covered.has(sample.sketch)) missing.push(`sketch "${sample.sketch}": not covered by oracle`);
  }

  const details = { oracleSketches: oracle.length, actualSketches: actual.length };
  if (reasons.length > 0) return fail('sketches', reasons, details);
  if (missing.length > 0) return notChecked('sketches', missing, details);
  return pass('sketches', details);
}

// ---------------------------------------------------------------------------
// Dimension 3: per-body volume + centroid pairing
// ---------------------------------------------------------------------------

export interface StrictBodyOracle extends BodyOracle {
  /**
   * Recorded reason allowing this body the hard 1% volume tolerance instead of
   * the default 0.5%. Empty/absent keeps the soft tolerance.
   */
  hardToleranceReason?: string;
}

export interface BodiesGateOptions {
  /** Relative volume tolerance (default 0.5%). */
  softVolumeTolerance?: number;
  /** Hard relative volume tolerance allowed only with `hardToleranceReason` (default 1%). */
  hardVolumeTolerance?: number;
  /** Absolute centroid distance tolerance in mm (default 0.05). */
  centroidToleranceMm?: number;
}

/**
 * Compare reopened bodies per body (never a collapsed total). Pairing is delegated
 * to `compareBodies` (centroid-nearest one-to-one when all centroids exist, else
 * descending-volume fallback). Body count must match exactly. A body whose volume
 * is within the hard 1% but outside the default 0.5% passes only when its oracle
 * entry carries a `hardToleranceReason`.
 *
 * If expected centroids are missing, volume checks still run but the dimension is
 * `not-checked` (strict requires centroid <= 0.05 mm); it never passes silently.
 */
export function compareStrictBodies(
  actual: readonly BodySample[],
  expected: readonly StrictBodyOracle[] | undefined,
  options: BodiesGateOptions = {},
  expectedError?: string,
): StrictDimensionResult {
  if (expectedError !== undefined) return fail('bodies', [expectedError]);
  if (expected === undefined || expected.length === 0)
    return notChecked('bodies', ['scenario has no expected body oracle (expected.bodies)']);

  const soft = options.softVolumeTolerance ?? 0.005;
  const hard = options.hardVolumeTolerance ?? 0.01;
  const centroidToleranceMm = options.centroidToleranceMm ?? 0.05;
  if (!(soft > 0) || !(hard >= soft) || !(centroidToleranceMm > 0))
    return fail('bodies', [
      `invalid tolerance options: soft=${soft} hard=${hard} centroid=${centroidToleranceMm}`,
    ]);

  const invalid = expected
    .map((body, index) => ({ body, index }))
    .filter(({ body }) => !Number.isFinite(body.volumeMm3) || body.volumeMm3 <= 0);
  if (invalid.length > 0)
    return fail('bodies', invalid.map(({ body, index }) =>
      `expected body[${index}] has invalid volume ${String(body.volumeMm3)}`));

  const reasons: string[] = [];
  const details: Record<string, unknown> = {
    actualBodyCount: actual.length,
    expectedBodyCount: expected.length,
    softVolumeTolerance: soft,
    hardVolumeTolerance: hard,
    centroidToleranceMm,
  };
  if (actual.length !== expected.length)
    reasons.push(`body count actual=${actual.length} expected=${expected.length}`);

  // Pairing uses the most permissive allowed volume tolerance; per-pair tolerance
  // is re-evaluated below so the 0.5%/1%-with-reason rule stays explicit.
  const pairing = compareBodies(actual, expected, {
    volumeTolerance: hard,
    centroidToleranceMm,
  });
  let missingCentroid = false;
  const pairedActual = new Set<number>();
  const pairedExpected = new Set<number>();
  const pairDetails: Array<Record<string, unknown>> = [];
  for (const pair of pairing.pairs) {
    const sample = actual[pair.actualIndex]!;
    const oracle = expected[pair.expectedIndex]!;
    pairedActual.add(pair.actualIndex);
    pairedExpected.add(pair.expectedIndex);
    const tolerance = oracle.hardToleranceReason !== undefined && oracle.hardToleranceReason.trim() !== ''
      ? hard
      : soft;
    if (pair.volumeRelDiff > tolerance) {
      reasons.push(
        `body[${pair.actualIndex}]->expected[${pair.expectedIndex}]: volume ` +
        `${sample.volume.toFixed(3)} vs ${oracle.volumeMm3} ` +
        `(rel=${(pair.volumeRelDiff * 100).toFixed(3)}% > ${(tolerance * 100).toFixed(3)}%` +
        `${tolerance === hard ? `; hard tolerance reason: ${oracle.hardToleranceReason}` : ''})`,
      );
    }
    if (sample.centroid !== undefined && oracle.centroid !== undefined) {
      const distance = Math.hypot(
        sample.centroid[0] - oracle.centroid[0],
        sample.centroid[1] - oracle.centroid[1],
        sample.centroid[2] - oracle.centroid[2],
      );
      if (distance > centroidToleranceMm) {
        reasons.push(
          `body[${pair.actualIndex}]->expected[${pair.expectedIndex}]: centroid distance ` +
          `${distance.toFixed(4)} mm > ${centroidToleranceMm} mm`,
        );
      }
      pairDetails.push({
        actualIndex: pair.actualIndex,
        expectedIndex: pair.expectedIndex,
        volumeRelDiff: pair.volumeRelDiff,
        tolerance,
        centroidDistance: distance,
      });
    } else {
      missingCentroid = true;
      pairDetails.push({
        actualIndex: pair.actualIndex,
        expectedIndex: pair.expectedIndex,
        volumeRelDiff: pair.volumeRelDiff,
        tolerance,
      });
    }
  }
  for (let index = 0; index < actual.length; index++) {
    if (!pairedActual.has(index)) reasons.push(`actual body[${index}] unmatched`);
  }
  for (let index = 0; index < expected.length; index++) {
    if (!pairedExpected.has(index)) reasons.push(`expected body[${index}] unmatched`);
  }
  details.pairs = pairDetails;

  if (reasons.length > 0) return fail('bodies', reasons, details);
  if (missingCentroid)
    return notChecked('bodies', [
      'expected body centroid oracle missing; strict requires centroid <= ' +
      `${centroidToleranceMm} mm (volume checks passed, centroid not checked)`,
    ], details);
  return pass('bodies', details);
}

// ---------------------------------------------------------------------------
// Dimension 4: persistence/reopen + undo/redo (runner-supplied hooks)
// ---------------------------------------------------------------------------

/**
 * Runner-supplied checks. The gate itself never fabricates persistence or
 * undo/redo results: without both hooks the dimension is `not-checked`.
 */
export interface StrictGateHooks {
  /** Push + cold reopen check, performed by the runner with real RPC data. */
  persistence?: () => StrictDimensionResult | Promise<StrictDimensionResult>;
  /** Undo/redo check, performed by the runner with real UI/RPC data. */
  undoRedo?: () => StrictDimensionResult | Promise<StrictDimensionResult>;
}

async function runHook(
  label: string,
  hook: (() => StrictDimensionResult | Promise<StrictDimensionResult>) | undefined,
): Promise<StrictDimensionResult | undefined> {
  if (hook === undefined) return undefined;
  try {
    return await hook();
  } catch (error) {
    return fail('persistence', [
      `${label} hook threw: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

async function evaluatePersistence(hooks: StrictGateHooks | undefined): Promise<StrictDimensionResult> {
  const persistence = await runHook('persistence/reopen', hooks?.persistence);
  const undoRedo = await runHook('undo/redo', hooks?.undoRedo);
  const reasons: string[] = [];
  const missing: string[] = [];
  if (persistence === undefined) missing.push('persistence/reopen hook not provided');
  if (undoRedo === undefined) missing.push('undo/redo hook not provided');

  for (const [label, check] of [['persistence/reopen', persistence], ['undo/redo', undoRedo]] as const) {
    if (check === undefined) continue;
    if (check.status === 'fail') reasons.push(`${label}: ${check.reasons.join('; ')}`);
  }
  if (reasons.length > 0) return fail('persistence', reasons);
  for (const [label, check] of [['persistence/reopen', persistence], ['undo/redo', undoRedo]] as const) {
    if (check?.status === 'not-checked')
      missing.push(`${label}: ${check.reasons.join('; ')}`);
  }
  if (missing.length > 0) return notChecked('persistence', missing);
  return pass('persistence', { persistenceChecked: true, undoRedoChecked: true });
}

// ---------------------------------------------------------------------------
// Gate orchestrator
// ---------------------------------------------------------------------------

export interface StrictGateInput {
  featureTree?: {
    actual: readonly FeatureTreeRowSample[];
    expected?: ExpectedFeatureTree;
    options?: FeatureTreeGateOptions;
    expectedError?: string;
  };
  sketches?: {
    actual: readonly SketchActualSample[];
    oracle?: SketchOracle;
    oracleError?: string;
  };
  bodies?: {
    actual: readonly BodySample[];
    expected?: readonly StrictBodyOracle[];
    options?: BodiesGateOptions;
    expectedError?: string;
  };
  /**
   * Approximate replay steps counted by the runner. Strict forbids any: a non-zero
   * count fails the `bodies` (geometry) dimension, even if volumes match.
   */
  approximateSteps?: number;
  hooks?: StrictGateHooks;
}

export interface StrictGateReport {
  gate: StrictGateMode;
  /** True only when all four dimensions report `pass`. */
  ok: boolean;
  dimensions: StrictDimensionResult[];
  byDimension: Record<StrictDimensionName, StrictDimensionResult>;
  failures: string[];
  notChecked: string[];
}

/** Evaluate the four dimensions. Hooks are awaited; absent data is `not-checked`. */
export async function evaluateStrictGate(input: StrictGateInput): Promise<StrictGateReport> {
  const featureTree = input.featureTree !== undefined
    ? compareFeatureTree(
      input.featureTree.actual,
      input.featureTree.expected,
      input.featureTree.options,
      input.featureTree.expectedError,
    )
    : notChecked('featureTree', ['feature-tree dimension input not provided']);
  const sketches = input.sketches !== undefined
    ? compareSketches(input.sketches.actual, input.sketches.oracle, input.sketches.oracleError)
    : notChecked('sketches', ['sketch constraint/DOF dimension input not provided']);
  const bodiesBase = input.bodies !== undefined
    ? compareStrictBodies(
      input.bodies.actual,
      input.bodies.expected,
      input.bodies.options,
      input.bodies.expectedError,
    )
    : notChecked('bodies', ['body dimension input not provided']);
  const approximateSteps = input.approximateSteps ?? 0;
  const bodies: StrictDimensionResult = !Number.isInteger(approximateSteps) || approximateSteps < 0
    ? fail('bodies', [`invalid approximateSteps=${String(input.approximateSteps)}`], bodiesBase.details)
    : approximateSteps > 0
      ? fail('bodies', [
        ...bodiesBase.reasons,
        `approximateSteps=${approximateSteps} (strict forbids approximate replay steps)`,
      ], bodiesBase.details)
      : bodiesBase;
  const persistence = await evaluatePersistence(input.hooks);

  const dimensions: StrictDimensionResult[] = [featureTree, sketches, bodies, persistence];
  const byDimension: Record<StrictDimensionName, StrictDimensionResult> = {
    featureTree,
    sketches,
    bodies,
    persistence,
  };
  const failures = dimensions
    .filter((dimension) => dimension.status === 'fail')
    .map((dimension) => `${dimension.dimension}: ${dimension.reasons.join('; ')}`);
  const notCheckedEntries = dimensions
    .filter((dimension) => dimension.status === 'not-checked')
    .map((dimension) => `${dimension.dimension}: ${dimension.reasons.join('; ')}`);
  return {
    gate: 'four-dim',
    ok: failures.length === 0 && notCheckedEntries.length === 0,
    dimensions,
    byDimension,
    failures,
    notChecked: notCheckedEntries,
  };
}
