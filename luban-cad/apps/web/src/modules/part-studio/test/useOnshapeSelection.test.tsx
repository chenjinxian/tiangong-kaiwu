/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Task 5：Onshape 式默认选择工具的生命周期 hook 单测。
 * 覆盖默认工具注册/启动、dialog/草图暂停-恢复、暂停清空选择（工具 + SelectionSet）、
 * 启动失败回退 core Select、卸载恢复 core Select 并清空 store 选择。
 * 用 `_toolAdmin`/`_notifications` 私有静态注入最小替身（不引导查看器）。
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IModelApp } from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';
import { useOnshapeSelection } from '../hooks/useOnshapeSelection.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

const connection = { key: 'imodel-key' } as BriefcaseConnection;
const viewport = {} as ScreenViewport;

const outputMessage = vi.fn();

function stubNotifications(): void {
  (IModelApp as unknown as { _notifications: unknown })._notifications = { outputMessage };
}

/** BeEvent 形状的最小替身（addListener → disposer），不引 core-bentley 依赖。 */
function makeToolChangedEvent() {
  const listeners = new Set<(tool: unknown) => void>();
  return {
    addListener: vi.fn((listener: (tool: unknown) => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    raiseEvent: (tool: unknown): void => {
      for (const listener of [...listeners]) listener(tool);
    },
    listenerCount: (): number => listeners.size,
  };
}

function stubToolAdmin() {
  const startDefaultTool = vi.fn(async () => undefined);
  const activeToolChanged = makeToolChangedEvent();
  const admin = {
    defaultToolId: 'Select',
    defaultToolArgs: undefined as unknown[] | undefined,
    activeTool: undefined as unknown,
    startDefaultTool,
    activeToolChanged,
  };
  (IModelApp as unknown as { _toolAdmin: unknown })._toolAdmin = admin;
  return { admin, startDefaultTool, activeToolChanged };
}

function makeTool(): OnshapeSelectTool {
  return new OnshapeSelectTool({
    connectionKey: 'imodel-key',
    onSelectionChanged: vi.fn(),
    onError: vi.fn(),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  outputMessage.mockReset();
  stubNotifications();
  usePartStudioStore.setState({
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
    dialog: { active: null },
  });
});

describe('useOnshapeSelection', () => {
  it('注册工具并设置 defaultToolId/defaultToolArgs，空闲即启动', () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    const register = vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));
    expect(register).toHaveBeenCalledWith(OnshapeSelectTool);
    expect(admin.defaultToolId).toBe(OnshapeSelectTool.toolId);
    expect(admin.defaultToolArgs?.[0]).toMatchObject({ connectionKey: 'imodel-key' });
    expect(startDefaultTool).toHaveBeenCalled();
    unmount();
  });

  it('paused=true 不启动；恢复后启动或 resume', () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { rerender } = renderHook(
      ({ paused }) => useOnshapeSelection(connection, viewport, paused),
      { initialProps: { paused: true } },
    );
    expect(startDefaultTool).not.toHaveBeenCalled();

    const tool = makeTool();
    const pause = vi.spyOn(tool, 'pause').mockResolvedValue(undefined);
    const resume = vi.spyOn(tool, 'resume').mockImplementation(() => undefined);
    admin.activeTool = tool;
    rerender({ paused: false });
    expect(resume).toHaveBeenCalled();
    rerender({ paused: true });
    expect(pause).toHaveBeenCalledWith(true);
  });

  it('暂停清空工具选择并清空 connection.selectionSet', () => {
    const { admin } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const emptyAll = vi.fn();
    const conn = { key: 'imodel-key', selectionSet: { emptyAll } } as unknown as BriefcaseConnection;
    const { rerender } = renderHook(
      ({ paused }) => useOnshapeSelection(conn, viewport, paused),
      { initialProps: { paused: false } },
    );

    const tool = makeTool();
    const pause = vi.spyOn(tool, 'pause').mockResolvedValue(undefined);
    admin.activeTool = tool;
    rerender({ paused: true });

    expect(pause).toHaveBeenCalledWith(true);
    expect(emptyAll).toHaveBeenCalledTimes(1);
  });

  it('卸载恢复 core Select 并清空 store 选择', () => {
    const { admin } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));

    usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x201', label: 'Body 1' }]);
    unmount();
    expect(admin.defaultToolId).toBe('Select');
    expect(admin.defaultToolArgs).toBeUndefined();
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
  });

  it('默认工具启动失败回退 core Select 并提示', async () => {
    const { admin } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    admin.startDefaultTool = vi.fn(async () => {
      throw new Error('启动失败');
    });

    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));

    await waitFor(() => expect(admin.defaultToolId).toBe('Select'));
    // 挂载时两个 effect 各自触发一次 startDefaultTool（iTwin 对并发 run 取最后一次），
    // 故提示可能多于一次；此处只断言失败回退一定发生且提示输出。
    expect(outputMessage).toHaveBeenCalled();
    unmount();
  });

  it('暂停期间新激活的 Onshape 工具也暂停；卸载移除监听', () => {
    const { admin, activeToolChanged } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, true));

    const tool = makeTool();
    const pause = vi.spyOn(tool, 'pause').mockResolvedValue(undefined);
    admin.activeTool = tool;
    activeToolChanged.raiseEvent(tool);
    expect(pause).toHaveBeenCalledWith(true);

    unmount();
    expect(activeToolChanged.listenerCount()).toBe(0);
    activeToolChanged.raiseEvent(tool);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('未连接/未视口不注册工具也不启动（不抛）', () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    const register = vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(undefined, viewport, false));

    expect(register).not.toHaveBeenCalled();
    expect(startDefaultTool).not.toHaveBeenCalled();
    expect(admin.defaultToolId).toBe('Select');
    unmount();
  });
});
