/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具（Sketch.Dimension）推断单测：同一个按钮，按拾取实体动态
 * 决定 length / radius / distance / angle（不再有长度/半径下拉）。
 * W22（2026-11-16 live）：两非平行线 → angle（夹角由既有 `lineAngleDeg` 测量、
 * 由推断层按阈值判定）；平行线保持 distance（tutorial2 真栈依赖）。
 * E1/W19（2026-11-15/16 live）：工具生命周期契约——发候选后保持安装、等待
 * 值弹层关闭（dimensionPopupClosed），等待期间忽略画布拾取；弹层关闭后**仍
 * 保持安装**：清空拾取、恢复提示，下一次拾取直接发第二个候选（无需重点
 * ribbon）。Escape（无弹层时）由默认快捷键 startDefaultTool 退出工具。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { EventHandled } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import {
  findExistingDimensionConstraint,
  inferDimensionCompletion,
  PARALLEL_LINE_ANGLE_MAX_DEG,
} from '../tools/sketch/sketch-dimension-logic.js';
import { resolveNearestPick } from '../tools/sketch/sketch-constraint-logic.js';
import type { SketchPick } from '../tools/sketch/sketch-constraint-logic.js';
import { SketchDimensionTool } from '../tools/sketch/SketchDimensionTool.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';
import type { SketchDimensionCandidate } from '../tools/sketch/sketch-tool-events.js';

// ── 工具交互夹具（E1）：拾取/平面架/草图系统/工具生命周期全部打桩 ────────────
// 只验证「发候选后等待值弹层关闭才 exitTool」的生命周期契约；几何分辨走
// 真实 resolveNearestPick（纯函数，未打桩）。
const mockState = vi.hoisted(() => ({
  hit: { u: 0, v: 0 },
  entities: [] as unknown[],
  constraints: [] as unknown[],
}));

vi.mock('../hooks/useSketchSystem.js', () => ({
  getSketchSystem: () => ({
    activeSketch: {
      id: 'sk-1',
      entities: mockState.entities,
      constraints: mockState.constraints,
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [],
    },
    loading: false,
    applyUpdate: async () => ({ ok: true, featureId: 'sk-1' }),
    applyConstraintValue: async () => ({ ok: true, featureId: 'sk-1' }),
    refresh: async () => undefined,
  }),
}));

vi.mock('../tools/sketch/SketchAddConstraintTool.js', () => ({
  pickHitLocal: () => mockState.hit,
  resolveSketchPlaneFrame: () => ({}),
}));

