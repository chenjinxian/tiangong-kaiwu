/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * M6-b T5：草图尺寸工具单测——槽位形状表（distance=2 point / radius=
 * 1 circle）+ 槽位接收判定 + 事件桥发收往返。
 *
 * 「尺寸不直接提交铁律」（M3-b 裁决 E-4）的结构面在此钉死：工具模块不导出
 * 任何提交通道，满槽只经 sketchToolEvents 发候选（SketchValuePopup.test 验收
 * 面板收值→提交的另一半；工具交互态归真实栈冒烟，诚实登记不覆盖）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchEntityDto } from '@luban-cad/shared';
import { EventHandled, IModelApp } from '@itwin/core-frontend';
import type { BeButtonEvent } from '@itwin/core-frontend';

// 工具交互态夹具（E1 实测值）：取点/平面架/草图系统全部打桩，工具只保留
// 槽位判定 + 候选事件；几何分辨走真实 resolveNearestPick（纯函数）。
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

import {
  acceptDimensionPick,
  DIMENSION_SLOTS,
  DistanceAddTool,
  LengthAddTool,
  RadiusAddTool,
  registerSketchDimensionTools,
} from '../tools/sketch/SketchAddDimensionTool.js';
import { measureSketchDimension, SketchDimensionTool } from '../tools/sketch/SketchDimensionTool.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';
import type { SketchDimensionCandidate } from '../tools/sketch/sketch-tool-events.js';

describe('M6-b T5：DIMENSION_SLOTS 槽位形状表（SolverTypes 冻结契约）', () => {
  it('distance=2 point/line；radius=1 circle/arc；length=1 line', () => {
    expect(DIMENSION_SLOTS.distance).toEqual({ kinds: ['point', 'line'], count: 2 });
    expect(DIMENSION_SLOTS.radius).toEqual({ kinds: ['circle', 'arc'], count: 1 });
    expect(DIMENSION_SLOTS.length).toEqual({ kinds: ['line'], count: 1 });
  });
});

describe('M6-b T5：acceptDimensionPick 槽位接收判定', () => {
  it('distance：point/line 混合两拾取满槽；圆/弧拒收', () => {
    expect(acceptDimensionPick('distance', 0, 'point')).toEqual({ ok: true, complete: false });
    expect(acceptDimensionPick('distance', 1, 'point')).toEqual({ ok: true, complete: true });
    expect(acceptDimensionPick('distance', 0, 'line')).toEqual({ ok: true, complete: false });
    expect(acceptDimensionPick('distance', 1, 'line')).toEqual({ ok: true, complete: true });
    expect(acceptDimensionPick('distance', 0, 'circle').ok).toBe(false);
    expect(acceptDimensionPick('distance', 0, 'arc').ok).toBe(false);
  });

  it('radius：单圆即满槽；点/线拒收', () => {
    expect(acceptDimensionPick('radius', 0, 'circle')).toEqual({ ok: true, complete: true });
    expect(acceptDimensionPick('radius', 0, 'point').ok).toBe(false);
    expect(acceptDimensionPick('radius', 0, 'line').ok).toBe(false);
  });
});

describe('M6-b T5：sketchToolEvents 事件桥（工具→面板值确认桥）', () => {
  const candidate: SketchDimensionCandidate = {
    kind: 'distance',
    refs: [1, 2],
    entityIds: [1, 2],
  };

  it('length：单线满槽；点/圆拒收', () => {
    expect(acceptDimensionPick('length', 0, 'line')).toEqual({ ok: true, complete: true });
    expect(acceptDimensionPick('length', 0, 'point').ok).toBe(false);
    expect(acceptDimensionPick('length', 0, 'circle').ok).toBe(false);
  });

  it('发收往返：emit 载荷原样达订阅者', () => {
    const received: SketchDimensionCandidate[] = [];
    const unsubscribe = sketchToolEvents.on('dimensionCandidate', (c) => received.push(c));
    sketchToolEvents.emit('dimensionCandidate', candidate);
    unsubscribe();
    expect(received).toEqual([candidate]);
  });

  it('退订（on 返回的函数 / off）后不再收', () => {
    const fn = vi.fn();
    const unsubscribe = sketchToolEvents.on('dimensionCandidate', fn);
    unsubscribe();
    sketchToolEvents.emit('dimensionCandidate', candidate);
    expect(fn).not.toHaveBeenCalled();

    const fn2 = vi.fn();
    sketchToolEvents.on('dimensionCandidate', fn2);
    sketchToolEvents.off('dimensionCandidate', fn2);
    sketchToolEvents.emit('dimensionCandidate', candidate);
    expect(fn2).not.toHaveBeenCalled();
  });

  it('多订阅者广播；radius 候选同通道', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = sketchToolEvents.on('dimensionCandidate', a);
    const offB = sketchToolEvents.on('dimensionCandidate', b);
    const radiusCandidate: SketchDimensionCandidate = { kind: 'radius', refs: [8], entityIds: [8] };
    sketchToolEvents.emit('dimensionCandidate', radiusCandidate);
    expect(a).toHaveBeenCalledWith(radiusCandidate);
    expect(b).toHaveBeenCalledWith(radiusCandidate);
    offA();
    offB();
  });
});

