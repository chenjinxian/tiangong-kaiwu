/**
 * Onshape 鼠标导航（2026-11-12）：右键拖拽旋转、Ctrl+右键拖拽平移，
 * 并抑制拖拽结束后的右键菜单；非 Reset 按键维持上游 IdleTool 行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  run: vi.fn(),
  startHandleDrag: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  BeButton: { Data: 0, Middle: 1, Reset: 2 },
  EventHandled: { Yes: 0, No: 1 },
  ViewHandleType: { None: 0, Rotate: 1, Pan: 2 },
  IModelApp: {
    tools: {
      create: mocks.create,
    },
  },
  IdleTool: class {
    public async onMouseStartDrag(): Promise<number> {
      return 1;
    }
  },
}));

import { consumeRightDragMenuSuppression, clearRightDragMenuSuppression } from '../internal/right-drag-menu.js';
import { OnshapeIdleTool } from '../tools/modeling/OnshapeIdleTool.js';

const viewport = { id: 'vp' } as never;

function buttonEvent(button: number, modifiers: { ctrl?: boolean; shift?: boolean } = {}): never {
  return {
    button,
    viewport,
    isControlKey: modifiers.ctrl === true,
    isShiftKey: modifiers.shift === true,
  } as never;
}

beforeEach(() => {
  clearRightDragMenuSuppression();
  vi.clearAllMocks();
  mocks.run.mockResolvedValue(true);
  mocks.startHandleDrag.mockResolvedValue(0);
  mocks.create.mockReturnValue({ run: mocks.run, startHandleDrag: mocks.startHandleDrag });
});

describe('OnshapeIdleTool 右键导航', () => {
  it('右键拖拽 → View.Rotate + Rotate handle，并抑制随后菜单', async () => {
    const tool = new OnshapeIdleTool();
    const ev = buttonEvent(2);
    const handled = await tool.onMouseStartDrag(ev);

    expect(mocks.create).toHaveBeenCalledWith('View.Rotate', viewport, true, true);
    expect(mocks.startHandleDrag).toHaveBeenCalledWith(ev, 1);
    expect(handled).toBe(0);
    expect(consumeRightDragMenuSuppression()).toBe(true);
    expect(consumeRightDragMenuSuppression()).toBe(false);
  });

  it('Ctrl+右键拖拽 → View.Pan + Pan handle', async () => {
    const tool = new OnshapeIdleTool();
    const ev = buttonEvent(2, { ctrl: true });
    await tool.onMouseStartDrag(ev);

    expect(mocks.create).toHaveBeenCalledWith('View.Pan', viewport, true, true);
    expect(mocks.startHandleDrag).toHaveBeenCalledWith(ev, 2);
  });

  it('Shift+右键与无修饰一致（旋转）', async () => {
    const tool = new OnshapeIdleTool();
    await tool.onMouseStartDrag(buttonEvent(2, { shift: true }));
    expect(mocks.create).toHaveBeenCalledWith('View.Rotate', viewport, true, true);
  });

  it('非 Reset 按键不进入右键导航，抑制标志不变', async () => {
    const tool = new OnshapeIdleTool();
    const handled = await tool.onMouseStartDrag(buttonEvent(0));
    expect(handled).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(consumeRightDragMenuSuppression()).toBe(false);
  });

  it('导航工具启动失败也吞掉拖拽并抑制菜单', async () => {
    mocks.run.mockResolvedValue(false);
    const tool = new OnshapeIdleTool();
    const handled = await tool.onMouseStartDrag(buttonEvent(2));
    expect(handled).toBe(0);
    expect(consumeRightDragMenuSuppression()).toBe(true);
  });
});