vi.mock('@itwin/core-frontend', () => {
  class Tool {
    static toolId = '';
    static iconSpec = '';
    /** E1：实例级退出 spy——验证「弹层关闭后才 exitTool」。 */
    readonly exitTool = vi.fn(async (): Promise<void> => undefined);
    async run(): Promise<boolean> { return true; }
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
      tools: { register: vi.fn() },
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

const pick = (kind: SketchPick['kind'], entityId: number): SketchPick => ({
  kind,
  ref: { entity: entityId, part: kind === 'line' ? 'start' : kind === 'point' ? 'start' : 'center' } as never,
  entityId,
});

/** 生产口径曲线拾取：`resolveNearestPick` 对 line/circle/arc 返回整实体数字 ref。 */
const curvePick = (kind: SketchPick['kind'], entityId: number): SketchPick => ({
  kind,
  ref: entityId,
  entityId,
});

describe('inferDimensionCompletion（单尺寸按钮动态推断）', () => {
  it('线 + 放置点击 → 长度', () => {
    expect(inferDimensionCompletion([pick('line', 1)], true)).toMatchObject({
      kind: 'length',
      refs: [{ entity: 1, part: 'start' }],
      entityIds: [1],
    });
  });

  it('圆弧 + 放置点击 → 半径；圆 → 直径（v1.23 ADR-0004）', () => {
    expect(inferDimensionCompletion([pick('arc', 2)], true)).toMatchObject({
      kind: 'radius',
      entityIds: [2],
    });
    expect(inferDimensionCompletion([pick('circle', 3)], true)).toMatchObject({
      kind: 'diameter',
      entityIds: [3],
    });
  });

  it('平行两线（含夹角不可测）→ 距离不变；点 + 线 → 距离', () => {
    // W22：平行线保持旧 distance（tutorial2 真栈依赖两平行线距离）。
    expect(inferDimensionCompletion([curvePick('line', 1), curvePick('line', 2)], false, 0))
      .toMatchObject({ kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
    // 角度不可测（引用未解算）→ 旧 distance 行为，不伪造角度。
    expect(inferDimensionCompletion([pick('line', 1), pick('line', 2)], false)).toMatchObject({
      kind: 'distance',
      entityIds: [1, 2],
    });
    expect(inferDimensionCompletion([pick('point', 3), pick('line', 4)], false)).toMatchObject({
      kind: 'distance',
      entityIds: [3, 4],
    });
  });

  it('W22：两非平行线 → angle（refs/entityIds 原样透传）；平行阈值边界 → distance', () => {
    expect(inferDimensionCompletion([curvePick('line', 1), curvePick('line', 2)], false, 45))
      .toMatchObject({ kind: 'angle', refs: [1, 2], entityIds: [1, 2] });
    expect(inferDimensionCompletion([curvePick('line', 3), curvePick('line', 4)], false, 90))
      .toMatchObject({ kind: 'angle', refs: [3, 4], entityIds: [3, 4] });
    // 阈值以内（含边界）视为平行 → distance；浮点/非有限值也不得产生 angle。
    expect(inferDimensionCompletion([curvePick('line', 1), curvePick('line', 2)], false, PARALLEL_LINE_ANGLE_MAX_DEG))
      .toMatchObject({ kind: 'distance' });
    expect(inferDimensionCompletion([curvePick('line', 1), curvePick('line', 2)], false, Number.NaN))
      .toMatchObject({ kind: 'distance' });
    // 非两线组合不因角度参数改变：点 + 线仍是 distance。
    expect(inferDimensionCompletion([curvePick('point', 5), curvePick('line', 6)], false, 45))
      .toMatchObject({ kind: 'distance' });
  });

  it('单点 + 放置 → 不产生尺寸（点没有单独尺寸）', () => {
    expect(inferDimensionCompletion([pick('point', 1)], true)).toMatchObject({ kind: 'invalid' });
  });

  it('未放置的单线/单弧 → pending；空拾取 → pending', () => {
    expect(inferDimensionCompletion([pick('line', 1)], false)).toMatchObject({ kind: 'pending' });
    expect(inferDimensionCompletion([pick('arc', 1)], false)).toMatchObject({ kind: 'pending' });
    expect(inferDimensionCompletion([], true)).toMatchObject({ kind: 'pending' });
  });

  it('同一实体再点（放置回原实体）→ 长度/半径', () => {
    expect(inferDimensionCompletion([pick('line', 1), pick('line', 1)], false)).toMatchObject({ kind: 'length' });
    expect(inferDimensionCompletion([pick('arc', 2), pick('arc', 2)], false)).toMatchObject({ kind: 'radius' });
  });

  it('拾取半径：空白放置点击不被「最近实体」吸附（maxDistance）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 30, y: 0 } },
    ];
    // 近线 -> line；远处空白 -> undefined（放置语义），而非永远吸附最近实体。
    expect(resolveNearestPick(entities, { x: 25, y: 1 }, 5)).toMatchObject({ kind: 'line', entityId: 2 });
    expect(resolveNearestPick(entities, { x: 150, y: 72 }, 5)).toBeUndefined();
    // 缺省 maxDistance=∞ 保持旧「就近」语义。
    expect(resolveNearestPick(entities, { x: 150, y: 72 })).toMatchObject({ entityId: 2 });
  });

  it('两个圆/弧 → 不支持（invalid），避免生成假距离', () => {
    expect(inferDimensionCompletion([pick('circle', 1), pick('circle', 2)], false)).toMatchObject({ kind: 'invalid' });
  });
});

// ── W21（2026-11-16 live S1c）：点击已标注几何 → 匹配既有尺寸（不追加）────────
describe('W21：findExistingDimensionConstraint（纯匹配器）', () => {
  const dim = (
    id: number,
    kind: SketchConstraintDto['kind'],
    refs: SketchConstraintDto['refs'],
    value?: number,
    driven?: boolean,
  ): SketchConstraintDto => ({
    id,
    kind,
    refs,
    ...(value !== undefined ? { value } : {}),
    ...(driven === true ? { driven } : {}),
  });

  it('单实体：同实体命中（数字 id 与 {entity} 按实体 id 等价）', () => {
    const constraints = [dim(5, 'length', [1], 20), dim(6, 'length', [2], 30)];
    expect(findExistingDimensionConstraint(constraints, { kind: 'length', refs: [1] })).toMatchObject({ id: 5 });
    expect(findExistingDimensionConstraint(constraints, { kind: 'length', refs: [{ entity: 1, part: 'start' }] }))
      .toMatchObject({ id: 5 });
    // 结构化约束 ↔ 数字完成同样按实体 id 等价。
    expect(findExistingDimensionConstraint(
      [dim(7, 'length', [{ entity: 1, part: 'start' }], 20)],
      { kind: 'length', refs: [1] },
    )).toMatchObject({ id: 7 });
    // 不同实体不命中。
    expect(findExistingDimensionConstraint(constraints, { kind: 'length', refs: [3] })).toBeUndefined();
  });

  it('圆/弧半径↔直径等价：返回既有约束的种类/值（已有直径的圆不得再生成半径）', () => {
    const circleDiameter = [dim(3, 'diameter', [4], 14)];
    expect(findExistingDimensionConstraint(circleDiameter, { kind: 'radius', refs: [4] }))
      .toMatchObject({ id: 3, kind: 'diameter', value: 14 });
    const arcRadius = [dim(8, 'radius', [9], 2.5)];
    expect(findExistingDimensionConstraint(arcRadius, { kind: 'diameter', refs: [9] }))
      .toMatchObject({ id: 8, kind: 'radius', value: 2.5 });
  });

  it('两引用（distance）：顺序无关；引用 part 精确比较，origin 参与归一化', () => {
    const constraints = [dim(4, 'distance', [{ entity: 2, part: 'start' }, { origin: true }], 5)];
    expect(findExistingDimensionConstraint(constraints, {
      kind: 'distance',
      refs: [{ origin: true }, { entity: 2, part: 'start' }],
    })).toMatchObject({ id: 4 });
    expect(findExistingDimensionConstraint(constraints, {
      kind: 'distance',
      refs: [{ origin: true }, { entity: 2, part: 'end' }],
    })).toBeUndefined();
    // 引用数不同不命中（单引用完成 vs 两引用约束；反之亦然）。
    expect(findExistingDimensionConstraint(constraints, { kind: 'distance', refs: [{ origin: true }] })).toBeUndefined();
    expect(findExistingDimensionConstraint([dim(1, 'length', [1], 20)], { kind: 'distance', refs: [1, 2] }))
      .toBeUndefined();
  });

  it('种类不匹配 / 非尺寸 / 非可编辑种类 → 不命中', () => {
    const constraints = [
      dim(1, 'length', [1], 20),
      dim(2, 'horizontal', [1]),
      dim(3, 'coincident', [1, 2]),
      dim(4, 'radius', [2], 5),
    ];
    expect(findExistingDimensionConstraint(constraints, { kind: 'distance', refs: [1] })).toBeUndefined();
    expect(findExistingDimensionConstraint(constraints, { kind: 'length', refs: [3] })).toBeUndefined();
    expect(findExistingDimensionConstraint(constraints, { kind: 'angle', refs: [1, 2] })).toBeUndefined();
    // 尺寸无值也命中（对话框保持空输入，不猜值）。
    expect(findExistingDimensionConstraint([dim(9, 'length', [1])], { kind: 'length', refs: [1] }))
      .toMatchObject({ id: 9 });
  });

  it('W22：两引用 angle 约束命中（顺序无关；返回既有约束，契约值为弧度）', () => {
    const constraints = [dim(12, 'angle', [1, 2], Math.PI / 2)];
    expect(findExistingDimensionConstraint(constraints, { kind: 'angle', refs: [2, 1] }))
      .toMatchObject({ id: 12, kind: 'angle', value: Math.PI / 2 });
    expect(findExistingDimensionConstraint(constraints, { kind: 'distance', refs: [1, 2] }))
      .toBeUndefined();
    const structured = [dim(13, 'angle', [{ entity: 4, part: 'start' }, { origin: true }], Math.PI / 3)];
    expect(findExistingDimensionConstraint(structured, {
      kind: 'angle',
      refs: [{ origin: true }, { entity: 4, part: 'start' }],
    })).toMatchObject({ id: 13 });
  });

  it('driven 参考尺寸只读：不参与匹配（W21 不实现驱动尺寸）', () => {
    expect(findExistingDimensionConstraint([dim(1, 'diameter', [4], 14, true)], { kind: 'diameter', refs: [4] }))
      .toBeUndefined();
  });

  it('多条命中 → 返回 id 最小者（确定性，与数组顺序无关）', () => {
    const constraints = [dim(9, 'length', [1], 20), dim(3, 'length', [1], 21), dim(7, 'length', [1], 22)];
    expect(findExistingDimensionConstraint(constraints, { kind: 'length', refs: [1] })?.id).toBe(3);
    expect(findExistingDimensionConstraint([...constraints].reverse(), { kind: 'length', refs: [1] })?.id).toBe(3);
  });
});

// ── E1/W19（2026-11-15/16 Onshape live）：链式标注——发候选后保持安装 ───────
describe('E1/W19：SketchDimensionTool 发候选后保持安装（弹层关闭恢复拾取）', () => {
  const listeners: (() => void)[] = [];

  afterEach(() => {
    while (listeners.length > 0) listeners.pop()!();
    // 释放可能仍在等待的工具监听（防跨用例陈旧监听）。
    sketchToolEvents.emit('dimensionPopupClosed');
    mockState.entities = [];
    mockState.constraints = [];
  });

  function buttonEvent(x: number, y: number): BeButtonEvent {
    return { viewPoint: { x, y }, point: { x, y } } as unknown as BeButtonEvent;
  }

  async function click(tool: SketchDimensionTool, u: number, v: number): Promise<EventHandled> {
    mockState.hit = { u, v };
    return tool.onDataButtonDown(buttonEvent(u, v));
  }

  it('发候选后保持安装、忽略画布拾取；弹层关闭后清空拾取，下一次拾取发第二个候选', async () => {
    mockState.entities = [{ kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 3, y: 4 } }];
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const exits = (tool as unknown as { exitTool: ReturnType<typeof vi.fn> }).exitTool;
    const candidates: SketchDimensionCandidate[] = [];
    listeners.push(sketchToolEvents.on('dimensionCandidate', (candidate) => candidates.push(candidate)));

    await click(tool, 1.5, 2); // 拾线
    await click(tool, 100, 100); // 空白放置 → length 候选
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'length', measuredValue: 5 });
    expect(exits).not.toHaveBeenCalled();

    // 弹层打开期间：画布拾取返回 Yes、不处理、不产生第二个候选、不退出。
    expect(await click(tool, 1.5, 2)).toBe(EventHandled.Yes);
    expect(candidates).toHaveLength(1);
    expect(exits).not.toHaveBeenCalled();

    // W19 live：弹层关闭（✓/✗ 同通道）后工具保持安装、等待监听已退订
    // （重复发射无副作用），拾取被清空。
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();

    // 拾取已清空：空白点击不产生候选（回到「选择实体」提示）。
    expect(await click(tool, 100, 100)).toBe(EventHandled.Yes);
    expect(candidates).toHaveLength(1);

    // 未重新激活工具，下一次完整拾取直接发第二个候选。
    await click(tool, 1.5, 2);
    await click(tool, 100, 100);
    expect(candidates).toHaveLength(2);
    expect(candidates[1]).toMatchObject({ kind: 'length', measuredValue: 5 });
    expect(exits).not.toHaveBeenCalled();
  });

  it('onCleanup：退订等待监听，之后弹层关闭不再 exitTool（无陈旧监听）', async () => {
    mockState.entities = [{ kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 3, y: 4 } }];
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const exits = (tool as unknown as { exitTool: ReturnType<typeof vi.fn> }).exitTool;
    listeners.push(sketchToolEvents.on('dimensionCandidate', () => undefined));

    await click(tool, 1.5, 2);
    await click(tool, 100, 100);
    await tool.onCleanup();

    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();
  });

  // W21（live S1c）：点击已标注几何 → 候选指向既有约束（不测量新值、不追加）。
  it('W21：点击已标注线 → 候选带 existingConstraintId/existingValue（不重新测量），弹层关闭后保持安装', async () => {
    mockState.entities = [{ kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 3, y: 4 } }];
    // 既有长度尺寸 25.98062（live 全精度值）；几何实测 5 不得覆盖。
    mockState.constraints = [{ kind: 'length', id: 7, refs: [1], value: 25.98062 }];
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const exits = (tool as unknown as { exitTool: ReturnType<typeof vi.fn> }).exitTool;
    const candidates: SketchDimensionCandidate[] = [];
    listeners.push(sketchToolEvents.on('dimensionCandidate', (candidate) => candidates.push(candidate)));

    await click(tool, 1.5, 2); // 拾线
    await click(tool, 100, 100); // 空白放置
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'length', existingConstraintId: 7, existingValue: 25.98062 });
    expect(candidates[0]!.measuredValue).toBeUndefined();
    expect(exits).not.toHaveBeenCalled();

    // W19：弹层关闭后工具保持安装，下一次拾取直接复用匹配结果。
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();
    await click(tool, 1.5, 2);
    await click(tool, 100, 100);
    expect(candidates).toHaveLength(2);
    expect(candidates[1]).toMatchObject({ kind: 'length', existingConstraintId: 7, existingValue: 25.98062 });
    expect(exits).not.toHaveBeenCalled();
  });

  it('W21：弧已有直径尺寸 → 候选种类取既有直径（半径↔直径等价），预填约束值', async () => {
    mockState.entities = [{ kind: 'arc', id: 21, center: { x: 0, y: 0 }, radius: 5, startAngle: 0, sweepAngle: Math.PI }];
    mockState.constraints = [{ kind: 'diameter', id: 11, refs: [21], value: 10 }];
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const candidates: SketchDimensionCandidate[] = [];
    listeners.push(sketchToolEvents.on('dimensionCandidate', (candidate) => candidates.push(candidate)));

    await click(tool, 0, 5); // 拾弧（顶部，避开端点）
    await click(tool, 100, 100); // 空白放置 → 推断 radius，命中既有 diameter
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: 'diameter',
      existingConstraintId: 11,
      existingValue: 10,
    });
    expect(candidates[0]!.measuredValue).toBeUndefined();
  });
});