describe('M6-b T5：尺寸 2 工具 toolId 与注册接线', () => {
  it('toolId 与 ribbon 注册表一一对应（Sketch.Dimension.*）', () => {
    expect(DistanceAddTool.toolId).toBe('Sketch.Dimension.Distance');
    expect(RadiusAddTool.toolId).toBe('Sketch.Dimension.Radius');
  });

  it('registerSketchDimensionTools 幂等：注册即 return（二次调用 no-op 由模块 flag 保证）', () => {
    expect(typeof registerSketchDimensionTools).toBe('function');
    registerSketchDimensionTools();
    registerSketchDimensionTools(); // 幂等不抛
  });
});

// ── E1（2026-11-15 Onshape live）：尺寸候选实测值 ────────────────────────────
// 弹层预填值由已解算草图实体计算；解算坐标缺失/形态不可测 → undefined。

const ENTITIES: Record<string, SketchEntityDto> = {
  line345: { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 3, y: 4 } },
  pointA: { kind: 'point', id: 10, x: 1, y: 0 },
  pointB: { kind: 'point', id: 11, x: 4, y: 4 },
  // 点 (20,10) 到 x 轴的垂足在段外（无限长直线语义仍为 10）。
  axisLine: { kind: 'line', id: 12, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
  farPoint: { kind: 'point', id: 13, x: 20, y: 10 },
  circleR7: { kind: 'circle', id: 20, center: { x: 0, y: 0 }, radius: 7 },
  arcR25: { kind: 'arc', id: 21, center: { x: 0, y: 0 }, radius: 2.5, startAngle: 0, sweepAngle: Math.PI },
  parallelLine: { kind: 'line', id: 40, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
  parallelLine5: { kind: 'line', id: 41, p1: { x: 0, y: 5 }, p2: { x: 10, y: 5 } },
  verticalLine: { kind: 'line', id: 42, p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } },
  diagonalLine: { kind: 'line', id: 43, p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 } },
  unresolvedLine: { kind: 'line', id: 50, p1: 999, p2: { x: 1, y: 0 } },
  radiuslessCircle: { kind: 'circle', id: 51, center: { x: 0, y: 0 } },
};

function entities(...keys: (keyof typeof ENTITIES)[]): SketchEntityDto[] {
  return keys.map((key) => ENTITIES[key]!);
}

describe('E1：measureSketchDimension 实测值（纯几何）', () => {
  it('单线 → 长度（mm）', () => {
    expect(measureSketchDimension('length', [1], entities('line345'))).toBeCloseTo(5, 10);
  });

  it('点-点 → 距离；点-线 → 无限长直线垂距', () => {
    expect(measureSketchDimension('distance', [10, 11], entities('pointA', 'pointB'))).toBeCloseTo(5, 10);
    expect(measureSketchDimension('distance', [13, 12], entities('farPoint', 'axisLine'))).toBeCloseTo(10, 10);
    expect(measureSketchDimension('distance', [12, 13], entities('farPoint', 'axisLine'))).toBeCloseTo(10, 10);
  });

  it('圆/弧 → 半径；直径=2×半径', () => {
    expect(measureSketchDimension('radius', [20], entities('circleR7'))).toBe(7);
    expect(measureSketchDimension('diameter', [20], entities('circleR7'))).toBe(14);
    expect(measureSketchDimension('radius', [21], entities('arcR25'))).toBe(2.5);
    expect(measureSketchDimension('diameter', [21], entities('arcR25'))).toBe(5);
  });

  it('平行线 → 垂距；非平行线 distance 不猜（undefined）', () => {
    expect(measureSketchDimension('distance', [40, 41], entities('parallelLine', 'parallelLine5'))).toBeCloseTo(5, 10);
    expect(measureSketchDimension('distance', [40, 42], entities('parallelLine', 'verticalLine'))).toBeUndefined();
  });

  it('两线 → 夹角（度，0–90 锐角口径；angle 为预留测量通道）', () => {
    expect(measureSketchDimension('angle', [40, 42], entities('parallelLine', 'verticalLine'))).toBeCloseTo(90, 10);
    expect(measureSketchDimension('angle', [40, 43], entities('parallelLine', 'diagonalLine'))).toBeCloseTo(45, 10);
    expect(measureSketchDimension('angle', [40], entities('parallelLine'))).toBeUndefined();
  });

  it('引用未解算/退化 → undefined（不伪造值）', () => {
    expect(measureSketchDimension('length', [50], entities('unresolvedLine'))).toBeUndefined();
    expect(measureSketchDimension('radius', [51], entities('radiuslessCircle'))).toBeUndefined();
    expect(measureSketchDimension('length', [999], entities('line345'))).toBeUndefined();
    expect(measureSketchDimension('distance', [10, 999], entities('pointA'))).toBeUndefined();
  });
});

