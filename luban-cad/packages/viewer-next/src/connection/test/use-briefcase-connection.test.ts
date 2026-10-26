// @vitest-environment jsdom
//
// useBriefcaseConnection（web-next M4 Task 1）：旧 viewer-core 同名 hook 移植验收——
//  1) options=null：零 IPC，connection 恒 null；
//  2) 正常流：downloadBriefcase(iTwinId,iModelId,readonly) → openFile({fileName,readonly,key}) → connection 就位；
//  3) 卸载 close 恰一次 + isClosing 重入保护（连卸两次只关一次）；
//  4) saveChanges/pushChanges/pullChanges 代理到 connection 同名方法（未就绪时 no-op）；
//  5) downloadBriefcase/openFile 拒绝 → error 就位、connection 恒 null、isLoading 归 false。
//
// mock 口径与旧 viewer-core useBriefcaseConnection.test.ts 同族：core-frontend 与
// @luban-cad/shared 模块级 mock（零真实 IPC），hook 本体的状态机语义真实参与。

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factory 会被提升到文件顶部，先于 const 初始化执行（TDZ）——
// 被工厂引用的 mock 须用 vi.hoisted 一并提升（vitest 官方推荐写法）。
const {
  makeIpcProxyMock,
  downloadBriefcaseMock,
  openFileMock,
  closeMock,
  saveChangesMock,
  pushChangesMock,
  pullChangesMock,
} = vi.hoisted(() => ({
  makeIpcProxyMock: vi.fn(),
  downloadBriefcaseMock: vi.fn(),
  openFileMock: vi.fn(),
  closeMock: vi.fn(),
  saveChangesMock: vi.fn(),
  pushChangesMock: vi.fn(),
  pullChangesMock: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  // isValid: true——2026-10-26 open 前置 IpcApp 就绪门（生产 bundle 竞态修复）的
  // 测试姿态：mock 恒就绪，门零等待直接过（门自身的等待/超时语义由真实栈覆盖）。
  IpcApp: { makeIpcProxy: makeIpcProxyMock, isValid: true },
  BriefcaseConnection: { openFile: openFileMock },
}));
vi.mock('@luban-cad/shared', () => ({ openCloudIpcChannel: 'open-cloud-ipc' }));

import {
  useBriefcaseConnection,
  type UseBriefcaseConnectionOptions,
  type UseBriefcaseConnectionResult,
} from '../use-briefcase-connection.js';

const mockConnection = {
  close: closeMock,
  saveChanges: saveChangesMock,
  pushChanges: pushChangesMock,
  pullChanges: pullChangesMock,
};

const DOWNLOAD_RESULT = {
  fileName: '/cache/abc/briefcases/42.bim',
  briefcaseId: 42,
  changeset: { id: 'cs1', index: 5 },
};

const OPTIONS: UseBriefcaseConnectionOptions = { iTwinId: 'xyz', iModelId: 'abc' };

/** 推进宏任务队列，让 hook 内 async 打开流走完。 */
async function flushAsync(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  makeIpcProxyMock.mockReturnValue({ downloadBriefcase: downloadBriefcaseMock });
  downloadBriefcaseMock.mockResolvedValue(DOWNLOAD_RESULT);
  openFileMock.mockResolvedValue(mockConnection);
  closeMock.mockResolvedValue(undefined);
});

