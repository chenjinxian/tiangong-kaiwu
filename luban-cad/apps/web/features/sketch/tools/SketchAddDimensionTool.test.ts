/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * SketchAddDimensionTool 单元测试（M3-b T5）：
 * 尺寸工具=值确认桥的一半——distance/radius 拾取满槽后**绝不直接提交**，
 * 而是经 sketchToolEvents.dimensionCandidate 把候选约束 {kind, refs, entityIds}
 * 发给面板（E-4 裁决；SolidModelingEvents 同构，面板订阅=Task 6），由面板收值
 * 后走 applyUpdate。槽位规则与 SolverTypes 冻结契约一致：
 * distance=2 point+value>0（值由面板收）；radius=1 circle+value>0。
 * 就近实体解析与槽位校验语义同 SketchAddConstraintTool.test.ts。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { FeatureOpResult, SketchConstraintDto, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import {
  DistanceAddTool,
  RadiusAddTool,
  SketchAddDimensionTool,
  runSketchAddDimensionTool,
  sketchToolEvents,
} from './SketchAddDimensionTool.js';
import { IModelApp } from '@itwin/core-frontend';

// ---------------------------------------------------------------------------
// Mock @itwin/core-frontend（SketchCreateTool.test.ts 先例）
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  exitTool: vi.fn(async () => undefined),
  initLocateElements: vi.fn(),
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
      locateManager: {
        currHit: undefined as undefined | {
          isElementHit: boolean;
          sourceId: string;
          hitPoint: { x: number; y: number; z: number };
        },
      },
      accuSnap: { currHit: undefined as undefined | { hitPoint: { x: number; y: number; z: number } } },
      notifications: {
        outputPrompt: mocks.outputPrompt,
        outputMessage: mocks.outputMessage,
      },
    },
    EventHandled: { Yes: 1, No: 0 },
    BeButtonEvent: class {},
  };
});

// ---------------------------------------------------------------------------
// 测试设施（与 SketchAddConstraintTool.test.ts 同构 fixture）
// ---------------------------------------------------------------------------
const baseSketch: SketchDto = {
  id: 'sk-1',
  entities: [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 10, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
    { kind: 'point', id: 4, x: 0, y: 5 },
    { kind: 'point', id: 7, x: 20, y: 0 },
    { kind: 'circle', id: 8, center: 7, radius: 3 },
  ],
  constraints: [{ kind: 'horizontal', id: 20, refs: [3] }],
  solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
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

type MockEv = { point: Point3d; viewport: { invalidateDecorations: ReturnType<typeof vi.fn> } };

function makeEv(): MockEv {
  return { point: Point3d.create(0, 0, 0), viewport: { invalidateDecorations: vi.fn() } };
}

function setHit(x: number, y: number, z = 0): void {
  (IModelApp as unknown as { locateManager: { currHit?: unknown } }).locateManager.currHit = {
    isElementHit: true,
    sourceId: '0xsketch-element',
    hitPoint: { x, y, z },
  };
}

async function click(tool: SketchAddDimensionTool): Promise<unknown> {
  return tool.onDataButtonDown(makeEv() as any);
}

async function installTool<T extends SketchAddDimensionTool>(
  tool: T,
  sketchSystem: UseSketchSystem,
  onToast?: ReturnType<typeof vi.fn>,
): Promise<T> {
  tool.setOptions({ sketchSystem, onToast });
  await tool.onPostInstall();
  return tool;
}

let emitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  (IModelApp as unknown as { locateManager: { currHit?: unknown } }).locateManager.currHit = undefined;
  (IModelApp as unknown as { accuSnap: { currHit?: unknown } }).accuSnap.currHit = undefined;
  emitSpy = vi.spyOn(sketchToolEvents, 'emit');
});

