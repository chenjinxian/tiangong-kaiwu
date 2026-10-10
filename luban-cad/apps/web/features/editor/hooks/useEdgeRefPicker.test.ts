/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// M3-a T6.3：useEdgeRefPicker 单测——mock runSelectSubEntityTool（捕获 options 回调）+
// mock fs.resolveEdgeRef；钉「选中→解析→ref 入列 / 失败→toast 不入列 / 去重 / deselect 反查 /
// 完成与 stop 双通道退场 / removeAt」。单一事实源=调用方 edges（FeatureParamForm value），
// hook 不私存 ref 列表（optsRef 恒读最新）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SubEntityType } from '@itwin/editor-common';
import type { FilletEdgeRef } from '@luban-cad/shared';
import type { UseFeatureSystem } from './useFeatureSystem.js';
import { useEdgeRefPicker, type UseEdgeRefPickerOptions } from './useEdgeRefPicker.js';

// ---------------------------------------------------------------------------
// mock SelectSubEntityTool 模块：捕获 runSelectSubEntityTool 的 options（回调现场）
// ---------------------------------------------------------------------------
const toolMocks = vi.hoisted(() => {
  interface Captured {
    mode: string;
    onSubEntitySelected?: (elementId: string, subEntity: { subEntity: { type: number; id: number } }) => void;
    onSubEntityDeselected?: (elementId: string, subEntity: { subEntity: { type: number; id: number } }) => void;
    onComplete?: () => void;
  }
  return {
    captured: undefined as Captured | undefined,
    runSelectSubEntityTool: vi.fn(async (options: Captured) => {
      toolMocks.captured = options;
    }),
  };
});

vi.mock('../../modeling/SelectSubEntityTool.js', () => ({
  SelectSubEntityTool: { toolId: 'SelectSubEntity' },
  runSelectSubEntityTool: toolMocks.runSelectSubEntityTool,
}));

// ---------------------------------------------------------------------------
// mock @itwin/core-frontend：stop() 需读 activeTool 并调其 exitTool
// ---------------------------------------------------------------------------
const coreMocks = vi.hoisted(() => ({
  activeTool: undefined as { toolId: string; exitTool: () => Promise<void> } | undefined,
  exitTool: vi.fn(async () => {}),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    toolAdmin: {
      get activeTool() {
        return coreMocks.activeTool;
      },
    },
  },
}));

const REF_A: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 1, entityId: 3 } };
const REF_B: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 4 }, faceB: { nodeId: 1, entityId: 5 } };
/** 与 REF_A 同一边的序颠倒形态（面对序无关——去重判定须视其为同一边） */
const REF_A_SWAPPED: FilletEdgeRef = { faceA: REF_A.faceB, faceB: REF_A.faceA };

const edgeLoc = (id: number) => ({ subEntity: { type: SubEntityType.Edge as number, id } });

function makeFs(result: { ok: boolean; ref?: FilletEdgeRef; error?: string } | Error) {
  const resolveEdgeRef =
    result instanceof Error
      ? vi.fn(async () => ({ ok: false as const, error: result.message }))
      : vi.fn(async () => result);
  return { resolveEdgeRef } as unknown as UseFeatureSystem;
}

function renderPicker(
  fs: UseFeatureSystem,
  init: Partial<UseEdgeRefPickerOptions> = {},
  connection: unknown = { key: 'm.bim' },
) {
  const onEdgesChange = vi.fn();
  const onError = vi.fn();
  const view = renderHook(
    (props: UseEdgeRefPickerOptions) =>
      useEdgeRefPicker(connection as never, fs, props),
    { initialProps: { edges: [], onEdgesChange, onError, ...init } },
  );
  return { ...view, onEdgesChange, onError };
}

