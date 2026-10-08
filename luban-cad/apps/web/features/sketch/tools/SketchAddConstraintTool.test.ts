/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * SketchAddConstraintTool 单元测试（M3-b T5）：
 * 槽位驱动拾取——locate 命中草图元素后按 hitPoint 就近解析实体（point=点距、
 * line=点到线段距、circle=到圆周距；并列时点实体优先——线端点附近的 point
 * 实体获胜），槽位错误 → info toast 不提交；累积满槽 → 构造约束
 * （id=maxId+1，Task 4 同式）→ applyUpdate 追加提交；ok:false → 拒收文本
 * toast + 拾取清空工具存活；右键取消/退出。
 *
 * 槽位规则与后端 SolverTypes.ts 冻结契约逐字对应：
 * coincident=2 point；horizontal/vertical=1 line 或 2 point；
 * parallel/perpendicular=2 line；equal=2 line 或 2 circle（不得混搭）。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { FeatureOpResult, SketchConstraintDto, SketchDto, SketchEntityDto } from '@luban-cad/shared';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import {
  CoincidentAddTool,
  EqualAddTool,
  HorizontalAddTool,
  ParallelAddTool,
  PerpendicularAddTool,
  SketchAddConstraintTool,
  VerticalAddTool,
  runSketchAddConstraintTool,
} from './SketchAddConstraintTool.js';
import { IModelApp } from '@itwin/core-frontend';

// ---------------------------------------------------------------------------
// Mock @itwin/core-frontend（SketchCreateTool.test.ts 先例：假基类 + IModelApp）
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
      // 约束工具要 locate 草图元素（整元素命中）——currHit 由测试直接钉
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
// 测试设施
// ---------------------------------------------------------------------------

/**
 * 既有草图（坐标均为现场解算值）：
 * L1=(0,0)-(10,0) #3；L2=(0,5)-(10,5) #6；C1 圆心#7(20,0) r=3 #8；C2 圆心#9(30,0) r=3 #10。
 * 全局 maxId=20（约束 id）→ 下一条约束 id=21。
 */
