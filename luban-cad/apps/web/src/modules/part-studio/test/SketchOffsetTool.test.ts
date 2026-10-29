/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * M6-c T4：草图偏移工具单测——焊接图链扩展（三通道/断链）/闭式偏移精度
 * （线平行距/弧同心±d）/约束展开形态（Tutorial 2 采集 [38]-[42] 同构）/
 * 方向翻转（光标另一侧=−d）/拒收位形/toolId 注册接线。
 *
 * 测试触达法：纯逻辑在 sketch-offset-logic.ts（零 core 依赖，直测不 mock）；
 * 工具类经 @itwin/core-frontend 模块级 mock 加载（SketchAddConstraintTool.test
 * 同款），只钉 toolId/注册面/ribbon 注册表换血。工具交互态（onDataButtonDown
 * 两相流转/乐观提交/拒收回滚）依赖 accessor/AccuSnap 运行态，归真实栈冒烟
 * 验证（诚实登记：本文件不覆盖）。
 *
 * 几何 fixture = Tutorial 2 拱喉链（TUTORIAL2-FULL-STEPS.md §1.3 实体
 * #6/#7/#8 精确坐标）：右腿竖线 x=1.625 + 小弧 R0.625（圆心 (2.25,1.063)，
 * startAngle=π sweep=−π/2）+ 喉部水平线 y=1.688；偏移 0.75 向外 → 左腿
 * x=0.875 [#16] + 大弧 R1.375 同心 [#15] + 顶切线 y=2.438 [#14]。
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
  OFFSET_TOL,
  buildOffsetDraft,
  collectOffsetChain,
  offsetMeasureDistance,
  resolveNearestOffsetSeedId,
} from '../tools/sketch/sketch-offset-logic.js';
import type { OffsetChain } from '../tools/sketch/sketch-offset-logic.js';
import { SketchOffsetTool, registerSketchOffsetTools } from '../tools/sketch/SketchOffsetTool.js';
import { SKETCH_RIBBON_TOOLS } from '../ribbon/sketch-tools.js';

// ---------------------------------------------------------------------------
// Fixture：Tutorial 2 拱喉链（§1.3 #6/#7/#8）+ 远处干扰线（断链用）。
// ---------------------------------------------------------------------------

/** 右腿竖线 x=1.625（#6）：p1(1.625,0.375) → p2(1.625,1.063)。 */
const TUTORIAL_ENTITIES: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 1.625, y: 0.375 },
  { kind: 'point', id: 2, x: 1.625, y: 1.063 },
  { kind: 'line', id: 3, p1: 1, p2: 2 },
  { kind: 'point', id: 4, x: 2.25, y: 1.063 },
  { kind: 'arc', id: 5, center: 4, radius: 0.625, startAngle: Math.PI, sweepAngle: -Math.PI / 2 },
  { kind: 'point', id: 6, x: 2.25, y: 1.688 },
  { kind: 'point', id: 7, x: 4.375, y: 1.688 },
  { kind: 'line', id: 8, p1: 6, p2: 7 },
  // 干扰线（不相接，断链判定用）
  { kind: 'point', id: 41, x: 10, y: 10 },
  { kind: 'point', id: 42, x: 12, y: 10 },
  { kind: 'line', id: 20, p1: 41, p2: 42 },
];

const TUTORIAL_CONSTRAINTS: SketchConstraintDto[] = [];

/** L 形两线（共享端点焊接）：lineA (0,0)→(2,0)、lineB (2,0)→(2,2)。 */
const L_ENTITIES: SketchEntityDto[] = [
  { kind: 'point', id: 1, x: 0, y: 0 },
  { kind: 'point', id: 2, x: 2, y: 0 },
  { kind: 'line', id: 3, p1: 1, p2: 2 },
  { kind: 'point', id: 4, x: 2, y: 2 },
  { kind: 'line', id: 5, p1: 2, p2: 4 },
];

