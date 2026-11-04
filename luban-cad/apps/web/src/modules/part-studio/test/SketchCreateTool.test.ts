/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * M6-a T5：草图绘制工具 buildShape 纯逻辑单测（线/矩形/圆/3点弧四件）。
 * 测试触达法：子类拓宽 protected 可见性（TS 合法收窄面），直击形状构造——
 * 不实例化 IModelApp 环境。状态机面（onDataButtonDown 乐观提交/拒收回滚/toast）
 * 依赖 AccuSnap/通知桥运行态，归 T8 真实栈冒烟验证（诚实登记：本文件不覆盖）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchPoint2 } from '../tools/sketch/sketch-plane.js';
import {
  SketchArc3PointTool,
  SketchCenterCircleTool,
  SketchLineTool,
  SketchRectangleTool,
  SketchSplineTool,
  withConstructionMode,
} from '../tools/sketch/SketchCreateTool.js';

/** 子类拓宽 protected buildShape 的测试触达口。 */
class TestableLine extends SketchLineTool {
  public callBuildShape(points: SketchPoint2[]) { return this.buildShape(points); }
}
class TestableRect extends SketchRectangleTool {
  public callBuildShape(points: SketchPoint2[]) { return this.buildShape(points); }
}
class TestableCircle extends SketchCenterCircleTool {
  public callBuildShape(points: SketchPoint2[]) { return this.buildShape(points); }
}
class TestableArc extends SketchArc3PointTool {
  public callBuildShape(points: SketchPoint2[]) { return this.buildShape(points); }
}
class TestableSpline extends SketchSplineTool {
  public callBuildShape(points: SketchPoint2[]) { return this.buildShape(points); }
}

describe('M6-a T5：SketchLineTool buildShape（v1.19 内联端点）', () => {
  it('2 点 → 1 line（端点内联，不占可见实体计数）', () => {
    const tool = new TestableLine();
    const draft = tool.callBuildShape([{ u: 0, v: 0 }, { u: 0.05, v: 0.01 }]);
    expect(draft).toBeDefined();
    expect(draft!.entities).toEqual([
      { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 0.05, y: 0.01 } },
    ]);
    expect(draft!.constraints).toEqual([]);
  });

  it('零长度（两点重合）→ undefined', () => {
    const tool = new TestableLine();
    expect(tool.callBuildShape([{ u: 1, v: 1 }, { u: 1, v: 1 }])).toBeUndefined();
  });
});

describe('v1.19：SketchRectangleTool buildShape（中心矩形/内联端点/自动关系）', () => {
  it('2 对角点 → 4 line（内联）+ 1 中心 point + 10 条自动关系', () => {
    const tool = new TestableRect();
    const draft = tool.callBuildShape([{ u: 0, v: 0 }, { u: 0.1, v: 0.05 }]);
    expect(draft).toBeDefined();
    const pts = draft!.entities.filter((e) => e.kind === 'point');
    const lines = draft!.entities.filter((e) => e.kind === 'line');
    expect(pts).toHaveLength(1); // 可见中心点（Onshape center rectangle）
    expect(pts[0]).toMatchObject({ x: 0.05, y: 0.025 });
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ p1: { x: 0, y: 0 }, p2: { x: 0.1, y: 0 } });
    expect(draft!.constraints.map((c) => c.kind)).toEqual([
      'coincident', 'coincident', 'coincident', 'coincident',
      'parallel', 'parallel', 'perpendicular', 'horizontal', 'midpoint', 'midpoint',
    ]);
    // 角点 coincident 使用结构化 start/end 子实体引用（不再有显式点实体）。
    const cornerRefs = draft!.constraints.slice(0, 4).flatMap((c) => c.refs);
    for (const r of cornerRefs) expect(typeof r === 'object' && 'entity' in r).toBe(true);
    // 两条 midpoint 必须引用两条对角线（a–c、b–d）；引用边会给出不同的中点和
    // 不可满足的约束组（libslvs 会沿零空间把矩形塌缩）。
    const center = pts[0] as unknown as { x: number; y: number };
    const endpointOf = (ref: unknown): { x: number; y: number } => {
      if (typeof ref !== 'object' || ref === null || !('entity' in ref) || !('part' in ref)) throw new Error('非结构化端点引用');
      const line = lines.find((l) => l.id === (ref as { entity: number }).entity);
      if (!line || typeof line.p1 !== 'object' || typeof line.p2 !== 'object') throw new Error('悬空线段');
      return (ref as { part: string }).part === 'start' ? line.p1 : line.p2;
    };
    for (const c of draft!.constraints.filter((x) => x.kind === 'midpoint')) {
      const p = endpointOf(c.refs[1]);
      const q = endpointOf(c.refs[2]);
      expect((p.x + q.x) / 2).toBeCloseTo(center.x, 12);
      expect((p.y + q.y) / 2).toBeCloseTo(center.y, 12);
    }
  });

  it('零宽/零高 → undefined', () => {
    const tool = new TestableRect();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 0, v: 0.1 }])).toBeUndefined();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 0.1, v: 0 }])).toBeUndefined();
  });
});

