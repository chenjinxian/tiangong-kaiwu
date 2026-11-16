/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 2026-11-17 W28（Onshape live）：相切圆弧绘制 `R` 半径点标签。
 *
 * live 证据（zh-CN，草图 2）：点选直线端点定切点、移动光标定弧终点后，画布在
 * **切点→当前弧终点的弦投影中点**显示水平蓝色 `R<半径>` 点标签（无白卡）：
 * 采样切点 (774,322)、光标 (900,450) CSS → 弦中点 (837,386)，标签中心
 * ≈(837.5,388.5)（≤2.5 px）；另外两个光标位置同守弦中点规则。未选到有效
 * 起点前无标签。
 *
 * 测试触达法（SketchAddDimensionTool.test 同款）：@itwin/core-frontend 假基类 +
 * 模块级打桩草图系统（activeSketch.entities）/平面架/取点；视口恒等投影
 * （1 局部单位 = 1 CSS px），只钉工具发布面（drawLabels 形态/锚点/读数）。
 * 真实相机/覆盖层像素归真栈 `e2e/sketch-draw-readout.spec.ts`（父任务运行）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeButtonEvent } from '@itwin/core-frontend';
import type { SketchEntityDto } from '@luban-cad/shared';

const mockState = vi.hoisted(() => ({
  hit: { u: 0, v: 0 } as { u: number; v: number },
  entities: [] as unknown[],
}));

const mockViewManager = vi.hoisted(() => ({
  selectedView: undefined as unknown,
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
  resolveSketchPlaneFrame: () => ({
    toWorld: (p: { u: number; v: number }) => ({ x: p.u, y: p.v, z: 0 }),
    toLocal: (w: { x: number; y: number }) => ({ u: w.x, v: w.y }),
  }),
}));

vi.mock('@itwin/core-frontend', () => {
  class Tool {
    public static toolId = '';
    public static iconSpec = '';
    public static namespace = '';
    public get iconSpec(): string { return (this.constructor as typeof Tool).iconSpec; }
    public get isDynamicsStarted(): boolean { return true; }
    public async run(): Promise<boolean> { return true; }
    public async exitTool(): Promise<void> { /* noop */ }
    public async onPostInstall(): Promise<void> { /* noop */ }
    public async onCleanup(): Promise<void> { /* noop */ }
    public async onMouseMotion(_ev: unknown): Promise<void> { /* noop */ }
    public beginDynamics(): void { /* noop */ }
    public endDynamics(): void { /* noop */ }
    public initLocateElements(..._args: unknown[]): void { /* noop */ }
    public requireWriteableTarget(): boolean { return true; }
  }
  class PrimitiveTool extends Tool { /* 空白基类：只做生命周期占位 */ }

  return {
    Tool,
    PrimitiveTool,
    IModelApp: {
      viewManager: mockViewManager,
      accuSnap: undefined,
      tools: { register: vi.fn() },
      notifications: {
        outputPrompt: vi.fn(),
        outputMessage: vi.fn(),
        setToolAssistance: vi.fn(),
      },
    },
    EventHandled: { Yes: 1, No: 0 },
    GraphicType: { WorldOverlay: 1 },
    NotifyMessageDetails: class { constructor(_priority: unknown, _message: unknown) {} },
    OutputMessagePriority: { None: 0, Error: 10, Warning: 11, Info: 12 },
  };
});

import {
  clearSketchToolFeedback,
  getSketchToolFeedback,
} from '../tools/sketch/sketch-tool-feedback.js';
import type { SketchToolFeedback, SketchToolPointLabel } from '../tools/sketch/sketch-tool-feedback.js';
import { sketchPointLabelCenter } from '../tools/sketch/sketch-edge-labels.js';
import { formatSketchLiveNumber } from '../tools/sketch/sketch-live-measures.js';
import { SketchTangentArcTool } from '../tools/sketch/SketchTangentArcTool.js';

