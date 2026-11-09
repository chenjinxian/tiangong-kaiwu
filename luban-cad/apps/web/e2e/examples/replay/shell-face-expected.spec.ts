/** shell 端面静态推导单测（无浏览器，不需要真栈）。 */
import { expect, test } from '@playwright/test';
import { BlockedCapabilityError, type ParityScenario } from './scenario-to-op.js';
import {
  expectedShellFace,
  resolveShellTargetBodyKey,
  type ShellQuery,
} from './shell-face-resolver.js';

function scenarioWithExtrude(overrides: Record<string, unknown> = {}): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'shell-capface-unit',
    features: [
      {
        type: 'sketch',
        name: 'Sketch 1',
        sourceFeatureId: 'sk',
        params: {
          plane: {
            origin: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            xDir: { x: 1, y: 0, z: 0 },
          },
          entities: [
            { kind: 'point', id: 1, x: 0, y: 0 },
            { kind: 'circle', id: 2, center: 1, radius: 5 },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Extrude 1',
        sourceFeatureId: 'ex',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          oppositeDirection: false,
          symmetric: false,
          selection: { kind: 'imprintFace', sketchFeatureId: 'sk' },
          ...overrides,
        },
      },
    ],
  };
}

const capQuery = (isStart: boolean): ShellQuery => ({
  kind: 'capFace',
  sketchFeatureId: 'sk',
  sketchEntityId: 2,
  operationSourceIds: ['ex', 'sk'],
  isStart,
});

test.describe('shell capFace 端面静态推导', () => {
  test('blind 拉伸：start=草图平面，end=法向深度处', () => {
    const scenario = scenarioWithExtrude();
    const start = expectedShellFace(capQuery(true), scenario);
    expect(start).toBeDefined();
    expect(start!.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(start!.axisDir).toEqual({ x: 0, y: 0, z: 1 });
    expect(start!.outerRadius).toBe(5);
    const end = expectedShellFace(capQuery(false), scenario);
    expect(end!.center).toEqual({ x: 0, y: 0, z: 10 });
  });

  test('oppositeDirection：end 在 −法向侧', () => {
    const end = expectedShellFace(capQuery(false), scenarioWithExtrude({ oppositeDirection: true }));
    expect(end!.center).toEqual({ x: 0, y: 0, z: -10 });
  });

  test('symmetric：start/end 在草图平面两侧 ±depth/2', () => {
    const scenario = scenarioWithExtrude({ symmetric: true });
    expect(expectedShellFace(capQuery(true), scenario)!.center).toEqual({ x: 0, y: 0, z: -5 });
    expect(expectedShellFace(capQuery(false), scenario)!.center).toEqual({ x: 0, y: 0, z: 5 });
  });

  test('throughAll / 非圆 / 缺深度 → 不可静态定位（undefined）', () => {
    expect(expectedShellFace(capQuery(false), scenarioWithExtrude({ endBound: 'throughAll' }))).toBeUndefined();
    expect(expectedShellFace(capQuery(false), scenarioWithExtrude({ depthMm: undefined }))).toBeUndefined();
    const lineQuery: ShellQuery = { ...capQuery(false), sketchEntityId: 3 };
    const scenario = scenarioWithExtrude();
    (scenario.features[0]!.params.entities as unknown[]).push({
      kind: 'line', id: 3, p1: 1, p2: 2,
    });
    expect(expectedShellFace(lineQuery, scenario)).toBeUndefined();
  });

  test('未知 query kind → undefined（不猜面）', () => {
    const scenario = scenarioWithExtrude();
    expect(expectedShellFace({ ...capQuery(false), kind: 'unknownFace' }, scenario)).toBeUndefined();
  });
});

test.describe('shell 多体目标 body 解析', () => {
  test('单体：直接取唯一 body', () => {
    expect(resolveShellTargetBodyKey('Shell 1', [capQuery(true)], ['0x1'], {})).toBe('0x1');
  });

  test('多体：query 源经 bodyKeyBySource 唯一映射', () => {
    const context = { bodyKeyBySource: new Map([['ex', '0x3'], ['sk', '0x3']]) };
    expect(resolveShellTargetBodyKey('Shell 1', [capQuery(true)], ['0x1', '0x3'], context)).toBe('0x3');
  });

  test('多体：无映射 / 多映射 / 无 body 一律阻塞', () => {
    expect(() => resolveShellTargetBodyKey('Shell 1', [capQuery(true)], ['0x1', '0x2'], {}))
      .toThrow(BlockedCapabilityError);
    expect(() => resolveShellTargetBodyKey('Shell 1', [capQuery(true)], ['0x1', '0x2'], {
      bodyKeyBySource: new Map([['ex', '0x1'], ['sk', '0x2']]),
    })).toThrow(BlockedCapabilityError);
    expect(() => resolveShellTargetBodyKey('Shell 1', [capQuery(true)], [], {})).toThrow(BlockedCapabilityError);
  });
});
