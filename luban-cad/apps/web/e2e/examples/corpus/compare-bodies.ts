/**
 * Corpus batch body comparison (W6-E4, 2026-11-19).
 *
 * Strict corpus rule: compare per-body, never collapse to a total volume. Bodies are
 * paired by centroid (one-to-one, nearest first) when both sides carry centroids;
 * otherwise by descending volume (documented fallback, less strict). Each pair must
 * satisfy a relative volume tolerance and (when available) an absolute centroid
 * distance tolerance in mm.
 */

export interface BodySample {
  volume: number;
  centroid?: readonly [number, number, number];
}

export interface BodyOracle {
  volumeMm3: number;
  centroid?: readonly [number, number, number];
}

export interface BodyPair {
  actualIndex: number;
  expectedIndex: number;
  volumeRelDiff: number;
  centroidDistance?: number;
}

export interface BodyComparison {
  ok: boolean;
  errors: string[];
  pairs: BodyPair[];
}

export interface CompareOptions {
  /** Relative volume tolerance (default 0.5%). */
  volumeTolerance: number;
  /** Absolute centroid distance tolerance in mm (default 0.05 mm). */
  centroidToleranceMm: number;
}

const DEFAULT_OPTIONS: CompareOptions = { volumeTolerance: 0.005, centroidToleranceMm: 0.05 };

function centroidDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** One-to-one nearest-centroid pairing; deterministic tie-break by index. */
function pairByCentroid(actual: readonly BodySample[], expected: readonly BodyOracle[]): Array<[number, number]> {
  const candidates: Array<{ ai: number; ei: number; d: number }> = [];
  actual.forEach((a, ai) => {
    expected.forEach((e, ei) => {
      if (a.centroid && e.centroid) candidates.push({ ai, ei, d: centroidDistance(a.centroid, e.centroid) });
    });
  });
  candidates.sort((x, y) => x.d - y.d || x.ai - y.ai || x.ei - y.ei);
  const usedActual = new Set<number>();
  const usedExpected = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (const c of candidates) {
    if (usedActual.has(c.ai) || usedExpected.has(c.ei)) continue;
    usedActual.add(c.ai);
    usedExpected.add(c.ei);
    pairs.push([c.ai, c.ei]);
  }
  return pairs;
}

/** Fallback: pair by descending volume (used only when any centroid is missing). */
function pairByVolume(actual: readonly BodySample[], expected: readonly BodyOracle[]): Array<[number, number]> {
  const actualOrder = actual.map((_, i) => i).sort((a, b) => actual[b]!.volume - actual[a]!.volume);
  const expectedOrder = expected.map((_, i) => i).sort((a, b) => expected[b]!.volumeMm3 - expected[a]!.volumeMm3);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(actualOrder.length, expectedOrder.length); i++)
    pairs.push([actualOrder[i]!, expectedOrder[i]!]);
  return pairs;
}

export function compareBodies(
  actual: readonly BodySample[],
  expected: readonly BodyOracle[],
  options: Partial<CompareOptions> = {},
): BodyComparison {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];
  const pairs: BodyPair[] = [];

  if (actual.length !== expected.length) {
    errors.push(`body count mismatch: actual=${actual.length} expected=${expected.length}`);
  }

  const haveAllCentroids = actual.every((a) => a.centroid !== undefined)
    && expected.every((e) => e.centroid !== undefined);
  const rawPairs = haveAllCentroids ? pairByCentroid(actual, expected) : pairByVolume(actual, expected);

  const pairedActual = new Set<number>();
  const pairedExpected = new Set<number>();
  for (const [ai, ei] of rawPairs) {
    const a = actual[ai]!;
    const e = expected[ei]!;
    pairedActual.add(ai);
    pairedExpected.add(ei);
    const volumeRelDiff = Math.abs(a.volume - e.volumeMm3) / e.volumeMm3;
    const pair: BodyPair = { actualIndex: ai, expectedIndex: ei, volumeRelDiff };
    if (volumeRelDiff > opts.volumeTolerance)
      errors.push(`body[${ai}]->expected[${ei}] volume ${a.volume.toFixed(3)} vs ${e.volumeMm3} (rel=${(volumeRelDiff * 100).toFixed(3)}% > ${(opts.volumeTolerance * 100).toFixed(3)}%)`);
    if (a.centroid && e.centroid) {
      const d = centroidDistance(a.centroid, e.centroid);
      pair.centroidDistance = d;
      if (d > opts.centroidToleranceMm)
        errors.push(`body[${ai}]->expected[${ei}] centroid distance ${d.toFixed(4)} mm > ${opts.centroidToleranceMm} mm`);
    }
    pairs.push(pair);
  }

  actual.forEach((_, i) => { if (!pairedActual.has(i)) errors.push(`actual body[${i}] unmatched (volume=${actual[i]!.volume})`); });
  expected.forEach((_, i) => { if (!pairedExpected.has(i)) errors.push(`expected body[${i}] unmatched (volume=${expected[i]!.volumeMm3})`); });

  return { ok: errors.length === 0, errors, pairs };
}
