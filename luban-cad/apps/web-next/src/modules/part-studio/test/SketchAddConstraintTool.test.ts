/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * M6-b T5：草图约束工具单测——槽位定义表（6 约束各自满槽 refs 形态）+
 * 槽位接收判定 + 就近实体分辨纯函数 + toolId/注册接线。
 *
 * 测试触达法：纯逻辑在 sketch-constraint-logic.ts（零 core-frontend 依赖，
 * 直测不 mock）；工具类经 @itwin/core-frontend 模块级 mock 加载（假基类，
 * SketchCreateTool.test 同款），只钉 toolId/注册面。工具交互态
 *（onDataButtonDown 乐观提交/拒收回滚）依赖 accessor/AccuSnap 运行态，
 * 归真实栈冒烟验证（诚实登记：本文件不覆盖）。
 */
import { describe, expect, it, vi } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';

const registerMock = vi.hoisted(() => vi.fn());

vi.mock('@itwin/core-frontend', () => {
  class Tool {
    static toolId = '';
    static iconSpec = '';
    async run(): Promise<boolean> { return true; }
    async exitTool(): Promise<void> { /* noop */ }
  }
  class PrimitiveTool extends Tool {
    async onPostInstall(): Promise<void> { /* noop */ }
    async onCleanup(): Promise<void> { /* noop */ }
    initLocateElements(..._args: unknown[]): void { /* noop */ }
    requireWriteableTarget(): boolean { return true; }
  }
  return {
    Tool,
    PrimitiveTool,
    IModelApp: {
      tools: { register: registerMock },
      notifications: { outputPrompt: vi.fn(), outputMessage: vi.fn() },
      accuSnap: undefined,
      locateManager: undefined,
    },
    EventHandled: { Yes: 1, No: 0 },
    NotifyMessageDetails: class {
      priority: number;
      briefMessage: string;
      constructor(priority: number, briefMessage: string) {
        this.priority = priority;
        this.briefMessage = briefMessage;
      }
    },
    OutputMessagePriority: { None: 0, Error: 10, Warning: 11, Info: 12 },
  };
});

import {
  acceptPick,
  CONSTRAINT_SLOT_SHAPES,
  nextConstraintId,
  resolveNearestEntityId,
} from '../tools/sketch/sketch-constraint-logic.js';
import type { SketchConstraintKind, SketchEntityKind } from '../tools/sketch/sketch-constraint-logic.js';
import {
  CoincidentAddTool,
  EqualAddTool,
  HorizontalAddTool,
  ParallelAddTool,
  PerpendicularAddTool,
  registerSketchConstraintTools,
  VerticalAddTool,
} from '../tools/sketch/SketchAddConstraintTool.js';

// ---------------------------------------------------------------------------
// Fixture（M3-b 同构）：p1(0,0) p2(10,0) 线#3；p4(0,5) p5(10,5) 线#6；
// 圆心#7(20,0) 圆#8 r=3；圆心#9(30,0) 圆#10 r=3；约束 horizontal#20。
// ---------------------------------------------------------------------------

const entities: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 10, y: 0 },
  { kind: 'line', id: 3, p1: 1, p2: 2 },
  { kind: 'point', id: 4, x: 0, y: 5 },
  { kind: 'point', id: 5, x: 10, y: 5 },
  { kind: 'line', id: 6, p1: 4, p2: 5 },
  { kind: 'point', id: 7, x: 20, y: 0 },
  { kind: 'circle', id: 8, center: 7, radius: 3 },
  { kind: 'point', id: 9, x: 30, y: 0 },
  { kind: 'circle', id: 10, center: 9, radius: 3 },
];

