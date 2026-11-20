/**
 * Pure parsers for strict-gate oracle payloads (2026-11-21 review fix).
 *
 * These readers are deliberately strict: malformed oracle shapes return an error
 * that the gate reports as `fail`, never silently dropping fields. They are pure
 * (no RPC/iModel/Playwright imports) so they are unit-testable without the stack.
 */
import type {
  ExpectedFeatureTree,
  ExpectedFeatureTreeEntry,
  SketchOracle,
  SketchOracleSample,
  StrictBodyOracle,
} from './strict-gate.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * `scenario.expected.featureTree` → strict-gate oracle. Strings are Onshape
 * feature names; the type comes from the same-index `scenario.features[].type`
 * (the oracle entry only compares names when no type is available). Object
 * entries may carry an explicit `{type,name}`.
 */
export function readExpectedFeatureTree(
  value: unknown,
  types: readonly string[],
): { expected?: ExpectedFeatureTree; error?: string } {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.length === 0)
    return { error: 'expected.featureTree must be a non-empty array' };
  const expected: Array<string | ExpectedFeatureTreeEntry> = [];
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    if (typeof item === 'string') {
      if (item.length === 0) return { error: `expected.featureTree[${index}] must be a non-empty string` };
      const type = types[index];
      expected.push(type !== undefined ? { type, name: item } : { name: item });
      continue;
    }
    const record = asRecord(item);
    if (!record) return { error: `expected.featureTree[${index}] must be a string or {type,name}` };
    const rawType = record.type;
    const rawName = record.name;
    if (rawType !== undefined && (typeof rawType !== 'string' || rawType.length === 0))
      return { error: `expected.featureTree[${index}].type must be a non-empty string` };
    if (rawName !== undefined && (typeof rawName !== 'string' || rawName.length === 0))
      return { error: `expected.featureTree[${index}].name must be a non-empty string` };
    const resolvedType = typeof rawType === 'string' ? rawType : types[index];
    if (resolvedType === undefined && rawName === undefined)
      return { error: `expected.featureTree[${index}] has neither type nor name` };
    expected.push({
      ...(resolvedType !== undefined ? { type: resolvedType } : {}),
      ...(typeof rawName === 'string' ? { name: rawName } : {}),
    });
  }
  return { expected };
}

/**
 * `scenario.expected.sketches` → strict-gate oracle. Keys are scenario sketch
 * feature names; each entry needs at least one of constraintKinds/constraintCount/
 * dof/status. The current corpus has no such field, so the gate reports
 * `not-checked` until it is supplied.
 */
export function readSketchOracle(value: unknown): { oracle?: SketchOracle; error?: string } {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.length === 0)
    return { error: 'expected.sketches must be a non-empty array' };
  const oracle: SketchOracleSample[] = [];
  for (let index = 0; index < value.length; index++) {
    const record = asRecord(value[index]);
    if (!record) return { error: `expected.sketches[${index}] must be an object` };
    const sketch = record.sketch;
    if (typeof sketch !== 'string' || sketch.length === 0)
      return { error: `expected.sketches[${index}].sketch must be a non-empty string` };
    const rawKinds = record.constraintKinds;
    const constraintKinds = rawKinds === undefined ? undefined
      : Array.isArray(rawKinds) && rawKinds.every((kind) => typeof kind === 'string' && kind.length > 0)
        ? rawKinds as string[]
        : undefined;
    if (rawKinds !== undefined && constraintKinds === undefined)
      return { error: `expected.sketches[${index}].constraintKinds must be a string array` };
    const rawCount = record.constraintCount;
    if (rawCount !== undefined && (!Number.isInteger(rawCount) || (rawCount as number) < 0))
      return { error: `expected.sketches[${index}].constraintCount must be a non-negative integer` };
    const rawDof = record.dof;
    if (rawDof !== undefined && (!Number.isInteger(rawDof) || (rawDof as number) < 0))
      return { error: `expected.sketches[${index}].dof must be a non-negative integer` };
    const rawStatus = record.status;
    if (rawStatus !== undefined && (typeof rawStatus !== 'string' || rawStatus.length === 0))
      return { error: `expected.sketches[${index}].status must be a non-empty string` };
    if (constraintKinds === undefined && rawCount === undefined && rawDof === undefined && rawStatus === undefined)
      return { error: `expected.sketches[${index}] has no constraint/DOF/status fields` };
    oracle.push({
      sketch,
      ...(constraintKinds !== undefined ? { constraintKinds } : {}),
      ...(rawCount !== undefined ? { constraintCount: rawCount as number } : {}),
      ...(rawDof !== undefined ? { dof: rawDof as number } : {}),
      ...(typeof rawStatus === 'string' ? { status: rawStatus } : {}),
    });
  }
  return { oracle };
}

