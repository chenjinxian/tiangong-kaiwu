/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// RW2-T7：useFaceRefPicker 单测——useEdgeRefPicker 单测的镜像（mock runSelectSubEntityTool
// 捕获 options 回调 + mock fs.resolveFaceRef）。钉「选中→解析→ref 入列 / 失败→toast 不入列 /
// 去重 / deselect 反查 / 完成与 stop 双通道退场 / removeAt」。单一事实源=调用方 faces，
// hook 不私存 ref 列表（optsRef 恒读最新）。差异点：mode:'face'、ref=单面拓扑 id
// （去重键 nodeId:entityId 单键，无面对序无关形态）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SubEntityType } from '@itwin/editor-common';
import type { LubanTopologyId } from '@luban-cad/shared';
import type { UseFeatureSystem } from './useFeatureSystem.js';
import { useFaceRefPicker, type UseFaceRefPickerOptions } from './useFaceRefPicker.js';

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

const FACE_A: LubanTopologyId = { nodeId: 1, entityId: 2 };
const FACE_B: LubanTopologyId = { nodeId: 1, entityId: 4 };

const faceLoc = (id: number) => ({ subEntity: { type: SubEntityType.Face as number, id } });

function makeFs(result: { ok: boolean; ref?: LubanTopologyId; error?: string } | Error) {
  const resolveFaceRef =
    result instanceof Error
      ? vi.fn(async () => ({ ok: false as const, error: result.message }))
      : vi.fn(async () => result);
  return { resolveFaceRef } as unknown as UseFeatureSystem;
}

function renderPicker(
  fs: UseFeatureSystem,
  init: Partial<UseFaceRefPickerOptions> = {},
  connection: unknown = { key: 'm.bim' },
) {
  const onFacesChange = vi.fn();
  const onError = vi.fn();
  const view = renderHook(
    (props: UseFaceRefPickerOptions) =>
      useFaceRefPicker(connection as never, fs, props),
    { initialProps: { faces: [], onFacesChange, onError, ...init } },
  );
  return { ...view, onFacesChange, onError };
}

