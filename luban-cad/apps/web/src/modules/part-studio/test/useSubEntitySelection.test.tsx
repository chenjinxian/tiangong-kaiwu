/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * B6 M-A5.2 T3：子实体选择模式生命周期 hook 单测。注入 fake starter，
 * 不触真实 ToolAdmin/IModelApp 初始化；只 mock notifications 面。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { notifications: { outputMessage: vi.fn() } },
  NotifyMessageDetails: class {},
  OutputMessagePriority: { Error: 0 },
}));

import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { useSubEntitySelection } from '../hooks/useSubEntitySelection.js';
import type { SubEntitySelectOptions } from '../tools/modeling/SubEntitySelectTool.js';

type FakeTool = { exitTool: () => void };

function fakeStarter() {
  let options!: SubEntitySelectOptions;
  const exitTool = vi.fn();
  const startTool = vi.fn(async (o: SubEntitySelectOptions): Promise<FakeTool> => {
    options = o;
    return { exitTool };
  });
  return { startTool, exitTool, options: () => options };
}

function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    dialog: { active: null },
  });
}

beforeEach(resetStore);

describe('useSubEntitySelection', () => {
  it('进入 face 启动工具；onPicked 追加去重；onEnded 回 body 并清空', async () => {
    usePartStudioStore.getState().setSelectionMode('face');
    const fake = fakeStarter();
    const toast = vi.fn();
    const { unmount } = renderHook(() =>
      useSubEntitySelection({ key: 'k' } as never, { startTool: fake.startTool, toast }));

    await waitFor(() => expect(fake.startTool).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'face', connectionKey: 'k' })));

    const selection = {
      kind: 'face' as const, id: 'face:1:3', ownerBodyKey: '0x15',
      topologyId: { nodeId: 1, entityId: 3 }, label: '面',
    };
    act(() => fake.options().onPicked?.(selection));
    act(() => fake.options().onPicked?.(selection));
    expect(usePartStudioStore.getState().canvas.selection).toEqual([selection]);

    act(() => fake.options().onEnded?.());
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
    unmount();
  });

  it('dialog.active 时不启动；打开 dialog 会停止当前工具并回 body', async () => {
    const fake = fakeStarter();
    usePartStudioStore.getState().setSelectionMode('edge');
    const { rerender } = renderHook(() =>
      useSubEntitySelection({ key: 'k' } as never, { startTool: fake.startTool }));

    await waitFor(() => expect(fake.startTool).toHaveBeenCalledTimes(1));

    act(() => usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' }));
    rerender();

    await waitFor(() => expect(fake.exitTool).toHaveBeenCalled());
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
  });

  it('切回 body/卸载 退出活动工具；连接切换回 body；启动失败回 body 并 toast', async () => {
    const fake = fakeStarter();
    usePartStudioStore.getState().setSelectionMode('face');
    const { unmount, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useSubEntitySelection({ key } as never, { startTool: fake.startTool }),
      { initialProps: { key: 'k1' } },
    );

    await waitFor(() => expect(fake.startTool).toHaveBeenCalledTimes(1));
    rerender({ key: 'k2' });

    await waitFor(() => expect(fake.exitTool).toHaveBeenCalledTimes(1));
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');

    act(() => usePartStudioStore.getState().setSelectionMode('edge'));
    await waitFor(() => expect(fake.startTool).toHaveBeenCalledTimes(2));
    unmount();

    await waitFor(() => expect(fake.exitTool).toHaveBeenCalledTimes(2));
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');

    const fail = vi.fn(async () => {
      throw new Error('启动失败');
    });
    const toast = vi.fn();
    usePartStudioStore.getState().setSelectionMode('face');
    renderHook(() => useSubEntitySelection({ key: 'k' } as never, { startTool: fail, toast }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('启动失败'));
    expect(usePartStudioStore.getState().canvas.selectionMode).toBe('body');
  });
});