/** 假视口（恒等投影）：世界 (x,y) → 视口 (x,y)——只钉工具的投影/锚点。 */
const fakeViewport = {
  worldToView: (world: { x: number; y: number }) => ({ x: world.x, y: world.y }),
};

const makeEvent = (x: number, y: number): BeButtonEvent => ({
  viewPoint: { x, y },
} as unknown as BeButtonEvent);

/** 水平线 (-?): p1(0,0) → p2(10,0)；两端均可作相切切点（PICK_TOL=3 mm）。 */
const LINE: SketchEntityDto = { kind: 'line', id: 7, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } };

async function pickStart(tool: SketchTangentArcTool, u: number, v: number): Promise<void> {
  mockState.hit = { u, v };
  await tool.onDataButtonDown(makeEvent(u, v));
}

async function moveTo(tool: SketchTangentArcTool, u: number, v: number): Promise<SketchToolFeedback> {
  mockState.hit = { u, v };
  await tool.onMouseMotion(makeEvent(u, v));
  const feedback = getSketchToolFeedback();
  if (!feedback) throw new Error('工具未发布反馈');
  return feedback;
}

// ---------------------------------------------------------------------------
// 纯函数：live 采样锚点规则 + 读数格式（复用 W12/W15/W25 同一 helper）。
// ---------------------------------------------------------------------------
describe('W28：弦中点锚点与读数格式（纯函数）', () => {
  it('live 采样：切点 (774,322)、光标 (900,450) → 标签中心 (837,386)', () => {
    expect(sketchPointLabelCenter({ x: 774, y: 322 }, { x: 900, y: 450 }))
      .toEqual({ x: 837, y: 386 });
  });

  it('读数格式与草图其它读数一致：去尾零、最多两位小数', () => {
    expect(formatSketchLiveNumber(26)).toBe('26');
    expect(formatSketchLiveNumber(6.25)).toBe('6.25');
    expect(formatSketchLiveNumber(6.5)).toBe('6.5');
    expect(formatSketchLiveNumber(6.004)).toBe('6');
  });
});