describe('useEdgeRefPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolMocks.captured = undefined;
    coreMocks.activeTool = { toolId: 'SelectSubEntity', exitTool: coreMocks.exitTool };
  });

  it('start 启动边模式选择工具并置 picking；重复 start 不重复起工具', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result } = renderPicker(fs);

    expect(result.current.picking).toBe(false);
    act(() => result.current.start());
    expect(result.current.picking).toBe(true);
    expect(toolMocks.runSelectSubEntityTool).toHaveBeenCalledTimes(1);
    expect(toolMocks.captured?.mode).toBe('edge');

    act(() => result.current.start());
    expect(toolMocks.runSelectSubEntityTool).toHaveBeenCalledTimes(1);
  });

  it('无 connection → start 为空操作（不起工具）', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    // 直连 renderHook：renderPicker 的 connection 默认参在显式 undefined 时也会生效，须绕开
    const { result } = renderHook(
      (props: UseEdgeRefPickerOptions) => useEdgeRefPicker(undefined, fs, props),
      { initialProps: { edges: [], onEdgesChange: vi.fn(), onError: vi.fn() } },
    );
    act(() => result.current.start());
    expect(result.current.picking).toBe(false);
    expect(toolMocks.runSelectSubEntityTool).not.toHaveBeenCalled();
  });

  it('选中边 → resolveEdgeRef(elementId, 数字 id) → ok 则 ref 追加入列', async () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result, onEdgesChange } = renderPicker(fs);
    act(() => result.current.start());

    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', edgeLoc(42));
    });
    await waitFor(() => expect(onEdgesChange).toHaveBeenCalledWith([REF_A]));
    expect(fs.resolveEdgeRef).toHaveBeenCalledWith('0x11', 42);
  });

  it('resolve 失败 → onError 收到错误文案且不入列', async () => {
    const fs = makeFs({ ok: false, error: '非流形边（邻面数大于 2），圆角不支持' });
    const { result, onEdgesChange, onError } = renderPicker(fs);
    act(() => result.current.start());

    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', edgeLoc(42));
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('非流形边（邻面数大于 2），圆角不支持'));
    expect(onEdgesChange).not.toHaveBeenCalled();
  });

  it('同一边重复拾取（含面对序颠倒形态）→ 去重不入列', async () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const onEdgesChange = vi.fn();
    const onError = vi.fn();
    // 父级已应用首次追加：edges 现含 REF_A 的序颠倒存储形态
    const { result } = renderHook(
      (props: UseEdgeRefPickerOptions) => useEdgeRefPicker({ key: 'm' } as never, fs, props),
      { initialProps: { edges: [REF_A_SWAPPED], onEdgesChange, onError } },
    );
    act(() => result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', edgeLoc(42));
    });
    // 给解析微任务一轮机会后断言零发射（去重命中）
    await act(async () => {});
    expect(fs.resolveEdgeRef).toHaveBeenCalledWith('0x11', 42);
    expect(onEdgesChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('deselect 已解析的边 → 按拾取键反查移除对应 ref', async () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const onEdgesChange = vi.fn();
    const onError = vi.fn();
    const view = renderHook(
      (props: UseEdgeRefPickerOptions) => useEdgeRefPicker({ key: 'm' } as never, fs, props),
      { initialProps: { edges: [] as FilletEdgeRef[], onEdgesChange, onError } },
    );
    act(() => view.result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', edgeLoc(42));
    });
    await waitFor(() => expect(onEdgesChange).toHaveBeenCalledWith([REF_A]));
    // 父级应用变更
    view.rerender({ edges: [REF_A], onEdgesChange, onError });

    act(() => {
      toolMocks.captured!.onSubEntityDeselected!('0x11', edgeLoc(42));
    });
    expect(onEdgesChange).toHaveBeenCalledWith([]);
  });

  it('onComplete（工具自行退出：右键/Esc）→ picking 归零', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result } = renderPicker(fs);
    act(() => result.current.start());
    expect(result.current.picking).toBe(true);
    act(() => {
      toolMocks.captured!.onComplete!();
    });
    expect(result.current.picking).toBe(false);
  });

  it('stop 退出激活的 SelectSubEntity 工具并置 picking=false；非本工具激活时不误伤', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result } = renderPicker(fs);
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.picking).toBe(false);
    expect(coreMocks.exitTool).toHaveBeenCalledTimes(1);

    // 第二轮：激活的是别的工具 → stop 只收本地态，不调 exitTool
    coreMocks.activeTool = { toolId: 'SomeOtherTool', exitTool: coreMocks.exitTool };
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(coreMocks.exitTool).toHaveBeenCalledTimes(1);
  });

  it('拾取停止后迟到的 resolve 结果被丢弃（不再入列/报错）', async () => {
    let release!: (v: { ok: boolean; ref?: FilletEdgeRef }) => void;
    const pending = new Promise<{ ok: boolean; ref?: FilletEdgeRef }>((res) => {
      release = res;
    });
    const fs = { resolveEdgeRef: vi.fn(() => pending) } as unknown as UseFeatureSystem;
    const { result, onEdgesChange, onError } = renderPicker(fs);
    act(() => result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', edgeLoc(42));
    });
    act(() => result.current.stop()); // 解析未回即停止（对话框关闭中途拾取）
    await act(async () => {
      release({ ok: true, ref: REF_A });
    });
    expect(onEdgesChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('单选会话自然完成后迟到的 resolve 结果仍落账（2026-10-10 闸门语义修正）', async () => {
    // 单选工具拾得 1 条边即自行退出（onComplete）——晚于完成的 ok 回包必须入列，
    // 否则 chips 恒空（stop 丢弃闸门只对显式 stop/unmount 生效）。
    let release!: (v: { ok: boolean; ref?: FilletEdgeRef }) => void;
    const pending = new Promise<{ ok: boolean; ref?: FilletEdgeRef }>((res) => {
      release = res;
    });
    const fs = { resolveEdgeRef: vi.fn(() => pending) } as unknown as UseFeatureSystem;
    const { result, onEdgesChange, onError } = renderPicker(fs);
    act(() => result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', edgeLoc(42));
    });
    act(() => {
      toolMocks.captured!.onComplete!(); // 工具自然退出（非 stop()）
    });
    expect(result.current.picking).toBe(false);
    await act(async () => {
      release({ ok: true, ref: REF_A });
    });
    expect(onEdgesChange).toHaveBeenCalledWith([REF_A]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('拾取态 Escape（window keydown，capture）→ stop 退出工具并置 picking=false', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result } = renderPicker(fs);
    act(() => result.current.start());
    expect(result.current.picking).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.picking).toBe(false);
    expect(coreMocks.exitTool).toHaveBeenCalledTimes(1);

    // 非拾取态 Escape 不动（监听器已随 picking=false 摘除）
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(coreMocks.exitTool).toHaveBeenCalledTimes(1);
  });

  it('removeAt 移除指定序位 ref', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result, onEdgesChange } = renderPicker(fs, { edges: [REF_A, REF_B] });
    act(() => result.current.removeAt(0));
    expect(onEdgesChange).toHaveBeenCalledWith([REF_B]);
  });

  it('refs 直通调用方 edges（单一事实源在表单值，hook 不私存）', () => {
    const fs = makeFs({ ok: true, ref: REF_A });
    const { result } = renderPicker(fs, { edges: [REF_A, REF_B] });
    expect(result.current.refs).toEqual([REF_A, REF_B]);
  });
});
