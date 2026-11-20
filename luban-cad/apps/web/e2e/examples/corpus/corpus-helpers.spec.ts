/**
 * Pure unit checks for corpus batch helpers (no real stack, no iModel).
 * Runs as a cheap Playwright spec so it travels with the e2e folder.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { featureDisplayType } from '../../../src/modules/part-studio/internal/feature-naming.js';
import { parseBatchFile } from './batch-file.js';
import {
  readBodyOracle,
  readExpectedFeatureTree,
  readSketchOracle,
} from './oracle-readers.js';
import { compareBodies } from './compare-bodies.js';
import {
  compareFeatureTree,
  compareSketches,
  compareStrictBodies,
  evaluateStrictGate,
  parseStrictGateMode,
} from './strict-gate.js';

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

test.describe('strict gate: feature tree types/order/names', () => {
  const actual = [
    { featureType: 'sketch', name: 'Sketch 1', status: 0 },
    { featureType: 'extrude', name: 'Extrude 1', status: 0 },
  ] as const;

  test('types/order/names 全匹配 → pass', () => {
    const result = compareFeatureTree(actual, ['Sketch 1', 'Extrude 1']);
    expect(result.status, result.reasons.join('; ')).toBe('pass');
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test('默认名与产品 featureDisplayType + en 标签一致（无隐式别名）', () => {
    const rows = [
      { featureType: 'faceExtrude', status: 0 },
      { featureType: 'featureMirror', status: 0 },
      { featureType: 'featurePattern', params: { kind: 'linear' }, status: 0 },
      { featureType: 'featurePattern', params: { kind: 'circular' }, status: 0 },
      { featureType: 'pattern', params: { kind: 'linear' }, status: 0 },
      { featureType: 'pattern', params: { kind: 'circular' }, status: 0 },
      { featureType: 'extrude', status: 0 },
    ] as const;
    // Product source of truth: featureDisplayType from src/modules/part-studio.
    expect(rows.map((row) => featureDisplayType(row))).toEqual([
      'faceExtrude', 'featureMirror', 'featurePattern', 'featurePattern',
      'pattern', 'patternCircular', 'extrude',
    ]);
    const names = [
      'Face extrude 1', 'Feature mirror 1', 'Feature pattern 1', 'Feature pattern 2',
      'Pattern 1', 'Circular pattern 1', 'Extrude 1',
    ];
    const passed = compareFeatureTree(rows, names);
    expect(passed.status, passed.reasons.join('; ')).toBe('pass');

    // Negative: the previously synthesized names must fail.
    const negativeCases: Array<[number, string]> = [
      [0, 'Extrude 1'],
      [1, 'Mirror 1'],
      [2, 'Linear pattern 1'],
      [3, 'Circular pattern 1'],
      [4, 'Linear pattern 1'],
      [5, 'Pattern 1'],
    ];
    for (const [index, wrongName] of negativeCases) {
      const expected = names.map((name, at) => at === index ? wrongName : name);
      const failed = compareFeatureTree(rows, expected);
      expect(failed.status, `negative index ${index}`).toBe('fail');
      expect(failed.reasons.join(' ')).toMatch(/name/);
    }
  });

  test('orderKey 排序 + 用户重命名优先（同 mapFeatureEntries）', () => {
    const rows = [
      { featureType: 'extrude', orderKey: 20, status: 0 },
      { featureType: 'sketch', orderKey: 10, status: 0, name: 'Main Sketch' },
    ];
    const result = compareFeatureTree(rows, ['Main Sketch', 'Extrude 1']);
    expect(result.status, result.reasons.join('; ')).toBe('pass');
    const reversedInput = compareFeatureTree([...rows].reverse(), ['Main Sketch', 'Extrude 1']);
    expect(reversedInput.status, reversedInput.reasons.join('; ')).toBe('pass');
    const derivedInsteadOfRename = compareFeatureTree(
      [{ featureType: 'sketch', orderKey: 10, status: 0 }],
      ['Main Sketch'],
    );
    expect(derivedInsteadOfRename.status).toBe('fail');
    expect(derivedInsteadOfRename.reasons.join(' ')).toMatch(/name/);
  });

  test('faceExtrude 仅在显式 typeAliases 下映射为 extrude 类型', () => {
    const row = [{ featureType: 'faceExtrude', status: 0 }] as const;
    const expected = [{ type: 'extrude', name: 'Face extrude 1' }] as const;
    const implicit = compareFeatureTree(row, expected);
    expect(implicit.status).toBe('fail');
    expect(implicit.reasons.join(' ')).toMatch(/type/);
    const aliased = compareFeatureTree(row, expected, { typeAliases: { faceExtrude: 'extrude' } });
    expect(aliased.status, aliased.reasons.join('; ')).toBe('pass');
  });

  test('顺序不符 → fail', () => {
    const result = compareFeatureTree(actual, ['Extrude 1', 'Sketch 1']);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/name/);
  });

  test('名称不符 → fail', () => {
    const result = compareFeatureTree(actual, ['Sketch 1', 'Extrude 2']);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/name/);
  });

  test('类型不符 → fail', () => {
    const result = compareFeatureTree(actual, [
      { type: 'extrude', name: 'Sketch 1' },
      { type: 'sketch', name: 'Extrude 1' },
    ]);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/type/);
  });

  test('非 0 status → fail', () => {
    const result = compareFeatureTree([{ featureType: 'sketch', status: 1 }], ['Sketch 1']);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/status/);
  });

  test('无 oracle → not-checked（不静默 pass）', () => {
    const result = compareFeatureTree(actual, undefined);
    expect(result.status).toBe('not-checked');
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('oracle 形态非法 → fail', () => {
    const result = compareFeatureTree(actual, undefined, {}, 'bad oracle shape');
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/bad oracle shape/);
  });

  test('tutorial2 fixture：默认名派生与类型逐项匹配', () => {
    const fixture = JSON.parse(readFileSync(
      new URL('../../fixtures/parity/tutorial2.scenario.json', import.meta.url),
      'utf8',
    )) as {
      features: Array<{ type: string; name: string }>;
      expected: { featureTree: string[] };
    };
    const result = compareFeatureTree(
      fixture.features.map((feature) => ({ featureType: feature.type, status: 0 })),
      fixture.expected.featureTree.map((name, index) => ({
        type: fixture.features[index]?.type,
        name,
      })),
    );
    expect(result.status, result.reasons.join('; ')).toBe('pass');
  });
});

test.describe('strict gate: sketch constraints + DOF/status', () => {
  const actual = [{
    sketch: 'Sketch 1',
    constraints: [{ kind: 'horizontal' }, { kind: 'distance' }, { kind: 'distance' }],
    dof: 0,
    status: 'ok',
  }] as const;

  test('约束多重集 + DOF + status 全匹配 → pass', () => {
    const result = compareSketches(actual, [{
      sketch: 'Sketch 1',
      constraintKinds: ['distance', 'horizontal', 'distance'],
      dof: 0,
      status: 'ok',
    }]);
    expect(result.status, result.reasons.join('; ')).toBe('pass');
  });

  test('DOF 不符 → fail', () => {
    const result = compareSketches(actual, [{
      sketch: 'Sketch 1',
      constraintKinds: ['horizontal', 'distance', 'distance'],
      dof: 2,
      status: 'ok',
    }]);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/dof actual=0 expected=2/);
  });

  test('约束种类/数量不符 → fail', () => {
    const result = compareSketches(actual, [{
      sketch: 'Sketch 1',
      constraintKinds: ['horizontal', 'horizontal', 'distance'],
      dof: 0,
      status: 'ok',
    }]);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/constraint "horizontal"/);
  });

  test('oracle 缺 status → not-checked（已提供字段仍对拍）', () => {
    const result = compareSketches(actual, [{
      sketch: 'Sketch 1',
      constraintKinds: ['horizontal', 'distance', 'distance'],
      dof: 0,
    }]);
    expect(result.status).toBe('not-checked');
    expect(result.reasons.join(' ')).toMatch(/lacks status/);
  });

  test('无 oracle → not-checked', () => {
    const result = compareSketches(actual, undefined);
    expect(result.status).toBe('not-checked');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('实际草图未被 oracle 覆盖 → not-checked', () => {
    const result = compareSketches(
      [...actual, { sketch: 'Sketch 2', constraints: [], dof: 0, status: 'ok' }],
      [{ sketch: 'Sketch 1', constraintKinds: ['horizontal', 'distance', 'distance'], dof: 0, status: 'ok' }],
    );
    expect(result.status).toBe('not-checked');
    expect(result.reasons.join(' ')).toMatch(/not covered/);
  });

  test('oracle 形态非法 → fail', () => {
    const result = compareSketches(actual, undefined, 'bad sketch oracle');
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/bad sketch oracle/);
  });
});

test.describe('strict gate: per-body volume + centroid', () => {
  const expected = [{ volumeMm3: 1000, centroid: [0, 0, 0] as const }];
  const passBody = (volume: number, centroid: readonly [number, number, number] = [0, 0, 0]) =>
    [{ volume, centroid }] as const;

  test('体积/质心在容差内 → pass', () => {
    const result = compareStrictBodies(passBody(1000.5, [0.01, 0, 0]), expected);
    expect(result.status, result.reasons.join('; ')).toBe('pass');
  });

  test('多 body 顺序无关：按质心一一配对', () => {
    const result = compareStrictBodies(
      [
        { volume: 2000, centroid: [100, 0, 0] },
        { volume: 1000, centroid: [0, 0, 0] },
      ],
      [
        { volumeMm3: 1000, centroid: [0, 0, 0] },
        { volumeMm3: 2000, centroid: [100, 0, 0] },
      ],
    );
    expect(result.status, result.reasons.join('; ')).toBe('pass');
    const pairs = result.details?.pairs as Array<{ actualIndex: number; expectedIndex: number }>;
    expect(pairs.map((pair) => [pair.actualIndex, pair.expectedIndex]))
      .toEqual([[0, 1], [1, 0]]);
  });

  test('body 数不一致 → fail', () => {
    const result = compareStrictBodies([], expected);
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/body count/);
  });

  test('体积恰 0.5% 边界 → pass；超过 → fail', () => {
    expect(compareStrictBodies(passBody(1005), expected).status).toBe('pass');
    const over = compareStrictBodies(passBody(1006), expected);
    expect(over.status).toBe('fail');
    expect(over.reasons.join(' ')).toMatch(/rel=0\.600%/);
  });

  test('0.5%–1% 无理由 → fail；有 hardToleranceReason → pass；>1% → fail', () => {
    const hardExpected = [{ volumeMm3: 1000, centroid: [0, 0, 0] as const }];
    const withoutReason = compareStrictBodies(passBody(1008), hardExpected);
    expect(withoutReason.status).toBe('fail');
    expect(withoutReason.reasons.join(' ')).toMatch(/0\.800%/);
    const withReason = compareStrictBodies(passBody(1008), [{
      volumeMm3: 1000,
      centroid: [0, 0, 0],
      hardToleranceReason: 'documented kernel tolerance for this part',
    }]);
    expect(withReason.status, withReason.reasons.join('; ')).toBe('pass');
    const overHard = compareStrictBodies(passBody(1011), [{
      volumeMm3: 1000,
      centroid: [0, 0, 0],
      hardToleranceReason: 'documented kernel tolerance for this part',
    }]);
    expect(overHard.status).toBe('fail');
  });

  test('质心 0.05 mm 边界 → pass；超过 → fail', () => {
    expect(compareStrictBodies(passBody(1000, [0.05, 0, 0]), expected).status).toBe('pass');
    const over = compareStrictBodies(passBody(1000, [0.0500001, 0, 0]), expected);
    expect(over.status).toBe('fail');
    expect(over.reasons.join(' ')).toMatch(/centroid distance/);
  });

  test('缺预期质心 → not-checked（体积仍对拍）', () => {
    const result = compareStrictBodies(passBody(1000), [{ volumeMm3: 1000 }]);
    expect(result.status).toBe('not-checked');
    expect(result.reasons.join(' ')).toMatch(/centroid/);
  });

  test('无 oracle → not-checked', () => {
    const result = compareStrictBodies(passBody(1000), undefined);
    expect(result.status).toBe('not-checked');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('oracle 形态非法 → fail', () => {
    const result = compareStrictBodies(passBody(1000), undefined, {}, 'bad body oracle');
    expect(result.status).toBe('fail');
    expect(result.reasons.join(' ')).toMatch(/bad body oracle/);
  });
});

test.describe('strict gate: oracle readers', () => {
  test('featureTree: strings take types from scenario.features; objects override', () => {
    const parsed = readExpectedFeatureTree(
      ['Sketch 1', { type: 'extrude', name: 'Cut' }],
      ['sketch', 'hole'],
    );
    expect(parsed.error).toBeUndefined();
    expect(parsed.expected).toEqual([
      { type: 'sketch', name: 'Sketch 1' },
      { type: 'extrude', name: 'Cut' },
    ]);
    expect(readExpectedFeatureTree([], ['sketch']).error).toMatch(/non-empty/);
    expect(readExpectedFeatureTree([{ name: '' }], []).error).toMatch(/name/);
    expect(readExpectedFeatureTree([{}], []).error).toMatch(/neither/);
  });

  test('sketch oracle: valid shape accepted; malformed shapes fail closed', () => {
    const parsed = readSketchOracle([{
      sketch: 'Sketch 1',
      constraintKinds: ['horizontal'],
      dof: 0,
      status: 'ok',
    }]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.oracle?.[0]).toEqual({
      sketch: 'Sketch 1',
      constraintKinds: ['horizontal'],
      dof: 0,
      status: 'ok',
    });
    expect(readSketchOracle([]).error).toMatch(/non-empty/);
    expect(readSketchOracle([{ sketch: 'S', constraintKinds: [1] }]).error).toMatch(/constraintKinds/);
    expect(readSketchOracle([{ sketch: 'S', dof: -1 }]).error).toMatch(/dof/);
    expect(readSketchOracle([{ sketch: 'S' }]).error).toMatch(/no constraint/);
  });

  test('body oracle: explicit volume units; dual-key rejected', () => {
    const m3 = readBodyOracle([{ volumeM3: 1e-9 }]);
    expect(m3.error).toBeUndefined();
    expect(m3.expected?.[0]?.volumeMm3).toBeCloseTo(1, 11);
    const mm3 = readBodyOracle([{ volumeMm3: 2.5 }]);
    expect(mm3.error).toBeUndefined();
    expect(mm3.expected?.[0]?.volumeMm3).toBe(2.5);
    expect(readBodyOracle([{ volumeM3: 1e-9, volumeMm3: 1 }]).error)
      .toMatch(/both volumeM3 and volumeMm3/);
    expect(readBodyOracle([{}]).error).toMatch(/requires volumeM3 or volumeMm3/);
    expect(readBodyOracle([{ volumeM3: 0 }]).error).toMatch(/volumeM3/);
  });

  test('body oracle: centroid units explicit; legacy centroid rejected', () => {
    const mm = readBodyOracle([{ volumeMm3: 1, centroidMm: [1, 2, 3] }]);
    expect(mm.error).toBeUndefined();
    expect(mm.expected?.[0]?.centroid).toEqual([1, 2, 3]);
    const m3 = readBodyOracle([{ volumeMm3: 1, centroidM3: [0.001, -0.002, 0.003] }]);
    expect(m3.error).toBeUndefined();
    const centroid = m3.expected?.[0]?.centroid;
    expect(centroid?.[0]).toBeCloseTo(1, 10);
    expect(centroid?.[1]).toBeCloseTo(-2, 10);
    expect(centroid?.[2]).toBeCloseTo(3, 10);
    expect(readBodyOracle([{ volumeMm3: 1, centroid: [1, 2, 3] }]).error)
      .toMatch(/ambiguous.*centroidMm or centroidM3/);
    expect(readBodyOracle([{ volumeMm3: 1, centroidMm: [1, 2] }]).error).toMatch(/centroidMm/);
    expect(readBodyOracle([{
      volumeMm3: 1,
      centroidMm: [1, 2, 3],
      centroidM3: [1, 2, 3],
    }]).error).toMatch(/both centroidMm and centroidM3/);
  });
});

test.describe('strict gate: four-dimension orchestration + persistence hooks', () => {
  const featureTree = {
    actual: [{ featureType: 'sketch', name: 'Sketch 1', status: 0 }] as const,
    expected: ['Sketch 1'] as const,
  };
  const sketches = {
    actual: [{
      sketch: 'Sketch 1',
      constraints: [{ kind: 'horizontal' }],
      dof: 0,
      status: 'ok',
    }] as const,
    oracle: [{
      sketch: 'Sketch 1',
      constraintKinds: ['horizontal'] as const,
      dof: 0,
      status: 'ok',
    }] as const,
  };
  const bodies = {
    actual: [{ volume: 1000, centroid: [0, 0, 0] as const }] as const,
    expected: [{ volumeMm3: 1000, centroid: [0, 0, 0] as const }] as const,
  };
  const passHook = () => ({
    dimension: 'persistence' as const,
    ok: true,
    status: 'pass' as const,
    reasons: [],
  });

  test('四维全 pass（含两个 hook）→ ok=true', async () => {
    const report = await evaluateStrictGate({
      featureTree,
      sketches,
      bodies,
      hooks: { persistence: passHook, undoRedo: passHook },
    });
    expect(report.ok, [...report.failures, ...report.notChecked].join('; ')).toBe(true);
    expect(report.dimensions.map((dimension) => dimension.dimension))
      .toEqual(['featureTree', 'sketches', 'bodies', 'persistence']);
  });

  test('缺 persistence/undoRedo hook → not-checked，整体 ok=false', async () => {
    const report = await evaluateStrictGate({ featureTree, sketches, bodies });
    expect(report.ok).toBe(false);
    expect(report.byDimension.persistence.status).toBe('not-checked');
    expect(report.notChecked.join(' ')).toMatch(/persistence\/reopen hook not provided/);
    expect(report.notChecked.join(' ')).toMatch(/undo\/redo hook not provided/);
  });

  test('undo/redo hook fail → persistence fail', async () => {
    const report = await evaluateStrictGate({
      featureTree,
      sketches,
      bodies,
      hooks: {
        persistence: passHook,
        undoRedo: () => ({
          dimension: 'persistence',
          ok: false,
          status: 'fail',
          reasons: ['undo did not restore'],
        }),
      },
    });
    expect(report.ok).toBe(false);
    expect(report.byDimension.persistence.status).toBe('fail');
    expect(report.failures.join(' ')).toMatch(/undo did not restore/);
  });

  test('approximateSteps>0 → bodies fail（近似不得冒充 strict）', async () => {
    const report = await evaluateStrictGate({
      featureTree,
      sketches,
      bodies,
      approximateSteps: 1,
      hooks: { persistence: passHook, undoRedo: passHook },
    });
    expect(report.ok).toBe(false);
    expect(report.byDimension.bodies.status).toBe('fail');
    expect(report.failures.join(' ')).toMatch(/approximateSteps=1/);
  });

  test('缺 sketch oracle → sketches not-checked 且整体 ok=false（不静默 pass）', async () => {
    const report = await evaluateStrictGate({
      featureTree,
      sketches: { actual: sketches.actual },
      bodies,
      hooks: { persistence: passHook, undoRedo: passHook },
    });
    expect(report.ok).toBe(false);
    expect(report.byDimension.sketches.status).toBe('not-checked');
    expect(report.notChecked.join(' ')).toMatch(/sketch constraint\/DOF oracle/);
  });

  test('env parser 仅接受 four-dim', () => {
    expect(parseStrictGateMode('four-dim')).toBe('four-dim');
    expect(parseStrictGateMode(undefined)).toBeUndefined();
    expect(parseStrictGateMode('strict')).toBeUndefined();
  });
});