// ---------------------------------------------------------------------------
// 工具发布面：切点已选 → 光标移动发布一个 R 点标签，锚点=弦投影中点。
// 假视口恒等投影：标签坐标可直接与局部 (u,v) 对比。
// ---------------------------------------------------------------------------
describe('W28：相切圆弧 R 半径点标签（drawLabels 发布）', () => {
  afterEach(() => {
    clearSketchToolFeedback();
    mockViewManager.selectedView = undefined;
    mockState.hit = { u: 0, v: 0 };
    mockState.entities = [];
  });

  const installViewport = (): void => {
    mockViewManager.selectedView = fakeViewport;
  };

  it('切点(0,0)/光标(5,5) → R 标签落在弦投影中点、值=相切弧半径', async () => {
    installViewport();
    mockState.entities = [LINE];
    const tool = new SketchTangentArcTool();
    await tool.onPostInstall();
    await pickStart(tool, 0, 0);
    const feedback = await moveTo(tool, 5, 5);

    // 相切弧读数不进入白卡片（live：同一帧只有画布点标签）。
    expect(feedback.measures).toEqual([]);
    expect(feedback.hint).toBeTruthy();
    expect(feedback.cursor).toEqual({ x: 5, y: 5 });
    const labels = feedback.drawLabels ?? [];
    expect(labels).toHaveLength(1);
    const label = labels[0] as SketchToolPointLabel;
    expect(label.kind).toBe('point');
    expect(label.labelKey).toBe('partStudio.sketch.live.radius');
    expect(label.prefix).toBe('R');
    // 切点 (0,0)、弧终点/光标 (5,5)：r = |E−S|² / (2·(E−S)·n) = 50/10 = 5。
    expect(label.value).toBe('5');
    expect(label.value).toBe(formatSketchLiveNumber(5));
    // 水平点标签（无旋转、无额外抑制项——相切圆弧本就不发白卡片）。
    expect(label.suppressesLabelKeys).toBeUndefined();
    // 弦中点：(0,0) 与 (5,5) 的投影中点。
    expect(label.point).toEqual({ x: 2.5, y: 2.5 });
    expect(label.point).toEqual(sketchPointLabelCenter({ x: 0, y: 0 }, { x: 5, y: 5 }));
  });

  it('光标移动 → 标签跟随新弦中点且读数更新', async () => {
    installViewport();
    mockState.entities = [LINE];
    const tool = new SketchTangentArcTool();
    await tool.onPostInstall();
    await pickStart(tool, 0, 0);

    const first = await moveTo(tool, 5, 5);
    const firstLabel = first.drawLabels?.[0] as SketchToolPointLabel | undefined;
    expect(firstLabel?.point).toEqual({ x: 2.5, y: 2.5 });
    expect(firstLabel?.value).toBe('5');

    // 光标 (5,10)：r = 125/20 = 6.25；弦中点 (2.5,5)。
    const second = await moveTo(tool, 5, 10);
    const secondLabel = second.drawLabels?.[0] as SketchToolPointLabel | undefined;
    expect(secondLabel?.kind).toBe('point');
    expect(secondLabel?.point).toEqual({ x: 2.5, y: 5 });
    expect(secondLabel?.value).toBe('6.25');
    expect(secondLabel?.value).not.toBe(firstLabel?.value);
  });

  it('切点取线的另一端（方向反转）仍按同一弦中点规则', async () => {
    installViewport();
    mockState.entities = [LINE];
    const tool = new SketchTangentArcTool();
    await tool.onPostInstall();
    // 点线终点 (10,0)：切线方向指向线内 (-1,0)；光标 (10,10) → r = 5。
    await pickStart(tool, 10, 0);
    const feedback = await moveTo(tool, 10, 10);

    const label = feedback.drawLabels?.[0] as SketchToolPointLabel | undefined;
    expect(label?.prefix).toBe('R');
    expect(label?.value).toBe('5');
    expect(label?.point).toEqual({ x: 10, y: 5 });
  });

  it('未选到有效起点：不发布 drawLabels（只保留阶段提示）', async () => {
    installViewport();
    mockState.entities = [LINE];
    const tool = new SketchTangentArcTool();
    await tool.onPostInstall();

    // 起点前：光标移动无标签。
    const before = await moveTo(tool, 5, 5);
    expect(before.drawLabels).toBeUndefined();
    expect(before.hint).toBeTruthy();
    expect(before.measures).toEqual([]);

    // 远离线端点处点击：不锚定切点，后续移动仍无标签。
    await pickStart(tool, 50, 50);
    const afterMiss = await moveTo(tool, 5, 5);
    expect(afterMiss.drawLabels).toBeUndefined();
  });

  it('退化光标（弧终点回到切点）：无半径 → 不发标签，不抛错', async () => {
    installViewport();
    mockState.entities = [LINE];
    const tool = new SketchTangentArcTool();
    await tool.onPostInstall();
    await pickStart(tool, 0, 0);
    const feedback = await moveTo(tool, 0, 0);

    expect(feedback.drawLabels).toBeUndefined();
    expect(feedback.hint).toBeTruthy();
    expect(feedback.measures).toEqual([]);
  });

  it('无视口：不发点标签（仅保留阶段提示），不抛错', async () => {
    mockState.entities = [LINE];
    const tool = new SketchTangentArcTool();
    await tool.onPostInstall();
    await pickStart(tool, 0, 0);
    const feedback = await moveTo(tool, 5, 5);

    expect(feedback.drawLabels).toBeUndefined();
    expect(feedback.hint).toBeTruthy();
    expect(feedback.cursor).toEqual({ x: 5, y: 5 });
  });
});
