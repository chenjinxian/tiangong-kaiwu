/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * SketchCreateTool 单元测试（M3-b T4）：
 * 线/矩形/圆三点绘制链——取点（accuSnap 优先，z=0 投影）→ 草稿实体构造
 * （maxId+1 分配、首点锚定在前、矩形 8 点 4 线 + coincident×4 角点焊接——
 * SketchFlow fixture 拓扑）→ applyUpdate 乐观提交（全量覆写）→ 失败回滚+toast。
 * 橡皮筋走 Decorator（wantDynamics=false，FenceDecorator 先例）。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { FeatureOpResult, SketchConstraintDto, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import {
  SketchCircleTool,
  SketchCreateTool,
  SketchLineTool,
  SketchPreviewDecorator,
  SketchRectangleTool,
  runSketchCreateTool,
} from './SketchCreateTool.js';
import { IModelApp } from '@itwin/core-frontend';

// ---------------------------------------------------------------------------
// Mock @itwin/core-frontend（SelectSubEntityTool.test.ts 先例：假基类 + IModelApp）
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  exitTool: vi.fn(async () => undefined),
  initLocateElements: vi.fn(),
  addDecorator: vi.fn(),
  dropDecorator: vi.fn(),
  invalidateDecorationsAllViews: vi.fn(),
  outputPrompt: vi.fn(),
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => {
  class Tool {
    static toolId = '';
    static iconSpec = '';
    async run(): Promise<boolean> { return true; }
    async exitTool(): Promise<void> { await mocks.exitTool(); }
  }
  class PrimitiveTool extends Tool {
    async onPostInstall(): Promise<void> { /* noop */ }
    async onCleanup(): Promise<void> { /* noop */ }
    initLocateElements(...args: unknown[]): void { mocks.initLocateElements(...args); }
    requireWriteableTarget(): boolean { return true; }
  }
  return {
    Tool,
    PrimitiveTool,
    IModelApp: {
      accuSnap: { currHit: undefined as undefined | { hitPoint: { x: number; y: number; z: number } } },
      viewManager: {
        addDecorator: mocks.addDecorator,
        dropDecorator: mocks.dropDecorator,
        invalidateDecorationsAllViews: mocks.invalidateDecorationsAllViews,
      },
      notifications: {
        outputPrompt: mocks.outputPrompt,
        outputMessage: mocks.outputMessage,
      },
    },
    EventHandled: { Yes: 1, No: 0 },
    GraphicType: { WorldDecoration: 0, WorldOverlay: 1, ViewOverlay: 2 },
    BeButtonEvent: class {},
    DecorateContext: class {},
    Decorator: class {},
  };
});

// ---------------------------------------------------------------------------
// 测试设施
// ---------------------------------------------------------------------------

/** 既有草图：maxId=10（约束 id 亦计入——实体/约束共用递增计数器保证全局唯一） */
const baseSketch: SketchDto = {
  id: 'sk-1',
  entities: [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 10, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
  ],
  constraints: [{ kind: 'horizontal', id: 10, refs: [3] }],
  solve: { status: 'ok', dof: 2, failedConstraintIds: [], conflictingRank: [] },
};

function makeSketchSystem(overrides?: {
  activeSketch?: SketchDto;
  applyUpdate?: (entities: SketchEntityDto[], constraints: SketchConstraintDto[]) => Promise<FeatureOpResult>;
}): UseSketchSystem {
  return {
    sketches: [],
    activeSketch: overrides && 'activeSketch' in overrides ? overrides.activeSketch : baseSketch,
    loading: false,
    openSketch: vi.fn(async () => undefined),
    closeSketch: vi.fn(),
    applyUpdate: vi.fn(overrides?.applyUpdate ?? (async () => ({ ok: true }) as FeatureOpResult)),
    createSketch: vi.fn(async () => ({ ok: true }) as FeatureOpResult),
    refresh: vi.fn(async () => undefined),
  };
}

function makeEv(x: number, y: number, z = 0) {
  return {
    point: Point3d.create(x, y, z),
    viewport: { invalidateDecorations: vi.fn() },
  };
}

type MockEv = ReturnType<typeof makeEv>;

async function click(tool: SketchCreateTool, ev: MockEv): Promise<unknown> {
  return tool.onDataButtonDown(ev as any);
}

