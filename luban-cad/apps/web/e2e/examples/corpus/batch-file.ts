/**
 * Corpus batch file schema (W6-E4, 2026-11-19).
 *
 * The batch file is produced by the private parity tooling (work queue / registry)
 * and consumed by `batch.spec.ts` via ONSHAPE_BATCH_FILE. It is validated strictly
 * here: unknown keys, duplicate keys, missing scenario paths or non-positive
 * expectations fail closed before any iModel is created.
 */
import type { BodyOracle } from './compare-bodies.js';

export interface BatchEntry {
  /** Stable tri-state registry key (owner/doc/ps), used in the test title/report. */
  key: string;
  /** Scenario path relative to the parity data root (or absolute for local runs). */
  scenario: string;
  /** Example iModel display name (default `E2E - Batch - <key>`). */
  name?: string;
  expectedBodies?: BodyOracle[];
  tolerance?: number;
  volumePolicy?: 'strict' | 'record';
  statusPolicy?: 'strict' | 'record';
  requireExact?: boolean;
  skipSketchConstraints?: boolean;
  allowApproximateDraft?: boolean;
  reset?: boolean;
}

export interface BatchFile {
  schemaVersion: 1;
  name: string;
  entries: BatchEntry[];
}

const TOP_KEYS = new Set(['schemaVersion', 'name', 'entries']);
const ENTRY_KEYS = new Set([
  'key', 'scenario', 'name', 'expectedBodies', 'tolerance', 'volumePolicy',
  'statusPolicy', 'requireExact', 'skipSketchConstraints', 'allowApproximateDraft', 'reset',
]);
const BODY_KEYS = new Set(['volumeMm3', 'centroid']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function centroidOf(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n)))
    return undefined;
  return [value[0], value[1], value[2]];
}

export function parseBatchFile(text: string, source = '<batch>'): BatchFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!isObject(raw)) throw new Error(`${source}: batch file must be an object`);
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.has(key)) throw new Error(`${source}: unknown top-level key "${key}"`);
  }
  if (raw.schemaVersion !== 1) throw new Error(`${source}: schemaVersion must be 1`);
  if (typeof raw.name !== 'string' || raw.name.length === 0) throw new Error(`${source}: name must be a non-empty string`);
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) throw new Error(`${source}: entries must be a non-empty array`);

  const seen = new Set<string>();
  const entries = raw.entries.map((entry, index): BatchEntry => {
    const at = `${source}: entries[${index}]`;
    if (!isObject(entry)) throw new Error(`${at} must be an object`);
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.has(key)) throw new Error(`${at} unknown key "${key}"`);
    }
    if (typeof entry.key !== 'string' || entry.key.length === 0) throw new Error(`${at}.key must be a non-empty string`);
    if (seen.has(entry.key)) throw new Error(`${at}.key duplicated: ${entry.key}`);
    seen.add(entry.key);
    if (typeof entry.scenario !== 'string' || entry.scenario.length === 0) throw new Error(`${at}.scenario must be a non-empty string`);
    if (entry.name !== undefined && (typeof entry.name !== 'string' || entry.name.length === 0))
      throw new Error(`${at}.name must be a non-empty string when present`);
    if (entry.tolerance !== undefined
      && (typeof entry.tolerance !== 'number' || !Number.isFinite(entry.tolerance) || entry.tolerance <= 0 || entry.tolerance >= 1))
      throw new Error(`${at}.tolerance must be a number in (0,1)`);
    if (entry.volumePolicy !== undefined && entry.volumePolicy !== 'strict' && entry.volumePolicy !== 'record')
      throw new Error(`${at}.volumePolicy must be strict|record`);
    if (entry.statusPolicy !== undefined && entry.statusPolicy !== 'strict' && entry.statusPolicy !== 'record')
      throw new Error(`${at}.statusPolicy must be strict|record`);
    for (const flag of ['requireExact', 'skipSketchConstraints', 'allowApproximateDraft', 'reset'] as const) {
      if (entry[flag] !== undefined && typeof entry[flag] !== 'boolean')
        throw new Error(`${at}.${flag} must be a boolean`);
    }
    let expectedBodies: BodyOracle[] | undefined;
    if (entry.expectedBodies !== undefined) {
      if (!Array.isArray(entry.expectedBodies) || entry.expectedBodies.length === 0)
        throw new Error(`${at}.expectedBodies must be a non-empty array`);
      expectedBodies = entry.expectedBodies.map((body, bi): BodyOracle => {
        const bodyAt = `${at}.expectedBodies[${bi}]`;
        if (!isObject(body)) throw new Error(`${bodyAt} must be an object`);
        for (const key of Object.keys(body)) {
          if (!BODY_KEYS.has(key)) throw new Error(`${bodyAt} unknown key "${key}"`);
        }
        if (typeof body.volumeMm3 !== 'number' || !Number.isFinite(body.volumeMm3) || body.volumeMm3 <= 0)
          throw new Error(`${bodyAt}.volumeMm3 must be a finite number > 0`);
        const centroid = body.centroid === undefined ? undefined : centroidOf(body.centroid);
        if (body.centroid !== undefined && centroid === undefined)
          throw new Error(`${bodyAt}.centroid must be [x,y,z] finite numbers`);
        return { volumeMm3: body.volumeMm3, ...(centroid ? { centroid } : {}) };
      });
    }
    return {
      key: entry.key,
      scenario: entry.scenario,
      ...(entry.name !== undefined ? { name: entry.name as string } : {}),
      ...(expectedBodies !== undefined ? { expectedBodies } : {}),
      ...(entry.tolerance !== undefined ? { tolerance: entry.tolerance as number } : {}),
      ...(entry.volumePolicy !== undefined ? { volumePolicy: entry.volumePolicy as 'strict' | 'record' } : {}),
      ...(entry.statusPolicy !== undefined ? { statusPolicy: entry.statusPolicy as 'strict' | 'record' } : {}),
      ...(entry.requireExact !== undefined ? { requireExact: entry.requireExact as boolean } : {}),
      ...(entry.skipSketchConstraints !== undefined ? { skipSketchConstraints: entry.skipSketchConstraints as boolean } : {}),
      ...(entry.allowApproximateDraft !== undefined ? { allowApproximateDraft: entry.allowApproximateDraft as boolean } : {}),
      ...(entry.reset !== undefined ? { reset: entry.reset as boolean } : {}),
    };
  });

  return { schemaVersion: 1, name: raw.name, entries };
}
