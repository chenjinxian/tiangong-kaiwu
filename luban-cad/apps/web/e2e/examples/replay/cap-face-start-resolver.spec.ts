/** CAP_FACE 起始面匹配纯函数单测（不需要真栈）。 */
import { expect, test } from '@playwright/test';
import {
  faceBoundaryStats,
  matchCapFaceStartFaces,
  parseCapFaceStartEvidence,
  type CapFaceStartEvidence,
  type FaceHandleLike,
} from './cap-face-start-resolver.js';

function rectangleFace(
  bodyKey: string,
  subEntityId: number,
  z = 40,
  minX = -90,
  minY = -25,
  maxX = 90,
  maxY = 25,
  normal: [number, number, number] = [0, 0, 1],
): FaceHandleLike {
  return {
    bodyKey,
    subEntityId,
    range: { low: [minX, minY, z], high: [maxX, maxY, z] },
    normal,
    loops: [[
      { kind: 'line', p0: [minX, minY, z], p1: [maxX, minY, z] },
      { kind: 'line', p0: [maxX, minY, z], p1: [maxX, maxY, z] },
      { kind: 'line', p0: [maxX, maxY, z], p1: [minX, maxY, z] },
      { kind: 'line', p0: [minX, maxY, z], p1: [minX, minY, z] },
    ]],
  };
}

const bumperEvidence: CapFaceStartEvidence = {
  plane: { origin: { x: 0, y: 0, z: 40 }, normal: { x: 0, y: 0, z: 1 } },
  areaMm2: 9000,
  boxMm: { min: { x: -90, y: -25, z: 40 }, max: { x: 90, y: 25, z: 40 } },
  edgeCount: 4,
};

test.describe('CAP_FACE 起始面匹配', () => {
  test('平面+面积+AABB+边数唯一命中 Bumper 顶面', () => {
    const face = rectangleFace('body-1', 7);
    const stats = faceBoundaryStats(face);
    expect(stats?.areaMm2).toBeCloseTo(9000, 6);
    expect(stats?.edgeCount).toBe(4);
    const matched = matchCapFaceStartFaces(bumperEvidence, [face]);
    expect(matched.face?.subEntityId).toBe(7);
  });

  test('法向相反/面积不符/AABB 不符均不命中', () => {
    const opposite = rectangleFace('body-1', 1, 40, -90, -25, 90, 25, [0, 0, -1]);
    expect(matchCapFaceStartFaces(bumperEvidence, [opposite]).face).toBeUndefined();

    const wrongArea = rectangleFace('body-1', 2, 40, -80, -25, 90, 25);
    expect(matchCapFaceStartFaces(bumperEvidence, [wrongArea]).face).toBeUndefined();

    const wrongBox = rectangleFace('body-1', 3, 39.5);
    expect(matchCapFaceStartFaces(bumperEvidence, [wrongBox]).face).toBeUndefined();
  });

  test('normalSignAmbiguous：bodydetails 参数化法向可反向（S3）', () => {
    const evidence: CapFaceStartEvidence = { ...bumperEvidence, normalSignAmbiguous: true };
    const opposite = rectangleFace('body-1', 9, 40, -90, -25, 90, 25, [0, 0, -1]);
    // 未标记时反向法向拒绝；标记后 ±法向均接受（平面/面积/AABB 仍唯一）。
    expect(matchCapFaceStartFaces(bumperEvidence, [opposite]).face).toBeUndefined();
    expect(matchCapFaceStartFaces(evidence, [opposite]).face?.subEntityId).toBe(9);
    // 面积/AABB 仍须匹配：双向法向不放宽几何证据。
    const wrongArea = rectangleFace('body-1', 10, 40, -80, -25, 90, 25, [0, 0, -1]);
    expect(matchCapFaceStartFaces(evidence, [wrongArea]).face).toBeUndefined();
  });

  test('normalSignAmbiguous 仍拒绝多候选', () => {
    const evidence: CapFaceStartEvidence = { ...bumperEvidence, normalSignAmbiguous: true };
    const matched = matchCapFaceStartFaces(evidence, [
      rectangleFace('body-1', 1),
      rectangleFace('body-1', 2, 40, -90, -25, 90, 25, [0, 0, -1]),
    ]);
    expect(matched.face).toBeUndefined();
    expect(matched.diagnostics.join(' ')).toContain('拒绝猜');
  });

  test('两个同证据面 → 多候选 fail closed', () => {
    const matched = matchCapFaceStartFaces(bumperEvidence, [
      rectangleFace('body-1', 1),
      rectangleFace('body-1', 2),
    ]);
    expect(matched.face).toBeUndefined();
    expect(matched.diagnostics.join(' ')).toContain('拒绝猜');
  });

  test('非解析边界（other）→ 不参与匹配', () => {
    const face = rectangleFace('body-1', 1);
    face.loops[0]!.push({ kind: 'other', geometryType: 'BSplineCurve3d' });
    expect(faceBoundaryStats(face)).toBeUndefined();
    expect(matchCapFaceStartFaces(bumperEvidence, [face]).face).toBeUndefined();
  });

  test('开环/断点面边界 → 不参与匹配（闭合校验）', () => {
    const face = rectangleFace('body-1', 1);
    // 断开最后一条线与首条线的共享端点。
    face.loops[0]![3] = { kind: 'line', p0: [-90, 25, 40], p1: [-89, -25, 40] };
    expect(faceBoundaryStats(face)).toBeUndefined();
    expect(matchCapFaceStartFaces(bumperEvidence, [face]).face).toBeUndefined();
  });

  test('证据解析：缺平面法向/平面点拒收', () => {
    expect(parseCapFaceStartEvidence({ areaMm2: 1 })).toBeUndefined();
    expect(parseCapFaceStartEvidence({
      plane: { origin: { x: 0, y: 0, z: 1 } },
      areaMm2: 1,
    })).toBeUndefined();
    const parsed = parseCapFaceStartEvidence({
      plane: { origin: { x: 0, y: 0, z: 1 }, normal: { x: 0, y: 0, z: 1 } },
      areaMm2: 1,
      boxMm: { min: { x: 0, y: 0, z: 1 }, max: { x: 1, y: 1, z: 1 } },
      edgeCount: 4,
    });
    expect(parsed?.areaMm2).toBe(1);
    expect(parsed?.edgeCount).toBe(4);
    expect(parsed?.normalSignAmbiguous).toBeUndefined();
    expect(parseCapFaceStartEvidence({
      plane: { origin: { x: 0, y: 0, z: 1 }, normal: { x: 0, y: 0, z: 1 } },
      areaMm2: 1,
      normalSignAmbiguous: true,
    })?.normalSignAmbiguous).toBe(true);
  });
});
