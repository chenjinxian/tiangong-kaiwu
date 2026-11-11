/** Translator 单测（Playwright test 运行，不需要真栈）。 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { BlockedCapabilityError, translateScenarioFeature, type ScenarioFeature } from './scenario-to-op.js';

const scenarioPath = path.join(process.cwd(), 'e2e', 'fixtures', 'parity', 'tutorial2.scenario.json');

test.describe('scenario → FeatureOp', () => {
  test('sketch 映射为 insertSketch，剥离 sourceId/sourceType', () => {
    const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8')) as { features: ScenarioFeature[] };
    const step = translateScenarioFeature(scenario.features[0]!);
    expect(step.op.kind).toBe('insertSketch');
    if (step.op.kind !== 'insertSketch') return;
    expect(step.op.entities.length).toBeGreaterThan(0);
    expect('sourceId' in (step.op.entities[0] as object)).toBe(false);
  });

  test('sketch mirror 约束原样透传（sourceIndex/sourceType 剥离）', () => {
    const feature: ScenarioFeature = {
      type: 'sketch',
      name: 'Sketch 1',
      params: {
        entities: [
          { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } },
          { kind: 'line', id: 2, p1: { x: -5, y: 0 }, p2: { x: -5, y: 10 } },
          { kind: 'line', id: 3, p1: { x: 5, y: 0 }, p2: { x: 5, y: 10 } },
        ],
        constraints: [{
          id: 9, sourceIndex: 8, sourceType: 'MIRROR', kind: 'mirror',
          refs: [{ entity: 2, part: 'start' }, { entity: 3, part: 'start' }, 1],
        }],
      },
    };
    const step = translateScenarioFeature(feature);
    expect(step.op.kind).toBe('insertSketch');
    if (step.op.kind !== 'insertSketch') return;
    expect(step.op.constraints).toEqual([{
      id: 9, kind: 'mirror',
      refs: [{ entity: 2, part: 'start' }, { entity: 3, part: 'start' }, 1],
    }]);
  });

  test('CENTERLINE_DIMENSION 圆心/线端点形态原样透传为 distance（sourceType 剥离）', () => {
    // converter（私有仓）已把中心线尺寸“跨中心线全宽”÷2：圆心+线（value=40）
    // 对应圆心到中心线 40；线端点+线（value=12.5）同理。translator 只做 DTO
    // 清洗，不得再改 value 或 refs 形态（结构化 center/端点引用由后端解析）。
    const feature: ScenarioFeature = {
      type: 'sketch',
      name: 'Sketch 1',
      params: {
        entities: [
          { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 10 },
          { kind: 'line', id: 2, p1: { x: -20, y: 40 }, p2: { x: 20, y: 40 } },
          { kind: 'line', id: 3, p1: { x: 0, y: 0 }, p2: { x: 0, y: 25 } },
        ],
        constraints: [
          {
            id: 10, sourceIndex: 9, sourceType: 'CENTERLINE_DIMENSION', kind: 'distance',
            refs: [{ entity: 1, part: 'center' }, 2], value: 40,
          },
          {
            id: 11, sourceIndex: 10, sourceType: 'CENTERLINE_DIMENSION', kind: 'distance',
            refs: [{ entity: 3, part: 'start' }, 2], value: 12.5,
          },
        ],
      },
    };
    const step = translateScenarioFeature(feature);
    expect(step.op.kind).toBe('insertSketch');
    if (step.op.kind !== 'insertSketch') return;
    expect(step.op.constraints).toEqual([
      { id: 10, kind: 'distance', refs: [{ entity: 1, part: 'center' }, 2], value: 40 },
      { id: 11, kind: 'distance', refs: [{ entity: 3, part: 'start' }, 2], value: 12.5 },
    ]);
  });

  test('sketchRegions 面域索引映射到 extrude.regions', () => {
    const feature: ScenarioFeature = {
      type: 'extrude',
      name: 'Extrude 1',
      params: {
        operation: 'add',
        endBound: 'blind',
        depthMm: 10,
        selection: { kind: 'sketchRegions', sketchFeatureId: 'onshape-sketch', regions: [1, 3, 1] },
      },
    };
    const step = translateScenarioFeature(feature, {
      sketchIdBySource: new Map([['onshape-sketch', 'local-sketch']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('extrude');
    expect(step.op.params).toMatchObject({ sketchId: 'local-sketch', regions: [1, 3], distance: 10, operation: 'add' });
    expect(step.approximate).toBe(false);
  });

  test('imprintFace 只做显式近似并记 note，不静默当 region 0', () => {
    const feature: ScenarioFeature = {
      type: 'extrude',
      name: 'Extrude 1',
      params: {
        operation: 'new',
        endBound: 'blind',
        depthMm: 10,
        selection: { kind: 'imprintFace', sketchFeatureId: 's' },
      },
    };
    const step = translateScenarioFeature(feature, {
      sketchIdBySource: new Map([['s', 'sk']]),
    });
    expect(step.approximate).toBe(true);
    expect(step.notes.join(' ')).toContain('imprintFace');
  });

  test('faceExtrude 由已解析 faceRef 映射为 insertFeature，不近似', () => {
    const feature: ScenarioFeature = {
      type: 'faceExtrude',
      name: 'Extrude 2',
      params: {
        operation: 'add',
        endBound: 'blind',
        depthMm: 50,
        direction: 'backward',
        bodyId: 'body-1',
        faceRef: { nodeId: 12, entityId: 34 },
        mergeScope: [{ bodyKey: 'body-1' }],
      },
    };
    const step = translateScenarioFeature(feature);
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('faceExtrude');
    expect(step.op.targetBodyId).toBe('body-1');
    expect(step.op.params).toMatchObject({
      bodyId: 'body-1',
      faceRef: { nodeId: 12, entityId: 34 },
      operation: 'add',
      endBound: 'blind',
      depthMm: 50,
      direction: 'backward',
      mergeScope: [{ bodyKey: 'body-1' }],
    });
    expect(step.approximate).toBe(false);
  });

  test('faceExtrude D2：splitByLine（void + keepPoint）原样透传；缺端点/非法侧向阻塞', () => {
    const splitByLine = {
      start: { x: 50.8, y: 0, z: 25.4 },
      end: { x: 25.4, y: 0, z: 76.2 },
      keepSide: 'left',
      keepPoint: { x: 37.2, y: 0, z: 50.35 },
      region: 'void',
    };
    const step = translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 3',
      params: {
        operation: 'add', endBound: 'blind', depthMm: 25.4,
        bodyId: 'body-1', faceRef: { nodeId: 5, entityId: 5 },
        splitByLine,
      },
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ splitByLine });
    expect(step.notes.join(' ')).toContain('split=void/left');
    expect(() => translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 3',
      params: {
        operation: 'add', endBound: 'blind', depthMm: 25.4,
        bodyId: 'body-1', faceRef: { nodeId: 5, entityId: 5 },
        splitByLine: { start: { x: 0, y: 0 }, end: { x: 1, y: 1, z: 0 }, keepSide: 'left' },
      },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 3',
      params: {
        operation: 'add', endBound: 'blind', depthMm: 25.4,
        bodyId: 'body-1', faceRef: { nodeId: 5, entityId: 5 },
        splitByLine: { start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, keepSide: 'up' },
      },
    })).toThrow(BlockedCapabilityError);
  });

  test('faceExtrude NEW / 缺 faceRef 诚实阻塞', () => {
    expect(() => translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 2',
      params: {
        operation: 'new', endBound: 'blind', depthMm: 1,
        bodyId: 'body-1', faceRef: { nodeId: 1, entityId: 2 },
      },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 2',
      params: { operation: 'add', endBound: 'blind', depthMm: 1, bodyId: 'body-1' },
    })).toThrow(BlockedCapabilityError);
  });

  test('faceExtrude 源证据 no-op remove（v1.67）：仅 remove + 非空证据，透传且不解析 faceRef', () => {
    const step = translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 5',
      params: {
        operation: 'remove', endBound: 'blind', depthMm: 76.2,
        bodyId: 'body-1', noOpEvidence: 'bodydetails rb8 == final',
      },
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('faceExtrude');
    expect(step.op.params).toMatchObject({
      operation: 'remove',
      bodyId: 'body-1',
      noOpEvidence: 'bodydetails rb8 == final',
    });
    expect('faceRef' in step.op.params).toBe(false);
    expect(step.notes.join(' ')).toContain('no-op remove');

    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E5',
      params: { operation: 'add', endBound: 'blind', depthMm: 1, bodyId: 'b', noOpEvidence: 'e' },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E5',
      params: { operation: 'remove', endBound: 'blind', depthMm: 1, bodyId: 'b', noOpEvidence: '   ' },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E5',
      params: { operation: 'remove', endBound: 'blind', depthMm: 1, bodyId: 'b' },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E5',
      params: {
        operation: 'remove', endBound: 'blind', depthMm: 1, bodyId: 'b', noOpEvidence: 'e',
        splitByLine: { start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, keepSide: 'left' },
      },
    })).toThrow(BlockedCapabilityError);
  });

  test('throughAll remove extrude：booleanScope 两个造体源 → targetBodyIds（跳过 sketch 源）', () => {
    const step = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 3',
      params: {
        operation: 'remove', endBound: 'through_all', sketchFeatureId: 's', depthMm: 2,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
        booleanScopeFeatureIds: ['s1', 'e1', 'e2'],
      },
    }, {
      sketchIdBySource: new Map([['s', 'sk']]),
      bodyKeyBySource: new Map([['e1', 'body-1'], ['e2', 'body-2']]),
      allBodyKeys: ['body-1', 'body-2'],
      scenarioFeatureTypeBySource: new Map([['s1', 'sketch'], ['e1', 'extrude'], ['e2', 'extrude']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.targetBodyIds).toEqual(['body-1', 'body-2']);
    expect(step.op.targetBodyId).toBeUndefined();
    expect(step.notes.join(' ')).toContain('targetBodies=body-1,body-2');

    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 3',
      params: {
        operation: 'remove', endBound: 'through_all', sketchFeatureId: 's', depthMm: 2,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
        booleanScopeFeatureIds: ['e1', 'e2'],
      },
    }, {
      sketchIdBySource: new Map([['s', 'sk']]),
      bodyKeyBySource: new Map([['e1', 'body-1']]),
      allBodyKeys: ['body-1', 'body-2'],
      scenarioFeatureTypeBySource: new Map([['e1', 'extrude'], ['e2', 'extrude']]),
    })).toThrow(BlockedCapabilityError);
  });

  test('extrude 拔模（v1.51）：弧度→度 + 反向键；方向语义未校准标 approximate', () => {
    const step = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 1',
      params: {
        operation: 'new',
        endBound: 'blind',
        depthMm: 10,
        hasDraft: true,
        draftAngleDeg: Math.PI / 18,
        draftPullDirection: true,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({
      draftAngleDeg: 10,
      draftPullDirection: true,
      distance: 10,
    });
    expect(step.approximate).toBe(true);
    expect(step.notes.join(' ')).toContain('Onshape live 几何未独立校准');
  });

  test('faceExtrude 起始面（ADR-0016 A3）：startOffset/draft（弧度→度）透传、不近似', () => {
    const step = translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude 2',
      params: {
        operation: 'add',
        endBound: 'blind',
        depthMm: 40,
        bodyId: 'body-1',
        faceRef: { nodeId: 3, entityId: 4 },
        direction: 'forward',
        startOffsetMm: 0,
        hasDraft: true,
        draftAngleDeg: Math.PI / 18,
        draftPullDirection: true,
      },
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('faceExtrude');
    expect(step.op.params).toMatchObject({
      bodyId: 'body-1',
      faceRef: { nodeId: 3, entityId: 4 },
      operation: 'add',
      endBound: 'blind',
      depthMm: 40,
      direction: 'forward',
      startOffsetMm: 0,
      draftAngleDeg: 10,
      draftPullDirection: true,
    });
    expect(step.approximate).toBe(false);
    expect(step.notes.join(' ')).toContain('startOffset=0 mm');
    expect(step.notes.join(' ')).toContain('draft=10.000°(reverse)');
  });

  test('faceExtrude S3（ADR-0016）：REMOVE/INTERSECT + throughAll + backward 透传', () => {
    for (const [operation, direction] of [['remove', 'backward'], ['intersect', 'forward']] as const) {
      const step = translateScenarioFeature({
        type: 'faceExtrude',
        name: `Extrude ${operation}`,
        params: {
          operation,
          endBound: 'throughAll',
          bodyId: 'body-1',
          faceRef: { nodeId: 5, entityId: 6 },
          direction,
          startOffsetMm: 0,
        },
      });
      expect(step.op.kind).toBe('insertFeature');
      if (step.op.kind !== 'insertFeature') return;
      expect(step.op.featureType).toBe('faceExtrude');
      expect(step.op.targetBodyId).toBe('body-1');
      expect(step.op.params).toMatchObject({
        bodyId: 'body-1',
        faceRef: { nodeId: 5, entityId: 6 },
        operation,
        endBound: 'throughAll',
        direction,
        startOffsetMm: 0,
      });
      expect((step.op.params as Record<string, unknown>).depthMm).toBeUndefined();
      expect(step.approximate).toBe(false);
    }
  });

  test('faceExtrude S3 review：throughAll 显式忽略 depthMm；blind 透传；非法 direction fail closed', () => {
    // throughAll 即使输入带 depthMm（25）也不进入产品载荷。
    const throughAll = translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude throughAll',
      params: {
        operation: 'remove',
        endBound: 'throughAll',
        depthMm: 25,
        bodyId: 'body-1',
        faceRef: { nodeId: 5, entityId: 6 },
        direction: 'backward',
      },
    });
    expect(throughAll.op.kind).toBe('insertFeature');
    if (throughAll.op.kind !== 'insertFeature') return;
    expect((throughAll.op.params as Record<string, unknown>).depthMm).toBeUndefined();
    expect(throughAll.op.params).toMatchObject({ endBound: 'throughAll', direction: 'backward' });
    expect(throughAll.notes.join(' ')).toContain('忽略 depthMm');

    // blind 才透传 depthMm。
    const blind = translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude blind',
      params: {
        operation: 'remove',
        endBound: 'blind',
        depthMm: 5,
        bodyId: 'body-1',
        faceRef: { nodeId: 5, entityId: 6 },
        direction: 'forward',
      },
    });
    expect(blind.op.kind).toBe('insertFeature');
    if (blind.op.kind !== 'insertFeature') return;
    expect(blind.op.params).toMatchObject({ endBound: 'blind', depthMm: 5, direction: 'forward' });

    // 未知 direction 不得静默降级 forward。
    expect(() => translateScenarioFeature({
      type: 'faceExtrude',
      name: 'Extrude bad-direction',
      params: {
        operation: 'remove',
        endBound: 'blind',
        depthMm: 5,
        bodyId: 'body-1',
        faceRef: { nodeId: 5, entityId: 6 },
        direction: 'sideways',
      },
    })).toThrow(BlockedCapabilityError);
  });

  test('faceExtrude draft 非法组合 → blocked（非 blind / 缺角度 / 孤 pullDirection）', () => {
    const base = {
      operation: 'add',
      depthMm: 10,
      bodyId: 'body-1',
      faceRef: { nodeId: 1, entityId: 2 },
    };
    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E',
      params: { ...base, endBound: 'throughAll', hasDraft: true, draftAngleDeg: Math.PI / 18 },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E',
      params: { ...base, endBound: 'blind', hasDraft: true },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'faceExtrude', name: 'E',
      params: { ...base, endBound: 'blind', draftPullDirection: true },
    })).toThrow(BlockedCapabilityError);
  });

  test('capFaceProfile 未由 runner 解析 → blocked，不退回草图面域近似', () => {
    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 2',
      params: {
        operation: 'add',
        endBound: 'blind',
        depthMm: 40,
        hasDraft: true,
        draftAngleDeg: Math.PI / 18,
        draftPullDirection: true,
        selection: {
          kind: 'capFaceProfile',
          upstreamId: 'onshape-extrude-1',
          startOffsetMm: 0,
          startFace: {
            plane: { origin: { x: 0, y: 0, z: 40 }, normal: { x: 0, y: 0, z: 1 } },
            areaMm2: 9000,
          },
        },
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) })).toThrow(BlockedCapabilityError);
  });

  test('CAP_FACE 起始面（P2.1）：上游草图面域 + startOffsetMm + draft', () => {
    const step = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 2',
      params: {
        operation: 'add',
        endBound: 'blind',
        depthMm: 40,
        hasDraft: true,
        draftAngleDeg: Math.PI / 18,
        draftPullDirection: true,
        selection: {
          kind: 'capFaceExtrude',
          sketchFeatureId: 's',
          regions: [0],
          startOffsetMm: 40,
          approximateStartOffset: true,
          approximateDraft: true,
        },
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({
      sketchId: 'sk',
      regions: [0],
      startOffsetMm: 40,
      distance: 40,
      draftAngleDeg: 10,
      draftPullDirection: true,
    });
    expect(step.approximate).toBe(true);
    expect(step.notes.join(' ')).toContain('CAP_FACE 起始面');
  });

  test('CAP_FACE 反向起始面（P2.1b）：负 startOffsetMm + 起始面法向换算后的 forward', () => {
    const step = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 4',
      params: {
        operation: 'remove',
        endBound: 'blind',
        depthMm: 16.256,
        oppositeDirection: false,
        selection: {
          kind: 'capFaceExtrude',
          sketchFeatureId: 's',
          regions: [0],
          startOffsetMm: -63.5,
          approximateStartOffset: true,
        },
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({
      sketchId: 'sk',
      regions: [0],
      startOffsetMm: -63.5,
      distance: 16.256,
      operation: 'remove',
    });
    // 起始面在草图平面反侧，产品 direction 缺省 forward（负偏移已表达位置）。
    expect(step.op.params).not.toHaveProperty('direction');
  });

  test('extrude 拔模与 symmetric/非 blind 冲突 → blocked', () => {
    const context = { sketchIdBySource: new Map([['s', 'sk']]) };
    expect(() => translateScenarioFeature({
      type: 'extrude', name: 'Extrude 1',
      params: {
        operation: 'new', endBound: 'blind', depthMm: 10, hasDraft: true,
        draftAngleDeg: Math.PI / 18, symmetric: true,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'extrude', name: 'Extrude 1',
      params: {
        operation: 'new', endBound: 'throughAll', depthMm: 10, hasDraft: true,
        draftAngleDeg: Math.PI / 18,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
  });

  test('up_to_surface/up_to_body 用已解算深度静态近似为 blind，并标 approximate；缺深度阻塞', () => {
    const context = { sketchIdBySource: new Map([['s', 'sk']]) };
    const upToSurface = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 2',
      params: {
        operation: 'new',
        endBound: 'up_to_surface',
        depthMm: 25,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context);
    expect(upToSurface.op.kind).toBe('insertFeature');
    if (upToSurface.op.kind !== 'insertFeature') return;
    expect(upToSurface.op.params).toMatchObject({ endBound: 'blind', distance: 25 });
    expect(upToSurface.approximate).toBe(true);
    expect(upToSurface.notes.join(' ')).toContain('upToSurface→blind');
    expect(upToSurface.notes.join(' ')).toContain('产品 upToSurface 需 endFaceRef');

    const upToBody = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 3',
      params: {
        operation: 'add', endBound: 'up_to_body', depthMm: 10,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context);
    expect(upToBody.approximate).toBe(true); // 旧路径曾静默按 blind 处理，现显式标注

    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 4',
      params: {
        operation: 'new', endBound: 'up_to_vertex',
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
  });

  test('v1.60 upToVertex：草图顶点引用直通 endVertexRef；缺引用回退静态近似；坏引用阻塞', () => {
    const context = { sketchIdBySource: new Map([['s', 'sk'], ['s2', 'sk2']]) };
    const exact = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 5',
      params: {
        operation: 'add',
        endBound: 'up_to_vertex',
        depthMm: 3,
        endVertexRef: { sketchFeatureId: 's2', entityId: 1, part: 'start' },
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context);
    expect(exact.op.kind).toBe('insertFeature');
    if (exact.op.kind !== 'insertFeature') return;
    expect(exact.op.params).toMatchObject({
      endBound: 'upToVertex',
      distance: 3,
      endVertexRef: { sketchId: 'sk2', entityId: 1, part: 'start' },
    });
    expect(exact.approximate).toBe(false);
    expect(exact.notes.join(' ')).toContain('产品草图顶点');

    const newBody = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 5-new',
      params: {
        operation: 'new',
        endBound: 'up_to_vertex',
        depthMm: 3,
        endVertexRef: { sketchFeatureId: 's2', entityId: 1, part: 'start' },
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context);
    expect(newBody.op.kind).toBe('insertFeature');
    if (newBody.op.kind !== 'insertFeature') return;
    expect(newBody.op.params).toMatchObject({
      endBound: 'upToVertex',
      endVertexRef: { sketchId: 'sk2', entityId: 1, part: 'start' },
    });

    const fallback = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 6',
      params: {
        operation: 'add',
        endBound: 'up_to_vertex',
        depthMm: 3,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context);
    expect(fallback.op.kind).toBe('insertFeature');
    if (fallback.op.kind !== 'insertFeature') return;
    expect(fallback.op.params).toMatchObject({ endBound: 'blind', distance: 3 });
    expect(fallback.approximate).toBe(true);

    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 7',
      params: {
        operation: 'add', endBound: 'up_to_vertex', depthMm: 3,
        endVertexRef: { sketchFeatureId: 'missing', entityId: 1, part: 'start' },
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 8',
      params: {
        operation: 'add', endBound: 'up_to_vertex', depthMm: 3, symmetric: true,
        endVertexRef: { sketchFeatureId: 's2', entityId: 1, part: 'start' },
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 9',
      params: {
        operation: 'add', endBound: 'up_to_vertex', depthMm: 3,
        endVertexRef: { sketchFeatureId: 's2', entityId: 1, part: 'mid' },
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
  });

  test('v1.53 upToNext：直通 endBound（不标 approximate）；new/对称/拔模/第二方向阻塞', () => {
    const context = { sketchIdBySource: new Map([['s', 'sk']]) };
    const step = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 2',
      params: {
        operation: 'add',
        endBound: 'up_to_next',
        depthMm: 25,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context);
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ endBound: 'upToNext', distance: 25, operation: 'add' });
    expect(step.approximate).toBe(false);
    expect(step.notes.join(' ')).toContain('endBound=upToNext');

    expect(() => translateScenarioFeature({
      type: 'extrude', name: 'E-new',
      params: {
        operation: 'new', endBound: 'up_to_next', depthMm: 10,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'extrude', name: 'E-sym',
      params: {
        operation: 'add', endBound: 'up_to_next', depthMm: 10, symmetric: true,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, context)).toThrow(BlockedCapabilityError);
  });

  test('secondDirection blind/throughAll 透传；symmetric 互斥拒收', () => {
    const base: ScenarioFeature = {
      type: 'extrude',
      name: 'Extrude 1',
      params: {
        operation: 'add',
        endBound: 'blind',
        depthMm: 10,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
        secondDirection: { endBound: 'blind', distanceMm: 3 },
      },
    };
    const step = translateScenarioFeature(base, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ secondDirection: { endBound: 'blind', distanceMm: 3 } });

    const through = translateScenarioFeature({
      ...base,
      params: { ...base.params, secondDirection: { endBound: 'throughAll' } },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    if (through.op.kind !== 'insertFeature') throw new Error('expected insertFeature');
    expect(through.op.params).toMatchObject({ secondDirection: { endBound: 'throughAll' } });

    expect(() => translateScenarioFeature({
      ...base,
      params: { ...base.params, symmetric: true },
    }, { sketchIdBySource: new Map([['s', 'sk']]) }))
      .toThrow(BlockedCapabilityError);
  });

  test('secondDirection UP_TO_SURFACE 静态近似：blind(solvedDepth) + approximate + notes', () => {
    const step = translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 8',
      params: {
        operation: 'new',
        endBound: 'blind',
        depthMm: 10,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
        secondDirection: {
          endBound: 'blind',
          distanceMm: 25,
          approximate: true,
          sourceBound: 'UP_TO_SURFACE',
        },
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.approximate).toBe(true);
    expect(step.notes.some((note) => note.includes('secondDirection=UP_TO_SURFACE→blind(25mm'))).toBe(true);
    if (step.op.kind !== 'insertFeature') throw new Error('expected insertFeature');
    expect(step.op.params).toMatchObject({
      secondDirection: { endBound: 'blind', distanceMm: 25 },
    });
  });

  test('mirror 世界平面映射；非法面拒绝', () => {
    const step = translateScenarioFeature({
      type: 'mirror',
      name: 'Mirror 1',
      params: { plane: 'YZ', keepOriginal: true },
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('mirror');
    expect(step.op.params).toEqual({ plane: 'YZ', keepOriginal: true });
    expect(step.approximate).toBe(false);
    const approximate = translateScenarioFeature({
      type: 'mirror',
      name: 'Mirror 2',
      params: { plane: 'YZ', keepOriginal: true, featureAllApproximation: true },
    });
    expect(approximate.approximate).toBe(true);
    expect(approximate.notes.join(' ')).toContain('FEATURE_ALL');
    expect(() => translateScenarioFeature({
      type: 'mirror',
      name: 'Mirror 3',
      params: { plane: 'FACE', keepOriginal: true },
    })).toThrow(BlockedCapabilityError);
  });

  test('mirror operation：subtract/intersect 透传，NEW 标近似，非法值拒绝', () => {
    const mapped = (params: Record<string, unknown>) =>
      translateScenarioFeature({ type: 'mirror', name: 'Mirror op', params: { plane: 'YZ', keepOriginal: true, ...params } });
    const subtract = mapped({ operation: 'subtract' });
    expect(subtract.op.kind).toBe('insertFeature');
    if (subtract.op.kind !== 'insertFeature') return;
    expect(subtract.op.params).toMatchObject({ plane: 'YZ', keepOriginal: true, operation: 'subtract' });
    expect(subtract.approximate).toBe(false);
    const intersect = mapped({ operation: 'intersect' });
    expect(intersect.op.kind).toBe('insertFeature');
    if (intersect.op.kind !== 'insertFeature') return;
    expect(intersect.op.params).toMatchObject({ plane: 'YZ', keepOriginal: true, operation: 'intersect' });
    // unite 缺省不写 operation（旧载荷逐字兼容）。
    const unite = mapped({ operation: 'unite' });
    expect(unite.op.kind).toBe('insertFeature');
    if (unite.op.kind !== 'insertFeature') return;
    expect(unite.op.params).toEqual({ plane: 'YZ', keepOriginal: true });
    const newBody = mapped({ newBodyApproximation: true });
    expect(newBody.approximate).toBe(true);
    expect(newBody.notes.join(' ')).toContain('多体输出');
    expect(() => mapped({ operation: 'union' })).toThrow(BlockedCapabilityError);
  });

  test('cPlane OFFSET 映射为 insertFeature cPlane', () => {
    const step = translateScenarioFeature({
      type: 'cPlane',
      name: 'Plane 2',
      params: { reference: 'front', offsetMm: 25.4, flipNormal: false, onshapeType: 'OFFSET' },
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('cPlane');
    expect(step.op.params).toMatchObject({ reference: 'front', offsetMm: 25.4, flipNormal: false });
  });

  test('cPlane PLANE_POINT 映射 origin 且不叠加 offset', () => {
    const step = translateScenarioFeature({
      type: 'cPlane',
      name: 'Plane 1',
      params: {
        reference: 'front',
        origin: { x: 0, y: -12.5, z: 0 },
        flipNormal: true,
        onshapeType: 'PLANE_POINT',
      },
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('cPlane');
    expect(step.op.params).toMatchObject({
      reference: 'front',
      origin: { x: 0, y: -12.5, z: 0 },
      flipNormal: true,
    });
    expect('offsetMm' in step.op.params).toBe(false);
    expect(step.notes.join(' ')).toContain('PLANE_POINT');
  });

  test('cPlane THREE_POINT（frame 派生）透传三点并标 constructionApprox；退化阻塞', () => {
    const feature: ScenarioFeature = {
      type: 'cPlane',
      name: 'Spindle Location Plane',
      params: {
        reference: 'top',
        threePoints: [
          { x: 0, y: 0, z: 84.671482859 },
          { x: 1, y: 0, z: 84.671482859 },
          { x: 0, y: 1, z: 84.671482859 },
        ],
        constructionApprox: true,
        onshapeType: 'OFFSET',
      },
    };
    const step = translateScenarioFeature(feature);
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('cPlane');
    expect(step.op.params).toMatchObject({
      reference: 'top',
      threePoints: feature.params.threePoints,
    });
    expect(step.approximate).toBe(true);
    expect(step.notes.join(' ')).toContain('constructionApprox');

    expect(() => translateScenarioFeature({
      ...feature,
      params: {
        ...feature.params,
        threePoints: [
          { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 2, z: 0 },
        ],
      },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...feature,
      params: { ...feature.params, threePoints: [{ x: 0, y: 0, z: 0 }] },
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...feature,
      params: { ...feature.params, offsetMm: 5 },
    })).toThrow(BlockedCapabilityError);
  });

  test('sketch planeSourceFeatureId → 本地 cPlane sourceFeatureId；未构建即 blocked', () => {
    const feature: ScenarioFeature = {
      type: 'sketch',
      name: 'Sketch 4',
      params: {
        plane: {
          origin: { x: 0, y: -12.5, z: 0 },
          normal: { x: 0, y: -1, z: 0 },
          xDir: { x: 1, y: 0, z: 0 },
          name: 'Custom',
        },
        planeSourceFeatureId: 'onshape-plane',
        entities: [],
        constraints: [],
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-plane', 'local-plane']]),
    });
    expect(step.op.kind).toBe('insertSketch');
    if (step.op.kind !== 'insertSketch') return;
    expect(step.op.plane?.sourceFeatureId).toBe('local-plane');
    expect(() => translateScenarioFeature(feature, {
      featureIdBySource: new Map(),
    })).toThrow(BlockedCapabilityError);
  });

  test('extrude remove 的 booleanScope 解析为 targetBodyId；无 body 即 blocked', () => {
    const feature: ScenarioFeature = {
      type: 'extrude',
      name: 'Extrude 3',
      params: {
        operation: 'remove',
        endBound: 'blind',
        depthMm: 25,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
        booleanScopeFeatureIds: ['extrude-2'],
      },
    };
    const step = translateScenarioFeature(feature, {
      sketchIdBySource: new Map([['s', 'sk']]),
      bodyKeyBySource: new Map([['extrude-2', '0x22']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.targetBodyId).toBe('0x22');
    expect(step.notes.join(' ')).toContain('targetBody');
    expect(() => translateScenarioFeature(feature, {
      sketchIdBySource: new Map([['s', 'sk']]),
      bodyKeyBySource: new Map(),
    })).toThrow(BlockedCapabilityError);
  });

  test('hole 目标质心在草图法线负侧 → direction=backward（钻入材料）', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1],
        diameterMm: 5.5,
        endBound: 'throughAll',
        booleanScopeFeatureIds: ['grip'],
      },
    }, {
      sketchIdBySource: new Map([['s', 'sk']]),
      bodyKeyBySource: new Map([['grip', '0x11']]),
      bodyCentroidByKey: new Map([['0x11', { x: 0, y: -5, z: 0 }]]),
      sketchPlaneBySource: new Map([['s', {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      }]]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ direction: 'backward' });
    expect(step.notes.join(' ')).toContain('holeDirection=backward');
  });

  test('hole 透传 pointIds 与沉头孔参数', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1, 2, 3],
        holeStyle: 'counterbore',
        counterboreDiameterMm: 9.75,
        counterboreDepthMm: 5,
        diameterMm: 5.5,
        endBound: 'throughAll',
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('hole');
    expect(step.op.params).toMatchObject({
      sketchId: 'sk',
      pointIds: [1, 2, 3],
      holeStyle: 'counterbore',
      counterboreDiameterMm: 9.75,
      counterboreDepthMm: 5,
      diameterMm: 5.5,
      endBound: 'throughAll',
    });
  });

  test('hole 透传 tipAngleDeg（v1.50 钻尖）', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1],
        diameterMm: 4,
        endBound: 'blind',
        depthMm: 5,
        tipAngleDeg: 118,
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({
      endBound: 'blind',
      depthMm: 5,
      tipAngleDeg: 118,
    });
  });

  test('hole upToNext 单孔位直通（不透传 depth，记 note）', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1],
        diameterMm: 4,
        endBound: 'up_to_next',
        depthMm: 3,
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ endBound: 'upToNext', diameterMm: 4 });
    expect((step.op.params as Record<string, unknown>).depthMm).toBeUndefined();
    expect(step.notes.join(' ')).toContain('endBound=upToNext');
  });

  test('hole upToNext 多孔位逐孔直通（产品逐孔位目标面）', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1, 2],
        diameterMm: 4,
        endBound: 'upToNext',
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ endBound: 'upToNext', pointIds: [1, 2] });
  });

  test('hole endApprox（UP_TO_ENTITY 静态深度）→ blind + approximate', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1],
        diameterMm: 4,
        endBound: 'blind',
        depthMm: 12.7,
        endApprox: true,
        sourceEndStyle: 'UP_TO_ENTITY',
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ endBound: 'blind', depthMm: 12.7 });
    expect(step.approximate).toBe(true);
    expect(step.notes.join(' ')).toContain('UP_TO_ENTITY');
  });

  test('hole 倒角孔透传 countersink 直径/角度', () => {
    const step = translateScenarioFeature({
      type: 'hole',
      name: 'Hole 1',
      params: {
        sketchFeatureId: 's',
        pointIds: [1],
        holeStyle: 'countersink',
        countersinkDiameterMm: 6,
        countersinkAngleDeg: 90,
        diameterMm: 3.5,
        endBound: 'throughAll',
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({
      holeStyle: 'countersink',
      countersinkDiameterMm: 6,
      countersinkAngleDeg: 90,
      diameterMm: 3.5,
    });
  });

  test('revolve 接受 converter 的 axisSketchEntityId 形态，并统一发 regions', () => {
    const feature: ScenarioFeature = {
      type: 'revolve',
      name: 'Revolve 1',
      params: {
        sketchFeatureId: 's', regionIndex: 0, axisSketchEntityId: 1,
        fullRevolve: true, operation: 'new',
      },
    };
    const step = translateScenarioFeature(feature, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ sketchId: 'sk', regions: [0], axis: { sketchEntityId: 1 }, fullRevolve: true });
    expect('regionIndex' in step.op.params).toBe(false);
  });

  test('revolve 多面域 + regionRisk → 保留选集并标 approximate（不冒充完整复刻）', () => {
    const feature: ScenarioFeature = {
      type: 'revolve',
      name: 'Revolve 1',
      params: {
        sketchFeatureId: 's', regions: [0, 1, 2], regionRisk: true, axisSketchEntityId: 1,
        fullRevolve: true,
      },
    };
    const step = translateScenarioFeature(feature, { sketchIdBySource: new Map([['s', 'sk']]) });
    expect(step.approximate).toBe(true);
    expect(step.notes.some((note) => note.includes('regionRisk'))).toBe(true);
    if (step.op.kind !== 'insertFeature') throw new Error('expected insertFeature');
    expect(step.op.params).toMatchObject({ regions: [0, 1, 2] });
  });

  test('booleanBodies：源特征 id → bodyKey，union 无 target 时选非工具 body', () => {
    const feature: ScenarioFeature = {
      type: 'booleanBodies',
      name: 'Boolean 1',
      params: {
        operation: 'unite',
        targetSourceFeatureIds: [],
        toolSourceFeatureIds: ['extrude-1'],
        keepTools: false,
      },
    };
    const step = translateScenarioFeature(feature, {
      bodyKeyBySource: new Map([['extrude-1', '0x11'], ['extrude-2', '0x12']]),
      allBodyKeys: ['0x11', '0x12'],
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('booleanBodies');
    expect(step.op.params).toMatchObject({
      targets: [{ bodyKey: '0x12' }],
      tools: [{ bodyKey: '0x11' }],
      operation: 'unite',
      keepTools: false,
    });
  });

  test('booleanBodies：subtract 缺 target / body 源缺失 → blocked', () => {
    const subtract: ScenarioFeature = {
      type: 'booleanBodies',
      name: 'Boolean 1',
      params: { operation: 'subtract', toolSourceFeatureIds: ['extrude-1'] },
    };
    expect(() => translateScenarioFeature(subtract, {
      bodyKeyBySource: new Map([['extrude-1', '0x11']]), allBodyKeys: ['0x11'],
    })).toThrow(BlockedCapabilityError);
    const missing: ScenarioFeature = {
      type: 'booleanBodies', name: 'Boolean 2',
      params: { operation: 'unite', targetSourceFeatureIds: ['extrude-2'], toolSourceFeatureIds: ['extrude-1'] },
    };
    expect(() => translateScenarioFeature(missing, {
      bodyKeyBySource: new Map([['extrude-1', '0x11']]), allBodyKeys: ['0x11'],
    })).toThrow(BlockedCapabilityError);
  });

  test('transform：平移量透传，entities 源 → targetBodyId，directionApprox 标近似', () => {
    const feature: ScenarioFeature = {
      type: 'transform',
      name: 'Transform 1',
      params: {
        transformType: 'TRANSLATION_DISTANCE',
        translation: { x: 0, y: 0, z: -19.05 },
        targetSourceFeatureIds: ['extrude-3'],
        copy: false,
        directionApprox: true,
      },
    };
    const step = translateScenarioFeature(feature, {
      bodyKeyBySource: new Map([['extrude-3', '0x33']]),
      allBodyKeys: ['0x11', '0x22', '0x33'],
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('transform');
    expect(step.op.targetBodyId).toBe('0x33');
    expect(step.op.params).toEqual({ translation: { x: 0, y: 0, z: -19.05 }, copy: false });
    expect(step.approximate).toBe(true);
    expect(step.notes.join(' ')).toContain('directionApprox');
  });

  test('transform：缺 body 源 / copy / 多体缺上下文 → blocked', () => {
    const base: ScenarioFeature = {
      type: 'transform',
      name: 'Transform 1',
      params: {
        translation: { x: 1, y: 0, z: 0 },
        targetSourceFeatureIds: ['extrude-3'],
      },
    };
    expect(() => translateScenarioFeature(base, {
      bodyKeyBySource: new Map([['extrude-3', '0x33']]),
    })).not.toThrow();
    expect(() => translateScenarioFeature(base, {
      bodyKeyBySource: new Map([['other', '0x11']]),
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature(base, {
      allBodyKeys: ['0x11', '0x22'],
    })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...base,
      params: { ...base.params, copy: true },
    }, { bodyKeyBySource: new Map([['extrude-3', '0x33']]) })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...base,
      params: { translation: { x: Number.NaN, y: 0, z: 0 } },
    })).toThrow(BlockedCapabilityError);
  });

  test('fillet 边引用未解析时 blocked，不猜边', () => {
    expect(() => translateScenarioFeature({ type: 'fillet', name: 'Fillet 1', params: { radiusMm: 2 } }))
      .toThrow(BlockedCapabilityError);
  });

  test('featurePattern：FACE pattern 源 id 经 featureIdBySource 换本地 id，轴线段透传', () => {
    const feature: ScenarioFeature = {
      type: 'featurePattern',
      name: 'Circular pattern 1',
      sourceFeatureId: 'onshape-pattern',
      params: {
        sourceFeatureId: 'onshape-hole',
        kind: 'circular',
        count: 6,
        angle: 360,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-hole', 'local-hole']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('featurePattern');
    expect(step.op.params).toMatchObject({
      sourceFeatureId: 'local-hole',
      kind: 'circular',
      count: 6,
      angle: 360,
      axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
    });
    expect(step.approximate).toBe(false);
  });

  test('featurePattern linear：spacing/轴透传，directionRisk 标近似', () => {
    const feature: ScenarioFeature = {
      type: 'featurePattern',
      name: 'Linear pattern 1',
      params: {
        sourceFeatureId: 'onshape-rib',
        kind: 'linear',
        count: 4,
        spacing: 50,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        directionRisk: true,
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-rib', 'local-rib']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('featurePattern');
    expect(step.op.params).toMatchObject({
      sourceFeatureId: 'local-rib',
      kind: 'linear',
      count: 4,
      spacing: 50,
      axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    });
    expect(step.approximate).toBe(true);
    expect(step.notes.some((note) => note.includes('方向取自草图线'))).toBe(true);
  });

  test('featurePattern v1.59：多源 id 逐个换本地 id，载荷写 sourceFeatureIds', () => {
    const feature: ScenarioFeature = {
      type: 'featurePattern',
      name: 'Linear pattern 1',
      params: {
        sourceFeatureIds: ['onshape-a', 'onshape-b'],
        kind: 'linear',
        count: 3,
        spacing: 10,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-a', 'local-a'], ['onshape-b', 'local-b']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('featurePattern');
    expect(step.op.params).toMatchObject({
      sourceFeatureIds: ['local-a', 'local-b'],
      kind: 'linear', count: 3, spacing: 10,
    });
    expect(step.notes.some((note) => note.includes('多源'))).toBe(true);
  });

  test('featurePattern v1.59：单/多源并存或重复 → blocked', () => {
    const axis = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const base = { type: 'featurePattern' as const, name: 'P', params: { kind: 'linear' as const, count: 2, spacing: 1, axis } };
    const map = new Map([['a', 'local-a']]);
    expect(() => translateScenarioFeature({
      ...base, params: { ...base.params, sourceFeatureId: 'a', sourceFeatureIds: ['a'] },
    }, { featureIdBySource: map })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...base, params: { ...base.params, sourceFeatureIds: ['a', 'a'] },
    }, { featureIdBySource: map })).toThrow(BlockedCapabilityError);
  });

  test('featurePattern v1.61：secondDirection 网格透传；圆周/非法计数/零轴拒收', () => {
    const axis = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
    const step = translateScenarioFeature({
      type: 'featurePattern',
      name: 'Linear pattern grid',
      params: {
        sourceFeatureId: 'onshape-boss',
        kind: 'linear', count: 3, spacing: 6,
        axis,
        secondDirection: {
          count: 2, spacing: 5,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
        },
      },
    }, { featureIdBySource: new Map([['onshape-boss', 'local-boss']]) });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({
      kind: 'linear', count: 3, spacing: 6,
      secondDirection: {
        count: 2, spacing: 5,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } },
      },
    });
    expect(step.notes.some((note) => note.includes('第二方向'))).toBe(true);

    const map = { featureIdBySource: new Map([['onshape-boss', 'local-boss']]) };
    expect(() => translateScenarioFeature({
      type: 'featurePattern', name: 'P-circ', params: {
        sourceFeatureId: 'onshape-boss', kind: 'circular', count: 3, angle: 360, axis,
        secondDirection: { count: 2, spacing: 1, axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } } },
      },
    }, map)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'featurePattern', name: 'P-big', params: {
        sourceFeatureId: 'onshape-boss', kind: 'linear', count: 40, spacing: 1, axis,
        secondDirection: { count: 30, spacing: 1, axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } } },
      },
    }, map)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      type: 'featurePattern', name: 'P-zero', params: {
        sourceFeatureId: 'onshape-boss', kind: 'linear', count: 3, spacing: 1, axis,
        secondDirection: { count: 2, spacing: 1, axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } } },
      },
    }, map)).toThrow(BlockedCapabilityError);
  });

  test('featurePattern centered：透传 centered；偶数 count/圆周 centered 拒收', () => {
    const base = {
      type: 'featurePattern',
      name: 'Linear pattern centered',
      params: {
        sourceFeatureId: 'onshape-boss',
        kind: 'linear',
        count: 5,
        spacing: 10,
        centered: true,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      },
    };
    const step = translateScenarioFeature(base, {
      featureIdBySource: new Map([['onshape-boss', 'local-boss']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.params).toMatchObject({ centered: true, count: 5 });
    expect(step.notes.some((note) => note.includes('居中'))).toBe(true);
    expect(() => translateScenarioFeature({
      ...base,
      params: { ...base.params, count: 4 },
    }, { featureIdBySource: new Map([['onshape-boss', 'local-boss']]) })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...base,
      params: { ...base.params, kind: 'circular', angle: 360 },
    }, { featureIdBySource: new Map([['onshape-boss', 'local-boss']]) })).toThrow(BlockedCapabilityError);
  });

  test('mirror：planeLine 任意世界平面 + planeApprox 标近似', () => {
    const feature: ScenarioFeature = {
      type: 'mirror',
      name: 'Mirror 1',
      params: {
        planeLine: { origin: { x: 0, y: 25, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
        planeApprox: true,
        keepOriginal: true,
        scope: 'PART',
      },
    };
    const step = translateScenarioFeature(feature);
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('mirror');
    expect(step.op.params).toMatchObject({
      planeLine: { origin: { x: 0, y: 25, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
      keepOriginal: true,
    });
    expect(step.approximate).toBe(true);
    expect(step.notes.some((note) => note.includes('端盖静态推导'))).toBe(true);
  });

  test('featureMirror：源 id 经 featureIdBySource 换本地 id，planeLine 透传', () => {
    const feature: ScenarioFeature = {
      type: 'featureMirror',
      name: 'Mirror 1',
      params: {
        sourceFeatureId: 'onshape-cut',
        planeLine: { origin: { x: 20, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-cut', 'local-cut']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('featureMirror');
    expect(step.op.params).toMatchObject({
      sourceFeatureId: 'local-cut',
      planeLine: { origin: { x: 20, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
    });
  });

  test('featureMirror v1.58：多源 id 逐个换本地 id，载荷写 sourceFeatureIds', () => {
    const feature: ScenarioFeature = {
      type: 'featureMirror',
      name: 'Mirror 1',
      params: {
        sourceFeatureIds: ['onshape-cut-a', 'onshape-cut-b'],
        planeLine: { origin: { x: 20, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-cut-a', 'local-a'], ['onshape-cut-b', 'local-b']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('featureMirror');
    expect(step.op.params).toMatchObject({
      sourceFeatureIds: ['local-a', 'local-b'],
      planeLine: { origin: { x: 20, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
    });
    expect(step.notes.some((note) => note.includes('多源'))).toBe(true);
  });

  test('featureMirror v1.58：单/多源并存或重复 → blocked', () => {
    const planeLine = { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
    const both: ScenarioFeature = {
      type: 'featureMirror', name: 'Mirror 1',
      params: { sourceFeatureId: 'a', sourceFeatureIds: ['a'], planeLine },
    };
    const dup: ScenarioFeature = {
      type: 'featureMirror', name: 'Mirror 1',
      params: { sourceFeatureIds: ['a', 'a'], planeLine },
    };
    const map = new Map([['a', 'local-a']]);
    expect(() => translateScenarioFeature(both, { featureIdBySource: map })).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature(dup, { featureIdBySource: map })).toThrow(BlockedCapabilityError);
  });

  test('featureMirror：planeApprox 标近似并附端盖推导 note', () => {
    const feature: ScenarioFeature = {
      type: 'featureMirror',
      name: 'Mirror 1',
      params: {
        sourceFeatureId: 'onshape-cut',
        planeLine: { origin: { x: 0, y: 10, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
        planeApprox: true,
      },
    };
    const step = translateScenarioFeature(feature, {
      featureIdBySource: new Map([['onshape-cut', 'local-cut']]),
    });
    expect(step.op.kind).toBe('insertFeature');
    if (step.op.kind !== 'insertFeature') return;
    expect(step.op.featureType).toBe('featureMirror');
    expect(step.approximate).toBe(true);
    expect(step.notes.some((note) => note.includes('端盖静态推导'))).toBe(true);
  });

  test('featureMirror：源缺失/零法向 → blocked', () => {
    const base: ScenarioFeature = {
      type: 'featureMirror',
      name: 'Mirror 1',
      params: {
        sourceFeatureId: 'onshape-cut',
        planeLine: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
      },
    };
    expect(() => translateScenarioFeature(base)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...base,
      params: { ...base.params, planeLine: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } } },
    }, { featureIdBySource: new Map([['onshape-cut', 'local-cut']]) })).toThrow(BlockedCapabilityError);
  });

  test('featurePattern：源未建链/轴为零向量 → blocked', () => {
    const base: ScenarioFeature = {
      type: 'featurePattern',
      name: 'Circular pattern 1',
      params: {
        sourceFeatureId: 'onshape-hole',
        kind: 'circular',
        count: 6,
        angle: 360,
        axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } },
      },
    };
    expect(() => translateScenarioFeature(base)).toThrow(BlockedCapabilityError);
    expect(() => translateScenarioFeature({
      ...base,
      params: { ...base.params, axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } } },
    }, { featureIdBySource: new Map([['onshape-hole', 'local-hole']]) })).toThrow(BlockedCapabilityError);
  });
});