describe('M6-c T4：collectOffsetChain 焊接图链扩展', () => {
  it('通道③弧端点几何重合：Tutorial 2 线-弧-线链一次成链（右腿+小弧+喉线）', () => {
    const collected = collectOffsetChain(TUTORIAL_ENTITIES, TUTORIAL_CONSTRAINTS, 3);
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    // 干扰线 #20 不入链；三成员齐。
    expect(collected.chain.members.map((e) => e.id).sort((a, b) => a - b)).toEqual([3, 5, 8]);
    // 两处相接点对（右腿终↔弧起 / 弧终↔喉线起）。
    expect(collected.chain.junctions).toHaveLength(2);
  });

  it('通道①coincident 焊接 + 通道②共享端点：两线链', () => {
    // 共享端点：lineA#3.p2 == lineB#5.p1（point#2）。
    const shared = collectOffsetChain(L_ENTITIES, [], 3);
    expect(shared.ok).toBe(true);
    if (!shared.ok) return;
    expect(shared.chain.members.map((e) => e.id)).toEqual([3, 5]);
    expect(shared.chain.junctions).toHaveLength(1);

    // coincident 焊接：两独立端点对（M3-b 矩形拓扑变体）。
    const welded: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 2, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
      { kind: 'point', id: 4, x: 2, y: 2 },
      { kind: 'line', id: 5, p1: 4, p2: 6 },
      { kind: 'point', id: 6, x: 2, y: 0 },
    ];
    const viaConstraint = collectOffsetChain(welded, [{ kind: 'coincident', id: 20, refs: [2, 6] }], 3);
    expect(viaConstraint.ok).toBe(true);
    if (!viaConstraint.ok) return;
    expect(viaConstraint.chain.members.map((e) => e.id)).toEqual([3, 5]);
  });

  it('断链：两条互不相接的链各扩各的（seed 链闭包不越界）', () => {
    const two: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 1, y: 0 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
      { kind: 'point', id: 4, x: 5, y: 5 },
      { kind: 'point', id: 5, x: 6, y: 5 },
      { kind: 'line', id: 6, p1: 4, p2: 5 },
    ];
    const a = collectOffsetChain(two, [], 3);
    const b = collectOffsetChain(two, [], 6);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.chain.members.map((e) => e.id)).toEqual([3]);
    expect(b.chain.members.map((e) => e.id)).toEqual([6]);
  });

  it('孤立弧（无相接）自成单成员链；circle/point 种子 → unsupportedKind', () => {
    const lone: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'arc', id: 2, center: 1, radius: 1, startAngle: 0, sweepAngle: Math.PI },
    ];
    const arcChain = collectOffsetChain(lone, [], 2);
    expect(arcChain.ok).toBe(true);
    if (!arcChain.ok) return;
    expect(arcChain.chain.members.map((e) => e.id)).toEqual([2]);
    expect(arcChain.chain.junctions).toHaveLength(0);

    const withCircle: SketchEntityDto[] = [...lone, { kind: 'circle', id: 3, center: 1, radius: 2 }];
    expect(collectOffsetChain(withCircle, [], 3)).toEqual({ ok: false, error: 'unsupportedKind' });
    expect(collectOffsetChain(withCircle, [], 1)).toEqual({ ok: false, error: 'unsupportedKind' }); // point
    expect(collectOffsetChain(withCircle, [], 99)).toEqual({ ok: false, error: 'unsupportedKind' }); // 不存在
  });
});

