/**
 * 草图「使用」纯逻辑（2026-11-13）：投影根实体快照、id 分配、平面支持判定。
 */
import { describe, expect, it } from 'vitest';
import type { SketchEntityDto, SketchExternalReferenceDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  buildBodyFaceExternalRefRow,
  buildPierceExternalRefRow,
  buildProjectedSketchEntity,
  isUsableSourceEntity,
  nextProjectedRootId,
  planesAreParallel,
} from '../internal/sketch-use.js';

const XY: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const XY_OFFSET: SketchPlaneDto = { ...XY, origin: { x: 0, y: 0, z: 1 } };
const YZ: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  xDir: { x: 0, y: 1, z: 0 },
};
const XY_FLIPPED: SketchPlaneDto = { ...XY, normal: { x: 0, y: 0, z: -1 }, xDir: { x: 1, y: 0, z: 0 } };

const target = (): { plane: SketchPlaneDto; entities: SketchEntityDto[]; constraints: { id: number }[] } => ({
  plane: XY,
  entities: [{ kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } }],
  constraints: [{ id: 101 }],
});

describe('nextProjectedRootId', () => {
  it('避开实体与约束 id，且保证 root/root+1/root+2 全空闲', () => {
    expect(nextProjectedRootId([{ kind: 'point', id: 5 }], [{ id: 6 }, { id: 8 }])).toBe(9);
    expect(nextProjectedRootId([{ kind: 'point', id: 5 }], [{ id: 6 }, { id: 7 }])).toBe(8);
    expect(nextProjectedRootId([], [])).toBe(1);
  });
});

describe('planesAreParallel', () => {
  it('同向/反向平行 true；垂直 false', () => {
    expect(planesAreParallel(XY, XY_OFFSET)).toBe(true);
    expect(planesAreParallel(XY, XY_FLIPPED)).toBe(true);
    expect(planesAreParallel(XY, YZ)).toBe(false);
  });
});

describe('isUsableSourceEntity', () => {
  it('线/点/圆/弧可用（含链式投影源）；样条不可用', () => {
    expect(isUsableSourceEntity({ kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } })).toBe(true);
    expect(isUsableSourceEntity({ kind: 'point', id: 2, x: 0, y: 0 })).toBe(true);
    expect(isUsableSourceEntity({ kind: 'circle', id: 3, center: { x: 0, y: 0 }, radius: 1 })).toBe(true);
    expect(isUsableSourceEntity({ kind: 'arc', id: 4, center: { x: 0, y: 0 }, radius: 1, startAngle: 0, sweepAngle: 1 })).toBe(true);
    expect(isUsableSourceEntity({ kind: 'spline', id: 5, controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] })).toBe(false);
    // 链式投影源允许（后端递归解析；样条源仍拒收）。
    expect(isUsableSourceEntity({
      kind: 'line', id: 6, p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 },
      projected: { kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's', entityId: 1 } },
    })).toBe(true);
  });
});