async function motion(tool: SketchCreateTool, ev: MockEv): Promise<void> {
  return tool.onMouseMotion(ev as any);
}

function makeDecorateContext() {
  const builder = {
    setSymbology: vi.fn(),
    addLineString: vi.fn(),
    addArc: vi.fn(),
    addShape: vi.fn(),
    finish: vi.fn(() => ({})),
  };
  const context = {
    createGraphicBuilder: vi.fn(() => builder),
    addDecoration: vi.fn(),
  };
  return { builder, context: context as any };
}

function getDecorator(): SketchPreviewDecorator {
  expect(mocks.addDecorator).toHaveBeenCalledTimes(1);
  return mocks.addDecorator.mock.calls[0][0] as SketchPreviewDecorator;
}

async function installTool<T extends SketchCreateTool>(tool: T, sketchSystem: UseSketchSystem, onToast?: ReturnType<typeof vi.fn>): Promise<T> {
  tool.setOptions({ sketchSystem, onToast });
  await tool.onPostInstall();
  return tool;
}

beforeEach(() => {
  vi.clearAllMocks();
  (IModelApp as unknown as { accuSnap: { currHit?: unknown } }).accuSnap.currHit = undefined;
});

// ---------------------------------------------------------------------------
// 静态契约
// ---------------------------------------------------------------------------
describe('SketchCreateTool 静态契约', () => {
  it('三子类 toolId / namespace', () => {
    expect(SketchLineTool.toolId).toBe('Sketch.CreateLine');
    expect(SketchRectangleTool.toolId).toBe('Sketch.CreateRectangle');
    expect(SketchCircleTool.toolId).toBe('Sketch.CreateCircle');
    expect(SketchLineTool.namespace).toBe('LubanCad');
    expect(SketchRectangleTool.namespace).toBe('LubanCad');
    expect(SketchCircleTool.namespace).toBe('LubanCad');
  });

  it('requireWriteableTarget=true（写工具；只读 iModel 拒装）', () => {
    const tool = new SketchLineTool();
    expect(tool.requireWriteableTarget()).toBe(true);
  });

  it('onPostInstall：注册 decorator + initLocateElements(false, true)（不 locate 元素但开启 AccuSnap）', async () => {
    const tool = await installTool(new SketchLineTool(), makeSketchSystem());
    expect(mocks.initLocateElements).toHaveBeenCalledWith(false, true);
    expect(mocks.addDecorator).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 线
// ---------------------------------------------------------------------------
describe('SketchLineTool', () => {
  it('两次点击 → applyUpdate 追加 2 point + 1 line（maxId+1 起、z=0 投影、首点在前）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchLineTool(), sketchSystem);

    await click(tool, makeEv(10, 20, 5)); // z 投影到 0
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    await click(tool, makeEv(30, 40, -3));

    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    const [entities, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    // 追加语义：既有实体原样在前
    expect(entities.slice(0, 3)).toEqual(baseSketch.entities);
    expect(constraints).toEqual(baseSketch.constraints);
    // 新实体：id 从 maxId(10)+1 起；首点（第一次点击）在前（后端锚定首点实体）
    expect(entities.slice(3)).toEqual([
      { kind: 'point', id: 11, x: 10, y: 20 },
      { kind: 'point', id: 12, x: 30, y: 40 },
      { kind: 'line', id: 13, p1: 11, p2: 12 },
    ]);
    // 成功提交后工具退出
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('accuSnap.currHit 优先于 ev.point（且同样投影 z=0）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchLineTool(), sketchSystem);

    (IModelApp as unknown as { accuSnap: { currHit?: unknown } }).accuSnap.currHit = { hitPoint: { x: 1, y: 2, z: 9 } };
    await click(tool, makeEv(10, 20, 5));
    (IModelApp as unknown as { accuSnap: { currHit?: unknown } }).accuSnap.currHit = { hitPoint: { x: 3, y: 4, z: -9 } };
    await click(tool, makeEv(30, 40, 5));

    const [entities] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[]];
    expect(entities.slice(3)).toEqual([
      { kind: 'point', id: 11, x: 1, y: 2 },
      { kind: 'point', id: 12, x: 3, y: 4 },
      { kind: 'line', id: 13, p1: 11, p2: 12 },
    ]);
    await tool.onCleanup();
  });

  it('两点重合（零长度）→ 不提交 + info 提示 + 锚点重置可重画', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchLineTool(), sketchSystem, onToast);

    await click(tool, makeEv(5, 5));
    await click(tool, makeEv(5, 5));
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');
    expect(mocks.exitTool).not.toHaveBeenCalled();

    // 锚点已重置：接着正常画一条线应提交
    await click(tool, makeEv(0, 0));
    await click(tool, makeEv(10, 10));
    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('提交失败（ok:false）→ 草稿回滚（id 复用）+ error toast + 工具保持存活', async () => {
    const onToast = vi.fn();
    const applyUpdate = vi.fn()
      .mockImplementationOnce(async () => ({ ok: false, error: '约束冲突: [10] dof=-1' }) as Promise<FeatureOpResult>)
      .mockImplementation(async () => ({ ok: true }) as Promise<FeatureOpResult>);
    const sketchSystem = makeSketchSystem({ applyUpdate });
    const tool = await installTool(new SketchLineTool(), sketchSystem, onToast);

    await click(tool, makeEv(0, 0));
    await click(tool, makeEv(10, 10));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('约束冲突: [10] dof=-1', 'error');
    expect(mocks.exitTool).not.toHaveBeenCalled(); // 失败不退出，用户可立即重画

    // 重画：回滚后 id 复用（11/12/13），不残留失败草稿
    await click(tool, makeEv(1, 1));
    await click(tool, makeEv(11, 11));
    expect(applyUpdate).toHaveBeenCalledTimes(2);
    const [entities] = applyUpdate.mock.calls[1] as [SketchEntityDto[]];
    expect(entities.slice(3)).toEqual([
      { kind: 'point', id: 11, x: 1, y: 1 },
      { kind: 'point', id: 12, x: 11, y: 11 },
      { kind: 'line', id: 13, p1: 11, p2: 12 },
    ]);
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('未打开草图（activeSketch=undefined）→ applyUpdate 仅含草稿实体；拒收则 toast+回滚', async () => {
    const onToast = vi.fn();
    const applyUpdate = vi.fn(async () => ({ ok: false, error: '未打开草图' }) as Promise<FeatureOpResult>);
    const sketchSystem = makeSketchSystem({ activeSketch: undefined, applyUpdate });
    const tool = await installTool(new SketchLineTool(), sketchSystem, onToast);

    await click(tool, makeEv(0, 0));
    await click(tool, makeEv(10, 10));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    const [entities, constraints] = applyUpdate.mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    // 无既有草图：id 从 1 起，仅草稿实体
    expect(entities).toEqual([
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 10, y: 10 },
      { kind: 'line', id: 3, p1: 1, p2: 2 },
    ]);
    expect(constraints).toEqual([]);
    expect(onToast).toHaveBeenCalledWith('未打开草图', 'error');
    expect(mocks.exitTool).not.toHaveBeenCalled();
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 矩形（SketchFlow fixture 拓扑：每线独立 2 端点 + 4 coincident 角点焊接）
// ---------------------------------------------------------------------------
describe('SketchRectangleTool', () => {
  it('对角两次点击 → 8 point + 4 line + 4 coincident（角点焊接引用正确）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchRectangleTool(), sketchSystem);

    await click(tool, makeEv(0, 0));
    await click(tool, makeEv(10, 5));

    const [entities, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    const added = entities.slice(3);
    // A(0,0) B(10,0) C(10,5) D(0,5)；L1=AB L2=BC L3=CD L4=DA，每线独立端点
    expect(added).toEqual([
      { kind: 'point', id: 11, x: 0, y: 0 },   // P1 = A（首点在前）
      { kind: 'point', id: 12, x: 10, y: 0 },  // P2 = B (L1)
      { kind: 'point', id: 13, x: 10, y: 0 },  // P3 = B (L2)
      { kind: 'point', id: 14, x: 10, y: 5 },  // P4 = C (L2)
      { kind: 'point', id: 15, x: 10, y: 5 },  // P5 = C (L3)
      { kind: 'point', id: 16, x: 0, y: 5 },   // P6 = D (L3)
      { kind: 'point', id: 17, x: 0, y: 5 },   // P7 = D (L4)
      { kind: 'point', id: 18, x: 0, y: 0 },   // P8 = A (L4)
      { kind: 'line', id: 19, p1: 11, p2: 12 },
      { kind: 'line', id: 20, p1: 13, p2: 14 },
      { kind: 'line', id: 21, p1: 15, p2: 16 },
      { kind: 'line', id: 22, p1: 17, p2: 18 },
    ]);
    expect(constraints).toEqual([
      ...baseSketch.constraints,
      { kind: 'coincident', id: 23, refs: [12, 13] },  // B 角焊接
      { kind: 'coincident', id: 24, refs: [14, 15] },  // C 角焊接
      { kind: 'coincident', id: 25, refs: [16, 17] },  // D 角焊接
      { kind: 'coincident', id: 26, refs: [18, 11] },  // A 角焊接
    ]);
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('反向对角（第二点在左下）仍按 c1 角起始生成同构拓扑', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchRectangleTool(), sketchSystem);

    await click(tool, makeEv(10, 5));
    await click(tool, makeEv(0, 0));

    const [entities] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[]];
    const added = entities.slice(3);
    expect(added[0]).toEqual({ kind: 'point', id: 11, x: 10, y: 5 }); // A=c1
    expect(added[3]).toEqual({ kind: 'point', id: 14, x: 0, y: 0 });  // C=c2
    expect(added).toHaveLength(12);
    await tool.onCleanup();
  });

  it('零宽/零高 → 不提交 + info 提示', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchRectangleTool(), sketchSystem, onToast);

    await click(tool, makeEv(5, 5));
    await click(tool, makeEv(5, 9)); // 零宽
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 圆
// ---------------------------------------------------------------------------
describe('SketchCircleTool', () => {
  it('圆心 + 半径点 → point + circle（radius=拖距）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchCircleTool(), sketchSystem);

    await click(tool, makeEv(2, 3));
    await click(tool, makeEv(5, 7)); // 距离 5

    const [entities, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(entities.slice(3)).toEqual([
      { kind: 'point', id: 11, x: 2, y: 3 },
      { kind: 'circle', id: 12, center: 11, radius: 5 },
    ]);
    expect(constraints).toEqual(baseSketch.constraints);
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('零半径 → 不提交 + info 提示', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchCircleTool(), sketchSystem, onToast);

    await click(tool, makeEv(5, 5));
    await click(tool, makeEv(5, 5));
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 橡皮筋预览（Decorator 生命周期 + motion 更新 + 按形状绘制）
// ---------------------------------------------------------------------------
describe('橡皮筋预览', () => {
  it('onCleanup 卸载 decorator（无泄漏）', async () => {
    const tool = await installTool(new SketchLineTool(), makeSketchSystem());
    const decorator = getDecorator();
    await tool.onCleanup();
    expect(mocks.dropDecorator).toHaveBeenCalledWith(decorator);
  });

  it('成功提交退出路径经 onCleanup 卸载 decorator', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchLineTool(), sketchSystem);
    const decorator = getDecorator();
    await click(tool, makeEv(0, 0));
    await click(tool, makeEv(1, 1));
    // 生产态 exitTool → toolAdmin 触发 onCleanup；测试手动对齐
    await tool.onCleanup();
    expect(mocks.dropDecorator).toHaveBeenCalledWith(decorator);
  });

  it('有锚点时 motion 更新预览 + invalidateDecorations（不重建场景）', async () => {
    const tool = await installTool(new SketchLineTool(), makeSketchSystem());
    const decorator = getDecorator();

    const clickEv = makeEv(0, 0);
    await click(tool, clickEv);
    const motionEv = makeEv(5, 5, 7);
    await motion(tool, motionEv);

    expect(motionEv.viewport.invalidateDecorations).toHaveBeenCalled();

    const { builder, context } = makeDecorateContext();
    decorator.decorate(context);
    expect(context.createGraphicBuilder).toHaveBeenCalled();
    expect(builder.addLineString).toHaveBeenCalledTimes(1);
    const pts = builder.addLineString.mock.calls[0][0] as Point3d[];
    expect(pts).toHaveLength(2);
    expect(pts[0].x).toBe(0); expect(pts[0].y).toBe(0); expect(pts[0].z).toBe(0);
    expect(pts[1].x).toBe(5); expect(pts[1].y).toBe(5); expect(pts[1].z).toBe(0);
    expect(builder.finish).toHaveBeenCalled();
    expect(context.addDecoration).toHaveBeenCalled();
    await tool.onCleanup();
  });

  it('无锚点时 motion 不更新预览（不 invalidate）', async () => {
    const tool = await installTool(new SketchLineTool(), makeSketchSystem());
    const motionEv = makeEv(5, 5);
    await motion(tool, motionEv);
    expect(motionEv.viewport.invalidateDecorations).not.toHaveBeenCalled();

    const decorator = getDecorator();
    const { builder, context } = makeDecorateContext();
    decorator.decorate(context);
    expect(builder.addLineString).not.toHaveBeenCalled();
    await tool.onCleanup();
  });

  it('矩形预览：锚点+motion → 闭合 4 边（5 点 lineString）', async () => {
    const tool = await installTool(new SketchRectangleTool(), makeSketchSystem());
    const decorator = getDecorator();

    await click(tool, makeEv(0, 0));
    await motion(tool, makeEv(10, 5));

    const { builder, context } = makeDecorateContext();
    decorator.decorate(context);
    const pts = builder.addLineString.mock.calls[0][0] as Point3d[];
    expect(pts.map((p) => [p.x, p.y])).toEqual([[0, 0], [10, 0], [10, 5], [0, 5], [0, 0]]);
    await tool.onCleanup();
  });

  it('圆预览：锚点+motion → addArc（半径=距离）', async () => {
    const tool = await installTool(new SketchCircleTool(), makeSketchSystem());
    const decorator = getDecorator();

    await click(tool, makeEv(1, 1));
    await motion(tool, makeEv(4, 5)); // 距离 5

    const { builder, context } = makeDecorateContext();
    decorator.decorate(context);
    expect(builder.addArc).toHaveBeenCalledTimes(1);
    const arc = builder.addArc.mock.calls[0][0] as { center: Point3d; circularRadius(): number | undefined };
    expect(arc.center.x).toBe(1);
    expect(arc.center.y).toBe(1);
    expect(arc.circularRadius()).toBe(5);
    await tool.onCleanup();
  });

  it('第二次点击后预览清除（提交后 decorate 不再绘制）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new SketchLineTool(), sketchSystem);
    const decorator = getDecorator();

    await click(tool, makeEv(0, 0));
    await motion(tool, makeEv(5, 5));
    await click(tool, makeEv(5, 5));

    const { builder, context } = makeDecorateContext();
    decorator.decorate(context);
    expect(builder.addLineString).not.toHaveBeenCalled();
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 右键取消 / 退出
// ---------------------------------------------------------------------------
describe('onResetButtonUp', () => {
  it('有锚点 → 取消进行中形状（清预览，不退出工具）', async () => {
    const tool = await installTool(new SketchLineTool(), makeSketchSystem());
    const decorator = getDecorator();

    await click(tool, makeEv(0, 0));
    const result = await tool.onResetButtonUp({} as any);
    expect(result).toBe(1); // EventHandled.Yes
    expect(mocks.exitTool).not.toHaveBeenCalled();
    expect(mocks.invalidateDecorationsAllViews).toHaveBeenCalled();

    // 预览已清
    const { builder, context } = makeDecorateContext();
    decorator.decorate(context);
    expect(builder.addLineString).not.toHaveBeenCalled();

    // 锚点已清：motion 不再更新
    const motionEv = makeEv(3, 3);
    await motion(tool, motionEv);
    expect(motionEv.viewport.invalidateDecorations).not.toHaveBeenCalled();
    await tool.onCleanup();
  });

  it('无锚点 → 退出工具', async () => {
    const tool = await installTool(new SketchLineTool(), makeSketchSystem());
    const result = await tool.onResetButtonUp({} as any);
    expect(result).toBe(1);
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 启动函数（SelectSubEntityTool run 助手同构）
// ---------------------------------------------------------------------------
describe('runSketchCreateTool', () => {
  it('按 kind 构造对应工具并注入选项后运行', async () => {
    const sketchSystem = makeSketchSystem();
    const onToast = vi.fn();
    await expect(runSketchCreateTool('line', { sketchSystem, onToast })).resolves.not.toThrow();
    await expect(runSketchCreateTool('rectangle', { sketchSystem, onToast })).resolves.not.toThrow();
    await expect(runSketchCreateTool('circle', { sketchSystem, onToast })).resolves.not.toThrow();
  });
});