/** 工具交互夹具：点击 → 候选事件收集。 */
function buttonEvent(x: number, y: number): BeButtonEvent {
  return { viewPoint: { x, y }, point: { x, y } } as unknown as BeButtonEvent;
}

describe('E1：尺寸工具候选事件携带 measuredValue', () => {
  const listeners: (() => void)[] = [];

  afterEach(() => {
    while (listeners.length > 0) listeners.pop()!();
    // 候选发出后工具进入「等待值弹层关闭」态：用例结束补发关闭事件，
    // 退订各工具实例的 dimensionPopupClosed 监听（防跨用例陈旧监听）。
    sketchToolEvents.emit('dimensionPopupClosed');
    mockState.entities = [];
  });

  function capture(): SketchDimensionCandidate[] {
    const received: SketchDimensionCandidate[] = [];
    listeners.push(sketchToolEvents.on('dimensionCandidate', (candidate) => received.push(candidate)));
    return received;
  }

  async function click(tool: SketchDimensionTool | LengthAddTool | RadiusAddTool | DistanceAddTool, u: number, v: number): Promise<void> {
    mockState.hit = { u, v };
    await tool.onDataButtonDown(buttonEvent(u, v));
  }

  it('单尺寸工具：线长 / 点-点距离 / 圆直径 / 弧半径', async () => {
    // 单线 + 空白放置 → length 5
    mockState.entities = entities('line345');
    const lineTool = new SketchDimensionTool();
    await lineTool.onPostInstall();
    const lineCandidates = capture();
    await click(lineTool, 1.5, 2); // 拾线
    await click(lineTool, 100, 100); // 空白放置
    expect(lineCandidates).toHaveLength(1);
    expect(lineCandidates[0]).toMatchObject({ kind: 'length', measuredValue: 5 });

    // 两点 → distance 5
    mockState.entities = entities('pointA', 'pointB');
    const pointTool = new SketchDimensionTool();
    await pointTool.onPostInstall();
    const pointCandidates = capture();
    await click(pointTool, 1, 0);
    await click(pointTool, 4, 4);
    expect(pointCandidates).toHaveLength(1);
    expect(pointCandidates[0]).toMatchObject({ kind: 'distance', measuredValue: 5 });

    // 圆 + 空白放置 → diameter 2×r
    mockState.entities = [{ kind: 'circle', id: 20, center: { x: 0, y: 0 }, radius: 2 }];
    const circleTool = new SketchDimensionTool();
    await circleTool.onPostInstall();
    const circleCandidates = capture();
    await click(circleTool, 0, 2);
    await click(circleTool, 100, 100);
    expect(circleCandidates[0]).toMatchObject({ kind: 'diameter', measuredValue: 4 });

    // 弧 + 空白放置 → radius
    mockState.entities = [ENTITIES.arcR25!];
    const arcTool = new SketchDimensionTool();
    await arcTool.onPostInstall();
    const arcCandidates = capture();
    await click(arcTool, 0, 2.5);
    await click(arcTool, 100, 100);
    expect(arcCandidates[0]).toMatchObject({ kind: 'radius', measuredValue: 2.5 });
  });

  it('旧槽位工具：length/radius 预填；distance 槽形混合不预填', async () => {
    mockState.entities = entities('line345');
    const lengthTool = new LengthAddTool();
    await lengthTool.onPostInstall();
    const lengthCandidates = capture();
    await click(lengthTool, 1.5, 2);
    expect(lengthCandidates[0]).toMatchObject({ kind: 'length', measuredValue: 5 });

    mockState.entities = [ENTITIES.arcR25!];
    const radiusTool = new RadiusAddTool();
    await radiusTool.onPostInstall();
    const radiusCandidates = capture();
    await click(radiusTool, 0, 2.5);
    expect(radiusCandidates[0]).toMatchObject({ kind: 'radius', measuredValue: 2.5 });

    mockState.entities = entities('pointA', 'pointB');
    const distanceTool = new DistanceAddTool();
    await distanceTool.onPostInstall();
    const distanceCandidates = capture();
    await click(distanceTool, 1, 0);
    await click(distanceTool, 4, 4);
    expect(distanceCandidates[0]!.kind).toBe('distance');
    expect(distanceCandidates[0]!.measuredValue).toBeUndefined();
  });
});