describe('buildProjectedSketchEntity', () => {
  it('线：跨平行平面快照投影 + projected 标记 + 新根 id + construction 保留', () => {
    const source = {
      id: 's1', plane: XY_OFFSET,
      entities: [{ kind: 'line', id: 7, p1: { x: 1, y: 2 }, p2: { x: 3, y: 4 }, construction: true } as SketchEntityDto],
    };
    const built = buildProjectedSketchEntity(source, source.entities[0]!, target());
    expect(built.ok).toBe(true);
    if (!built.ok)
      return;
    expect(built.entity.kind).toBe('line');
    expect(built.entity.id).toBe(102); // target max id 101 → 102..104 空闲
    expect(built.entity.projected).toEqual({
      kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's1', entityId: 7 },
    });
    if (built.entity.kind === 'line') {
      expect(built.entity.construction).toBe(true);
      expect(built.entity.p1).toEqual({ x: 1, y: 2 });
      expect(built.entity.p2).toEqual({ x: 3, y: 4 });
    }
  });

  it('点/圆：平行投影；圆半径保持；非平行圆诚实拒收', () => {
    const point = buildProjectedSketchEntity(
      { id: 's', plane: XY_OFFSET, entities: [] },
      { kind: 'point', id: 9, x: 2, y: 3 },
      target(),
    );
    expect(point.ok).toBe(true);
    if (point.ok)
      expect(point.entity).toMatchObject({ kind: 'point', x: 2, y: 3 });

    const circle: SketchEntityDto = { kind: 'circle', id: 10, center: { x: 4, y: 5 }, radius: 2 };
    const built = buildProjectedSketchEntity({ id: 's', plane: XY_OFFSET, entities: [circle] }, circle, target());
    expect(built.ok).toBe(true);
    if (built.ok)
      expect(built.entity).toMatchObject({ kind: 'circle', radius: 2 });
    if (built.ok && built.entity.kind === 'circle')
      expect(built.entity.center).toEqual({ x: 4, y: 5 });

    const nonParallel = buildProjectedSketchEntity({ id: 's', plane: YZ, entities: [circle] }, circle, target());
    expect(nonParallel).toEqual({ ok: false, error: 'non-parallel' });
  });

  it('弧：同向平行保持起角/扫角；反向平面扫角取反', () => {
    const arc: SketchEntityDto = {
      kind: 'arc', id: 20, center: { x: 0, y: 0 }, radius: 2, startAngle: 0, sweepAngle: Math.PI / 2,
    };
    const same = buildProjectedSketchEntity({ id: 's', plane: XY_OFFSET, entities: [arc] }, arc, target());
    expect(same.ok).toBe(true);
    if (same.ok && same.entity.kind === 'arc') {
      expect(same.entity.startAngle).toBeCloseTo(0, 8);
      expect(same.entity.sweepAngle).toBeCloseTo(Math.PI / 2, 8);
    }
    const flipped = buildProjectedSketchEntity({ id: 's', plane: XY_FLIPPED, entities: [arc] }, arc, target());
    expect(flipped.ok).toBe(true);
    if (flipped.ok && flipped.entity.kind === 'arc')
      expect(flipped.entity.sweepAngle).toBeCloseTo(-Math.PI / 2, 8);
  });

  it('样条/投影源/退化线拒收', () => {
    const spline: SketchEntityDto = { kind: 'spline', id: 30, controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 0 }] };
    expect(buildProjectedSketchEntity({ id: 's', plane: XY, entities: [spline] }, spline, target()))
      .toEqual({ ok: false, error: 'unsupported-kind' });
    const degenerate: SketchEntityDto = { kind: 'line', id: 31, p1: { x: 1, y: 1 }, p2: { x: 1, y: 1 } };
    expect(buildProjectedSketchEntity({ id: 's', plane: XY, entities: [degenerate] }, degenerate, target()))
      .toEqual({ ok: false, error: 'degenerate-source' });
  });
});

// ---------------------------------------------------------------------------
// S1b（2026-11-21）：bodyFace（外环）externalRefs 行
// ---------------------------------------------------------------------------

const bodyFaceRef = (id: number, entityIds: number[]): SketchExternalReferenceDto => ({
  id,
  kind: 'project',
  source: { kind: 'bodyFace', bodyId: 'body-a', topologyRef: { nodeId: 1, entityId: id }, loops: 'outer' },
  entityIds,
});