describe('M6-c T4：resolveNearestOffsetSeedId 就近分辨（弧参与）', () => {
  it('弧周命中 → 弧实体；圆周命中 → 圆实体（工具面再拒收）；线中部 → 线', () => {
    // 弧中角点（3π/4 方向弧上）：距弧 0，距腿/喉线均 ~0.48。
    const arcMid = { u: 2.25 + 0.625 * Math.cos(3 * Math.PI / 4), v: 1.063 + 0.625 * Math.sin(3 * Math.PI / 4) };
    expect(resolveNearestOffsetSeedId(TUTORIAL_ENTITIES, arcMid)).toBe(5);
    const legMid = { u: 1.5, v: 0.7 }; // 右腿左侧（距腿 0.125，距弧周更远）
    expect(resolveNearestOffsetSeedId(TUTORIAL_ENTITIES, legMid)).toBe(3);

    const withCircle: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'circle', id: 2, center: 1, radius: 1 },
    ];
    expect(resolveNearestOffsetSeedId(withCircle, { u: 1, v: 0 })).toBe(2); // 圆周极点
  });

  it('无解算坐标 → undefined', () => {
    const unsolved: SketchEntityDto[] = [
      { kind: 'point', id: 1 },
      { kind: 'line', id: 2, p1: 1, p2: 3 },
      { kind: 'point', id: 3 },
    ];
    expect(resolveNearestOffsetSeedId(unsolved, { u: 0, v: 0 })).toBeUndefined();
  });
});

describe('M6-c T4：offsetMeasureDistance 垂距量取', () => {
  it('线=点到线段距（投影夹取）；弧=到圆周距', () => {
    expect(offsetMeasureDistance(TUTORIAL_ENTITIES[2]!, TUTORIAL_ENTITIES, { u: 1.0, v: 0.7 })).toBeCloseTo(0.625, 10);
    // 端点外投影夹取：光标在腿下端延长线上 → 距端点。
    expect(offsetMeasureDistance(TUTORIAL_ENTITIES[2]!, TUTORIAL_ENTITIES, { u: 1.625, v: 0.0 })).toBeCloseTo(0.375, 10);
    // 弧：光标在圆心正右方 (3.0,1.063) → |3.0−2.25 − 0.625| = 0.125。
    expect(offsetMeasureDistance(TUTORIAL_ENTITIES[4]!, TUTORIAL_ENTITIES, { u: 3.0, v: 1.063 })).toBeCloseTo(0.125, 10);
  });
});

