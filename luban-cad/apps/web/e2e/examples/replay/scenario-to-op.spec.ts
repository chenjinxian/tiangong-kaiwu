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

  test('extrude 拔模未实现 → blocked，不静默按直体近似', () => {
    expect(() => translateScenarioFeature({
      type: 'extrude',
      name: 'Extrude 1',
      params: {
        operation: 'new',
        endBound: 'blind',
        depthMm: 10,
        hasDraft: true,
        draftAngleDeg: Math.PI / 18,
        selection: { kind: 'sketchRegions', sketchFeatureId: 's', regions: [0] },
      },
    }, { sketchIdBySource: new Map([['s', 'sk']]) })).toThrow(BlockedCapabilityError);
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
    expect(() => translateScenarioFeature({
      type: 'mirror',
      name: 'Mirror 2',
      params: { plane: 'FACE', keepOriginal: true },
    })).toThrow(BlockedCapabilityError);
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

  test('fillet 边引用未解析时 blocked，不猜边', () => {
    expect(() => translateScenarioFeature({ type: 'fillet', name: 'Fillet 1', params: { radiusMm: 2 } }))
      .toThrow(BlockedCapabilityError);
  });
});
