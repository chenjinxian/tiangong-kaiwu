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

describe('M6-a T5：SketchLineTool buildShape', () => {
  it('2 点 → 2 point + 1 line，id 递增共用一支计数器', () => {
    const tool = new TestableLine();
    const draft = tool.callBuildShape([{ u: 0, v: 0 }, { u: 0.05, v: 0.01 }]);
    expect(draft).toBeDefined();
    expect(draft!.entities).toEqual([
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0.05, y: 0.01 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
    ]);
    expect(draft!.constraints).toEqual([]);
  });

  it('零长度（两点重合）→ undefined', () => {
    const tool = new TestableLine();
    expect(tool.callBuildShape([{ u: 1, v: 1 }, { u: 1, v: 1 }])).toBeUndefined();
  });
});

describe('M6-a T5：SketchRectangleTool buildShape（M3-b 焊接拓扑）', () => {
  it('2 对角点 → 8 point + 4 line + 4 coincident 角点焊接', () => {
    const tool = new TestableRect();
    const draft = tool.callBuildShape([{ u: 0, v: 0 }, { u: 0.1, v: 0.05 }]);
    expect(draft).toBeDefined();
    const pts = draft!.entities.filter((e) => e.kind === 'point');
    const lines = draft!.entities.filter((e) => e.kind === 'line');
    expect(pts).toHaveLength(8);
    expect(lines).toHaveLength(4);
    // 角点坐标：A(0,0) B(0.1,0) C(0.1,0.05) D(0,0.05)，每线独立端点。
    expect(pts[0]).toMatchObject({ x: 0, y: 0 }); // A
    expect(pts[1]).toMatchObject({ x: 0.1, y: 0 }); // B
    // 焊接约束：B/B、C/C、D/D、A/A 四角各一 coincident。
    expect(draft!.constraints).toHaveLength(4);
    expect(draft!.constraints.map((c) => c.kind)).toEqual(['coincident', 'coincident', 'coincident', 'coincident']);
    // refs 引用的是 point 实体 id（相邻两角点）。
    const ptIds = new Set(pts.map((p) => p.id));
    for (const c of draft!.constraints) {
      expect(c.refs).toHaveLength(2);
      for (const r of c.refs) expect(ptIds.has(r)).toBe(true);
    }
  });

  it('零宽/零高 → undefined', () => {
    const tool = new TestableRect();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 0, v: 0.1 }])).toBeUndefined();
    expect(tool.callBuildShape([{ u: 0, v: 0 }, { u: 0.1, v: 0 }])).toBeUndefined();
  });
});

describe('M6-a T5：SketchCenterCircleTool buildShape', () => {
  it('圆心+半径点 → 1 point(center) + 1 circle，radius=拖距', () => {
    const tool = new TestableCircle();
    const draft = tool.callBuildShape([{ u: 0.01, v: 0.02 }, { u: 0.04, v: 0.02 }]);
    expect(draft).toBeDefined();
    expect(draft!.entities).toEqual([
      { kind: 'point', id: 1, x: 0.01, y: 0.02 },
      { kind: 'circle', id: 2, center: 1, radius: 0.03 },
    ]);
  });

  it('零半径 → undefined', () => {
    const tool = new TestableCircle();
    expect(tool.callBuildShape([{ u: 1, v: 1 }, { u: 1, v: 1 }])).toBeUndefined();
  });
});

describe('M6-a T5：SketchArc3PointTool buildShape（三点定圆换算）', () => {
  it('90° 弧：起点(1,0) 弧上(√2/2,√2/2) 终点(0,1) → 圆心(0,0) r=1 start=0 sweep=π/2', () => {
    const tool = new TestableArc();
    const s45 = Math.SQRT1_2;
    const draft = tool.callBuildShape([
      { u: 1, v: 0 },
      { u: 0, v: 1 },
      { u: s45, v: s45 },
    ]);
    expect(draft).toBeDefined();
    const [pt, arc] = draft!.entities;
    expect(pt?.kind).toBe('point');
    if (pt?.kind !== 'point') return;
    expect(pt.x).toBeCloseTo(0, 10);
    expect(pt.y).toBeCloseTo(0, 10);
    expect(arc).toMatchObject({ kind: 'arc', center: pt.id });
    if (arc?.kind === 'arc') {
      expect(arc.radius).toBeCloseTo(1, 10);
      expect(arc.startAngle).toBeCloseTo(0, 10);
      expect(arc.sweepAngle).toBeCloseTo(Math.PI / 2, 10);
    }
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
