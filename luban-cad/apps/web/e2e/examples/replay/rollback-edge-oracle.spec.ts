/**
 * 回滚快照 oracle 边匹配（test-only 纯函数单测）。
 *
 * 覆盖 LINE 顺序无关端点、CIRCLE/ARC 圆心+半径+起终点、法向校验、full-circle
 * 判别、0/多匹配 fail closed、重复 oracle 曲线、manifest 解析/Part Studio 过滤、
 * 多 body 显式 scope。真栈枚举/resolveEdgeRef 由 Bumper strict spec 覆盖。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from '../registry.js';
import type { EdgeHandle } from './edge-resolver.js';
import {
  ORACLE_TOLERANCE_MM,
  edgeOracleMapForPartStudio,
  loadRollbackEdgeOracleManifest,
  matchOracleToProductEdges,
  parseRollbackEdgeOracleManifest,
  scopeOracleHandles,
  type OracleEdgeCurve,
  type OracleLineEdge,
} from './rollback-edge-oracle.js';
import { BlockedCapabilityError } from './scenario-to-op.js';

const T = ORACLE_TOLERANCE_MM;
const body = (subEntityId: number, curve: EdgeHandle['curve'], bodyKey = 'b1'): EdgeHandle =>
  ({ bodyKey, subEntityId, curve });

const line = (
  subEntityId: number,
  p0: [number, number, number],
  p1: [number, number, number],
  bodyKey = 'b1',
): EdgeHandle => body(subEntityId, { kind: 'line', p0, p1 }, bodyKey);

const fullCircle = (
  subEntityId: number,
  center: [number, number, number],
  radius: number,
  normal: [number, number, number] = [0, 0, 1],
): EdgeHandle => body(subEntityId, {
  kind: 'arc',
  center,
  radius,
  normal,
  start: [center[0] + radius, center[1], center[2]],
  end: [center[0] + radius, center[1], center[2]],
  sweepRadians: 2 * Math.PI,
});

const arc = (
  subEntityId: number,
  center: [number, number, number],
  radius: number,
  start: [number, number, number],
  end: [number, number, number],
  sweepRadians: number,
  normal: [number, number, number] = [0, 0, 1],
): EdgeHandle => body(subEntityId, { kind: 'arc', center, radius, normal, start, end, sweepRadians });

function blocked(action: () => unknown): BlockedCapabilityError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BlockedCapabilityError);
    const blockedError = error as BlockedCapabilityError;
    expect(blockedError.code).toBe('edge-oracle');
    return blockedError;
  }
  throw new Error('预期 BlockedCapabilityError，但调用未抛错');
}

test.describe('matchOracleToProductEdges · LINE', () => {
  const oracleCurve: OracleEdgeCurve = { kind: 'line', p0: [0, 0, 0], p1: [10, 0, 0], lengthMm: 10 };

  test('端点顺序无关，容差内命中', () => {
    const result = matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [line(1, [10, 0, 0], [0, 0, 0])],
    );
    expect(result.handles.map((handle) => handle.subEntityId)).toEqual([1]);
    expect(result.notes[0]).toContain('tol=0.05mm');
  });

  test('端点/长度超差 → 0 匹配阻塞', () => {
    const outside = blocked(() => matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [line(1, [0.06, 0, 0], [10.06, 0, 0])],
    ));
    expect(outside.message).toContain('匹配 0 条产品边');

    const wrongLength = blocked(() => matchOracleToProductEdges(
      { edges: [{ ...oracleCurve, lengthMm: 9 }] },
      [line(1, [0, 0, 0], [10, 0, 0])],
    ));
    expect(wrongLength.message).toContain('匹配 0 条产品边');
  });

  test('非 line 产品曲线不匹配（不按端点降级）', () => {
    expect(() => matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [arc(1, [5, 0, 0], 5, [10, 0, 0], [0, 0, 0], Math.PI)],
    )).toThrow(BlockedCapabilityError);
  });
});

test.describe('matchOracleToProductEdges · CIRCLE / ARC', () => {
  test('CIRCLE 圆心+半径+法向；产品整圆 kind=arc', () => {
    const result = matchOracleToProductEdges(
      { edges: [{ kind: 'circle', center: [20, 0, 0], radius: 5, normal: [0, 0, 1] }] },
      [fullCircle(1, [20.01, 0, 0], 5.01, [0, 0, -1])],
    );
    expect(result.handles[0]!.subEntityId).toBe(1);
  });

  test('CIRCLE 不匹配非整圆 arc', () => {
    expect(() => matchOracleToProductEdges(
      { edges: [{ kind: 'circle', center: [0, 0, 0], radius: 5 }] },
      [arc(1, [0, 0, 0], 5, [5, 0, 0], [0, 5, 0], Math.PI / 2)],
    )).toThrow(BlockedCapabilityError);
  });

  test('ARC 起终点顺序无关 + sweep；圆心/半径超差阻塞', () => {
    const oracleCurve: OracleEdgeCurve = {
      kind: 'arc', center: [40, 0, 0], radius: 5, normal: [0, 0, 1],
      start: [45, 0, 0], end: [40, 5, 0], sweepRadians: Math.PI / 2,
    };
    const result = matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [arc(7, [40, 0, 0], 5, [40, 5, 0], [45, 0, 0], Math.PI / 2)],
    );
    expect(result.handles[0]!.subEntityId).toBe(7);

    const wrongSweep = blocked(() => matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [arc(7, [40, 0, 0], 5, [40, 5, 0], [45, 0, 0], Math.PI / 2 + 0.01)],
    ));
    expect(wrongSweep.message).toContain('匹配 0 条产品边');

    const wrongCenter = blocked(() => matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [arc(7, [40.1, 0, 0], 5, [40, 5, 0], [45, 0, 0], Math.PI / 2)],
    ));
    expect(wrongCenter.message).toContain('匹配 0 条产品边');
  });

  test('法向可反平行，非平行阻塞（可关闭校验）', () => {
    const oracleCurve: OracleEdgeCurve = { kind: 'circle', center: [0, 0, 0], radius: 5, normal: [0, 1, 0] };
    expect(() => matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [fullCircle(1, [0, 0, 0], 5, [0, 0, 1])],
    )).toThrow(BlockedCapabilityError);
    const result = matchOracleToProductEdges(
      { edges: [oracleCurve] },
      [fullCircle(1, [0, 0, 0], 5, [0, 0, 1])],
      { checkNormals: false },
    );
    expect(result.handles).toHaveLength(1);
  });
});

test.describe('matchOracleToProductEdges · fail closed', () => {
  test('同一 oracle 曲线命中 2 条产品边 → 阻塞（不挑第一条）', () => {
    const error = blocked(() => matchOracleToProductEdges(
      { edges: [{ kind: 'line', p0: [0, 0, 0], p1: [10, 0, 0] }] },
      [line(1, [0, 0, 0], [10, 0, 0]), line(2, [10, 0, 0], [0, 0, 0])],
    ));
    expect(error.message).toContain('匹配 2 条产品边');
    expect(error.message).toContain('b1:1');
    expect(error.message).toContain('b1:2');
  });

  test('两条 oracle 曲线命中同一产品边 → 阻塞', () => {
    const curve: OracleEdgeCurve = { kind: 'line', p0: [0, 0, 0], p1: [10, 0, 0] };
    const error = blocked(() => matchOracleToProductEdges(
      { edges: [curve, { ...curve, lengthMm: 10 }] },
      [line(1, [0, 0, 0], [10, 0, 0])],
    ));
    expect(error.message).toContain('命中同一产品边');
  });

  test('空 oracle / 空产品边集 / 非法容差阻塞', () => {
    blocked(() => matchOracleToProductEdges({ edges: [] }, [line(1, [0, 0, 0], [1, 0, 0])]));
    blocked(() => matchOracleToProductEdges(
      { edges: [{ kind: 'line', p0: [0, 0, 0], p1: [1, 0, 0] }] },
      [],
    ));
    blocked(() => matchOracleToProductEdges(
      { edges: [{ kind: 'line', p0: [0, 0, 0], p1: [1, 0, 0] }] },
      [line(1, [0, 0, 0], [1, 0, 0])],
      { toleranceMm: 0 },
    ));
  });

  test('合成 oracle-to-product：line + circle + arc 各命中唯一产品边', () => {
    const result = matchOracleToProductEdges(
      {
        edges: [
          { kind: 'line', p0: [0, 0, 0], p1: [10, 0, 0], lengthMm: 10 },
          { kind: 'circle', center: [20, 0, 0], radius: 5 },
          {
            kind: 'arc', center: [40, 0, 0], radius: 5,
            start: [45, 0, 0], end: [40, 5, 0], sweepRadians: Math.PI / 2,
          },
        ],
      },
      [
        line(1, [10, 0, 0], [0, 0, 0]), // line（反向）
        line(2, [0, 5, 0], [10, 5, 0]), // 干扰
        fullCircle(3, [20, 0, 0], 5),
        fullCircle(4, [20, 0, 0], 6), // 干扰
        arc(5, [40, 0, 0], 5, [40, 5, 0], [45, 0, 0], Math.PI / 2),
        arc(6, [40, 0, 0], 5, [45, 0, 0], [40, 5, 0], Math.PI / 3), // 干扰
      ],
    );
    expect(result.handles.map((handle) => handle.subEntityId).sort((a, b) => a - b)).toEqual([1, 3, 5]);
    expect(result.matches.map((match) => match.oracleIndex)).toEqual([0, 1, 2]);
  });
});

test.describe('manifest 解析与 Part Studio 过滤', () => {
  const manifestValue = {
    schemaVersion: 1,
    units: { length: 'mm' },
    features: [
      {
        docId: 'doc-a', elementId: 'elem-a', psName: 'PS A',
        featureId: 'F1', featureName: 'Fillet 1', featureType: 'fillet', rollbackBarIndex: 3,
        bodyEdgeCount: 20, edgeCount: 1, coversAllBodyEdges: false,
        unselectedBodyEdgeIds: ['E2'],
        edges: [{ kind: 'line', p0: [0, 0, 0], p1: [1, 0, 0], lengthMm: 1 }],
      },
      {
        docId: 'doc-a', elementId: 'elem-a', psName: 'PS A',
        featureId: 'F2', featureName: 'Fillet 2', featureType: 'fillet',
        status: 'blocked', blockedReason: 'unresolved-curve', edges: [],
      },
      {
        docId: 'doc-b', elementId: 'elem-b', psName: 'PS B',
        featureId: 'F3', featureName: 'Chamfer 1', featureType: 'chamfer',
        edges: [{ kind: 'circle', center: [0, 0, 0], radius: 2 }],
      },
    ],
  };

  test('严格解析 + 双键索引（包含 blocked 条目供显式阻塞）', () => {
    const manifest = parseRollbackEdgeOracleManifest(manifestValue);
    expect(manifest.summary).toBeUndefined();
    const map = edgeOracleMapForPartStudio(manifest, { docId: 'doc-a', elementId: 'elem-a' });
    expect(map.get('F1')?.featureName).toBe('Fillet 1');
    expect(map.get('Fillet 1')?.featureId).toBe('F1');
    expect(map.get('F2')?.status).toBe('blocked');
    expect(map.get('Fillet 2')?.blockedReason).toBe('unresolved-curve');
    expect(map.get('F3')).toBeUndefined();

    const all = edgeOracleMapForPartStudio(manifest);
    expect(all.size).toBe(6);
  });

  test('结构/曲线非法即抛错（不透传坏 manifest）', () => {
    expect(() => parseRollbackEdgeOracleManifest({ schemaVersion: 2, features: [] }))
      .toThrow(/schemaVersion/);
    expect(() => parseRollbackEdgeOracleManifest({
      schemaVersion: 1,
      features: [{ featureName: 'Fillet 1', edges: [{ kind: 'ellipse' }] }],
    })).toThrow(/不支持的曲线 kind/);
    expect(() => parseRollbackEdgeOracleManifest({
      schemaVersion: 1,
      features: [{ featureName: 'Fillet 1', edges: [{ kind: 'line', p0: [0, 0], p1: [1, 0, 0] }] }],
    })).toThrow(/LINE 端点非法/);
  });
});

test.describe('scopeOracleHandles', () => {
  const handles = [
    line(1, [0, 0, 0], [1, 0, 0], 'b1'),
    line(2, [0, 0, 0], [1, 0, 0], 'b2'),
  ];

  test('单 body 直接使用', () => {
    const scoped = scopeOracleHandles([handles[0]!]);
    expect(scoped.handles).toHaveLength(1);
    expect(scoped.bodyKeys).toEqual(['b1']);
  });

  test('多 body + 唯一显式 scope → 收敛', () => {
    const scoped = scopeOracleHandles(handles, {
      bodyKeyBySource: new Map([['src1', 'b2'], ['src2', 'b2']]),
    });
    expect(scoped.handles.map((handle) => handle.bodyKey)).toEqual(['b2']);
    expect(scoped.note).toContain('bodyScope=b2');
  });

  test('多 body 无/多显式 scope → 阻塞（不按命中猜）', () => {
    blocked(() => scopeOracleHandles(handles));
    blocked(() => scopeOracleHandles(handles, {
      bodyKeyBySource: new Map([['src1', 'b1'], ['src2', 'b2']]),
    }));
  });
});

test('默认容差为文档化的 0.05 mm', () => {
  expect(T).toBe(0.05);
});

test.describe('Bumper rb=3 oracle fail-closed evidence', () => {
  test('oracle 16/20 + product curvePrimitive → audited fallback 依据', () => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    const oracleFile = path.join(DEFAULT_DATA_ROOT, 'manifest', 'face-oracle-edges.json');
    test.skip(!existsSync(oracleFile), 'face-oracle-edges.json 不在场');
    const manifest = loadRollbackEdgeOracleManifest(oracleFile);
    const map = edgeOracleMapForPartStudio(manifest, { psName: 'Bumper Block' });
    const oracle = map.get('Fillet 1');
    expect(oracle, 'Bumper Fillet 1 oracle 缺失').toBeDefined();
    expect(oracle!.status).toBe('ready');
    // 指定展开规则（matched edge + matched face loops）只能覆盖 16/20 条
    // body 边（缺底面 loop 4 条），因此永远达不到审计 20 边的严格门。
    expect(oracle!.edges.length, 'oracle 只能展开 16/20 条 body 边').toBe(16);
    expect(oracle!.bodyEdgeCount).toBe(20);

    // 合成产品句柄：前 12 条 oracle 曲线可匹配；其余 4 条按真栈实测的
    // approximate Extrude 2 锥面斜边表示（kind:'other'/curvePrimitive，无几何）。
    // 匹配器必须 fail closed，而不是把 12 条当成功或猜 4 条。
    const lineCurves = oracle!.edges.filter((curve): curve is OracleLineEdge => curve.kind === 'line');
    expect(lineCurves.length).toBe(16);
    const handles: EdgeHandle[] = [
      ...lineCurves.slice(0, 12).map((curve, index) => body(index + 1, {
        kind: 'line',
        p0: curve.p0,
        p1: curve.p1,
      })),
      ...Array.from({ length: 4 }, (_value, index) => body(100 + index, {
        kind: 'other',
        geometryType: 'curvePrimitive',
      })),
    ];
    const error = blocked(() => matchOracleToProductEdges(oracle!, handles));
    expect(error.message).toContain('匹配 0 条产品边');
    expect(error.message).toContain('other:curvePrimitive');
  });
});
