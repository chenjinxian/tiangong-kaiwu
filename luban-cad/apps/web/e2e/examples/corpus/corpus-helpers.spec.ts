/**
 * Pure unit checks for corpus batch helpers (no real stack, no iModel).
 * Runs as a cheap Playwright spec so it travels with the e2e folder.
 */
import { expect, test } from '@playwright/test';
import { parseBatchFile } from './batch-file.js';
import { compareBodies } from './compare-bodies.js';

test.describe('corpus batch-file parser', () => {
  const valid = JSON.stringify({
    schemaVersion: 1,
    name: 'W1 sample',
    entries: [
      {
        key: 'owner/doc/ps',
        scenario: 'scenarios/sample.scenario.json',
        expectedBodies: [{ volumeMm3: 10, centroid: [1, 2, 3] }],
        tolerance: 0.005,
        volumePolicy: 'strict',
        requireExact: true,
      },
    ],
  });

  test('accepts a valid file and defaults nothing silently', () => {
    const parsed = parseBatchFile(valid);
    expect(parsed.name).toBe('W1 sample');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      key: 'owner/doc/ps',
      scenario: 'scenarios/sample.scenario.json',
      tolerance: 0.005,
      volumePolicy: 'strict',
      requireExact: true,
    });
    expect(parsed.entries[0]!.expectedBodies?.[0]?.centroid).toEqual([1, 2, 3]);
  });

  test('fails closed on unknown keys, duplicate keys, bad tolerance and bad bodies', () => {
    expect(() => parseBatchFile(JSON.stringify({ schemaVersion: 1, name: 'x', entries: [], extra: 1 })))
      .toThrow(/unknown top-level key/);
    expect(() => parseBatchFile(JSON.stringify({
      schemaVersion: 1, name: 'x',
      entries: [{ key: 'a', scenario: 's' }, { key: 'a', scenario: 't' }],
    }))).toThrow(/duplicated/);
    expect(() => parseBatchFile(JSON.stringify({
      schemaVersion: 1, name: 'x', entries: [{ key: 'a', scenario: 's', tolerance: 1.5 }],
    }))).toThrow(/tolerance/);
    expect(() => parseBatchFile(JSON.stringify({
      schemaVersion: 1, name: 'x',
      entries: [{ key: 'a', scenario: 's', expectedBodies: [{ volumeMm3: 0 }] }],
    }))).toThrow(/volumeMm3/);
    expect(() => parseBatchFile(JSON.stringify({
      schemaVersion: 1, name: 'x',
      entries: [{ key: 'a', scenario: 's', expectedBodies: [{ volumeMm3: 1, centroid: [0, 1] }] }],
    }))).toThrow(/centroid/);
    expect(() => parseBatchFile('{not json')).toThrow(/invalid JSON/);
  });
});

test.describe('compareBodies（逐 body 配对）', () => {
  test('按质心配对，顺序无关；体积/质心在容差内 → ok', () => {
    const actual = [
      { volume: 20, centroid: [100, 0, 0] as const },
      { volume: 10, centroid: [0, 0, 0] as const },
    ];
    const expected = [
      { volumeMm3: 10, centroid: [0, 0, 0] as const },
      { volumeMm3: 20, centroid: [100, 0, 0] as const },
    ];
    const result = compareBodies(actual, expected);
    expect(result.ok, result.errors.join('; ')).toBe(true);
    expect(result.pairs).toHaveLength(2);
    expect(result.pairs.every((pair) => pair.volumeRelDiff < 0.005)).toBe(true);
  });

  test('body 数不一致 / 体积超差 / 质心超差 → fail', () => {
    const base = [{ volumeMm3: 10, centroid: [0, 0, 0] as const }];
    expect(compareBodies([], base).ok).toBe(false);
    expect(compareBodies([{ volume: 10.5, centroid: [0, 0, 0] }], base, { volumeTolerance: 0.005 }).ok).toBe(false);
    expect(compareBodies([{ volume: 10, centroid: [0.2, 0, 0] }], base, { centroidToleranceMm: 0.05 }).ok).toBe(false);
  });

  test('缺质心时退回按体积降序配对（记录为较弱口径）', () => {
    const result = compareBodies(
      [{ volume: 5 }, { volume: 15 }],
      [{ volumeMm3: 10 }, { volumeMm3: 20 }],
      { volumeTolerance: 0.6 },
    );
    expect(result.ok).toBe(true);
    expect(result.pairs.map((pair) => pair.actualIndex).sort()).toEqual([0, 1]);
  });
});