describe('v1.19：SketchCenterCircleTool buildShape（内联圆心）', () => {
  it('圆心+半径点 → 1 circle（内联 center），radius=拖距', () => {
    const tool = new TestableCircle();
    const draft = tool.callBuildShape([{ u: 0.01, v: 0.02 }, { u: 0.04, v: 0.02 }]);
    expect(draft).toBeDefined();
    expect(draft!.entities).toEqual([
      { kind: 'circle', id: 1, center: { x: 0.01, y: 0.02 }, radius: 0.03 },
    ]);
  });

  it('零半径 → undefined', () => {
    const tool = new TestableCircle();
    expect(tool.callBuildShape([{ u: 1, v: 1 }, { u: 1, v: 1 }])).toBeUndefined();
  });
});

describe('v1.19：SketchArc3PointTool buildShape（三点定圆/内联圆心）', () => {
  it('90° 弧：起点(1,0) 弧上(√2/2,√2/2) 终点(0,1) → 单 arc，center 内联 (0,0) r=1 start=0 sweep=π/2', () => {
    const tool = new TestableArc();
    const s45 = Math.SQRT1_2;
    const draft = tool.callBuildShape([
      { u: 1, v: 0 },
      { u: 0, v: 1 },
      { u: s45, v: s45 },
    ]);
    expect(draft).toBeDefined();
    expect(draft!.entities).toHaveLength(1);
    const arc = draft!.entities[0];
    if (arc?.kind !== 'arc' || typeof arc.center === 'number') return;
    expect(arc.center.x).toBeCloseTo(0, 10);
    expect(arc.center.y).toBeCloseTo(0, 10);
    expect(arc.radius).toBeCloseTo(1, 10);
    expect(arc.startAngle).toBeCloseTo(0, 10);
    expect(arc.sweepAngle).toBeCloseTo(Math.PI / 2, 10);
  });

  it('三点共线 → undefined（Arc3d 退化为 LineString3d 判退）', () => {
    const tool = new TestableArc();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 2, v: 0 }, { u: 1, v: 0 }])).toBeUndefined();
  });

  it('任两点重合 → undefined', () => {
    const tool = new TestableArc();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 1, v: 1 }])).toBeUndefined();
  });
});

describe('v1.19：SketchSplineTool buildShape（精确三次贝塞尔）', () => {
  it('4 拾取 → 1 spline（2 fit + 4 control）+ 2 条恒真 fit↔endpoint coincident（字面 18/48 组成）', () => {
    const tool = new TestableSpline();
    const draft = tool.callBuildShape([
      { u: -41.275, v: -9.525 },
      { u: 57.15, v: -61.9252 },
      { u: -39.539240300655365, v: -40.3054840862751 },
      { u: 16.844818368554112, v: -60.51863729953766 },
    ]);
    expect(draft).toBeDefined();
    expect(draft!.entities).toHaveLength(1); // 可见实体只 1 条曲线，控制点不占计数
    expect(draft!.entities[0]).toMatchObject({
      kind: 'spline', id: 1, periodic: false,
      fitPoints: [{ x: -41.275, y: -9.525 }, { x: 57.15, y: -61.9252 }],
      controlPoints: [
        { x: -41.275, y: -9.525 },
        { x: -39.539240300655365, y: -40.3054840862751 },
        { x: 16.844818368554112, y: -60.51863729953766 },
        { x: 57.15, y: -61.9252 },
      ],
    });
    expect(draft!.constraints).toEqual([
      { kind: 'coincident', id: 2, refs: [{ entity: 1, part: 'start' }, { entity: 1, part: 'point', index: 0 }] },
      { kind: 'coincident', id: 3, refs: [{ entity: 1, part: 'end' }, { entity: 1, part: 'point', index: 1 }] },
    ]);
  });

  it('端点重合 / 零切向手柄 → undefined', () => {
    const tool = new TestableSpline();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 1, v: 1 }, { u: 2, v: 2 }])).toBeUndefined();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 5, v: 0 }, { u: 0, v: 0 }, { u: 3, v: 2 }])).toBeUndefined();
  });
});

describe('v1.23 ADR-0004：构造模式', () => {
  it('曲线实体带 construction=true，point 保持原样；关闭时原样返回', () => {
    const draft = {
      entities: [
        { kind: 'line' as const, id: 1, p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } },
        { kind: 'circle' as const, id: 2, center: { x: 0, y: 0 }, radius: 1 },
        { kind: 'point' as const, id: 3, x: 0, y: 0 },
      ],
      constraints: [],
    };
    const off = withConstructionMode(draft, false);
    expect(off).toBe(draft);
    const on = withConstructionMode(draft, true);
    expect(on.entities[0]).toMatchObject({ kind: 'line', construction: true });
    expect(on.entities[1]).toMatchObject({ kind: 'circle', construction: true });
    expect(on.entities[2]).toEqual(draft.entities[2]);
    expect('construction' in on.entities[2]!).toBe(false);
  });
});
