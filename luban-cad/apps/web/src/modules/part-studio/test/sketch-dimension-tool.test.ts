/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具（Sketch.Dimension）推断单测：同一个按钮，按拾取实体动态
 * 决定 length / radius / distance（不再有长度/半径下拉）。
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

  it('线 + 第二条线 → 距离；点 + 线 → 距离', () => {
    expect(inferDimensionCompletion([pick('line', 1), pick('line', 2)], false)).toMatchObject({
      kind: 'distance',
      entityIds: [1, 2],
    });
    expect(inferDimensionCompletion([pick('point', 3), pick('line', 4)], false)).toMatchObject({
      kind: 'distance',
      entityIds: [3, 4],
    });
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