function parseCentroid(value: unknown): readonly [number, number, number] | undefined {
  const array = Array.isArray(value) ? value : undefined;
  const object = asRecord(value);
  const x = finiteNumber(array ? array[0] : object?.x);
  const y = finiteNumber(array ? array[1] : object?.y);
  const z = finiteNumber(array ? array[2] : object?.z);
  return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z];
}

/**
 * `scenario.expected.bodies` → strict-gate body oracle.
 *
 * Units are explicit and fail closed:
 * - exactly one of `volumeM3` / `volumeMm3` (both present is rejected);
 * - centroids must use `centroidMm` or `centroidM3` (mutually exclusive); the
 *   legacy ambiguous `centroid` key is rejected. `centroidM3` is converted to mm.
 * - optional `hardToleranceReason` enables the hard 1% volume tolerance.
 */
export function readBodyOracle(value: unknown): { expected?: StrictBodyOracle[]; error?: string } {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.length === 0)
    return { error: 'expected.bodies must be a non-empty array' };
  const expected: StrictBodyOracle[] = [];
  for (let index = 0; index < value.length; index++) {
    const record = asRecord(value[index]);
    if (!record) return { error: `expected.bodies[${index}] must be an object` };
    const hasVolumeM3 = record.volumeM3 !== undefined;
    const hasVolumeMm3 = record.volumeMm3 !== undefined;
    if (hasVolumeM3 && hasVolumeMm3)
      return { error: `expected.bodies[${index}] must not set both volumeM3 and volumeMm3` };
    let volumeMm3: number | undefined;
    if (hasVolumeM3) {
      const volumeM3 = finiteNumber(record.volumeM3);
      if (volumeM3 === undefined || volumeM3 <= 0)
        return { error: `expected.bodies[${index}].volumeM3 must be a finite number > 0` };
      volumeMm3 = volumeM3 * 1e9;
    } else if (hasVolumeMm3) {
      const rawMm3 = finiteNumber(record.volumeMm3);
      if (rawMm3 === undefined || rawMm3 <= 0)
        return { error: `expected.bodies[${index}].volumeMm3 must be a finite number > 0` };
      volumeMm3 = rawMm3;
    } else {
      return { error: `expected.bodies[${index}] requires volumeM3 or volumeMm3` };
    }
    if (record.centroid !== undefined)
      return {
        error: `expected.bodies[${index}].centroid is ambiguous; use centroidMm or centroidM3`,
      };
    const hasCentroidMm = record.centroidMm !== undefined;
    const hasCentroidM3 = record.centroidM3 !== undefined;
    if (hasCentroidMm && hasCentroidM3)
      return { error: `expected.bodies[${index}] must not set both centroidMm and centroidM3` };
    let centroid: readonly [number, number, number] | undefined;
    if (hasCentroidMm || hasCentroidM3) {
      const raw = hasCentroidMm ? record.centroidMm : record.centroidM3;
      const parsed = parseCentroid(raw);
      if (parsed === undefined)
        return {
          error: `expected.bodies[${index}].${hasCentroidMm ? 'centroidMm' : 'centroidM3'} ` +
            'must be [x,y,z] finite numbers',
        };
      centroid = hasCentroidM3
        ? [parsed[0] * 1000, parsed[1] * 1000, parsed[2] * 1000]
        : parsed;
    }
    const rawReason = record.hardToleranceReason;
    if (rawReason !== undefined && (typeof rawReason !== 'string' || rawReason.trim().length === 0))
      return { error: `expected.bodies[${index}].hardToleranceReason must be a non-empty string` };
    expected.push({
      volumeMm3,
      ...(centroid !== undefined ? { centroid } : {}),
      ...(typeof rawReason === 'string' ? { hardToleranceReason: rawReason } : {}),
    });
  }
  return { expected };
}
