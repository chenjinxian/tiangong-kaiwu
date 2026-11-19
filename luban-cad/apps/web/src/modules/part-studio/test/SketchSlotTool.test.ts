/**
 * ADR-0022 S2 首切片：草图槽工具接线单测（toolId/注册/ribbon capability）。
 *
 * 交互态（点击选线 → 预览 → Enter/再次点击提交）依赖 accessor/AccuSnap 运行态，
 * 由真栈 `e2e/sketch-slot.spec.ts` 覆盖；本文件不 mock 交互，避免 jsdom 假绿。
 */
import { describe, expect, it, vi } from 'vitest';

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
      constructor(priority: number, briefMessage: string) { this.priority = priority; this.briefMessage = briefMessage; }
    },
    OutputMessagePriority: { None: 0, Error: 10, Warning: 11, Info: 12 },
  };
});

import { SketchSlotTool, registerSketchSlotTools } from '../tools/sketch/SketchSlotTool.js';
import { SKETCH_RIBBON_TOOLS } from '../ribbon/sketch-tools.js';
import { TOOL_CAPABILITIES, isGated } from '../internal/capabilities.js';

describe('SketchSlotTool 接线（ADR-0022 S2 首切片）', () => {
  it('toolId=Sketch.Slot；偏移 ▾ 第二项 sketchSlot 且能力 full', () => {
    expect(SketchSlotTool.toolId).toBe('Sketch.Slot');
    const offset = SKETCH_RIBBON_TOOLS.find((t) => t.id === 'Sketch.Offset');
    expect(offset).toBeDefined();
    const slot = offset?.dropdownItems?.find((item) => item.id === 'sketchSlot');
    expect(slot).toBeDefined();
    expect(slot?.capability).toBe('sketchSlot');
    expect(TOOL_CAPABILITIES.sketchSlot).toBe('full');
    expect(isGated('sketchSlot')).toBe(false);
  });

  it('registerSketchSlotTools 幂等（只注册一次）', () => {
    registerMock.mockClear();
    registerSketchSlotTools();
    registerSketchSlotTools();
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith(SketchSlotTool);
  });
});