// ── W22（2026-11-16 live）：两线角度尺寸（非平行 → angle；平行 → distance）──
describe('W22：SketchDimensionTool 两线拾取推断', () => {
  const listeners: (() => void)[] = [];

  afterEach(() => {
    while (listeners.length > 0) listeners.pop()!();
    // 释放等待 popup 的工具实例（防跨用例陈旧监听）。
    sketchToolEvents.emit('dimensionPopupClosed');
    mockState.entities = [];
    mockState.constraints = [];
  });

  /** 水平线 y=−5（x∈[−10,10]）与竖直线 x=0（y∈[5,15]）：非平行、无共点干扰。 */
  const PERPENDICULAR: SketchEntityDto[] = [
    { kind: 'line', id: 1, p1: { x: -10, y: -5 }, p2: { x: 10, y: -5 } },
    { kind: 'line', id: 2, p1: { x: 0, y: 5 }, p2: { x: 0, y: 15 } },
  ];
  const PARALLEL: SketchEntityDto[] = [
    { kind: 'line', id: 40, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    { kind: 'line', id: 41, p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
  ];

  function buttonEvent(x: number, y: number): BeButtonEvent {
    return { viewPoint: { x, y }, point: { x, y } } as unknown as BeButtonEvent;
  }

  async function click(tool: SketchDimensionTool, u: number, v: number): Promise<EventHandled> {
    mockState.hit = { u, v };
    return tool.onDataButtonDown(buttonEvent(u, v));
  }

  function capture(): SketchDimensionCandidate[] {
    const received: SketchDimensionCandidate[] = [];
    listeners.push(sketchToolEvents.on('dimensionCandidate', (candidate) => received.push(candidate)));
    return received;
  }

  it('两非平行线 → angle 候选（夹角为度实测值，不写契约弧度）', async () => {
    mockState.entities = PERPENDICULAR;
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const candidates = capture();
    const exits = (tool as unknown as { exitTool: ReturnType<typeof vi.fn> }).exitTool;

    await click(tool, 0, -5); // 水平线中点
    await click(tool, 0, 10); // 竖直线中点 → 完成（两线直接成角）
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: 'angle',
      refs: [1, 2],
      entityIds: [1, 2],
      measuredValue: 90,
    });
    // W19：发候选后保持安装（等待 popup 关闭）。
    expect(exits).not.toHaveBeenCalled();
  });

  it('两平行线 → distance 不变（实测垂距 mm）', async () => {
    mockState.entities = PARALLEL;
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const candidates = capture();

    await click(tool, 5, 0);
    await click(tool, 5, 5);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'distance', refs: [40, 41], measuredValue: 5 });
  });

  it('W21/W22：已有 angle 约束 → 候选取既有约束（id/显示度），不测量新值', async () => {
    mockState.entities = PERPENDICULAR;
    mockState.constraints = [{ kind: 'angle', id: 8, refs: [1, 2], value: Math.PI / 2 }];
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const candidates = capture();

    await click(tool, 0, -5);
    await click(tool, 0, 10);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: 'angle',
      refs: [1, 2],
      existingConstraintId: 8,
      existingValue: 90,
    });
    expect(candidates[0]!.measuredValue).toBeUndefined();
  });
});