const baseSketch: SketchDto = {
  id: 'sk-1',
  entities: [
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

/** 钉 locate 命中点（z 任意——工具内投影 z=0）；清除传 undefined */
function setHit(x: number, y: number, z = 0): void {
  (IModelApp as unknown as { locateManager: { currHit?: unknown } }).locateManager.currHit = {
    isElementHit: true,
    sourceId: '0xsketch-element',
    hitPoint: { x, y, z },
  };
}

async function click(tool: SketchAddConstraintTool): Promise<unknown> {
  return tool.onDataButtonDown(makeEv() as any);
}

async function installTool<T extends SketchAddConstraintTool>(
  tool: T,
  sketchSystem: UseSketchSystem,
  onToast?: ReturnType<typeof vi.fn>,
): Promise<T> {
  tool.setOptions({ sketchSystem, onToast });
  await tool.onPostInstall();
  return tool;
}

beforeEach(() => {
  vi.clearAllMocks();
  (IModelApp as unknown as { locateManager: { currHit?: unknown } }).locateManager.currHit = undefined;
  (IModelApp as unknown as { accuSnap: { currHit?: unknown } }).accuSnap.currHit = undefined;
});

// ---------------------------------------------------------------------------
// 静态契约
// ---------------------------------------------------------------------------
describe('SketchAddConstraintTool 静态契约', () => {
  it('六子类 toolId / namespace（Sketch.AddConstraint.<kind> / LubanCad）', () => {
    expect(CoincidentAddTool.toolId).toBe('Sketch.AddConstraint.Coincident');
    expect(HorizontalAddTool.toolId).toBe('Sketch.AddConstraint.Horizontal');
    expect(VerticalAddTool.toolId).toBe('Sketch.AddConstraint.Vertical');
    expect(ParallelAddTool.toolId).toBe('Sketch.AddConstraint.Parallel');
    expect(PerpendicularAddTool.toolId).toBe('Sketch.AddConstraint.Perpendicular');
    expect(EqualAddTool.toolId).toBe('Sketch.AddConstraint.Equal');
    for (const cls of [CoincidentAddTool, HorizontalAddTool, VerticalAddTool, ParallelAddTool, PerpendicularAddTool, EqualAddTool]) {
      expect(cls.namespace).toBe('LubanCad');
    }
  });

  it('requireWriteableTarget=true', () => {
    expect(new CoincidentAddTool().requireWriteableTarget()).toBe(true);
  });

  it('onPostInstall：initLocateElements(true, true)（locate 草图元素 + AccuSnap）', async () => {
    const tool = await installTool(new CoincidentAddTool(), makeSketchSystem());
    expect(mocks.initLocateElements).toHaveBeenCalledWith(true, true);
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 就近实体解析（v1 简化：hitPoint 与实体几何距离；并列时点实体优先）
// ---------------------------------------------------------------------------
describe('就近实体解析', () => {
  it('命中点在线段中部 → 解析为 line（点线并列时线段垂距更小）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new ParallelAddTool(), sketchSystem);
    setHit(5, 0.4); // L1 中部上方
    await click(tool);
    setHit(5, 5.4); // L2 中部上方
    await click(tool);
    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'parallel', id: 21, refs: [3, 6] });
    await tool.onCleanup();
  });

  it('命中点恰在线端点 → point 实体获胜（点/线段端点距离并列，kind 优先序点>线）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem);
    setHit(0, 0); // L1 端点 = point#1 精确位置
    await click(tool);
    setHit(10, 0); // L1 另一端点 = point#2（与线段端点并列 → point 获胜）
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'coincident', id: 21, refs: [1, 2] });
    await tool.onCleanup();
  });

  it('端点外延区域（超出线段投影）→ point 实体与线段端点并列 → point 获胜', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem);
    setHit(-0.2, 0.1); // L1 起点外侧：线段最近点即端点，距离与 point#1 精确并列
    await click(tool);
    setHit(10.2, -0.1); // L1 终点外侧
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1].refs).toEqual([1, 2]);
    await tool.onCleanup();
  });

  it('命中点在圆周上 → 解析为 circle（圆心 point 距离=r 更大）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new EqualAddTool(), sketchSystem);
    setHit(20, 3); // C1 圆周顶点
    await click(tool);
    setHit(30, 3); // C2 圆周顶点
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'equal', id: 21, refs: [8, 10] });
    await tool.onCleanup();
  });

  it('无 locate 命中 → EventHandled.No，不提交', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem);
    const result = await click(tool);
    expect(result).toBe(0); // EventHandled.No
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 槽位规则（与 SolverTypes 冻结契约逐字对应）
// ---------------------------------------------------------------------------
describe('槽位驱动提交', () => {
  it('coincident：拾取 2 point → 追加 {kind, id:maxId+1, refs} 并退出', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem);

    setHit(0, 0);
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled(); // 未满槽不提交
    setHit(0, 5);
    await click(tool);

    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    const [entities, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(entities).toEqual(baseSketch.entities); // 实体原样
    expect(constraints.slice(0, -1)).toEqual(baseSketch.constraints);
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'coincident', id: 21, refs: [1, 4] });
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('horizontal：1 line 即满槽提交（单槽路径）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new HorizontalAddTool(), sketchSystem);
    setHit(5, 0.4); // L1 中部
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'horizontal', id: 21, refs: [3] });
    await tool.onCleanup();
  });

  it('horizontal：2 point 亦满槽提交（点对式，两种入口都合法）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new HorizontalAddTool(), sketchSystem);
    setHit(0, 0);
    await click(tool);
    setHit(0, 5);
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'horizontal', id: 21, refs: [1, 4] });
    await tool.onCleanup();
  });

  it('vertical：1 line 满槽', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new VerticalAddTool(), sketchSystem);
    setHit(5, 0.4);
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'vertical', id: 21, refs: [3] });
    await tool.onCleanup();
  });

  it('perpendicular：2 line 满槽', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new PerpendicularAddTool(), sketchSystem);
    setHit(5, 0.4);
    await click(tool);
    setHit(5, 5.4);
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'perpendicular', id: 21, refs: [3, 6] });
    await tool.onCleanup();
  });

  it('equal：2 line 满槽（等长）', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new EqualAddTool(), sketchSystem);
    setHit(5, 0.4);
    await click(tool);
    setHit(5, 5.4);
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'equal', id: 21, refs: [3, 6] });
    await tool.onCleanup();
  });

  it('约束 id=maxId+1 取实体与约束全局最大（Task 4 同式；实体 id 更高时同样生效）', async () => {
    const sketch: SketchDto = {
      ...baseSketch,
      entities: [...baseSketch.entities, { kind: 'point', id: 40, x: 50, y: 50 }],
    };
    const sketchSystem = makeSketchSystem({ activeSketch: sketch });
    const tool = await installTool(new HorizontalAddTool(), sketchSystem);
    setHit(5, 0.4);
    await click(tool);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1].id).toBe(41); // max(实体 40, 约束 20)+1
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 槽位校验：错误类型 → info toast 不提交，继续拾取
// ---------------------------------------------------------------------------
describe('槽位校验', () => {
  it('coincident 拾到 line → info toast + 不提交 + 继续拾取可完成', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem, onToast);

    setHit(5, 0.4); // L1 中部 → line，coincident 槽位拒收
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');

    setHit(0, 0);
    await click(tool);
    setHit(0, 5);
    await click(tool);
    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1].refs).toEqual([1, 4]);
    await tool.onCleanup();
  });

  it('parallel 拾到 point（端点）→ info toast + 不提交', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new ParallelAddTool(), sketchSystem, onToast);

    setHit(0, 0); // point#1
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');

    setHit(5, 0.4); // L1
    await click(tool);
    setHit(5, 5.4); // L2
    await click(tool);
    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('equal 混搭（line 后 circle）→ info toast + 不提交；改拾 2 line 完成', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new EqualAddTool(), sketchSystem, onToast);

    setHit(5, 0.4); // line#3
    await click(tool);
    setHit(20, 3); // circle#8 —— 与 line 混搭，拒收
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('混搭'), 'info');

    setHit(5, 5.4); // line#6
    await click(tool);
    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    const [, constraints] = (sketchSystem.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1].refs).toEqual([3, 6]);
    await tool.onCleanup();
  });

  it('重复拾取同一实体 → info toast + 不提交', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem, onToast);

    setHit(0, 0);
    await click(tool);
    setHit(0.05, 0.05); // 仍解析为 point#1（最近）
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');

    setHit(0, 5);
    await click(tool);
    expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('horizontal 点对式第二槽拾到 line → info toast + 不提交', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new HorizontalAddTool(), sketchSystem, onToast);

    setHit(0, 0); // point#1 → 点对式继续
    await click(tool);
    setHit(5, 0.4); // line —— 点对式第二槽只收 point，拒收
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'info');
    await tool.onCleanup();
  });
});

