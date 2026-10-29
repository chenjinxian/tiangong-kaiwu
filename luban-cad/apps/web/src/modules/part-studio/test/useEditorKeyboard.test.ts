// src/modules/part-studio/test/useEditorKeyboard.test.ts
//
// M4 Task 4：编辑器键盘 hook 单元测试。控制器裁定（T3 交接单）：viewer
// registerDefaultShortcuts 已绑 Ctrl+Z/Ctrl+Y（真实 'Undo'/'Redo' toolId）——
// 本 hook 只补 Ctrl+S 保存，**不得二次绑定 undo/redo 键**（否则工具双跑）。
// 断言面：
//  1) Ctrl+S / Cmd+S：editable 焦点门外 → save 调用 + preventDefault（拦浏览器
//     另存为）；
//  2) editable 焦点门（INPUT/TEXTAREA/contentEditable）：不派发；
//  3) enabled=false：不派发；
//  4) Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y：本 hook **不**处理（viewer 快捷键
//     通道独占）——save 不被调、默认行为不被拦；
//  5) 卸载摘除监听。

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEditorKeyboard } from '../hooks/useEditorKeyboard.js';

/** 派发 keydown（cancelable 供 preventDefault 断言），返回事件本身。 */
function pressKey(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  window.dispatchEvent(event);
  return event;
}

function pressSave(mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}): KeyboardEvent {
  return pressKey({ key: 's', ctrlKey: mods.ctrlKey, metaKey: mods.metaKey, shiftKey: mods.shiftKey });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useEditorKeyboard（仅 Ctrl+S——undo/redo 归 viewer 快捷键）', () => {
  it('Ctrl+S：save 调用 + preventDefault', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(true, { save }));

    const event = pressSave({ ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Cmd+S（macOS）：save 调用', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(true, { save }));

    pressSave({ metaKey: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('save 拒绝时不崩（拒绝吞掉，后续键派发不受影响）', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('save failed'));
    renderHook(() => useEditorKeyboard(true, { save }));

    pressSave({ ctrlKey: true });
    // 冲微任务：让拒绝落地——hook 不崩、监听仍在，二次派发照常工作。
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(1);
    pressSave({ ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('editable 焦点门：INPUT 聚焦时不派发', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(true, { save }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    pressSave({ ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('editable 焦点门：TEXTAREA 与 contentEditable 不派发', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(true, { save }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    pressSave({ ctrlKey: true });

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    textarea.blur();
    (editable as HTMLElement).focus();
    pressSave({ ctrlKey: true });

    expect(save).not.toHaveBeenCalled();
  });

  it('enabled=false：不派发', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(false, { save }));

    pressSave({ ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('undo/redo 键不二次绑定：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 均不处理', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(true, { save }));

    const ctrlZ = pressKey({ key: 'z', ctrlKey: true });
    const ctrlShiftZ = pressKey({ key: 'z', ctrlKey: true, shiftKey: true });
    const ctrlY = pressKey({ key: 'y', ctrlKey: true });

    expect(save).not.toHaveBeenCalled();
    // 默认行为不被拦：拦截权归 viewer registerDefaultShortcuts 独占。
    expect(ctrlZ.defaultPrevented).toBe(false);
    expect(ctrlShiftZ.defaultPrevented).toBe(false);
    expect(ctrlY.defaultPrevented).toBe(false);
  });

  it('非保存键不派发', () => {
    const save = vi.fn();
    renderHook(() => useEditorKeyboard(true, { save }));

    pressKey({ key: 's' });
    pressKey({ key: 'S', ctrlKey: true, shiftKey: true });
    pressKey({ key: 'a', ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });

  it('卸载：监听摘除，键不再派发', () => {
    const save = vi.fn();
    const { unmount } = renderHook(() => useEditorKeyboard(true, { save }));
    unmount();

    pressSave({ ctrlKey: true });
    expect(save).not.toHaveBeenCalled();
  });
});