describe('useBriefcaseConnection（移植自 viewer-core）', () => {
  it('options=null：零 IPC，connection 恒 null', async () => {
    const { result } = renderHook(() => useBriefcaseConnection(null));
    await flushAsync();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBeNull();
    expect(result.current.error).toBeNull();
    expect(makeIpcProxyMock).not.toHaveBeenCalled();
    expect(downloadBriefcaseMock).not.toHaveBeenCalled();
  });

  it('正常流：downloadBriefcase → openFile → connection 就位', async () => {
    const { result } = renderHook(() => useBriefcaseConnection(OPTIONS));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.connection).toBeNull();

    await flushAsync();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBe(mockConnection);
    expect(result.current.error).toBeNull();
    expect(downloadBriefcaseMock).toHaveBeenCalledWith('xyz', 'abc', undefined);
    expect(openFileMock).toHaveBeenCalledWith({
      fileName: '/cache/abc/briefcases/42.bim',
      key: '/cache/abc/briefcases/42.bim',
      readonly: false,
    });
  });

  it('readonly 透传 downloadBriefcase 与 openFile', async () => {
    renderHook(() => useBriefcaseConnection({ ...OPTIONS, readonly: true }));
    await flushAsync();
    expect(downloadBriefcaseMock).toHaveBeenCalledWith('xyz', 'abc', true);
    expect(openFileMock).toHaveBeenCalledWith({
      fileName: '/cache/abc/briefcases/42.bim',
      key: '/cache/abc/briefcases/42.bim',
      readonly: true,
    });
  });

  it('卸载：conn.close() 恰一次', async () => {
    const { unmount } = renderHook(() => useBriefcaseConnection(OPTIONS));
    await flushAsync();
    unmount();
    await flushAsync();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('isClosing 重入保护：连卸两次只关一次', async () => {
    // 悬挂式 close：首次 close 由测试手动放行，观察重入方是否只会等待而不再关
    let resolveClose!: () => void;
    const pendingClose = new Promise<void>((resolve) => { resolveClose = resolve; });
    closeMock.mockImplementation(async () => {
      await pendingClose;
    });

    const { result, rerender, unmount } = renderHook<
      UseBriefcaseConnectionResult,
      UseBriefcaseConnectionOptions | null
    >(
      (o) => useBriefcaseConnection(o),
      { initialProps: OPTIONS },
    );
    await flushAsync();
    expect(result.current.connection).toBe(mockConnection);

    // 连卸两次：options→null 同一渲染周期内先触发旧 effect cleanup、再触发新 effect
    // body 的 null 分支 cleanup——第二次须被 isClosing 拦下等待而非重复 close。
    rerender(null);
    expect(closeMock).toHaveBeenCalledTimes(1);

    // 第一次 close 悬挂期间（含重入方 50ms 轮询窗口）不出现第二次 close
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(closeMock).toHaveBeenCalledTimes(1);

    resolveClose();
    await flushAsync();
    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(result.current.connection).toBeNull();

    unmount();
  });

  it('saveChanges/pushChanges/pullChanges 代理到 connection 同名方法', async () => {
    const { result } = renderHook(() => useBriefcaseConnection(OPTIONS));
    await flushAsync();

    await act(async () => { await result.current.saveChanges('my save'); });
    expect(saveChangesMock).toHaveBeenCalledWith('my save');

    await act(async () => { await result.current.pushChanges('my push'); });
    expect(pushChangesMock).toHaveBeenCalledWith('my push');

    await act(async () => { await result.current.pullChanges(); });
    expect(pullChangesMock).toHaveBeenCalled();
  });

  it('connection 未就绪时代理为 no-op（不抛）', async () => {
    const { result } = renderHook(() => useBriefcaseConnection(null));
    await act(async () => { await result.current.saveChanges('x'); });
    await act(async () => { await result.current.pushChanges('x'); });
    await act(async () => { await result.current.pullChanges(); });
    expect(saveChangesMock).not.toHaveBeenCalled();
    expect(pushChangesMock).not.toHaveBeenCalled();
    expect(pullChangesMock).not.toHaveBeenCalled();
  });

  it('downloadBriefcase 拒绝 → error 就位、connection 恒 null、isLoading 归 false', async () => {
    downloadBriefcaseMock.mockRejectedValue(new Error('Hub unavailable'));
    const { result } = renderHook(() => useBriefcaseConnection(OPTIONS));
    await flushAsync();
    expect(result.current.error?.message).toBe('Hub unavailable');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBeNull();
  });

  it('openFile 拒绝 → error 就位、connection 恒 null、isLoading 归 false', async () => {
    openFileMock.mockRejectedValue(new Error('open failed'));
    const { result } = renderHook(() => useBriefcaseConnection(OPTIONS));
    await flushAsync();
    expect(result.current.error?.message).toBe('open failed');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.connection).toBeNull();
  });
});
