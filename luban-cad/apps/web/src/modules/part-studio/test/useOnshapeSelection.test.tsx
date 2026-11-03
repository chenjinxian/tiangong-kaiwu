/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Task 5：Onshape 式默认选择工具的生命周期 hook 单测。
 * 覆盖默认工具注册/启动（含默认参数数组形态）、dialog/草图暂停-恢复、
 * 暂停清空选择（工具 + SelectionSet）、启动失败回退 core Select、
 * 卸载/连接失效恢复 core Select、启动与清理竞态。
 * 用 `_toolAdmin`/`_notifications` 私有静态注入最小替身（不引导查看器）。
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IModelApp } from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';
import type { OnshapeSelectOptions } from '../tools/modeling/OnshapeSelectTool.js';
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
  it('注册工具并设置 defaultToolId/defaultToolArgs（数组形态），空闲即启动且只启动一次', async () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    const register = vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));
    expect(register).toHaveBeenCalledWith(OnshapeSelectTool);
    expect(admin.defaultToolId).toBe(OnshapeSelectTool.toolId);
    // ToolAdmin.startDefaultTool → tools.create(toolId, defaultToolArgs)（单实参），
    // 故 defaultToolArgs 必须保持 [options] 数组形态（构造器负责解包）。
    expect(Array.isArray(admin.defaultToolArgs)).toBe(true);
    expect(admin.defaultToolArgs).toHaveLength(1);
    expect(admin.defaultToolArgs?.[0]).toMatchObject({ connectionKey: 'imodel-key' });
    // 两个 effect 都请求启动，但 in-flight 守卫只放行一次。
    expect(startDefaultTool).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(startDefaultTool).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('暂停挂载不启动；解除暂停后恰好启动一次', async () => {
    const { startDefaultTool } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { rerender } = renderHook(
      ({ paused }) => useOnshapeSelection(connection, viewport, paused),
      { initialProps: { paused: true } },
    );
    expect(startDefaultTool).not.toHaveBeenCalled();

    rerender({ paused: false });
    expect(startDefaultTool).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(startDefaultTool).toHaveBeenCalledTimes(1);
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

  it('卸载时 Onshape 工具仍活动：恢复 core Select 并启动', () => {
    const { admin, startDefaultTool } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));

    const tool = makeTool();
    vi.spyOn(tool, 'exitTool').mockResolvedValue(undefined);
    admin.activeTool = tool;
    unmount();

    expect(admin.defaultToolId).toBe('Select');
    expect(admin.defaultToolArgs).toBeUndefined();
    expect(startDefaultTool).toHaveBeenCalledTimes(2); // 挂载启动 + 卸载回 core Select
  });

  it('默认工具启动失败回退 core Select：清参数并启动 core Select', async () => {
    const { admin } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const start = vi.fn()
      .mockRejectedValueOnce(new Error('启动失败'))
      .mockResolvedValue(undefined);
    admin.startDefaultTool = start;

    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(admin.defaultToolId).toBe('Select');
    expect(admin.defaultToolArgs).toBeUndefined();
    expect(outputMessage).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('暂停期间新激活的 Onshape 工具也暂停并清空 SelectionSet；卸载移除监听', () => {
    const { admin, activeToolChanged } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const emptyAll = vi.fn();
    const conn = { key: 'imodel-key', selectionSet: { emptyAll } } as unknown as BriefcaseConnection;
    const { unmount } = renderHook(() => useOnshapeSelection(conn, viewport, true));

    const tool = makeTool();
    const pause = vi.spyOn(tool, 'pause').mockResolvedValue(undefined);
    emptyAll.mockClear(); // 挂载进 paused 时 paused effect 已清过一次
    admin.activeTool = tool;
    activeToolChanged.raiseEvent(tool);
    expect(pause).toHaveBeenCalledWith(true);
    expect(emptyAll).toHaveBeenCalledTimes(1);

    unmount();
    expect(activeToolChanged.listenerCount()).toBe(0);
    activeToolChanged.raiseEvent(tool);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('启动在卸载后才完成：退出已装上的 Onshape 工具且不再写选择', async () => {
    const { admin } = stubToolAdmin();
    let resolveStart!: () => void;
    const start = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStart = resolve; }))
      .mockResolvedValue(undefined);
    admin.startDefaultTool = start;
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);

    const { unmount } = renderHook(() => useOnshapeSelection(connection, viewport, false));
    const options = admin.defaultToolArgs?.[0] as OnshapeSelectOptions;

    // 模拟异步启动完成后才装上工具（stub ToolAdmin 不会真的安装）。
    const tool = makeTool();
    const exitTool = vi.spyOn(tool, 'exitTool').mockResolvedValue(undefined);
    admin.activeTool = tool;

    unmount();
    expect(admin.defaultToolId).toBe('Select');
    expect(start).toHaveBeenCalledTimes(2); // 卸载清理发现选择工具仍活动 → 启动 core Select

    // 过期工具（旧 effect 的 options）不得再写 store。
    options.onSelectionChanged([{ kind: 'part', id: 'stale', label: 'Stale' }]);
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);

    resolveStart();
    await waitFor(() => expect(exitTool).toHaveBeenCalledTimes(1));
  });

  it('connection 变为 undefined：恢复 core Select 默认并清参数', () => {
    const { admin } = stubToolAdmin();
    vi.spyOn(IModelApp.tools, 'register').mockImplementation(() => undefined);
    const { rerender } = renderHook(
      ({ conn }: { conn: BriefcaseConnection | undefined }) =>
        useOnshapeSelection(conn, viewport, false),
      { initialProps: { conn: connection as BriefcaseConnection | undefined } },
    );
    expect(admin.defaultToolId).toBe(OnshapeSelectTool.toolId);

    rerender({ conn: undefined });
    expect(admin.defaultToolId).toBe('Select');
    expect(admin.defaultToolArgs).toBeUndefined();
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
