/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具（Sketch.Dimension）推断单测：同一个按钮，按拾取实体动态
 * 决定 length / radius / distance（不再有长度/半径下拉）。
 * E1（2026-11-15）：工具生命周期契约——发候选后保持安装、等值弹层关闭
 * （dimensionPopupClosed）才 exitTool，等待期间忽略画布拾取。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import { EventHandled } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';
import {
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
}));

vi.mock('../hooks/useSketchSystem.js', () => ({
  getSketchSystem: () => ({
    activeSketch: {
      id: 'sk-1',
      entities: mockState.entities,
      constraints: [],
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

// ── E1（2026-11-15 Onshape live）：链式标注第一步——工具等值弹层关闭才退出 ────
describe('E1：SketchDimensionTool 等待值弹层关闭（dimensionPopupClosed）后退出', () => {
  const listeners: (() => void)[] = [];

  afterEach(() => {
    while (listeners.length > 0) listeners.pop()!();
    // 释放可能仍在等待的工具监听（防跨用例陈旧监听）。
    sketchToolEvents.emit('dimensionPopupClosed');
    mockState.entities = [];
  });

  function buttonEvent(x: number, y: number): BeButtonEvent {
    return { viewPoint: { x, y }, point: { x, y } } as unknown as BeButtonEvent;
  }

  async function click(tool: SketchDimensionTool, u: number, v: number): Promise<EventHandled> {
    mockState.hit = { u, v };
    return tool.onDataButtonDown(buttonEvent(u, v));
  }

  it('发候选后保持安装、忽略画布拾取；dimensionPopupClosed 才 exitTool（一次）', async () => {
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

    // 弹层关闭 → 退出一次；重复发射不再触发（等待监听已退订）。
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).toHaveBeenCalledTimes(1);
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).toHaveBeenCalledTimes(1);
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
});
