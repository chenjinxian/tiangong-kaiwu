import { describe, expect, it } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import { buildMirrorDraft, resolveNearestMirrorSeedId } from '../tools/sketch/sketch-mirror-logic.js';
import { SKETCH_PLACEHOLDER_IDS, SKETCH_RIBBON_TOOLS } from '../ribbon/sketch-tools.js';

const axis: SketchEntityDto = { kind: 'line', id: 1, p1: { x: 0, y: -10 }, p2: { x: 0, y: 10 }, construction: true };
const line: SketchEntityDto = { kind: 'line', id: 2, p1: { x: 3, y: 0 }, p2: { x: 3, y: 5 } };

describe('buildMirrorDraft（草图镜像首切片）', () => {
  it('line 关于竖直轴线反射，生成 line + mirror 约束', () => {
    const r = buildMirrorDraft({ source: line, axis, entities: [axis, line], startId: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.nextId).toBe(12);
    expect(r.draft.entities).toEqual([{
      kind: 'line', id: 10, p1: { x: -3, y: 0 }, p2: { x: -3, y: 5 },
    }]);
    expect(r.draft.constraints).toEqual([{
      kind: 'mirror', id: 11, refs: [2, 10, 1],
    }]);
  });

  it('point 关于轴线反射，生成 point + mirror 约束', () => {
    const point: SketchEntityDto = { kind: 'point', id: 4, x: 2, y: 3 };
    const r = buildMirrorDraft({ source: point, axis, entities: [axis, point], startId: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.entities).toEqual([{ kind: 'point', id: 20, x: -2, y: 3 }]);
    expect(r.draft.constraints[0]).toMatchObject({ kind: 'mirror', refs: [4, 20, 1] });
  });

  it('circle：圆心对称 + 等半径两条约束', () => {
    const circle: SketchEntityDto = { kind: 'circle', id: 5, center: { x: 2, y: 3 }, radius: 4 };
    const r = buildMirrorDraft({ source: circle, axis, entities: [axis, circle], startId: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.nextId).toBe(13);
    expect(r.draft.entities).toEqual([{ kind: 'circle', id: 10, center: { x: -2, y: 3 }, radius: 4 }]);
    expect(r.draft.constraints).toEqual([
      { kind: 'mirror', id: 11, refs: [{ entity: 5, part: 'center' }, { entity: 10, part: 'center' }, 1] },
      { kind: 'equal', id: 12, refs: [5, 10] },
    ]);
  });

  it('spline：四控制点/拟合点反射 + mirror(spline,spline,axis)；periodic/非 4 控制点拒收', () => {
    const spline: SketchEntityDto = {
      kind: 'spline', id: 7,
      controlPoints: [{ x: 5, y: 3 }, { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 3 }],
      fitPoints: [{ x: 5, y: 3 }, { x: 8, y: 3 }],
    };
    const r = buildMirrorDraft({ source: spline, axis, entities: [axis, spline], startId: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.nextId).toBe(12);
    expect(r.draft.entities).toEqual([{
      kind: 'spline', id: 10,
      controlPoints: [{ x: -5, y: 3 }, { x: -6, y: 4 }, { x: -7, y: 4 }, { x: -8, y: 3 }],
      fitPoints: [{ x: -5, y: 3 }, { x: -8, y: 3 }],
    }]);
    expect(r.draft.constraints).toEqual([{ kind: 'mirror', id: 11, refs: [7, 10, 1] }]);
    const periodic: SketchEntityDto = { ...spline, periodic: true };
    expect(buildMirrorDraft({ source: periodic, axis, entities: [axis, periodic], startId: 1 }))
      .toEqual({ ok: false, error: 'unsupportedKind' });
    const nonCubic: SketchEntityDto = { ...spline, controlPoints: spline.controlPoints.slice(0, 3) as never };
    expect(buildMirrorDraft({ source: nonCubic, axis, entities: [axis, nonCubic], startId: 1 }))
      .toEqual({ ok: false, error: 'unsupportedKind' });
  });

  it('mirror 拾取：三次样条按曲线采样命中', () => {
    const spline: SketchEntityDto = {
      kind: 'spline', id: 20,
      controlPoints: [{ x: 10, y: 10 }, { x: 12, y: 12 }, { x: 14, y: 12 }, { x: 16, y: 10 }],
    };
    const line: SketchEntityDto = { kind: 'line', id: 21, p1: { x: 0, y: 0 }, p2: { x: 5, y: 0 } };
    expect(resolveNearestMirrorSeedId([axis, line, spline], { u: 13, v: 11.5 })).toBe(20);
    expect(resolveNearestMirrorSeedId([axis, line, spline], { u: 2.5, v: 0.2 })).toBe(21);
  });

  it('arc：圆心/起/终点反射 + mirror(arc,arc,axis)；同实体/退化轴拒收', () => {
    const arc: SketchEntityDto = { kind: 'arc', id: 5, center: { x: 1, y: 1 }, radius: 2, startAngle: 0, sweepAngle: Math.PI / 2 };
    const r = buildMirrorDraft({ source: arc, axis, entities: [axis, arc], startId: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.nextId).toBe(12);
    expect(r.draft.entities).toEqual([{
      kind: 'arc', id: 10, center: { x: -1, y: 1 }, radius: 2,
      startAngle: Math.PI, sweepAngle: -Math.PI / 2,
    }]);
    expect(r.draft.constraints).toEqual([{ kind: 'mirror', id: 11, refs: [5, 10, 1] }]);

    expect(buildMirrorDraft({ source: axis, axis, entities: [axis], startId: 1 }))
      .toEqual({ ok: false, error: 'sameEntity' });
    const degenerate: SketchEntityDto = { kind: 'line', id: 6, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } };
    expect(buildMirrorDraft({ source: line, axis: degenerate, entities: [line, degenerate], startId: 1 }))
      .toEqual({ ok: false, error: 'degenerateAxis' });
  });

  it('ribbon：Sketch.Mirror 已入册且不再占位', () => {
    const tool = SKETCH_RIBBON_TOOLS.find((t) => t.id === 'Sketch.Mirror');
    expect(tool).toBeDefined();
    expect(SKETCH_PLACEHOLDER_IDS.has('Sketch.Mirror')).toBe(false);
  });

  it('构造几何/数字端点引用均可解析', () => {
    const p1: SketchEntityDto = { kind: 'point', id: 7, x: 0, y: -10 };
    const p2: SketchEntityDto = { kind: 'point', id: 8, x: 0, y: 10 };
    const axisRefs: SketchEntityDto = { kind: 'line', id: 9, p1: 7, p2: 8 };
    const a: SketchEntityDto = { kind: 'point', id: 11, x: 1, y: 2 };
    const b: SketchEntityDto = { kind: 'point', id: 12, x: 1, y: 4 };
    const source: SketchEntityDto = { kind: 'line', id: 13, p1: 11, p2: 12, construction: true };
    const r = buildMirrorDraft({ source, axis: axisRefs, entities: [p1, p2, axisRefs, a, b, source], startId: 30 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.entities[0]).toMatchObject({
      kind: 'line', id: 30, construction: true,
      p1: { x: -1, y: 2 }, p2: { x: -1, y: 4 },
    });
  });
});