// ---------------------------------------------------------------------------
// 提交结果 / 右键取消
// ---------------------------------------------------------------------------
describe('提交与取消', () => {
  it('ok:false → 拒收文本 error toast + 不退出 + 拾取清空可立即重选', async () => {
    const onToast = vi.fn();
    const applyUpdate = vi.fn()
      .mockImplementationOnce(async () => ({ ok: false, error: '约束冲突: [20] dof=-1' }) as Promise<FeatureOpResult>)
      .mockImplementation(async () => ({ ok: true }) as Promise<FeatureOpResult>);
    const sketchSystem = makeSketchSystem({ applyUpdate });
    const tool = await installTool(new CoincidentAddTool(), sketchSystem, onToast);

    setHit(0, 0);
    await click(tool);
    setHit(0, 5);
    await click(tool);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('约束冲突: [20] dof=-1', 'error');
    expect(mocks.exitTool).not.toHaveBeenCalled(); // 工具保持存活

    // 拾取已清空：重选两点再次提交（id 复用 21）
    setHit(10, 0);
    await click(tool);
    setHit(10, 5);
    await click(tool);
    expect(applyUpdate).toHaveBeenCalledTimes(2);
    const [, constraints] = applyUpdate.mock.calls[1] as [SketchEntityDto[], SketchConstraintDto[]];
    expect(constraints[constraints.length - 1]).toEqual({ kind: 'coincident', id: 21, refs: [2, 5] });
    expect(mocks.exitTool).toHaveBeenCalledTimes(1);
    await tool.onCleanup();
  });

  it('未打开草图 → error toast + 不提交', async () => {
    const onToast = vi.fn();
    const sketchSystem = makeSketchSystem({ activeSketch: undefined });
    const tool = await installTool(new CoincidentAddTool(), sketchSystem, onToast);
    setHit(0, 0);
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.any(String), 'error');
    await tool.onCleanup();
  });

  it('右键：有拾取 → 清空拾取不退出；无拾取 → 退出', async () => {
    const sketchSystem = makeSketchSystem();
    const tool = await installTool(new CoincidentAddTool(), sketchSystem);

    setHit(0, 0);
    await click(tool);
    let result = await tool.onResetButtonUp({} as any);
    expect(result).toBe(1); // EventHandled.Yes
    expect(mocks.exitTool).not.toHaveBeenCalled();

    // 拾取已清空：再点一点不会直接提交
    setHit(0, 5);
    await click(tool);
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();

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
describe('runSketchAddConstraintTool', () => {
  it('按 kind 构造对应工具并注入选项后运行', async () => {
    const sketchSystem = makeSketchSystem();
    const onToast = vi.fn();
    for (const kind of ['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'equal'] as const) {
      await expect(runSketchAddConstraintTool(kind, { sketchSystem, onToast })).resolves.not.toThrow();
    }
  });
});