afterEach(() => {
  emitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// 静态契约
// ---------------------------------------------------------------------------
describe('SketchAddDimensionTool 静态契约', () => {
  it('toolId / namespace（Sketch.AddDimension.<kind> / LubanCad）', () => {
    expect(DistanceAddTool.toolId).toBe('Sketch.AddDimension.Distance');
    expect(RadiusAddTool.toolId).toBe('Sketch.AddDimension.Radius');
    expect(DistanceAddTool.namespace).toBe('LubanCad');
    expect(RadiusAddTool.namespace).toBe('LubanCad');
  });

  it('onPostInstall：initLocateElements(true, true)', async () => {
    const tool = await installTool(new DistanceAddTool(), makeSketchSystem());
    expect(mocks.initLocateElements).toHaveBeenCalledWith(true, true);
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 值确认桥：distance/radius 满槽 → 事件（绝不直接 applyUpdate）
// ---------------------------------------------------------------------------
describe('dimensionCandidate 值确认桥', () => {
  it('distance：拾取 2 point → 发 dimensionCandidate（kind/refs/entityIds）+ 不提交 + 退出', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new DistanceAddTool(), sketchSystem);

    setHit(0, 0); // point#1
    await click(tool);
    expect(emitSpy).not.toHaveBeenCalled(); // 未满槽不发
    setHit(0, 5); // point#4
    await click(tool);

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('dimensionCandidate', {
      kind: 'distance',
      refs: [1, 4],
      entityIds: [1, 4],
    });
    // 关键裁决：工具侧绝不直接提交——applyUpdate 零调用
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(mocks.exitTool).toHaveBeenCalledTimes(1); // 候选移交面板后工具退出
    await tool.onCleanup();
  });

  it('radius：拾取 1 circle → 发 dimensionCandidate + 不提交', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new RadiusAddTool(), sketchSystem);

    setHit(20, 3); // C1 圆周顶点 → circle#8
    await click(tool);

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('dimensionCandidate', {
      kind: 'radius',
      refs: [8],
      entityIds: [8],
    });
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('命中点投影 z=0 后参与就近解析（三维命中点不影响实体分辨）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new RadiusAddTool(), sketchSystem);

    setHit(20, 3, 42); // 命中点带 z——投影后仍在圆周顶点
    await click(tool);
    expect(emitSpy).toHaveBeenCalledWith('dimensionCandidate', expect.objectContaining({ refs: [8] }));
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 槽位校验（与约束工具同语义）
// ---------------------------------------------------------------------------
describe('槽位校验', () => {
  it('distance 拾到 line → info toast + 不发事件 + 继续拾取', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new DistanceAddTool(), sketchSystem, onToast);

    setHit(5, 0.4); // L1 中部 → line，distance 槽位拒收
    await click(tool);
    expect(emitSpy).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');

    setHit(0, 0);
    await click(tool);
    setHit(0, 5);
    await click(tool);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('dimensionCandidate', expect.objectContaining({ kind: 'distance', refs: [1, 4] }));
    await tool.onCleanup();
  });

  it('radius 拾到 point（如圆心/端点）→ info toast + 不发事件', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new RadiusAddTool(), sketchSystem, onToast);

    setHit(20, 0); // C1 圆心 point#7（恰在圆心：到圆心点距 0 < 到圆周 3）
    await click(tool);
    expect(emitSpy).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');

    setHit(20, 3); // 圆周 → circle#8
    await click(tool);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('重复拾取同一实体 → info toast + 不发事件', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new DistanceAddTool(), sketchSystem, onToast);

    setHit(0, 0);
    await click(tool);
    setHit(0.05, 0.05); // 仍 point#1
    await click(tool);
    expect(emitSpy).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');

    setHit(0, 5);
    await click(tool);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('无 locate 命中 → EventHandled.No，不发事件', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new DistanceAddTool(), sketchSystem);
    const result = await click(tool);
    expect(result).toBe(0);
    expect(emitSpy).not.toHaveBeenCalled();
    await tool.onCleanup();
  });

  it('未打开草图 → error toast + 不发事件', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem({ activeSketch: undefined });
    const tool = await installTool(new DistanceAddTool(), sketchSystem, onToast);
    setHit(0, 0);
    await click(tool);
    expect(emitSpy).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'error');
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 右键取消 / 退出
// ---------------------------------------------------------------------------
describe('onResetButtonUp', () => {
  it('有拾取 → 清空不退出；无拾取 → 退出', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new DistanceAddTool(), sketchSystem);

    setHit(0, 0);
    await click(tool);
    let result = await tool.onResetButtonUp({} as any);
    expect(result).toBe(1);
    expect(mocks.exitTool).not.toHaveBeenCalled();

    // 拾取已清空：再点一点不会发事件
    setHit(0, 5);
    await click(tool);
    expect(emitSpy).not.toHaveBeenCalled();

    // 该点击又累积了一个拾取 → 右键清空而非退出
    result = await tool.onResetButtonUp({} as any);
    expect(result).toBe(1);
    expect(mocks.exitTool).not.toHaveBeenCalled();

    // 拾取序列已空 → 右键退出
    result = await tool.onResetButtonUp({} as any);
    expect(result).toBe(1);
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 启动函数
// ---------------------------------------------------------------------------
describe('runSketchAddDimensionTool', () => {
  it('按 kind 构造对应工具并注入选项后运行', async () => {
    const sketchSystem = makeSketchSystem();
    const onToast = vi.fn();
    await expect(runSketchAddDimensionTool('distance', { sketchSystem, onToast })).resolves.not.toThrow();
    await expect(runSketchAddDimensionTool('radius', { sketchSystem, onToast })).resolves.not.toThrow();
  });
});