describe('M6-b T5：槽位定义表（SolverTypes 冻结契约逐字）', () => {
  it('coincident=2 point；horizontal/vertical=1 line 或 2 point；parallel/perpendicular=2 line；equal=2 line 或 2 circle', () => {
    expect(CONSTRAINT_SLOT_SHAPES.coincident).toEqual([['point', 'point']]);
    expect(CONSTRAINT_SLOT_SHAPES.horizontal).toEqual([['line'], ['point', 'point']]);
    expect(CONSTRAINT_SLOT_SHAPES.vertical).toEqual([['line'], ['point', 'point']]);
    expect(CONSTRAINT_SLOT_SHAPES.parallel).toEqual([['line', 'line']]);
    expect(CONSTRAINT_SLOT_SHAPES.perpendicular).toEqual([['line', 'line']]);
    expect(CONSTRAINT_SLOT_SHAPES.equal).toEqual([['line', 'line'], ['circle', 'circle']]);
  });
});

describe('M6-b T5：acceptPick 槽位接收判定', () => {
  it('coincident：两点满槽；非点拒收', () => {
    expect(acceptPick('coincident', [], 'point')).toEqual({ ok: true, complete: false });
    expect(acceptPick('coincident', ['point'], 'point')).toEqual({ ok: true, complete: true });
    const rejected = acceptPick('coincident', [], 'line');
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toBeTruthy(); // 拒收文案（info，不消耗点击）
  });

  it('horizontal/vertical：单线即满槽；点对式两槽', () => {
    for (const kind of ['horizontal', 'vertical'] as const) {
      expect(acceptPick(kind, [], 'line')).toEqual({ ok: true, complete: true });
      expect(acceptPick(kind, [], 'point')).toEqual({ ok: true, complete: false });
      expect(acceptPick(kind, ['point'], 'point')).toEqual({ ok: true, complete: true });
      // 已进入点对式：第二槽只收点
      expect(acceptPick(kind, ['point'], 'line').ok).toBe(false);
      // 单线槽已满：不再收第二元素
      expect(acceptPick(kind, ['line'], 'line').ok).toBe(false);
    }
  });

  it('parallel/perpendicular：两线满槽；点拒收', () => {
    for (const kind of ['parallel', 'perpendicular'] as const) {
      expect(acceptPick(kind, [], 'line')).toEqual({ ok: true, complete: false });
      expect(acceptPick(kind, ['line'], 'line')).toEqual({ ok: true, complete: true });
      expect(acceptPick(kind, [], 'point').ok).toBe(false);
      expect(acceptPick(kind, [], 'circle').ok).toBe(false);
    }
  });

  it('equal：同种两槽（线线/圆圆）；混搭拒收（首槽种类锁定槽形）', () => {
    expect(acceptPick('equal', [], 'line')).toEqual({ ok: true, complete: false });
    expect(acceptPick('equal', ['line'], 'line')).toEqual({ ok: true, complete: true });
    expect(acceptPick('equal', [], 'circle')).toEqual({ ok: true, complete: false });
    expect(acceptPick('equal', ['circle'], 'circle')).toEqual({ ok: true, complete: true });
    // 混搭：line+circle / circle+line 均拒
    expect(acceptPick('equal', ['line'], 'circle').ok).toBe(false);
    expect(acceptPick('equal', ['circle'], 'line').ok).toBe(false);
    // 点不在任何槽形
    expect(acceptPick('equal', [], 'point').ok).toBe(false);
  });

  it('6 约束全类型面：每种至少一条合法满槽路径（契约不漏种）', () => {
    const kinds: SketchConstraintKind[] = ['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'equal'];
    for (const kind of kinds) {
      const shapes = CONSTRAINT_SLOT_SHAPES[kind];
      expect(shapes.length).toBeGreaterThan(0);
      for (const shape of shapes) {
        let picked: ReturnType<typeof acceptPick> | undefined;
        let acc: SketchEntityKind[] = [];
        for (const slot of shape) {
          picked = acceptPick(kind, acc, slot);
          expect(picked.ok).toBe(true);
          acc = [...acc, slot];
        }
        expect(picked?.complete).toBe(true);
      }
    }
  });
});

describe('M6-b T5：resolveNearestEntityId 就近分辨（v1 简化保留）', () => {
  it('点坐标命中 → 点实体', () => {
    expect(resolveNearestEntityId(entities, { u: 0, v: 0 })).toBe(1);
    expect(resolveNearestEntityId(entities, { u: 10, v: 5 })).toBe(5);
  });

  it('线段中部命中 → 线实体（点到线段距）', () => {
    expect(resolveNearestEntityId(entities, { u: 5, v: 0.1 })).toBe(3);
    expect(resolveNearestEntityId(entities, { u: 7, v: 4.9 })).toBe(6);
  });

  it('圆周命中 → 圆实体（到圆周距）；圆心命中 → 圆心点实体', () => {
    expect(resolveNearestEntityId(entities, { u: 23, v: 0 })).toBe(8); // (20,0)+r3 圆周右极点
    expect(resolveNearestEntityId(entities, { u: 20, v: 0 })).toBe(7); // 圆心点
  });

  it('端点精确并列 → 点实体凭 kind 优先获胜（线端拾点是 distance 拾端点的前提）', () => {
    // (0,0) 既是点#1 坐标也是线#3 端点：距离并列（0 vs 0），point 优先。
    expect(resolveNearestEntityId(entities, { u: 0, v: 0 })).toBe(1);
    // (10,0)：点#2 与线#3 端点并列；也与圆#8 无关。
    expect(resolveNearestEntityId(entities, { u: 10, v: 0 })).toBe(2);
  });

  it('无解算坐标的实体不参与分辨；全无解算值 → undefined', () => {
    const partial: SketchEntityDto[] = [
      { kind: 'point', id: 21 }, // 无 x/y
      { kind: 'line', id: 22, p1: 21, p2: 23 },
      { kind: 'point', id: 23 },
      { kind: 'circle', id: 24, center: 21 }, // 无 radius
    ];
    expect(resolveNearestEntityId(partial, { u: 0, v: 0 })).toBeUndefined();
  });
});

describe('M6-b T5：nextConstraintId（全局 maxId+1）', () => {
  it('实体与约束共用一支计数器取最大', () => {
    const sketch = { entities, constraints: [{ kind: 'horizontal', id: 20, refs: [3] }] as SketchConstraintDto[] };
    expect(nextConstraintId(sketch)).toBe(21);
  });

  it('空草图 → 1', () => {
    expect(nextConstraintId({ entities: [], constraints: [] })).toBe(1);
  });
});

describe('M6-b T5：约束 6 工具 toolId 与注册接线', () => {
  it('toolId 与 ribbon 注册表一一对应（Sketch.Constraint.*）', () => {
    expect(CoincidentAddTool.toolId).toBe('Sketch.Constraint.Coincident');
    expect(HorizontalAddTool.toolId).toBe('Sketch.Constraint.Horizontal');
    expect(VerticalAddTool.toolId).toBe('Sketch.Constraint.Vertical');
    expect(ParallelAddTool.toolId).toBe('Sketch.Constraint.Parallel');
    expect(PerpendicularAddTool.toolId).toBe('Sketch.Constraint.Perpendicular');
    expect(EqualAddTool.toolId).toBe('Sketch.Constraint.Equal');
  });

  it('registerSketchConstraintTools 幂等：6 工具按序各注册一次（二次调用 no-op）', () => {
    const before = registerMock.mock.calls.length;
    registerSketchConstraintTools();
    registerSketchConstraintTools(); // 幂等：模块 flag 置位后 no-op
    const registered = registerMock.mock.calls.slice(before).map((call) => (call[0] as { toolId: string }).toolId);
    expect(registered).toEqual([
      'Sketch.Constraint.Coincident',
      'Sketch.Constraint.Horizontal',
      'Sketch.Constraint.Vertical',
      'Sketch.Constraint.Parallel',
      'Sketch.Constraint.Perpendicular',
      'Sketch.Constraint.Equal',
    ]);
  });
});
