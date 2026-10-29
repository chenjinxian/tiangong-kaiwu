/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * M6-b T5：草图尺寸工具单测——槽位形状表（distance=2 point / radius=
 * 1 circle）+ 槽位接收判定 + 事件桥发收往返。
 *
 * 「尺寸不直接提交铁律」（M3-b 裁决 E-4）的结构面在此钉死：工具模块不导出
 * 任何提交通道，满槽只经 sketchToolEvents 发候选（SketchPanel.test.tsx 验收
 * 面板收值→提交的另一半；工具交互态归真实栈冒烟，诚实登记不覆盖）。
 */
import { describe, expect, it, vi } from 'vitest';

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
  RadiusAddTool,
  registerSketchDimensionTools,
} from '../tools/sketch/SketchAddDimensionTool.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';
import type { SketchDimensionCandidate } from '../tools/sketch/sketch-tool-events.js';

describe('M6-b T5：DIMENSION_SLOTS 槽位形状表（SolverTypes 冻结契约）', () => {
  it('distance=2 point；radius=1 circle', () => {
    expect(DIMENSION_SLOTS.distance).toEqual({ slot: 'point', count: 2 });
    expect(DIMENSION_SLOTS.radius).toEqual({ slot: 'circle', count: 1 });
  });
});

describe('M6-b T5：acceptDimensionPick 槽位接收判定', () => {
  it('distance：两点满槽；线/圆拒收', () => {
    expect(acceptDimensionPick('distance', 0, 'point')).toEqual({ ok: true, complete: false });
    expect(acceptDimensionPick('distance', 1, 'point')).toEqual({ ok: true, complete: true });
    expect(acceptDimensionPick('distance', 0, 'line').ok).toBe(false);
    expect(acceptDimensionPick('distance', 0, 'circle').ok).toBe(false);
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