describe('useFaceRefPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolMocks.captured = undefined;
    coreMocks.activeTool = { toolId: 'SelectSubEntity', exitTool: coreMocks.exitTool };
  });

  it('start 启动 face 模式选择工具并置 picking；重复 start 不重复起工具', () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result } = renderPicker(fs);

    expect(result.current.picking).toBe(false);
    act(() => result.current.start());
    expect(result.current.picking).toBe(true);
    expect(toolMocks.runSelectSubEntityTool).toHaveBeenCalledTimes(1);
    expect(toolMocks.captured?.mode).toBe('face');

    act(() => result.current.start());
    expect(toolMocks.runSelectSubEntityTool).toHaveBeenCalledTimes(1);
  });

  it('无 connection → start 为空操作（不起工具）', () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result } = renderHook(
      (props: UseFaceRefPickerOptions) => useFaceRefPicker(undefined, fs, props),
      { initialProps: { faces: [], onFacesChange: vi.fn(), onError: vi.fn() } },
    );
    act(() => result.current.start());
    expect(result.current.picking).toBe(false);
    expect(toolMocks.runSelectSubEntityTool).not.toHaveBeenCalled();
  });

  it('选中面 → resolveFaceRef(elementId, 数字 id) → ok 则 ref 追加入列', async () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result, onFacesChange } = renderPicker(fs);
    act(() => result.current.start());

    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', faceLoc(42));
    });
    await waitFor(() => expect(onFacesChange).toHaveBeenCalledWith([FACE_A]));
    expect(fs.resolveFaceRef).toHaveBeenCalledWith('0x11', 42);
  });

  it('resolve 失败 → onError 收到错误文案且不入列', async () => {
    const fs = makeFs({ ok: false, error: '非面子实体或子实体 id 已失效' });
    const { result, onFacesChange, onError } = renderPicker(fs);
    act(() => result.current.start());

    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', faceLoc(42));
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('非面子实体或子实体 id 已失效'));
    expect(onFacesChange).not.toHaveBeenCalled();
  });

  it('同一面重复拾取 → 去重不入列（单键 nodeId:entityId）', async () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result, onFacesChange, onError } = renderPicker(fs, { faces: [FACE_A] });
    act(() => result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', faceLoc(42));
    });
    await act(async () => {});
    expect(fs.resolveFaceRef).toHaveBeenCalledWith('0x11', 42);
    expect(onFacesChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('deselect 已解析的面 → 按拾取键反查移除对应 ref', async () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const onFacesChange = vi.fn();
    const onError = vi.fn();
    const view = renderHook(
      (props: UseFaceRefPickerOptions) => useFaceRefPicker({ key: 'm' } as never, fs, props),
      { initialProps: { faces: [] as LubanTopologyId[], onFacesChange, onError } },
    );
    act(() => view.result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', faceLoc(42));
    });
    await waitFor(() => expect(onFacesChange).toHaveBeenCalledWith([FACE_A]));
    // 父级应用变更
    view.rerender({ faces: [FACE_A], onFacesChange, onError });

    act(() => {
      toolMocks.captured!.onSubEntityDeselected!('0x11', faceLoc(42));
    });
    expect(onFacesChange).toHaveBeenCalledWith([]);
  });

  it('onComplete（工具自行退出：右键/Esc）→ picking 归零', () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result } = renderPicker(fs);
    act(() => result.current.start());
    expect(result.current.picking).toBe(true);
    act(() => {
      toolMocks.captured!.onComplete!();
    });
    expect(result.current.picking).toBe(false);
  });

  it('stop 退出激活的 SelectSubEntity 工具并置 picking=false；非本工具激活时不误伤', () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
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
    let release!: (v: { ok: boolean; ref?: LubanTopologyId }) => void;
    const pending = new Promise<{ ok: boolean; ref?: LubanTopologyId }>((res) => {
      release = res;
    });
    const fs = { resolveFaceRef: vi.fn(() => pending) } as unknown as UseFeatureSystem;
    const { result, onFacesChange, onError } = renderPicker(fs);
    act(() => result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', faceLoc(42));
    });
    act(() => result.current.stop()); // 解析未回即停止（对话框关闭中途拾取）
    await act(async () => {
      release({ ok: true, ref: FACE_A });
    });
    expect(onFacesChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('单选会话自然完成后迟到的 resolve 结果仍落账（同 useEdgeRefPicker 闸门语义）', async () => {
    let release!: (v: { ok: boolean; ref?: LubanTopologyId }) => void;
    const pending = new Promise<{ ok: boolean; ref?: LubanTopologyId }>((res) => {
      release = res;
    });
    const fs = { resolveFaceRef: vi.fn(() => pending) } as unknown as UseFeatureSystem;
    const { result, onFacesChange, onError } = renderPicker(fs);
    act(() => result.current.start());
    act(() => {
      toolMocks.captured!.onSubEntitySelected!('0x11', faceLoc(42));
    });
    act(() => {
      toolMocks.captured!.onComplete!(); // 工具自然退出（非 stop()）
    });
    expect(result.current.picking).toBe(false);
    await act(async () => {
      release({ ok: true, ref: FACE_A });
    });
    expect(onFacesChange).toHaveBeenCalledWith([FACE_A]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('拾取态 Escape（window keydown，capture）→ stop 退出工具并置 picking=false', () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
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
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result, onFacesChange } = renderPicker(fs, { faces: [FACE_A, FACE_B] });
    act(() => result.current.removeAt(0));
    expect(onFacesChange).toHaveBeenCalledWith([FACE_B]);
  });

  it('refs 直通调用方 faces（单一事实源在表单值，hook 不私存）', () => {
    const fs = makeFs({ ok: true, ref: FACE_A });
    const { result } = renderPicker(fs, { faces: [FACE_A, FACE_B] });
    expect(result.current.refs).toEqual([FACE_A, FACE_B]);
  });
});
