// web-initializer 验收（M0 移植 + M4 Task 1 引用计数）：
//  - startViewer：socketUrl 组装/token 注入/RPC 通道面/幂等（既有口径，随文件迁入 host/test/）；
//  - acquireViewer/releaseViewer：模块级引用计数——1→0 才 shutdown、空计数安全 no-op、
//    acquire 失败回滚计数（M3 终审 T3-③「卸载无条件 stopViewer」收口）。

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
});