describe('buildBodyFaceExternalRefRow', () => {
  const base = {
    id: 5,
    bodyKey: 'body-a',
    topologyRef: { nodeId: 7, entityId: 8 },
    blockLength: 12,
    entities: [] as readonly SketchEntityDto[],
    constraints: [] as readonly { id: number }[],
    externalRefs: [] as readonly SketchExternalReferenceDto[],
  };

  it('kind=project、source=bodyFace loops=outer、恰好 blockLength 连块', () => {
    expect(buildBodyFaceExternalRefRow(base)).toEqual({
      id: 5,
      kind: 'project',
      source: {
        kind: 'bodyFace', bodyId: 'body-a', topologyRef: { nodeId: 7, entityId: 8 }, loops: 'outer',
      },
      entityIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
  });

  it('在既有引用块之后分配（不重叠、不截断）', () => {
    const row = buildBodyFaceExternalRefRow({
      ...base,
      entities: [{ kind: 'point', id: 1 }, { kind: 'point', id: 2 }],
      constraints: [{ id: 3 }],
      externalRefs: [bodyFaceRef(1, [4, 5, 6])],
    });
    expect(row).toMatchObject({ entityIds: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] });
  });

  it('避开本地实体 id（块内含占用即整体前移）', () => {
    const row = buildBodyFaceExternalRefRow({
      ...base,
      entities: [{ kind: 'point', id: 3 }],
    });
    expect(row).toMatchObject({
      entityIds: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
  });

  it('非法/超大块长诚实失败（不静默截断）', () => {
    for (const blockLength of [0, -1, 1.5, Number.NaN, 4097]) {
      expect(buildBodyFaceExternalRefRow({ ...base, blockLength }))
        .toEqual({ ok: false, error: 'no-entity-block' });
    }
  });
});

// ---------------------------------------------------------------------------
// S2（2026-11-21）：PIERCE externalRefs 行（外键到本地 point 实体）
// ---------------------------------------------------------------------------

const pierceEntity: SketchEntityDto = { kind: 'point', id: 1, x: 0, y: 0 };

describe('buildPierceExternalRefRow', () => {
  const base = {
    id: 4,
    bodyKey: 'body-a',
    topologyRef: { nodeId: 7, entityId: 8 },
    localEntityId: 1,
    entities: [pierceEntity] as readonly SketchEntityDto[],
    externalRefs: [] as readonly SketchExternalReferenceDto[],
  };

  it('精确行形状：kind=pierce、bodyEdge/curve、entityIds 空、localEntityId 保留', () => {
    expect(buildPierceExternalRefRow(base)).toEqual({
      id: 4,
      kind: 'pierce',
      source: {
        kind: 'bodyEdge',
        bodyId: 'body-a',
        topologyRef: { nodeId: 7, entityId: 8 },
        part: 'curve',
      },
      entityIds: [],
      localEntityId: 1,
    });
  });

  it('不分配实体 id（entityIds 恒空，即使既有引用占用 id 块）', () => {
    const row = buildPierceExternalRefRow({
      ...base,
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'point', id: 2, x: 1, y: 1 },
      ],
      externalRefs: [bodyFaceRef(1, [3, 4, 5, 6])],
    });
    expect(row).toMatchObject({ kind: 'pierce', entityIds: [], localEntityId: 1 });
  });

  it('既有 externalRefs 原样保留（函数返回新行、不改动输入）', () => {
    const existing = [bodyFaceRef(9, [10, 11, 12])];
    const snapshot = JSON.parse(JSON.stringify(existing)) as SketchExternalReferenceDto[];
    const row = buildPierceExternalRefRow({ ...base, externalRefs: existing });
    expect(row).toMatchObject({ id: 4, kind: 'pierce' });
    expect(existing).toEqual(snapshot);
  });

  it('拒绝非整数/负数/零 localEntityId', () => {
    for (const localEntityId of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildPierceExternalRefRow({ ...base, localEntityId }))
        .toEqual({ ok: false, error: 'invalid-local-entity' });
    }
  });

  it('localEntityId 必须指向存在的非投影 point 实体（线/缺失/投影点拒收）', () => {
    expect(buildPierceExternalRefRow({
      ...base,
      localEntityId: 7,
      entities: [{ kind: 'line', id: 7, p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } }],
    })).toEqual({ ok: false, error: 'invalid-local-entity' });
    expect(buildPierceExternalRefRow({ ...base, localEntityId: 7 }))
      .toEqual({ ok: false, error: 'invalid-local-entity' });
    expect(buildPierceExternalRefRow({
      ...base,
      entities: [{
        kind: 'point', id: 1, x: 0, y: 0,
        projected: { kind: 'projected', source: { kind: 'sketchEntity', sketchId: 's', entityId: 2 } },
      }],
    })).toEqual({ ok: false, error: 'invalid-local-entity' });
  });
});
