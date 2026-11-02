/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * v1.19：绘制工具自动重合（Onshape 端点吸附自动关系同构）纯逻辑单测。
 *
 * 背景：结构化子实体引用让「新线/弧/样条端点落在既有端点坐标上」成为合法
 * 输入；但同坐标的双端点无法靠就近拾取区分（拾取并列时实体序先到先得），
 * 用户无法用 coincident 工具第二次拾到另一侧。Onshape 在绘制时以推断吸附
 * 自动落 coincident 关系——本模块在绘制提交前对新实体端点做同坐标扫描，
 * 为每个命中补一条结构化 coincident（Tutorial 2 的 [14][16][18][38][39][45][46]）。
 */
import { describe, expect, it } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { AUTO_WELD_TOL, autoWeldConstraints } from '../tools/sketch/sketch-auto-weld.js';

const line = (id: number, x1: number, y1: number, x2: number, y2: number): SketchEntityDto => ({
  kind: 'line', id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 },
});

describe('v1.19：autoWeldConstraints（绘制自动 coincident）', () => {
  it('新线端点距既有线端点 ≤ 容差 → 一条结构化 coincident', () => {
    const existing = [line(1, 0, 0, 10, 0)];
    const fresh = [line(2, 10.4, 0.3, 10.4, -7)];
    const out = autoWeldConstraints(fresh, existing, [], { startConstraintId: 100 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: 'coincident', id: 100,
      refs: [{ entity: 2, part: 'start' }, { entity: 1, part: 'end' }],
    });
  });

  it('超出容差 → 不落约束（不做惊喜吸附）', () => {
    const existing = [line(1, 0, 0, 10, 0)];
    const fresh = [line(2, 10 + AUTO_WELD_TOL + 0.01, 0, 10 + AUTO_WELD_TOL + 0.01, -7)];
    expect(autoWeldConstraints(fresh, existing, [], { startConstraintId: 100 })).toEqual([]);
  });

  it('弧端点（三角换算）与既有线端点重合 → coincident', () => {
    const existing = [line(1, 7, 0, 7, -5)];
    const fresh: SketchEntityDto[] = [{
      kind: 'arc', id: 2, center: { x: 7, y: 0 }, radius: 5,
      startAngle: Math.PI, sweepAngle: Math.PI / 2,
    }];
    // arc.start = (7 + 5cosπ, 0 + 5sinπ) = (2, 0)——不在线端点；arc.end = (7, -5) 在线 1 端点上。
    const out = autoWeldConstraints(fresh, existing, [], { startConstraintId: 100 });
    expect(out).toHaveLength(1);
    expect(out[0]!.refs).toEqual([{ entity: 2, part: 'end' }, { entity: 1, part: 'end' }]);
  });

  it('样条端点焊接到既有样条/线端点（Tutorial 2 样条两处）', () => {
    const existing = [line(1, 0, 0, 10, 0), line(3, 10, 0, 20, -5)];
    const fresh: SketchEntityDto[] = [{
      kind: 'spline', id: 4,
      controlPoints: [{ x: 0.2, y: 0.1 }, { x: 3, y: 4 }, { x: 7, y: -8 }, { x: 20.1, y: -5 }],
    }];
    const out = autoWeldConstraints(fresh, existing, [], { startConstraintId: 100 });
    expect(out.map((c) => c.refs)).toEqual([
      [{ entity: 4, part: 'start' }, { entity: 1, part: 'start' }],
      [{ entity: 4, part: 'end' }, { entity: 3, part: 'end' }],
    ]);
    expect(out.map((c) => c.id)).toEqual([100, 101]);
  });

  it('既有可见 point 实体作焊接目标 → 数字 ref', () => {
    const existing: SketchEntityDto[] = [{ kind: 'point', id: 9, x: 5, y: 5 }];
    const fresh = [line(2, 5.2, 5.2, 8, 5.2)];
    const out = autoWeldConstraints(fresh, existing, [], { startConstraintId: 100 });
    expect(out[0]!.refs).toEqual([{ entity: 2, part: 'start' }, 9]);
  });

  it('既有 coincident 已覆盖同一对 ref → 不重复落行', () => {
    const existing = [line(1, 0, 0, 10, 0)];
    const fresh = [line(2, 10, 0, 10, -7)];
    const dup: SketchConstraintDto = {
      kind: 'coincident', id: 50,
      refs: [{ entity: 2, part: 'start' }, { entity: 1, part: 'end' }],
    };
    expect(autoWeldConstraints(fresh, existing, [dup], { startConstraintId: 100 })).toEqual([]);
  });

  it('矩形草稿的 4 线互不焊接（只对既有实体扫描）', () => {
    const fresh = [
      line(1, 0, 0, 10, 0), line(2, 10, 0, 10, 5),
      line(3, 10, 5, 0, 5), line(4, 0, 5, 0, 0),
    ];
    expect(autoWeldConstraints(fresh, [], [], { startConstraintId: 100 })).toEqual([]);
  });
});