// ── E1/W19（2026-11-15/16 Onshape live）：链式标注——发候选后保持安装 ───────
// 弹层打开期间工具保持安装（不再发完候选即 exitTool），且忽略画布拾取；
// 弹层确认成功/取消（dimensionPopupClosed）后**单尺寸工具仍保持安装**：
// 清空拾取、恢复首拾取提示，下一次拾取直接发第二个候选（无需重点 ribbon）。
// 旧槽位工具（Sketch.Dimension.Length 等，非 ribbon）保持原生命周期——弹层
// 关闭后退出。
describe('E1/W19：尺寸工具发候选后保持安装（弹层关闭恢复拾取）', () => {
  const listeners: (() => void)[] = [];

  afterEach(() => {
    while (listeners.length > 0) listeners.pop()!();
    sketchToolEvents.emit('dimensionPopupClosed');
    mockState.entities = [];
  });

  function capture(): SketchDimensionCandidate[] {
    const received: SketchDimensionCandidate[] = [];
    listeners.push(sketchToolEvents.on('dimensionCandidate', (candidate) => received.push(candidate)));
    return received;
  }

  function exitSpy(tool: SketchDimensionTool | LengthAddTool): ReturnType<typeof vi.fn> {
    return (tool as unknown as { exitTool: ReturnType<typeof vi.fn> }).exitTool;
  }

  async function click(tool: SketchDimensionTool | LengthAddTool, u: number, v: number): Promise<EventHandled> {
    mockState.hit = { u, v };
    return tool.onDataButtonDown(buttonEvent(u, v));
  }

  it('单尺寸工具：发候选后保持安装、忽略画布拾取；弹层关闭后清空拾取并可继续下一个尺寸', async () => {
    mockState.entities = entities('line345');
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const exits = exitSpy(tool);
    const candidates = capture();

    await click(tool, 1.5, 2); // 拾线
    await click(tool, 100, 100); // 空白放置 → length 候选
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: 'length' });
    expect(exits).not.toHaveBeenCalled();

    // 等待弹层期间：画布拾取被忽略（Yes），不产生第二个候选、不退出。
    expect(await click(tool, 1.5, 2)).toBe(EventHandled.Yes);
    expect(candidates).toHaveLength(1);
    expect(exits).not.toHaveBeenCalled();

    // W19 live：✓/✗ 关闭弹层后工具保持安装（不 exitTool），已退订（重复
    // 发射无副作用），拾取被清空——无需重新点 ribbon。
    const promptCalls = (IModelApp.notifications.outputPrompt as ReturnType<typeof vi.fn>).mock.calls.length;
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();
    // 提示随拾取清空刷新（回到首拾取提示），删除该调用时本断言失败。
    expect((IModelApp.notifications.outputPrompt as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeGreaterThan(promptCalls);
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();

    // 拾取已清空：空白点击不再有「放置」语义（不产生候选、不退出）。
    expect(await click(tool, 100, 100)).toBe(EventHandled.Yes);
    expect(candidates).toHaveLength(1);
    expect(exits).not.toHaveBeenCalled();

    // 下一次拾取直接开始第二个尺寸（未重新激活工具）。
    await click(tool, 1.5, 2);
    await click(tool, 100, 100);
    expect(candidates).toHaveLength(2);
    expect(candidates[1]).toMatchObject({ kind: 'length' });
    expect(exits).not.toHaveBeenCalled();

    // 第二个弹层关闭后同样保持安装（链式继续）。
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();
  });

  it('旧槽位工具（LengthAddTool，非 ribbon）：保持旧生命周期——弹层关闭后退出（一次）', async () => {
    mockState.entities = entities('line345');
    const tool = new LengthAddTool();
    await tool.onPostInstall();
    const exits = exitSpy(tool);
    const candidates = capture();

    await click(tool, 1.5, 2);
    expect(candidates).toHaveLength(1);
    expect(exits).not.toHaveBeenCalled();
    expect(await click(tool, 1.5, 2)).toBe(EventHandled.Yes);
    expect(candidates).toHaveLength(1);
    expect(exits).not.toHaveBeenCalled();

    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).toHaveBeenCalledTimes(1);
    // 已退订：重复发射不再触发退出。
    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).toHaveBeenCalledTimes(1);
  });

  it('onCleanup：退订等待监听，之后弹层关闭不再 exitTool（无陈旧监听）', async () => {
    mockState.entities = entities('line345');
    const tool = new SketchDimensionTool();
    await tool.onPostInstall();
    const exits = exitSpy(tool);
    capture();

    await click(tool, 1.5, 2);
    await click(tool, 100, 100);
    await tool.onCleanup();

    sketchToolEvents.emit('dimensionPopupClosed');
    expect(exits).not.toHaveBeenCalled();
  });
});
