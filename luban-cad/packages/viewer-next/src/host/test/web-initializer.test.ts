// web-initializer 验收（M0 移植 + M4 Task 1 引用计数 + M4 Task 2 in-flight 去重）：
//  - startViewer：socketUrl 组装/token 注入/RPC 通道面/幂等（既有口径，随文件迁入 host/test/）；
//  - acquireViewer/releaseViewer：模块级引用计数——1→0 才 shutdown、空计数安全 no-op、
//    acquire 失败回滚计数（M3 终审 T3-③「卸载无条件 stopViewer」收口）；
//  - in-flight promise 去重（M4 Task 2，控制器裁定）：并发 acquire 共享同一 startup
//    promise（恰一次）；release 归零 shutdown 在途时新 acquire 等它落定再重新
//    startup（不落 shutdown 窗口拿假就绪）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factory 会被提升到文件顶部，先于 const 初始化执行（TDZ）——
// 被工厂引用的 mock 须用 vi.hoisted 一并提升（vitest 官方推荐写法）。
const { startupMock, initializeClientMock, shutdownMock } = vi.hoisted(() => ({
  startupMock: vi.fn().mockResolvedValue(undefined),
  initializeClientMock: vi.fn(),
  shutdownMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { initialized: false, shutdown: shutdownMock, accuSnap: { enableSnap: vi.fn(), enableLocate: vi.fn() } },
  IpcApp: { isValid: false },
  LocalhostIpcApp: { startup: startupMock, buildUrlForSocket: (u: URL) => u },
  // M6-a T5：SketchAccuSnap 的基类桩（class extends 在模块加载期求值——
  // 缺桩则 web-initializer 的静态 import 链 TypeError）。
  AccuSnap: class {},
}));
vi.mock('@itwin/core-common', () => ({
  BentleyCloudRpcManager: { initializeClient: initializeClientMock },
  IModelReadRpcInterface: class {},
  IModelTileRpcInterface: class {},
}));
vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: class {},
  LubanFeatureRpcInterface: class {},
}));
vi.mock('@itwin/editor-frontend', () => ({ EditTools: { initialize: vi.fn() } }));
vi.mock('@itwin/imodels-access-frontend', () => ({ FrontendIModelsAccess: class { constructor(public c: unknown) {} } }));
vi.mock('@itwin/imodels-client-management', () => ({ IModelsClient: class { constructor(public o: unknown) {} } }));

import { acquireViewer, releaseViewer, startViewer } from '../web-initializer.js';
import type { NotificationManager } from '@itwin/core-frontend';

const VIEWER_OPTIONS = { backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' };

describe('startViewer（移植自 WebInitializer）', () => {
  beforeEach(async () => {
    startupMock.mockClear();
    initializeClientMock.mockClear();
    shutdownMock.mockClear();
    const core = await import('@itwin/core-frontend');
    (core.IpcApp as unknown as { isValid: boolean }).isValid = false;
    (core.IModelApp as unknown as { initialized: boolean }).initialized = false;
  });

  it('组装 socketUrl 并注入 token', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400', accessToken: 'jwt-x' });
    expect(startupMock).toHaveBeenCalledTimes(1);
    const arg = startupMock.mock.calls[0][0];
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('localhost:5401');
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('token=jwt-x');
    expect(arg.iModelApp.publicPath).toBe('/');
    expect(arg.iModelApp.authorizationClient).toBeDefined();
  });

  it('rpcInterfaces 含 4 通道（OpenCloud/Feature/Read/Tile）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.rpcInterfaces).toHaveLength(4);
  });

  it('M6-a T5：accuSnap 注入 SketchAccuSnap 实例（九模式捕捉子类，startup 官方注入点）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.accuSnap).toBeDefined();
    expect(typeof arg.iModelApp.accuSnap.getActiveSnapModes).toBe('function');
  });

  it('notifications 选项透传 IModelApp.startup（review-8 I-2 呈现桥的官方注入点）', async () => {
    const manager = { outputMessage: vi.fn() } as unknown as NotificationManager;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400', notifications: manager });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.notifications).toBe(manager);
  });

  it('notifications 缺省 → 不注入（core 缺省 NotificationManager 兜底，行为同旧哑通道）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.notifications).toBeUndefined();
  });

  it('幂等：二次调用不再 startup 但仍重配 RPC', async () => {
    const { IpcApp } = await import('@itwin/core-frontend');
    (IpcApp as unknown as { isValid: boolean }).isValid = true;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(startupMock).toHaveBeenCalledTimes(0);
    expect(initializeClientMock).toHaveBeenCalledTimes(1);
  });
});