describe('M6-c T4：buildOffsetDraft 闭式偏移与约束展开（Tutorial 2 同构）', () => {
  const chain = (partial: Partial<OffsetChain>, seedId: number): OffsetChain => ({
    seedId,
    members: [],
    junctions: [],
    ...partial,
  });

  it('拱喉链偏移 0.75 向外：左腿 x=0.875 + 大弧 R1.375 同心 + 顶切线 y=2.438（§1.3 #14/#15/#16）', () => {
    const collected = collectOffsetChain(TUTORIAL_ENTITIES, TUTORIAL_CONSTRAINTS, 3);
    expect(collected.ok).toBe(true);
    if (!collected.ok) return;
    const built = buildOffsetDraft({ chain: collected.chain, entities: TUTORIAL_ENTITIES, distance: 0.75, cursor: { u: 0.9, v: 1.7 }, startId: 100 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const pts = built.draft.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'point' }> => e.kind === 'point');
    const lines = built.draft.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'line' }> => e.kind === 'line');
    const arcs = built.draft.entities.filter((e): e is Extract<SketchEntityDto, { kind: 'arc' }> => e.kind === 'arc');
    expect(pts).toHaveLength(5); // 腿 2 + 喉线 2 + 弧心 1
    expect(lines).toHaveLength(2);
    expect(arcs).toHaveLength(1);

    // 左腿竖线 x=0.875（整线法向平移，端点同平移 → 与源平行且法距=d）。
    const newLeg = lines.find((l) => Math.abs((pts.find((p) => p.id === l.p1)?.x ?? 0) - 0.875) < 1e-9);
    expect(newLeg).toBeDefined();
    const legP1 = pts.find((p) => p.id === newLeg!.p1);
    const legP2 = pts.find((p) => p.id === newLeg!.p2);
    expect(legP1).toMatchObject({ x: 0.875, y: 0.375 });
    expect(legP2).toMatchObject({ x: 0.875, y: 1.063 });

    // 大弧 R1.375 同心同 span（0.625+0.75）。
    expect(arcs[0]).toMatchObject({ radius: 1.375, startAngle: Math.PI, sweepAngle: -Math.PI / 2 });
    const arcCenter = pts.find((p) => p.id === arcs[0]!.center);
    expect(arcCenter).toMatchObject({ x: 2.25, y: 1.063 });

    // 顶切线 y=2.438（浮点和：1.688+0.75 → closeTo）。
    const newThroat = lines.find((l) => l.id !== newLeg!.id);
    const throatP1 = pts.find((p) => p.id === newThroat!.p1);
    expect(throatP1?.y).toBeCloseTo(2.438, 10);
    expect(throatP1?.x).toBeCloseTo(2.25, 10);

    // 约束展开形态：parallel+distance ×2（线对）+ 圆心 coincident + radius（弧对）；
    // 线↔弧相接无桥（契约弧端点不可寻址，文件头 v1 边界）。
    expect(built.draft.constraints.map((c) => c.kind)).toEqual(['parallel', 'distance', 'coincident', 'radius', 'parallel', 'distance']);
    // [40] DISTANCE=0.75 同构：refs = 源线 p1 ↔ 新线 p1，value=d。
    const distances = built.draft.constraints.filter((c) => c.kind === 'distance');
    expect(distances.map((c) => c.value)).toEqual([0.75, 0.75]);
    for (const c of distances) {
      expect(c.refs).toHaveLength(2);
      expect(TUTORIAL_ENTITIES.some((e) => e.kind === 'point' && e.id === c.refs[0])).toBe(true); // 源端点
      expect(pts.some((p) => p.id === c.refs[1])).toBe(true); // 新端点
    }
    const centerCoincident = built.draft.constraints.find((c) => c.kind === 'coincident');
    expect(centerCoincident?.refs).toEqual([4, arcs[0]!.center]); // 源弧心点 ↔ 新弧心点
    expect(built.draft.constraints.find((c) => c.kind === 'radius')?.value).toBe(1.375);

    // 相切链创建坐标天然满足桥位（左腿上端=新弧起点）：新弧 start=(0.875,1.063)。
    const newArcStart = {
      u: 2.25 + 1.375 * Math.cos(Math.PI),
      v: 1.063 + 1.375 * Math.sin(Math.PI),
    };
    expect(newArcStart.u).toBeCloseTo(0.875, 10);
    expect(newArcStart.v).toBeCloseTo(1.063, 10);

    // id 播种：全部唯一、≥ startId、nextId=终值+1（10 实体+6 约束=16 支）。
    const allIds = [...built.draft.entities, ...built.draft.constraints].map((e) => e.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(Math.min(...allIds)).toBe(100);
    expect(built.draft.nextId).toBe(100 + allIds.length);
  });

  it('方向翻转：光标另一侧 → −d（腿 x=2.375；弧光标圆内 → R−d）', () => {
    // 腿单成员链：光标在 x>1.625 侧 → 向右偏移。
    const legChain = chain({ members: [TUTORIAL_ENTITIES[2]!] }, 3);
    const right = buildOffsetDraft({ chain: legChain, entities: TUTORIAL_ENTITIES, distance: 0.75, cursor: { u: 2.5, v: 0.7 }, startId: 1 });
    expect(right.ok).toBe(true);
    if (!right.ok) return;
    const rightP1 = right.draft.entities.find((e) => e.kind === 'point' && e.id === (right.draft.entities.find((x) => x.kind === 'line') as { p1: number }).p1);
    expect(rightP1).toMatchObject({ x: 2.375, y: 0.375 });

    // 弧：光标圆内 → R−d（0.625−0.3=0.325）；span 原样。
    const arcChain = chain({ members: [TUTORIAL_ENTITIES[4]!] }, 5);
    const inward = buildOffsetDraft({ chain: arcChain, entities: TUTORIAL_ENTITIES, distance: 0.3, cursor: { u: 2.3, v: 1.1 }, startId: 1 });
    expect(inward.ok).toBe(true);
    if (!inward.ok) return;
    const inwardArc = inward.draft.entities.find((e) => e.kind === 'arc');
    expect(inwardArc).toMatchObject({ radius: 0.325, startAngle: Math.PI, sweepAngle: -Math.PI / 2 });
  });

  it('链桥 coincident：线↔线相接 → 新对应端点焊接（非相切拐角坐标留缝、拓扑照发）', () => {
    const lChain = collectOffsetChain(L_ENTITIES, [], 3);
    expect(lChain.ok).toBe(true);
    if (!lChain.ok) return;
    const built = buildOffsetDraft({ chain: lChain.chain, entities: L_ENTITIES, distance: 0.5, cursor: { u: 1, v: 1 }, startId: 10 });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const bridges = built.draft.constraints.filter((c) => c.kind === 'coincident');
    expect(bridges).toHaveLength(1); // 共享端点相接一处
    const bridge = bridges[0]!;
    const ptIds = new Set(built.draft.entities.filter((e) => e.kind === 'point').map((p) => p.id));
    expect(bridge.refs).toHaveLength(2);
    for (const r of bridge.refs) expect(ptIds.has(r)).toBe(true); // 桥接的是两条新线的端点
  });

  it('拒收位形：d≈0 → zeroDistance；向内偏移半径坍缩 → degenerateRadius；circle 入链 → unsupportedKind', () => {
    const legChain = chain({ members: [TUTORIAL_ENTITIES[2]!] }, 3);
    expect(buildOffsetDraft({ chain: legChain, entities: TUTORIAL_ENTITIES, distance: 0, cursor: { u: 2, v: 0.7 }, startId: 1 }))
      .toEqual({ ok: false, error: 'zeroDistance' });
    expect(buildOffsetDraft({ chain: legChain, entities: TUTORIAL_ENTITIES, distance: -1, cursor: { u: 2, v: 0.7 }, startId: 1 }))
      .toEqual({ ok: false, error: 'zeroDistance' });

    const arcChain = chain({ members: [TUTORIAL_ENTITIES[4]!] }, 5);
    expect(buildOffsetDraft({ chain: arcChain, entities: TUTORIAL_ENTITIES, distance: 0.7, cursor: { u: 2.3, v: 1.1 }, startId: 1 }))
      .toEqual({ ok: false, error: 'degenerateRadius' }); // 0.625−0.7 < 0

    const circleMember: SketchEntityDto = { kind: 'circle', id: 30, center: 4, radius: 0.2 };
    expect(buildOffsetDraft({ chain: chain({ members: [circleMember] }, 30), entities: TUTORIAL_ENTITIES, distance: 0.1, cursor: { u: 2.3, v: 1.1 }, startId: 1 }))
      .toEqual({ ok: false, error: 'unsupportedKind' });
  });

  it('容差哨兵 OFFSET_TOL 为正小量（退化判定与几何通道共用口径）', () => {
    expect(OFFSET_TOL).toBeGreaterThan(0);
    expect(OFFSET_TOL).toBeLessThan(1e-3);
  });
});

describe('M6-c T4：SketchOffsetTool toolId 与注册接线', () => {
  it('toolId=Sketch.Offset（ribbon 注册表已换血：占位 sketchOffset 退场）', () => {
    expect(SketchOffsetTool.toolId).toBe('Sketch.Offset');
    const offset = SKETCH_RIBBON_TOOLS.find((t) => t.id === 'Sketch.Offset');
    expect(offset).toBeDefined();
    expect(offset?.group).toBe('sketchEdit');
    expect(SKETCH_RIBBON_TOOLS.some((t) => t.id === 'sketchOffset')).toBe(false);
    // 18 之数不变（占位换真，不增位）。
    expect(SKETCH_RIBBON_TOOLS).toHaveLength(18);
  });

  it('registerSketchOffsetTools 幂等：按序各注册一次（二次调用 no-op）', () => {
    const before = registerMock.mock.calls.length;
    registerSketchOffsetTools();
    registerSketchOffsetTools(); // 幂等：模块 flag 置位后 no-op
    const registered = registerMock.mock.calls.slice(before).map((call) => (call[0] as { toolId: string }).toolId);
    expect(registered).toEqual(['Sketch.Offset']);
  });
});