describe('acquireViewer/releaseViewer（引用计数，M4 Task 1）', () => {
  beforeEach(async () => {
    startupMock.mockClear();
    initializeClientMock.mockClear();
    shutdownMock.mockClear();
    const core = await import('@itwin/core-frontend');
    (core.IpcApp as unknown as { isValid: boolean }).isValid = false;
    // shutdown 只在 IModelApp.initialized 时走 IModelApp.shutdown——置真以观察回收调用
    (core.IModelApp as unknown as { initialized: boolean }).initialized = true;
  });

  it('acquire×2 → release×1：不 shutdown；release 再×1：shutdown', async () => {
    await acquireViewer(VIEWER_OPTIONS);
    await acquireViewer(VIEWER_OPTIONS);
    await releaseViewer();
    expect(shutdownMock).not.toHaveBeenCalled();
    await releaseViewer();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it('计数归零后才 shutdown；空计数 release 是安全 no-op', async () => {
    await acquireViewer(VIEWER_OPTIONS);
    await releaseViewer();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    await releaseViewer();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it('acquire 失败回滚计数（失败方不持有 host）', async () => {
    startupMock.mockRejectedValueOnce(new Error('ipc unreachable'));
    await expect(acquireViewer(VIEWER_OPTIONS)).rejects.toThrow('ipc unreachable');
    await releaseViewer();
    expect(shutdownMock).not.toHaveBeenCalled();
  });

  it('并发 acquire×2 → startup 恰一次（in-flight promise 去重），两个持有者各释放一次才 shutdown', async () => {
    // startup 悬挂——两个 acquire 在首个 startup 完成前同时进入
    let releaseStartup!: () => void;
    startupMock.mockImplementationOnce(
      async () => new Promise<void>((resolve) => {
        releaseStartup = resolve;
      }),
    );
    const first = acquireViewer(VIEWER_OPTIONS);
    const second = acquireViewer(VIEWER_OPTIONS);
    await Promise.resolve();
    expect(startupMock).toHaveBeenCalledTimes(1);
    releaseStartup();
    await Promise.all([first, second]);
    expect(startupMock).toHaveBeenCalledTimes(1);
    await releaseViewer();
    expect(shutdownMock).not.toHaveBeenCalled();
    await releaseViewer();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it('release 归零 shutdown 在途 → 立即再 acquire 等 shutdown 落定后重新 startup（不落 shutdown 窗口拿假就绪）', async () => {
    await acquireViewer(VIEWER_OPTIONS);
    // shutdown 悬挂——模拟 IModelApp.shutdown 进行中
    let releaseShutdown!: () => void;
    shutdownMock.mockImplementationOnce(
      async () => new Promise<void>((resolve) => {
        releaseShutdown = resolve;
      }),
    );
    const released = releaseViewer();
    const reacquired = acquireViewer(VIEWER_OPTIONS);
    // shutdown 悬挂期间：新 acquire 的 startup 不得抢先执行（等在途 shutdown 落定）
    await Promise.resolve();
    await Promise.resolve();
    expect(startupMock).toHaveBeenCalledTimes(1); // 只有首个 acquire 那次
    releaseShutdown();
    await released;
    await reacquired;
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    // shutdown 落定后重新 startup——host 真就绪（IpcApp.isValid 翻转由本次 startup 完成）
    expect(startupMock).toHaveBeenCalledTimes(2);
  });
});
